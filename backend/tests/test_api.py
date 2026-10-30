import io
import wave

import pytest


@pytest.mark.parametrize(
    ("speaker", "source_lang", "target_lang", "source_text", "translated_text"),
    [
        (
            "ama",
            "nan-TW",
            "id",
            "你今天有吃藥無？",
            "Apakah hari ini sudah minum obat?",
        ),
        (
            "caregiver",
            "id",
            "nan-TW",
            "Nenek, mau makan sekarang?",
            "阿罵，欲食飯矣無？",
        ),
    ],
)
def test_translate_success(
    client,
    audio_factory,
    speaker,
    source_lang,
    target_lang,
    source_text,
    translated_text,
):
    response = client.post(
        "/api/translate",
        data={"speaker": speaker},
        files={"audio": ("recording.wav", audio_factory(), "audio/wav")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["speaker"] == speaker
    assert body["source_lang"] == source_lang
    assert body["target_lang"] == target_lang
    assert body["source_text"] == source_text
    assert body["translated_text"] == translated_text
    assert body["audio_url"] == f"/api/audio/{body['id']}"
    assert body["audio_mime"] == "audio/wav"
    assert set(body["timings_ms"]) == {"asr", "translate", "tts", "total"}
    assert all(value >= 0 for value in body["timings_ms"].values())

    audio_response = client.get(body["audio_url"])
    assert audio_response.status_code == 200
    assert audio_response.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(audio_response.content)) as generated:
        assert generated.getnchannels() == 1
        assert generated.getframerate() == 16_000


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "providers": {
            "asr_nan": "mock",
            "asr_id": "mock",
            "translate": "mock",
            "tts_id": "mock",
            "tts_nan": "mock",
        },
    }


@pytest.mark.parametrize("speaker", ["unknown", "", None])
def test_invalid_speaker(client, audio_factory, speaker):
    data = {} if speaker is None else {"speaker": speaker}
    response = client.post(
        "/api/translate",
        data=data,
        files={"audio": ("recording.wav", audio_factory(), "audio/wav")},
    )
    assert_error(response, 422, "INVALID_SPEAKER")


def test_missing_audio(client):
    response = client.post("/api/translate", data={"speaker": "ama"})
    assert_error(response, 422, "INVALID_AUDIO")


def test_invalid_audio(client):
    response = client.post(
        "/api/translate",
        data={"speaker": "ama"},
        files={"audio": ("broken.webm", b"not audio", "audio/webm")},
    )
    assert_error(response, 422, "INVALID_AUDIO")


def test_audio_too_short(client, audio_factory):
    response = post_audio(client, audio_factory(duration=0.2))
    assert_error(response, 422, "AUDIO_TOO_SHORT")


def test_audio_too_long(client, audio_factory):
    response = post_audio(client, audio_factory(duration=30.2))
    assert_error(response, 422, "AUDIO_TOO_LONG")


def test_audio_too_large(client):
    response = client.post(
        "/api/translate",
        data={"speaker": "ama"},
        files={"audio": ("large.wav", b"0" * (10 * 1024 * 1024 + 1), "audio/wav")},
    )
    assert_error(response, 422, "INVALID_AUDIO")


def test_asr_empty(client, audio_factory):
    class EmptyAsr:
        def transcribe(self, wav_bytes, lang):
            return "  "

    client.app.state.pipeline.asr_providers["nan-TW"] = EmptyAsr()
    response = post_audio(client, audio_factory())
    assert_error(response, 422, "ASR_EMPTY")


def test_upstream_error(client, audio_factory):
    class FailingTranslate:
        def translate(self, text, source, target):
            raise RuntimeError("provider unavailable")

    client.app.state.pipeline.translate_provider = FailingTranslate()
    response = post_audio(client, audio_factory())
    assert_error(response, 502, "UPSTREAM_ERROR")


def test_audio_not_found(client):
    response = client.get("/api/audio/does-not-exist")
    assert_error(response, 404, "NOT_FOUND")


@pytest.mark.parametrize(
    ("container", "codec", "content_type"),
    [("webm", "libopus", "audio/webm"), ("mp4", "aac", "audio/mp4")],
)
def test_browser_audio_formats(client, audio_factory, container, codec, content_type):
    response = client.post(
        "/api/translate",
        data={"speaker": "ama"},
        files={
            "audio": (
                f"recording.{container}",
                audio_factory(container=container, codec=codec),
                content_type,
            )
        },
    )
    assert response.status_code == 200


def post_audio(client, audio: bytes):
    return client.post(
        "/api/translate",
        data={"speaker": "ama"},
        files={"audio": ("recording.wav", audio, "audio/wav")},
    )


def assert_error(response, status_code: int, code: str):
    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert isinstance(response.json()["error"]["message"], str)
