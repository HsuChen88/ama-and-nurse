from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from conftest import FakeTtsClient, make_audio
from inference_service.tts import TtsBackendError, TtsBusyError


def post_asr(
    client: TestClient,
    headers: dict[str, str],
    *,
    audio: bytes | None = None,
    language: str = "nan-TW",
    filename: str = "speech.wav",
    content_type: str = "audio/wav",
):
    payload = make_audio("wav") if audio is None else audio
    files = {"audio": (filename, payload, content_type)}
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


@pytest.mark.parametrize(
    ("extension", "content_type"),
    [
        ("webm", "audio/webm"),
        ("m4a", "audio/mp4"),
        ("ogg", "audio/ogg"),
        ("wav", "audio/wav"),
    ],
)
def test_asr_decodes_browser_audio_formats(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_engine,
    extension: str,
    content_type: str,
):
    response = post_asr(
        client,
        auth_headers,
        audio=make_audio(extension),
        filename=f"speech.{extension}",
        content_type=content_type,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "測試結果"
    assert body["language"] == "nan-TW"
    assert body["model"] == "fake/breeze"
    assert body["duration_ms"] == pytest.approx(1000, abs=50)
    assert isinstance(body["inference_ms"], int)
    decoded, language = fake_engine.calls[-1]
    assert decoded.dtype.name == "float32"
    assert decoded.ndim == 1
    assert len(decoded) == pytest.approx(16_000, abs=800)
    assert language == "nan-TW"


def test_asr_rejects_invalid_language(
    client: TestClient, auth_headers: dict[str, str]
):
    response = post_asr(client, auth_headers, language="zh-TW")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_LANGUAGE"


def test_asr_rejects_unreadable_audio(
    client: TestClient, auth_headers: dict[str, str]
):
    response = post_asr(client, auth_headers, audio=b"not audio")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_AUDIO"


def test_asr_rejects_missing_audio(
    client: TestClient, auth_headers: dict[str, str]
):
    response = client.post(
        "/v1/asr", data={"language": "id"}, headers=auth_headers
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_AUDIO"


@pytest.mark.parametrize(
    ("duration", "code"),
    [(0.2, "AUDIO_TOO_SHORT"), (30.1, "AUDIO_TOO_LONG")],
)
def test_asr_rejects_out_of_range_duration(
    client: TestClient,
    auth_headers: dict[str, str],
    duration: float,
    code: str,
):
    response = post_asr(
        client, auth_headers, audio=make_audio("wav", duration_seconds=duration)
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


def test_asr_rejects_payload_over_10_mb(
    client: TestClient, auth_headers: dict[str, str]
):
    response = post_asr(client, auth_headers, audio=b"x" * (10 * 1024 * 1024 + 1))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_tts_requires_auth_then_forwards_audio_and_headers(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_tts_client: FakeTtsClient,
):
    unauthorized = client.post("/v1/tts", json={"text": "x", "language": "nan-TW"})
    response = client.post(
        "/v1/tts",
        json={"text": "  今天吃藥了嗎？  ", "language": "nan-TW"},
        headers=auth_headers,
    )

    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.status_code == 200
    assert response.content == b"fake-mp3"
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.headers["X-Taigi-Han"] == "%E4%BD%A0%E5%A5%BD"
    assert response.headers["X-Taigi-Romanization"] == "L%C3%AD%20h%C3%B3%2E"
    assert response.headers["X-Inference-Ms"].isdigit()
    assert fake_tts_client.calls == ["今天吃藥了嗎？"]


@pytest.mark.parametrize("text", ["", "   ", "字" * 201])
def test_tts_rejects_invalid_text(
    client: TestClient,
    auth_headers: dict[str, str],
    text: str,
):
    response = client.post(
        "/v1/tts",
        json={"text": text, "language": "nan-TW"},
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_TEXT"


def test_tts_rejects_invalid_or_missing_language(
    client: TestClient,
    auth_headers: dict[str, str],
):
    invalid = client.post(
        "/v1/tts",
        json={"text": "你好", "language": "id"},
        headers=auth_headers,
    )
    missing = client.post(
        "/v1/tts",
        json={"text": "你好"},
        headers=auth_headers,
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "INVALID_LANGUAGE"
    assert missing.json()["error"]["code"] == "INVALID_LANGUAGE"


def test_tts_maps_full_backend_queue_to_busy(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_tts_client: FakeTtsClient,
):
    fake_tts_client.error = TtsBusyError("full")
    response = client.post(
        "/v1/tts",
        json={"text": "你好", "language": "nan-TW"},
        headers=auth_headers,
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "BUSY"


def test_tts_maps_backend_failure_to_contract_error(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_tts_client: FakeTtsClient,
):
    fake_tts_client.error = TtsBackendError("failed")
    response = client.post(
        "/v1/tts",
        json={"text": "你好", "language": "nan-TW"},
        headers=auth_headers,
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "TTS_BACKEND_ERROR"
