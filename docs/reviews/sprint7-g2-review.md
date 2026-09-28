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
