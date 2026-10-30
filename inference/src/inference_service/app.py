from __future__ import annotations

import hmac
import logging
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .audio import InvalidAudioError, validate_wav
from .config import SUPPORTED_LANGUAGES, Settings
from .manager import AsrManager, EngineFactory

logger = logging.getLogger(__name__)


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class AsrResponse(BaseModel):
    text: str
    language: str
    model: str
    duration_ms: int
    inference_ms: int


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error=ErrorBody(code=code, message=message)).model_dump(),
    )


def create_app(
    settings: Settings | None = None,
    engine_factory: EngineFactory | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    manager = AsrManager(
        resolved_settings,
        engine_factory=engine_factory or _default_engine_factory,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        for language in resolved_settings.preload:
            await run_in_threadpool(manager.slot(language).preload)
        yield

    app = FastAPI(title="Ama Inference Service", version="1.0", lifespan=lifespan)
    app.state.settings = resolved_settings
    app.state.manager = manager

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path.startswith("/v1/") and request.url.path != "/v1/health":
            expected = f"Bearer {resolved_settings.api_token}"
            authorization = request.headers.get("Authorization")
            if authorization is None or not hmac.compare_digest(
                authorization, expected
            ):
                return error_response(401, "UNAUTHORIZED", "Invalid bearer token")
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        locations = {str(item) for error in exc.errors() for item in error["loc"]}
        if "language" in locations:
            return error_response(422, "INVALID_LANGUAGE", "Invalid or missing language")
        return error_response(422, "INVALID_AUDIO", "Invalid or missing audio upload")

    @app.get("/v1/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "device": resolved_settings.device,
            "models": resolved_settings.models,
            "loaded": manager.loaded_languages(),
        }

    @app.post("/v1/asr", response_model=AsrResponse)
    async def asr(
        audio: UploadFile = File(...),
        language: str = Form(...),
    ) -> AsrResponse | JSONResponse:
        if language not in SUPPORTED_LANGUAGES:
            return error_response(
                422, "INVALID_LANGUAGE", f"Unsupported language: {language}"
            )

        data = await audio.read()
        try:
            wav_info = validate_wav(data)
        except InvalidAudioError as exc:
            return error_response(422, "INVALID_AUDIO", str(exc))

        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_file.write(data)
                temp_path = Path(temp_file.name)

            slot = manager.slot(language)
            if not slot.reserve():
                return error_response(503, "BUSY", "ASR queue is full")
            result = await run_in_threadpool(
                slot.transcribe_reserved, temp_path, language
            )
        except Exception:
            logger.exception("ASR inference failed for language %s", language)
            return error_response(500, "MODEL_ERROR", "ASR model inference failed")
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

        return AsrResponse(
            text=result.text,
            language=language,
            model=resolved_settings.models[language],
            duration_ms=wav_info.duration_ms,
            inference_ms=result.inference_ms,
        )

    @app.post("/v1/tts")
    async def tts() -> JSONResponse:
        return error_response(501, "NOT_IMPLEMENTED", "TTS is not implemented")

    return app


def _default_engine_factory(config):
    from .engine import FasterWhisperEngine

    return FasterWhisperEngine(config)
