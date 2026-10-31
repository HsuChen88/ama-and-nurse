# Internal Taiwanese TTS service

This container keeps Taigi-Llama-2-7B and GPT-SoVITS-TW resident on titan.
It is an internal implementation detail behind inference `POST /v1/tts`; do
not publish port 8002.

## Image and offline build

The Dockerfile defaults to the already validated PoC image:

```sh
taigi-tts-taigi-tts-poc:latest
```

The derived image only copies Python source. Once the base image exists, its
build uses no package index and requires no outbound network. If it is absent,
build the PoC during an approved network window first:

```sh
cd poc/taigi-tts
docker compose build taigi-tts-poc
docker image inspect taigi-tts-taigi-tts-poc:latest
```

The external `taigi-poc-models` volume from the PoC must also exist. It supplies
Taigi-Llama, GPT-SoVITS-TW, BERT, HuBERT, speaker verification weights, and the
pinned KaedeTai source metadata.

## Runtime behavior

Startup converts the trusted S2 training checkpoint once into
`/cache/models/s2_r4_e15_infer.pth`, loads Taigi-Llama and GPT-SoVITS, performs
one warm-up synthesis, and logs CUDA allocated/reserved bytes. Both models then
remain resident.

Only one synthesis runs at a time. `TAIGI_TTS_MAX_QUEUE` controls the number of
waiting requests; requests beyond it receive HTTP 503 `BUSY`. Completed audio
uses an LRU cache whose key includes the normalized Chinese text, reference WAV
digest, reference transcript, model version, and Llama dtype.

Relevant settings:

- `LLAMA_DTYPE=fp16|int8` (default `fp16`).
- `TAIGI_TTS_MAX_QUEUE` (default `2`).
- `TAIGI_TTS_CACHE_MAX_ITEMS` (default `128`; `0` disables eviction).
- `TAIGI_TTS_MODEL_VERSION` for explicit cache invalidation.
- `TW_TTS_REF` and `TW_TTS_REF_TEXT` override the starter reference.

The current validated PoC image does not install `bitsandbytes`. If `int8` is
selected without it, startup fails with an explicit message. Install
`bitsandbytes` into an approved PoC base image only during an outbound network
window, then rebuild this derived image offline. `fp16` needs no new package.

Normal runtime sets Hugging Face, Transformers, and Datasets offline flags.

## Local mock tests

These tests never import torch or load model checkpoints:

```sh
cd taigi-tts
uv sync --all-groups
uv run pytest
```

GPU startup and real synthesis must be verified on titan.
