import logging

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app
from backend.providers import ProviderBundle


@pytest.mark.parametrize(("enabled", "expected_calls"), [(True, 1), (False, 0)])
def test_lifespan_respects_provider_warmup_setting(
    monkeypatch, enabled, expected_calls
):
    calls = []

    def record_warmup(self):
        calls.append(self)

    monkeypatch.setattr(ProviderBundle, "warm_up", record_warmup)

    with TestClient(create_app(Settings(provider_warmup=enabled))) as client:
        assert client.get("/api/health").status_code == 200

    assert len(calls) == expected_calls


def test_warmup_failure_logs_warning_and_continues(caplog):
    calls = []

    class FailingWarmup:
        def warm_up(self):
            calls.append("translate")
            raise RuntimeError("unavailable")

    class SuccessfulWarmup:
        def warm_up(self):
            calls.append("tts_id")

    bundle = ProviderBundle(
        asr={},
        translate=FailingWarmup(),
        tts={"id": SuccessfulWarmup()},
    )

    with caplog.at_level(logging.WARNING):
        bundle.warm_up()

    assert calls == ["translate", "tts_id"]
    assert "Provider warm-up failed provider=translate error=RuntimeError" in caplog.text


def test_mock_providers_do_not_have_warmup_calls(caplog):
    app = create_app(Settings(provider_warmup=True))

    with caplog.at_level(logging.INFO), TestClient(app):
        pass

    assert "Provider warm-up" not in caplog.text
