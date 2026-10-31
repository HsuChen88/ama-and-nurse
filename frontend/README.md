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

### 手機窄版面手動驗收

使用 mock 建置並啟動 production preview：

```bash
VITE_USE_MOCK=true pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

另開終端，以 headless Chrome 分別擷取三個支援尺寸：

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --hide-scrollbars --ignore-certificate-errors --force-device-scale-factor=2 --window-size=360,740 --virtual-time-budget=4000 --screenshot=/tmp/ama-360x740.png https://127.0.0.1:4173/
"$CHROME" --headless=new --hide-scrollbars --ignore-certificate-errors --force-device-scale-factor=2 --window-size=390,844 --virtual-time-budget=4000 --screenshot=/tmp/ama-390x844.png https://127.0.0.1:4173/
"$CHROME" --headless=new --hide-scrollbars --ignore-certificate-errors --force-device-scale-factor=2 --window-size=430,932 --virtual-time-budget=4000 --screenshot=/tmp/ama-430x932.png https://127.0.0.1:4173/
```

macOS 的 headless Chrome 可能將小於 500px 的 layout viewport 提升為 500px；若截圖尺寸正確但內容像被裁切，請改用 DevTools Device Toolbar 明確設定上述 viewport 後再截圖。

逐張確認兩顆說話按鈕等寬等高、印尼文只在單字間換行、「清除」完整可見，且頁面沒有水平捲動。也可在 DevTools Console 確認：

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```
