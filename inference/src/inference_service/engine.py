from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .audio import AudioArray


class AsrEngine(Protocol):
    def transcribe(self, audio: AudioArray, language: str) -> str: ...


@dataclass(frozen=True)
class EngineConfig:
    model_id: str
    device: str
    compute_type: str


class FasterWhisperEngine:
    def __init__(self, config: EngineConfig) -> None:
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            config.model_id,
            device=config.device,
            compute_type=config.compute_type,
        )

    def transcribe(self, audio: AudioArray, language: str) -> str:
        whisper_language = "zh" if language == "nan-TW" else "id"
        segments, _ = self._model.transcribe(
            audio,
            language=whisper_language,
            task="transcribe",
            vad_filter=True,
        )
        return "".join(segment.text for segment in segments).strip()


def validate_offline_models(model_ids: dict[str, str]) -> None:
    if os.getenv("HF_HUB_OFFLINE", "").strip().upper() not in {
        "1",
        "ON",
        "YES",
        "TRUE",
    }:
        return

    from faster_whisper.utils import download_model

    for language, model_id in model_ids.items():
        model_path = Path(model_id)
        try:
            if model_path.is_dir():
                cached_path = model_path
            else:
                cached_path = Path(download_model(model_id, local_files_only=True))
            required_files = (cached_path / "config.json", cached_path / "model.bin")
            if not all(path.is_file() for path in required_files):
                raise FileNotFoundError("required CTranslate2 files are missing")
        except Exception as exc:
            raise RuntimeError(
                f"ASR model for {language} ({model_id}) is not available in the "
                "local Hugging Face cache. Set HF_HUB_OFFLINE=0 and start the "
                "service once during an allowed network window to download it."
            ) from exc
