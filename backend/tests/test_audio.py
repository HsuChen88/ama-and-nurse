import io
import wave

import pytest

from backend.audio import AudioPreprocessor


@pytest.mark.parametrize(
    ("container", "codec"),
    [("webm", "libopus"), ("mp4", "aac")],
)
def test_preprocessor_normalizes_browser_formats(audio_factory, container, codec):
    result = AudioPreprocessor().prepare(
        audio_factory(duration=1.0, container=container, codec=codec)
    )

    assert result.duration_seconds == pytest.approx(1.0, abs=0.05)
    with wave.open(io.BytesIO(result.wav_bytes)) as normalized:
        assert normalized.getnchannels() == 1
        assert normalized.getframerate() == 16_000
        assert normalized.getsampwidth() == 2
