# ARS 學術出版 Agent 使用說明書

> **ARS = Academic Research Skills**（Claude Code plugin，v3.22.2）
> 從「模糊的研究想法」一路做到「可投稿的論文」：研究 → 撰寫 → 誠信檢查 → 審稿 → 修訂 → 定稿。
> 安裝位置：`~/.claude/plugins/cache/academic-research-skills/academic-research-skills/3.22.2/`
> 原廠完整文件（繁中）：同目錄下 `README.zh-TW.md`、`docs/SETUP.zh-TW.md`、`docs/PERFORMANCE.zh-TW.md`

> 🧭 **不知道從哪開始？直接跳到「第 4 節：依你手上有什麼選路線」。**

---

## 1. 確認有裝好

開一個新的 Claude Code session，開頭應出現：

```
ARS (academic-research-skills) plugin loaded.
Slash commands (16) ...
```

輸入 `/ars` 會跳出補全清單。清單顯示為 `/academic-research-skills:ars-3w (ars-3w)`，
**完整名稱與短名稱 `/ars-3w` 都可以打**。

---

## 2. 兩種使用方式

### 方式 A：直接講人話（推薦新手）

Claude 會自動判斷該用哪個 skill 與模式：

| 你說… | 會觸發 |
|-------|--------|
| 「我對 X 有個模糊想法，幫我釐清研究問題」 | deep-research 蘇格拉底模式（問你 5–15 輪） |
| 「幫我寫一篇關於 X 的論文」 | academic-paper |
| 「幫我審這篇」（附上論文） | academic-paper-reviewer |
| 「我收到審查意見了」（附上意見） | academic-paper revision-coach |
| 「我要從研究到完成一整篇論文」 | academic-pipeline（完整 10 階段） |

> ⚠️ 如果你**同時丟多種材料**（例如：草稿＋審查意見＋參考文獻）又沒講要做什麼，
> Claude 會先列出 a/b/c/d 選項請你選，不會自己猜。這是刻意設計，不是故障。

### 方式 B：用斜線指令（明確指定模式，不會被誤判）

```
/ars-3w 生成式 AI 對高等教育評量的影響
/ars-abstract （接著貼上論文全文）
```

---

## 3. 指令速查表

`模型` 欄：**sonnet** = 固定用 Sonnet（便宜快）；**inherit** = 用你目前 session 的模型（較貴、較強）。

### 🔍 研究階段

| 指令 | 用途 | 你要提供 | 模型 |
|------|------|---------|------|
| `/ars-3w` | WHY / HOW / WHAT 三段式文獻掃描，快速比較幾篇論文 | 主題 | sonnet |
| `/ars-lit-review` | 帶註解的文獻回顧（論文格式） | 主題或論文清單 | sonnet |

### ✍️ 撰寫階段

| 指令 | 用途 | 你要提供 | 模型 |
|------|------|---------|------|
| `/ars-plan` | 蘇格拉底式逐章規劃（它問、你答） | 研究主題 | sonnet |
| `/ars-outline` | 詳細大綱＋證據地圖（不寫全文） | 主題／研究問題 | sonnet |
| `/ars-abstract` | 雙語摘要＋關鍵字（預設 繁中＋英文） | 論文全文 | sonnet |
| `/ars-format-convert` | LaTeX / DOCX / PDF / Markdown 互轉、引用格式互轉 | 論文檔案 | sonnet |

### 🔎 檢查階段

| 指令 | 用途 | 你要提供 | 模型 |
|------|------|---------|------|
| `/ars-citation-check` | 引用錯誤報告（缺漏、內文與文獻表不符、格式錯） | 論文全文 | inherit |
| `/ars-disclosure` | 查投稿目標的 AI 使用揭露規定（ICLR / NeurIPS / Nature / Science / ACL / EMNLP / ICMJE / NEJM / Lancet / JAMA / BMJ / PLOS / Frontiers…） | 目標期刊／會議 | sonnet |

### 🧑‍⚖️ 審稿與修訂階段

| 指令 | 用途 | 你要提供 | 模型 |
|------|------|---------|------|
| `/ars-reviewer` | 模擬 5 人審稿團（期刊適配＋3 位審稿人＋魔鬼代言人）。可加 `quick` / `methodology-focus` / `re-review` / `guided` | 論文全文 | inherit |
| `/ars-revision-coach` | 解析審查意見 → 修訂路線圖＋回覆信骨架（**不改論文**） | 審查意見 | inherit |
| `/ars-revision` | 實際產出修訂稿＋逐點回覆 | 論文＋審查意見 | sonnet |
| `/ars-rebuttal-audit` | 檢查你**已寫好**的回覆信有沒有漏回、有沒有風險 | 審查意見＋你的回覆稿（兩者都要） | sonnet |

> 只有審查意見、還沒寫回覆 → 用 `/ars-revision-coach`；回覆已寫好要檢查 → 用 `/ars-rebuttal-audit`。

### 🚀 全流程

| 指令 | 用途 | 模型 |
|------|------|------|
| `/ars-full` | 10 階段：深度研究 → 撰寫 → 誠信檢查 → 審稿 → 修訂 → 再審 → 再修 → 最終誠信檢查 → 定稿。**每階段都會停下來等你確認** | inherit |

### 🗂️ 引用驗證輔助（進階，配合 pipeline 使用）

| 指令 | 用途 |
|------|------|
| `/ars-mark-read <citation_key>` | 聲明「這篇我真的讀過」（須附讀了多少：`--scope full_text / sections / abstract_only / toc_only / unknown`） |
| `/ars-unmark-read <citation_key>` | 撤回上述聲明 |
| `/ars-cache-invalidate <citation_key>` | 清掉某篇引用的驗證快取，強制重新查 Crossref / OpenAlex / Semantic Scholar / arXiv |

---

## 4. 依「你手上有什麼」選路線（分階段操作指南）

先看自己在哪一格，再往下讀對應的階段：

| 你現在的狀態 | 走哪一階段 |
|-------------|-----------|
| 只有一個想法／一個方向，連研究問題都還不確定 | **階段 A** |
| 手上已有幾篇論文（自己的或別人的），想合併、重新思考、找新切角 | **階段 B** |
| 一篇文章已經寫好（初稿或完稿），想投稿或收到審查意見 | **階段 C** |

> 💡 **兩種下指令法**：有斜線指令的直接打（如 `/ars-3w`）；沒有斜線指令的模式（如蘇格拉底研究、快速簡報、事實查核、系統性回顧），**用下表的「觸發句」直接講**，Claude 會自動接到對應模式。

---

### 階段 A：我只有一個想法

**目標**：把模糊想法 → 收斂成「可研究的研究問題」→ 章節規劃 → 大綱。

| 步驟 | 做什麼 | 怎麼下指令 | 你會拿到 |
|:---:|--------|-----------|---------|
| A1 | 釐清研究問題（它問、你答，5–15 輪） | 說：「**我對 ○○ 有個模糊想法，但不確定研究問題怎麼定，引導我想清楚**」 | 研究計畫摘要＋INSIGHT 清單 |
| A2 | 看這個領域大概長怎樣 | 說：「**幫我做 ○○ 的 quick brief**」（500–1,500 字簡報）<br>或 `/ars-3w ○○`（挑幾篇代表論文比 WHY/HOW/WHAT） | 領域速覽／論文短名單 |
| A3 | 逐章規劃論文 | `/ars-plan ○○（貼上 A1 的研究問題）` | 章節計畫 |
| A4 | 產出大綱＋證據地圖 | `/ars-outline` | 每節要寫什麼、引哪些證據 |
| A5 | 開始寫 | 自己寫，或說「**依這份大綱寫論文全文**」 | 初稿 → 接 **階段 C** |

**範例開場白：**
```
我對「生成式 AI 讓大學生的寫作評量失真」這件事有感覺，
但不確定要研究的是評量設計、學生行為、還是教師因應。引導我想清楚。
```

**注意**
- A1 是蘇格拉底模式，**它刻意不直接給答案**。覺得太慢想直接要東西 → 跳 A2 / A4。
- 想一路自動走到底 → 直接 `/ars-full ○○`（10 階段、每階段停下等你確認，約 US$3–7）。

---

### 階段 B：我有一些東西（幾篇論文），想合併、重新思考

**目標**：把手上散落的材料 → 找出共通點、分歧、缺口 → 長出「新的」研究問題 → 回到階段 A 的 A3 往下走。

| 步驟 | 做什麼 | 怎麼下指令 | 你會拿到 |
|:---:|--------|-----------|---------|
| B1 | 把手上論文橫向比較 | `/ars-3w`，接著貼上／附上那幾篇論文（PDF 或全文）<br>觸發句也可：「**compare these papers**」 | 每篇的 WHY/HOW/WHAT ＋ 跨論文綜整（共同的 WHY、分歧的 HOW、最強的 WHAT、**尚未解決的缺口**） |
| B2 | 需要更完整的文獻地圖 | `/ars-lit-review`（帶註解的文獻回顧）<br>要做到 PRISMA 等級 → 說「**幫我做 ○○ 的 systematic review**」 | 文獻回顧／PRISMA 報告 |
| B3 | 檢查舊論文裡的說法還站不站得住 | 說：「**幫我 fact-check 這些主張**」（貼上要查的句子） | 逐條主張驗證報告 |
| B4 | 重新思考：從舊材料長出新問題 | 說：「**引導我想清楚**」，並**貼上舊論文的 Limitations 段落＋之前收到的審查意見**，說說你自己覺得它們代表什麼 | 新的研究計畫摘要 |
| B5 | 接回撰寫 | `/ars-plan` → `/ars-outline`（同階段 A 的 A3–A5） | 新論文的章節與大綱 |

**範例開場白（B1）：**
```
/ars-3w
我附上 4 篇論文（其中 2 篇是我自己發表的），
想找出它們的共通問題和還沒被回答的缺口，看能不能合併成一篇新的研究。
```

**注意（重要）**
- **ARS 沒有跨論文記憶**：它不會記得你上一篇寫過什麼。每次都要**明確把舊論文／舊參考文獻／舊審查意見丟進去**。
- **它不會幫你決定新的研究問題**：B4 階段它只會針對你給的材料提問、指出模式，**新研究問題必須由你提出**。這是刻意設計（避免研究問題變成 AI 產的）。
- 最有價值的舊材料通常**不是參考文獻，而是舊論文的 Limitations 和沒處理完的審查意見** — B4 一定要貼。
- 舊論文若是用 ARS 寫的，可以把當時的 Material Passport（材料護照）一起丟進去，引用驗證會快很多（有 90 天快取）。

---

### 階段 C：我有一篇文章寫好了

先分清楚你是哪一種情況：

#### C-1　還沒投稿 → 投稿前自我檢查

| 步驟 | 做什麼 | 怎麼下指令 |
|:---:|--------|-----------|
| C1 | 引用有沒有錯（缺漏、內文與文獻表不符、格式） | `/ars-citation-check`（附全文） |
| C2 | 先快速看一眼大問題 | 說：「**quick review 這篇**」 |
| C3 | 模擬正式審稿（5 位審稿人＋編輯決定＋修訂路線圖） | `/ars-reviewer`（附全文）<br>只想看方法 → 說「**focus on methods 審這篇**」 |
| C4 | 依模擬審稿修改 | `/ars-revision`（附論文＋C3 的審稿意見）<br>想自己改、要它一題一題陪你 → 說「**guide me to improve，一題一題帶我改**」 |
| C5 | 確認修好了沒 | 說：「**re-review，檢查修訂有沒有處理到**」 |
| C6 | 雙語摘要＋關鍵字 | `/ars-abstract` |
| C7 | 目標期刊的 AI 使用揭露規定 | `/ars-disclosure ○○期刊` |
| C8 | 轉成投稿格式 | `/ars-format-convert 轉成 LaTeX／DOCX`（也可轉引用格式，如 APA → IEEE） |

#### C-2　已投稿，收到真實審查意見（R&R）

| 步驟 | 做什麼 | 怎麼下指令 |
|:---:|--------|-----------|
| C9 | 拆解審查意見，排出修訂優先順序 | `/ars-revision-coach`（貼上審查意見）→ 拿到修訂路線圖＋回覆信骨架，**不會動你的論文** |
| C10 | 修改論文 | 自己改，或 `/ars-revision`（附論文＋審查意見）產出修訂稿＋逐點回覆 |
| C11 | 回覆信寫好後，檢查有沒有漏回、有沒有地雷 | `/ars-rebuttal-audit`（**審查意見＋你的回覆稿兩者都要給**） |
| C12 | 送回前最後一次模擬再審 | 說：「**re-review**」 |
| C13 | 再跑一次引用檢查 | `/ars-citation-check` |

**範例開場白（C9）：**
```
/ars-revision-coach
這是我投 ○○ 期刊收到的 Major Revision，三位審稿人意見如下：（貼上）
```

**注意**
- C3 的模擬審稿**不能取代真實審稿**，但很適合在投稿前抓出明顯漏洞。
- 投稿前**一定要跑 C1**；AI 協助產生的引用務必親自核對（讀過的可用 `/ars-mark-read` 記錄）。
- C-2 的順序口訣：**先拆（coach）→ 再改（revision）→ 最後驗（rebuttal-audit）**。

---

### 一張圖看三個階段怎麼接

```
 階段 A：只有想法                  階段 B：有幾篇論文
 ┌──────────────┐               ┌──────────────────┐
 │ A1 釐清問題    │               │ B1 /ars-3w 比較    │
 │ A2 quick brief│               │ B2 lit-review     │
 └──────┬───────┘               │ B3 fact-check     │
        │                       │ B4 貼 Limitations  │
        │                       │    重新釐清問題     │
        │                       └────────┬─────────┘
        └───────────┬────────────────────┘
                    ▼
          A3 /ars-plan → A4 /ars-outline → A5 寫初稿
                    │
                    ▼
 階段 C：文章寫好了
   C-1 投稿前：citation-check → reviewer → revision → re-review
               → abstract → disclosure → format-convert → 投稿
   C-2 收到意見：revision-coach → revision → rebuttal-audit → re-review → 送回
```

懶得分段、預算夠 → 任何階段都可以改用 `/ars-full` 一次走完全程（每階段仍會停下等你確認）。

---

## 5. 成本與時間

| 項目 | 估計 |
|------|------|
| `/ars-full` 一次完整跑完 | 約 US$3–7（2026-09 定價，未計快取折扣；出處：`docs/PERFORMANCE.zh-TW.md`） |
| 全流程所需時間 | 數小時到數天（視你每階段審得多仔細） |
| sonnet 指令（`/ars-3w`、`/ars-abstract` 等） | 明顯便宜，適合日常與測試 |

**省錢原則**：測試或日常用 sonnet 指令；只有真的要整篇產出才用 `/ars-full`。

---

## 6. 與 AgentHub 內建學術 Skill 的分工

AgentHub 本身也有學術部門 skill（`lit-review`、`peer-review`、`cite-manage`、`academic-writing`、`nstc-grant`、`venue-format` 等）。

| 需求 | 建議用 |
|------|--------|
| 國科會計畫書（CM 表格） | AgentHub `nstc-grant`（ARS 沒有） |
| 學術海報、研討會投影片 | AgentHub `research-poster` / `research-slides`（ARS 沒有） |
| 完整論文 pipeline、模擬多人審稿、R&R 回覆 | **ARS**（流程更完整、有誠信檢查關卡） |
| 引用真偽驗證 | 兩者皆可；ARS 有跨 4 個資料庫的驗證快取 |

---

## 7. 常見問題

**Q：打 `/ars-xxx` 沒反應？**
開新 session 看開頭有沒有「ARS plugin loaded」。沒有的話，重新安裝 plugin。

**Q：Claude 一直問我問題，不直接寫？**
`/ars-plan` 與蘇格拉底模式本來就是「它問你答」，目的是讓研究想法是你的。想直接要產出，改用 `/ars-outline`。

**Q：產出的引用可以直接信嗎？**
不行。投稿前一定要跑 `/ars-citation-check`，並親自讀過關鍵文獻（可用 `/ars-mark-read` 記錄）。標記為 `LOW-WARN` 的引用代表尚未經人工確認。

**Q：摘要想要其他語言？**
預設是 繁中＋英文，在請求中直接講明要的語言對即可。
