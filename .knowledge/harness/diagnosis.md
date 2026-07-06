# Harness 快速診斷 — 漏 token、失焦、出錯 前三名

> **版本**: v1.0（2026-07-06，Fable 5 制度建設 session）
> **用途**: 後續所有 harness 文件（model-dispatch / judgment-rubrics / delegation-templates / maintenance-protocol）引用的問題定義。每個問題的修法落在哪個檔案，就寫在哪一欄。
> **證據基礎**: 本 session 實測盤點（指令與輸出見文末「盤點方法」）。標「推斷」的項目未經量測，是根據 postmortem 紀錄的合理推論。

---

## 一、最漏 token 前三名

### 漏 1（最大宗）：指揮官親自下場做執行層工作

- **症狀**: 主對話自己大量 `Read` 整檔、`Grep` 掃 repo、跑長輸出指令。工具輸出全部堆進主對話 context → 提早觸發 compact → 失憶 → 重讀同樣的檔案 → 二次漏。
- **證據**: 本專案 `agents/definitions/` 共 7,217 行、`.claude/commands/` 共 78KB——任何「全部讀一遍」的動作單次就吃掉數萬 token。PM-011 的 20 天假修復迴圈中，每輪除錯都重新載入整條 pipeline 的檔案（推斷）。
- **修法**: `model-dispatch.md` 第 1 條「指揮官不下場」——大量讀取一律派 Explore/general-purpose subagent，主對話只收結論與 `檔案:行號`。

### 漏 2：固定注入疊層裡的重複規則

- **症狀**: 每個 session 的固定開銷 = 根目錄 CLAUDE.md（56 行）＋專案 CLAUDE.md（84 行）＋ SessionStart 注入（實測 4.3KB / 上限 6KB）＋ AgentHub agent 定義 system prompt（如 project-lead.md 1.4KB）。同一條規則（如 IPC 四方同步、完成=證據）同時出現在 CLAUDE.md、踩坑快速參考表、決策表三處。
- **證據**: 實測 `wc`：quickref 注入段 3,106 chars、決策摘要注入段 1,196 chars；「IPC 四方同步」在三份文件各出現一次。
- **修法**: CLAUDE.md 改寫原則「**一條規則只活在一個地方，其他地方只放一行路由**」（2026-07-06 已套用）；注入段行數上限與精簡時機見 `maintenance-protocol.md`。
- **注意**: 4 條致命規則（文件即法律 / 四方同步 / 不猜 / 完成=證據）的重複是**故意的防禦性冗餘**（hook 注入失敗時 CLAUDE.md 仍在），不要為了省 token 刪掉。

### 漏 3（跨 session、最貴）：重試迴圈不設熔斷

- **症狀**: 同一症狀反覆修，每一輪都是一個新 session 重新載入全部 context、重新理解問題。這不是單 session 的 token 漏，是**乘以輪數**的漏。
- **證據**: PM-011 三次假修復燒掉 20 天；PM-010 hope-based 推論反覆三次。
- **修法**: 決策表表 2 已有「除錯熔斷」（同症狀第 3 次停手）；本次補上缺的另一半——**模型能力熔斷**（同一子任務同一模型連錯兩次就升級，不是無限重試），見 `model-dispatch.md` 升降級路徑。

---

## 二、最容易失焦前三名

### 焦 1：讀了規則但不在「需要判斷的時刻」想起來查表

- **症狀**: SessionStart 注入保證了「看到教訓」，但弱模型在除錯到第 3 次、或想宣告完成時，不會自動意識到「現在就是該查表的時刻」。
- **修法**: `judgment-rubrics.md` 把每個「需要判斷的時刻」定義成**可觀察的觸發訊號**（例：「我正要打出『應該可以了』這幾個字」= 觸發完成判準檢查），而不是抽象要求。

### 焦 2：一個 session 混做多件不相干的事

- **症狀**: 日常任務做到一半順手改制度檔案、或修 bug 途中被新需求岔開，兩件事的 context 互相稀釋，兩件都做不完。
- **修法**: `maintenance-protocol.md` 規定制度變更獨立分支獨立 session；`model-dispatch.md` 規定岔出的新需求一律先落 `.tasks/` 或 backlog，不當場做。

### 焦 3：長任務中段丟失驗收條件

- **症狀**: 派工時沒寫下驗收條件，subagent（或主模型自己）做到後半段用「感覺完成了」取代原始目標。
- **修法**: `model-dispatch.md` 派工三件套強制在派工 prompt 裡寫驗收條件；`delegation-templates.md` 每份模板內建驗收條件填空，空著就不准派。

---

## 三、最容易出錯前三名

### 錯 1：宣告完成但證據不對級

- **症狀**: 拿單元測試綠交差資料類修復（PM-011）、拿 typecheck 過交差 UI 行為變更。preflight 擋得住「完全沒證據」，擋不住「證據等級不夠」。
- **修法**: 決策表表 1 已有證據等級表；`judgment-rubrics.md` 判準 2 補正反例讓弱模型能對號入座。

### 錯 2：Windows 環境陷阱

- **症狀**: `python3`/`findstr`/PowerShell 語法/路徑含空格/ConPTY 不繼承 env var（PM-004）。錯誤本身小，但會觸發重試迴圈（見漏 3）。
- **修法**: CLAUDE.md 執行環境段保留；`delegation-templates.md` 每份模板內建「環境提示」段，派工時自動帶給 subagent（subagent 不繼承主對話的 CLAUDE.md 理解深度）。

### 錯 3（最危險）：弱模型憑印象修改制度檔案本身

- **症狀**: 弱模型覺得某條規則「太嚴了」或「應該是這個意思」就直接改 `.knowledge/` 或 hook。制度檔案被悄悄劣化後，防線失效是全局性的。
- **證據**: PM-009 hook 被靜默繞過躺了 2 個月（同類風險的既往案例）。
- **修法**: `maintenance-protocol.md` 分級權限表——哪些檔案弱模型可自行改、哪些必須先問老闆；決策表表 7 已有 hook 修改前置條件。

---

## 盤點方法（本診斷的證據來源）

本 session 實際執行過的量測（2026-07-06）：

```bash
wc -l CLAUDE.md ../../../CLAUDE.md .knowledge/decision-tables.md .knowledge/postmortem-log.md
# → 84 / 56 / 124 / 326
awk '/QUICKREF:START/,/QUICKREF:END/' .knowledge/postmortem-log.md | wc -c   # → 3106
awk '/INJECT:START/,/INJECT:END/' .knowledge/decision-tables.md | wc -c      # → 1196
wc -l agents/definitions/*/*.md | tail -1    # → 7217 total
wc -c .claude/commands/*.md | tail -1        # → 78472 total
cat ~/.claude/plugins/installed_plugins.json # → {"plugins": {}} （claude-mem 已下載未啟用）
```

**未量測、標註為推斷的項目**: 各 session 實際 compact 頻率、subagent 使用率、每輪重試的實際 token 成本——目前 harness 沒有這些數據的紀錄機制（改善建議見 `letter-to-future-sessions.md`）。
