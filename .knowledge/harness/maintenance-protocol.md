# 維護協議 — 弱模型如何安全地更新制度檔案

> **版本**: v1.0（2026-07-06，Fable 5 制度建設 session）
> **核心風險**: `diagnosis.md` 錯 3——弱模型憑印象改制度檔案是全局性危險。本協議把「能不能改」變成查表題。
> **與決策表表 7 的分工**: 表 7 管 hook／CLAUDE.md／決策表本身的技術前置條件；本文件管**權限分級與流程**。兩邊都要過。

---

## 1. 權限分級表（改任何檔案前先查這張）

### 綠區——可自行改，改完在第 4 節變更紀錄追加一行

| 檔案 | 允許的動作 |
|------|-----------|
| `.knowledge/postmortem-log.md` | 經 `/pitfall-record`／`/pitfall-resolve` 追加或標記（不走 skill 不准動） |
| 踩坑快速參考表（QUICKREF 段） | 追加一行式「場景 → 規則」（格式照既有行；寫不成一行的只進詳細紀錄） |
| `decision-tables.md` | **追加**符合表 7 條件的 if-then 行（新增可以；修改或刪除既有規則屬紅區） |
| `.knowledge/harness/letter-to-future-sessions.md` | 追加交接段（只加不刪） |
| `.tasks/`、`proposal/` | 照既有 skill 流程 |
| 明顯失效的路徑／typo（任何檔案） | 可修，但「明顯」的操作定義 = **指令輸出可證明的失效**（路徑不存在、指令已改名、行號指錯），commit message 附該輸出。門檻數字、規則語意、你覺得拗口的措辭**都不算 typo**，屬黃區 |

### 黃區——先提案，老闆同意才改（提案 = 引原文＋改後全文＋一句理由）

| 檔案 | 原因 |
|------|------|
| `CLAUDE.md`（專案級） | 每 session 必載，錯一行影響所有未來 session |
| `.knowledge/harness/model-dispatch.md` 的門檻數字（升降級輪數、派工門檻） | 門檻是刻意保守的熔斷值，「覺得太嚴」正是它要防的心態 |
| `.knowledge/harness/judgment-rubrics.md` 的判準內容 | 判準是強模型判斷力的外化，弱模型用自己的判斷改判準是自我循環 |
| `.knowledge/harness/delegation-templates.md` 的模板結構 | 可追加新模板（提案）；既有模板的驗收條件段不得刪弱 |
| `.claude/hooks/**`、`.claude/settings.json` | 表 7 技術前置＋本表流程，兩者都要 |
| `decision-tables.md` 既有規則的修改／刪除 | 同上 |
| 新建 `.claude/agents/*.md`（自訂 subagent／effort 控制） | 會改變調度行為 |

### 紅區——沒有老闆明確指示，任何情況都不動

| 檔案 | 原因 |
|------|------|
| 工作區根目錄 `CLAUDE.md`（`ALL PROJECT\CLAUDE.md`） | 影響全部 14 個專案，且不在 git 版控內，改壞難回溯 |
| 刪除或放寬任何熔斷／證據規則 | 防線只能收緊提案，不能放鬆自便 |
| `.knowledge/harness/backups/**` | 備份是回滾的最後手段 |
| `Desktop\AgentHub\Agent-hub\`（Verify clone） | 既有鐵律，hook 硬擋 |

## 2. 修改流程（黃區與綠區的 decision-tables／CLAUDE.md 類都走這條）

1. **獨立分支**：制度變更不與日常任務混分支混 session（`diagnosis.md` 焦 2）。分支名 `agent/<id>/harness-<主題>`
2. **先備份**：改前 `cp <檔案> .knowledge/harness/backups/<檔名>.<YYYY-MM-DD>.bak`
3. **改**：新內容盡量寫成新檔＋原檔放路由，而不是把原檔越改越長
4. **自檢**：新寫的每條規則過「弱模型可執行性三問」（`judgment-rubrics.md` 判準 5）
5. **驗收不自驗**：派 fresh-context agent 用 `delegation-templates.md` 模板 5 做 read-back＋一致性檢查（找新舊規則打架）
6. **登記**：本文件第 4 節變更紀錄加一行；被改檔案頂部「版本」行同步更新
7. 涉及 hook：另過表 7 全部前置＋`node scripts/smoke-test-hooks.cjs`

## 3. 教訓寫回哪裡（踩坑後 5 分鐘內做，不要「等會兒」）

| 教訓類型 | 寫到哪 | 格式 |
|---------|-------|------|
| 一般踩坑（程式、環境、流程） | `/pitfall-record`（自動落 postmortem-log＋評估進 quickref／決策表） | 該 skill 內建 |
| 調度失誤（派錯模型、驗收放水、升級太慢） | 同上走 `/pitfall-record`，場景欄標「調度」 | 一行式：情境 → 正確做法 |
| 制度檔案本身的缺陷（規則矛盾、路徑失效、弱模型讀不懂） | 綠區直接修（typo／路徑）或黃區提案；當下先在本文件第 4 節記一行 | 見第 4 節 |
| 對未來 session 的提醒（尚無結論的觀察） | `letter-to-future-sessions.md` 追加段 | 日期＋觀察＋建議 |

## 4. 變更紀錄（append-only，最新在上）

| 日期 | 檔案 | 動作 | 誰／哪個 session |
|------|------|------|----------------|
| 2026-07-06 | harness/ 六檔＋decision-tables 表 7＋根 CLAUDE.md | 對抗審查修正（findings 見 harness/review-findings-2026-07-06.md，A-1~A-3、C-1~C-4、D、E-1~E-2 全數修復） | Fable 5 制度建設 session |
| 2026-07-06 | harness/ 全套六檔＋兩份 CLAUDE.md 改寫 | 初版建立 | Fable 5 制度建設 session |

## 5. 精簡時機（膨脹是制度的慢性死因）

| 對象 | 門檻 | 動作 |
|------|------|------|
| SessionStart 注入總量 | > 5,500 chars（上限 6,000，hook 會截斷） | 合併 quickref 中同類舊行（保留 PM 編號），細節留在 log 本文。屬黃區提案 |
| 踩坑快速參考表 | > 35 行 | 同上 |
| `CLAUDE.md` | > 100 行（表 7 鐵律） | 內容外移成引用檔 |
| harness 各檔 | 單檔 > 300 行 | 拆分或濃縮，走黃區提案 |
| 本文件變更紀錄 | > 40 行 | 最舊的歸檔到 `backups/maintenance-log-archive.md` |
| `backups/` | 同一檔案 > 5 份備份 | 留最新 3 份 |

## 6. 規則衝突時

發現兩份文件互相矛盾：**不自行裁決**（決策表表 3）。引用兩處原文問老闆，等待裁決期間按較嚴格的那條執行。唯一例外：一邊明顯是失效殘留（路徑已不存在、指令已改名）且有指令輸出佐證——按綠區修並登記。
