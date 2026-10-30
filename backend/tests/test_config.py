from pathlib import Path

from backend.config import Settings


def test_google_timeout_defaults_to_15_seconds():
    assert Settings().google_timeout_seconds == 15


def test_provider_warmup_defaults_to_enabled_and_parses_false(monkeypatch):
    assert Settings().provider_warmup is True

    monkeypatch.setenv("PROVIDER_WARMUP", "false")
    assert Settings().provider_warmup is False


def test_default_translation_glossary_exists():
    assert Path(Settings().translation_glossary).is_file()


def test_cors_origins_accept_comma_separated_environment(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS", "https://first.example, https://second.example"
    )

    settings = Settings()

    assert settings.cors_origins == [
        "https://first.example",
        "https://second.example",
    ]
