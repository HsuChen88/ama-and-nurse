from __future__ import annotations

import os
from pathlib import Path

import pytest

from inference_service.audio import decode_and_validate
from inference_service.engine import EngineConfig, FasterWhisperEngine


@pytest.mark.model
def test_real_model_transcribes_audio():
    audio_path = os.getenv("MODEL_SMOKE_AUDIO") or os.getenv("MODEL_SMOKE_WAV")
    if not audio_path:
        pytest.skip("set MODEL_SMOKE_AUDIO to a supported audio file")

    engine = FasterWhisperEngine(
        EngineConfig(
            model_id=os.getenv("MODEL_SMOKE_REPO", "large-v3-turbo"),
            device=os.getenv("INFERENCE_DEVICE", "cpu"),
            compute_type=os.getenv("INFERENCE_COMPUTE_TYPE", "int8"),
        )
    )
    decoded = decode_and_validate(Path(audio_path).read_bytes())
    result = engine.transcribe(
        decoded.samples, os.getenv("MODEL_SMOKE_LANGUAGE", "id")
    )

    assert isinstance(result, str)
    assert result
