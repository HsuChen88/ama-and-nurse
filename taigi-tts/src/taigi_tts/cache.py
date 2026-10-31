from __future__ import annotations

import hashlib
import json
import os
import shutil
import unicodedata
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CachedResult:
    audio_path: Path
    han: str
    romanization: str


class DiskLruCache:
    def __init__(
        self,
        root: Path,
        max_items: int,
        ref_audio: Path,
        ref_text: str | None,
        model_version: str,
    ) -> None:
        self.root = root
        self.max_items = max_items
        self.ref_digest = _file_digest(ref_audio)
        self.ref_text = unicodedata.normalize("NFC", ref_text or "")
        self.model_version = model_version

    def key(self, text: str) -> str:
        payload = {
            "text": unicodedata.normalize("NFC", text),
            "ref_sha256": self.ref_digest,
            "ref_text": self.ref_text,
            "model_version": self.model_version,
        }
        encoded = json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def get(self, text: str) -> CachedResult | None:
        key = self.key(text)
        audio = self.root / f"{key}.mp3"
        metadata = self.root / f"{key}.json"
        if not audio.is_file() or not metadata.is_file():
            return None
        try:
            body = json.loads(metadata.read_text(encoding="utf-8"))
            result = CachedResult(
                audio_path=audio,
                han=str(body["han"]),
                romanization=str(body["romanization"]),
            )
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None
        os.utime(audio)
        os.utime(metadata)
        return result

    def put(
        self,
        text: str,
        source_audio: Path,
        han: str,
        romanization: str,
    ) -> CachedResult:
        self.root.mkdir(parents=True, exist_ok=True)
        key = self.key(text)
        audio = self.root / f"{key}.mp3"
        metadata = self.root / f"{key}.json"
        temporary_audio = self.root / f".{key}.{os.getpid()}.mp3.tmp"
        temporary_metadata = self.root / f".{key}.{os.getpid()}.json.tmp"
        try:
            shutil.copyfile(source_audio, temporary_audio)
            temporary_metadata.write_text(
                json.dumps(
                    {"han": han, "romanization": romanization},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            os.replace(temporary_audio, audio)
            os.replace(temporary_metadata, metadata)
        finally:
            temporary_audio.unlink(missing_ok=True)
            temporary_metadata.unlink(missing_ok=True)
        self._evict()
        return CachedResult(audio, han, romanization)

    def _evict(self) -> None:
        if self.max_items == 0:
            return
        entries = sorted(
            self.root.glob("*.mp3"),
            key=lambda path: path.stat().st_mtime_ns,
            reverse=True,
        )
        for audio in entries[self.max_items :]:
            audio.unlink(missing_ok=True)
            audio.with_suffix(".json").unlink(missing_ok=True)


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
