import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from backend.errors import ApiError


@dataclass(frozen=True, slots=True)
class PreparedAudio:
    wav_bytes: bytes
    duration_seconds: float


class AudioPreprocessor:
    def __init__(self, ffmpeg_binary: str = "ffmpeg", ffprobe_binary: str = "ffprobe"):
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary

    def prepare(self, audio_bytes: bytes) -> PreparedAudio:
        if not audio_bytes:
            raise ApiError("INVALID_AUDIO", "Audio file is empty", 422)

        with tempfile.TemporaryDirectory(prefix="ama-audio-") as temp_dir:
            source = Path(temp_dir) / "upload"
            output = Path(temp_dir) / "normalized.wav"
            source.write_bytes(audio_bytes)

            try:
                subprocess.run(
                    [
                        self.ffmpeg_binary,
                        "-v",
                        "error",
                        "-y",
                        "-i",
                        str(source),
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        "-c:a",
                        "pcm_s16le",
                        str(output),
                    ],
                    check=True,
                    capture_output=True,
                    timeout=45,
                )
                probe = subprocess.run(
                    [
                        self.ffprobe_binary,
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(output),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
                duration = float(probe.stdout.strip())
                wav_bytes = output.read_bytes()
            except (OSError, subprocess.SubprocessError, ValueError):
                raise ApiError("INVALID_AUDIO", "Audio could not be decoded", 422) from None

        if duration < 0.5:
            raise ApiError("AUDIO_TOO_SHORT", "Audio must be at least 0.5 seconds", 422)
        if duration > 30:
            raise ApiError("AUDIO_TOO_LONG", "Audio must not exceed 30 seconds", 422)
        return PreparedAudio(wav_bytes=wav_bytes, duration_seconds=duration)
