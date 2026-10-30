from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import make_wav


def post_asr(
    client: TestClient,
    headers: dict[str, str],
    *,
    audio: bytes | None = None,
    language: str = "nan-TW",
):
    files = {"audio": ("speech.wav", audio or make_wav(), "audio/wav")}
    return client.post(
        "/v1/asr", files=files, data={"language": language}, headers=headers
    )


def test_health_is_public_and_reports_lazy_models(client: TestClient):
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "device": "cpu",
        "models": {"nan-TW": "fake/breeze", "id": "fake/whisper"},
        "loaded": [],
    }


def test_asr_requires_bearer_token(client: TestClient):
    response = post_asr(client, {})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_authentication_precedes_multipart_validation(client: TestClient):
    response = client.post("/v1/asr")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_asr_transcribes_valid_wav(
    client: TestClient, auth_headers: dict[str, str]
):
    response = post_asr(client, auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "測試結果"
    assert body["language"] == "nan-TW"
    assert body["model"] == "fake/breeze"
    assert body["duration_ms"] == 100
    assert isinstance(body["inference_ms"], int)


def test_asr_rejects_invalid_language(
    client: TestClient, auth_headers: dict[str, str]
):
    response = post_asr(client, auth_headers, language="zh-TW")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_LANGUAGE"


def test_asr_rejects_unreadable_audio(
    client: TestClient, auth_headers: dict[str, str]
):
    for audio in (b"not a wav", make_wav()[:-10]):
        response = post_asr(client, auth_headers, audio=audio)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_AUDIO"


def test_asr_rejects_non_16khz_or_stereo(
    client: TestClient, auth_headers: dict[str, str]
):
    for wav in (make_wav(sample_rate=8_000), make_wav(channels=2)):
        response = post_asr(client, auth_headers, audio=wav)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_AUDIO"


def test_tts_requires_auth_then_returns_not_implemented(
    client: TestClient, auth_headers: dict[str, str]
):
    unauthorized = client.post("/v1/tts", json={"text": "x", "language": "nan-TW"})
    response = client.post(
        "/v1/tts",
        json={"text": "x", "language": "nan-TW"},
        headers=auth_headers,
    )

    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"
