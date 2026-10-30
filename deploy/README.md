# Local deployment

Start the Phase 1 mock backend from this directory:

```sh
docker compose up --build backend
```

The API is then available at `http://localhost:8000`. The commented `frontend`
service in `docker-compose.yml` is a placeholder for the separately developed PWA.

## Planned external architecture

Cloudflare Tunnel will provide the only inbound path to the local deployment, so
the host does not need a public port. Cloudflare Access will authenticate approved
family members before traffic reaches the application. Routing will expose only:

- the frontend PWA;
- `/api` on this backend.

ASR, translation, and TTS provider/model endpoints will remain private and will
never be routed directly through the tunnel. Tunnel and Access configuration is
intentionally deferred beyond Phase 1.
