from __future__ import annotations

import os
from dataclasses import dataclass

SUPPORTED_LANGUAGES = ("nan-TW", "id")


@dataclass(frozen=True)
class Settings:
    api_token: str
    device: str
    compute_type: str
    nan_model: str
    id_model: str
    preload: tuple[str, ...]
    max_queue: int
    tts_url: str = "http://taigi-tts:8002"
    tts_timeout_seconds: float = 30.0

    @classmethod
    def from_env(cls) -> "Settings":
        api_token = os.getenv("INFERENCE_API_TOKEN", "").strip()
        if not api_token:
            raise RuntimeError("INFERENCE_API_TOKEN must be set")

        configured_device = os.getenv("INFERENCE_DEVICE", "auto").strip().lower()
        if configured_device not in {"auto", "cpu", "cuda"}:
            raise RuntimeError("INFERENCE_DEVICE must be auto, cpu, or cuda")
        device = _resolve_device(configured_device)

        compute_type = os.getenv("INFERENCE_COMPUTE_TYPE", "").strip()
        if not compute_type:
            compute_type = "float16" if device == "cuda" else "int8"

        preload = tuple(
            part.strip()
            for part in os.getenv("INFERENCE_PRELOAD", "").split(",")
            if part.strip()
        )
        invalid_preload = set(preload) - set(SUPPORTED_LANGUAGES)
        if invalid_preload:
            invalid = ", ".join(sorted(invalid_preload))
            raise RuntimeError(f"INFERENCE_PRELOAD contains invalid languages: {invalid}")

        try:
            max_queue = int(os.getenv("INFERENCE_MAX_QUEUE", "4"))
        except ValueError as exc:
            raise RuntimeError("INFERENCE_MAX_QUEUE must be an integer") from exc
        if max_queue < 0:
            raise RuntimeError("INFERENCE_MAX_QUEUE must be non-negative")

        try:
            tts_timeout_seconds = float(
                os.getenv("TAIGI_TTS_TIMEOUT_SECONDS", "30")
            )
        except ValueError as exc:
            raise RuntimeError(
                "TAIGI_TTS_TIMEOUT_SECONDS must be a number"
            ) from exc
        if tts_timeout_seconds <= 0:
            raise RuntimeError(
                "TAIGI_TTS_TIMEOUT_SECONDS must be greater than zero"
            )

        return cls(
            api_token=api_token,
            device=device,
            compute_type=compute_type,
            nan_model=os.getenv(
                "ASR_NAN_MODEL", "weemed/Breeze-ASR-26-ct2"
            ).strip(),
            id_model=os.getenv(
                "ASR_ID_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
            ).strip(),
            preload=preload,
            max_queue=max_queue,
            tts_url=os.getenv("TAIGI_TTS_URL", "http://taigi-tts:8002").strip(),
            tts_timeout_seconds=tts_timeout_seconds,
        )

    @property
    def models(self) -> dict[str, str]:
        return {"nan-TW": self.nan_model, "id": self.id_model}


def _resolve_device(configured_device: str) -> str:
    if configured_device != "auto":
        return configured_device

    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except (ImportError, RuntimeError):
        return "cpu"
