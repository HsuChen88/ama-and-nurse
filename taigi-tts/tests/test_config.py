from __future__ import annotations

import pytest

from taigi_tts.config import Settings


def test_settings_accept_int8(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLAMA_DTYPE", "int8")
    assert Settings.from_env().llama_dtype == "int8"


def test_settings_reject_invalid_dtype(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLAMA_DTYPE", "int4")
    with pytest.raises(RuntimeError, match="LLAMA_DTYPE"):
        Settings.from_env()
