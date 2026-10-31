from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from inference_service.app import create_app
from inference_service.config import Settings
from inference_service.engine import validate_offline_models


def test_offline_mode_accepts_local_ctranslate2_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    (tmp_path / "config.json").write_text("{}")
    (tmp_path / "model.bin").write_bytes(b"model")

    validate_offline_models({"nan-TW": str(tmp_path)})


def test_startup_explains_how_to_download_missing_offline_model(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    settings = Settings(
        api_token="test",
        device="cpu",
        compute_type="int8",
        nan_model="missing-test/model-nan",
        id_model="missing-test/model-id",
        preload=(),
        max_queue=4,
    )
    app = create_app(settings, engine_factory=lambda _: object())

    with pytest.raises(RuntimeError, match="HF_HUB_OFFLINE=0"):
        with TestClient(app):
            pass
