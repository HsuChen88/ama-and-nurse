from types import SimpleNamespace

import pytest
from google.api_core.exceptions import DeadlineExceeded, InvalidArgument, ServiceUnavailable
from google.cloud import texttospeech

from backend.config import Settings
from backend.errors import ProviderError
from backend.providers import (
    GoogleTranslateProvider,
    GoogleTtsProvider,
    build_providers,
)


class FakeTranslateClient:
    def __init__(self):
        self.request = None

    def translate_text(self, *, request, timeout):
        self.request = request
        self.timeout = timeout
        return SimpleNamespace(
            translations=[SimpleNamespace(translated_text="Sudah minum &amp; makan")]
        )


@pytest.mark.parametrize(
    ("text", "source", "target"),
    [
        ("你今天有吃藥無？", "zh-TW", "id"),
        ("Nenek sudah makan?", "id", "zh-TW"),
    ],
)
def test_google_translate_builds_v3_global_plain_text_request(
    text, source, target
):
    client = FakeTranslateClient()
    provider = GoogleTranslateProvider(client, "translation-project")

    result = provider.translate(text, source, target)

    assert result == "Sudah minum & makan"
    assert client.timeout == 15
    assert client.request == {
        "parent": "projects/translation-project/locations/global",
        "contents": [text],
        "source_language_code": source,
        "target_language_code": target,
        "mime_type": "text/html",
    }


class FakeTtsClient:
    def __init__(self, reject_rate: bool = False):
        self.reject_rate = reject_rate
        self.calls = []

    def synthesize_speech(self, *, input, voice, audio_config, timeout):
        self.calls.append((input, voice, audio_config, timeout))
        if self.reject_rate and len(self.calls) == 1:
            raise InvalidArgument("speaking rate is unsupported")
        return SimpleNamespace(audio_content=b"mp3-audio")


def test_google_tts_builds_indonesian_chirp_mp3_request():
    client = FakeTtsClient()
    provider = GoogleTtsProvider(
        client, "id-ID-Chirp3-HD-Pulcherrima", speaking_rate=0.9
    )

    audio, mime = provider.synthesize("Sudah minum obat?", "id")

    synthesis_input, voice, audio_config, timeout = client.calls[0]
    assert synthesis_input.text == "Sudah minum obat?"
    assert voice.language_code == "id-ID"
    assert voice.name == "id-ID-Chirp3-HD-Pulcherrima"
    assert audio_config.audio_encoding == texttospeech.AudioEncoding.MP3
    assert audio_config.speaking_rate == pytest.approx(0.9)
    assert timeout == 15
    assert audio == b"mp3-audio"
    assert mime == "audio/mpeg"


def test_google_tts_retries_without_rate_when_voice_rejects_it():
    client = FakeTtsClient(reject_rate=True)
    provider = GoogleTtsProvider(
        client, "id-ID-Chirp3-HD-Pulcherrima", speaking_rate=0.9
    )

    assert provider.synthesize("Sudah minum obat?", "id") == (
        b"mp3-audio",
        "audio/mpeg",
    )
    assert len(client.calls) == 2
    assert client.calls[0][2].speaking_rate == pytest.approx(0.9)
    assert client.calls[1][2].speaking_rate == 0.0
    assert client.calls[0][3] == 15
    assert client.calls[1][3] == 15


@pytest.mark.parametrize(
    "error", [DeadlineExceeded("timeout"), ServiceUnavailable("down")]
)
def test_google_translate_api_errors_become_provider_error(error):
    class FailingClient:
        def translate_text(self, **kwargs):
            raise error

    provider = GoogleTranslateProvider(FailingClient(), "project", timeout_seconds=7)
    with pytest.raises(ProviderError, match="Translation request failed"):
        provider.translate("Nenek", "id", "zh-TW")


@pytest.mark.parametrize(
    "error", [DeadlineExceeded("timeout"), ServiceUnavailable("down")]
)
def test_google_tts_api_errors_become_provider_error(error):
    class FailingClient:
        def synthesize_speech(self, **kwargs):
            raise error

    provider = GoogleTtsProvider(
        FailingClient(), "id-ID-Chirp3-HD-Pulcherrima", 0.9, timeout_seconds=7
    )
    with pytest.raises(ProviderError, match="TTS request failed"):
        provider.synthesize("Nenek", "id")


@pytest.mark.parametrize(
    ("settings", "variable"),
    [
        ({"translate_provider": "google"}, "GOOGLE_TRANSLATE_CREDENTIALS"),
        ({"tts_id_provider": "google"}, "GOOGLE_TTS_CREDENTIALS"),
    ],
)
def test_google_mode_requires_credentials_path(settings, variable):
    with pytest.raises(ValueError, match=variable):
        build_providers(Settings(**settings))
