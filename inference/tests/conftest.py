from __future__ import annotations

import io
from fractions import Fraction

import av
import numpy as np
import pytest
from fastapi.testclient import TestClient

from inference_service.app import create_app
from inference_service.config import Settings
from inference_service.tts import TtsResult

TOKEN = "test-token"


class FakeEngine:
    def __init__(self, text: str = "測試結果") -> None:
        self.text = text
        self.calls: list[tuple[np.ndarray, str]] = []

    def transcribe(self, audio: np.ndarray, language: str) -> str:
        self.calls.append((audio, language))
        return self.text


class FakeTtsClient:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.error: Exception | None = None

    def synthesize(self, text: str) -> TtsResult:
        self.calls.append(text)
        if self.error:
            raise self.error
        return TtsResult(
            b"fake-mp3",
            "%E4%BD%A0%E5%A5%BD",
            "L%C3%AD%20h%C3%B3%2E",
        )


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
def fake_tts_client() -> FakeTtsClient:
    return FakeTtsClient()


@pytest.fixture
def client(
    settings: Settings,
    fake_engine: FakeEngine,
    fake_tts_client: FakeTtsClient,
):
    app = create_app(
        settings,
        engine_factory=lambda _: fake_engine,
        tts_client=fake_tts_client,
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def make_audio(extension: str, duration_seconds: float = 1.0) -> bytes:
    configurations = {
        "webm": ("webm", "libopus", 48_000, "fltp", np.float32, 960),
        "m4a": ("mp4", "aac", 48_000, "fltp", np.float32, 1024),
        "ogg": ("ogg", "libopus", 48_000, "fltp", np.float32, 960),
        "wav": ("wav", "pcm_s16le", 16_000, "s16", np.int16, 1600),
    }
    container_format, codec, sample_rate, sample_format, dtype, frame_size = (
        configurations[extension]
    )
    output = io.BytesIO()
    with av.open(output, mode="w", format=container_format) as container:
        stream = container.add_stream(codec, rate=sample_rate)
        stream.layout = "mono"
        total_samples = round(sample_rate * duration_seconds)
        encoded_samples = 0

        while encoded_samples < total_samples:
            sample_count = min(frame_size, total_samples - encoded_samples)
            samples = np.zeros((1, sample_count), dtype=dtype)
            frame = av.AudioFrame.from_ndarray(
                samples, format=sample_format, layout="mono"
            )
            frame.sample_rate = sample_rate
            frame.pts = encoded_samples
            frame.time_base = Fraction(1, sample_rate)
            for packet in stream.encode(frame):
                container.mux(packet)
            encoded_samples += sample_count

        for packet in stream.encode():
            container.mux(packet)

    return output.getvalue()
