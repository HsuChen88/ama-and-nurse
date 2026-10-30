from __future__ import annotations

import io
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from inference_service.app import create_app
from inference_service.config import Settings

TOKEN = "test-token"


class FakeEngine:
    def __init__(self, text: str = "測試結果") -> None:
        self.text = text
        self.calls: list[tuple[Path, str]] = []

    def transcribe(self, audio_path: Path, language: str) -> str:
        self.calls.append((audio_path, language))
        return self.text


@pytest.fixture
def settings() -> Settings:
    return Settings(
        api_token=TOKEN,
        device="cpu",
        compute_type="int8",
        nan_model="fake/breeze",
        id_model="fake/whisper",
        preload=(),
        max_queue=4,
    )


@pytest.fixture
def fake_engine() -> FakeEngine:
    return FakeEngine()


@pytest.fixture
def client(settings: Settings, fake_engine: FakeEngine):
    app = create_app(settings, engine_factory=lambda _: fake_engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def make_wav(
    sample_rate: int = 16_000,
    channels: int = 1,
    duration_seconds: float = 0.1,
) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * channels * int(sample_rate * duration_seconds))
    return output.getvalue()
