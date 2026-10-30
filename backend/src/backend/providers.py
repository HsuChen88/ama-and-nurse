import io
import math
import struct
import wave
from abc import ABC, abstractmethod

from backend.config import Settings


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


def _mock_only(provider_name: str, kind: str) -> None:
    if provider_name != "mock":
        raise ValueError(f"Unsupported {kind} provider: {provider_name}")


def build_providers(
    settings: Settings,
) -> tuple[dict[str, AsrProvider], TranslateProvider, dict[str, TtsProvider]]:
    _mock_only(settings.asr_nan_provider, "ASR nan-TW")
    _mock_only(settings.asr_id_provider, "ASR id")
    _mock_only(settings.translate_provider, "translate")
    _mock_only(settings.tts_id_provider, "TTS id")
    _mock_only(settings.tts_nan_provider, "TTS nan-TW")
    return (
        {"nan-TW": MockAsrProvider(), "id": MockAsrProvider()},
        MockTranslateProvider(),
        {"id": MockTtsProvider(), "nan-TW": MockTtsProvider()},
    )
