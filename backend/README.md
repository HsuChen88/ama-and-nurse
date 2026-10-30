# Backend mock API

Phase 1 FastAPI backend for the Taiwanese Hokkien ↔ Indonesian translation PWA.
The current providers are deterministic mocks; their interfaces are ready to be
replaced by real ASR, translation, and TTS providers in later phases.

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

## Configuration

All provider selectors currently accept only `mock`:

- `ASR_NAN_PROVIDER`, `ASR_ID_PROVIDER`
- `TRANSLATE_PROVIDER`
- `TTS_ID_PROVIDER`, `TTS_NAN_PROVIDER`
- `AUDIO_TTL_SECONDS` (default: `3600`)
- `CORS_ORIGINS` (default: `http://localhost:5173`)
- `FFMPEG_BINARY`, `FFPROBE_BINARY`

Uploaded recordings are capped at 10 MB and normalized to 16 kHz mono PCM WAV.
Generated audio is held in process memory and disappears on restart or TTL expiry.
