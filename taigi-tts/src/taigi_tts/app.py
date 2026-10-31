from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .cache import CachedResult, DiskLruCache
from .config import Settings
from .models import GeneratedAudio, ModelStack


class Synthesizer(Protocol):
    loaded: bool

    def load(self) -> None: ...

    def synthesize(self, text: str) -> GeneratedAudio: ...

    def gpu_memory(self) -> dict[str, int | None]: ...


class SynthesisRequest(BaseModel):
    text: str


class BusyError(Exception):
    pass


class RequestGate:
    def __init__(self, max_queue: int) -> None:
        self.capacity = max_queue + 1
        self.pending = 0
        self.state_lock = asyncio.Lock()
        self.processing_lock = asyncio.Lock()

    @asynccontextmanager
    async def reserve(self) -> AsyncIterator[None]:
        async with self.state_lock:
            if self.pending >= self.capacity:
                raise BusyError
            self.pending += 1
        try:
            async with self.processing_lock:
                yield
        finally:
            async with self.state_lock:
                self.pending -= 1


def create_app(
    settings: Settings | None = None,
    synthesizer: Synthesizer | None = None,
    cache: DiskLruCache | None = None,
) -> FastAPI:
    resolved = settings or Settings.from_env()
    stack = synthesizer or ModelStack(resolved)
    result_cache = cache or DiskLruCache(
        resolved.cache_dir / "results",
        resolved.cache_max_items,
        resolved.ref_audio,
        resolved.ref_text,
        f"{resolved.model_version}|llama_dtype={resolved.llama_dtype}",
    )
    gate = RequestGate(resolved.max_queue)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await run_in_threadpool(stack.load)
        yield

    app = FastAPI(title="Ama Taiwanese TTS", version="1.0", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok" if stack.loaded else "starting",
            "loaded": stack.loaded,
            "llama_dtype": resolved.llama_dtype,
            "gpu_memory": stack.gpu_memory(),
            "queue": {"pending": gate.pending, "capacity": gate.capacity},
        }

    @app.post("/synthesize")
    async def synthesize(request: SynthesisRequest) -> Response:
        text = request.text.strip()
        if not text or len(text) > 200:
            return _error(422, "INVALID_TEXT", "text must contain 1 to 200 characters")
        started = time.perf_counter()
        try:
            async with gate.reserve():
                cached = await run_in_threadpool(result_cache.get, text)
                if cached is None:
                    generated = await run_in_threadpool(stack.synthesize, text)
                    cached = await run_in_threadpool(
                        result_cache.put,
                        text,
                        generated.audio_path,
                        generated.han,
                        generated.romanization,
                    )
                audio = await run_in_threadpool(Path(cached.audio_path).read_bytes)
        except BusyError:
            return _error(503, "BUSY", "Taiwanese TTS queue is full")
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Taiwanese TTS synthesis failed")
            return _error(500, "MODEL_ERROR", "Taiwanese TTS synthesis failed")
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={
                "X-Taigi-Han": quote(cached.han, safe=""),
                "X-Taigi-Romanization": quote(cached.romanization, safe=""),
                "X-Taigi-Service-Ms": str(elapsed_ms),
            },
        )

    return app


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
    )
