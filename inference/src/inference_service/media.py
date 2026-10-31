from __future__ import annotations

import mimetypes
from pathlib import Path


def audio_content_type(audio: Path) -> str:
    content_types = {
        ".webm": "audio/webm",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
    }
    return content_types.get(
        audio.suffix.lower(),
        mimetypes.guess_type(audio.name)[0] or "application/octet-stream",
    )
