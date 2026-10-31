from __future__ import annotations

from pathlib import Path

import pytest

from taigi_tts.config import Settings
from taigi_tts.models import GeneratedAudio


class FakeSynthesizer:
    def __init__(self, output: Path) -> None:
        self.output = output
        self.loaded = False
        self.calls: list[str] = []

    def load(self) -> None:
        self.loaded = True

    def synthesize(self, text: str) -> GeneratedAudio:
        self.calls.append(text)
        self.output.write_bytes(b"fake-mp3")
        return GeneratedAudio(self.output, "你今仔日有食藥無？", "Lí ū tsia̍h io̍h--bô?")

    def gpu_memory(self) -> dict[str, int]:
        return {"allocated_bytes": 123, "reserved_bytes": 456}


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    reference = tmp_path / "ref.wav"
    reference.write_bytes(b"fake-reference")
    return Settings(
        llama_model=tmp_path / "llama",
        llama_dtype="fp16",
        cache_dir=tmp_path / "cache",
        cache_max_items=2,
        max_queue=0,
        ref_audio=reference,
        ref_text="{tw:reference}",
        model_version="test-model-v1",
        s2_training=tmp_path / "s2.pth",
        s2_config=tmp_path / "s2.json",
    )
