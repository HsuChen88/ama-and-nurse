# 阿罵的翻譯機 — Frontend PWA

React + Vite + TypeScript 製作的單頁手機 PWA。前端只依照 `docs/api-contract.md` 呼叫翻譯 API。

## 環境需求

- Node.js 22+
- pnpm 11+

## 啟動

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

開發模式已透過 `@vitejs/plugin-basic-ssl` 啟用 HTTPS。預設 API 使用同源 `/api`；開發伺服器會將它代理到 `http://localhost:8000`。若後端位於其他來源，可在 `.env` 設定：

```dotenv
VITE_API_BASE=https://api.example.com
```

### 不啟動後端的展示模式

在 `.env` 設定以下內容後重新啟動 Vite。前端會回傳假翻譯資料與瀏覽器即時產生的可播放 WAV 音檔，不會呼叫後端。

```dotenv
VITE_USE_MOCK=true
```

## 用手機透過 HTTPS 測試

麥克風 API 在手機瀏覽器必須使用安全連線。專案已加入 `@vitejs/plugin-basic-ssl`，以下指令會監聽區域網路介面並使用自簽憑證：

```bash
pnpm dev:https
```

1. 讓手機與電腦連上同一個區域網路。
2. 從終端顯示的 Network URL（例如 `https://192.168.1.20:5173`）在手機開啟。
3. 接受開發用自簽憑證警告，再允許麥克風權限。

部分 iOS 版本不允許未受信任的自簽憑證使用麥克風。遇到此情況，請使用 Cloudflare Tunnel、ngrok 等提供受信任 HTTPS 憑證的 tunnel，指向本機 Vite 連接埠：

```bash
pnpm dev --host 0.0.0.0
cloudflared tunnel --url http://localhost:5173
```

正式建置後，請用 HTTPS 部署 `dist/`；Safari「分享 → 加入主畫面」或 Android Chrome「安裝應用程式」即可安裝 PWA。

## 品質檢查

```bash
pnpm test
pnpm lint
pnpm build
```
