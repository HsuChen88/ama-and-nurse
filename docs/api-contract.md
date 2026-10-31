# API Contract (v1.1)

前端與後端唯一的介面約定。任何修改都必須先經技術主管同意。

> v1.1（2026-10-31）：後端改由 Cloudflare Worker 實作。`audio_url` 可以是 `data:` URL（Worker 直接內嵌合成語音）；`GET /api/audio/{id}` 改為選配。前端行為不變。

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
