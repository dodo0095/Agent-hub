# Sprint 7「ARS 整合」G2 Review（對程式碼 ＋ 對規範）

> 審查者：獨立 fresh-context reviewer（未參與實作）
> 日期：2026-09-28
> 分支：`agent/tech-lead/2026-09-27`（worktree `3586a1dd`）
> 判定：**❌ 不通過**（🔴 0 / 🟠 2 / 🟡 7）

---

## 1. 審查範圍

`git diff 96b512d..64ebd01`（20 檔，+1207 / −19）

| Commit | 內容 |
|--------|------|
| 7e6487f | 文件：技術決策書、sprint7-dev-plan、三份 specs 與 department-structure 升 v2.0、publication-operator.md、research-director.md、agent-prompts.md、PM-015 |
| 64ebd01 | 實作：`agent-loader.ts`、`session-spawn-helpers.ts`、`utils/ars-validator.ts`、SettingsView + locale、4 個測試檔 |

比對基準：`proposal/tech-decision-ars-integration.md`（D1-A、D2-A）、`proposal/sprint7-dev-plan.md` §2/5/6/7、`.knowledge/specs/api-design.md` §6、`data-model.md` §6、`feature-spec.md` §6、`.knowledge/academic/department-structure.md` v2.0、`README.md`「學術事業群使用指南」、`coding-standards.md`、`testing-standards.md`。

額外追查的呼叫端：`electron/services/session-manager.ts:214-240`（spawn 順序）、`electron/ipc/sessions.ts:11-18`、`src/stores/sessions.ts:170-180`（direct resume 唯一呼叫端）、`electron/services/message-broker.ts:165-180, 266-286`（auto-spawn）、`electron/services/database.ts:52-63`、`electron/services/agent-loader.ts:265-273`、`electron/ipc/settings.ts`。

---

## 2. 檢查項逐項結果

### 2.1 對規範

| # | 項目 | 規範來源 | 結果 | 證據 |
|---|------|---------|:--:|------|
| S1 | spawn 契約順序：讀設定 → 驗證 → 互動檢查 → push | api-design §6.2、dev-plan §2 | ✅ | `session-spawn-helpers.ts:43-64`；一般啟動在任何寫檔前呼叫（`:149-150` 早於 `:161` writeFileSync），`--plugin-dir` 於 `:305-307` 附加 |
| S2 | `ARS_PATH_NOT_SET` 訊息含「到設定填寫 ARS 路徑」 | api-design §6.4 | ✅ | `:49` |
| S3 | `ARS_INSTALL_INCOMPLETE` 含缺檔清單＋指定修法字句 | api-design §6.4 | ✅ | `:54-56`，字句與規範逐字一致 |
| S4 | `ARS_REQUIRES_INTERACTIVE` 訊息 | api-design §6.4 | ✅ | `:60`，逐字一致 |
| S5 | 錯誤 message 以錯誤碼開頭、session 不得建立 | api-design §6.4 | ✅ | 三個 throw 皆 `CODE: ...`；`session-manager.ts:235` 呼叫 buildClaudeArgs 之前無 DB 寫入／pty（`:214-233` 只有讀取與計算） |
| S6 | 其他部門「不讀設定、不驗證、不加參數」 | api-design §6.2、feature-spec §6.3 | ✅（程式碼） | `:44` department 不符即 `return null`，不查 DB；額外只多一次無副作用的 `agentLoader.getAgent`（`:116`、`:149`） |
| S7 | 判斷依據用 department，不寫死 agent id | api-design §6.2 | ✅ | `ARS_DEPARTMENT` 常數 `:18` |
| S8 | resume（`resumeSessionId`）依原 session agent 注入 | dev-plan §2、feature-spec §6.3 | ✅ | `:126` SELECT 加 `agent_id`，`:141-142` |
| S9 | resume（direct resume，`resumeConversationId`）注入 | dev-plan §2、feature-spec §6.3、決策書約束 3 | ❌ | 見 **MJ-1** |
| S10 | 設定 key `ars.plugin-dir`，沿用 `settings:*`、不新增 IPC | api-design §6.1、data-model §6.3 | ✅ | `SettingsView.vue:22`、`:124`；無 IPC 變更 |
| S11 | 部門代號／中文名／顏色 | data-model §6.1 | ✅ | `agent-loader.ts:19`（學術出版部）、`:33`（orange）；`BaseTag.vue:3` 支援 orange |
| S12 | 顯示名稱「出版流程操作員」 | data-model §6.2 | ✅ | `agent-loader.ts:100` |
| S13 | publication-operator frontmatter（L2 / reports_to / coordinates_with / model / tools） | data-model §6.2 | ✅ | `publication-operator.md:1-12` |
| S14 | research-director `manages` 加 publication-operator（共 7） | data-model §6.2 | ✅ | `research-director.md` manages 7 位 |
| S15 | 驗證器介面與行為（常數、stub 檔 → missing、路徑不存在 → 全缺） | api-design §6.3 | ✅ | `ars-validator.ts:16-50`（「真實檔案」語意見 MN-3） |
| S16 | T2 驗收：prompt 明文「不讀研究部學者檔案以外的個資」 | dev-plan §6 T2 | ❌ | 見 **MJ-2** |
| S17 | SettingsView 說明含 zip 資料夾提醒＋授權連結、雙語 | dev-plan §6 T6 | ✅ | `en.json`/`zh-TW.json` 新增 5 key 對齊 |

### 2.2 對程式碼（全公司 spawn 必經路徑）

| 風險路徑 | 非出版部是否改變／拋錯 | 證據 |
|---------|:--:|------|
| `agentLoader.getAgent` 回傳 undefined | 不拋錯，`department` 為 undefined → no-op | `:116-117`、`:149-150`、`:44` |
| resume 時 `agent_id` 為 null | 不呼叫 getAgent，no-op | `:141` |
| resume 的 DB 查詢例外 | 仍被既有 try/catch 吞下，之後照舊拋 `Cannot resume`（行為與改動前相同） | `:124-138` |
| `SELECT ... agent_id` 欄位存在性 | `claude_sessions.agent_id` 為初始 schema 欄位 | `migrations/001_initial_schema.sql:96` 有其 index |
| 出版部 DB 讀取例外 | 未包 try/catch，會拋原始 SQL 錯誤（無錯誤碼），僅影響出版部 | 見 MN-6 |
| 錯誤在寫檔／DB／pty 前拋出 | ✅ 一般啟動：`:149-150` 早於 `:153`（assemble）與 `:161`（writeFileSync）；resume 兩條路徑本來就不寫檔；`session-manager.ts:235` 早於 `:343`（INSERT）與 pty 建立 | — |
| MessageBroker auto-spawn 出版部 | 走 `interactive: true`，ARS 設定錯誤時被 catch 成 warn log，老闆看不到 | 見 MN-1 |

結論：**非出版部 session 的參數與行為未改變**（逐條追過三條分支），未發現會讓其他部門拋錯的路徑。

### 2.3 測試品質

| 項目 | 結果 | 說明 |
|------|:--:|------|
| 斷言是否真實 | ✅ | 新增 16 個測試皆有具體行為斷言（`args.indexOf`、`toEqual` 全陣列、`toThrow(/^CODE:/)`、`not.toHaveBeenCalled`），無空斷言 |
| SQL-aware mock（PM-012） | ✅ | `session-spawn-helpers.test.ts:30-41, 182-205` 依 SQL 文字與 bound params 分支，未用 `mockReturnValueOnce` 佇列 |
| happy-dom 未整顆替換 window | ✅ | `SettingsView.test.ts` 使用 `tests/setup.ts:180` 掛上的 `window.maestro`，未替換 window；spawn-helpers 測試為 `@vitest-environment node` |
| 驗證器用真實 temp 目錄 | ✅ | `ars-validator.test.ts` 用 `mkdtempSync`，afterEach 清除 |
| 「寫檔前拋錯」有測 | ✅ | `session-spawn-helpers.test.ts` 的 `ARS_PATH_NOT_SET aborts before any write` |
| direct resume 路徑 | ❌ | 0 個測試（MJ-1 的一部分） |
| 其他缺口 | 🟡 | 見 MN-7 |

### 2.4 文件一致性

| 項目 | 結果 | 說明 |
|------|:--:|------|
| publication-operator.md vs README | ✅ 無矛盾 | 檢查點不代答、例外三條件、Project Lead 只看排程成本阻塞、交接經總監、授權聲明皆一致 |
| research-director.md vs README | ✅ 無矛盾 | 管控四點、分流表、2 篇上限、不借人一致；新增的「ARS 錯誤時經老闆同意改走研究部 workflow」README 未提，但不衝突 |
| department-structure vs research-director.md | ❌ | 見 MN-5 |
| dev-plan vs 實作 | 🟡 | 見 MN-4 |
| agent-prompts.md | ✅ | 只放摘要並指向定義檔為唯一真相來源 |
| 三份 specs 版本標頭 | ✅ | 皆 `v2.0 | ... | 2026-09-28` |

---

## 3. 問題清單

### 🟠 MJ-1：direct resume 出版部 session 會靜默掉 ARS（規範明訂 resume 要重新注入）

- **位置**：`electron/services/session-spawn-helpers.ts:113-117`；呼叫端 `src/stores/sessions.ts:174`
- **問題**：direct resume 以 `params.agentId` 查 department，註解宣稱「always populated」。但全 repo 唯一的 direct resume 呼叫端 `resumeByConversationId` 固定傳 `agentId: ''`（`src/stores/sessions.ts:174`）。`getAgent('')` → undefined → 不注入 `--plugin-dir`，也不報錯。老闆從「可恢復對話」清單接回一篇中斷的出版部論文時，會得到一個**沒有 ARS 的操作員**，違反 feature-spec §6.3「resume 中斷的出版部 session → 重新注入」與決策書約束 3「不能靜默啟動一個沒有 ARS 的操作員」。dev-plan §8 把「resume 掉 ARS」列為風險，這正是該風險的一條實際路徑。
- **補充**：此路徑也沒有任何單元測試，T5「resume 有」只覆蓋 `resumeSessionId` 那條。
- **修改建議**：
  1. direct resume 時以 conversation id 反查原 agent：`SELECT agent_id FROM claude_sessions WHERE claude_conversation_id = ? ORDER BY started_at DESC LIMIT 1`（`claude_conversation_id` 欄位見 `migrations/005_claude_conversation_id.sql:1`），查無再退回 `params.agentId`。DB 例外比照 resume 路徑包 try/catch 後 no-op，確保非出版部行為不變。
  2. 刪除／修正 `:113-115` 的錯誤註解。
  3. 補測試：(a) direct resume + `agentId: ''` + DB 中該 conversation 屬 publication-operator → 含 `--plugin-dir`；(b) 屬工程部 → `toEqual(['--resume', convId])`；(c) 查無紀錄 → `toEqual(['--resume', convId])`。
  4. 若判斷反查不可行，至少要在規範（api-design §6.2、feature-spec §6.3）明訂 direct resume 的已知限制並經老闆同意，不可維持目前「規範說會注入、實作靜默不注入」的狀態。

### 🟠 MJ-2：T2 驗收條件「prompt 必須明文不讀學者檔案以外的個資」未落實，dev-plan 卻記為完成

- **位置**：`agents/definitions/academic-publication/publication-operator.md`（全文無「個資／個人資料／隱私」字樣，`grep` 0 筆）；`proposal/sprint7-dev-plan.md` §6 T2 說明欄、§10 T2 列記「✅ 完成」
- **問題**：T2 明文要求 prompt 寫出三件事：不代答檢查點（✅ 有）、交接一律經總監（✅ 有）、**不讀研究部學者檔案以外的個資**（❌ 沒有）。現行 prompt 只要求讀 `scholar-profile.md` 並禁止編造，未限制讀取範圍。操作員具備 Read/Bash/Grep/Glob，且會在老闆的論文資料夾裡跑 ARS，缺這條就沒有邊界。第 10 節已記為完成，屬「驗收條件未達成卻宣告完成」。
- **修改建議**：在【必讀檔案】或【部門紀律】加一條，例如：「研究者個人資料只讀專案內 `.knowledge/academic/scholar-profile.md`；不得讀取、搜尋或複製其他含個人資料的檔案（如其他專案、家目錄、郵件、通訊錄），需要更多背景一律經總監向老闆索取。」同步更新 `agent-prompts.md` 摘要與 department-structure「硬性規則」欄。

### 🟡 MN-1：MessageBroker auto-spawn 出版部失敗時老闆看不到錯誤

- **位置**：`electron/services/message-broker.ts:166-179`、`:268-285`
- **問題**：research-director 以 SendMessage 找 publication-operator 且無 active session 時會 auto-spawn；ARS 未設定／不完整會被 catch 成 `logger.warn`，訊息停在 pending，UI 沒有任何提示。不影響其他部門。
- **建議**：列入 T7 驗證項，或 backlog：ARS_* 錯誤回寫給發訊 agent（讓總監依 research-director.md 最後一條告知老闆）。

### 🟡 MN-2：路徑未 trim、不處理引號

- **位置**：`session-spawn-helpers.ts:47-50`、`SettingsView.vue:62-66`
- **問題**：Windows「複製為路徑」會帶雙引號；尾端空白或僅空白字串會通過 `!arsPath`，得到列出全部 5 檔的 `ARS_INSTALL_INCOMPLETE`，誤導使用者去修 zip。規範說「未設定或空字串」→ `ARS_PATH_NOT_SET`，純空白語意上也應屬之。
- **建議**：讀取時 `value.trim().replace(/^"(.*)"$/, '$1')`；空白 → `ARS_PATH_NOT_SET`。

### 🟡 MN-3：驗證器只檢查存在，不檢查是「檔案」

- **位置**：`electron/utils/ars-validator.ts:44`（註解 `:33` 寫「must exist as a real file」）
- **問題**：`existsSync` 對同名資料夾也回 true，與註解不符。實務風險低，規範只要求存在性。
- **建議**：改 `statSync(p, { throwIfNoEntry: false })?.isFile()`，或把註解改成「exists」。

### 🟡 MN-4：dev-plan 與實作的檔名／紀錄不一致

- **位置**：`proposal/sprint7-dev-plan.md` §4 修改表與 §7 單元測試表寫 `tests/unit/session-spawn-helpers.test.ts`；實際為 `tests/services/session-spawn-helpers.test.ts`（既有檔）。§4 未列新增的 `tests/unit/agent-loader.test.ts`、`tests/components/SettingsView.test.ts`。§10 的 T3–T6 仍空白。
- **建議**：更正路徑、補列新增測試檔；G2 通過後回填 T3–T6。

### 🟡 MN-5：department-structure 對總監可代呼叫的範圍與 research-director.md 矛盾

- **位置**：`.knowledge/academic/department-structure.md` research-director 表 `skills_sub | 所有下屬 Skills（統籌時可代呼叫）`（未隨 v2.0 修改）vs `research-director.md`「副：研究部下屬的 Skills（ARS 只在出版部 session 載入，你不直接操作 ARS）」
- **問題**：manages 已含 publication-operator，「所有下屬 Skills」字面包含 ARS，與定義檔與約束 6 衝突。
- **建議**：改為「研究部下屬 Skills（不含 ARS）」。

### 🟡 MN-6：出版部讀取 `ars.plugin-dir` 未包 try/catch

- **位置**：`session-spawn-helpers.ts:46`
- **問題**：DB 例外時拋出原始 sql.js 錯誤，沒有 `ARS_*` 前綴，UI 訊息不可讀。只影響出版部，且發生在寫檔前，後果有限。
- **建議**：catch 後拋 `ARS_PATH_NOT_SET: 無法讀取 ARS 路徑設定（<原錯誤>）`，或另定錯誤碼並補進 api-design §6.4。

### 🟡 MN-7：測試對契約的覆蓋仍有缺口（MJ-1 以外）

- **位置**：`tests/services/session-spawn-helpers.test.ts`
- **缺口**：
  1. 工程部一般啟動只斷言 `not.toContain('--plugin-dir')`，沒驗證規範的「不讀設定」。建議加 `expect(mockDbPrepare).not.toHaveBeenCalledWith(expect.anything(), ['ars.plugin-dir'])`。
  2. 沒有錯誤優先順序測試（例：非互動＋未設定 → 應為 `ARS_PATH_NOT_SET` 而不是 `ARS_REQUIRES_INTERACTIVE`）。
  3. 錯誤訊息只斷言前綴，未斷言 §6.4「訊息須包含」的內容（缺檔清單、zip 修法字句）。
  4. resume 時 `agent_id` 為 null 的情境未測。

---

## 4. 驗證指令輸出

環境：`export PATH="/c/Program Files/nodejs:$PATH"`，於 worktree 根目錄執行。

```
$ pwd && git branch --show-current
/c/Users/Bandai/Desktop/ALL PROJECT/.agenthub-worktrees/Agent-hub/3586a1dd
agent/tech-lead/2026-09-27

$ npx vitest run
 Test Files  29 passed (29)
      Tests  402 passed (402)
   Duration  5.10s
EXIT 0            （不需先 build:mcp，MCP e2e 測試未報找不到 out/mcp）

$ npm run lint
✖ 128 problems (0 errors, 128 warnings)
EXIT 0

$ npx eslint <本次 8 個變更的 ts/vue/test 檔>
✖ 9 problems (0 errors, 9 warnings)
  （agent-loader.ts 7 個 any/prefer-const 在未變更的行；
    session-spawn-helpers.test.ts:33、:46 兩個 no-explicit-any 為本次新增的 mock 型別）

$ npm run typecheck
tsc --noEmit -p tsconfig.node.json   → 無錯誤
tsc --noEmit -p tsconfig.web.json    → 無錯誤
EXIT 0
```

靜態取證：

```
$ grep -n "agentId: ''" src/stores/sessions.ts          → 174（direct resume 唯一呼叫端）
$ grep -n "個資\|個人資料\|隱私" publication-operator.md  → 0 筆
```

---

## 5. 判定

| 等級 | 數量 | 項目 |
|------|:--:|------|
| 🔴 Blocker | 0 | — |
| 🟠 Major | 2 | MJ-1 direct resume 靜默掉 ARS；MJ-2 T2 個資條款缺漏 |
| 🟡 Minor | 7 | MN-1 ～ MN-7 |

**❌ 不通過**（依 `.knowledge/company/sop/code-review.md:55-57`：有 Major 就不通過）。修正 MJ-1（含測試）與 MJ-2 後重新 Review。Minor 可記錄後在 T7／T8 或下個 Sprint 處理。

非出版部 session 的相容性（本次最高風險項）已逐條追過，**未發現問題**。

## 6. 未驗證

- 真實 Hub 啟動（`--plugin-dir` 與 `--mcp-config`／`--settings` 並用、Loaded 4 skills、ARS PreToolUse guard 與 Hub hooks 衝突）：屬 T7，本次未執行。
- ARS_* 錯誤經 `ipcRenderer.invoke` 傳回 renderer 後，UI 是否顯示可讀訊息：未驗證（呼叫端錯誤呈現未追）。
- MessageBroker auto-spawn 失敗後的重試頻率：只讀程式碼，未實測。
- 未跑 `node scripts/preflight.cjs` 與 `npm run build`。

---

## 第二輪 Review（commit 5219afa）

> 審查者：同一位獨立 reviewer（未參與修正）
> 日期：2026-09-28
> 範圍：`git diff 64ebd01..5219afa`（10 檔，+537 / −33；其中 `docs/reviews/sprint7-g2-review.md` 為第一輪報告本身）
> 判定：**✅ 通過**（🔴 0 / 🟠 0 / 🟡 2 新增，皆可延後）

### R2-1. 第一輪問題逐項結果

| # | 問題 | 結果 | 證據 |
|---|------|:--:|------|
| MJ-1 | direct resume 靜默掉 ARS | ✅ 已修 | `session-spawn-helpers.ts:133-158`：`params.agentId` 非空（trim 後）才直接用；否則以 `resumeConversationId` 查 `claude_sessions`，排除 `NULL`／`''`／`'(resumed)'`，`ORDER BY started_at ASC LIMIT 1`；查無資料或 DB 例外時 `logger.warn` 後照常 resume，不拋錯。和更新後 api-design §6.2「找出 agent（resume）」列逐項相符。錯誤註解已移除。資料來源成立：一般啟動會回寫 `claude_conversation_id`（`session-manager.ts:1112`）；direct resume 自己那筆 row 的 agent_id 是 `'(resumed)'`（`session-manager.ts:300`），會被正確排除 |
| MJ-1 測試 | 缺 direct resume 測試 | ✅ | 新增 4 案：`agentId ''` 且原 agent 是出版部 → 含 `--plugin-dir`；原 agent 是工程部 → `toEqual(['--resume', conv])`；查無 row → 不拋錯且參數不變；`params.agentId` 非空時優先使用、不查 DB。全部是 `toEqual` 整個陣列的精確斷言 |
| MJ-2 | prompt 缺個資條款 | ✅ 已修 | `publication-operator.md`【部門紀律】第一條：只讀 scholar-profile.md／venue-list.md，禁止讀取、搜尋、複製其他個資，需要更多背景時經總監向老闆索取。`agent-prompts.md`、department-structure「硬性規則」已同步。和 README「個人資料只放在你的專案裡」不衝突 |
| MN-1 | auto-spawn 失敗老闆看不到 | ✅ 可以接受列 backlog | 見 R2-3 |
| MN-2 | 路徑沒有 trim、沒去引號 | ✅ 已修 | `session-spawn-helpers.ts:60`：先 `trim`，再去掉首尾成對雙引號，再 `trim` 一次；純空白 → `ARS_PATH_NOT_SET`。api-design §6.2、§6.4 已同步。3 個測試（去引號、去空白、純空白） |
| MN-3 | 驗證器沒檢查是不是「檔案」 | ✅ 已修 | `ars-validator.ts:49-50` 改用 `statSync(..., { throwIfNoEntry: false })?.isFile()`；api-design §6.3 已同步。新增「SKILL.md 是資料夾」的真實 temp 目錄測試。本機實測（Node v24.14.0、Windows）：對 `stub檔/SKILL.md` 做 stat 會回傳 `undefined`，不會拋錯 |
| MN-4 | dev-plan 檔名與紀錄 | ✅ 已修（部分待回填） | §4 補上 2 個新測試檔並更正路徑，§7 路徑也已更正。§10 的 T3–T6 仍空白，依第一輪建議在 G2 通過後回填 |
| MN-5 | department-structure 的 skills_sub 矛盾 | ✅ 已修 | 改成「研究部下屬 Skills（…**不含 ARS**…）」 |
| MN-6 | 出版部讀設定時 DB 例外 | ✅ 已修 | `session-spawn-helpers.ts:48-55`：catch 後拋 `ARS_PATH_NOT_SET: 無法讀取 ARS 路徑設定（<原因>）`，並帶 `cause`；api-design §6.4 已同步。有測試斷言錯誤碼前綴與原錯誤字串 |
| MN-7.1 | 沒驗證「不讀設定」 | ✅ | 測試斷言 `mockDbPrepare` 從未帶 `['ars.plugin-dir']` 被呼叫 |
| MN-7.2 | 錯誤優先順序 | ✅ | 非互動模式加上未設定路徑 → `ARS_PATH_NOT_SET` |
| MN-7.3 | 訊息內容 | ✅ | 斷言缺檔清單中的 3 個路徑，以及兩段修法字句 |
| MN-7.4 | resume 時 agent_id 為 null | ✅ | `toEqual(['--resume', 'conv-null-agent'])` |

### R2-2. 非出版部 session 是否多出新的拋錯路徑

逐條檢查新增的程式碼：

- **direct resume 查 DB**：包在 try/catch 內，失敗時只記 warn，不拋錯（`:137-157`）。`params.agentId && params.agentId.trim()` 在 agentId 是 `undefined` 或 `''` 時會短路，不會對 undefined 呼叫 trim。`agentLoader.getAgent` 只是 Map 查找，不會拋錯。
- **`resolveArsPluginDir`**：新增的 try/catch 和 trim 都在 `department !== ARS_DEPARTMENT` 這個 early return 之後（`:44`），非出版部 session 走不到。
- **行為差異只有一項**：非出版部的 direct resume 現在會多做一次 `claude_sessions` 讀取查詢。這是找出 agent 的必要步驟，api-design §6.2 已明文寫入，而且查詢失敗不影響 resume。

結論：**沒有新增會讓非出版部 session 拋錯的路徑**。

### R2-3. MN-1 列 backlog 是否可以接受

可以接受。理由：

- 影響只限出版部的 auto-spawn，不會拋錯到其他部門，也不會寫出孤兒檔。
- 老闆從 GUI 手動啟動時，會直接看到 `ARS_*` 錯誤。
- backlog 檔（`Agent-hub/.tasks/backlog/S7-MN1-ars-autospawn-error-visibility.md`）有問題描述、位置、3 條可驗收標準和負責人，符合 Minor「記錄、後續處理」的規則（`code-review.md:57`）。
- 建議：T7 端到端驗證時順帶觀察一次 auto-spawn 失敗的 log，作為 backlog 的重現證據。

### R2-4. 新增問題

#### 🟡 MN-8：一般 resume 一個「由 direct resume 產生的出版部 session」，會掉 ARS

- **位置**：`session-spawn-helpers.ts:162-178`（isResume 分支）、`session-manager.ts:300`
- **問題**：direct resume 建立的新 session row，agent_id 固定寫 `'(resumed)'`。如果這個 session 之後又中斷，老闆改用 `resumeSessionId` 從 Hub 的 session 清單接回，isResume 分支會拿到 `'(resumed)'` 當 agent，`getAgent` 回傳 undefined，結果 ARS 不注入，也不報錯。程式碼符合 api-design §6.2 目前的寫法（「isResume：claude_sessions.agent_id」），所以缺口在規範本身。這是連續兩次 resume 才會遇到的情境。Hub 的 session 清單是否真的對這類 session 提供 resume 入口，我沒有實測。
- **建議**：isResume 查到的 agent_id 若為 `'(resumed)'`，退回用該 row 的 `claude_conversation_id` 走 direct resume 同一套反查；並把這條加進 api-design §6.2。另一種作法：direct resume 查到原 agent 後，把它回寫進新 session 的 agent_id。可以併入 T7 或列 backlog。

#### 🟡 MN-9：註解和 SQL 不一致（純文件）

- **位置**：`session-spawn-helpers.ts:132` 註解寫排除 `'null'`（字串），但 SQL（`:142`）排除的是 `IS NULL`。行為是正確的。
- **建議**：註解改成「NULL／''／'(resumed)'」。

測試檔 `session-spawn-helpers.test.ts:36`、`:49` 有 2 個 `no-explicit-any` warning（mock 型別），第一輪已記錄，不另列。

### R2-5. 驗證指令輸出

```
$ git rev-parse --short HEAD        → 5219afa
$ npx vitest run
 Test Files  29 passed (29)
      Tests  414 passed (414)       （第一輪 402 → +12：spawn-helpers +11、ars-validator +1）
EXIT 0
$ npm run lint
✖ 128 problems (0 errors, 128 warnings)   EXIT 0（總數和第一輪相同）
$ npm run typecheck
tsc -p tsconfig.node.json / tsconfig.web.json → 無錯誤   EXIT 0
$ node -e "statSync('<tmp>/stub/SKILL.md', {throwIfNoEntry:false})"   （Node v24.14.0，Windows）
undefined
```

### R2-6. 第二輪判定

| 等級 | 數量 | 項目 |
|------|:--:|------|
| 🔴 Blocker | 0 | — |
| 🟠 Major | 0 | MJ-1、MJ-2 已修正並有測試 |
| 🟡 Minor | 2（新增） | MN-8、MN-9；MN-1 已列 backlog，可以接受 |

**✅ 通過**（0 Blocker + 0 Major），可以提交 G2。MN-8 建議併入 T7 驗證或列 backlog；MN-9 可以順手修。

### R2-7. 第二輪未驗證項目

- 在 POSIX（Linux／macOS）上，`statSync` 遇到 ENOTDIR 時 `throwIfNoEntry: false` 是否同樣回傳 undefined：只在 Windows 實測。Hub 目前只跑 Windows，影響低。
- MN-8 的情境在 GUI 上是否真的能觸發：沒有實測。
- 真實 Hub 啟動（T7 範圍）、`preflight.cjs`、`npm run build`：本輪也沒有執行。

---

## 第三輪 Review（commit 0a55011）

> 審查者：同一位獨立 reviewer（未參與修正）
> 日期：2026-09-28
> 範圍：`git diff 5219afa..0a55011`（12 檔，+653 / −22；含本報告第二輪節與 `docs/reviews/sprint7-t7-evidence.md`）
> 判定：**❌ 不通過**（🔴 0 / 🟠 1 / 🟡 2 新增）

### R3-1. MN-8／MN-9 結果

| # | 結果 | 證據 |
|---|:--:|------|
| MN-8 | ✅ 已修 | 抽出共用函式 `lookupOriginalAgentIdByConversation`（`session-spawn-helpers.ts:108-124`），SQL 和 fallback 與第二輪相同。isResume 分支在 agent_id 為 null、空字串或 `'(resumed)'` 時，改用該 session 的 `claude_conversation_id` 反查（`:212-216`）。api-design §6.2「找出 agent（resume）」列已同步，程式碼與規範逐項相符。新增 2 個測試：「接回的 session 可追溯到出版部 → 含 `--plugin-dir`」和「追溯不到 → 不拋錯、參數不變」，都用 `toEqual` 斷言完整參數陣列 |
| MN-9 | ✅ 已修 | `:169-172` 的註解改成 `NULL/''/'(resumed)'`，和 SQL 一致 |

**非出版部 session 是否多出新的拋錯路徑：沒有。**
- 共用函式在 conversationId 為空時直接回傳 null。
- DB 查詢包在 try/catch 內，失敗只記 `logger.warn`，回傳 null。
- `agentLoader.getAgent` 只是 Map 查找，不會拋錯。
- 唯一的行為差異：原 session 的 agent_id 是空值或 `'(resumed)'` 時，resume 會多做一次讀取查詢；規範已寫入。

### R3-2. 前端錯誤呈現（對照 api-design §6.4、技術決策書約束 3）

| 項目 | 結果 | 證據 |
|------|:--:|------|
| `extractIpcErrorMessage` 剝掉 IPC 前綴 | ✅ | `src/utils/ipc-error.ts:12-24`：剝掉 `Error invoking remote method '…':` 和內層的 `Error:`；空值時回傳 fallback |
| `parseArsError` 解析錯誤碼 | ✅ | `:45-53`：只認 §6.4 的三個錯誤碼加冒號開頭，其他錯誤回傳 null |
| SessionLauncher 顯示錯誤 | ✅ | `SessionLauncher.vue:239-251`：ARS 錯誤依錯誤碼顯示對應標題的 error toast；`ARS_PATH_NOT_SET` 額外附上「設定 → 學術出版部」的提示；非 ARS 錯誤顯示通用的「啟動失敗」toast。`App.vue:84` 有掛載 `ToastContainer`，預設顯示 5 秒 |
| i18n | ✅ | zh-TW／en 各新增 6 個 key，兩邊對齊 |
| **resume 入口的錯誤呈現** | ❌ | 見 **MJ-3** |

### R3-3. `tests/setup.ts` 的改動

- **沒有違反 PM-012**：只在既有的 `mockMaestro.on` 物件上新增 8 個 `vi.fn()`（`tests/setup.ts:169-176`）。window 沒有被整顆替換，仍沿用 `:180` 的掛載方式。
- **補上的清單和 preload 完全一致**：`electron/preload.ts` 的 `on:` 區塊（`:294-306`）共 13 個事件，setup 補齊後是同樣的 13 個，沒有多餘或捏造的 API。
- **既有測試沒有失去意義**：以前沒 mock 的事件訂閱在測試裡會直接拋 TypeError，現在改為不做任何事。這不會掩蓋任何既有斷言。完整測試一次全過（見 R3-6）。

### R3-4. 新測試品質

| 檔案 | 結果 | 說明 |
|------|:--:|------|
| `tests/unit/ipc-error.test.ts` | ✅ | 精確比對字串：剝 IPC 前綴、沒有前綴、純字串、fallback 三種值、3 個錯誤碼的 `it.each`、非 ARS 錯誤回傳 null |
| `tests/components/SessionLauncher.test.ts` | ✅ | 透過真實的 Launch 按鈕點擊，斷言 toast 的數量、類型、標題、訊息內容，以及失敗時不發出 `close`／`launched`、成功時發出 `launched` 並關閉。Teleport 的節點在 `afterEach` unmount，避免拿到上一個測試殘留的 DOM。mock 只重設 `window.maestro.*`，沒有替換 window |
| session-spawn-helpers MN-8 兩案 | ✅ | 見 R3-1 |

### R3-5. 問題清單

#### 🟠 MJ-3：「可恢復對話」的 resume 入口仍然吞掉 ARS 錯誤，老闆看不到任何提示

- **位置**：`src/views/SessionsView.vue:222-228`（`handleResumeConversation` 的 catch 只有 `console.error`）；呼叫鏈是 `SessionsView.vue:497` 的 Resume 按鈕 → `sessionsStore.resumeByConversationId` → direct resume。
- **問題**：本輪只修了 SessionLauncher 這一個入口。老闆從歷史清單按 Resume 接回一篇中斷的出版部論文時，如果 ARS 在這期間被移動、刪除或更新成 zip stub，後端會正確拋出 `ARS_INSTALL_INCOMPLETE`（MJ-1 修正後，這條路徑一定會做 ARS 驗證），但畫面上什麼都不會發生。
  - 這違反技術決策書約束 3「ARS 路徑未設定或不存在時，要清楚報錯並提示安裝方式」。
  - feature-spec §6.3 明列兩個相關情境：「resume 中斷的出版部 session」和「設定了路徑但之後移動或刪除 ARS → 下次啟動時擋下」。擋下這件事做到了，但沒有任何提示。
  - 在 `src/` 裡，這個按鈕是出版部 resume 唯一的 UI 入口；`sessionsStore.resume`（resumeSessionId 那條路徑）在 `src/` 沒有 UI 呼叫端。
- **修改建議**：在 `handleResumeConversation` 的 catch 裡套用和 `SessionLauncher.vue:241-251` 相同的處理：`extractIpcErrorMessage` 加 `parseArsError`，再呼叫 `uiStore.addToast`。建議把這段抽成共用函式（例如 `src/utils/ipc-error.ts` 裡的 `toastSpawnError(err, t, uiStore)`），避免兩處邏輯分岔。另外補一個元件測試：resume 的 IPC 回傳 `ARS_INSTALL_INCOMPLETE` 時，應出現對應標題的 error toast。

#### 🟡 MN-10：ARS_PATH_NOT_SET 的 toast 提示重複，en 介面會混入中文

- **位置**：`SessionLauncher.vue:244-247`
- **問題**：後端訊息本身已經寫了「請到「設定」填寫 ARS 路徑」，前端又附加一句 hint，同一件事說了兩次。錯誤細節是 main process 的中文字串，所以 en 介面的 toast 會是中文內文加英文 hint。
- **建議**：ARS 錯誤的 toast 內文改用 i18n 文字（只保留 `ARS_INSTALL_INCOMPLETE` 的缺檔清單這種動態部分），或不再附加 hint。不影響功能，可以延後。

#### 🟡 MN-11：T7 證據提到 resume 不會帶回 `--mcp-config`，尚未處理

- **位置**：`docs/reviews/sprint7-t7-evidence.md:100`、`:164`；`session-spawn-helpers.ts` 中 MCP 注入那段的註解
- **問題**：T7 在 claude CLI 2.1.283 上實測發現，`--resume` 不會自動帶回原 session 的 `--mcp-config`，和程式碼註解「resume sessions inherit the original session's MCP config automatically」不符。這表示任何部門的 session 經 resume 後都可能用不了 SendMessage。這不是本 Sprint 引入的問題，但已經有證據。
- **建議**：用 `/pitfall-record` 記錄並建立 backlog，由技術負責人核實。不擋本 Sprint。

### R3-6. 驗證指令輸出

```
$ git rev-parse --short HEAD        → 0a55011
$ npx vitest run
 Test Files  31 passed (31)
      Tests  429 passed (429)       （第二輪 414 → +15）
EXIT 0
$ npm run lint
✖ 128 problems (0 errors, 128 warnings)   EXIT 0（總數和前兩輪相同）
$ npx eslint <本輪 5 個前端／測試檔>
✖ 1 problem (0 errors, 1 warning)  （SessionLauncher.vue:196 `err` 未使用，這一行本輪沒有改動）
$ npm run typecheck
tsc -p tsconfig.node.json / tsconfig.web.json → 無錯誤   EXIT 0
```

### R3-7. 第三輪判定

| 等級 | 數量 | 項目 |
|------|:--:|------|
| 🔴 Blocker | 0 | — |
| 🟠 Major | 1 | MJ-3：「可恢復對話」的 resume 入口吞掉 ARS 錯誤 |
| 🟡 Minor | 2（新增） | MN-10、MN-11 |

**❌ 不通過**：依 `code-review.md:55-56`，有 Major 就不通過。MN-8、MN-9 已確實修正；後端 spawn 路徑和 SessionLauncher 的錯誤呈現都合格。修掉 MJ-3（預估改動很小：一個 catch 區塊加一個測試）即可再送複審。

### R3-8. 第三輪未驗證項目

- 真實 Hub GUI 上 toast 的實際樣子：沒有截圖，也沒有實際點擊（只有元件測試）。
- `resumeSessionId` 那條路徑是否有 `src/` 以外的 UI 入口：只 grep 了 `src/`。
- MN-11：`--resume` 不帶回 MCP config 是否是 CLI 的預期行為，沒有核實。
- `preflight.cjs`、`npm run build`：本輪沒有執行。

---

## 第四輪 Review（commit f130d0f ＋ T8 未 commit 文件）

> 審查者：同一位獨立 reviewer（未參與修正）
> 日期：2026-09-28
> G2 範圍：`git diff 0a55011..f130d0f`（src/**、tests/**，另含本報告第三輪節）
> G4 範圍：工作區中尚未 commit 的 `README.md`（T8）與 `.knowledge/postmortem-log.md`（PM-016）
> **G2 最終判定：✅ 通過**（🔴 0 / 🟠 0）
> **G4 文件一致性判定：❌ 未通過**（🔴 0 / 🟠 1 / 🟡 3）

### R4-1. MJ-3／MN-10 結果

| # | 結果 | 證據 |
|---|:--:|------|
| MJ-3 | ✅ 已修 | 新增共用模組 `src/utils/spawn-error.ts`：`buildSpawnErrorToast` 負責組出標題和內文，`notifySpawnError` 負責推送 toast。四個入口都已接上：`SessionLauncher.vue:235`、`SessionsView.vue:229`（可恢復對話的 Resume）、`HarnessView.vue:98`、`KnowledgeView.vue:166`。三個 view 的 `t` 和 `uiStore` 都已在 script setup 中宣告（`SessionsView.vue:30,33`、`HarnessView.vue:10,13`、`KnowledgeView.vue:14,19`），typecheck 也通過。`resumeByConversationId` 和 `spawn` 的 store 函式只有 try/finally，錯誤會往上拋到 view 的 catch（`src/stores/sessions.ts:170-205, 208-249`），不會在 store 裡被吞掉 |
| MN-10 | ✅ 已修 | `spawn-error.ts:28-31`：`ARS_PATH_NOT_SET` 和 `ARS_REQUIRES_INTERACTIVE` 只顯示 i18n 文字，不再附上後端的中文細節。`ARS_INSTALL_INCOMPLETE` 保留後端原文，因為缺檔清單是動態內容。新增的 1 組 i18n key 在 zh-TW 和 en 兩邊對齊 |

**對非 ARS 錯誤的影響**：HarnessView 和 KnowledgeView 以前失敗時只寫 console，現在會跳出通用的「啟動失敗」toast。這是改善，不是回歸。錯誤處理只在 catch 區塊內，成功路徑沒有改變。

### R4-2. SessionsView 不做元件測試，改用單元測試替代：**可以接受**

理由：
1. SessionsView 本輪的改動只有 catch 區塊裡的一行 `notifySpawnError(err, t, uiStore)`（`:229`），沒有其他邏輯。
2. 可能出錯的部分是訊息怎麼組、標題怎麼選、IPC 前綴怎麼剝，這些都集中在 `spawn-error.ts`，由 `tests/unit/spawn-error.test.ts` 用 7 個精確斷言覆蓋。其中包括 MJ-3 的具體情境：`ARS_INSTALL_INCOMPLETE` 經由 `notifySpawnError` 推送出去，並斷言 `addToast` 收到的三個參數。
3. 「catch 區塊確實呼叫了共用函式」這件事，SessionLauncher 的元件測試已經在真實點擊下驗證過，用的是同一個函式、同一種接法。
4. SessionsView 依賴 VirtualList、router、xterm，要掛載它需要大量 stub，測試的維護成本和假陽性風險都高於它能提供的保護。

剩下的風險是「SessionsView 的這一行被誤刪」，屬於低風險。建議在 T7 補一次 GUI 手動驗證：把 ARS 路徑改成錯的，按 Resume，確認有跳出 toast。

小瑕疵（不列入問題）：`spawn-error.test.ts` 的 notifySpawnError 測試案例用了不存在的 IPC channel 名稱 `'sessions:resumeByConversationId'`（實際是 `sessions:spawn`）。因為前綴本來就會被剝掉，不影響斷言。

### R4-3. 新測試品質

- `tests/unit/spawn-error.test.ts`：共 7 案。`buildSpawnErrorToast` 的 5 案都用 `toEqual` 斷言完整的標題和內文，並用 `not.toContain` 確認沒有夾帶中文；另有 fallback 一案。`notifySpawnError` 的 2 案用 `toHaveBeenCalledWith` 斷言三個參數。✅
- `SessionLauncher.test.ts`：ARS_PATH_NOT_SET 一案改成精確比對 i18n 字串，並斷言內文不含後端的中文；新增 ARS_INSTALL_INCOMPLETE 一案，斷言保留後端原文。✅
- setup.ts 本輪沒有改動。

### R4-4. G4 文件一致性（README.md T8 修改 vs 程式碼與規範）

| README 陳述 | 對照 | 結果 |
|------------|------|:--:|
| 出版部、分流表、一次性準備第 3 步由 🚧 改成 ✅ | T3–T6 已實作，G2 本輪通過 | ✅ |
| 「到 Hub『設定 → 學術出版部』填入 ARS 根目錄（含 `.claude-plugin` 資料夾的那層）」 | `SettingsView.vue` 的「學術出版部」卡片和 key `ars.plugin-dir`；驗證器要求 `.claude-plugin/plugin.json`（`ars-validator.ts`） | ✅ |
| Windows zip 解壓後 4 項 stub 需換成資料夾 | 驗證器列出的 4 個 SKILL.md 和 README 列的 4 項名稱一致；錯誤訊息的修法字句也一致 | ✅ |
| 「不要用 `claude plugin install` 全域安裝；Hub 在啟動 Publication Operator 時自動載入」 | 技術決策書 D2-A；`--plugin-dir` 只注入出版部（含 resume） | ✅ |
| 「路徑沒填、檔案缺漏或非互動模式啟動，會直接顯示錯誤並說明修法，不會啟動一個沒有 ARS 的操作員」 | 後半句成立：一定會擋下。前半句「會直接顯示錯誤」只對 GUI 的 4 個入口成立 | ❌ 見 MJ-4 |
| 授權段落 | 沒有改動，和 SettingsView 的授權提示一致 | ✅ |

#### 🟠 MJ-4（G4）：README 宣稱「會直接顯示錯誤」，但規範描述的主要派工流程不會顯示

- **位置**：`README.md:276`；對照 `.knowledge/specs/feature-spec.md:180`（「總監指派 publication-operator，Hub 以互動模式啟動並注入 ARS」）、`electron/services/message-broker.ts:166-179, 268-285`，以及第一輪的 MN-1（已列 backlog `S7-MN1-ars-autospawn-error-visibility.md`）。
- **問題**：總監透過訊息指派操作員、而操作員還沒有 active session 時，會走 MessageBroker 的 auto-spawn。這時 `ARS_*` 錯誤只會記一行 `logger.warn`，老闆和總監都看不到。第一輪我接受 MN-1 列 backlog，前提是它是「已知的程式碼缺口」；但 T8 新寫的 README 文字把這個缺口描述成不存在。依致命規則 1「文件就是法律」，文件承諾了程式碼沒有做到的行為，這屬於 G4 的對規範不一致。總監究竟是用 SendMessage 還是由老闆在 GUI 手動啟動，我沒有實測（見未驗證清單）；但 feature-spec §6.2 的寫法和 MessageBroker 的 auto-spawn 設計都指向前者可能發生。
- **修改建議**（二擇一）：
  1. **文件面（最小改動）**：把 README:276 改成「從 Hub 介面啟動或接續 Publication Operator 時，路徑沒填、檔案缺漏會直接顯示錯誤並說明修法；由總監以訊息自動派工時，目前錯誤只記在 log（已列 backlog），若操作員遲遲沒有回應，請到設定頁確認 ARS 路徑」。
  2. **程式面**：把 MN-1 的 backlog 提前到本 Sprint 修掉，README 維持現在的寫法。

#### 🟡 MN-12（G4）：T8 的驗收項目尚未完成

- `proposal/sprint7-dev-plan.md` 的 T8 驗收要求對 PM-015 執行 `/pitfall-resolve` 並把 backlog 標為 done。目前 `.knowledge/postmortem-log.md:343-354` 的 PM-015 狀態仍是 `open`；PM-015 的預防措施（啟動前做完整性檢查）已由 `ars-validator.ts` 實作，可以結案了。
- dev-plan §9 的五個文件勾選框都還沒勾；§10 的 T3–T8、Review 紀錄、G2 Gate 列都還空白。
- **建議**：T8 收尾時一併完成。G2 Gate 列可以引用本報告。

#### 🟡 MN-13（G4）：PM-016 沒有加進快速參考表

- **位置**：`.knowledge/postmortem-log.md`，QUICKREF 區塊（約 `:40-49`）。PM-015 有加，PM-016 沒有。
- **建議**：補一行：「關於 CLI 參數是否跨 resume 保留 → 用 `system.init` 實證，`--mcp-config`／`--plugin-dir` 都不會自動繼承 → PM-016」。PM-016 本身的內容和 T7 證據（`sprint7-t7-evidence.md:100`）一致，也有 backlog，合格。

#### 🟡 MN-14（G4）：T7 證據第 5 項的判定已經過時

- **位置**：`docs/reviews/sprint7-t7-evidence.md:104-139`，判定寫的是 ⚠️「錯誤在 UI 被吞掉」。
- **問題**：0a55011 和 f130d0f 已經修好這一點，但證據檔沒有補記。G3 的審查者會看到互相矛盾的狀態。
- **建議**：在第 5 項末尾追加「修正後狀態：已由 0a55011／f130d0f 修正，見 G2 review 第三、四輪」。最好再補一次 GUI 手動驗證的截圖。

另外，README:273 的範例路徑 `academic-research-skills-main/` 是 zip 下載的資料夾命名，和同一句「建議 git clone」不太搭，屬於措辭，不列入問題。

### R4-5. 驗證指令輸出

```
$ git log --oneline 0a55011..HEAD   → f130d0f fix(ui): 所有 session 啟動／接續入口失敗時都顯示錯誤
$ git status --short                → M .knowledge/postmortem-log.md, M README.md（T8，未 commit）；本報告
$ npx vitest run
 Test Files  32 passed (32)
      Tests  437 passed (437)       （第三輪 429 → +8）
EXIT 0
$ npm run lint
✖ 128 problems (0 errors, 128 warnings)   EXIT 0（總數和前三輪相同）
$ npm run typecheck
tsc -p tsconfig.node.json / tsconfig.web.json → 無錯誤   EXIT 0
$ grep -rn "interactive: false" src electron   → 除了 spawn helper 之外沒有其他結果（GUI 沒有非互動的啟動入口）
```

### R4-6. 判定

**G2（程式碼 ＋ 規範）**

| 等級 | 數量 | 說明 |
|------|:--:|------|
| 🔴 Blocker | 0 | — |
| 🟠 Major | 0 | MJ-1、MJ-2、MJ-3 都已修正，並有測試 |
| 🟡 Minor | 未結 1 | MN-1（backlog，已接受）。MN-2～MN-10 已修；MN-11 已記 PM-016 並建 backlog |

**G2 最終判定：✅ 通過**，可以提交 G2 Gate。

**G4（文件 vs 程式碼）**

| 等級 | 數量 | 項目 |
|------|:--:|------|
| 🔴 Blocker | 0 | — |
| 🟠 Major | 1 | MJ-4：README:276 宣稱的錯誤呈現範圍超過程式碼實際能做到的 |
| 🟡 Minor | 3 | MN-12（T8 驗收項未完成）、MN-13（QUICKREF 缺 PM-016）、MN-14（T7 證據過時） |

**G4 判定：❌ 未通過**。修掉 MJ-4（建議採文件面的一句改寫）並完成 MN-12 後，再送 G4 複審。

### R4-7. 第四輪未驗證項目

- research-director 實際上是用 SendMessage 觸發 auto-spawn 來指派 publication-operator，還是由老闆在 GUI 手動啟動：沒有實測。這影響 MJ-4 的實際發生頻率，但不影響「README 陳述超出程式碼」這個判斷。
- 四個 GUI 入口的 toast 在真實 Hub 裡的畫面：沒有截圖，也沒有點擊。
- 主 clone 裡的 backlog 檔 `S7-resume-mcp-config-lost.md`：只用 `ls` 確認檔案存在，沒有開啟確認內容。
- `preflight.cjs`、`npm run build`：本輪沒有執行。

---

## 第五輪（G4 複審）

> 審查者：同一位獨立 reviewer
> 日期：2026-09-28
> 範圍：`git diff f130d0f..e56c65b`（只有文件：README、postmortem-log、dev-plan、T7 證據，以及本報告第四輪節）
> **G4 最終判定：✅ 通過**（🔴 0 / 🟠 0 / 🟡 0 未修）

| # | 結果 | 證據 |
|---|:--:|------|
| MJ-4 | ✅ 已修 | `README.md:276` 改寫為三件事：「一律拒絕啟動」（程式碼成立，擋在任何寫檔之前）；「從 GUI 啟動或接續時畫面會跳出錯誤提示」（四個入口都已接上 `notifySpawnError`）；「⚠️ 由總監訊息自動啟動時，失敗只記在 log、畫面不提示（backlog S7-MN1）」。最後一點我對照了 `message-broker.ts:166-179` 和 `:268-285`：兩條 auto-spawn 路徑在 catch 裡都只有 `logger.warn`；全檔只 emit `message:created`／`message:delivered`／`message:read` 三種事件（`:240, :350, :359`），沒有任何通往畫面的失敗通知。另外 auto-spawn 固定帶 `interactive: true`（`session-manager.ts:111`），所以這條路徑只會遇到路徑未設定或安裝不完整兩種錯誤，README 的敘述也沒有超出這個範圍。README 另外寫了「操作員沒有動靜就先去設定頁檢查」的處置建議，和現況相符 |
| MN-12 | ✅ 已修 | PM-015 狀態改為 resolved，並寫明解法依據（`postmortem-log.md:353`）；主 clone 的 backlog `PM-015-ars-skills-symlink-check.md` 狀態是 `done`。dev-plan §9 五個勾選框都已勾，§10 的 T3–T8 和 Review 紀錄也已回填，內容和 commit 歷程、各輪 review 一致。Gate 列依協調者說明刻意留白（決策屬於老闆），不算缺漏 |
| MN-13 | ✅ 已修 | 快速參考表新增 PM-016 那一行（`postmortem-log.md:48`），並涵蓋 `--plugin-dir` 和 `--mcp-config` 兩種參數 |
| MN-14 | ✅ 已修 | T7 證據第 5 項標題改成「✅（原判 ⚠️，已修正）」，附上修正的 commit 和仍存在的限制（auto-spawn 只記 log、GUI 沒有截圖）；原始追蹤紀錄保留，稽核軌跡完整 |

補充觀察（不列入問題）：
- dev-plan 的 Review 紀錄把「測試 Review」連到 T7 證據，而那份證據的 GUI 畫面仍然沒有截圖。T7 那一列已經自己標註「未驗證」，沒有隱瞞。
- 本輪沒有程式碼變更，所以沒有重跑 vitest、lint、typecheck；最後一次全綠是第四輪在 f130d0f 的結果（437/437）。

### 第五輪判定

**G4 最終判定：✅ 通過**。Sprint 7 的 G2（第四輪）和 G4（本輪）都已通過，可以交給老闆做 Gate 決策。

仍然開著、但不擋 Gate 的項目：
- MN-1（backlog S7-MN1）
- PM-016（backlog `S7-resume-mcp-config-lost.md`）
- GUI 畫面截圖（T7 未驗證項）

### 第五輪未驗證項目

- 本輪沒有重跑測試（純文件變更）。
- 審查當下 worktree 短暫出現一個未追蹤的 `electron.vite.config.1790580363080.mjs`（electron-vite build 的暫存檔），寫完本節時已自動消失，不在本輪範圍。
