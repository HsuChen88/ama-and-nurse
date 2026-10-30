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
- `TRANSLATION_GLOSSARY`: glossary JSON path, defaults to `glossary.json`
- `PROVIDER_WARMUP`: warm Google providers during app startup, default `true`
- `TTS_ID_VOICE`: defaults to the Indonesian female voice
  `id-ID-Chirp3-HD-Pulcherrima`
- `TTS_ID_SPEAKING_RATE`: defaults to `0.9`

Translation uses Cloud Translation v3 at `global` and reads the project ID from
the Translation service-account credentials. TTS returns MP3 (`audio/mpeg`). If
the configured voice rejects speaking-rate control, synthesis is retried once at
the voice's default rate.

When `PROVIDER_WARMUP=true`, application startup translates `Hai` and synthesizes
the same short Indonesian word once to avoid first-request cold-start latency.
Each warm-up failure is logged as a warning and does not prevent startup. Mock
providers are never warmed. Set it to `false` in tests or environments where the
startup API calls are not desired.

#### Translation glossary

The backend glossary protects family-specific terms before sending HTML to
Google Translation. It is applied only to the Google provider; mock translations
remain unchanged. The bundled `glossary.json` starts with:

```json
{
  "entries": [
    {
      "id": ["Nenek"],
      "zh-TW": ["阿嬤", "阿媽", "阿罵"]
    }
  ]
}
```

Each entry maps equivalent terms across languages. The first value for each
language is the canonical target spelling; later values are accepted source
aliases. To add a term, append another object under `entries`, with at least two
language keys and a non-empty list for each language. Indonesian matching is
case-insensitive and respects word boundaries. Chinese aliases are matched
without word-boundary requirements.

Source text is HTML-escaped before protected terms are wrapped in
`<span translate="no">`. The returned span tags are removed and HTML entities
are decoded before the translation is returned to the API pipeline.

Do not commit service-account JSON or tokens. The example paths under
`~/.config/ama-and-nurse/` are outside this repository.

### General settings

- `AUDIO_TTL_SECONDS` (default: `3600`)
- `CORS_ORIGINS` (default: `http://localhost:5173`)
- `FFMPEG_BINARY`, `FFPROBE_BINARY`

Uploaded recordings are capped at 10 MB and normalized to 16 kHz mono PCM WAV.
Generated audio is held in process memory and disappears on restart or TTL expiry.
