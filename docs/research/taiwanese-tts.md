# 臺灣台語 TTS 方案調研

> 調研基準日：2026-10-31。本文的「台語」專指臺灣台語／臺灣閩南語（Taigi, Taiwanese Hokkien），不是「台灣腔華語」。價格、模型與服務狀態均可能變動，上線前需重新確認。

## 摘要結論

1. **BreezyVoice 與 BreezyVoice 26 是兩個不同產品。**2025 年公開的 BreezyVoice 是台灣華語語音複製模型，程式與約 3.21 GB 權重皆為 Apache-2.0，可自架 REST／OpenAI 相容 API，也可用 CPU 執行；它**不會說臺灣台語**。[官方 GitHub](https://github.com/mtkresearch/BreezyVoice)｜[模型卡與權重](https://huggingface.co/MediaTek-Research/BreezyVoice)｜[論文](https://arxiv.org/abs/2501.17790)
2. **真正會說台語的是 2026 年的 BreezyVoice 26。**官方稱它以 CosyVoice 2 為基礎、可直接輸入文字合成台語，人工評測 MOS 為 5；但官方只承諾開源 Breeze ASR 26 與 Breeze Guard 26，BreezyVoice 26 目前只在 Breeze AI LINE 帳號提供體驗。因而截至本調研日，BreezyVoice 26 的權重、授權、自架方式、公開 API 與價格均為**未公開／未證實**，不能作為 MVP 的可整合依賴。[MediaTek 官方發布](https://www.mediatek.com/zh-tw/tek-talk-blogs/mediatek-research-breeze-3)
3. **開源模型已可做 PoC，尚沒有可直接放心上線的完整鏈。**較貼近臺灣台語的是 2026 年的 `KaedeTai/gpt-sovits-tw`（POJ 白話字輸入、MIT）與 `neurlang/coqui-vits-suisiann-minnan-hokkien`（台文漢字輸入、CC BY-SA 4.0）；前者自報台語流暢度約 80/100、發音約 75/100，後者沒有公開品質評測。[GPT-SoVITS-TW 模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[Coqui VITS 模型卡](https://huggingface.co/neurlang/coqui-vits-suisiann-minnan-hokkien)
4. **真正的瓶頸不只在 TTS，而是「華語中文 → 台語」翻譯。**同一漢字餵給一般中文 TTS 通常會念成華語；要先產生語意正確的台文漢字、漢羅或 POJ／台羅，再交給相符的 TTS。現有開源翻譯模型 `Taigi-Llama-2-Translator-13B` 支援繁中到台語漢字、漢羅與 POJ，但為 CC BY-NC-SA 4.0，不能直接作商用方案。[模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-13B)｜[研究專案](https://github.com/lbh0830/TW-Hokkien-LLM)
5. **建議主方案：先向 ATEN 優聲學申請台語雲端 API／PoC，並把「華語→台文」獨立成可替換 provider。**ATEN 官方明示支援台文漢字與台羅、雲端及地端部署，最符合臺灣腔與商用整合方向；但價格、SLA、API 規格、是否代做華語語意翻譯均未公開，採用前必須取得書面報價與測試帳號。[ATEN 官方頁](https://www.aivoice.com.tw/)
6. **建議備案：經家人／台語母語者審聽的預錄照護句庫，未命中才播放華語 TTS 並保留中文字。**這比把未驗證的台語模型直接用在吃藥、疼痛或跌倒等句子安全；Google Cloud 有正式 TTS API 與台灣華語可用，費率依模型計價，但台灣華語不是台語。[Google 語言支援](https://cloud.google.com/text-to-speech/docs/list-voices-and-types)｜[Google 價格](https://cloud.google.com/text-to-speech/pricing)

## 判斷標準與必要資料流

本產品收到的是翻譯引擎輸出的繁體華語，而不是已寫好的台文。可行資料流只有兩類：

```text
A. 繁體華語 → 台文翻譯（台語漢字／漢羅／POJ／台羅）→ 台語 TTS
B. 繁體華語 → 能同時做語意轉譯與發音的端到端服務 → 台語語音
```

BreezyVoice 26 的官方示例把「你這個帳戶的年利率有 3%」直接生成台語語音，屬於 B 類；但沒有可整合 API。[MediaTek 官方示例](https://www.mediatek.com/zh-tw/tek-talk-blogs/mediatek-research-breeze-3) 其餘多數方案屬於 A 類：例如 GPT-SoVITS-TW 明列只收 POJ，沒有漢字轉 POJ；MERaLiON 則收的是**已翻成福建話的漢字句**，其模型卡示例也把華語與福建話文本分成兩欄。[GPT-SoVITS-TW](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[MERaLiON](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS)

照護情境的驗收不應只聽「像不像真人」，而要分別量測：語意是否正確、台語用詞是否符合阿罵腔口、變調與文白異讀是否正確、關鍵詞是否可懂、端到端延遲，以及失敗時能否退回文字／預錄／華語。BreezyVoice 26 的 MOS 5 是官方自報自然度；官方頁沒有公開樣本數、評測者組成或照護句正確率，因此不能等同「醫療照護句可懂度 100%」。[MediaTek 官方發布](https://www.mediatek.com/zh-tw/tek-talk-blogs/mediatek-research-breeze-3)

## 方案比較總表

| 方案 | 台語種類與輸入 | 授權／部署 | 硬體與 API | 音質、可懂度證據 | 維護狀態與結論 |
| --- | --- | --- | --- | --- | --- |
| **BreezyVoice（舊版／Breeze 2）** | 台灣華語；繁中，可用注音修音；**不是台語** | 程式與權重標示 Apache-2.0，可商用自架 | 官方稱可改用 ONNX Runtime 在 CPU 跑；倉庫附 Docker、REST 及 OpenAI 相容 API | 論文與模型卡只評台灣華語自然度、複音字與中英混讀，不能外推台語 | 公開倉庫與權重可取得，但不符合本任務。[GitHub](https://github.com/mtkresearch/BreezyVoice)｜[HF](https://huggingface.co/MediaTek-Research/BreezyVoice)｜[論文](https://arxiv.org/abs/2501.17790) |
| **BreezyVoice 26（Breeze 3）** | 臺灣台語；官方示例是直接輸入中文句子 | 只有 ASR 26、Guard 26 被宣告開源；TTS 權重與授權未公開 | 僅 LINE 體驗；公開 API、自架與硬體需求皆**未證實** | 官方自報人工 MOS 5/5，但評測細節與照護領域可懂度未公開 | 2026 新發布、效果值得追蹤，但現在不可整合。[官方發布](https://www.mediatek.com/zh-tw/tek-talk-blogs/mediatek-research-breeze-3) |
| **GPT-SoVITS-TW（KaedeTai）** | 臺灣台語；只收帶調 POJ，內含變調前處理；不含漢字→POJ | 模型卡標 MIT，可自架；仍須在商用前複核訓練資料相容性 | 約 156 MB S1 + 952 MB S2，需另抓上游基礎模型；上游支援 CUDA、Apple Silicon、CPU，M4 CPU 公布 RTF 0.526 | 作者自評流暢約 80/100、發音約 75/100；5 句 POJ-CER 4.44%、13 長句約 15%，且承認超過約 60 音節會漂移 | 2026 年活躍社群微調，最值得做本機臺灣台語 PoC；評測集小且非獨立第三方。[模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[上游硬體測試](https://github.com/RVC-Boss/GPT-SoVITS) |
| **Coqui VITS SuiSiann MinNan** | 台文漢字範例可直接輸入，前端以 `MinnanHokkien2` 音素化 | 權重 CC BY-SA 4.0，可自架與商用但衍生作品有相同方式分享義務；法律適用範圍需確認 | 權重約 998 MB；未公布最低 VRAM，Coqui 可 CPU 跑，單張消費 GPU 理論可行但本模型實測數據**未證實**；沒有託管 API | 沒有 MOS、CER 或母語者評測；品質／可懂度**未證實** | 權重最後更新見 2025-08，下載量低，適合作基線而非直接上線。[模型卡](https://huggingface.co/neurlang/coqui-vits-suisiann-minnan-hokkien)｜[設定](https://huggingface.co/neurlang/coqui-vits-suisiann-minnan-hokkien/blob/main/config.json)｜[提交紀錄](https://huggingface.co/neurlang/coqui-vits-suisiann-minnan-hokkien/commits/main) |
| **Meta MMS `mms-tts-nan`（VITS）** | ISO `nan`（閩南語）；實際 tokenizer 輸入規格與是否符合臺灣台語用字，模型卡未充分說明 | CC BY-NC 4.0，只適合非商業研究；可自架 | 約 291 MB 儲存庫／145 MB權重，Transformers 可 CPU/GPU；無現成 Inference Provider | 無臺灣照護句 MOS／可懂度資料，且 `nan` 涵蓋多地變體，品質**未證實** | 研究基線，不建議產品化。[HF](https://huggingface.co/facebook/mms-tts-nan)｜[MMS 模型卡與授權](https://github.com/facebookresearch/fairseq/blob/main/examples/mms/MODEL_CARD.md) |
| **MERaLiON OmniVoice Hokkien TTS** | **新加坡福建話**；輸入已是福建話漢字，支援馬來／英文借詞與聲音複製 | MERaLiON-3 Public Licence，非 OSI 常見授權；可下載自架，商用條款應由法務逐條確認 | 約 0.8B、2.85 GB，官方範例指定 CUDA FP16；CPU 可行性與最低 VRAM**未證實**；無 HF Inference Provider | 作者用 25 句、LLM／ASR 評審得 24/25 語言辨識、WER 0.31–0.33、自然度 8.40/10；作者也明列無真人評測、樣本小 | 2026 年活躍且品質證據比多數社群版完整，但新加坡詞彙與腔調不宜直接給臺灣長輩。[模型卡與限制](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS)｜[授權文件](https://huggingface.co/datasets/MERaLiON/MERaLiON_Public_Licence/blob/main/MERaLiON-3-Public-Licence.pdf) |
| **SARC／陽明交大台語 TTS** | 展示系統標示「中文 to 台語」，另有多腔口台語 TTS | 權重、部署授權與商用條件**未公開／未證實** | 有線上展示，沒有公開正式 API 規格或 SLA | 公視報導顯示團隊蒐集約 600 位各地說話者；展示頁自稱正確性未經系統驗證 | 研究實力強，應洽談技轉／合作，不能把展示站當產品 API。[SARC 展示清單](https://sites.google.com/nycu.edu.tw/sarc/tw-nlai/demonstrations)｜[SARC 模型頁](https://huggingface.co/Speech-AI-Research-Center/Breeze-ASR-26)｜[公視報導](https://news.pts.org.tw/article/680050/amp) |
| **意傳科技「媠聲／鬥拍字」** | 台語文本翻譯、斷詞與朗讀；公開前端可輸入台文 | 網頁前端 MIT；**合成後端、模型權重、音檔商用授權不能由前端 MIT 推定** | 展示服務與命令 API 連結存在；正式 API、SLA、價格與自架條件未公開 | 公開頁沒有 MOS；第三方整合紀錄稱免費展示有限流，不構成供應商 SLA | 適合人工試聽與洽詢客製服務，不應直接依賴免費站。[前端倉庫](https://github.com/i3thuan5/TauPhahJi-BangTsam)｜[公司 GitHub](https://github.com/i3thuan5) |
| **臺北科大／SARC Tacotron2 + WaveGlow** | 中文先轉台羅數字調，再由 Tacotron2 合成；研究亦允許直接輸入台羅 | 論文可讀；展示模型權重與完整商用授權未公開。另有 MIT 的舊 Tacotron2+WaveRNN 程式，但預訓練權重取得與授權需另查 | 2020 論文報告整體 RTF 約 1/3.5；現代 CPU/GPU條件未公開 | 20 人、15 句共 300 評分，整鏈 MOS 4.30；C2T 最佳無調 SER 6.53% | 是重要學術基線，不是有 SLA 的現成服務。[2020 論文](https://aclanthology.org/2020.ijclclp-2.0.pdf)｜[舊開源程式](https://github.com/ga642381/Taiwanese-Speech-Synthesis) |
| **通用 Coqui XTTS / F5-TTS** | 官方 XTTS 只列 16 種語言且中文為 `zh-cn`；F5 官方共享清單只有中英等，查無臺灣台語正式 checkpoint | XTTS 權重為 Coqui Public Model License；F5 程式 MIT、官方基礎權重 CC BY-NC | 兩者皆可本機 GPU／CPU，但沒有被驗證的台語模型可直接部署 | 把台語漢字交給中文模型很可能念成華語；台語品質為**未證實** | 除非自行取得合法台語語料微調並做母語者評測，否則不列入候選。[XTTS 語言與授權](https://github.com/coqui-ai/TTS/blob/dev/docs/source/models/xtts.md)｜[F5 社群模型清單](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/SHARED.md) |
| **CosyVoice 3 通用／社群零樣本** | 阿里雲版列有「閩南話」，但不等於經驗證的臺灣台語；社群曾以「請用閩南話」生成台語合成資料 | CosyVoice 3 開源基礎模型可自架；雲端另依 API 計費 | 0.5B 本機模型可用單張 GPU；CPU 延遲未證實。雲端有 API | MERaLiON 的 25 句新加坡福建話評測中，CosyVoice3 只有 18/25 被判成福建話、帶懲罰 WER 0.86–0.87；不能直接視為臺灣台語方案 | 可作實驗對照，不建議主線。[阿里雲語言支援](https://www.alibabacloud.com/help/tc/model-studio/tts-model)｜[社群資料卡與限制](https://huggingface.co/datasets/lianghsun/tw-hokkien-audio)｜[MERaLiON 比較](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS) |

### 「開源」與「可商用」注意事項

- 可下載權重不等於 OSI 開源，也不等於可商用：MMS 明列 CC BY-NC 4.0；F5 基礎權重亦是 CC BY-NC；MERaLiON 使用自訂公共授權。[MMS](https://github.com/facebookresearch/fairseq/blob/main/examples/mms/README.md)｜[F5](https://github.com/SWivid/F5-TTS)｜[MERaLiON 授權](https://huggingface.co/datasets/MERaLiON/MERaLiON_Public_Licence/blob/main/MERaLiON-3-Public-Licence.pdf)
- GPT-SoVITS-TW 雖標 MIT，但其訓練資料包含教育部辭典例句與 Common Voice；產品化前仍須確認資料版本與輸出／模型衍生權利，不能只看模型卡最上方的 SPDX 標籤。[GPT-SoVITS-TW 訓練資料說明](https://huggingface.co/KaedeTai/gpt-sovits-tw)
- 教育部《臺灣台語常用詞辭典》網站內容受著作權保護，文字資料另提供下載；官方辭典資料以 CC BY-ND 3.0 TW 為主，若要重製、改作、打包音檔或作訓練資料，應逐項核對授權而不是爬站。[辭典版權聲明](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/)｜[相關資源下載](https://sutian.moe.edu.tw/zh-hant/siongkuantsuguan/)｜[萌典資料來源與授權](https://www.moedict.tw/about.html)

## 商用／雲端 API

| 供應商 | 台語支援與輸入 | 價格與條件 | 評估 |
| --- | --- | --- | --- |
| **ATEN AI Voice 優聲學** | 官方明示台語 TTS，收台文漢字與台羅；提供雲端與地端方案 | 公開頁未列單價、API 配額與 SLA，須詢價；是否能直接把華語語意翻成台語亦**未證實** | **首選洽談對象**，因供應商明確定位臺灣台語並有企業部署選項。[官方頁](https://www.aivoice.com.tw/) |
| **意傳科技** | 公司明示開發台語 TTS、斷詞、台羅等母語技術；有「媠聲」展示 | 正式 API 價格、商用音檔權、SLA、自架方案均未公開 | 適合列為第二家詢價與中文→台文前處理合作對象。[公司頁原始碼說明](https://github.com/i3thuan5/ithuan/blob/main/index.html)｜[公司 GitHub](https://github.com/i3thuan5) |
| **SARC／陽明交大** | 有「中文 to 台語」展示及多語語音合成研究 | 尚未查到對外商用 API、價格或 SLA，均為**未證實** | 可詢問技轉或產學合作，不能直接接展示站。[展示清單](https://sites.google.com/nycu.edu.tw/sarc/tw-nlai/demonstrations) |
| **Alibaba Cloud Qwen3-TTS / CosyVoice 3** | 官方列「閩南話」，並有 HTTP／WebSocket API；未標示臺灣台語腔口 | 新加坡區 Qwen3-TTS-Flash 為 US$0.10／萬字，realtime 為 US$0.13／萬字；CosyVoice v3 flash/plus 分別 US$0.13／0.26／萬字，免費額度依帳戶啟用期 | 可快速做雲端對照，但臺灣長輩可懂度**未證實**，需母語者 A/B 測試。[語言支援](https://www.alibabacloud.com/help/tc/model-studio/tts-model)｜[官方價格](https://www.alibabacloud.com/help/en/model-studio/model-pricing) |
| **BreezyVoice 26** | 官方 LINE 可直接輸入中文生成台語 | 無公開 API、價格、SLA、權重與授權，全部**未證實** | 保持追蹤，不納入排程依賴。[官方發布](https://www.mediatek.com/zh-tw/tek-talk-blogs/mediatek-research-breeze-3) |
| **Google／Azure／AWS** | Google 與 Azure 的 `zh-TW` 是台灣華語；Azure 明寫 Taiwanese Mandarin。AWS 只列 Mandarin 與 Cantonese，沒有 Hokkien | Google Standard/WaveNet 超過免費額度後為 US$4／百萬字元、Neural2 US$16／百萬字元；其他供應商依各自方案 | **只能作華語退路，不是台語 API。**[Google 價格](https://cloud.google.com/text-to-speech/pricing)｜[Azure 語言表](https://learn.microsoft.com/azure/cognitive-services/speech-service/language-support?tabs=tts)｜[AWS 語言表](https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html) |

另有 Taigi AI Labs 公開「台語 TTS／PoC／API 洽詢」頁，但沒有公開公司實體、價格、SLA、腔口評測與授權細節；在供應商盡職調查完成前標為**未證實**，不列首選。[服務頁](https://ailabs.jp/nan-TW/taiwanese-tts)

## 華語中文 → 台語文字轉換

### 1. 專用翻譯模型

`Taigi-Llama-2-Translator-13B` 以 26.3 萬筆平行資料微調，可在繁中／英文與台語漢字、漢羅、POJ 間翻譯，正好能為漢字型與 POJ 型 TTS 產生輸入；但它是 13B 舊架構且 CC BY-NC-SA 4.0，只適合本案研究 PoC，不能當預設商用元件。[模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-13B)｜[GitHub 使用格式](https://github.com/lbh0830/TW-Hokkien-LLM/blob/main/README_ZH.md) 其論文針對四種書寫系統做雙向翻譯，但研究分數不等於照護領域正確率。[論文](https://arxiv.org/abs/2403.12024)

SARC 有中文到台語展示，2020 年的 C2T 研究則以中文直接預測台羅數字調，報告最佳無調 SER 6.53%；不過公開論文沒有給可商用模型權重、正式 API 或 SLA。[SARC 展示](https://sites.google.com/nycu.edu.tw/sarc/tw-nlai/demonstrations)｜[C2T 論文](https://aclanthology.org/2020.ijclclp-2.0.pdf)

### 2. 辭典／規則工具

- 教育部《臺灣台語常用詞辭典》可查台語漢字、臺羅正式版或數字版，且提供文字資料下載；它適合做詞彙正規化、讀音候選與關鍵詞白名單，但它是辭典，不是任意句子的語意翻譯器。[查詢方式](https://sutian.moe.edu.tw/zh-hant/tshautsok/tshasun-hongsik-suatbing/)｜[資源下載](https://sutian.moe.edu.tw/zh-hant/siongkuantsuguan/)
- 萌典提供開放 API 與教育部台語辭典資料，可作單詞查詢；資料仍受原始 CC BY-ND 3.0 TW 條款約束，不能把 API 可呼叫誤認成可任意改作。[萌典說明](https://www.moedict.tw/about.html)
- 「臺灣言語工具」／意傳生態可做斷詞、台羅、變調等前處理；「鬥拍字」公開前端為 MIT，但後端模型與服務授權須另談。[意傳 GitHub](https://github.com/i3thuan5)｜[鬥拍字](https://github.com/i3thuan5/TauPhahJi-BangTsam)

因此，建議把此段實作成獨立 `TaigiTextProvider`：輸入繁中，輸出台文漢字與台羅／POJ候選、信心與來源；照護關鍵句先走人工核准詞庫，開放句才走模型，並保留原始中文供畫面顯示。這是系統設計建議，不代表現有模型已能可靠產生信心分數。

## 退路方案

### 華語 TTS 頂替

優點是可立即沿用本專案既定的 Google Cloud，API、計費與台灣華語音色成熟；缺點是阿罵若只熟悉台語，理解率可能不足，而且 `zh-TW` 明確是台灣華語而不是台語。[Google TTS 文件](https://cloud.google.com/text-to-speech/docs/list-voices-and-types)｜[Azure 對同一 locale 的明確名稱](https://learn.microsoft.com/azure/cognitive-services/speech-service/language-support?tabs=tts) 適用規則應是「顯示繁中＋播華語＋允許再聽」，不能在 UI 標示為台語。

### 預錄常用照護句子比對

建立 50–200 句由家人或合格台語母語者錄製並審聽的句庫，例如問候、喝水、吃飯、如廁、翻身、疼痛位置、聯絡家人與緊急求助。翻譯結果經文字正規化後做「意圖＋槽位」比對，只在高信心且槽位安全時播放核准錄音；藥名、劑量、時間、人名、數字與否定詞不得靠模糊相似度硬套。這是本案的安全設計建議，不是讓系統作醫療判斷；系統仍只翻譯／顯示內容。

預錄方案的音質與可懂度由錄音與審聽直接保證，離線、低延遲且不受模型下架影響；代價是覆蓋率有限、句庫維護需要母語者，以及變動槽位需另外錄製或退回華語／文字。教育部辭典含部分真人詞目音檔，但其授權與「禁止改作」條件不適合未審核地拼接成產品句子。[辭典版權聲明](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/)

## 推薦方案

### 主方案：ATEN 台語 API + 可替換的華語→台文層

選擇理由：

1. ATEN 是本次找到少數明確寫出「台文漢字＋台羅」與「雲端＋地端」的臺灣供應商，語言目標比泛稱「閩南話」的中國或新加坡模型更吻合。[ATEN 官方頁](https://www.aivoice.com.tw/)
2. 商用服務較有機會取得 API SLA、資料處理條款與技術支援；但這些條件目前未公開，必須以詢價／PoC 合約驗證，不能先假設成立。
3. 把華語→台文獨立，可先以人工核准照護詞庫＋供應商能力完成 MVP，日後再替換成可商用翻譯模型；也不會把前端綁死任何模型，符合專案 provider 抽象原則。

**Go／No-Go 條件：**ATEN 必須提供測試 API、確認台語腔口、說明輸入是否需先翻成台文、允許即時 App 使用與音檔暫存、交代資料留存／訓練政策，並在本案母語者 100 句測試中達到團隊預先訂定的關鍵詞可懂度與延遲門檻。任何一項不符就不進入正式整合。

### 備案：人工核准預錄句庫 + Google 台灣華語 TTS

選擇理由是可靠、可立即落地，並能把高風險常用句的發音固定下來。命中核准句庫時播台語真人錄音；未命中、句中有未核准槽位、或台語 provider 逾時時，顯示繁中並播放 Google 台灣華語。此備案犧牲完整台語覆蓋率，換取可理解、可追溯與明確失敗行為。[Google 價格與正式 API](https://cloud.google.com/text-to-speech/pricing)

GPT-SoVITS-TW 建議保留為**技術 PoC 對照組**，不是目前主／備上線方案：它是現有開源方案中最貼近臺灣台語且授權標示寬鬆者，但仍需 POJ 翻譯、作者評測規模小、長句會漂移，且照護領域尚無獨立母語者驗證。[模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw)

## PoC 建議步驟

1. **建立金標測試集。**由家人與至少一位台語母語者共同整理 100 句：一般照護 60、數字／時間 15、疼痛／跌倒／吃藥 15、國台英混雜與姓名 10；每句保留印尼文、華語翻譯、自然台文、台羅／POJ、可接受同義說法及不可誤讀的關鍵詞。
2. **先測文字層。**比較 ATEN／意傳／SARC 可提供的轉換能力與 Taigi-Llama-2 研究基線；人工標記語意正確、否定詞、主客體、時間、數量與照護關鍵詞。Taigi-Llama-2 只在隔離 PoC 使用，不進商用部署。[Taigi-Llama-2 模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-13B)
3. **A/B 合成。**至少比較 ATEN、GPT-SoVITS-TW、Coqui VITS、Alibaba Qwen3-TTS／CosyVoice 閩南話，以及預錄真人；固定相同語意與說話速度，不把供應商自報 MOS 混成同一尺度。
4. **盲聽評測。**請阿罵與 2–3 位相近腔口母語者在不知道方案名稱下評分：逐句聽寫關鍵詞、整句理解、自然度、腔口接受度；高風險句只要否定、數字、藥名或疼痛位置錯一項即判失敗。
5. **量測工程指標。**記錄 p50／p95 首音延遲、完整合成時間、失敗率、單句成本、CPU／GPU記憶體、同時請求、離線能力與 provider 逾時後的 fallback 時間。
6. **做兩週家用 shadow test。**畫面仍顯示原始華語，台語音訊先由家人確認再讓阿罵試聽；不讓未核准模型輸出取代吃藥、跌倒或緊急求助的人工確認。
7. **凍結可回歸版本。**保存測試文字、供應商／模型版本、音檔 hash、評分與已核准預錄句；任一模型或 API 升版都重跑高風險子集。

建議預先設定而非事後挑選門檻：一般句關鍵詞可懂度 ≥95%、高風險句 100%、p95 首音延遲 ≤3 秒、provider 失敗後 ≤1 秒切換至既有預錄或華語。這些數字是**提案值，尚待技術主管與家人決策**，不是外部已驗證標準。

## 風險

1. **語言／腔口混淆：**台灣華語、廈門／中國閩南話、新加坡福建話與臺灣台語不能因都寫漢字就視為同一 TTS 目標；MERaLiON 明列新加坡福建話，Alibaba 只泛稱閩南話。[MERaLiON](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS)｜[Alibaba](https://www.alibabacloud.com/help/tc/model-studio/tts-model)
2. **翻譯錯誤被自然聲音掩蓋：**自然度高不代表語意或發音正確；MERaLiON 的比較顯示通用模型可產生乾淨音訊卻說成華語。[MERaLiON 評測](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS)
3. **文白異讀、變調與分詞：**GPT-SoVITS-TW 特別加入變調前處理，且作者指出沒有對齊實際變調會系統性誤讀，顯示前處理不可省略。[GPT-SoVITS-TW](https://huggingface.co/KaedeTai/gpt-sovits-tw)
4. **授權鏈：**程式、權重、訓練資料、參考聲音、輸出音檔可能各有不同條款；CC BY-NC 與本案未來商用可能性衝突，CC BY-SA 亦有分享義務。
5. **服務持續性：**研究展示站、LINE 體驗和免費網站沒有 SLA，不應成為照護功能的單點依賴。
6. **聲音複製與個資：**若使用家人聲音複製，需取得明確同意、限制用途、保存與刪除政策；本 PoC 沒有必要先做 voice cloning。
7. **資料跨境：**Alibaba 等海外雲端的區域、留存、訓練使用與個資條款需先確認；照護句可能包含姓名、病況或作息。
8. **評測偏誤：**目前公開分數多為作者自評、小型測試集或 LLM judge；MERaLiON 自己也明列無真人評測及 25 句樣本不足。[評測限制](https://huggingface.co/MERaLiON/MERaLiON-OmniVoice-Hokkien-TTS)

## 待決策問題

1. 阿罵慣用腔口是偏漳、偏泉、臺北腔、高雄腔或其他？能否接受通行腔／混合腔？
2. 此家庭限定服務是否仍須保留未來商用可能？若答案是是，應立即排除 CC BY-NC 模型，只作離線研究比較。
3. 是否有預算向 ATEN、意傳與 SARC 同時申請 PoC／報價？可接受的每月最低費、單句成本與 SLA 是多少？
4. 華語→台文是否允許送往第三方雲端？句子可能包含哪些個資，音訊／文字允許在哪些區域處理與保存？
5. 預錄句庫由誰錄音、誰負責台文與發音審校、誰可核准改版？
6. 前述 PoC 門檻（一般句 95%、高風險句 100%、p95 3 秒）是否採用，或需由技術主管另訂？
7. provider 失敗時的產品行為要選「台灣華語自動播放」還是「只顯示文字並請使用者點播華語」？這會影響阿罵的理解風險與互動速度。

## 來源查核說明

本文優先使用供應商官方頁、官方模型卡／倉庫與論文。沒有公開證據的硬體、品質、商用授權、API 或價格均標為「未證實」；沒有下載任何模型權重，也沒有對模型做實機音訊測試。因此音質結論均是對公開評測方法與限制的整理，最終選型仍必須完成母語者 PoC。
