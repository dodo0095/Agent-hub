# Sprint 7.1 T12 — 端到端驗證與 G2 Review 證據（T9／T10／T11）

- 驗收者：fresh-context 獨立驗收 agent（未參與 T9–T11 實作）
- 工作目錄：`C:/Users/Bandai/Desktop/ALL PROJECT/.agenthub-worktrees/Agent-hub/5593beb7`（`pwd` 確認）
- 分支：`agent/tech-lead/2026-10-02`（`git branch --show-current` 確認）；HEAD = `778c725`（`git rev-parse --short HEAD` 確認），驗收全程 `git status --short` 乾淨
- 審查範圍：`git diff c356247..778c725`（`4b8bf11` 規格、`43ac50c`、`778c725`；19 檔，+1718／−103）
- 規範來源：`.knowledge/specs/api-design.md` §7（L149–L190）、`proposal/sprint7-dev-plan.md` 第 6 節 T9–T12（L139–L142）與第 11 節（L226–L229）、`.knowledge/postmortem-log.md` PM-016（L357–L368）
- claude CLI：`$APPDATA/npm/claude.cmd`，`claude --version` = `2.1.283 (Claude Code)`
- node：`/c/Program Files/nodejs/node.exe` `v24.14.0`、npm `11.9.0`
- 暫存／證據目錄：`C:/Users/Bandai/AppData/Local/Temp/claude/C--Users-Bandai-Desktop-ALL-PROJECT--agenthub-worktrees-Agent-hub-5593beb7/623e08b9-a9f5-4243-9cde-029d2751252b/scratchpad/t12/`（下稱 `$SC`）

## 環境校準（先讀）

1. **本 agent 沙箱 PATH 不含 node/npm**（`npm: command not found`）。所有指令先 `export PATH="/c/Program Files/nodejs:$PATH"`；CLI 測試再加 `/c/Users/Bandai/AppData/Roaming/npm`。屬環境限制，非 Hub 問題（同 t7-evidence 校準第 1 點）。
2. **`npm install` 失敗於 postinstall**：`electron-builder install-app-deps` 重編 `node-pty` 時 node-gyp `PythonFinder.findPython` 找不到 python → `npm error code 1`（PM-001 同類）。改用 `npm install --ignore-scripts`（exit 0）。影響：node-pty 原生模組未針對 Electron 重編；vitest 全套以 mock 執行，不受影響；**未啟動 Electron GUI**。
3. **第一次全套 vitest 有 1 個檔案紅**：`tests/mcp/send-message-server.e2e.test.ts` 2 個 describe 失敗，訊息 `Built MCP server not found at ...\out\mcp\send-message-server.js. Run \`npm run build:mcp\` first.`——新 worktree 沒有 `out/`，屬**測試前置條件（環境）**，非回歸。執行 `npm run build:mcp`（`tsc -p tsconfig.mcp.json`）後重跑全綠（見下節）。`out/` 為 gitignore，未造成 working tree 變更。
4. **preflight 跳過 lint/typecheck**：因 working tree 乾淨，preflight 判為「純文件變更，跳過」。本次 lint/typecheck 另以 `npm run lint`／`npm run typecheck` 手動執行（見下節），不依賴 preflight 的判斷。

---

## 一、基準線檢查（實際執行）

| 指令 | 結果 | 輸出摘要 |
|------|------|---------|
| `npx vitest run`（build:mcp 前） | ❌ 環境 | `Test Files 1 failed \| 34 passed (35)`；`Tests 478 passed \| 7 skipped (485)`；失敗原因見校準第 3 點 |
| `npm run build:mcp` | ✅ | `tsc -p tsconfig.mcp.json` 無輸出錯誤 |
| `npx vitest run`（全套，build:mcp 後） | ✅ | `Test Files 35 passed (35)`；`Tests 485 passed (485)` |
| `npm run lint` | ✅ | exit 0；`✖ 128 problems (0 errors, 128 warnings)`（warnings 為既有，例 `src/views/TaskBoardView.vue:52 priorityColor` 未使用；本次未逐條比對是否有新增 warning，見「未驗證」） |
| `npm run typecheck` | ✅ | exit 0；`typecheck:node`、`typecheck:web` 皆無錯誤 |
| `node scripts/preflight.cjs` | ✅ | `preflight: PASS`；工作目錄 pass、已含 main 全部 commits；lint/typecheck 被跳過（校準第 4 點） |
| `npx vitest run` 5 個 7.1 測試檔 | ✅ | `Test Files 5 passed (5)`；`Tests 110 passed (110)` |

測試數核對：Sprint 7 基準 437；本範圍新增 `it(` 共 48 個（message-broker-t10 15、session-spawn-helpers 12、session-manager 2、app-notification 13、ui-store-notifications 6），437 + 48 = 485，與實測吻合。

---

## 二、T9 — resume 保留 `--mcp-config`（api-design §7.1）

| # | 標準 | 判定 | 證據 |
|---|------|------|------|
| T9-1 | `isResume` 路徑含 `--mcp-config` | ✅ 通過 | `electron/services/session-spawn-helpers.ts:340`；測試 `tests/services/session-spawn-helpers.test.ts:699`（斷言 `args` 含 `--mcp-config` 且寫出的 config `agentId` 為原 agent） |
| T9-2 | `isDirectResume` 路徑含 `--mcp-config` | ✅ 通過 | `session-spawn-helpers.ts:295`；測試 `:716`（`toEqual(['--resume', conv, '--mcp-config', …])`，`agentId: ''` 與 `src/stores/sessions.ts:174` 實際呼叫一致） |
| T9-3 | 找不到 agent 時不含 | ✅ 通過 | `session-spawn-helpers.ts:166-168`（`!effectiveAgentId` 或 `getAgent` 為 undefined 即 return）；測試 `:736`、`:755`（`not.toContain('--mcp-config')`） |
| T9-4 | MCP 設定產生失敗不讓 resume 拋錯 | ✅ 通過 | `session-spawn-helpers.ts:212-215` try/catch 只 `logger.warn`；測試 `:771`、`:790`（`writeFileSync` 拋 EACCES → `not.toThrow()`，`args` 仍為 `['--resume', conv]`，`logger.warn` 被呼叫） |
| T9-5 | 非 resume 行為不變 | ✅ 通過 | 舊區塊（diff 中 −55 行）與 `injectMcpConfigIfNeeded`（`:158-216`）逐行比對：allowedTargets 組法、AgentMcpConfig 欄位、檔名 `mcp-agent-config-<8>.json`／`mcp-servers-<8>.json`、`existsSync(serverScriptPath)` 分支、log 文字皆相同；唯一差異是函式內多一次 `mkdirSync`（目錄已存在時為 no-op）。一般啟動呼叫點 `:452` 位置仍在 `--plugin-dir` 之前，與舊順序相同。測試 `:685`（agentId／allowedTargets／projectId 'proj-1'） |
| T9-6 | 一般啟動與 resume 共用同一產生函式 | ✅ 通過 | 三個呼叫點 `:295`、`:340`、`:452` 皆呼叫 `injectMcpConfigIfNeeded`；`grep` 全檔無第二份 `mcpServers` 組裝 |
| T9-7 | resume 用原 session 的 project_id | ✅ 通過（程式碼）／⚠️ 無測試 | `isResume`：`:306-311` 讀 `claude_sessions.project_id`，chained resume 時取反查結果 `:334`；`isDirectResume`（agentId 空）：`:283-289` 取 `lookupOriginalAgentByConversation` 的 `project_id`（SQL `:120`）。**例外**：direct resume 若 `params.agentId` 非空則 projectId 恆為 null（見 R71-02）。**測試缺口**：T9 測試的 DB mock 根本不回傳 `project_id`（`session-spawn-helpers.test.ts:634-650`），沒有任何 resume 測試斷言 config 的 `projectId`（見 R71-04） |
| T9-8 | `buildClaudeArgs` 回傳 `resolvedAgentId`，session-manager 以它登記（查不到才 `'(resumed)'`） | ✅ 通過 | 回傳型別 `session-spawn-helpers.ts:263`，回傳點 `:296`、`:341`、`:461`；`session-manager.ts:313`（`resolvedAgentId \|\| resumeFallbackAgentId`）、`:315-320`（agentName 取 agent 定義名）；INSERT 使用同一 `agentId` 變數（`session-manager.ts:360-362`）。測試 `session-spawn-helpers.test.ts:817-875`（resolvedAgentId 5 例）、`tests/services/session-manager.test.ts` 新增 2 例（chained `(resumed)` 反查與 direct resume 反查後 `session.agentId` 為真實 agent） |
| T9-9 | PM-016 錯誤註解已移除 | ✅ 通過 | `grep -rn "inherit the original session" electron/` 只剩 `:142`（docstring 引述為「錯誤說法」）與 `:449`（「resume does NOT inherit…」），原斷言式註解已刪 |

### T12(a) CLI 層實測：`--resume` ＋ Hub 格式 `--mcp-config` — ✅

設定檔依 `injectMcpConfigIfNeeded`（`session-spawn-helpers.ts:177-201`）的結構手動重建（非由 `buildClaudeArgs` 實際產出，見「未驗證」第 2 點）：
- `$SC/mcp-agent-config.json`：`{agentId:"research-director", allowedTargets:["publication-operator"], inboxDir:"$SC/inboxes", projectId:"proj-t12", rateLimit:20}`（inboxDir 指向暫存，避免寫入真實 inbox）
- `$SC/mcp-servers.json`：`{"mcpServers":{"send-message":{"command":"node","args":["<worktree>/out/mcp/send-message-server.js","$SC/mcp-agent-config.json"],"type":"stdio"}}}`

指令（cwd = `$SC`，避免觸發 worktree 的 Hub hooks）：
```
# run0：建立原始 session（不帶 MCP）
claude --model haiku --max-turns 1 --output-format json -p "Reply with exactly: T12-ORIG-MARKER-7f3a"
  → session_id = 8a745fa9-560c-4d8f-b948-b275c1b3d491
# run1：resume ＋ --mcp-config（T9 修正後的行為）
claude --resume 8a745fa9-… --mcp-config "$SC/mcp-servers.json" --model haiku --max-turns 1 \
  --output-format stream-json --verbose --debug --debug-file "$SC/run1-resume-mcp-debug.log" \
  -p "T12-RESUME-MCP-MARKER-c91e: what was the exact marker string …? Also list any tool names starting with mcp__send-message."
# run2：對照組，resume 不帶 --mcp-config（T9 修正前的行為）
claude --resume 8a745fa9-… --model haiku --max-turns 1 --output-format stream-json --verbose \
  --debug --debug-file "$SC/run2-resume-nomcp-debug.log" -p "T12-RESUME-NOMCP-MARKER-44d0: …"
```

結果：
| 項目 | run1（resume＋mcp-config） | run2（resume 無 mcp-config） |
|------|------|------|
| `system.init.session_id` | `8a745fa9-…`（同一 session，確實是 resume） | `8a745fa9-…` |
| `system.init.mcp_servers` | 含 `{"name":"send-message","status":"connected","source":"dynamic"}` | 無 send-message（僅 4 個 claude.ai 內建） |
| `system.init.tools` 中 send-message 工具 | `mcp__send-message__list_inbox`、`mcp__send-message__send_message` | `[]` |
| debug log | `run1-resume-mcp-debug.log:112` `MCP server "send-message": Successfully connected (transport: stdio) in 98ms`；`:113` `serverVersion {"name":"send-message","version":"1.0.0"}` | `grep -c send-message` = 0 |
| 模型回覆 | 「The exact marker string … was: **T12-ORIG-MARKER-7f3a**」＋列出兩個 send-message 工具（證明對話脈絡被帶回且 MCP 可用） | 「There are no available tool names starting with mcp__send-message…」 |

註：唯一 marker 未出現在 debug log（CLI 不記錄 prompt 本文），改以 run0 的 marker 被 run1 模型正確回憶＋相同 `session_id` 證明 resume 成立。未實際呼叫 `send_message`／`list_inbox`（只驗連線與工具出現）。

**判定：✅**——CLI 2.1.283 下 `--resume` 必須重新帶 `--mcp-config` 才有 send-message（run2 重現 PM-016），帶上 Hub 格式設定後 server 連線成功（run1）。

---

## 三、T10 — MessageBroker 自動啟動失敗（api-design §7.2）

| # | 標準 | 判定 | 證據 |
|---|------|------|------|
| T10-1 | 兩條 auto-spawn 路徑皆套用 | ✅ 通過 | InboxPoller `electron/services/message-broker.ts:188-194`；tryDeliver `:304-306`；兩者共用 `handleArsAutoSpawnFailure`（`:492`） |
| T10-2 | ARS_* 冷卻 5 分鐘 | ✅ 通過 | `:50` `ARS_FAILURE_COOLDOWN_MS = 5 * 60_000`；`:506` 設 `until`；`canAutoSpawn` `:431-439` 在兩條路徑的 auto-spawn 前檢查。測試 `message-broker-t10.test.ts:194`、`:355`（`canAutoSpawn` 為 false）、`:240`、`:431`（第二次不再 `spawnSession`）、`:272`、`:384`（5 分鐘後可再試） |
| T10-3 | 冷卻期間訊息維持 pending | ✅ 通過（程式碼）／⚠️ tryDeliver 無直接斷言 | InboxPoller：`:192-193` `seen.delete(key)`、不設 `msg.read`，測試 `:211` 斷言原 inbox 檔未被寫回。tryDeliver：`markDelivered` 只在成功分支呼叫（`:297`），catch 直接 return（`:310`）；但 tryDeliver 的 ARS 測試沒有斷言原訊息未被 UPDATE（見 R71-04） |
| T10-4 | 同 agent＋同錯誤碼冷卻期內只通知一次 | ✅ 通過 | `:503-513`；測試 `:472`（同碼兩次 → 1 次通知、1 筆回訊 INSERT）、`:489`（不同碼 → 2 次） |
| T10-5 | `fromAgent:'system'` 回訊給原發訊者，內容含目標 agent、錯誤碼、原訊息、「設定 → 學術出版部」 | ✅ 通過（程式碼）／⚠️ 測試未斷言「原訊息」 | `:527-540` 內容 `無法自動啟動 ${targetAgent}：${code}`／`錯誤訊息：`／`原訊息：${originalContent}`／`請告知老闆到「設定 → 學術出版部」處理。`，`projectId` 帶原訊息的。測試 `:216-222` 斷言 from=system、to=research-director、含 `publication-operator`、`ARS_PATH_NOT_SET`、`設定 → 學術出版部`；`:366` 斷言 project_id；**未斷言含原訊息本文**（R71-04） |
| T10-6 | 送 `app:notification` | ✅ 通過 | `:516-524`；payload `{level:'error', code, message, source:'message-broker', agentId}` 與 §7.3 介面一致；測試 `:226-232`、`:368-376`（含 message 帶錯誤細節） |
| T10-7 | 防迴圈：發訊者為 system 不回 | ✅ 通過 | `:527`；測試 `:300`（InboxPoller）、`:443`（tryDeliver，`mockDbRun` 未被呼叫） |
| T10-8 | 防迴圈：system 回訊本身 auto-spawn 失敗不再回 | ✅ 通過 | 回訊經 `send()`→`tryDeliver`，失敗時 `fromAgent='system'` 進 `:527` 被擋；測試 `:501`（MN-G：全員離線＋全部 ARS 失敗 → 只有 1 筆 INSERT、2 次通知、`spawnSession` 恰 2 次） |
| T10-9 | 先通知再回訊；回訊失敗只 warn 不外拋 | ✅ 通過 | 通知 `:524` 在回訊 `:529` 之前；`:541-543` catch 只 `logger.warn`。測試 `:413`（INSERT 拋 `database is locked` → `not.toThrow()`、通知仍 1 筆、warn 被呼叫），間接證明順序 |
| T10-10 | 冷卻過期刪 entry | ✅ 通過 | `:434-438`（過期時 `delete`，惰性刪除——只在下次 `canAutoSpawn` 時）；測試 `:397`（MN-D） |
| T10-11 | 非 ARS 錯誤維持原狀 | ✅ 通過 | `:195-198`、`:307-309` 仍為原 `logger.warn` 文字；測試 `:321`、`:455`（`canAutoSpawn` 仍 true、無 INSERT、無通知、warn 被呼叫） |

### T12(b) broker 失敗流程實證 — ✅

以 `npx vitest run tests/services/message-broker-t10.test.ts …`（5 檔 110 例全綠）實際執行；規格對照見上表各列「測試」欄。測試以 SQL-aware DB mock（PM-012）與 fs mock 驅動真正的 `messageBroker` 單例（`checkInboxFile` 與 `tryDeliver` 實際程式路徑），非僅測 helper。抽查：斷言的是外部可觀察行為（INSERT 參數、eventBus 事件內容、`spawnSession` 呼叫次數、inbox 檔是否被寫回），不是只跑過。未另寫腳本。

---

## 四、T11 — App 層通知顯示（api-design §7.3）

| # | 標準 | 判定 | 證據 |
|---|------|------|------|
| T11-1 | main 以既有 notification 通道送出，未新增 IPC | ✅ 通過 | `electron/main.ts:142` `eventBus.on('app:notification', (data) => safeSend(IpcChannels.NOTIFICATION, data))`；`IpcChannels.NOTIFICATION` 既有（`electron/types/ipc.ts:158`）；`git diff --stat c356247..778c725 -- electron/ipc electron/preload.ts src/composables src/env.d.ts` 為空——四方檔案皆未變更，既有 `preload.ts:297,480-481`、`useIpc.ts:515`、`env.d.ts:389` 已接好 |
| T11-2 | App 層只訂閱一次 | ✅ 通過 | `src/App.vue:62` 呼叫一次；`src/stores/ui.ts:100-102` 旗標防重複；測試 `tests/unit/ui-store-notifications.test.ts:27`（呼叫多次 → `on.notification` 只被呼叫 1 次） |
| T11-3 | ARS_* 沿用 spawn-error 的 i18n 規則 | ✅ 通過 | `src/utils/spawn-error.ts` 抽出 `buildArsErrorToast`，`buildSpawnErrorToast` 與 `src/utils/app-notification.ts`（`buildAppNotificationToast`）共用同一函式；非 ARS 用 `title` 或 `notifications.genericTitle` |
| T11-4 | 收到 ARS_PATH_NOT_SET 顯示對應 toast 有測試 | ✅ 通過 | `ui-store-notifications.test.ts:36-48`：type `error`、title `[publication-operator] ARS Path Not Set`、message `Go to Settings → Academic Publication to set the ARS path.`、不含中文後端細節；`tests/unit/app-notification.test.ts:59` 同規則單元測試 |
| T11-5 | zh-TW／en locale key 一致 | ✅ 通過 | node 腳本遞迴比對兩檔 key：`en 612 zh 612 onlyEn [] onlyZh []`；新增 `notifications.genericTitle`、`notifications.agentTag` 兩邊皆有 |

---

## 五、G2 Review

### 對規範（實作 vs api-design §7）

§7.1、§7.2、§7.3 每列皆有對應實作（見第二～四節逐條）。偏離僅 R71-02（direct resume 帶非空 agentId 時 projectId 未取原 session）。

### 問題清單

| 編號 | 等級 | 位置 | 問題 |
|------|------|------|------|
| R71-01 | 🟡 Minor | `electron/services/message-broker.ts:192-193`（沿用 `:202-203` 既有寫法） | InboxPoller ARS 分支 `dirty = false` 會覆蓋同一檔案迴圈中「前面已標 `msg.read = true`」的訊息的寫回需求：若同一 inbox 檔先有一則成功投遞、後有一則 ARS 失敗，檔案不會被寫回，前一則的 `read:true` 只留在記憶體（`seen` 仍擋住重送，所以本次執行期不會重複投遞；但磁碟狀態落後）。與 rate-limit 分支同一既有模式，非 7.1 新引入的設計，但 7.1 複製了它。建議改為不重設 `dirty`（只 `seen.delete`）。 |
| R71-02 | 🟡 Minor | `electron/services/session-spawn-helpers.ts:279-290` | 規格 §7.1「resume 時取原 session 的 project_id」：direct resume 在 `params.agentId` 非空時跳過反查，`directResumeProjectId` 恆為 `null`。目前唯一呼叫端 `src/stores/sessions.ts:174` 固定傳 `agentId: ''`，故現況不觸發；屬未來呼叫端的規格偏離。 |
| R71-03 | 🟡 Minor | `src/utils/app-notification.ts:14-21` vs `electron/types/notification.ts:9-20` | `AppNotification` 介面在前後端各定義一份（`src/` 未引用 `electron/types`），欄位現在一致，但無機制防漂移。 |
| R71-04 | 🟡 Minor | `tests/services/session-spawn-helpers.test.ts:634-650`、`tests/services/message-broker-t10.test.ts:216-222`、`:355-377` | 測試缺口（行為本身經程式碼確認正確）：(a) resume 的 `mcp-agent-config.projectId` 無任何測試，DB mock 甚至不回 `project_id`；(b) system 回訊未斷言含「原訊息」本文；(c) tryDeliver ARS 失敗未直接斷言原訊息未被標 delivered。 |
| R71-05 | 🟡 Minor | `electron/services/message-broker.ts:506` | `alreadyNotified` 時仍以 `now + 5min` 覆寫 `until`，會延長冷卻窗。正常流程因 `canAutoSpawn` 先擋而不可達（作者 docstring 已說明），僅直接呼叫 handler 時發生；記錄供參。 |

程式碼面其他檢查：無死碼（舊 MCP 區塊已整段移除、改名的 `lookupOriginalAgentByConversation` 舊名無殘留——`grep -rn lookupOriginalAgentIdByConversation electron src tests` 無任何結果）、錯誤處理符合「不得拋出」要求、typecheck/lint 0 error。

標準之外的嚴重問題（刪資料、壞基準線）：**未發現**。

---

## 判定

- T9：9/9 通過（T9-7 程式碼通過但缺測試，列 R71-02、R71-04）
- T10：11/11 通過（T10-3、T10-5 部分缺測試斷言，列 R71-04）
- T11：5/5 通過
- T12(a) CLI 實測：✅；T12(b) broker 失敗流程：✅（測試實證）；T12(c) G2 Review：完成
- 問題數：**🔴 Blocker 0／🟠 Major 0／🟡 Minor 5**（R71-01～R71-05）
- 依 dev-plan T12 驗收條件（`Review 0 Blocker／0 Major`）：**通過**

---

## 證據檔索引（`$SC`）

| 檔案 | 內容 |
|------|------|
| `mcp-agent-config.json`、`mcp-servers.json` | 依 Hub 程式碼結構重建的 MCP 設定 |
| `run0.json` | 原始 session（session_id `8a745fa9-…`） |
| `run1.jsonl`、`run1-resume-mcp-debug.log` | resume＋`--mcp-config`：send-message connected |
| `run2.jsonl`、`run2-resume-nomcp-debug.log` | 對照組 resume 無 `--mcp-config`：無 send-message |

## 未驗證

1. **Hub GUI 實機**：未啟動 Electron（node-pty 未重編，校準第 2 點），toast 實際畫面、`safeSend` 到 renderer 的真實 IPC 傳遞未觀察；T11 僅以單元測試＋原始碼確認。
2. **CLI 實測的設定檔是手動依程式碼結構重建**，不是由 `buildClaudeArgs` 在 Hub 內實際產出的檔案；Windows 反斜線路徑（`join()` 產生）未測，本次用正斜線。
3. **未在 Hub 內端到端重現** resume 後 SendMessage 真的把訊息送進另一 agent 的 inbox／broker（只驗到 MCP server 連線＋工具出現，未呼叫 `send_message`）。
4. 真實 ARS 缺設定時，總監→操作員訊息觸發 auto-spawn 失敗的完整 GUI 流程（通知 toast＋總監收到 system 回訊）未在真實環境跑過，僅單元測試。
5. lint 128 個 warnings 未與 `c356247` 基準逐條比對，無法確認本範圍是否新增 warning（0 error 已確認）。
6. `npm install` 完整 postinstall（含 node-pty 重編）在老闆環境是否成功未驗證。
