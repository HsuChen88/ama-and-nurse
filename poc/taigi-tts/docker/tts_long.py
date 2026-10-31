"""Compatibility implementation for the API expected by tw_inference.

KaedeTai main documents this module but does not publish it. This adapter uses
the fork's maintained TTS_infer_pack API and preserves tw_synth's call shape.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "GPT_SoVITS"))
sys.path.insert(0, str(ROOT))

_engine = None
_engine_key = None


def _unwrap_tw(text: str) -> str:
    value = text.strip()
    if value.startswith("{tw:") and value.endswith("}"):
        return value[4:-1]
    return value


def _get_engine(s1: Path, s2: Path):
    global _engine, _engine_key
    key = (str(s1), str(s2))
    if _engine is not None and _engine_key == key:
        return _engine
    from TTS_infer_pack.TTS import TTS, TTS_Config

    config = {
        "custom": {
            "bert_base_path": str(
                ROOT / "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large"
            ),
            "cnhuhbert_base_path": str(
                ROOT / "GPT_SoVITS/pretrained_models/chinese-hubert-base"
            ),
            "device": "cuda",
            "is_half": True,
            "t2s_weights_path": str(s1),
            "vits_weights_path": str(s2),
            "version": "v2Pro",
        }
    }
    _engine = TTS(TTS_Config(config))
    _engine_key = key
    return _engine


def synthesize(
    text,
    wav_out,
    *,
    s1,
    s2,
    ref_wav,
    ref_text,
    also_mp3=True,
    seed=42,
    **_ignored,
):
    engine = _get_engine(Path(s1), Path(s2))
    request = {
        "text": _unwrap_tw(text),
        "text_lang": "tw",
        "ref_audio_path": str(ref_wav),
        "prompt_text": _unwrap_tw(ref_text),
        "prompt_lang": "tw",
        "text_split_method": "cut5",
        "batch_size": 1,
        "split_bucket": False,
        "parallel_infer": False,
        "seed": int(seed),
        "repetition_penalty": 1.35,
    }
    try:
        sample_rate, audio = next(engine.run(request))
    except StopIteration as exc:
        raise RuntimeError("GPT-SoVITS returned no audio") from exc
    wav_path = Path(wav_out)
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(wav_path, audio, sample_rate, subtype="PCM_16")
    if also_mp3:
        mp3_path = wav_path.with_suffix(".mp3")
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "4",
                str(mp3_path),
            ],
            check=True,
        )
    return wav_path
