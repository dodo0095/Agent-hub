# Harness 制度文件審查報告 — fresh context 對抗審查

> **審查者身分**: 未參與撰寫，不知作者意圖，僅依文件本身判定。
> **審查日期**: 2026-07-06
> **審查對象**: `.knowledge/harness/*.md`（6 檔）＋ repo `CLAUDE.md` ＋ 工作區根 `CLAUDE.md`
> **對照制度**: `decision-tables.md`、`postmortem-log.md`、`doc-governance.md`

---

## 嚴重度分級說明

- **T1 會導致做錯事**：照文件字面執行會產生錯誤行為或違反更高層規則
- **T2 會導致困惑**：文件之間或文件自身自相矛盾，讀者需要額外猜測
- **T3 措辭**：寫法可以更好，但不影響行為正確性

---

## A. 規則互相打架

### A-1（T1）decision-tables.md 表 7 對「加規則進 CLAUDE.md」的前置條件遺漏 maintenance-protocol.md 的黃區審批門檻

- **原文 1**: `.knowledge/decision-tables.md:120`
  > 加規則進 CLAUDE.md | 先問「能不能改用 hook 強制」（能就不要靠 prompt）；CLAUDE.md 總行數 ≤ 100 的索引原則不可破
- **原文 2**: `.knowledge/harness/maintenance-protocol.md:5`
  > **與決策表表 7 的分工**: 表 7 管 hook／CLAUDE.md／決策表本身的技術前置條件；本文件管**權限分級與流程**。兩邊都要過。
  同檔 `maintenance-protocol.md:26-27` 將「CLAUDE.md（專案級）」列為黃區——需先提案、老闆同意才能改。
- **問題**: `maintenance-protocol.md` 單方面聲稱「兩邊都要過」，但 `decision-tables.md` 表 7 那一行完全沒有反向連結、也沒提到需要老闆核可。decision-tables.md 是舊檔（版本 2026-07-04，先於 harness 套件存在）且其核心摘要被 SessionStart 自動注入，是模型更可能先查、更信任的來源。模型若只查表 7 就照做「先問能不能用 hook＋行數 ≤100」兩項就動手改 CLAUDE.md，會漏掉黃區審批，繞過本次新立的核准流程。
- **建議修法**: 在 decision-tables.md 表 7 該行加一句「另需過 `maintenance-protocol.md` 黃區審批」。

### A-2（T1）model-dispatch.md 的「掃 repo」派工門檻與 delegation-templates.md 模板 1 的適用範圍互相矛盾

- **原文 1**: `.knowledge/harness/model-dispatch.md:19`
  > 掃 repo / 找東西 | 不確定目標在哪個檔案、需要嘗試多種關鍵字
  同檔 `model-dispatch.md:26` 「指揮官自己做、不派」列出「讀單一已知檔案的已知段落」。
- **原文 2**: `.knowledge/harness/delegation-templates.md:31-45`（模板 1：搜尋／盤點）範例本身寫「找出所有讀取 cost 資料的程式碼路徑」——這類任務通常關鍵字是已知的（如已知函式名／檔名），並不符合「不確定目標在哪個檔案、需要嘗試多種關鍵字」的派工門檻。
- **問題**: 兩份文件對同一種常見任務（「找出所有 X」）給出不一致的判準：`model-dispatch.md` 字面上要求「不確定＋需要多種關鍵字」才夠格派工，但 `delegation-templates.md` 把「找出所有 X」直接做成標準模板來鼓勵派工，並未附帶「先確認關鍵字是否已知、已知則自己 grep」的但書。見下方 D 節實測，我在填寫模板 1 時無法判定一個已知確切檔名的搜尋任務究竟該不該派。
- **建議修法**: `model-dispatch.md:19` 加一句「已知確切字串/檔名的單次 grep，指揮官自己做，不派」；或在模板 1 開頭加同樣但書。

### A-3（T2）workspace root CLAUDE.md 新增段落與自身 Rule 1 的可達性矛盾

- **原文 1**: `C:\Users\Bandai\Desktop\ALL PROJECT\CLAUDE.md:42-48`（新增段，經與備份 `CLAUDE.md.bak-20260706` diff 確認）
  > ## 模型調度與委派（全工作區通用）
  > ...完整守則與派工模板（canonical，維護於 Agent-hub repo，各專案通用）：
  > `Agent-hub/.knowledge/harness/model-dispatch.md` ＋ `delegation-templates.md` ＋ `judgment-rubrics.md`
- **原文 2**: 同檔 `CLAUDE.md:12-14`（第一條規則）
  > 1. 執行 `pwd` 確認你在哪個子專案目錄
  > 2. **讀該子專案自己的 `CLAUDE.md`**——那才是你的法律，本檔案只是路標
- **問題**: Rule 1 明確教導「找到子專案自己的 CLAUDE.md 後，那才是法律，本檔案只是路標」。14 個子專案中 11 個有自己的 CLAUDE.md（見索引表 ✅）。一個在 `fintech_web` 工作的 agent，依 Rule 1 執行後會去讀 `fintech_web/CLAUDE.md` 當法律，根目錄檔案的角色被定義為「只是路標」——不會有動機往下讀到第 42 行這段「全工作區通用」的委派規則，除非 `fintech_web/CLAUDE.md` 自己也顯式指回這段。也就是說，這段新規則的「全工作區通用」意圖，靠現有結構大機率不會被其他 13 個子專案的 agent 實際看到。
- **備註**: `letter-to-future-sessions.md:42` 已誠實承認「傳播到其他 13 個子專案未做（刻意不做），根目錄 CLAUDE.md 已加路由」——所以作者知道這只是路由不是傳播，此點不算「隱藏的矛盾宣稱」，但路由本身在 Rule 1 的敘事下能否被觸達仍是懸而未決的設計問題，值得記一筆。
- **建議修法**: 若要讓其他子專案真的用到，需在各子專案自己的 CLAUDE.md 加一行指回這段；或把這段移到根目錄檔案「第一條規則」之前／之內，改變其可達性。

---

## B. 路徑與名稱錯誤（附實際指令輸出）

**結論：檢查過的項目全部通過，無失效路徑或不存在的指令/skill。**

驗證指令與結果：
```
scripts/preflight.cjs EXISTS
scripts/smoke-test-hooks.cjs EXISTS
.claude/agents 目錄 MISSING（model-dispatch.md:61 聲稱「本專案目前沒有 .claude/agents/ 目錄」——相符）
.claude/hooks/ 內含 forbidden-commands.js, g1~g5 系列, protect-verify-clone.js, session-start-context.js, stop-validator.js（皆存在）
.claude/commands/ 下 pitfall-record.md, pitfall-resolve.md, harness-audit.md, knowledge-feedback.md 均存在
.knowledge/{project-overview,architecture,directory-structure,coding-standards,testing-standards,
  quality-checklist,doc-governance,design-system,team-hierarchy,company-rules,
  team-workflow,postmortem-common}.md 全部存在
.knowledge/academic/*、.knowledge/specs/*、.knowledge/company/* 目錄與檔案存在
hook-execution.jsonl 的實際寫入者：forbidden-commands.js:16、g1-design-check.js:16、
  g4-knowledge-check.js:16、g5-pre-deploy.js:43、protect-verify-clone.js:52（均有 fs.appendFileSync）；
  stop-validator.js、session-start-context.js 讀取同檔 — letter-to-future-sessions.md 稱其為
  「防線心跳紀錄」屬實，非空頭承諾
.claude/hook-execution.jsonl 實際存在，27 行（非空檔，機制確實在運作）
~/.claude/plugins/installed_plugins.json 內容為 {"version":2,"plugins":{}} — 與 diagnosis.md:82／
  letter-to-future-sessions.md:16「claude-mem 已下載未啟用」相符；另確認
  ~/.claude/plugins/data/claude-mem-thedotmack 目錄存在，佐證「已下載」
~/.claude/CLAUDE.md 不存在 — 與 letter-to-future-sessions.md:16 聲稱相符
.knowledge/harness/backups/ 內有 CLAUDE.md.agent-hub.2026-07-06.bak 與
  CLAUDE.md.workspace-root.2026-07-06.bak，與 maintenance-protocol.md 流程相符
ALL PROJECT\CLAUDE.md.bak-20260706 存在 — 與 letter-to-future-sessions.md:45 相符
agents/definitions/*/*.md 共 7217 行 — 與 diagnosis.md:80/14 聲稱的「7,217 行」數字相符
.claude/commands/*.md 共 78472 bytes — 與 diagnosis.md:81/14 聲稱的「78KB」相符
```

無「無法判定」項目。

---

## C. 弱模型會誤讀的模糊語句

### C-1（T2）model-dispatch.md:18「單檔 > 400 行且只需要其中結論」

- **原文**: 「大量讀取 | 預期要讀 > 3 個檔案，或單檔 > 400 行且只需要其中結論」
- **會怎麼誤讀**: 「預期」是動作前的主觀判斷，沒有可觀察訊號——我可能低估某檔案的行數（未讀怎知道 >400？），也可能把「且」誤讀成「或」，導致以為單檔 380 行但只要摘要也該自己讀（因為 <400，不觸發），實際上讀 380 行雜訊檔一樣浪費 context。

### C-2（T2）model-dispatch.md:19 見 A-2，「不確定目標在哪個檔案」的可觀察性問題

- **會怎麼誤讀**: 「不確定」也是主觀狀態，不是可觀察訊號。我可能會用「我對這個 codebase 不熟」自我合理化任何搜尋都算「不確定」，導致單一 grep 就能解決的任務也走完整派工流程（三件套 prompt），造成過度委派、拉長流程而非省 token。

### C-3（T2）judgment-rubrics.md:14「且沒有規範文件直接給答案」（判準 1 的 opus 觸發訊號之一）

- **原文**: 「任務要在 ≥ 2 個互相衝突的約束之間取捨...且沒有規範文件直接給答案」
- **會怎麼誤讀**: 要確認「沒有規範文件直接給答案」，邏輯上得先做完一次搜尋——但這正是 model-dispatch.md 定義要派給 sonnet/Explore 的「掃 repo」工作。文件沒說清楚「查過哪些文件才算確認過沒有答案」（是只查 CLAUDE.md 路由表？還是要 Explore 全 repo？），我可能會憑感覺覺得「沒有」就直接跳 opus，跳過真正的真相來源查證（違反決策表核心規則 4「不確定就去讀，不要猜」）。

### C-4（T2）maintenance-protocol.md:20「明顯失效的路徑／typo（任何檔案）| 可修」（綠區）

- **原文**: 「明顯失效的路徑／typo（任何檔案）| 可修，但 commit message 必須附證據」
- **會怎麼誤讀**: 「明顯」沒有定義門檻。我可能把一條寫法拗口但故意如此設計的規則（例如刻意保守的門檛值，見 model-dispatch.md:27 黃區「覺得太嚴正是它要防的心態」）誤判成「明顯的 typo」而自行在綠區修改，實際上應屬黃區（門檻數字）甚至更嚴重。第 6 節「規則衝突時」有較嚴謹的例外判準（「有指令輸出佐證」），但綠區表格本身沒有重申這道門檻，容易被跳過只看表格那一行就動手。

### C-5（T3）diagnosis.md:37「焦 1」修法句「在需要判斷的時刻想起來查表」

- 本身有具體觸發訊號範例（「我正要打出『應該可以了』」），設計良好，此處記錄為**通過**、非缺陷，列出對照供比較。

---

## D. 模板可用性 — 實際填寫模板 1

**假想任務**：找出所有寫入 `hook-execution.jsonl` 的程式碼

```
【目標】找出：所有寫入 .claude/hook-execution.jsonl 的程式碼路徑
【動機】因為：要幫 /harness-audit 新增一個「防線心跳」檢查項，需要先知道
       完整的寫入者清單，才能判斷「某 hook 從未寫入」是否代表它從未被觸發
【範圍】只搜 .claude/hooks/**、scripts/**；已知線索：檔名字串 "hook-execution.jsonl"

【驗收條件】
- 列出全部符合項，各附 檔案:行號 與一行說明「它做什麼」
- 明確回答「除了以上沒有其他了」或「以下位置沒搜（原因）」
- 不要貼大段程式碼，每項引文 ≤ 3 行

＋環境提示段
＋回報合約段
```

**卡住之處**：

1. **該不該派工本身就卡住**：填到一半意識到，這個任務的關鍵字（`hook-execution.jsonl`）已經精確已知，一次 grep 就能解決（本次審查我親自 grep 一次就拿到完整清單，見 B 節），照 `model-dispatch.md:26`「指揮官自己做、不派」的「讀單一已知檔案的已知段落」精神，這種任務可能根本不該走模板 1、不該派 subagent。但模板 1 的存在與其範例（「找出所有讀取 cost 資料的程式碼路徑」）明示這正是它的目標用途。文件沒給我一個「派工前先自問：這其實一次 grep 能解決嗎」的檢查步驟——這是 A-2 的具體實例。
2. **「驗收條件」第 2 條「以下位置沒搜（原因）」不好填**：我不知道除了 `.claude/hooks/**`、`scripts/**` 還該不該搜 `.claude/commands/**`（實際上 `harness-audit.md` 也提到這個檔名，但只是讀取／統計，不是寫入）。模板沒有提示「寫入 vs 引用/讀取」這種語意區分該怎麼下關鍵字搜尋範圍，容易漏搜或搜太寬。
3. **環境提示段／回報合約段是「＋」記號，需要自己去另一節複製貼上**：模板檔案開頭有說明「共用段」在同檔案上方，但填的當下容易忘記真的把兩段文字整段貼進最終 prompt（模板本身只放了「＋環境提示段」五個字當 placeholder，不是自動展開）——對弱模型是一個容易漏做的手動步驟，複製-貼上這種機械動作偏偏最考驗弱模型的細心度。

**結論**：模板結構本身可用（欄位定義清楚），但**「值不值得派」的前置判斷**與**「範圍該怎麼劃」**兩處缺乏具體指引，容易造成過度派工或漏搜。

---

## E. 數字與宣稱一致性

### E-1（T2）diagnosis.md:76-77 的 `wc -l` 證據數字與當前檔案實測值不符

- **原文**: `.knowledge/harness/diagnosis.md:76-77`
  ```
  wc -l CLAUDE.md ../../../CLAUDE.md .knowledge/decision-tables.md .knowledge/postmortem-log.md
  # → 84 / 56 / 124 / 326
  ```
- **實測**（本次審查於 2026-07-06 執行）：
  ```
  wc -l CLAUDE.md                    → 56（非 84）
  wc -l ../../../CLAUDE.md           → 63（非 56）
  wc -l .knowledge/decision-tables.md → 124（相符）
  wc -l .knowledge/postmortem-log.md  → 326（相符）
  ```
- **問題**: `decision-tables.md` 與 `postmortem-log.md` 兩個數字準確，但兩個 CLAUDE.md 的數字對不上——因為 `diagnosis.md` 量測的是**改寫前**的舊版 CLAUDE.md（84 行），而 CLAUDE.md 改寫是同一個 session 的產物。文件頂部宣稱「本 session 實測盤點」且未加註「此數字為改寫前」，会讓後續 session 誤以為現在的 CLAUDE.md 還是 84 行／根目錄還是 56 行，進而誤判「精簡門檻」（`maintenance-protocol.md:74` 的 >100 行門檻）還有多少餘裕。
- **建議修法**: 重新 `wc -l` 兩個 CLAUDE.md 現況並更新 diagnosis.md，或加註「此為改寫前基準，改寫後見 CLAUDE.md 自身版本行」。

### E-2（T2）diagnosis.md:20「IPC 四方同步」三處重複的宣稱與實際不符

- **原文**: `.knowledge/harness/diagnosis.md:20`
  > 「IPC 四方同步」在三份文件各出現一次
- **實測**: `grep -rn "四方同步" .knowledge/ CLAUDE.md` 結果顯示該規則陳述句目前只出現在 `CLAUDE.md:17` 與 `postmortem-log.md:24` 兩處；`.knowledge/decision-tables.md` 全文搜尋「四方」/「IPC」只命中兩行**不相關**的表格列（35 行「IPC 通道變更」證據列、83 行「真相來源」列），**都不是「IPC 四方同步」這條規則本身的陳述**。
- **問題**: 證據基礎文件自己的計數與 grep 實測不符，「三份文件各出現一次」目前應為「兩份文件」。這削弱了 diagnosis.md 作為「後續文件引用的問題定義」來源的可信度（見 diagnosis.md 頂部聲明它是後續四份文件的依據）。
- **建議修法**: 更正為「兩份文件」，或反向操作：把 IPC 四方同步規則陳述句也加進 decision-tables.md 核心摘要，讓宣稱與事實一致。

### E-3（T3，通過）其餘數字閾值檢查

- `決策表表 7`「注入段 ≤ 15 行」 vs 實際 `<!-- INJECT:START -->` 區塊（decision-tables.md:14-20）= 7 行 → **通過**，有餘裕
- `maintenance-protocol.md:72`「SessionStart 注入總量 > 5,500 chars（上限 6,000）」 vs diagnosis.md 實測 4.3KB（4,302 字元）→ **通過**，但餘裕僅約 1,200 字元，值得留意
- `maintenance-protocol.md:73`「踩坑快速參考表 > 35 行」 vs 實測 QUICKREF 區塊（postmortem-log.md:20-47）約 24 條資料列 → **通過**
- `決策表表 7`／`maintenance-protocol.md:74`「CLAUDE.md > 100 行」 vs 現況 56 行（專案）→ **通過**；工作區根 CLAUDE.md 現為 63 行，但該檔案的行數上限本協議未管轄（紅區檔案，不受此協議約束），非牴觸，僅記錄現況

---

## 統計總覽

| 類別 | 通過 | 不通過（含 T1/T2/T3） | 無法判定 |
|------|:--:|:--:|:--:|
| A（規則打架） | 0 | 3（A-1 T1, A-2 T1, A-3 T2） | 0 |
| B（路徑/名稱） | 全部 | 0 | 0 |
| C（模糊語句） | 1（C-5，附帶列出） | 4（C-1~C-4，均 T2） | 0 |
| D（模板可用性） | 結構通過 | 3 個卡點（前置判斷、範圍劃分、共用段手動展開） | 0 |
| E（數字一致性） | 3 項（E-3） | 2 項（E-1 T2, E-2 T2） | 0 |

**最嚴重前五（已在對話回覆中摘要）**: A-1、A-2、A-3、E-1、E-2。
