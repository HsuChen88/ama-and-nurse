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
