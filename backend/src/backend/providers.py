import io
import logging
import math
import struct
import time
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from google.api_core.exceptions import GoogleAPIError, InvalidArgument
from google.cloud import texttospeech, translate_v3
from google.oauth2 import service_account

from backend.config import Settings
from backend.errors import ProviderError
from backend.glossary import TranslationGlossary

logger = logging.getLogger(__name__)


class AsrProvider(ABC):
    @abstractmethod
    def transcribe(self, wav_bytes: bytes, lang: str) -> str:
        raise NotImplementedError


class TranslateProvider(ABC):
    @abstractmethod
    def translate(self, text: str, source: str, target: str) -> str:
        raise NotImplementedError


class TtsProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str, lang: str) -> tuple[bytes, str]:
        raise NotImplementedError


class MockAsrProvider(AsrProvider):
    def transcribe(self, wav_bytes: bytes, lang: str) -> str:
        del wav_bytes
        if lang == "nan-TW":
            return "你今天有吃藥無？"
        return "Nenek, mau makan sekarang?"


class MockTranslateProvider(TranslateProvider):
    def translate(self, text: str, source: str, target: str) -> str:
        del text, source
        if target == "id":
            return "Apakah hari ini sudah minum obat?"
        return "阿罵，欲食飯矣無？"


class MockTtsProvider(TtsProvider):
    def synthesize(self, text: str, lang: str) -> tuple[bytes, str]:
        del text
        sample_rate = 16_000
        duration = 0.35
        frequency = 523.25 if lang == "id" else 392.0
        frame_count = int(sample_rate * duration)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            frames = bytearray()
            for index in range(frame_count):
                sample = int(
                    0.2
                    * 32767
                    * math.sin(2 * math.pi * frequency * index / sample_rate)
                )
                frames.extend(struct.pack("<h", sample))
            wav.writeframes(frames)
        return buffer.getvalue(), "audio/wav"


class RemoteAsrProvider(AsrProvider):
    def __init__(self, client: httpx.Client):
        self.client = client

    def transcribe(self, wav_bytes: bytes, lang: str) -> str:
        started = time.perf_counter()
        try:
            response = self.client.post(
                "/v1/asr",
                data={"language": lang},
                files={"audio": ("audio.wav", wav_bytes, "audio/wav")},
            )
        except httpx.TimeoutException as exc:
            logger.warning("Remote ASR timed out elapsed_ms=%d", _elapsed_ms(started))
            raise ProviderError("Remote ASR timed out") from exc
        except httpx.RequestError as exc:
            logger.warning(
                "Remote ASR connection failed elapsed_ms=%d", _elapsed_ms(started)
            )
            raise ProviderError("Remote ASR connection failed") from exc

        elapsed_ms = _elapsed_ms(started)
        if not response.is_success:
            logger.warning(
                "Remote ASR failed status_code=%d elapsed_ms=%d",
                response.status_code,
                elapsed_ms,
            )
            raise ProviderError(f"Remote ASR returned HTTP {response.status_code}")

        try:
            text = response.json()["text"]
            if not isinstance(text, str):
                raise TypeError
        except (ValueError, KeyError, TypeError) as exc:
            logger.warning(
                "Remote ASR returned invalid response status_code=%d elapsed_ms=%d",
                response.status_code,
                elapsed_ms,
            )
            raise ProviderError("Remote ASR returned an invalid response") from exc

        logger.info(
            "Remote ASR completed status_code=%d elapsed_ms=%d",
            response.status_code,
            elapsed_ms,
        )
        return text


class GoogleTranslateProvider(TranslateProvider):
    def __init__(
        self,
        client: Any,
        project_id: str,
        timeout_seconds: float = 15,
        glossary: TranslationGlossary | None = None,
    ):
        self.client = client
        self.parent = f"projects/{project_id}/locations/global"
        self.timeout_seconds = timeout_seconds
        self.glossary = glossary or TranslationGlossary()

    def translate(self, text: str, source: str, target: str) -> str:
        protected_text = self.glossary.prepare(text, source, target)
        try:
            response = self.client.translate_text(
                request={
                    "parent": self.parent,
                    "contents": [protected_text],
                    "source_language_code": source,
                    "target_language_code": target,
                    "mime_type": "text/html",
                },
                timeout=self.timeout_seconds,
            )
        except GoogleAPIError as exc:
            raise ProviderError("Google Translation request failed") from exc
        return self.glossary.restore(
            response.translations[0].translated_text, target=target
        )

    def warm_up(self) -> None:
        self.translate("Hai", source="id", target="zh-TW")


class GoogleTtsProvider(TtsProvider):
    def __init__(
        self,
        client: Any,
        voice_name: str,
        speaking_rate: float,
        timeout_seconds: float = 15,
    ):
        self.client = client
        self.voice_name = voice_name
        self.speaking_rate = speaking_rate
        self.timeout_seconds = timeout_seconds

    def synthesize(self, text: str, lang: str) -> tuple[bytes, str]:
        del lang
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="id-ID", name=self.voice_name
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=self.speaking_rate,
        )
        try:
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
                timeout=self.timeout_seconds,
            )
        except InvalidArgument:
            logger.warning(
                "Google TTS voice rejected speaking rate; retrying without rate voice=%s",
                self.voice_name,
            )
            try:
                response = self.client.synthesize_speech(
                    input=synthesis_input,
                    voice=voice,
                    audio_config=texttospeech.AudioConfig(
                        audio_encoding=texttospeech.AudioEncoding.MP3
                    ),
                    timeout=self.timeout_seconds,
                )
            except GoogleAPIError as exc:
                raise ProviderError("Google TTS request failed") from exc
        except GoogleAPIError as exc:
            raise ProviderError("Google TTS request failed") from exc
        return response.audio_content, "audio/mpeg"

    def warm_up(self) -> None:
        self.synthesize("Hai", lang="id")


@dataclass(slots=True)
class ProviderBundle:
    asr: dict[str, AsrProvider]
    translate: TranslateProvider
    tts: dict[str, TtsProvider]
    resources: tuple[Any, ...] = ()

    def warm_up(self) -> None:
        providers = (
            ("translate", self.translate),
            ("tts_id", self.tts.get("id")),
        )
        for provider_name, provider in providers:
            warm_up = getattr(provider, "warm_up", None)
            if not callable(warm_up):
                continue
            started = time.perf_counter()
            try:
                warm_up()
            except Exception as exc:
                logger.warning(
                    "Provider warm-up failed provider=%s error=%s elapsed_ms=%d",
                    provider_name,
                    type(exc).__name__,
                    _elapsed_ms(started),
                )
            else:
                logger.info(
                    "Provider warm-up completed provider=%s elapsed_ms=%d",
                    provider_name,
                    _elapsed_ms(started),
                )

    def close(self) -> None:
        _close_resources(self.resources)


def build_providers(
    settings: Settings,
) -> ProviderBundle:
    resources: list[Any] = []
    try:
        remote_client = _build_remote_client(settings, resources)
        asr = {
            "nan-TW": _build_asr(
                settings.asr_nan_provider, remote_client, "nan-TW"
            ),
            "id": _build_asr(settings.asr_id_provider, remote_client, "id"),
        }
        translate = _build_translate(settings, resources)
        tts = {
            "id": _build_id_tts(settings, resources),
            "nan-TW": _build_nan_tts(settings.tts_nan_provider),
        }
        return ProviderBundle(asr, translate, tts, tuple(resources))
    except Exception:
        _close_resources(resources)
        raise


def _build_remote_client(settings: Settings, resources: list[Any]) -> httpx.Client | None:
    if "remote" not in {settings.asr_nan_provider, settings.asr_id_provider}:
        return None
    base_url = _required(settings.inference_base_url, "INFERENCE_BASE_URL", "remote ASR")
    token = _required_secret(
        settings.inference_api_token, "INFERENCE_API_TOKEN", "remote ASR"
    )
    headers = {"Authorization": f"Bearer {token}"}
    if settings.inference_cf_access_client_id:
        headers["CF-Access-Client-Id"] = settings.inference_cf_access_client_id
    if settings.inference_cf_access_client_secret:
        headers["CF-Access-Client-Secret"] = (
            settings.inference_cf_access_client_secret.get_secret_value()
        )
    client = httpx.Client(
        base_url=base_url.rstrip("/"),
        headers=headers,
        timeout=settings.inference_timeout_seconds,
    )
    resources.append(client)
    return client


def _build_asr(
    provider_name: str, remote_client: httpx.Client | None, language: str
) -> AsrProvider:
    if provider_name == "mock":
        return MockAsrProvider()
    if provider_name == "remote" and remote_client is not None:
        return RemoteAsrProvider(remote_client)
    raise ValueError(f"Unsupported ASR {language} provider: {provider_name}")


def _build_translate(settings: Settings, resources: list[Any]) -> TranslateProvider:
    if settings.translate_provider == "mock":
        return MockTranslateProvider()
    if settings.translate_provider != "google":
        raise ValueError(f"Unsupported translate provider: {settings.translate_provider}")
    path = _credentials_path(
        settings.google_translate_credentials,
        "GOOGLE_TRANSLATE_CREDENTIALS",
        "Google Translation",
    )
    credentials = service_account.Credentials.from_service_account_file(path)
    if not credentials.project_id:
        raise ValueError("Google Translation credentials do not contain a project_id")
    client = translate_v3.TranslationServiceClient(credentials=credentials)
    resources.append(client)
    glossary = TranslationGlossary.from_file(settings.translation_glossary)
    return GoogleTranslateProvider(
        client,
        credentials.project_id,
        settings.google_timeout_seconds,
        glossary,
    )


def _build_id_tts(settings: Settings, resources: list[Any]) -> TtsProvider:
    if settings.tts_id_provider == "mock":
        return MockTtsProvider()
    if settings.tts_id_provider != "google":
        raise ValueError(f"Unsupported TTS id provider: {settings.tts_id_provider}")
    path = _credentials_path(
        settings.google_tts_credentials, "GOOGLE_TTS_CREDENTIALS", "Google TTS"
    )
    credentials = service_account.Credentials.from_service_account_file(path)
    client = texttospeech.TextToSpeechClient(credentials=credentials)
    resources.append(client)
    return GoogleTtsProvider(
        client,
        settings.tts_id_voice,
        settings.tts_id_speaking_rate,
        settings.google_timeout_seconds,
    )


def _build_nan_tts(provider_name: str) -> TtsProvider:
    if provider_name == "mock":
        return MockTtsProvider()
    raise ValueError(f"Unsupported TTS nan-TW provider: {provider_name}")


def _required(value: str | None, variable: str, mode: str) -> str:
    if not value:
        raise ValueError(f"{variable} is required for {mode}")
    return value


def _required_secret(value: Any, variable: str, mode: str) -> str:
    if value is None or not value.get_secret_value():
        raise ValueError(f"{variable} is required for {mode}")
    return value.get_secret_value()


def _credentials_path(value: str | None, variable: str, mode: str) -> str:
    return str(Path(_required(value, variable, mode)).expanduser())


def _close_resources(resources: tuple[Any, ...] | list[Any]) -> None:
    for resource in reversed(resources):
        close = getattr(resource, "close", None)
        if callable(close):
            close()


def _elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)
