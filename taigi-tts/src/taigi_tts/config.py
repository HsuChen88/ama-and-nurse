from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    llama_model: Path
    llama_dtype: str
    cache_dir: Path
    cache_max_items: int
    max_queue: int
    ref_audio: Path
    ref_text: str | None
    model_version: str
    s2_training: Path
    s2_config: Path

    @classmethod
    def from_env(cls) -> "Settings":
        dtype = os.getenv("LLAMA_DTYPE", "fp16").strip().lower()
        if dtype not in {"fp16", "int8"}:
            raise RuntimeError("LLAMA_DTYPE must be fp16 or int8")
        return cls(
            llama_model=Path(
                os.getenv("TAIGI_LLAMA_MODEL", "/models/taigi-llama-2-7b")
            ),
            llama_dtype=dtype,
            cache_dir=Path(os.getenv("TAIGI_TTS_CACHE_DIR", "/cache")),
            cache_max_items=_nonnegative_int("TAIGI_TTS_CACHE_MAX_ITEMS", 128),
            max_queue=_nonnegative_int("TAIGI_TTS_MAX_QUEUE", 2),
            ref_audio=Path(
                os.getenv(
                    "TW_TTS_REF",
                    "/opt/GPT-SoVITS/tw_samples/ref_001.wav",
                )
            ),
            ref_text=os.getenv("TW_TTS_REF_TEXT") or None,
            model_version=os.getenv(
                "TAIGI_TTS_MODEL_VERSION",
                "taigi-llama-2-7b+gpt-sovits-tw-r4-e15-v2protw",
            ),
            s2_training=Path(
                os.getenv(
                    "TW_TTS_S2_TRAINING",
                    "/opt/GPT-SoVITS/models/s2_r4_e15.pth",
                )
            ),
            s2_config=Path(
                os.getenv(
                    "TW_TTS_S2_CONFIG",
                    "/opt/GPT-SoVITS/configs/s2_tai_v2pro_ft.json",
                )
            ),
        )


def _nonnegative_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value < 0:
        raise RuntimeError(f"{name} must be non-negative")
    return value
