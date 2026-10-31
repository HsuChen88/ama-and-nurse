# API Contract (v1.2)

前端與後端唯一的介面約定。任何修改都必須先經技術主管同意。

> v1.1（2026-10-31）：後端改由 Cloudflare Worker 實作。`audio_url` 可以是 `data:` URL（Worker 直接內嵌合成語音）；`GET /api/audio/{id}` 改為選配。前端行為不變。

> v1.2（2026-10-31）：新增裝置啟用（邀請碼）。`/api/translate` 需要已啟用的裝置，否則回 401 `NOT_ACTIVATED`；新增 `/api/session`、`/api/activate` 與 `/join/{code}`。

## 裝置啟用（邀請碼）

使用者不需登入。家人在共用手機上開啟邀請連結或輸入邀請碼一次，該裝置即取得一年效期的授權 cookie。

- 邀請碼：8 碼，字元集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除易混淆的 0/O/1/I），顯示為 `ABCD-EFGH`，輸入時不分大小寫、忽略連字號與空白。每個邀請碼可啟用多台裝置，可隨時撤銷（撤銷後已啟用的裝置也失效）。
- 授權 cookie：`ama_device`，HttpOnly、Secure、SameSite=Lax、Path=/、Max-Age 一年；內容為伺服器簽章（HMAC-SHA256）的 `{invite_id, iat, exp}`。剩餘效期少於 30 天時，回應中自動換發新 cookie。

### `GET /api/session`

`{"activated": true}` 或 `{"activated": false}`（永遠 200）。

### `POST /api/activate`

`application/json`：`{"code": "ABCD-EFGH"}` → 200 `{"activated": true}` 並設定 cookie。錯誤：422 `INVALID_CODE`（格式錯誤、不存在或已撤銷）。

### `GET /join/{code}`

邀請連結。有效時設定 cookie 並 302 轉址到 `/`；無效時 302 轉址到 `/?invite=invalid`。

## 角色與語言

| speaker     | 說話者 | 辨識語言 (source) | 輸出語言 (target) |
| ----------- | ------ | ----------------- | ----------------- |
| `ama`       | 阿罵   | `nan-TW`（台語，ASR 輸出中文字） | `id`（印尼語） |
| `caregiver` | 看護   | `id`（印尼語）    | `nan-TW`（台語語音；文字為中文） |

## `POST /api/translate`

`multipart/form-data`

| 欄位      | 型別   | 說明 |
| --------- | ------ | ---- |
| `audio`   | file   | 瀏覽器 MediaRecorder 原始錄音（webm/opus、mp4/aac、ogg 等皆可；解碼與正規化由後端或 inference 負責），上限 10 MB |
| `speaker` | string | `ama` 或 `caregiver` |

錄音長度限制：0.5–30 秒。

### 200 回應

```json
{
  "id": "01J...",
  "speaker": "ama",
  "source_lang": "nan-TW",
  "target_lang": "id",
  "source_text": "你今天有吃藥無？",
  "translated_text": "Apakah hari ini sudah minum obat?",
  "audio_url": "data:audio/mpeg;base64,SUQzBAAAAA...",
  "audio_mime": "audio/mpeg",
  "timings_ms": { "asr": 820, "translate": 140, "tts": 390, "total": 1400 }
}
```

### 錯誤回應（4xx / 5xx）

```json
{ "error": { "code": "AUDIO_TOO_SHORT", "message": "human readable" } }
```

| code               | HTTP | 情境 |
| ------------------ | ---- | ---- |
| `NOT_ACTIVATED`    | 401  | 裝置尚未啟用或授權已失效／撤銷 |
| `INVALID_SPEAKER`  | 422  | speaker 不是 `ama` / `caregiver` |
| `INVALID_AUDIO`    | 422  | 缺檔或 FFmpeg 無法解碼 |
| `AUDIO_TOO_SHORT`  | 422  | < 0.5 秒 |
| `AUDIO_TOO_LONG`   | 422  | > 30 秒 |
| `ASR_EMPTY`        | 422  | 辨識不到任何語音 |
| `UPSTREAM_ERROR`   | 502  | ASR / 翻譯 / TTS 供應者失敗 |

`audio_url` 可為相對路徑（`/api/audio/{id}`）、絕對 URL 或 `data:` URL；前端一律直接當作 `<audio>` 的 src 使用。

## `GET /api/audio/{id}`（選配）

僅在 `audio_url` 指向此端點的實作中提供。回傳合成語音位元組，`Content-Type` 等於 `audio_mime`。音檔僅暫存（預設 1 小時），找不到回 404 + `{"error":{"code":"NOT_FOUND",...}}`。

## `GET /api/health`

`{"status":"ok","providers":{"asr_nan":"remote","asr_id":"remote","translate":"google","tts_id":"google","tts_nan":"mock"}}`
