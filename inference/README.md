# Inference service

FastAPI service for self-hosted ASR. The same code runs with CTranslate2 on macOS CPU and NVIDIA CUDA. Models load on the first request for each language unless preloaded.

## Models and licenses

- `nan-TW`: [`MediaTek-Research/Breeze-ASR-26`](https://huggingface.co/MediaTek-Research/Breeze-ASR-26) is the official Apache-2.0 model. The default runtime artifact is the Apache-2.0 community conversion [`weemed/Breeze-ASR-26-ct2`](https://huggingface.co/weemed/Breeze-ASR-26-ct2), an INT8 CTranslate2 model for faster-whisper.
- `id`: OpenAI Whisper large-v3-turbo is MIT licensed. The default `mobiuslabsgmbh/faster-whisper-large-v3-turbo` identifier is faster-whisper's built-in CTranslate2 mapping and currently redirects to [`dropbox-dash/faster-whisper-large-v3-turbo`](https://huggingface.co/dropbox-dash/faster-whisper-large-v3-turbo), also MIT licensed.

The Breeze model transcribes spoken Taiwanese Hokkien into Mandarin Chinese characters. Both model repository IDs and the CTranslate2 compute type can be overridden in the environment.

## Local setup

Requires Python 3.12, `uv`, and FFmpeg for preparing audio.

```bash
cd inference
cp .env.example .env
uv sync
INFERENCE_API_TOKEN=local-secret uv run uvicorn inference_service.app:create_app --factory --port 8001
```

CPU defaults to `int8`; CUDA defaults to `float16`. `INFERENCE_DEVICE=auto` detects CUDA and otherwise uses CPU. To load models during startup instead of the first request:

```bash
INFERENCE_API_TOKEN=local-secret INFERENCE_PRELOAD=nan-TW,id \
  uv run uvicorn inference_service.app:create_app --factory --port 8001
```

The process deliberately refuses to start when `INFERENCE_API_TOKEN` is empty.

## Smoke request

The WAV must be readable, uncompressed, mono, and 16 kHz.

```bash
uv run python scripts/smoke.py sample.wav \
  --url http://127.0.0.1:8001 \
  --token local-secret \
  --language nan-TW
```

For a Cloudflare Access protected hostname, also pass `--cf-access-client-id` and `--cf-access-client-secret`.

## Tests

Unit tests use a fake engine and never download model weights:

```bash
uv run pytest
```

The optional real-model test is excluded by default:

```bash
MODEL_SMOKE_WAV=sample.wav MODEL_SMOKE_LANGUAGE=id \
  uv run pytest -m model
```

## GPU image

The Docker image uses the NVIDIA CUDA 12 / cuDNN runtime required by current CTranslate2 builds:

```bash
docker build -t ama-inference:latest inference
docker run --rm --gpus all -p 8001:8001 \
  -e INFERENCE_API_TOKEN=replace-me \
  -v ama-huggingface-cache:/root/.cache/huggingface \
  ama-inference:latest
```
