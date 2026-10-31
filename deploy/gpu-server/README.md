# GPU inference server deployment

This Compose stack runs the inference service on one NVIDIA GPU and exposes it only through a Cloudflare Tunnel sidecar. Port 8001 is not published on the host.

## Prerequisites

- Linux host with a supported NVIDIA driver
- Docker Engine, Compose v2, and NVIDIA Container Toolkit
- A Cloudflare-managed domain and Zero Trust account

Verify GPU container access first:

```bash
docker run --rm --gpus all nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 nvidia-smi
```

## Cloudflare Tunnel and Access

1. In Cloudflare Zero Trust, create a remotely managed Tunnel for this GPU server and copy its tunnel token.
2. Add a public hostname such as `inference.example.com`; set its service to `HTTP` and URL to `inference:8001` (the Compose service name, not localhost).
3. Under Access > Applications, create a self-hosted application for that exact inference hostname.
4. Add an Access policy that permits a service token, then create a service token for the backend. Store its Client ID and Client Secret only in the backend's secret environment.
5. Copy `.env.example` to `.env`, generate a separate long random `INFERENCE_API_TOKEN`, and set the Tunnel token. Keep `HF_HUB_OFFLINE=1` for normal operation.

## First model download

The inference container is offline by default and refuses to start when either configured model is absent from its persistent cache. During the initial deployment, temporarily open titan's approved outbound network window and start only inference with offline mode disabled:

```bash
cd deploy/gpu-server
cp .env.example .env
HF_HUB_OFFLINE=0 INFERENCE_PRELOAD=nan-TW,id \
  docker compose up --build inference
```

The default `INFERENCE_PRELOAD=nan-TW,id` makes startup download and load both models. Wait until Uvicorn reports that application startup is complete, then stop the foreground process with `Ctrl-C`. Close titan's outbound network window and start the complete stack in offline mode:

```bash
docker compose up -d
docker compose logs -f inference cloudflared
```

Confirm the rendered configuration reports `HF_HUB_OFFLINE: "1"`. Do not leave `.env` set to `0` after the download window.

## Updating model weights

When changing `ASR_NAN_MODEL` or `ASR_ID_MODEL`, repeat the controlled download procedure:

1. Open titan's approved outbound network window.
2. Run `HF_HUB_OFFLINE=0 INFERENCE_PRELOAD=nan-TW,id docker compose up --build inference` and wait for startup to complete.
3. Stop it, close outbound access, and run `docker compose up -d` with offline mode restored.

If the model is missing while offline, startup fails with a message directing the operator to this one-time online procedure instead of attempting a network request.

Cloudflare Access supplies the outer authorization layer. The inference service's Bearer token remains required as a second, independent layer.

## Backend configuration

Configure these values on the backend; do not put them in source control:

```dotenv
INFERENCE_BASE_URL=https://inference.example.com
INFERENCE_CF_ACCESS_CLIENT_ID=replace-with-service-token-client-id
INFERENCE_CF_ACCESS_CLIENT_SECRET=replace-with-service-token-client-secret
INFERENCE_API_TOKEN=the-same-independent-bearer-token-as-the-gpu-server
```

The backend sends the Cloudflare values as `CF-Access-Client-Id` and `CF-Access-Client-Secret`, and the inference token as `Authorization: Bearer ...`.

## Operations

Model downloads persist in the `huggingface-cache` named volume. Normal restarts use only that volume and do not require Hugging Face access. Check the public health endpoint without application-level credentials:

```bash
curl https://inference.example.com/v1/health
```

Access may still require the service-token headers depending on the Cloudflare policy even though the application-level health route itself is unauthenticated.
