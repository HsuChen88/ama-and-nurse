import time
from dataclasses import asdict, dataclass

from backend.audio import AudioPreprocessor
from backend.errors import ApiError, ProviderError
from backend.providers import AsrProvider, TranslateProvider, TtsProvider
from backend.storage import AudioStore


@dataclass(frozen=True, slots=True)
class SpeakerConfig:
    source_lang: str
    target_lang: str
    translate_source: str
    translate_target: str


SPEAKERS = {
    "ama": SpeakerConfig("nan-TW", "id", "zh-TW", "id"),
    "caregiver": SpeakerConfig("id", "nan-TW", "id", "zh-TW"),
}


@dataclass(frozen=True, slots=True)
class TranslationResult:
    id: str
    speaker: str
    source_lang: str
    target_lang: str
    source_text: str
    translated_text: str
    audio_url: str
    audio_mime: str
    timings_ms: dict[str, int]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class TranslationPipeline:
    def __init__(
        self,
        preprocessor: AudioPreprocessor,
        asr_providers: dict[str, AsrProvider],
        translate_provider: TranslateProvider,
        tts_providers: dict[str, TtsProvider],
        audio_store: AudioStore,
    ):
        self.preprocessor = preprocessor
        self.asr_providers = asr_providers
        self.translate_provider = translate_provider
        self.tts_providers = tts_providers
        self.audio_store = audio_store

    def run(self, audio_bytes: bytes, speaker: str) -> TranslationResult:
        if speaker not in SPEAKERS:
            raise ApiError("INVALID_SPEAKER", "Speaker must be ama or caregiver", 422)
        config = SPEAKERS[speaker]
        total_start = time.perf_counter()
        prepared = self.preprocessor.prepare(audio_bytes)

        try:
            start = time.perf_counter()
            source_text = self.asr_providers[config.source_lang].transcribe(
                prepared.wav_bytes, config.source_lang
            )
            asr_ms = _elapsed_ms(start)
            if not source_text.strip():
                raise ApiError("ASR_EMPTY", "No speech was recognized", 422)

            start = time.perf_counter()
            translated_text = self.translate_provider.translate(
                source_text, config.translate_source, config.translate_target
            )
            translate_ms = _elapsed_ms(start)

            start = time.perf_counter()
            synthesized, mime = self.tts_providers[config.target_lang].synthesize(
                translated_text, config.target_lang
            )
            tts_ms = _elapsed_ms(start)
        except ApiError:
            raise
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError from exc

        audio_id = self.audio_store.put(synthesized, mime)
        total_ms = _elapsed_ms(total_start)
        return TranslationResult(
            id=audio_id,
            speaker=speaker,
            source_lang=config.source_lang,
            target_lang=config.target_lang,
            source_text=source_text,
            translated_text=translated_text,
            audio_url=f"/api/audio/{audio_id}",
            audio_mime=mime,
            timings_ms={
                "asr": asr_ms,
                "translate": translate_ms,
                "tts": tts_ms,
                "total": total_ms,
            },
        )


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)
