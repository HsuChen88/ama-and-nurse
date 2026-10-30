from __future__ import annotations

import threading
from pathlib import Path

from inference_service.config import Settings
from inference_service.manager import AsrManager


class BlockingEngine:
    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()

    def transcribe(self, _: Path, __: str) -> str:
        self.entered.set()
        self.release.wait(timeout=5)
        return "done"


def test_queue_rejects_above_configured_limit():
    settings = Settings("t", "cpu", "int8", "nan", "id", (), 1)
    engine = BlockingEngine()
    slot = AsrManager(settings, lambda _: engine).slot("nan-TW")
    audio = Path("unused.wav")

    assert slot.reserve()
    worker = threading.Thread(
        target=slot.transcribe_reserved, args=(audio, "nan-TW"), daemon=True
    )
    worker.start()
    assert engine.entered.wait(timeout=2)

    assert slot.reserve()
    assert not slot.reserve()

    engine.release.set()
    worker.join(timeout=2)
    # Release the queued reservation without needing a second worker.
    slot.transcribe_reserved(audio, "nan-TW")
