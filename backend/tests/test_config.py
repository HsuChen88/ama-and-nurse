from backend.config import Settings


def test_cors_origins_accept_comma_separated_environment(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS", "https://first.example, https://second.example"
    )

    settings = Settings()

    assert settings.cors_origins == [
        "https://first.example",
        "https://second.example",
    ]
