# 台語 TTS 比較試驗（批次 PoC）

這是家庭內部、非商用的批次比較工具。它把 30 句繁體華語照護句分別交給
`linguardia/opus-mt-zh-nan` 與 Taigi-Llama-2-Translator-7B，再用同一套
GPT-SoVITS-TW 合成語音。它只翻譯與顯示內容，不會對吃藥、疼痛或跌倒作
判斷。

## 執行順序與 GPU 記憶體

程式固定依下列順序執行：

1. Opus 在 CPU 逐句翻譯；每句先依中文標點切子句，且每個子句都加
   `>>nan<<`。
2. Taigi-Llama 以 fp16 載入 GPU，依模型卡格式各產生 POJ 與台文漢字。
3. 所有 30 句翻完後把 Llama 搬回 CPU、刪除物件並清空 CUDA cache。
4. 最後才首次 import GPT-SoVITS-TW 並逐一合成 60 個 mp3。

這避免 Taigi-Llama 與 GPT-SoVITS 同時占用 VRAM。TITAN RTX 在另有約
5 GB 常駐負載時仍須觀察峰值；若 fp16 Llama 實際超過剩餘約 19 GB，
本 PoC 不會自動量化模型。

## 已查證並固定的上游介面

- KaedeTai source 固定為 commit
  `81959852f75c972a0a78364f8ea6b14133a11f4a`。
- [台語文件](https://github.com/KaedeTai/GPT-SoVITS/blob/81959852f75c972a0a78364f8ea6b14133a11f4a/TAIWANESE.zh-tw.md)
  說明公開 API 接受帶調 POJ 或台羅，並建議 `apply_sandhi=True`。
- [下載腳本](https://github.com/KaedeTai/GPT-SoVITS/blob/81959852f75c972a0a78364f8ea6b14133a11f4a/download_pretrained.sh)
  的預期權重位置已由容器啟動時的唯讀 symlink 對應到 `/models`。
- [requirements.txt](https://github.com/KaedeTai/GPT-SoVITS/blob/81959852f75c972a0a78364f8ea6b14133a11f4a/requirements.txt)
  以 Python 3.11 安裝；torch 與 torchaudio 固定為官方 cu121 2.5.1 wheel。
- [Taigi-Llama 模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-7B)
  的模板、greedy、beam size 1 與 repetition penalty 1.1 已固定在程式中。

### KaedeTai 公開 commit 的缺檔處理

上述 commit 的文件與 `tw_inference.tw_synth` 會 import `tts_long.py`，但 Git
tree 沒有這個檔案；文件所列的 `tw_samples/ref_001.wav` 也未發布。若不處理，
第一次合成必然失敗。

映像因此加入一個小型相容層，只呼叫 fork 既有的 `TTS_infer_pack`，並修補
明確的 `tw` 路由與 1033-token `v2ProTw` 判斷。starter reference 則在建置
時從同一 commit 已公開的五段 demo mp3 合併為最多 9.5 秒 mono wav，
transcript
也由該 repo 的 `tw_samples/README.md` 內容組成。這是 PoC workaround，並非
作者未發布的原始 reference；聽測報告不可把它描述為官方預設聲音。

## 建置時預載的離線資源

建置需要暫時開放 HTTPS，執行期則設定 `HF_HUB_OFFLINE=1`、
`TRANSFORMERS_OFFLINE=1` 與 `HF_DATASETS_OFFLINE=1`。映像內預載：

- KaedeTai source 與相同 commit 的五段 starter demo 音訊。
- PyTorch cu121、KaedeTai requirements、SentencePiece、Sacremoses。
- `fast_langdetect` full fastText 模型；lite 模型已包在 Python wheel。
- NLTK `averaged_perceptron_tagger`、`averaged_perceptron_tagger_eng`、
  `cmudict`。
- pyopenjtalk 字典，以建置時呼叫一次 `pyopenjtalk.g2p()` 強制準備。
- G2PWModel 1.1。純台語路徑不會用它，但預載可避免意外中文 span 下載。
- `imageio-ffmpeg` 內附的 ffmpeg binary，用來準備 reference 與輸出 mp3。

FunASR、ModelScope ASR 與 BigVGAN 不在這條 `v2ProTw` 批次 TTS 路徑上，
不下載它們的 ASR／vocoder 模型。若修改成 ASR、v3 或 v4 路徑，必須重新
盤點離線資產，不能假設本映像已包含。

模型本身不複製進映像；執行時從 external volume 唯讀掛載。entrypoint
會驗證 volume 中的 GPT-SoVITS source commit，並檢查每個必要權重，缺檔時
會在模型載入前顯示完整路徑。

## titan 操作

前提：已用指定下載腳本建立 external volume `taigi-poc-models`，且目前
目錄是含本 PoC 的 repository worktree。

```bash
cd poc/taigi-tts
export DOCKER_EGRESS_NETWORK=wasn-egress
docker compose build --pull
mkdir -p ~/taigi-poc-out
docker compose run --rm taigi-tts-poc
```

建置完成後即使一般外網 443 關閉，執行也只讀本機映像與 volume。服務仍會
接到 compose 要求的 external egress network，但離線環境變數會禁止 HF 與
Transformers 下載。

若完整執行中斷，可保留 `/out/translations.json` 分階段重跑：

```bash
docker compose run --rm taigi-tts-poc \
  python /app/run.py --phase translate
docker compose run --rm taigi-tts-poc \
  python /app/run.py --phase synthesize
docker compose run --rm taigi-tts-poc \
  python /app/run.py --phase report
```

輸出位置：

- `~/taigi-poc-out/results.csv`
- `~/taigi-poc-out/index.html`
- `~/taigi-poc-out/audio/{id}_{opus|llama}.mp3`
- `~/taigi-poc-out/translations.json`（斷點與除錯用）

`index.html` 可直接雙擊開啟。每個 provider 都能各自勾選「聽得懂／部分懂／
聽不懂」與「意思正確／錯誤」，瀏覽器以 localStorage 暫存，頁首按鈕可匯出
UTF-8 CSV。

## 從 Mac 取回結果

以下指令在 Mac 執行；請把帳號與主機改成實際值。

```bash
export TITAN_HOST=user@titan
mkdir -p ~/Downloads/taigi-poc-out
scp -r "$TITAN_HOST:~/taigi-poc-out/." \
  ~/Downloads/taigi-poc-out/
open ~/Downloads/taigi-poc-out/index.html
```

## 本機驗證

Mac 不需 Docker daemon即可跑語法、CSV、假資料 HTML 與實際 Opus CPU 測試：

```bash
cd poc/taigi-tts
uv sync
uv run python -m compileall -q run.py taigi_poc docker tests
uv run pytest -q
uv run python tests/verify_opus.py
```

第一次 Opus 驗證會由 Hugging Face 下載模型到
`~/.cache/huggingface`。Taigi-Llama 7B 與 GPT-SoVITS 只在 titan 驗證。
