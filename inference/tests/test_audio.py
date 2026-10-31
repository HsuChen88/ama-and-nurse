from __future__ import annotations

import asyncio
import io

import pytest

from inference_service.audio import (
    MAX_UPLOAD_BYTES,
    UPLOAD_CHUNK_BYTES,
    PayloadTooLargeError,
    decode_and_validate,
    read_upload_limited,
)

from conftest import make_audio


class TrackingUpload:
    def __init__(self, data: bytes) -> None:
        self._file = io.BytesIO(data)
        self.bytes_read = 0

    async def read(self, size: int) -> bytes:
        chunk = self._file.read(size)
        self.bytes_read += len(chunk)
        return chunk


def test_upload_limit_stops_reading_after_first_oversized_chunk():
    upload = TrackingUpload(b"x" * (MAX_UPLOAD_BYTES + UPLOAD_CHUNK_BYTES * 3))

    with pytest.raises(PayloadTooLargeError):
        asyncio.run(read_upload_limited(upload))  # type: ignore[arg-type]

    assert upload.bytes_read == MAX_UPLOAD_BYTES + UPLOAD_CHUNK_BYTES


@pytest.mark.parametrize("duration", [0.5, 30.0])
def test_duration_boundaries_are_inclusive(duration: float):
    decoded = decode_and_validate(make_audio("wav", duration))

    assert decoded.duration_ms == round(duration * 1000)
