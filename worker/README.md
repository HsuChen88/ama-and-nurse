# Cloudflare Worker

`ama-translator` 是正式 API 後端與前端靜態資產入口。App 不要求使用者登入；
家人以邀請碼在共用手機啟用一次後，一年內可直接使用。`/api/*` 與 `/join/*`
由 Worker 執行，其餘路徑由 `../frontend/dist` 提供並使用 SPA fallback。

翻譯流程：瀏覽器原始錄音 → titan inference ASR → Google Translation v3。
`ama` 方向使用 Google Cloud 印尼語 TTS；`caregiver` 方向先從 D1 取得或以
Taigi AI model2 產生台文，再從 R2 取得或以 Taigi TTS v3 產生 WAV。Taigi
逾時、錯誤或額度暫停時，改以 inference `/v1/tts` 的 Taigi-Llama +
GPT-SoVITS-TW 產生語音；備援也失敗才回傳短 WAV 提示音。備援音訊不寫入
R2，也不會以華語語音替代台語。

## 本機設定

需要 Node.js 22 與 pnpm 11：

```sh
cd worker
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

`.dev.vars.example` 只有假值，可用來確認 health 與靜態首頁。呼叫翻譯 API
需要可用的 inference、Google 與 Taigi 憑證；本機使用 D1／R2 前也要先套用
本機 migration：

```sh
pnpm wrangler d1 migrations apply ama-translator-cache --local
```

本機 KV 由 Wrangler 自動建立。可用下列指令加入測試邀請碼：

```sh
pnpm wrangler kv key put invite:ABCDEFGH \
  '{"label":"Local phone","created_at":"2026-10-31T00:00:00Z"}' \
  --binding INVITES --local
```

`wrangler.jsonc` 內含非機密 vars：

- `INFERENCE_BASE_URL`
- `TTS_ID_VOICE`
- `TTS_ID_SPEAKING_RATE`
- `INFERENCE_TIMEOUT_MS`
- `INFERENCE_TTS_TIMEOUT_MS`
- `GOOGLE_TIMEOUT_MS`
- `TAIGI_TRANSLATE_TIMEOUT_MS`（預設 5000）
- `TAIGI_TTS_TIMEOUT_MS`（預設 8000）
- `TAIGI_TTS_MODEL`（`model7`）
- `TAIGI_TTS_VOICE`（`normal_f2`）
- `TAIGI_TTS_SPEED`（`1.0`）

以下必須設為 Worker secrets，不可提交到 Git：

- `INFERENCE_API_TOKEN`
- `INFERENCE_CF_ACCESS_CLIENT_ID`
- `INFERENCE_CF_ACCESS_CLIENT_SECRET`
- `GOOGLE_TRANSLATE_SA_JSON`（service account JSON 全文）
- `GOOGLE_TTS_SA_JSON`（service account JSON 全文）
- `DEVICE_SIGNING_KEY`（裝置 cookie 的 HMAC-SHA256 金鑰）
- `TAIGI_TRANSLATE_API_KEY`
- `TAIGI_TTS_API_KEY`

由具部署權限者逐一設定，例如：

```sh
pnpm wrangler secret put INFERENCE_API_TOKEN
pnpm wrangler secret put INFERENCE_CF_ACCESS_CLIENT_ID
pnpm wrangler secret put INFERENCE_CF_ACCESS_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_TRANSLATE_SA_JSON
pnpm wrangler secret put GOOGLE_TTS_SA_JSON
pnpm wrangler secret put DEVICE_SIGNING_KEY
pnpm wrangler secret put TAIGI_TRANSLATE_API_KEY
pnpm wrangler secret put TAIGI_TTS_API_KEY
```

可在 Mac 產生 signing key，再將輸出貼入 secret 指令：

```sh
openssl rand -base64 32
```

## 邀請碼 KV 與管理

由具部署權限者建立 KV namespace（本專案不會代為執行）：

```sh
pnpm wrangler kv namespace create INVITES
```

把指令輸出的 namespace ID 填入 `wrangler.jsonc` 中 `INVITES` binding 的
`REPLACE_WITH_INVITES_KV_NAMESPACE_ID`。KV key 為 `invite:<8 碼 CODE>`；value
為包含 `label` 與 `created_at` 的 JSON。刪除 key 會立刻撤銷該邀請及所有已啟用裝置。

技術主管可在 Mac 使用管理工具；這些指令固定操作 remote KV：

```sh
pnpm invite create "阿罵共用手機"
pnpm invite list
pnpm invite revoke ABCD-EFGH
```

`create` 會印出 `ABCD-EFGH`、完整邀請連結與終端機 QR code；`list` 只顯示
遮罩後的邀請碼、標籤與建立時間。

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

## 手機啟用流程

- iPhone：先由 Safari 將 App 加入主畫面，再從主畫面開啟 App，於 App 內輸入一次
  邀請碼。iOS 的主畫面 App 與 Safari cookie 可能隔離，因此不建議只在 Safari
  開邀請連結後就直接使用主畫面 App。
- Android：建議同樣先加入主畫面，再從主畫面 App 輸入一次邀請碼。也可直接掃描
  QR code／開啟邀請連結完成瀏覽器啟用。
- 邀請撤銷或一年效期結束後，App 會回到雙語啟用畫面，不需要登入或人機驗證。

App 網域不使用 Cloudflare Access。`inference.ama-ama.com` 仍使用 Access service
token，Client ID / Client Secret 存於 Worker secrets。

`/cdn-cgi/*`、`/api/*` 與 `/join/*` 都排除於 PWA navigation fallback，避免
Service Worker 攔截 Cloudflare 系統路徑、API 回應與邀請連結。

## D1 翻譯快取與 R2 音訊快取

由具部署權限者建立正式資源（本專案不會代為執行）：

```sh
pnpm wrangler d1 create ama-translator-cache
pnpm wrangler r2 bucket create ama-translator-audio
```

把 D1 建立結果的 database ID 填入 `wrangler.jsonc` 中 `CACHE_DB` binding 的
`REPLACE_WITH_CACHE_DB_ID`。R2 binding 使用 bucket name `ama-translator-audio`，
R2 設定不需要資源 ID。正式部署前套用 migration：

```sh
pnpm wrangler d1 migrations apply ama-translator-cache --remote
```

`translation_cache` 的 key 是正規化華語的 SHA-256。正規化採保守規則：Unicode
NFKC、移除首尾空白、連續空白壓成一個空白，並將等價全形／半形標點統一；
不採「移除所有空白」，以免把原本不同的詞界合併，且問號、句號等所有標點均
保留。R2 key 是台文、model、voice、speed 與 TTS 版本的 SHA-256，內容直接保存
供應商回傳的 WAV，避免在 Worker 內做高成本轉碼。`GET /api/audio/{key}` 會重新
驗證裝置 cookie，並以 private immutable 長效快取回傳。

`usage_log` 只保存時間、華語原文、正規化後 key、台文、翻譯／TTS 命中狀態與
來源；不保存費用或延遲。可由技術主管在 Mac 執行只讀統計查詢：

```sh
pnpm cache-stats
```

此工具固定使用 `wrangler d1 execute ama-translator-cache --remote`，列出總請求數、
翻譯與 TTS 命中率、來源分布，以及最常出現的前 20 組華語／台文。

Taigi 翻譯或 TTS 回覆 403／429 時，該 Worker isolate 會暫停呼叫 Taigi 30 分鐘，
期間直接走 inference 備援；旗標到期後自動重試 Taigi。
