import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from backend.audio import AudioPreprocessor
from backend.config import Settings, get_settings
from backend.errors import ApiError, ProviderError
from backend.pipeline import TranslationPipeline
from backend.providers import build_providers
from backend.storage import AudioStore

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024
logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    providers = build_providers(settings)
    store = AudioStore(settings.audio_ttl_seconds)
    pipeline = TranslationPipeline(
        AudioPreprocessor(settings.ffmpeg_binary, settings.ffprobe_binary),
        providers.asr,
        providers.translate,
        providers.tts,
        store,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app
        yield
        providers.close()

    app = FastAPI(
        title="Ama's Translator API", version="1.0.0", lifespan=lifespan
    )
    app.state.pipeline = pipeline
    app.state.audio_store = store
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        del request
        return error_response(exc.code, exc.message, exc.status_code)

    @app.exception_handler(ProviderError)
    async def provider_error_handler(request: Request, exc: ProviderError) -> JSONResponse:
        del request
        logger.warning("Translation provider failed: %s", type(exc.__cause__).__name__)
        return error_response("UPSTREAM_ERROR", "Translation service is unavailable", 502)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del request, exc
        return error_response("INVALID_AUDIO", "Invalid multipart form data", 422)

    @app.get("/api/health")
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "providers": {
                "asr_nan": settings.asr_nan_provider,
                "asr_id": settings.asr_id_provider,
                "translate": settings.translate_provider,
                "tts_id": settings.tts_id_provider,
                "tts_nan": settings.tts_nan_provider,
            },
        }

    @app.post("/api/translate")
    async def translate_audio(
        audio: UploadFile | None = File(default=None),
        speaker: str | None = Form(default=None),
    ) -> dict[str, object]:
        if speaker not in {"ama", "caregiver"}:
            raise ApiError("INVALID_SPEAKER", "Speaker must be ama or caregiver", 422)
        if audio is None:
            raise ApiError("INVALID_AUDIO", "Audio file is required", 422)
        audio_bytes = await read_limited(audio)
        result = await run_in_threadpool(app.state.pipeline.run, audio_bytes, speaker)
        return result.to_dict()

    @app.get("/api/audio/{audio_id}")
    def get_audio(audio_id: str) -> Response:
        stored = app.state.audio_store.get(audio_id)
        if stored is None:
            raise ApiError("NOT_FOUND", "Audio was not found or has expired", 404)
        return Response(content=stored.content, media_type=stored.mime)

    return app


async def read_limited(upload: UploadFile) -> bytes:
    content = bytearray()
    while chunk := await upload.read(READ_CHUNK_BYTES):
        content.extend(chunk)
        if len(content) > MAX_UPLOAD_BYTES:
            raise ApiError("INVALID_AUDIO", "Audio file must not exceed 10 MB", 422)
    return bytes(content)


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


app = create_app()
