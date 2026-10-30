from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class AsrEngine(Protocol):
    def transcribe(self, audio_path: Path, language: str) -> str: ...


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

    def transcribe(self, audio_path: Path, language: str) -> str:
        whisper_language = "zh" if language == "nan-TW" else "id"
        segments, _ = self._model.transcribe(
            str(audio_path),
            language=whisper_language,
            task="transcribe",
            vad_filter=True,
        )
        return "".join(segment.text for segment in segments).strip()
