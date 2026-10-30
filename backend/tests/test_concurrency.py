import asyncio
import threading
import time

import httpx

from backend.audio import PreparedAudio
from backend.config import Settings
from backend.main import create_app


def test_slow_provider_does_not_block_health():
    provider_started = threading.Event()
    provider_finished = threading.Event()

    class PassthroughPreprocessor:
        def prepare(self, audio_bytes: bytes) -> PreparedAudio:
            return PreparedAudio(wav_bytes=audio_bytes, duration_seconds=1.0)

    class SlowAsr:
        def transcribe(self, wav_bytes: bytes, lang: str) -> str:
            provider_started.set()
            time.sleep(0.75)
            provider_finished.set()
            return "你今天有吃藥無？"

    async def run_requests() -> None:
        app = create_app(Settings())
        app.state.pipeline.preprocessor = PassthroughPreprocessor()
        app.state.pipeline.asr_providers["nan-TW"] = SlowAsr()
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            translate_task = asyncio.create_task(
                client.post(
                    "/api/translate",
                    data={"speaker": "ama"},
                    files={"audio": ("recording.wav", b"audio", "audio/wav")},
                )
            )

            deadline = time.perf_counter() + 0.5
            while not provider_started.is_set() and time.perf_counter() < deadline:
                await asyncio.sleep(0.005)

            assert provider_started.is_set(), "event loop was blocked by the pipeline"
            health_response = await client.get("/api/health")
            assert health_response.status_code == 200
            assert health_response.json()["status"] == "ok"
            assert not provider_finished.is_set(), "health waited for the slow provider"

            translate_response = await translate_task
            assert translate_response.status_code == 200

    asyncio.run(run_requests())
