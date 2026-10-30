import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app(Settings())) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def audio_factory(tmp_path_factory):
    directory = tmp_path_factory.mktemp("generated-audio")

    def make_audio(
        duration: float = 1.0,
        container: str = "wav",
        codec: str | None = None,
    ) -> bytes:
        extension = {"webm": "webm", "mp4": "m4a"}.get(container, container)
        output = Path(directory) / f"tone-{duration}-{container}.{extension}"
        command = [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={duration}",
        ]
        if codec:
            command.extend(["-c:a", codec])
        command.append(str(output))
        subprocess.run(command, check=True, capture_output=True)
        return output.read_bytes()

    return make_audio
