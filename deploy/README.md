# Local deployment

Place the two Google service-account files outside the repository:

```text
~/.config/ama-and-nurse/gcp-translation-sa.json
~/.config/ama-and-nurse/gcp-tts-sa.json
```

Set `INFERENCE_API_TOKEN` in the shell or a local, untracked Compose `.env`, then
start the Phase 2 backend and inference services from this directory:

```sh
docker compose up --build backend inference
```

The credential files are mounted read-only. The backend reaches inference on the
private Compose network at `http://inference:8001`; inference has no published
host port. The public backend API is available at `http://localhost:8000`. The
backend uses its bundled `/app/glossary.json`; `GOOGLE_TIMEOUT_SECONDS` defaults
to 15 seconds. Google Translation and TTS are warmed once during startup by
default; set `PROVIDER_WARMUP=false` to disable this behavior. The commented
`frontend` service is a placeholder for the separately developed PWA.

## Planned external architecture

Cloudflare Tunnel will provide the only inbound path to the local deployment, so
the host does not need a public port. Cloudflare Access will authenticate approved
family members before traffic reaches the application. Routing will expose only:

- the frontend PWA;
- `/api` on this backend.

ASR, translation, and TTS provider/model endpoints will remain private and will
never be routed directly through the tunnel. Tunnel and Access configuration is
not implemented in this deployment skeleton.
