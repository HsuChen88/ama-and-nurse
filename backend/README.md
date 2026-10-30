# Backend API

FastAPI backend for the Taiwanese Hokkien ↔ Indonesian translation PWA. It can
use deterministic mock providers for local development or remote/Google Cloud
providers for the Phase 2 translation pipeline.

## Requirements

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- FFmpeg and ffprobe available on `PATH`

## Run locally

```sh
cp .env.example .env
uv sync
uv run uvicorn backend.main:app --reload
```

The API listens at `http://127.0.0.1:8000`. The development CORS origin defaults
to `http://localhost:5173`. `CORS_ORIGINS` accepts a comma-separated list.

## Test

```sh
uv run pytest
```

The integration tests invoke the system FFmpeg and ffprobe executables.

## Provider configuration

Mock mode is the default and requires no credentials:

- `ASR_NAN_PROVIDER`, `ASR_ID_PROVIDER`: `mock` or `remote`
- `TRANSLATE_PROVIDER`: `mock` or `google`
- `TTS_ID_PROVIDER`: `mock` or `google`
- `TTS_NAN_PROVIDER`: `mock` only; Taiwanese Hokkien TTS remains undecided

To run the real Phase 2 path, set:

```dotenv
ASR_NAN_PROVIDER=remote
ASR_ID_PROVIDER=remote
TRANSLATE_PROVIDER=google
TTS_ID_PROVIDER=google
TTS_NAN_PROVIDER=mock
```

### Remote ASR

- `INFERENCE_BASE_URL`: inference service base URL
- `INFERENCE_API_TOKEN`: required Bearer token
- `INFERENCE_CF_ACCESS_CLIENT_ID`, `INFERENCE_CF_ACCESS_CLIENT_SECRET`: optional
  Cloudflare Access service-token headers
- `INFERENCE_TIMEOUT_SECONDS`: request timeout, default `120`

The backend reuses one HTTP client for both ASR languages. The API token and
recognized text are not written to logs.

### Google Cloud Translation and TTS

- `GOOGLE_TRANSLATE_CREDENTIALS`: Translation service-account JSON path
- `GOOGLE_TTS_CREDENTIALS`: TTS service-account JSON path
- `GOOGLE_TIMEOUT_SECONDS`: per-request timeout, default `15`
- `TTS_ID_VOICE`: defaults to the Indonesian female voice
  `id-ID-Chirp3-HD-Pulcherrima`
- `TTS_ID_SPEAKING_RATE`: defaults to `0.9`

Translation uses Cloud Translation v3 at `global` and reads the project ID from
the Translation service-account credentials. TTS returns MP3 (`audio/mpeg`). If
the configured voice rejects speaking-rate control, synthesis is retried once at
the voice's default rate.

Do not commit service-account JSON or tokens. The example paths under
`~/.config/ama-and-nurse/` are outside this repository.

### General settings

- `AUDIO_TTL_SECONDS` (default: `3600`)
- `CORS_ORIGINS` (default: `http://localhost:5173`)
- `FFMPEG_BINARY`, `FFPROBE_BINARY`

Uploaded recordings are capped at 10 MB and normalized to 16 kHz mono PCM WAV.
Generated audio is held in process memory and disappears on restart or TTL expiry.
