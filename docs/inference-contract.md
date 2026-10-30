# Inference Service Contract (v1)

backend ↔ inference 服務的唯一介面。inference 服務負責所有自架模型推論（ASR，未來的 TTS），測試階段跑在 Mac CPU，正式部署在遠端 GPU server，backend 透過外網呼叫。任何修改都必須先經技術主管同意。

## 部署拓撲

```
手機 PWA ──HTTPS──> Cloudflare (Access: 家人) ──Tunnel──> frontend + backend
backend ──HTTPS──> Cloudflare (Access: service token) ──Tunnel──> GPU server: inference
```

- inference 永遠不直接暴露在公網；外網只經 Cloudflare Tunnel，且由 Cloudflare Access service token 保護。
- 服務本身另外驗證 `Authorization: Bearer <INFERENCE_API_TOKEN>`（雙層防護；本機開發也必須帶）。
- backend 呼叫時帶 `CF-Access-Client-Id` / `CF-Access-Client-Secret`（若有設定）與 Bearer token。

## 認證

所有 `/v1/*` 端點（health 除外）需要 `Authorization: Bearer <token>`，錯誤回 401 `UNAUTHORIZED`。

## `POST /v1/asr`

`multipart/form-data`

| 欄位       | 型別   | 說明 |
| ---------- | ------ | ---- |
| `audio`    | file   | 16 kHz mono PCM WAV（backend 已用 FFmpeg 正規化） |
| `language` | string | `nan-TW`（台語 → 輸出繁體中文，Breeze ASR 26）或 `id`（印尼語 → 輸出印尼文） |

### 200

```json
{ "text": "你今天有吃藥無？", "language": "nan-TW", "model": "breeze-asr-26", "duration_ms": 2310, "inference_ms": 6120 }
```

辨識不到語音時 `text` 為空字串（不視為錯誤，由 backend 轉成 `ASR_EMPTY`）。

## `POST /v1/tts`（保留，Phase 3）

`application/json`：`{ "text": "...", "language": "nan-TW" }` → 回傳音訊位元組，`Content-Type` 為音訊 mime。v1 尚未實作，回 501 `NOT_IMPLEMENTED`。

## `GET /v1/health`

不需認證。`{"status":"ok","device":"cpu","models":{"nan-TW":"breeze-asr-26","id":"whisper-large-v3-turbo"},"loaded":["nan-TW"]}`

## 錯誤格式

`{ "error": { "code": "...", "message": "..." } }`

| code               | HTTP |
| ------------------ | ---- |
| `UNAUTHORIZED`     | 401  |
| `INVALID_LANGUAGE` | 422  |
| `INVALID_AUDIO`    | 422  |
| `MODEL_ERROR`      | 500  |
| `NOT_IMPLEMENTED`  | 501  |
| `BUSY`             | 503  |
