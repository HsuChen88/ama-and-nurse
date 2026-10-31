# GPT-SoVITS-TW 與華語轉台語文字方案調研

> 調研基準日：2026-10-31。本文的「台語」指臺灣台語／臺灣閩南語。本文是技術與授權風險盤點，不是法律意見；價格與服務條款上線前須重查。

## 摘要結論

1. **目前沒有一條可以直接判定為「可廣泛商用」的 GPT-SoVITS-TW 完整鏈。**KaedeTai 的程式庫與 Hugging Face 權重頁都標 MIT，上游 GPT-SoVITS 程式與權重頁也標 MIT；但 KaedeTai 明載訓練語料「多數」來自教育部《臺灣台語常用詞辭典》的例句與音檔，而教育部把網站文字、音檔以 CC BY-ND 3.0 TW 釋出。該授權允許商用重製，卻禁止散布重混、轉換或依素材建立的新素材；模型訓練及權重是否構成改作並沒有權利人公開解釋，因此權重商用狀態是**未證實**，不能只依 MIT 標籤上線。[KaedeTai 模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[KaedeTai LICENSE](https://github.com/KaedeTai/GPT-SoVITS/blob/main/LICENSE)｜[教育部版權聲明](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/)｜[CC BY-ND 3.0 TW 摘要](https://creativecommons.org/licenses/by-nd/3.0/tw/deed.zh-hant)
2. **技術上值得做限內部 PoC。**目前 repo 文件（2026-06-05 更新）已不是舊模型卡所寫的「POJ only」：公開入口接受**帶調 POJ 或台羅**，內部一律正規化為台羅，再套連續變調。模型收本調（citation tone），不要先把整句人工改成變調後拼音；只有已自行處理變調時才關閉預處理器。[最新版台語文件](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#這是什麼)｜[推論與 `--no-sandhi`](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#推論)
3. **技術 PoC 主方案：Worker 呼叫「付費雲端 LLM API」產生本調台羅與台文漢字，titan 常駐 GPT-SoVITS-TW 合成。**先用同一盲測句集比較 Gemini、Claude、GPT，不預設哪家台語最好；目前找不到三者針對「華語→臺灣台語台羅」的公開同集、母語者盲測。付費 API 條款皆可支援商業產品，但輸出仍可能錯誤，且照護語句不能視為醫療建議。[Gemini API 條款](https://ai.google.dev/gemini-api/terms)｜[Anthropic 商業條款入口](https://www.anthropic.com/legal)｜[OpenAI Services Agreement](https://openai.com/policies/services-agreement/)
4. **技術備案：titan／CPU 常駐 `linguardia/opus-mt-zh-nan`，直接把華語轉台羅，再交給 GPT-SoVITS-TW。**它只有 77.5M 參數，權重標 Apache-2.0，公開 204 句 dev 的 BLEU 19.3、chrF 49.6；訓練資料同時有 CC BY-SA 4.0 與 CC0，商用不被 NC 禁止，但作者也要求依資料條款表彰。由於資料 ShareAlike 與權重 Apache-2.0 的交界未經本案法務確認，列為「可 PoC、商用前審查」，不是無條件放行。[模型卡、評測與授權鏈](https://huggingface.co/linguardia/opus-mt-zh-nan)
5. **SARC-Taigi-LLM 與 Taigi-Llama-2 不符合本案商用紅線。**SARC 12B 權重受 Gemma 條款約束，Gemma 本身允許負責任的商用；但 SARC 訓練資料包含 Taiwan Tongues，而該語料申請頁明載「以非商業性使用為原則」，公開資料也沒有揭露 SARC 是否另取得商用許可，故依本案規則排除。Taigi-Llama-2-Translator 則明標 CC BY-NC-SA 4.0，也須排除。[SARC 模型卡](https://huggingface.co/Speech-AI-Research-Center/SARC-Taigi-LLM-12b)｜[Taiwan Tongues 申請條件](https://tt.ima.org.tw/apply.html)｜[Taigi-Llama-2 模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-13B)
6. **正式上線的 go/no-go 條件不是音質，而是權利鏈。**在取得教育部／權利人對模型訓練與商用權重的書面許可、訓練說話者及參考聲音的聲音利用同意、以及輸出音檔權利說明前，本報告只推薦內部 PoC。若無法取得，應以權利乾淨的自有錄音重訓／微調，不能把「更換 3–10 秒參考音檔」當成清除底層語料風險的方法。[CC 授權亦提醒形象權、隱私權與著作人格權可能另有限制](https://creativecommons.org/licenses/by-nd/3.0/tw/deed.zh-hant#ref-other-rights)

## 前提與判斷門檻

本案既定資料流是 Google Translation 先產生 `id → zh-TW`，看護到阿嬤方向必須再變成台語語音；titan 是 TITAN RTX 24 GB、ASR 約占 5 GB、剩約 19 GB，且執行期不得連外。這些是專案已決策事項，見 [docs/plan.md](../plan.md)。

本文將「可商用」拆成五層：程式、基礎權重、微調權重、訓練／參考語料、輸出及說話者人格權。任一層不明，即標「未證實」。MIT、Apache-2.0 或模型卡 metadata 只證明該發布者宣告的那一層，不自動替第三方語料或聲音授權。

## 方案比較總表

| 元件 | 輸入／輸出 | 授權與商用判斷 | 品質證據 | 部署、資源與延遲 | 結論 |
| --- | --- | --- | --- | --- | --- |
| **KaedeTai GPT-SoVITS-TW** | 帶調 POJ 或台羅（本調）→ 32 kHz 台語；內部台羅與變調 | 程式、權重頁標 MIT；多數訓練資料來自教育部 BY-ND，商用權重與輸出權利**未證實** | 作者自評流利度約 80/100、發音約 75/100；5 句 POJ-CER 4.44%，13 長句約 15%，不是獨立評測 | 權重 156 MB + 952 MB，另需上游 base；TITAN 實測**未證實** | 僅內部 PoC，權利釐清前不上線。[模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[新版文件](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md) |
| **付費 Gemini API** | 華語→台文／台羅 JSON | 條款定位為專業／商業 API；Google 不主張生成內容所有權。付費層不以 prompt／response 改善產品；不得拿它提供醫療建議，本案須限定為翻譯與朗讀 | 未找到本任務公開對照評測，品質**未證實** | Worker 直接呼叫；網路延遲須實測 | 主方案候選，不預先宣稱最佳。[條款](https://ai.google.dev/gemini-api/terms) |
| **Claude API** | 華語→台文／台羅 JSON | API 適用商業條款；Anthropic 公告商業客戶保留輸出權利；標準 API input/output 通常 30 天內刪除 | 未找到本任務公開對照評測，品質**未證實** | Worker 直接呼叫；網路延遲須實測 | 主方案候選。[商業條款入口](https://www.anthropic.com/legal)｜[資料保留](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) |
| **OpenAI API** | 華語→台文／台羅 JSON | Services Agreement 規定客戶保留 input、擁有 output，且未明示同意時不以 Customer Content 改善服務；仍須遵守使用政策 | 未找到本任務公開對照評測，品質**未證實** | Worker 直接呼叫；網路延遲須實測 | 主方案候選。[Services Agreement](https://openai.com/policies/services-agreement/) |
| **EzTranslate API** | 中文→台文漢字、台羅、POJ，可附語音 | 公開 API 與付費點數存在；條款保留使用者上傳內容權利，但沒有明文把生成結果商用權利授予使用者，故輸出權**未證實** | 供應商提醒台語腔口、短句歧義及高風險內容須人工校對；無公開量化評測 | 非同步 `202 + polling`，≤3 秒能力**未證實** | 可納入 PoC 對照，簽約前不作正式依賴。[API](https://eztranslate.com.tw/docs)｜[條款](https://eztranslate.com.tw/terms-of-service) |
| **linguardia/opus-mt-zh-nan** | 華語→台羅 | 權重 Apache-2.0；資料 CC BY-SA 4.0/CC0，允許商用但要表彰；權重與 SA 相容性待法務確認 | 204 句 dev：BLEU 19.3、chrF 49.6；0 gold test，作者稱長句／技術文較弱 | 77.5M F32；可本地 CPU/GPU，TITAN 延遲**未證實** | 最佳離線備案候選。[模型卡](https://huggingface.co/linguardia/opus-mt-zh-nan) |
| **SARC-Taigi-LLM-12B** | 台文漢字／台羅對話；華→台翻譯品質**未證實** | Gemma 條款允許商用，但訓練資料 Taiwan Tongues 申請以 NC 為原則；不符合專案紅線 | 公布的是 1,000 題台語閱讀理解，不是華語→台語翻譯；SFT 後 0.89610 | Q4 卡載 9–11 GB RAM/VRAM；會與 ASR/TTS 爭用 GPU | **排除**。[模型卡](https://huggingface.co/Speech-AI-Research-Center/SARC-Taigi-LLM-12b-GGUF)｜[語料條件](https://tt.ima.org.tw/apply.html) |
| **Taigi-Llama-2-Translator** | 繁中／英→台語漢字、漢羅、POJ | CC BY-NC-SA 4.0 | 論文研究模型，非本案照護盲測 | 7B/13B，本地 GPU | **排除 NC**。[模型卡](https://huggingface.co/Bohanlu/Taigi-Llama-2-Translator-13B)｜[專案](https://github.com/lbh0830/TW-Hokkien-LLM) |
| **辭典／規則** | 台文漢字→讀音候選、拼音系統轉換、變調 | 各工具程式與資料須分開看 | 不能完成任意句子的語意翻譯 | 可在 titan／CPU 離線、延遲低 | 適合作驗證及正規化，不可單獨取代翻譯模型。來源見後文。 |

## GPT-SoVITS-TW 深入查證

### 1. 程式、權重、上游與基礎模型

- KaedeTai fork 的 `LICENSE` 是 MIT；Hugging Face 上 `s1_trilingual.ckpt`（156 MB）與 `s2_r4_e15.pth`（952 MB）也標 MIT。[fork LICENSE](https://github.com/KaedeTai/GPT-SoVITS/blob/main/LICENSE)｜[權重頁](https://huggingface.co/KaedeTai/gpt-sovits-tw)
- fork 的下載腳本還會取用上游 `lj1995/GPT-SoVITS` 的 `s1v3.ckpt`、Chinese RoBERTa、`s2Gv2Pro.pth` 與 discriminator；上游模型 repo 標 MIT，上游程式 repo 也是 MIT。[下載腳本](https://github.com/KaedeTai/GPT-SoVITS/blob/main/download_pretrained.sh)｜[上游模型頁](https://huggingface.co/lj1995/GPT-SoVITS)｜[上游 LICENSE](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE)
- fork 文件沒有逐一列出每個基礎權重的原始訓練資料、資料版本與權利清單；因此即使各 repo 標 MIT，完整 provenance 仍是**未證實**。[下載腳本只列檔案來源，未列資料權利](https://github.com/KaedeTai/GPT-SoVITS/blob/main/download_pretrained.sh)

### 2. 訓練資料與商用紅旗

KaedeTai 自述約 15–25 小時 paired audio + POJ，主要是教育部辭典例句，另含 Common Voice `nan-tw` validated split；資料是多說話者、每段 3–12 秒。[模型卡 Training data](https://huggingface.co/KaedeTai/gpt-sovits-tw#training-data)

Common Voice 條款把貢獻與資料集以 CC0 提供，原則上不帶 NC；但 KaedeTai 沒有記錄所用 Common Voice 發行版本、clip manifest 與 speaker consent receipt，精確可稽核性仍**未證實**。[Common Voice Legal Terms](https://commonvoice.mozilla.org/terms/en.html)

教育部官方則明載辭典「文字、音檔內容」採 CC BY-ND 3.0 TW。[教育部版權聲明](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/) CC deed 允許任何目的（含商用）的原樣分享，但若重混、轉換或依素材建立新素材，不得散布改作後素材；是否以語音訓練及散布模型權重屬於「改作」沒有官方公開答案，故本案必須取得教育部／實際權利人的書面許可或法律意見。[CC deed](https://creativecommons.org/licenses/by-nd/3.0/tw/deed.zh-hant)｜[法律條款對改用作品的定義](https://creativecommons.org/licenses/by-nd/3.0/tw/legalcode)

### 3. 輸入、拼音與變調

最新版 repo 文件寫明所有公開入口接受帶調 POJ 或台羅，內部 `poj_to_tailo.normalize()` 統一成台羅；這與仍寫「POJ only」的 Hugging Face 模型卡互相矛盾，應以部署時 pin 的 commit 實測，不能只看模型卡。[新版文件 2026-06-05 說明](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#這是什麼)｜[舊模型卡限制](https://huggingface.co/KaedeTai/gpt-sovits-tw#known-limitations)

預設路徑是「本調 POJ／台羅 → normalizer → sandhi preprocessor → tokenizer → S1/S2」。預處理器公開 13 個 flag，且規則曾因長句退步而切換預設值，顯示它仍是模型特定的工程規則，不是已解決所有語法邊界的通用變調器。[Sandhi 文件](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#sandhi-預處理) 因此 LLM 應輸出本調及詞界／標點；不要叫 LLM 猜整句表面調後又讓 TTS 再變一次。

### 4. 聲音來源、換聲與品質

推論可提供任意 3–10 秒 mono 參考 wav 與相符 transcript；CLI 也有 `--ref`，所以技術上可換成節奏較慢、咬字清楚的長輩友善聲音。[參考音檔與 CLI](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#目前模型)

但 starter reference 與訓練說話者的真實身分、年齡、聲音利用同意範圍及商用 voice-cloning 同意均未公開，故為**未證實**。換 reference 只能調整目標音色，不能消除底層模型訓練資料的授權問題；模型卡也承認多說話者語料使單一聲音一致性受限。[模型卡限制](https://huggingface.co/KaedeTai/gpt-sovits-tw#known-limitations)

已知品質限制包括：作者明稱 research preview；超過約 60 音節偶爾漂移、單句內 code-switching 不支援、英語弱；5 句與 13 句 CER 都是作者自報，且作者認為高品質區間 ASR-CER 已與人耳感受脫鉤。[品質與限制](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#品質預期) 本案應把一句照護話切成自然短句，並以母語者關鍵詞可懂度作主指標。

### 5. TITAN RTX 資源與延遲估算

KaedeTai 沒有公布 TITAN RTX 的 VRAM 或延遲，以下均是**容量推估，不是實測**：

- 台語兩個 checkpoint 合計約 1.1 GB，另需上游 base／文字 encoder；第三方在 RTX 4060 測 GPT-SoVITS v2ProPlus 常駐推論約 2,063 MB，但不是 KaedeTai fork，故建議先為 TTS 預留 **3–5 GB VRAM** 再實測峰值。[KaedeTai 檔案大小](https://huggingface.co/KaedeTai/gpt-sovits-tw#files)｜[第三方 VRAM 測量](https://github.com/ARGX-25/JARVIS/blob/main/Models/SETUP.md)
- 上游公布 v2 ProPlus 在 4060 Ti 的 RTF 0.028、4090 的 0.014、M4 CPU 的 0.526；這不能直接外推 TITAN RTX 或台語 fork，只能證明 warm GPU synthesis 有機會遠低於音檔時長。[上游文件鏡像](https://gpt-sovits.atomgit.com/index.html)
- 本報告工程預算建議：warm TTS 0.2–0.8 秒、雲端文字轉換 0.4–1.5 秒、Worker/tunnel/編碼 0.2–0.5 秒，合計 p50 約 0.8–2.8 秒；這些數字全部是**待 PoC 驗證的目標預算**，不可當成供應商 SLA。應另外測 p95、冷啟動、ASR/TTS 同時工作及 5 GB ASR 常駐時的 OOM。
- 上游已測 Python 3.12 + PyTorch 2.7.1 + CUDA 12.8，但 KaedeTai quick start 指定 Python 3.11，fork 在本專案 Python 3.12 image 的相容性**未證實**。[上游 tested environments](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/README.md#tested-environments)｜[fork quick start](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#快速開始)

## 華語轉台語文字方案

### A. 付費雲端 LLM API

三家 API 條款都可支援商業產品，但「允許商用」不代表「台語正確」。截至調研日，未找到 Claude、Gemini、GPT 對同一份華語→臺灣台語台羅資料集的公開母語者評測，社群文章至多證明能對談或理解部分台語，不能作照護正確率證據，故全部標**品質未證實**。[教育雲有 ChatGPT 台語助教教材，但只描述用途，沒有量化評測](https://mhi.moe.edu.tw/eduCloud/learning-resource/TSMhiResource-004648/)

價格以每百萬 tokens 計：Gemini 2.5 Flash 付費層文字 input US$0.30、output US$2.50；Claude Haiku 5.5 在 prompt ≤100K 時 input US$0.10、output US$0.50；OpenAI GPT-6 Luna 標準短 context input US$0.10、output US$0.50。價格會變，上線前重查。[Gemini 價格](https://ai.google.dev/gemini-api/docs/pricing)｜[Claude Haiku 價格](https://www.anthropic.com/claude/haiku)｜[OpenAI 價格](https://developers.openai.com/api/docs/pricing)

若一次請求約 600 input tokens（含固定提示與 few-shot）+ 100 output tokens，依上述牌價的示意成本約為 Gemini US$0.00043、Claude／GPT US$0.00011；這是算術估算，不含快取、稅、區域加價、重試與模型思考 tokens。對本案而言成本遠小於品質與延遲差異，應以盲測選型。

隱私上應只送「翻譯後的短句」，不要送姓名、病歷或完整對話；Gemini 必須用有 billing 的 paid service，免費層內容可能被用於改善產品且可能人工檢閱。[Gemini paid/unpaid data terms](https://ai.google.dev/gemini-api/terms#unpaid-services) Claude API 標準保留期 30 天；OpenAI business/API 未明示同意時不以 Customer Content 改善服務。[Anthropic retention](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)｜[OpenAI Services Agreement](https://openai.com/policies/services-agreement/)

### 可重現評測提示詞範本

固定 model snapshot、temperature=0（若 API 支援）、max output tokens、system prompt、few-shot 與 JSON schema；每個模型各跑三次，保存原始回應、token、延遲與錯誤。下列是評測規格，不是程式碼：

```text
角色：你是臺灣台語母語翻譯員。把「臺灣華語」翻成阿嬤日常會聽懂的
臺灣台語口語；只做忠實翻譯，不增加醫療建議、判斷或安撫內容。

要求：
1. 保留原句的肯定／否定、疑問、主客體、時間、次數、劑量與數字。
2. 使用自然臺灣台語，不把華語逐字用台語音讀。
3. 輸出教育部台羅「本調」，保留詞內連字號、輕聲 -- 與句界；不要先做連續變調。
4. 人名、藥名或不確定專名保留原文，並在 issues 說明；不可猜造。
5. 僅輸出符合 schema 的 JSON，不要解釋。

輸入情境：印尼看護對臺灣長輩說話。
輸入華語：{{SOURCE_ZH_TW}}

schema：
{
  "taibun_han": "台文漢字／漢羅",
  "tailo_citation": "帶調本調台羅",
  "back_translation_zh_tw": "逐義回譯，供測試比對",
  "issues": ["歧義、專名或無法確定處；無則空陣列"]
}
```

評測時不要把 `back_translation` 顯示給阿嬤；它只是抓否定、時間、數字及主客體漂移的測試訊號，不能代替母語者審聽。

### B. 開源／本地模型

`linguardia/opus-mt-zh-nan` 是目前找到最符合「無 NC、體積小、直接輸出台羅」的候選。它以 106,678 對 ChhoeTaigi 辭典句微調、max sequence 48 tokens，只有 204 對 dev、沒有 gold test；作者明列短日常句較適合、長文與技術文較弱。[模型卡](https://huggingface.co/linguardia/opus-mt-zh-nan) 其輸出台羅可直接送新版 GPT-SoVITS-TW，建議在 CPU 常駐，避免占用 ASR/TTS VRAM；CPU latency 是**未證實**，PoC 必測。

SARC-Taigi-LLM-12B／27B 雖有 Gemma 商用條款與 GGUF，卻使用教育部辭典及 Taiwan Tongues 文學資料；Taiwan Tongues 申請頁限定非商業性為原則，因此排除。它公布的 1,000 題分數是閱讀理解，不是翻譯正確率。[SARC 訓練與評測](https://huggingface.co/Speech-AI-Research-Center/SARC-Taigi-LLM-12b#training-pipeline)｜[Taiwan Tongues 條件](https://tt.ima.org.tw/apply.html) Gemma 條款本身允許使用、修改與 hosted service，且 Google 不主張 output 權利；問題在下游語料而非 Gemma 基礎條款。[Gemma Terms](https://ai.google.dev/gemma/terms/)

### C. 辭典與規則工具

| 工具／資料 | 可做什麼 | 授權與商用判斷 | 限制 |
| --- | --- | --- | --- |
| 教育部臺灣台語常用詞辭典 | 詞彙、台文漢字、台羅、音檔與例句查核 | CC BY-ND 3.0 TW 可商用原樣使用、須姓名標示、不得散布改作 | 不可把「可下載」理解為可任意改寫／訓練；不是句子翻譯器。[版權](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/)｜[下載](https://sutian.moe.edu.tw/zh-hant/siongkuantsuguan/) |
| 萌典 | 教育部資料的查詢介面／資料處理 | 程式可為 CC0/MIT（依 repo），辭典內容仍是教育部 BY-ND | 前端開源不會洗掉資料條款。[moedict-app 授權說明](https://github.com/g0v/moedict-app#資料來源與授權) |
| 臺灣言語工具 | 斷詞、文字分析、拼音／語言處理 | CPAL；官方 README 明說可用於商業軟體，但修改／衍生函式庫有公開義務 | 嵌入閉源服務前要確認 CPAL 邊界；所搭配資料另計。[官方 repo 授權聲明](https://github.com/i3thuan5/tai5-uan5_gian5-gi2_kang1-ku7#授權聲明) |
| Taibun | 台文漢字轉台羅、POJ 等；有近似變調模式 | 程式 MIT，內含資料 CC BY-SA 4.0，可商用但需遵守 BY-SA | 是音譯器，不會把華語語意改寫成台語；`auto` 變調也自稱只能近似完整規則。[repo 與資料授權](https://github.com/andreihar/taibun) |

教育部 BY-ND 資料可用來「原樣查詢與比對」較清楚；若把釋義、例句改寫成 prompt few-shot、訓練集或散布衍生資料，是否越過禁止改作應先取得許可。單純在服務內查到一個原樣讀音與把大量內容轉成模型權重，是兩個不同風險層級。

### D. 台羅、POJ 與變調

新版 GPT-SoVITS-TW 已原生接受台羅及 POJ，故**主流程不需要額外做台羅→POJ**。[Orthography update](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#這是什麼) 若外部系統仍要求 POJ，Taibun 可在台文漢字與台羅／POJ 間音譯，程式 MIT、資料 CC BY-SA 4.0；但音譯不是語意翻譯。[Taibun](https://github.com/andreihar/taibun)

主流程應保留 LLM／MT 的本調台羅，讓 GPT-SoVITS-TW 自己套與訓練標籤一致的 sandhi。Taibun 的 `auto`、`exc_last`、`incl_last` 可作對照測試，不能再疊到模型預設 sandhi 上，否則有雙重變調風險。[Taibun sandhi 說明](https://github.com/andreihar/taibun#sandhi)｜[GPT-SoVITS-TW sandhi](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#sandhi-預處理)

## 端到端組合建議

| 組合 | 授權風險 | 品質 | ≤3 秒可能性 | 成本 | 維運 |
| --- | --- | --- | --- | --- | --- |
| **主方案（PoC）**：Google `id→zh-TW` → Worker 付費 LLM（盲測勝者）→ 本調台羅 → titan GPT-SoVITS-TW | LLM 商用條款清楚；TTS 的教育部 BY-ND／聲音權仍是 blocker | LLM 可做語意改寫與結構輸出，但三家台語品質未證實；TTS 有作者自評與限制 | 有機會；必測 p95。文字網路呼叫是主要變因 | 每句 token 成本約萬分之一美元量級；titan 固定成本 | 供應商可替換、提示詞須版本化；TTS 常駐與離線資產需管理。[TTS](https://huggingface.co/KaedeTai/gpt-sovits-tw)｜[LLM 條款](https://ai.google.dev/gemini-api/terms) |
| **備案（PoC）**：Google `id→zh-TW` → titan CPU `opus-mt-zh-nan` → 台羅 → titan GPT-SoVITS-TW | MT 無 NC，但 CC BY-SA 表彰／衍生邊界待審；TTS blocker 相同 | 公開 dev 分數有限；照護域、否定與數字未驗證 | 避免雲端 LLM RTT，有機會；CPU 與 ASR 同機干擾待測 | 無逐句 API 費 | 模型小、離線簡單；品質提升與詞彙治理由團隊承擔。[MT 模型卡](https://huggingface.co/linguardia/opus-mt-zh-nan) |
| **對照方案**：Worker EzTranslate API → 台羅 → titan GPT-SoVITS-TW | API 生成結果商用權未明、TTS blocker 相同 | 專門輸出台文／台羅／POJ，但無獨立量化評測 | 非同步 polling，≤3 秒未證實 | 1 點／每 500 輸入字元；Plus 500 點 US$5.90，約 US$0.012/點 | 少做一層 prompt 工程；依賴小型供應商、SLA 未公開。[價格](https://eztranslate.com.tw/pricing)｜[API](https://eztranslate.com.tw/docs) |

**推薦決策：**立即做主方案的內部 PoC，雲端文字 provider 同時測 Gemini、Claude、GPT，選母語盲測與 p95 勝者；**不推薦把 KaedeTai 權重直接投入公開商用**。若書面權利釐清失敗，正式方案改為自有／明確商用授權台語錄音重訓 TTS；備案的 `opus-mt-zh-nan` 可繼續作本地文字轉換候選，但也要完成 BY-SA 法務檢查。

`≤3 秒` 應定義為「Google `zh-TW` 已返回後，到第一段可播放台語音訊」或「從看護停止說話到第一段音訊」二選一；兩者差一個 ASR+Google Translation 時間，現在的需求文字未明確，列為待決策。

## PoC 計畫

### 1. 測試句集

建議 60 句：下列 20 個核心語意各做 2 個自然改寫，再加 20 句母語者自行補的易錯句。所有句子先由兩位台語母語者建立可接受的多參考台文與台羅，不把單一「標準答案」當唯一正確說法。

| 類別 | 華語輸入例句 | 必須保留的關鍵 |
| --- | --- | --- |
| 吃藥 | 請先不要吃藥，我確認後再告訴你。 | **不要**、先後順序 |
| 吃藥 | 這顆藥一天吃兩次，一次一顆。 | 一天兩次、一次一顆 |
| 吃藥 | 你今天早上的藥吃了嗎？ | 今天早上、疑問、已吃／未吃 |
| 疼痛 | 你哪裡痛？是左邊還是右邊？ | 左／右、二選一 |
| 疼痛 | 如果更痛，請馬上告訴我。 | 條件句、更痛、馬上 |
| 跌倒 | 你剛才有跌倒嗎？先不要站起來。 | 剛才、疑問、**不要站** |
| 跌倒 | 我沒有跌倒，只是差一點滑倒。 | **沒有**、差一點 |
| 時間 | 我們下午三點半去看醫生。 | 下午、3:30 |
| 時間 | 五分鐘後再量一次血壓。 | 5 分鐘後、再一次 |
| 數字 | 血糖是一百二十八。 | 128，不可拆錯 |
| 飲食 | 這杯水不要喝完，只喝一半。 | 不要喝完、只一半 |
| 飲食 | 你要吃稀飯，還是吃麵？ | 二選一、非兩者都吃 |
| 如廁 | 你要不要去廁所？ | 問意願，不是命令 |
| 移動 | 我扶你慢慢走，不要自己走。 | 我扶、慢、不要自己走 |
| 溫度 | 水有一點燙，等涼一點再喝。 | 稍燙、等待、再喝 |
| 否定 | 不是今天，是明天早上九點。 | **不是今天**、明早 9:00 |
| 主客體 | 醫生要我提醒你多喝水。 | 醫生→我→你 |
| 程度 | 我現在不太喘，只是有一點累。 | 不太喘、稍累 |
| 呼救 | 你先坐著，我現在去叫人。 | 先坐、我去叫人 |
| 專名 | 這是阿斯匹靈，不是維他命。 | 藥名、否定、不可猜造台語名 |

### 2. 分層評測

1. **文字層（不播放 TTS）：**至少 3 位不同地區／世代的台語母語者盲看輸出，評語意忠實、自然度、台羅讀音、否定／數字／時間／主客體是否完整。先用硬性安全錯誤率排序，再看 1–5 分自然度。
2. **語音層：**固定同一份正確台羅，比較 TTS reference 聲音與 sandhi 設定；每段隨機編號，至少 5 位母語者戴相同耳機或用目標手機喇叭盲聽。記錄逐句關鍵詞辨識、整句意思選擇、1–5 MOS、是否需重播。
3. **端到端層：**混合文字 provider × TTS，評測者不能看到品牌。主要門檻建議：否定／數字／時間／左右任一錯即該句 fail；關鍵語意正確率 ≥99% 才進有限 beta。99% 是本案建議門檻，不是現有模型已達成的事實。
4. **效能層：**各組合 warm-up 後至少 100 次，報 p50/p95/p99：文字轉換、排隊、TTS 首音訊、完整音訊；同時跑 ASR+TTS 壓測並記 `nvidia-smi` 峰值。冷啟動另列，不與 warm latency 混算。

### 3. titan 部署步驟草案（只規劃，不在本任務執行）

1. 在可連網建置環境 pin KaedeTai commit、Python／PyTorch／CUDA 組合及所有 Python wheels；下載清單至少包含兩個台語權重與下載腳本列出的上游檔，保存 SHA-256、來源 URL、授權快照及 SBOM。[fork 下載清單](https://github.com/KaedeTai/GPT-SoVITS/blob/main/download_pretrained.sh)
2. 使用已含 FFmpeg／sox runtime 的 CUDA base image，避免在 titan 執行 `apt`；所有依賴在 image build 階段完成。上游官方安裝本來要求 FFmpeg／libsox，故不能假設純 pip image 就足夠。[上游安裝需求](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/README.md#install-ffmpeg)
3. 依既有決策使用 CUDA 12.8 runtime 的 minor-version compatibility 路線並移除 forward-compat libraries；先在 staging 驗證 driver 535 能載入所選 PyTorch wheel。上游列 Python 3.12/CUDA 12.8 為已測組合，但 fork 仍指定 3.11，所以兩個 image 方案都應留在 PoC 矩陣。[上游環境](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/README.md#tested-environments)｜[fork 安裝](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#安裝)
4. image 內使用明確 local path，設 `HF_HUB_OFFLINE=1`、`TRANSFORMERS_OFFLINE=1`，啟動健康檢查必須在封網環境完成；若任何元件嘗試 runtime download，部署判定失敗。
5. 只啟動合成所需的最小服務，不啟動訓練、ASR、UVR 或公開 Web UI。KaedeTai 提供 Python API 與本地 Flask UI，但沒有 production auth、rate limit 或穩定 HTTP contract 的說明；應包在既有 inference provider 介面後，不能把 Flask UI 直接暴露。[fork 推論介面](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#推論)
6. 啟動時一次載入、warm-up，限制併發與最大音節數；輸入先依標點切短句，保留順序播放。監控 GPU peak、RTF、首段延遲、重複／漏字與 timeout。
7. 若採本地備案，`opus-mt-zh-nan` 優先放 CPU 常駐；其模型檔與 tokenizer 同樣在 build 時封裝，不允許 runtime 到 Hugging Face 取檔。[模型頁](https://huggingface.co/linguardia/opus-mt-zh-nan)

## 風險

| 風險 | 影響 | 緩解／go-no-go |
| --- | --- | --- |
| 教育部 BY-ND 語料衍生權重未釐清 | 無法符合廣泛商用決策 | 上線前取得書面許可或律師意見；否則換權利乾淨語料重訓。[教育部授權](https://sutian.moe.edu.tw/und-hani/piantsip/pankhuan-singbing/) |
| 訓練／starter reference 說話者同意未公開 | 聲音人格權、下架與品牌風險 | 不使用內附聲音；自錄有明確 TTS／voice-cloning／商用／撤回條款的聲音，但仍須另解底層權重問題。[模型公開資訊](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#目前模型) |
| LLM 把華語逐字音讀、漏否定或改數字 | 阿嬤聽到錯誤照護內容 | JSON 回譯檢查、關鍵欄位規則、母語盲測；高風險句優先使用人工核准句庫 |
| 變調規則與輸入已變調造成雙重處理 | 發音不自然或詞義難懂 | 統一輸入本調；pin sandhi flags；保留 `--no-sandhi` 只作對照。[Sandhi 文件](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#sandhi-預處理) |
| 多腔口、文白異讀與長輩用詞差異 | 模型「像台語」但阿嬤聽不懂 | 讓目標使用者／同地區母語者參與盲測；建立可接受多譯本與詞彙表 |
| TITAN RTX 與 ASR 共用 GPU | OOM、排隊，超過 3 秒 | TTS 預留 3–5 GB 是待驗證假設；壓測後設 concurrency／admission control |
| fork 快速變動、模型卡與 repo 文件不一致 | 部署結果不可重現 | pin commit、權重 hash、prompt/model snapshot、sandhi flag 與 reference hash。[repo 文件](https://github.com/KaedeTai/GPT-SoVITS/blob/main/TAIWANESE.zh-tw.md#這是什麼)｜[模型卡](https://huggingface.co/KaedeTai/gpt-sovits-tw#known-limitations) |
| 雲端照護文字涉及個資 | 隱私與合規 | 只送最短必要文字、付費企業 API、刪識別資訊、確認 DPA／區域與 retention。[Gemini 資料條款](https://ai.google.dev/gemini-api/terms#paid-services)｜[Anthropic 保留期](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) |

## 待決策問題

1. 是否願意先向教育部與 KaedeTai 索取「以辭典文字／音檔訓練並商用散布權重、提供 SaaS、使用輸出音檔」的書面許可？未取得前是否接受只做封閉內部 PoC？
2. `≤3 秒` 是從看護停止說話開始，還是從 Google `zh-TW` 已返回開始計算？首段可播放或整句音檔完成才算？
3. 目標阿嬤主要腔口與地區為何？是否能安排至少 3 位文字評測、5 位語音評測母語者，並包含實際長輩？
4. 是否接受第三方雲端 LLM 接觸去識別後的照護短句？若不接受，離線 MT 品質較弱與 titan 資源競爭要由產品承擔。
5. 正式聲音要使用真人授權新錄、專業配音員，或以使用者家屬聲音建立 reference？同意書須涵蓋 voice cloning、商用、期限、地區、再訓練與撤回處理。
6. `linguardia/opus-mt-zh-nan` 的 CC BY-SA 資料衍生與 Apache 權重組合，是否交法務審查；若需對模型／輸出做 ShareAlike，產品是否接受？
7. 高風險照護句是否先建人工核准、版本化的台文／台羅／錄音句庫，開放式翻譯只作未命中路徑？這不是華語 TTS 退路；依既定決策，任何播放給阿嬤的 fallback 仍必須是台語。
