#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from taigi_poc.pipeline import (
    clean_llama_output,
    copy_audio,
    llama_prompt,
    read_json,
    read_sentences,
    release_cuda,
    render_index,
    timed,
    translate_opus_text,
    write_json,
    write_results_csv,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = Path(os.environ.get("TAIGI_POC_OUT", "/out"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the offline Taiwanese TTS batch PoC")
    parser.add_argument(
        "--phase",
        choices=("all", "translate", "synthesize", "report"),
        default="all",
    )
    parser.add_argument("--sentences", type=Path, default=ROOT / "sentences.csv")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def run_opus(results, model_path: Path) -> None:
    from transformers import MarianMTModel, MarianTokenizer

    print(f"[opus] loading {model_path} on CPU", flush=True)
    tokenizer = MarianTokenizer.from_pretrained(
        model_path,
        local_files_only=True,
        # This model's tokenizer_config uses the pre-4.50 list shape.
        extra_special_tokens={},
    )
    model = MarianMTModel.from_pretrained(model_path, local_files_only=True).eval()

    def translate_batch(texts: list[str]) -> list[str]:
        encoded = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
        generated = model.generate(**encoded, do_sample=False, num_beams=1)
        return tokenizer.batch_decode(generated, skip_special_tokens=True)

    for index, row in enumerate(results, 1):
        if row.opus_tailo:
            print(f"[opus] {index:02d}/{len(results)} cached", flush=True)
            continue
        row.opus_tailo, elapsed = timed(
            lambda row=row: translate_opus_text(row.zh_tw, translate_batch)
        )
        row.opus_translate_s = f"{elapsed:.3f}"
        print(f"[opus] {index:02d}/{len(results)} {elapsed:.3f}s", flush=True)
    release_cuda(model, tokenizer)


def run_llama(results, model_path: Path, checkpoint_path: Path) -> None:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not torch.cuda.is_available():
        raise RuntimeError("Taigi-Llama requires CUDA; run this phase on titan")
    print(f"[llama] loading {model_path} in fp16", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        local_files_only=True,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    ).to("cuda:0").eval()

    def generate(source: str, target: str) -> str:
        prompt = llama_prompt(source, target)
        encoded = tokenizer(prompt, return_tensors="pt", add_special_tokens=True)
        input_ids = encoded.input_ids.to("cuda:0")
        attention_mask = encoded.attention_mask.to("cuda:0")
        with torch.inference_mode():
            output = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                do_sample=False,
                num_beams=1,
                repetition_penalty=1.1,
                max_new_tokens=256,
                pad_token_id=tokenizer.eos_token_id,
            )
        decoded = tokenizer.decode(output[0, input_ids.shape[1] :], skip_special_tokens=True)
        return clean_llama_output(decoded)

    for index, row in enumerate(results, 1):
        if row.llama_poj and row.llama_han:
            print(f"[llama] {index:02d}/{len(results)} cached", flush=True)
            continue
        started = time.perf_counter()
        row.llama_poj = generate(row.zh_tw, "POJ")
        row.llama_han = generate(row.zh_tw, "HAN")
        elapsed = time.perf_counter() - started
        row.llama_translate_s = f"{elapsed:.3f}"
        write_json(results, checkpoint_path)
        print(f"[llama] {index:02d}/{len(results)} {elapsed:.3f}s", flush=True)
    model.to("cpu")
    release_cuda(model, tokenizer)
    print("[llama] released GPU memory before GPT-SoVITS load", flush=True)


def run_tts(results, out_dir: Path, checkpoint_path: Path) -> None:
    from tw_inference import tw_synth

    audio_dir = out_dir / "audio"
    for index, row in enumerate(results, 1):
        for provider, text in (("opus", row.opus_tailo), ("llama", row.llama_poj)):
            target = audio_dir / f"{row.id}_{provider}.mp3"
            if getattr(row, f"{provider}_audio") and target.exists():
                continue
            try:
                source, elapsed = timed(
                    lambda text=text: str(
                        tw_synth.synthesize(
                            text,
                            ref=None,
                            seed=42,
                            apply_sandhi=True,
                            verbose=False,
                        )
                    )
                )
                copy_audio(Path(source), target)
                setattr(row, f"{provider}_tts_s", f"{elapsed:.3f}")
                setattr(row, f"{provider}_audio", f"audio/{target.name}")
            except Exception as exc:  # preserve all other rows for listening
                message = f"{type(exc).__name__}: {exc}"
                setattr(row, f"{provider}_error", message)
                print(f"[tts] {row.id}_{provider} FAILED: {message}", file=sys.stderr)
        write_json(results, checkpoint_path)
        print(f"[tts] {index:02d}/{len(results)}", flush=True)


def main() -> int:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    state_path = args.out / "translations.json"
    if args.phase in {"all", "translate"}:
        expected = read_sentences(args.sentences)
        results = read_json(state_path) if state_path.exists() else expected
        expected_identity = [(row.id, row.category, row.zh_tw) for row in expected]
        actual_identity = [(row.id, row.category, row.zh_tw) for row in results]
        if actual_identity != expected_identity:
            raise ValueError(
                f"{state_path} does not match {args.sentences}; move it aside and retry"
            )
        run_opus(results, Path("/models/opus-mt-zh-nan"))
        write_json(results, state_path)
        run_llama(results, Path("/models/taigi-llama-2-7b"), state_path)
        write_json(results, state_path)
    else:
        if not state_path.exists():
            raise FileNotFoundError(
                f"{state_path} is missing; run --phase translate before {args.phase}"
            )
        results = read_json(state_path)
    if args.phase in {"all", "synthesize"}:
        run_tts(results, args.out, state_path)
        write_json(results, state_path)
    if args.phase in {"all", "synthesize", "report"}:
        write_results_csv(results, args.out / "results.csv")
        render_index(results, args.out / "index.html")
        print(f"[done] open {args.out / 'index.html'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
