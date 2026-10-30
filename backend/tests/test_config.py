from backend.config import Settings


def test_google_timeout_defaults_to_15_seconds():
    assert Settings().google_timeout_seconds == 15


def test_cors_origins_accept_comma_separated_environment(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS", "https://first.example, https://second.example"
    )

    settings = Settings()

    assert settings.cors_origins == [
        "https://first.example",
        "https://second.example",
    ]
