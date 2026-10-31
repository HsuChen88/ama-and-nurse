from __future__ import annotations

import hmac
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .audio import AudioError, decode_and_validate, read_upload_limited
from .config import SUPPORTED_LANGUAGES, Settings
from .manager import AsrManager, EngineFactory
from .tts import TtsBackendError, TtsBusyError, TtsClient, UrllibTtsClient

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


class TtsRequest(BaseModel):
    text: str
    language: str


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error=ErrorBody(code=code, message=message)).model_dump(),
    )


def create_app(
    settings: Settings | None = None,
    engine_factory: EngineFactory | None = None,
    tts_client: TtsClient | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    manager = AsrManager(
        resolved_settings,
        engine_factory=engine_factory or _default_engine_factory,
    )
    resolved_tts_client = tts_client or UrllibTtsClient(
        resolved_settings.tts_url,
        resolved_settings.tts_timeout_seconds,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        from .engine import validate_offline_models

        await run_in_threadpool(validate_offline_models, resolved_settings.models)
        for language in resolved_settings.preload:
            try:
                await run_in_threadpool(manager.slot(language).preload)
            except Exception as exc:
                if _offline_mode_enabled():
                    raise RuntimeError(
                        f"Failed to load {language} while HF_HUB_OFFLINE=1. Set "
                        "HF_HUB_OFFLINE=0 and start the service once during an "
                        "allowed network window to download or refresh the model."
                    ) from exc
                raise
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
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        locations = {str(item) for error in exc.errors() for item in error["loc"]}
        if request.url.path == "/v1/tts":
            if "language" in locations:
                return error_response(
                    422,
                    "INVALID_LANGUAGE",
                    "Invalid or missing language",
                )
            return error_response(422, "INVALID_TEXT", "Invalid or missing text")
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

        try:
            data = await read_upload_limited(audio)
            decoded = await run_in_threadpool(decode_and_validate, data)
        except AudioError as exc:
            return error_response(exc.status_code, exc.code, str(exc))

        slot = manager.slot(language)
        if not slot.reserve():
            return error_response(503, "BUSY", "ASR queue is full")
        try:
            result = await run_in_threadpool(
                slot.transcribe_reserved, decoded.samples, language
            )
        except Exception:
            logger.exception("ASR inference failed for language %s", language)
            return error_response(500, "MODEL_ERROR", "ASR model inference failed")

        return AsrResponse(
            text=result.text,
            language=language,
            model=resolved_settings.models[language],
            duration_ms=decoded.duration_ms,
            inference_ms=result.inference_ms,
        )

    @app.post("/v1/tts")
    async def tts(payload: TtsRequest) -> Response:
        if payload.language != "nan-TW":
            return error_response(
                422,
                "INVALID_LANGUAGE",
                f"Unsupported language: {payload.language}",
            )
        text = payload.text.strip()
        if not text or len(text) > 200:
            return error_response(
                422,
                "INVALID_TEXT",
                "text must contain 1 to 200 characters",
            )

        started = time.perf_counter()
        try:
            result = await run_in_threadpool(resolved_tts_client.synthesize, text)
        except TtsBusyError:
            return error_response(503, "BUSY", "Taiwanese TTS queue is full")
        except TtsBackendError:
            logger.warning(
                "Taiwanese TTS backend failed elapsed_ms=%d",
                round((time.perf_counter() - started) * 1000),
            )
            return error_response(
                502,
                "TTS_BACKEND_ERROR",
                "Taiwanese TTS backend failed",
            )
        except Exception:
            logger.exception("Unexpected Taiwanese TTS backend failure")
            return error_response(
                502,
                "TTS_BACKEND_ERROR",
                "Taiwanese TTS backend failed",
            )

        elapsed_ms = round((time.perf_counter() - started) * 1000)
        return Response(
            content=result.audio,
            media_type="audio/mpeg",
            headers={
                "X-Taigi-Han": result.han_header,
                "X-Taigi-Romanization": result.romanization_header,
                "X-Inference-Ms": str(elapsed_ms),
            },
        )

    return app


def _default_engine_factory(config):
    from .engine import FasterWhisperEngine

    return FasterWhisperEngine(config)


def _offline_mode_enabled() -> bool:
    return os.getenv("HF_HUB_OFFLINE", "").strip().upper() in {
        "1",
        "ON",
        "YES",
        "TRUE",
    }
