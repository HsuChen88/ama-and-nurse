from __future__ import annotations

import pytest

from inference_service.config import Settings


def test_token_is_required(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("INFERENCE_API_TOKEN", raising=False)

    with pytest.raises(RuntimeError, match="INFERENCE_API_TOKEN"):
        Settings.from_env()


def test_cpu_defaults_and_overrides(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INFERENCE_API_TOKEN", "secret")
    monkeypatch.setenv("INFERENCE_DEVICE", "cpu")
    monkeypatch.setenv("ASR_NAN_MODEL", "custom/nan")
    monkeypatch.setenv("ASR_ID_MODEL", "custom/id")
    monkeypatch.setenv("INFERENCE_PRELOAD", "nan-TW,id")
    monkeypatch.setenv("INFERENCE_MAX_QUEUE", "2")

    settings = Settings.from_env()

    assert settings.compute_type == "int8"
    assert settings.models == {"nan-TW": "custom/nan", "id": "custom/id"}
    assert settings.preload == ("nan-TW", "id")
    assert settings.max_queue == 2


def test_cuda_defaults_to_float16(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INFERENCE_API_TOKEN", "secret")
    monkeypatch.setenv("INFERENCE_DEVICE", "cuda")

    assert Settings.from_env().compute_type == "float16"


@pytest.mark.parametrize("value", ["wrong", "nan-TW,wrong"])
def test_invalid_preload_is_rejected(monkeypatch: pytest.MonkeyPatch, value: str):
    monkeypatch.setenv("INFERENCE_API_TOKEN", "secret")
    monkeypatch.setenv("INFERENCE_DEVICE", "cpu")
    monkeypatch.setenv("INFERENCE_PRELOAD", value)

    with pytest.raises(RuntimeError, match="invalid languages"):
        Settings.from_env()
