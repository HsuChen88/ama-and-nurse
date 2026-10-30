import threading
import time
import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StoredAudio:
    content: bytes
    mime: str
    expires_at: float


class AudioStore:
    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, StoredAudio] = {}
        self._lock = threading.Lock()

    def put(self, content: bytes, mime: str) -> str:
        audio_id = str(uuid.uuid4())
        now = time.monotonic()
        with self._lock:
            self._purge_expired(now)
            self._items[audio_id] = StoredAudio(content, mime, now + self.ttl_seconds)
        return audio_id

    def get(self, audio_id: str) -> StoredAudio | None:
        now = time.monotonic()
        with self._lock:
            item = self._items.get(audio_id)
            if item is None:
                return None
            if item.expires_at <= now:
                del self._items[audio_id]
                return None
            return item

    def _purge_expired(self, now: float) -> None:
        expired = [key for key, item in self._items.items() if item.expires_at <= now]
        for key in expired:
            del self._items[key]
