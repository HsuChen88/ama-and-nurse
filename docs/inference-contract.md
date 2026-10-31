# Inference Service Contract (v3)

API 後端（Cloudflare Worker）↔ inference 服務的唯一介面。inference 服務負責所有自架模型推論（ASR、台語 TTS），部署在 GPU server（titan）。任何修改都必須先經技術主管同意。

> v3（2026-11-01）：實作 `POST /v1/tts`（台語）。inference 將請求轉接給 titan 內部的 `taigi-tts` 容器（不對外暴露）；對外認證與錯誤格式不變。

> v2（2026-10-31）：`/v1/asr` 改收瀏覽器原始錄音，解碼、正規化與長度驗證由 inference 負責（呼叫端不再需要 FFmpeg）；新增 `AUDIO_TOO_SHORT` / `AUDIO_TOO_LONG` / `PAYLOAD_TOO_LARGE`。16 kHz mono WAV 仍可接受。

## 部署拓撲

```
手機 PWA ──HTTPS──> Cloudflare Access（家人）──> Worker（app.ama-ama.com：前端靜態檔 + /api）
Worker ──HTTPS──> Cloudflare Access（service token）──Tunnel──> titan: inference
```

- inference 永遠不直接暴露在公網；外網只經 Cloudflare Tunnel，且由 Cloudflare Access service token 保護。
- 服務本身另外驗證 `Authorization: Bearer <INFERENCE_API_TOKEN>`（雙層防護；本機開發也必須帶）。
- 呼叫端帶 `CF-Access-Client-Id` / `CF-Access-Client-Secret`（若有設定）與 Bearer token。
- titan 執行期不可依賴外網：模型只在建置／首次下載時連網，之後以離線模式（`HF_HUB_OFFLINE=1`）載入。

## 認證

所有 `/v1/*` 端點（health 除外）需要 `Authorization: Bearer <token>`，錯誤回 401 `UNAUTHORIZED`。

## `POST /v1/asr`

`multipart/form-data`

| 欄位       | 型別   | 說明 |
| ---------- | ------ | ---- |
| `audio`    | file   | 瀏覽器 MediaRecorder 原始錄音（webm/opus、mp4/aac、ogg/opus）或 16 kHz mono WAV；上限 10 MB。服務端解碼並重取樣為 16 kHz mono 後辨識 |
| `language` | string | `nan-TW`（台語 → 輸出繁體中文，Breeze ASR 26）或 `id`（印尼語 → 輸出印尼文） |

錄音長度限制：0.5–30 秒（以解碼後的實際長度計）。

### 200

```json
{ "text": "你今天有吃藥無？", "language": "nan-TW", "model": "breeze-asr-26", "duration_ms": 2310, "inference_ms": 612 }
```

辨識不到語音時 `text` 為空字串（不視為錯誤，由呼叫端轉成 `ASR_EMPTY`）。

## `POST /v1/tts`

`application/json`：`{ "text": "繁體華語句子", "language": "nan-TW" }`

- `text` 為**繁體華語**（Worker 端 Google 翻譯 id → zh-TW 的結果），長度 1–200 字；台語轉寫（Taigi-Llama → POJ）由服務端負責。
- 只支援 `language: "nan-TW"`，其他值回 422 `INVALID_LANGUAGE`。

### 200

回傳 `audio/mpeg` 位元組，並附下列標頭（值為 UTF-8 percent-encoding）：

| 標頭 | 說明 |
| ---- | ---- |
| `X-Taigi-Han` | 台語漢字（Taigi-Llama 輸出，僅供顯示／除錯） |
| `X-Taigi-Romanization` | 實際送進 TTS 的 POJ |
| `X-Inference-Ms` | 服務端總耗時 |

### 錯誤

沿用下方錯誤格式；另有 422 `INVALID_TEXT`（空字串或過長）、503 `BUSY`（排隊已滿）、502 `TTS_BACKEND_ERROR`（taigi-tts 容器無回應或失敗）。

## `GET /v1/health`

不需認證。`{"status":"ok","device":"cuda","models":{"nan-TW":"breeze-asr-26","id":"whisper-large-v3-turbo"},"loaded":["nan-TW","id"]}`

## 錯誤格式

`{ "error": { "code": "...", "message": "..." } }`

| code                | HTTP | 情境 |
| ------------------- | ---- | ---- |
| `UNAUTHORIZED`      | 401  | Bearer token 錯誤或缺少 |
| `PAYLOAD_TOO_LARGE` | 413  | 音檔 > 10 MB |
| `INVALID_LANGUAGE`  | 422  | language 不是 `nan-TW` / `id` |
| `INVALID_AUDIO`     | 422  | 缺檔或無法解碼 |
| `AUDIO_TOO_SHORT`   | 422  | < 0.5 秒 |
| `AUDIO_TOO_LONG`    | 422  | > 30 秒 |
| `INVALID_TEXT`      | 422  | TTS 文字為空或超過 200 字 |
| `MODEL_ERROR`       | 500  | 推論失敗 |
| `TTS_BACKEND_ERROR` | 502  | taigi-tts 容器無回應或失敗 |
| `BUSY`              | 503  | 排隊已滿 |
