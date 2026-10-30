# API Contract (v1)

前端與後端唯一的介面約定。任何修改都必須先經技術主管同意。

## 角色與語言

| speaker     | 說話者 | 辨識語言 (source) | 輸出語言 (target) |
| ----------- | ------ | ----------------- | ----------------- |
| `ama`       | 阿罵   | `nan-TW`（台語，ASR 輸出中文字） | `id`（印尼語） |
| `caregiver` | 看護   | `id`（印尼語）    | `nan-TW`（台語語音；文字為中文） |

## `POST /api/translate`

`multipart/form-data`

| 欄位      | 型別   | 說明 |
| --------- | ------ | ---- |
| `audio`   | file   | 瀏覽器 MediaRecorder 原始錄音（webm/opus、mp4/aac、ogg 等皆可，後端以 FFmpeg 統一轉 16 kHz mono WAV） |
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
  "audio_url": "/api/audio/01J...",
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

## `GET /api/audio/{id}`

回傳合成語音位元組，`Content-Type` 等於 `audio_mime`。音檔僅暫存（預設 1 小時），找不到回 404 + `{"error":{"code":"NOT_FOUND",...}}`。

## `GET /api/health`

`{"status":"ok","providers":{"asr_nan":"mock","asr_id":"mock","translate":"mock","tts_id":"mock","tts_nan":"mock"}}`
