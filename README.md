# 阿嬤的翻譯機

台語 ↔ 印尼語的手機 PWA 口譯工具。阿嬤（台語）與印尼看護共用一支手機，各自按自己的大按鈕說話；系統辨識、翻譯，並播放對方語言的語音。

- 正式網址：<https://app.ama-ama.com>（需邀請連結啟用裝置）
- 規劃與決策紀錄：[`docs/plan.md`](docs/plan.md)
- 前後端 API 契約：[`docs/api-contract.md`](docs/api-contract.md)
- 自架推論服務契約：[`docs/inference-contract.md`](docs/inference-contract.md)

## 系統架構

```mermaid
flowchart LR
    subgraph Phone["📱 共用手機"]
        PWA["PWA（React + Vite）<br/>阿嬤按鈕／看護按鈕<br/>MediaRecorder 錄音 · 再聽一次"]
        HTTPCache[("瀏覽器 HTTP 快取<br/>/api/audio/*<br/>immutable 一年")]
    end

    subgraph CF["☁️ Cloudflare（app.ama-ama.com）"]
        Assets["Static Assets<br/>frontend/dist"]
        Worker["Worker ama-translator<br/>/api/translate · /api/speech · /api/audio<br/>/api/session · /join"]
        KV[("KV INVITES<br/>邀請碼 → 裝置啟用")]
        D1[("D1 ama-translator-cache<br/>translation_cache · usage_log")]
        R2[("R2 ama-translator-audio<br/>台語 WAV 快取")]
        Access["Cloudflare Access<br/>service token"]
        Tunnel["Cloudflare Tunnel"]
    end

    subgraph Google["Google Cloud"]
        GTrans["Cloud Translation v3<br/>中文 ↔ 印尼文（含詞彙表）"]
        GTTS["Cloud Text-to-Speech<br/>印尼語 Chirp3-HD"]
    end

    subgraph Taigi["Taigi AI（learn-language.tokyo）"]
        TTrans["翻譯 model2<br/>華語 → 台文漢字"]
        TTTS["TTS v3<br/>台文 → 台語 WAV"]
    end

    subgraph Titan["🖥️ GPU server titan（TITAN RTX，平時禁止對外連線）"]
        CFD["cloudflared"]
        Inference["inference（FastAPI）<br/>/v1/asr · /v1/tts<br/>Bearer token"]
        ASRNan["Breeze ASR 26<br/>台語 → 中文字"]
        ASRId["Whisper large-v3-turbo<br/>印尼語 → 印尼文"]
        TaigiTTS["taigi-tts（備援）<br/>Taigi-Llama → POJ<br/>GPT-SoVITS-TW"]
    end

    PWA -- "HTTPS + ama_device cookie" --> Worker
    PWA -. "載入頁面" .-> Assets
    PWA <--> HTTPCache
    Worker --- KV
    Worker --- D1
    Worker --- R2
    Worker -- "REST + 服務帳戶 JWT" --> GTrans
    Worker --> GTTS
    Worker -- "x-api-key" --> TTrans
    Worker -- "x-api-key" --> TTTS
    Worker --> Access --> Tunnel --> CFD --> Inference
    Inference --> ASRNan
    Inference --> ASRId
    Inference -- "內部網路" --> TaigiTTS
```

### 元件說明

| 元件 | 位置 | 職責 |
| ---- | ---- | ---- |
| PWA | `frontend/` | 錄音、上傳、播放、對話歷史、錯誤提示；不知道底層用哪個模型 |
| Worker | `worker/` | 前端託管與唯一的 `/api`；裝置驗證、先回傳 ASR／翻譯文字，再由 `/api/speech` 編排 TTS、兩層快取與失敗備援 |
| KV `INVITES` | Cloudflare | 邀請碼（一年效期，可撤銷）；裝置以 HMAC 簽章的 `ama_device` cookie 啟用 |
| D1 `ama-translator-cache` | Cloudflare | `translation_cache`：正規化華語 → Taigi 台文；`usage_log`：每句的命中狀態與來源 |
| R2 `ama-translator-audio` | Cloudflare | Taigi 台語 WAV，鍵為 SHA-256（台文 + model + voice + speed + 版本） |
| inference | `inference/`，titan | 自架 ASR（Breeze ASR 26、Whisper）與台語 TTS 備援的轉接 |
| taigi-tts | `taigi-tts/`，titan | 備援台語 TTS：Taigi-Llama 產生 POJ，GPT-SoVITS-TW 合成 |
| Google Cloud | 外部 | 中文 ↔ 印尼文翻譯、印尼語 TTS |
| Taigi AI | 外部（付費） | 看護 → 阿嬤主路徑：華語 → 台文、台語 TTS |

## 翻譯流程

### 阿嬤 → 看護（台語 → 印尼語）

```mermaid
sequenceDiagram
    autonumber
    actor Ama as 阿嬤
    participant PWA
    participant W as Worker
    participant I as titan inference
    participant GT as Google Translation
    participant GS as Google TTS

    Ama->>PWA: 按「阿嬤」按鈕說台語
    PWA->>W: POST /api/translate（speaker=ama）
    W->>I: /v1/asr（language=nan-TW）
    I-->>W: 中文字（Breeze ASR 26）
    W->>GT: 中文 → 印尼文（詞彙表：阿嬤 → Nenek）
    GT-->>W: 印尼文
    W-->>PWA: JSON（文字 + /api/speech/{token}）
    PWA->>PWA: 立即顯示原文與印尼文
    PWA->>W: GET /api/speech/{token}
    W->>GS: 印尼語 TTS
    GS-->>W: MP3
    W-->>PWA: MP3（private, 24 小時）
    PWA->>PWA: 建立 Blob URL 並自動播放
```

### 看護 → 阿嬤（印尼語 → 台語）

```mermaid
sequenceDiagram
    autonumber
    actor Nurse as 看護
    participant PWA
    participant W as Worker
    participant I as titan inference
    participant GT as Google Translation
    participant D1
    participant R2
    participant TA as Taigi AI

    Nurse->>PWA: 按「看護」按鈕說印尼語
    PWA->>W: POST /api/translate（speaker=caregiver）
    W->>I: /v1/asr（language=id）
    I-->>W: 印尼文（Whisper）
    W->>GT: 印尼文 → 華語
    GT-->>W: 華語
    W-->>PWA: JSON（文字 + /api/speech/{token}）
    PWA->>PWA: 立即顯示原文與華語譯文
    PWA->>W: GET /api/speech/{token}
    Note over W: 正規化：NFKC、空白、半形標點轉全形<br/>（保留所有標點，問號會改變語意）
    W->>D1: 查 translation_cache
    alt 翻譯未命中
        W->>TA: 翻譯 model2（華語 → 台文）
        TA-->>W: 台文漢字
        W->>D1: 寫入 translation_cache
    end
    W->>R2: HEAD 語音鍵
    alt 語音未命中
        W->>TA: TTS v3（Idempotency-Key）
        TA-->>W: WAV
        W->>R2: PUT WAV
    end
    W-)D1: waitUntil 寫入 usage_log
    W->>R2: GET
    W-->>PWA: WAV（private, 24 小時）
    PWA->>PWA: 建立 Blob URL 並自動播放台語
```

### 失敗備援

```mermaid
flowchart TD
    Start["華語文字"] --> Paused{"Taigi 暫停中？<br/>（403／429 後 30 分鐘）"}
    Paused -- 否 --> Taigi["Taigi 翻譯 + TTS<br/>（逾時 5 秒／8 秒）"]
    Taigi -- 成功 --> Cached["從 R2 串流 WAV<br/>X-Audio-Source = taigi"]
    Taigi -- "逾時、錯誤、403／429" --> Fallback
    Paused -- 是 --> Fallback["titan /v1/tts<br/>Taigi-Llama + GPT-SoVITS-TW"]
    Fallback -- 成功 --> Inline["回傳音訊 bytes（不寫入快取）<br/>X-Audio-Source = fallback"]
    Fallback -- 失敗 --> Chime["提示音<br/>X-Audio-Source = chime"]
```

照護安全：吃藥、疼痛、跌倒等內容只做翻譯與顯示，系統不做任何自動判斷。

## 快取與成本

- 「同一句話只付一次錢」：翻譯快取在 D1，語音快取在 R2，兩層都永久保存，不做汰換。
- 前端完整取得語音後建立 Blob URL；「再聽一次」與歷史重播優先使用同一個 Blob URL，不會重複呼叫 `/api/speech` 或 Taigi。
- 查看統計：在 `worker/` 執行 `pnpm cache-stats`；或在 Cloudflare 後台 **Storage & databases → D1／R2** 瀏覽。
- R2 免費額度 10 GB（約 6 萬句以上）；建議在 Cloudflare **Notifications → Usage Based Billing** 設定 8 GB 提醒。

## 目錄結構

```
frontend/   React + Vite + TypeScript + PWA（pnpm）
worker/     正式 API 後端 + 前端託管：Cloudflare Worker（TypeScript、wrangler、pnpm）
inference/  自架模型推論服務（titan），Python 3.12 + FastAPI（uv）
taigi-tts/  備援台語 TTS 容器（titan）
backend/    Python FastAPI；本機開發參考，正式環境已由 worker/ 取代
deploy/     docker compose、cloudflared、GPU server 部署
docs/       規劃、API 契約、調研報告
poc/        概念驗證
```

## 開發與部署

```sh
# 前端
pnpm --dir frontend install && pnpm --dir frontend dev

# Worker：測試、建置、部署（部署前會先建置 frontend/dist）
pnpm --dir worker test
pnpm --dir worker run deploy
```

憑證一律走環境變數或 Worker secrets，不進版控；設定方式見 [`worker/README.md`](worker/README.md) 與 [`deploy/gpu-server/README.md`](deploy/gpu-server/README.md)。
