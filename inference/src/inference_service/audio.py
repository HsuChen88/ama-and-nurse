from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from fastapi import UploadFile
from faster_whisper import decode_audio
from numpy.typing import NDArray

SAMPLE_RATE = 16_000
MIN_DURATION_SECONDS = 0.5
MAX_DURATION_SECONDS = 30.0
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 64 * 1024

AudioArray = NDArray[np.float32]


class AudioError(ValueError):
    code = "INVALID_AUDIO"
    status_code = 422


class InvalidAudioError(AudioError):
    pass


class AudioTooShortError(AudioError):
    code = "AUDIO_TOO_SHORT"


class AudioTooLongError(AudioError):
    code = "AUDIO_TOO_LONG"


class PayloadTooLargeError(AudioError):
    code = "PAYLOAD_TOO_LARGE"
    status_code = 413


@dataclass(frozen=True)
class DecodedAudio:
    samples: AudioArray
    duration_ms: int


async def read_upload_limited(upload: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total_bytes = 0

    while chunk := await upload.read(UPLOAD_CHUNK_BYTES):
        total_bytes += len(chunk)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise PayloadTooLargeError("Audio upload exceeds the 10 MB limit")
        chunks.append(chunk)

    if total_bytes == 0:
        raise InvalidAudioError("Audio file is empty")
    return b"".join(chunks)


def decode_and_validate(data: bytes) -> DecodedAudio:
    try:
        samples = decode_audio(io.BytesIO(data), sampling_rate=SAMPLE_RATE)
    except Exception as exc:
        raise InvalidAudioError("Audio could not be decoded") from exc

    duration_seconds = len(samples) / SAMPLE_RATE
    if duration_seconds < MIN_DURATION_SECONDS:
        raise AudioTooShortError("Audio must be at least 0.5 seconds long")
    if duration_seconds > MAX_DURATION_SECONDS:
        raise AudioTooLongError("Audio must be at most 30 seconds long")

    return DecodedAudio(
        samples=np.asarray(samples, dtype=np.float32),
        duration_ms=round(duration_seconds * 1000),
    )
