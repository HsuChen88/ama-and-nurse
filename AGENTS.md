# AGENTS.md — 共同開發規範

本專案：「阿罵的翻譯機」— 台語 ↔ 印尼語的手機 PWA 口譯工具。阿罵（台語）與印尼看護共用一支手機，按自己的大按鈕說話，系統辨識、翻譯並播放對方語言的語音。

## 你的角色

你是由技術主管指派的開發者。只做被指派的任務範圍；遇到需求或設計上的不確定，**不要自行決定**，在最終回報中列出「待決策問題」交給技術主管。

## 不可違反的約定

- `docs/api-contract.md` 是前後端唯一介面，不可自行更改。
- 前端不得知道底層用哪個模型；後端以 provider 介面（ASR / Translate / TTS）抽象，可用環境變數切換實作。
- 不要寫入任何金鑰；憑證一律走環境變數，提供 `.env.example`。
- 照護安全：涉及吃藥、疼痛、跌倒等內容只做翻譯與顯示，不做自動判斷。

## 目錄結構

```
frontend/   React + Vite + TypeScript + PWA（pnpm）
backend/    Python 3.12 + FastAPI（uv 管理）
docs/       規劃、API 契約、調研報告
deploy/     docker compose、cloudflared 設定
```

## Git

- 只在被指派的 worktree / branch 工作，不要切換或修改其他 branch。
- 依職責拆分 commit，訊息使用英文 Conventional Commits（`feat(frontend): ...`、`fix(backend): ...`、`docs: ...`）。
- 不要 push，不要開 PR。

## 回報格式（最終訊息）

1. 完成項目
2. 如何執行 / 測試（指令）
3. 測試結果（實際輸出摘要）
4. commit 清單
5. 待決策問題 / 已知限制
