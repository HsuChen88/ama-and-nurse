from __future__ import annotations

import importlib.util
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings


@dataclass(frozen=True)
class GeneratedAudio:
    audio_path: Path
    han: str
    romanization: str


class ModelStack:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.tokenizer: Any = None
        self.llama: Any = None
        self.tts: Any = None
        self.loaded = False

    def load(self) -> None:
        if self.loaded:
            return
        if not self.settings.llama_model.is_dir():
            raise FileNotFoundError(
                f"Taigi-Llama model not found: {self.settings.llama_model}"
            )
        if not self.settings.ref_audio.is_file():
            raise FileNotFoundError(
                f"Taiwanese TTS reference audio not found: {self.settings.ref_audio}"
            )
        os.chdir("/opt/GPT-SoVITS")
        os.environ["TW_TTS_REF"] = str(self.settings.ref_audio)
        if self.settings.ref_text:
            os.environ["TW_TTS_REF_TEXT"] = self.settings.ref_text

        from taigi_poc.s2_convert import ensure_inference_s2

        converted = ensure_inference_s2(
            self.settings.s2_training,
            self.settings.cache_dir / "models/s2_r4_e15_infer.pth",
            self.settings.s2_config,
        )
        os.environ["TW_TTS_S2"] = str(converted)
        self._load_llama()

        from tw_inference import tw_synth

        tw_synth.S2 = converted
        self.tts = tw_synth
        print("[startup] warming GPT-SoVITS model stack", flush=True)
        self.tts.synthesize(
            "Lí hó.",
            ref=self.settings.ref_audio,
            seed=42,
            apply_sandhi=True,
            verbose=False,
        )
        self.loaded = True
        self._log_gpu_memory("all models loaded")

    def synthesize(self, text: str) -> GeneratedAudio:
        if not self.loaded:
            raise RuntimeError("model stack is not loaded")
        started = time.perf_counter()
        poj = self._generate(text, "POJ")
        han = self._generate(text, "HAN")
        audio = self.tts.synthesize(
            poj,
            ref=self.settings.ref_audio,
            seed=42,
            apply_sandhi=True,
            verbose=False,
        )
        print(
            f"[synthesize] completed elapsed_s={time.perf_counter() - started:.3f}",
            flush=True,
        )
        return GeneratedAudio(Path(audio), han, poj)

    def gpu_memory(self) -> dict[str, int | None]:
        try:
            import torch

            if not torch.cuda.is_available():
                return {"allocated_bytes": None, "reserved_bytes": None}
            return {
                "allocated_bytes": int(torch.cuda.memory_allocated()),
                "reserved_bytes": int(torch.cuda.memory_reserved()),
            }
        except ImportError:
            return {"allocated_bytes": None, "reserved_bytes": None}

    def _load_llama(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if not torch.cuda.is_available():
            raise RuntimeError("Taigi TTS requires a CUDA GPU")
        print(
            f"[startup] loading Taigi-Llama dtype={self.settings.llama_dtype}",
            flush=True,
        )
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.settings.llama_model,
            local_files_only=True,
        )
        common = {
            "pretrained_model_name_or_path": self.settings.llama_model,
            "local_files_only": True,
            "low_cpu_mem_usage": True,
        }
        if self.settings.llama_dtype == "int8":
            if importlib.util.find_spec("bitsandbytes") is None:
                raise RuntimeError(
                    "LLAMA_DTYPE=int8 requires bitsandbytes, but it is not installed; "
                    "rebuild the PoC base image during an allowed network window"
                )
            from transformers import BitsAndBytesConfig

            common["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
            common["device_map"] = {"": 0}
            self.llama = AutoModelForCausalLM.from_pretrained(**common).eval()
        else:
            common["torch_dtype"] = torch.float16
            self.llama = (
                AutoModelForCausalLM.from_pretrained(**common).to("cuda:0").eval()
            )
        self._log_gpu_memory("Taigi-Llama loaded")

    def _generate(self, source: str, target: str) -> str:
        import torch

        prompt = f"[TRANS]\n{source}\n[/TRANS]\n[{target}]\n"
        encoded = self.tokenizer(
            prompt,
            return_tensors="pt",
            add_special_tokens=True,
        )
        input_ids = encoded.input_ids.to("cuda:0")
        attention_mask = encoded.attention_mask.to("cuda:0")
        with torch.inference_mode():
            output = self.llama.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                do_sample=False,
                num_beams=1,
                repetition_penalty=1.1,
                max_new_tokens=256,
                pad_token_id=self.tokenizer.eos_token_id,
            )
        decoded = self.tokenizer.decode(
            output[0, input_ids.shape[1] :],
            skip_special_tokens=True,
        )
        return decoded.split("[/", maxsplit=1)[0].strip()

    def _log_gpu_memory(self, label: str) -> None:
        memory = self.gpu_memory()
        print(
            f"[gpu] {label}: allocated={memory['allocated_bytes']} "
            f"reserved={memory['reserved_bytes']}",
            flush=True,
        )
