# 專案規劃與決策紀錄

## MVP 目標

一支手機、一個網址、兩個超大錄音按鈕（阿罵講台語／看護 Bahasa Indonesia），錄完自動辨識、翻譯、播放對方語言語音；常駐「再聽一次」，顯示辨識原文與譯文。不需 LINE、帳號、打字。

## 階段

1. **Phase 1**：手機 PWA + mock 翻譯 API（錄音、上傳、播放、切換說話者）。
2. **Phase 2**：阿罵 → 看護：Breeze ASR 26 → 中文轉印尼文（Google Translation）→ 印尼語 TTS（Google Cloud TTS）。
3. **Phase 3**：看護 → 阿罵：印尼語 ASR（Whisper）→ 印尼文轉中文 → 台語 TTS（依調研結果決定）。

## 決策紀錄

| 日期 | 決策 |
| ---- | ---- |
| 2026-10-31 | 採手機 PWA，不做 LINE Bot。 |
| 2026-10-31 | Phase 1–2 先在 Mac 開發，ASR 先以 CPU / mock 執行，GPU 部署延後。 |
| 2026-10-31 | 中文 ↔ 印尼文翻譯與印尼語 TTS 使用 Google Cloud（Translation API + Cloud TTS）。 |
| 2026-10-31 | 對外存取使用 Cloudflare Tunnel + Cloudflare Access 限定家人。 |
| 2026-10-31 | 台語 TTS 先調研再決定，不讓開發進度依賴 BreezyVoice 26。 |
| 2026-10-31 | 不做自動語者偵測、連續收音、串流；按一下開始、按一下結束。 |
| 2026-10-31 | 自架模型推論獨立為 `inference/` 服務（契約見 `docs/inference-contract.md`）：測試期 Mac CPU，正式部署遠端 GPU server，backend 經 Cloudflare Tunnel + Access service token + Bearer token 呼叫。ASR 測試期延遲 5–15 秒可接受。 |
| 2026-10-31 | Phase 3 優先評估在自有 GPU server 部署 Breeze ASR 26 與 BreezyVoice；台語 TTS 模型可用性待確認（BreezyVoice 26 權重未公開，舊版 BreezyVoice 僅華語）。 |
| 2026-10-31 | 阿罵聽不懂華語：看護 → 阿罵方向不得以華語 TTS 頂替，需等台語 TTS。 |
| 2026-10-31 | GPU server（titan，TITAN RTX，driver 535）不升級驅動（host 上有其他 VM）：inference 映像以 CUDA 12.8 minor-version compatibility 執行並移除 forward-compat 函式庫。 |
| 2026-10-31 | titan 平時禁止對外連線（僅 Cloudflare Tunnel 7844 常開；建置時臨時開放）：titan 只跑 GPU inference + cloudflared，執行期不得依賴外網（模型離線載入）。 |
| 2026-10-31 | **架構 C'**：前端 + API 改由 Cloudflare Worker（`worker/`，TypeScript）提供於 `app.ama-ama.com`，Cloudflare Access 限家人；Worker 以 REST 呼叫 Google Translation / TTS，經 tunnel + service token 呼叫 titan inference。音檔解碼與長度驗證移至 inference（PyAV）。Python `backend/` 保留作本機開發參考，Worker 上線驗證後再決定移除。 |
| 2026-10-31 | 不使用 Cloudflare Access 保護 App（長輩與看護難以登入；未來希望廣泛使用）。改用「看不見的防護」：GCP 每日用量上限、Cloudflare WAF 限流、邀請碼／邀請連結啟用裝置（一年效期，可撤銷）；有濫用跡象時再加 Turnstile 隱形模式。 |
| 2026-10-31 | 因未來可能廣泛使用，台語 TTS 方案避開非商用（NC）授權。 |
| 2026-11-01 | 台語 TTS PoC 結論：GPT-SoVITS-TW 在拼音正確時聲調堪用；瓶頸是「產生正確台語拼音」。Taigi-Llama 的 POJ 與漢字分開生成且聲調不可靠，辭典轉換（taibun）文白異讀錯誤多。線上 LLM（Gemini Flash 3.6、Claude 各級）高品質需推理、延遲 7–12 秒，決定**不採用 LLM**。 |
| 2026-11-01 | **過渡方案**：看護 → 阿嬤 先上線 Taigi-Llama-2-7B（zh-TW → POJ）+ GPT-SoVITS-TW，部署於 titan 的獨立 `taigi-tts` 容器，經 inference `/v1/tts` 轉接；使用者接受聲調不完全正確。屬家庭內部使用（含 NC 授權模型），等待商用台語服務（Taigi AI 等）回覆後替換。 |
| 2026-11-10 | 看護 → 阿嬤正式主路徑改採 Taigi AI 商用翻譯 model2 與 TTS v3（先以測試金鑰上線，不設月用量上限）；逾時、錯誤或 403／429 時以 titan 的 Taigi-Llama + GPT-SoVITS-TW 備援，兩者皆失敗才播放提示音。以 D1 快取華語 → 台文翻譯、R2 快取 WAV；華語快取鍵採 NFKC、首尾去白、連續空白壓成一格、全半形標點統一且保留所有標點。使用紀錄只保存時間、華語原文、正規化鍵、台文、兩層命中狀態與來源（taigi／fallback／chime），不保存費用或延遲。 |
| 2026-11-10 | API 改採兩段式回應：`/api/translate` 完成 ASR 與翻譯後先回傳文字，前端立即顯示，再以 `/api/speech/{token}` 取得語音並自動播放；speech token 是 24 小時有效、具 domain separation 的無狀態 HMAC-SHA256 簽章。 |
