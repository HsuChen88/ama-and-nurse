from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class TtsBackendError(Exception):
    pass


class TtsBusyError(TtsBackendError):
    pass


@dataclass(frozen=True)
class TtsResult:
    audio: bytes
    han_header: str
    romanization_header: str


class TtsClient(Protocol):
    def synthesize(self, text: str) -> TtsResult: ...


class UrllibTtsClient:
    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self.url = f"{base_url.rstrip('/')}/synthesize"
        self.timeout_seconds = timeout_seconds

    def synthesize(self, text: str) -> TtsResult:
        request = Request(
            self.url,
            data=json.dumps({"text": text}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                content_type = response.headers.get("Content-Type", "")
                han = response.headers.get("X-Taigi-Han")
                romanization = response.headers.get("X-Taigi-Romanization")
                audio = response.read()
        except HTTPError as exc:
            if exc.code == 503:
                raise TtsBusyError("Taiwanese TTS queue is full") from exc
            raise TtsBackendError(
                f"Taiwanese TTS backend returned HTTP {exc.code}"
            ) from exc
        except (TimeoutError, socket.timeout, URLError, OSError) as exc:
            raise TtsBackendError("Taiwanese TTS backend is unavailable") from exc

        if not content_type.lower().startswith("audio/mpeg"):
            raise TtsBackendError("Taiwanese TTS backend returned non-MP3 content")
        if not audio or not han or not romanization:
            raise TtsBackendError("Taiwanese TTS backend response is incomplete")
        return TtsResult(audio, han, romanization)
