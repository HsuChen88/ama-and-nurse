# Cloudflare Worker

`ama-translator` 是正式 API 後端與前端靜態資產入口。Cloudflare Access 保護
`ama.ama-ama.com`；`/api/*` 由 Worker 執行，其餘路徑由 `../frontend/dist`
提供並使用 SPA fallback。

翻譯流程：瀏覽器原始錄音 → titan inference ASR → Google Translation v3 →
Google Cloud TTS。台語 TTS 尚未決定，`caregiver` 方向目前只回傳短 WAV 提示音，
不會用華語語音替代。

## 本機設定

需要 Node.js 22 與 pnpm 11：

```sh
cd worker
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

`.dev.vars.example` 只有假值，可用來確認 health 與靜態首頁。呼叫翻譯 API
需要可用的 inference 與 Google 憑證。

`wrangler.jsonc` 內含非機密 vars：

- `INFERENCE_BASE_URL`
- `TTS_ID_VOICE`
- `TTS_ID_SPEAKING_RATE`
- `INFERENCE_TIMEOUT_MS`
- `GOOGLE_TIMEOUT_MS`

以下必須設為 Worker secrets，不可提交到 Git：

- `INFERENCE_API_TOKEN`
- `INFERENCE_CF_ACCESS_CLIENT_ID`
- `INFERENCE_CF_ACCESS_CLIENT_SECRET`
- `GOOGLE_TRANSLATE_SA_JSON`（service account JSON 全文）
- `GOOGLE_TTS_SA_JSON`（service account JSON 全文）

由具部署權限者逐一設定，例如：

```sh
pnpm wrangler secret put INFERENCE_API_TOKEN
pnpm wrangler secret put INFERENCE_CF_ACCESS_CLIENT_ID
pnpm wrangler secret put INFERENCE_CF_ACCESS_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_TRANSLATE_SA_JSON
pnpm wrangler secret put GOOGLE_TTS_SA_JSON
```

## 測試與部署

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm deploy
```

`pnpm build` 會先建置 `../frontend`，再檢查 Worker 型別；`pnpm deploy` 會在
build 成功後執行 Wrangler 部署。部署、登入與 secret 寫入應由技術主管執行。

## Cloudflare Access

在 Zero Trust 建立保護 `ama.ama-ama.com` 的 self-hosted application，家人以
Access policy 登入。另為 `inference.ama-ama.com` 建立 service-token policy，
並把 Client ID / Client Secret 存入上述 Worker secrets。前端遇到 Access session
失效造成的登入 redirect 或非 JSON 401/403 時，會重新載入頁面以啟動登入流程。

`/cdn-cgi/*` 與 `/api/*` 都排除於 PWA navigation fallback，避免 Service Worker
攔截 Access 登入與 API 回應。
