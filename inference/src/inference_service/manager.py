from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .engine import AsrEngine, EngineConfig, FasterWhisperEngine

EngineFactory = Callable[[EngineConfig], AsrEngine]


@dataclass(frozen=True)
class Transcription:
    text: str
    inference_ms: int


class ModelSlot:
    def __init__(
        self,
        config: EngineConfig,
        engine_factory: EngineFactory,
        max_queue: int,
    ) -> None:
        self.config = config
        self._engine_factory = engine_factory
        self._max_in_flight = 1 + max_queue
        self._in_flight = 0
        self._state_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._engine: AsrEngine | None = None

    @property
    def loaded(self) -> bool:
        with self._state_lock:
            return self._engine is not None

    def reserve(self) -> bool:
        with self._state_lock:
            if self._in_flight >= self._max_in_flight:
                return False
            self._in_flight += 1
            return True

    def transcribe_reserved(self, audio_path: Path, language: str) -> Transcription:
        try:
            with self._inference_lock:
                started = time.perf_counter()
                engine = self._ensure_loaded()
                text = engine.transcribe(audio_path, language)
                elapsed_ms = round((time.perf_counter() - started) * 1000)
                return Transcription(text=text, inference_ms=elapsed_ms)
        finally:
            with self._state_lock:
                self._in_flight -= 1

    def preload(self) -> None:
        with self._inference_lock:
            self._ensure_loaded()

    def _ensure_loaded(self) -> AsrEngine:
        if self._engine is None:
            engine = self._engine_factory(self.config)
            with self._state_lock:
                self._engine = engine
        return self._engine


class AsrManager:
    def __init__(
        self,
        settings: Settings,
        engine_factory: EngineFactory = FasterWhisperEngine,
    ) -> None:
        self._slots = {
            language: ModelSlot(
                EngineConfig(model_id, settings.device, settings.compute_type),
                engine_factory,
                settings.max_queue,
            )
            for language, model_id in settings.models.items()
        }

    def slot(self, language: str) -> ModelSlot:
        return self._slots[language]

    def loaded_languages(self) -> list[str]:
        return [language for language, slot in self._slots.items() if slot.loaded]
