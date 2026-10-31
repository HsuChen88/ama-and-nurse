from __future__ import annotations

from pathlib import Path

from inference_service.media import audio_content_type


def test_smoke_uses_browser_audio_content_types():
    assert audio_content_type(Path("recording.webm")) == "audio/webm"
    assert audio_content_type(Path("recording.m4a")) == "audio/mp4"
    assert audio_content_type(Path("recording.mp4")) == "audio/mp4"
    assert audio_content_type(Path("recording.ogg")) == "audio/ogg"
    assert audio_content_type(Path("recording.wav")) == "audio/wav"
