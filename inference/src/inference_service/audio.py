from __future__ import annotations

import io
import wave
from dataclasses import dataclass


class InvalidAudioError(ValueError):
    pass


@dataclass(frozen=True)
class WavInfo:
    duration_ms: int


def validate_wav(data: bytes) -> WavInfo:
    if not data:
        raise InvalidAudioError("Audio file is empty")

    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            channels = wav.getnchannels()
            sample_rate = wav.getframerate()
            sample_width = wav.getsampwidth()
            frames = wav.getnframes()
            compression = wav.getcomptype()
            audio_data = wav.readframes(frames)
    except (EOFError, wave.Error) as exc:
        raise InvalidAudioError("Audio must be a readable PCM WAV file") from exc

    if channels != 1 or sample_rate != 16_000:
        raise InvalidAudioError("Audio must be 16 kHz mono PCM WAV")
    if compression != "NONE" or sample_width not in {1, 2, 3, 4}:
        raise InvalidAudioError("Audio must use uncompressed PCM samples")
    if frames == 0:
        raise InvalidAudioError("Audio file contains no samples")
    if len(audio_data) != frames * channels * sample_width:
        raise InvalidAudioError("Audio WAV data is truncated")

    return WavInfo(duration_ms=round(frames / sample_rate * 1000))
