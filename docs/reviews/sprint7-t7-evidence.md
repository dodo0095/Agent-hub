# Sprint 7 T7 — ARS 整合真實環境端到端驗證證據

- 驗收者：fresh-context 獨立驗收 agent（未參與 T7 實作）
- 工作目錄：`C:/Users/Bandai/Desktop/ALL PROJECT/.agenthub-worktrees/Agent-hub/3586a1dd`
- 分支：`agent/tech-lead/2026-09-27`；`git branch --show-current` 確認為此分支
- 交付時聲稱實作在 commit `64ebd01`；**驗收過程中，另一個並行 session 在此 worktree 上新增了 commit `5219afa`（`fix(academic): G2 Review 修正——direct resume 找回出版部 agent、路徑正規化、個資邊界`），驗收完成時 HEAD 已是 `5219afa`**（見下方「環境校準」第2點）
- claude CLI：`$APPDATA/npm/claude.cmd`，`--version` = `2.1.283 (Claude Code)`
- node：`/c/Program Files/nodejs/node.exe`，`v24.14.0`
- ARS 路徑：`C:/Users/Bandai/Desktop/ALL PROJECT/academic-research-skills-main`（`.claude-plugin/plugin.json` version `3.22.2`）
- 證據檔／暫存目錄：`C:/Users/Bandai/AppData/Local/Temp/claude/C--Users-Bandai-Desktop-ALL-PROJECT--agenthub-worktrees-Agent-hub-3586a1dd/b1804c82-a30c-469f-ba85-24296542514f/scratchpad/t7/`（下稱 `$SC`）

## 環境校準（重要，先讀）

1. **本 agent 執行環境的 PATH 不含 node/python**（Git Bash 與 PowerShell 皆確認 `node`/`python` command not found），但 Windows 使用者的真實 Machine/User PATH 確實含 `C:\Program Files\nodejs\`（`[Environment]::GetEnvironmentVariable('Path','Machine')` 證實）。這是**本驗收 agent 沙箱環境的限制，不是 Hub 或 ARS 的問題**。為了能執行 CLI，本次所有指令都先 `export PATH="/c/Program Files/nodejs:$PATH"`。**python 全程未加回 PATH**——這直接影響第 3 項（ARS guard 降級）的判讀，見下方說明。
2. **worktree 在驗收期間被並行修改**：驗收開始時（`git log` 首次確認）HEAD 是 `64ebd01`，但 `git status --short` 隨即顯示 `electron/services/session-spawn-helpers.ts`、`electron/utils/ars-validator.ts`、`agents/definitions/academic-publication/publication-operator.md`、`.knowledge/specs/api-design.md` 等 9 個檔案有未 commit 的修改（diff 內含 "G2 review MN-2/MN-6/MJ-1" 字樣）。驗收快結束時再查，這批修改已被另一個並行 session commit 成 `5219afa`（HEAD 現在是 `5219afa`，`git status --short` 只剩本 agent 自己產生的 `scratchpad/`）——**證明這個 worktree 在本次驗收期間有其他 session 同時在寫**，不是本 agent 造成。逐一核對內容後：
   - `session-spawn-helpers.ts` 的差異只落在 `resolveArsPluginDir`（DB 例外包裝、路徑 trim/去引號）與 `isDirectResume` 分支（agentId 空字串時的 fallback 查詢）；**本次五項驗收實際執行到的路徑——正常 spawn 組參數段、`isResume`（`--resume` + DB 查表）分支——未被這批修改觸及**，所以以下第1/2/3/4項證據對 `64ebd01` 與 `5219afa` 皆成立。
   - `ars-validator.ts` 的差異是 `existsSync`→`statSync(...).isFile()`，第 5 項的 `validateArsPluginDir` 直測是對「當時 working tree 版本」（= 現已 commit 的 `5219afa` 版本）測的，行為（ok=true / ok=false + missing 清單）與規格描述一致。
   - 本 agent 全程只用 Read 讀過這些檔案，未用 Edit/Write，這批變更與其 commit 動作皆非本 agent 所為；提醒技術負責人：與其他 session 共用同一 worktree 目前無隔離，下次驗收建議改用獨立 worktree 以避免證據時間點混淆。
3. 驗收過程中依任務指示用 Write 工具在 worktree 相對路徑 `scratchpad/t7/write-test.txt` 寫入測試檔（第 3 項要求）；該檔案目前仍在 worktree 內為 untracked 狀態（`git status --short` 顯示 `?? scratchpad/`），未 commit/未 stash，如需清理請由使用者執行 `rm -rf scratchpad`（本 agent 的 `rm -rf` 被沙箱權限擋下，未強行繞過）。

---

## 方法：手動重建 buildClaudeArgs 的參數組合

讀 `electron/services/session-spawn-helpers.ts`（`buildClaudeArgs`，行 101-310）確認正常 spawn 會產生：
`--model <model> --system-prompt-file <tmp.md> [--settings <tmp.json>] [--mcp-config <tmp.json>] [--plugin-dir <ARS>]`
（非互動再加 `--max-turns/--output-format/--verbose/-p`）。据此在 `$SC/` 建立：
- `system-prompt.md`：`agents/definitions/academic-publication/publication-operator.md` 原文
- `settings.json`：仿 `settingsObj`（statusLine → `electron/utils/session-statusline.js`）
- `mcp-agent-config.json` / `mcp-servers.json`：仿 `AgentMcpConfig` / `McpServerConfig`，`command:"node"`、`args:[out/mcp/send-message-server.js, mcp-agent-config.json]`（`out/mcp/send-message-server.js` 已存在，未需 `npm run build:mcp`）
- `--plugin-dir` 指向真實 ARS 路徑

全部指令都在 `cwd = 本 worktree`（含 `.claude/settings.json` 的 Hub hooks），`--model haiku`，`--debug --debug-file <run*-debug.log>`。

---

## 逐項結果

### 1. ARS 載入 — ✅

指令（節錄，完整見 `$SC/run1-debug.log` 與下方指令區）：
```
claude --model haiku --system-prompt-file $SC/system-prompt.md --settings $SC/settings.json \
  --mcp-config $SC/mcp-servers.json --plugin-dir "$ARS" --max-turns 6 \
  --output-format json --verbose --debug --debug-file $SC/run1-debug.log -p "..."
```
關鍵輸出（`$SC/run1-debug.log:114,117`）：
```
Loaded 16 commands from plugin academic-research-skills default directory
Loaded 4 skills from plugin academic-research-skills default directory
```
模型回答（`$SC/run1-stdout.json`, `result` 訊息）：`/ars- 開頭的 slash commands 共 16 個；任意 3 個例子：/ars-full、/ars-revision、/ars-citation-check`。CLI `system.init` 訊息的 `slash_commands` 陣列（143 個中）含 16 個 `academic-research-skills:ars-*`（`ars-3w`…`ars-unmark-read`），與 ARS `commands/` 目錄下 16 個檔案一致。

**判定：✅**（debug log 精確符合驗收字串「Loaded 4 skills」「Loaded 16 commands」，模型可見 academic-research-skills 前綴的 skill/command）。

### 2. 與 --mcp-config 並用（send-message MCP）— ✅

同一次 run1 呼叫（同時帶 `--plugin-dir` 與 `--mcp-config`）。`system.init` 訊息 `mcp_servers` 欄位：
```
{"name":"send-message","status":"connected","source":"dynamic"}, ...
```
`tools` 欄位含 `mcp__send-message__list_inbox`、`mcp__send-message__send_message`（MCP 標準命名 `mcp__<server>__<tool>`；工具本身叫 `send_message`/`list_inbox`，snake_case，來自 `electron/mcp/send-message-server.ts` 的 `MCP_TOOL_NAMES`）。模型也在回覆中列出這兩個工具。未實際呼叫 send_message/list_inbox（依指示只驗證工具出現與連線成功）。

**判定：✅**（ARS `--plugin-dir` 與 Hub 自製 `--mcp-config` 同時生效，无互相排斥）。

### 3. Hook 不衝突 — ✅（其中 ARS guard 為預期降級，非失敗）

指令（run2，加 `--permission-mode bypassPermissions` 讓 Write 真的執行，其餘同上）：
```
claude --model haiku --system-prompt-file ... --settings ... --mcp-config ... --plugin-dir "$ARS" \
  --permission-mode bypassPermissions --max-turns 6 --output-format json --verbose \
  --debug --debug-file $SC/run2-debug.log -p "用 Write 把 t7-ok 寫入 scratchpad/t7/write-test.txt"
```
實際寫出（worktree 內確認）：`scratchpad/t7/write-test.txt` 內容為 `t7-ok`（5 bytes）。`$SC/run2-debug.log:406-458` 對應：
```
"Hook PreToolUse:Write (PreToolUse) success:\n{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}"
...Writing to temp file: .../scratchpad/t7/write-test.txt.tmp....
...File .../scratchpad/t7/write-test.txt written atomically
```
實際執行到的 hook（由 `.claude/settings.json` 與 ARS `hooks/hooks.json` 合併觸發）：
- SessionStart：Hub `session-start-context.js`（`run1-debug.log:214`，回 3104 字 additionalContext，成功）+ ARS `announce-ars-loaded.sh`（`run1-debug.log:256`，回 5970 字 additionalContext，成功）
- PreToolUse（Bash，出現在寫檔前的 Bash 工具呼叫）：Hub `forbidden-commands.js` + `g5-pre-deploy.js` + `protect-verify-clone.js`（matcher `Bash`）與 ARS `run_guard.sh`（matcher `Write|Edit|MultiEdit|Bash`）合併為一次 `Hook PreToolUse:Bash success`，pass-through，無 error
- PreToolUse（Write）：Hub `protect-verify-clone.js`（matcher `Edit|Write`）與 ARS `run_guard.sh` 合併為一次 `Hook PreToolUse:Write success`，pass-through，無 error
- **ARS guard 降級為 no-op**：`hooks/run_guard.sh` 的 `find_real_python()` 依序嘗試 `py -3`/`python3`/`python`；本次執行環境 PATH 不含任何 python（`command -v python/python3/py` 全部失敗），故 guard 依其設計（`run_guard.sh:192-193`）走 `emit_passthrough_and_exit`，靜默輸出 `{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}` 並 exit 0——這是 ARS 文件記載的「Plan A 優雅降級」，不是錯誤。`run2-stderr.log` 全空，無任何 python/guard 相關訊息，符合 launcher 註解「degraded path 對 stderr 靜默」的設計。
  - ⚠️ 未驗證：真實老闆使用環境（非本驗收沙箱）PATH 是否含可用 python（CLAUDE.md 記載 `C:\Users\Bandai\anaconda3\python.exe` 存在，但未驗證是否在一般啟動 Hub 時的 PATH 上），因此無法斷言正式環境下 ARS guard 是否會實際跑到（vs. 本測試中的降級）。

**判定：✅**（無 hook 衝突、無 error/block；ARS guard no-op 為預期降級，已如實記錄，非本驗收判定的失敗項）。

### 4. resume — ✅（含一項意外發現）

Session 1（= run1）`session_id` 取自 `system.init`：`bc80a0bf-4cfd-4486-8fd9-cf4f68dac817`。

- run3：`--resume bc80a0bf... --plugin-dir "$ARS" --model haiku ...`
  `$SC/run3-debug.log:111,118`：再次出現 `Loaded 16 commands` / `Loaded 4 skills from plugin academic-research-skills default directory`。模型回 `YES_ARS`。
- run4：`--resume bc80a0bf... --model haiku ...`（**不加** `--plugin-dir`）
  `$SC/run4-debug.log`：`grep -c academic-research-skills` = **0**（完全沒有 ARS 載入紀錄）。`system.init.slash_commands` 由 143 降到 **123** 個，且 `filter(c=>c.includes('ars'))` 為 **空陣列**——硬證據確認 ARS 未載入。

  ⚠️ **模型口頭回答不可信**：run4 模型仍答 `YES_ARS`（很可能是延續同一 conversation 的歷史上下文誤答，而非真的檢查目前工具清單）。本項判定**改以 `system.init` 的 `slash_commands`/debug log 為準**，不採信模型文字回覆——這點請技術負責人注意，未來若要用「問模型」的方式驗證 ARS 是否載入，不可靠。

  **意外發現（非本項五選一，但與 resume 相關，供參考）**：run3/run4 的 `system.init.mcp_servers` 都不含 `send-message`（只有 claude.ai 內建的 4 個），即使 run3 帶了 `--plugin-dir`。這與 `session-spawn-helpers.ts` 註解「Only for normal (non-resume) spawns — resume sessions inherit the original session's MCP config automatically」的假設不符——本次 claude CLI 2.1.283 的 `--resume` 實測**沒有**自動帶回原 session 的 `--mcp-config`。**未驗證**：這是否為 Hub 已知/接受的行為（例如 resume 本來就不需要 send-message），還是程式碼註解與實測不一致的落差，建議技術負責人核實。

**判定：✅**（--plugin-dir 在 resume 時必須由 Hub 補上，硬證據確認；同時發現一個值得追蹤的旁支問題，已如實標註未驗證）。

### 5. 錯誤呈現 — ✅（原判 ⚠️，已修正）

> **更新（2026-09-28）**：本項原判 ⚠️——錯誤在 `SessionLauncher.vue` 被吞成 `console.error`。已於 commit 0a55011、f130d0f 修正：新增 `src/utils/spawn-error.ts`（`notifySpawnError`），SessionLauncher、SessionsView 的 Resume、HarnessView、KnowledgeView 失敗時以 toast 顯示，`ARS_*` 錯誤附 i18n 標題與修法；由 G2 第三、四輪 Review 驗證（`docs/reviews/sprint7-g2-review.md`）。仍有限制：MessageBroker 自動啟動失敗只記 log（backlog S7-MN1）；GUI 實際畫面未截圖。以下為原始追蹤紀錄。

**靜態追蹤（`ARS_*` Error 從 `buildClaudeArgs` throw 開始）**：

1. `electron/services/session-spawn-helpers.ts:49,54-57,60` — `resolveArsPluginDir` 對三種情況 `throw new Error('ARS_PATH_NOT_SET: ...')` / `'ARS_INSTALL_INCOMPLETE: ...'` / `'ARS_REQUIRES_INTERACTIVE: ...'`
2. `electron/services/session-manager.ts:235` — `spawn()` 同步呼叫 `buildClaudeArgs(...)`，無 try/catch 包裹，例外直接從 `spawn()` 往外拋
3. `electron/ipc/sessions.ts:11-18` — `ipcMain.handle(IpcChannels.SESSION_SPAWN, ...)` 用 `try { return sessionManager.spawn(params) } catch (err) { logger.error(...); throw err; }`——`logger.error` 落地到 log 檔，然後**照樣 rethrow**。Electron 的 `ipcMain.handle` 對 handler 拋出的 Error 會把 `err.message` 序列化，讓 renderer 端 `ipcRenderer.invoke` 回傳的 Promise reject。
4. `electron/preload.ts:324` — `spawn: (params) => ipcRenderer.invoke('session:spawn', params)`，純轉發，不吞例外
5. `src/composables/useIpc.ts:22` — `spawnSession()` 回 `return maestro.sessions.spawn(params)`，純轉發
6. `src/stores/sessions.ts:209-250` — store 的 `spawn()` 用 `try { const result = await ipc.spawnSession(params); ... } finally { loading.value = false; }`——**沒有 catch**，例外會繼續往上拋給呼叫者（`finally` 只重置 loading 狀態）
7. **實際呼叫點 `src/components/session/SessionLauncher.vue:214-235`**（academic-publication 部門的 session 就是從這裡的 UI 手動啟動的）：
   ```
   } catch (err) {
     console.error('Failed to launch session', err);
   } finally {
     launching.value = false;
   }
   ```
   **這裡把例外吞掉，只做 `console.error`，沒有任何 toast/alert/錯誤訊息狀態變數把 `err.message` 顯示到畫面上**。搜尋同一元件與 `src/composables/`、`HarnessView.vue`、`KnowledgeView.vue` 均無 `useToast`/`showError`/`errorMessage` 之類機制（`grep -rn "useToast|toast\.|showError|errorMessage"` 無結果）。`HarnessView.vue:93-94`、`KnowledgeView.vue:161-162` 也是同一模式（但那兩處啟動的是 harness-manager / company-manager，不會走到 ARS_* 錯誤）。

**結論：`ARS_*` 錯誤訊息會被完整拋到 renderer，但在 `SessionLauncher.vue` 的 catch block 被吞掉，只留在 DevTools console（`console.error`），使用者（老闆）在正常 GUI 操作下看不到任何錯誤提示。**

**`validateArsPluginDir` 直接測試**（因專案無 tsx/ts-node，改用專案既有 `node_modules/.bin/esbuild` 把 `electron/utils/ars-validator.ts` 編譯到 `$SC/ars-validator.compiled.js`，再用小腳本 `require` 呼叫）：
```
node $SC/run-validator.js $SC/ars-validator.compiled.js "$ARS"
→ {"ok":true,"missing":[]}

# 臨時複本，模擬 PM-015 zip 下載符號連結退化：skills/academic-pipeline 是純文字 stub 檔（非資料夾）
node $SC/run-validator.js $SC/ars-validator.compiled.js $SC/ars-stub-copy
→ {"ok":false,"missing":["skills/academic-pipeline/SKILL.md"]}
```
（此測試是對 working tree 目前版本的 `ars-validator.ts`——已改成 `statSync(...).isFile()`——結果仍與規格描述一致）

**GUI 實際畫面：未驗證**（未截圖/未實際點擊 Hub GUI；本項純靠原始碼追蹤 + 前述 5 個檔案:行號鏈證明「呈現在哪一段被吞掉」）。

**判定：⚠️**（不是 ❌，因為錯誤確實有結構化訊息且沒有在中途被靜默改寫成別的東西；也不是 ✅，因為最終使用者在 GUI 上完全看不到任何提示——這是一個真實的可用性缺口，建議報給技術負責人：至少應在 `SessionLauncher.vue` 的 catch block 把 `err.message` 呈現給老闆）。

---

## 完整指令與輸出檔案索引

全部位於 `$SC = C:/Users/Bandai/AppData/Local/Temp/claude/C--Users-Bandai-Desktop-ALL-PROJECT--agenthub-worktrees-Agent-hub-3586a1dd/b1804c82-a30c-469f-ba85-24296542514f/scratchpad/t7/`：

| 檔案 | 內容 |
|---|---|
| `system-prompt.md`, `settings.json`, `mcp-agent-config.json`, `mcp-servers.json` | 手動重建的 Hub 暫存設定檔 |
| `run1-stdout.json` / `run1-debug.log` / `run1-stderr.log` | 第1、2項：正常 spawn + plugin-dir + mcp-config |
| `run2-stdout.json` / `run2-debug.log` / `run2-stderr.log` | 第3項：加 `--permission-mode bypassPermissions` 做 Write + hook 驗證 |
| `run3-debug.log` / `run3-stdout.json` | 第4項：`--resume` + `--plugin-dir`（ARS 再次載入） |
| `run4-debug.log` / `run4-stdout.json` | 第4項：`--resume` 不帶 `--plugin-dir`（ARS 未載入，硬證據） |
| `session_id.txt` | run1 的 `session_id`，供 resume 使用 |
| `ars-validator.compiled.js`, `run-validator.js`, `ars-stub-copy/` | 第5項：`validateArsPluginDir` 直測（esbuild 編譯 + 退化複本） |
| （worktree 內）`scratchpad/t7/write-test.txt` | 第3項 Write 實際落地的檔案（untracked，未清理，見「環境校準」第3點） |

---

## 未驗證清單（不得混入結論）

1. 老闆真實操作環境（非本驗收沙箱）的系統 PATH 是否含可用 python——影響第3項 ARS guard 是否會在正式環境走到真正的 guard 邏輯（本測試中是降級 no-op）。
2. Hub GUI 實際畫面在 ARS_* 錯誤發生時的樣子（未截圖、未點擊 GUI）；本報告第5項純為原始碼靜態追蹤 + IPC 行為推論。
3. `--resume` 是否本該自動帶回原 session 的 `--mcp-config`（`session-spawn-helpers.ts` 註解 vs. 本次 claude CLI 2.1.283 實測不一致的落差）——未核實這是已知限制還是文件/程式碼落差。
4. `5219afa` 這次並行 commit 除了本報告核對過的兩個檔案之外的其餘變更範圍（`.knowledge/specs/api-design.md`、測試檔等）是否也需要一併納入 T7 驗收——本次只核對了與五項驗收路徑直接相關的兩個原始碼檔案，未逐行審查該 commit 全部內容。
5. ARS guard 在有真實 python 環境下的實際攔截行為（本次全程降級，未觀察到 guard 真正執行）。
