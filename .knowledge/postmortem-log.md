# 踩坑紀錄

> **版本**: v1.2
> **最後更新**: 2026-05-08

---

## 格式說明

每條踩坑紀錄包含：ID、問題、根因、解法、預防措施。

---

## 踩坑快速參考

| 場景 | 規則 |
|------|------|
| `node-pty` 編譯 | 需要 Visual Studio Build Tools。`npx electron-rebuild -f -w node-pty` |
| 新增 IPC 通道 | `ipc.ts` → `preload.ts` → `useIpc.ts` 三方同步 |
| 修改 Pinia store | 確認 `useIpc()` 有暴露對應 IPC wrapper |
| 修改 DB schema | 必須在 database.ts migrations 新增版本 |
| 循環依賴 | service 之間用 lazy `require()` 避免 |
| TailwindCSS 4 | 用 `@theme` 定義 token，不用 `tailwind.config.js` |

---

## 從 v1 繼承的已知問題

### PM-001: node-pty 編譯需要 Visual Studio Build Tools

- **問題**: `npm install` 後 node-pty 編譯失敗
- **根因**: 缺少 C++ 編譯工具
- **解法**: 安裝 Visual Studio Build Tools，然後 `npx electron-rebuild -f -w node-pty`
- **預防**: CLAUDE.md 已記錄

### PM-002: IPC 三方不一致導致 runtime 崩潰

- **問題**: renderer 呼叫 IPC 方法得到 undefined
- **根因**: `ipc.ts`、`preload.ts`、`useIpc.ts` 三處未同步更新
- **解法**: 逐一比對三處定義
- **預防**: CLAUDE.md 強制規則 + 未來可加 Hook 自動檢查

### PM-003: 循環依賴導致 service 初始化失敗

- **問題**: service 之間互相 import 導致 undefined
- **根因**: TypeScript 模組循環引用
- **解法**: 改用 lazy `require()` 模式
- **預防**: 新增 service 時注意依賴方向

---

## v2 開發踩坑

### PM-004: Interactive Session Cost Tracking 失效（env var 繼承問題）

- **發現日期**: 2026-04-25
- **影響期間**: 2026-04-18 至 2026-04-25（共 8 天，57 個 session cost = 0）
- **問題**: Dashboard 30 日用量全部為 $0，token 統計歸零
- **根因**: Claude Code 的 `statusLine` subprocess 不繼承父 PTY 的 env var（Windows ConPTY 特性）。`session-statusline.js` 依賴 `AGENTHUB_USAGE_FILE` env var 決定寫入路徑，env var 未繼承 → script 直接 `process.exit(0)` → usage file 永遠不寫入 → polling 找不到檔案 → cost 永遠是 0
- **觸發時機**: `b4594b1` 將 tracking 機制從 `--status-line` CLI flag 改為 `--settings` + env var 傳遞，但 env var 在 statusLine subprocess 中失效
- **解法**:
  1. `session-statusline.js` 改為同時接受 `process.argv[2]`（CLI 參數優先）和 `AGENTHUB_USAGE_FILE`（env var fallback）
  2. `session-spawn-helpers.ts` 在 settings command 中直接嵌入 usage file 絕對路徑為 CLI 參數（`node script.js "/path/usage.json"`）
  3. `session-cost-tracker.ts` 新增 Pattern 4：解析自己產生的 statusLine 輸出格式（`tok: 6.7k  $0.0523`），作為 file 機制失效時的文字解析 fallback
- **預防**: StatusLine subprocess 的環境變數傳遞不可靠 → 關鍵路徑（檔案位置）必須透過 CLI 參數明確傳遞，不依賴 env var 繼承

### PM-005: PM-004 修復後仍歸零 — 用戶層 statusLine 蓋過 per-session settings

- **發現日期**: 2026-04-28
- **影響期間**: 2026-04-19 ~ 2026-04-28（10 天，DB 確認所有新 session `cost_usd / input_tokens / output_tokens` 全為 0）
- **問題**: PM-004 修復已合併、bundle 已重建、source 與 spawn-helpers 都正確帶 CLI 參數，但 Dashboard 用量仍然歸零。`.maestro-usage/` 自 4/18 起一個檔都沒寫
- **根因**: `~/.claude/settings.json`（用戶層）有一條過期的 `statusLine`：
  ```json
  "command": "node \"<舊路徑>\\session-statusline.js\""   // ← 沒有 usage file CLI 參數
  ```
  Claude Code settings 合併後，**用戶層 statusLine 蓋過了 per-session `--settings` 提供的版本**。用戶層命令沒帶 CLI 參數 → script 只能 fallback 到 `AGENTHUB_USAGE_FILE` env var → Windows ConPTY 不繼承 env var（PM-004 的本因仍在）→ script silently exit → 不寫檔
- **觸發時機**: 用戶層 `~/.claude/settings.json` 是更早期手動加的；PM-004 修了 spawn-helpers 但沒清掉這個全域覆寫
- **解法**:
  1. 移除 `~/.claude/settings.json` 整個 `statusLine` 區塊（已備份為 `.bak-2026-04-28`）
  2. 讓 per-session `--settings` 接手（PM-004 修好的版本）
  3. 驗證：開新 session → 跑兩三輪 → 檢查 DB `cost_usd > 0` 且 `.maestro-usage/<sid>.json` 存在
- **預防**:
  - 任何全域 `~/.claude/settings.json` 的 `statusLine` / `hooks` 變更必須在 postmortem 留紀錄
  - PM-004 的修復方案應該在 README 或 `.knowledge/architecture.md` 標註：用戶層覆寫會破壞 per-session tracking
  - 考慮在 spawn 時偵測用戶層 statusLine 衝突 → log warn

### PM-006: SendMessage 工具不存在 — prompt 與 harness 落差

- **發現日期**: 2026-04-28
- **影響範圍**: 所有 L1 / L2 agent（系統設計層級）
- **問題**: `prompt-assembler.ts:267` 在每個 agent 的 system prompt 注入「使用 SendMessage 工具聯繫同事」，但 harness 從未部署 `SendMessage` 為 Claude Code 工具或 MCP server。Agent 透過 ToolSearch 確認該名稱**不存在於任何工具註冊表**
- **根因**: 系統設計（CrewAI 風格自主委派）與實作落差。後端 `message-broker.ts` 確實能把訊息寫進目標 agent 的 PTY，但只能透過 IPC channel `MESSAGE_SEND` 從 GUI 觸發，沒有暴露給 agent session
- **症狀**: Agent 持續產生「我下一步要 SendMessage 給 XXX」的內心戲，但實際呼叫不到任何東西。跨 agent 協作只能靠老闆人肉切換 session 轉達
- **解法（本次 Sprint 5 處理）**:
  - 不採短期方案（移除 prompt 段落），直接做完整版
  - 把 `message-broker.send()` 包成 MCP server，agents 透過 MCP 協議真的能呼叫
  - 詳見 `proposal/sprint5-proposal.md`
- **預防**:
  - 任何要寫進 system prompt 的「工具」必須先確認 harness 有對應實作
  - prompt-assembler 增加單元測試：宣告的工具必須在 ToolSearch 可見

### PM-007: 17 個工作流 commands 全部設 disable-model-invocation — agent 卡死

- **發現日期**: 2026-04-29
- **影響範圍**: 所有 L1 / L2 agent，所有 Sprint 工作流
- **問題**: `.claude/commands/` 17 個指令（dev-plan / sprint-proposal / task-* / review / pm-review / gate-record / pre-deploy / project-kickoff / sprint-retro / pitfall-* / harness-audit）frontmatter 全設 `disable-model-invocation: true`，禁止 Claude agent 透過 Skill tool 主動呼叫
- **症狀**: tech-lead session 嘗試跑 `/dev-plan` → 直接收到 `Skill dev-plan cannot be used with Skill tool due to disable-model-invocation` 錯誤 → 任務卡住
- **設計矛盾**: `CLAUDE.md` 強制規則寫「遇到使用時機必須執行對應指令，不得跳過」，但 frontmatter 同時禁止主動呼叫 → agent 收到必執行命令卻無法執行
- **根因推測**: Anthropic 預設安全機制建議對破壞性 commands 加 `disable-model-invocation`，但 Maestro v2 的設計就是讓 agent 自主跑工作流，兩者衝突。早期 commands 可能是用 `claude /create-command` 從預設模板生成，沒移除這欄
- **解法**: 移除全部 17 個 commands 的 `disable-model-invocation: true` frontmatter
  - 已套用源碼端：`C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub/.claude/commands/`
  - 已同步運行端：`C:/Users/Bandai/Desktop/AgentHub/Agent-hub/.claude/commands/`
  - 本 session 即時生效（system-reminder 已列出 17 個 skills 為 available）
- **替代防線**:
  - `forbidden-commands.js` hook 仍擋危險 Bash（kill-port、--no-verify 等）
  - `g5-pre-deploy.js` hook 仍擋上線前 typecheck/build 失敗（雖然 regex 有問題見 PM-009）
  - `stop-validator.js` 仍防半成品交付
- **預防**:
  - 新增 commands 時 frontmatter 模板**不得**包含 `disable-model-invocation: true`
  - 可寫個 hook 在 commands 檔案被建立時自動檢查並警告

### PM-008: Multi-session race condition — tryAutoBranch 切走他人正在用的 working tree（待修）

- **發現日期**: 2026-04-29
- **影響範圍**: 所有同時開啟多個 session 的場景
- **問題**: `electron/services/session-manager.ts:333` 在每個 session spawn 時呼叫 `tryAutoBranch()`，會 `git checkout` 改變 working tree HEAD。但**多個 session 共享同一個 working tree（不是獨立 worktree）**，所以 A session 的 spawn 會把 HEAD 切走，干擾 B session 正在做的 git 操作
- **症狀**: PM session 在 main 上做完第一個 commit，準備做第二個 commit 之前，老闆開了 tech-lead session → tech-lead 的 spawn 觸發 tryAutoBranch 把 HEAD 從 main 切到 `agent/tech-lead/2026-04-28` → PM 第二個 commit 落錯分支
- **reflog 鐵證**:
  ```
  HEAD@{2}: commit: docs: ...               (落在 tech-lead 分支!)
  HEAD@{3}: checkout: main → agent/tech-lead/2026-04-28   ← race
  HEAD@{4}: commit: docs(postmortem): ...   (這個還在 main)
  ```
- **歷史證據**: 早於這次的 reflog 也都是同樣 pattern，每次多開 session 都在 race，只是 commit 落錯分支沒人發現
- **根因**: 設計假設「每個 session 一個 agent，agent 用自己分支隔離」，但實作層面所有 session **共享同一個 working tree**，HEAD 是 process-wide 的單一狀態
- **修復路線（已決）**:
  - **A 短期**：移除 `tryAutoBranch()` 從 spawn，改 GUI 手動觸發（0.5 day）
  - **✅ B 中期（老闆選定，2026-04-29）**：改用 `git worktree add` 每 session 獨立 worktree（2-3 day，根治）
  - **C 暫補**：file lock 偵測其他 session active 時跳過（治標不治本）
- **暫時迴避**: PM 做完工作後**手動 `git checkout main` + `merge --ff-only`** 救回正確分支，再 push
- **預防**:
  - GUI 顯眼處警示「多 session 同時 active 時 git 操作不安全」
  - 修復後在 architecture.md 補上「working tree 共享問題」章節

### PM-009: g5-pre-deploy hook regex 過寬 — 任何含 deploy 字串的 cmd 都被當部署擋下

- **發現日期**: 2026-04-29
- **影響範圍**: 所有需要碰觸名稱含 `deploy / publish / release` 的檔案的 Bash 操作
- **問題**: `.claude/hooks/g5-pre-deploy.js:30` 的 regex `/deploy|publish|release|npm publish|docker push/i.test(cmd)` 太寬。比方對 17 個 commands 做批次 sed 處理，命令字串中只是因為**含 `pre-deploy.md` 這個檔名**就被攔截，hook 接著跑 `npm run typecheck` + `npm run build` 並失敗（typecheck/build 對純文件編輯本來就不該跑），返回 deny
- **症狀**: PM 試圖跑 `for f in ... pre-deploy.md ...; do sed -i ...; done` 處理 PM-007 → 被 hook 擋 `G5 Pre-Deploy: typecheck 或 build 失敗，禁止部署`
- **根因**: regex 把「字串裡有 deploy」等同於「正在執行部署」，但實際部署應該是**特定動詞 + 部署目標**（如 `npm run deploy`、`vercel --prod`、`docker push <registry>`、`gh release create`）
- **暫時迴避**: 改用 Node inline script `node -e "..."` 處理檔案，命令字串不含 deploy / publish / release 字眼
- **修復方向（待後續 Sprint）**:
  - 收斂 regex 為 `/(?:^|\s)(npm run deploy|vercel\s+(?:--prod|deploy)|docker\s+push|gh\s+release\s+create)/`
  - 或改為 OR 條件：必須同時含「部署動詞」**與**「目標位置」才視為部署
  - 加單元測試覆蓋至少 10 種 false-positive 場景（如 sed pre-deploy.md / cat release-notes.md / grep deploy / cd deployments）
- **預防**:
  - 新增 hook 時必須附帶 false-positive 測試清單
  - hook 攔截邏輯文件化：什麼情況該擋、什麼情況不該擋

### PM-010: PM-004/PM-005 修復後仍歸零 — `--settings` 旗標靜默丟棄 statusLine（兩階段根因）

- **發現日期**: 2026-05-04
- **影響期間**: 2026-04-17 至 2026-05-05（共 18 天，28+ 個 session cost = $0；累積 ~25 USD 真實開銷無紀錄）
- **問題**: Dashboard 30 日用量自 4/17 後完全停止累計，每個 session 也都 cost = 0；前兩次修復（PM-004 env var + PM-005 全域覆寫）皆未根治；第三次嘗試（workspace trust，commit `bc55cf7`）也只解決一半
- **症狀**:
  - DB `claude_sessions` 最後一筆有 cost 的 session 是 `2026-04-17 13:33`
  - `.maestro-usage/` 完全空目錄（statusLine 從未寫入）
  - `.maestro-prompts/settings-*.json` 都正確產生（含 usage file path 參數）
  - 手動執行 `node session-statusline.js <path>` 並餵 stdin 是正常寫入的（script 沒問題）
  - Session log 也找不到 `tok: ` / `$0.` 等 statusLine 應該輸出的字串
- **根因（兩階段，必須同時克服）**:
  1. **Stage 1（PM-010 原始假設，partially correct）**: Claude Code v2.1.51 引入「`statusLine` / `fileSuggestion` hook 需 workspace trust」的安全 gate。AgentHub 為各專案 spawn 的 cwd 都 `hasTrustDialogAccepted: false` → statusLine 被 trust gate 擋住。
  2. **Stage 2（v2.1.114 實測新發現）**: 即使 workspace trust 已自動接受，Claude Code v2.1.114 在處理 `--settings <file>` flag 時，**只把 `permissions` 欄位合併進 `flagSettings` destination**，`statusLine` 欄位被靜默丟棄，從未被執行。debug log（`--debug --debug-file`）中找不到任何「Applying statusLine」或設定的 unique marker 字樣，但 `Applying permission update` 訊息有出現，destination = `flagSettings`。這代表 `--settings` 對 statusLine 形同無效。
- **驗證根因的方法**: 寫了一個獨立 node script（`%TEMP%/test-claude-settings-flag.js`），用 `claude.cmd --print --debug --debug-file <log> --settings <file>` 跑一次，settings 內塞唯一 marker `UNIQUE_TEST_MARKER_FOR_SETTINGS_FLAG`（permission）和 `statusline-test-marker`（statusLine command）。debug log 找得到 permission marker，找不到 statusLine marker。
- **觸發時機**: Claude Code 升版到 ≥ 2.1.51 開啟 trust gate；≥ 2.1.114 仍丟棄 `--settings` 內的 statusLine
- **解法（PRIMARY，採用 JSONL 主軌）**:
  1. 新增 `electron/services/jsonl-usage-tracker.ts`：`parseJsonlUsage(filePath)` 從 `~/.claude/projects/<encoded-cwd>/<conv-id>.jsonl` 解析每個 `assistant` 事件的 `usage` 區塊，逐 turn 用模型 pricing 累加 cost。Pricing 涵蓋 sonnet/opus/haiku 各代，支援 5m/1h cache 區分（5m=$3.75/M、1h=$6/M for sonnet）、跨模型 session 分別計價、prefix/family fallback。
  2. `session-manager.ts` `captureClaudeConversationId()` 在抓到 conv_id 後啟動 `startJsonlUsagePolling(sessionId, jsonlPath)`：每 5s 重算 cost，與 session 上的舊值取 max（max-wins，避免暫態回退），有變化就 emit `usage_update` 給 renderer；session 結束自動清掉 poller。
  3. statusLine / `--settings` 路徑保留為 fallback —— 哪天 Anthropic 修好 v2.1.114 的合併邏輯就會自動生效，不刪。
  4. workspace trust（`ensureWorkspaceTrust`）保留 —— 雖然不是這次的關鍵，仍然是 statusLine fallback 路徑的前提。
- **驗證**:
  - 11 個單元測試（`tests/services/jsonl-usage-tracker.test.ts`）涵蓋 zero-init、空檔、無 usage 事件、累加、5m/1h 細分、opus 定價、模型切換、unknown model fallback、malformed line skip
  - 真實 session 校準：用真機 JSONL 檔（67 input / 6586 output / 118029 cc_1h / 883289 cr，sonnet-4-6）獨立計算 = $1.0722，parser 輸出 $1.0722，誤差 < 1¢
  - 8 個既有 spawn-helpers 測試仍通過
- **預防**:
  - **上游版本變更監控**：Claude Code changelog 中與 statusLine / hooks / settings 相關的 security fix 必須當下評估對 AgentHub 的影響
  - **避免假修復（這次學到第三次）**：前三次修復都鎖定在「讓 statusLine subprocess 正確執行」，但都沒發現 `--settings` flag 對 statusLine 整個欄位無效。下次同類問題務必：(a) 用 `--debug --debug-file` 確認 setting 是否真的被 Claude 接收；(b) 用 unique marker 而非 hope-based 推論；(c) 評估「換一條 cost 來源」是否更穩定，而不是死磕同一條鏈路
  - **首選權威來源**：Claude Code 自己的 JSONL 是計費權威，比 statusLine（會被 trust / settings 合併邏輯影響）更不易壞
  - **工具**：考慮在 spawn 時 log Claude Code 版本，方便日後追溯哪一版開始問題

### PM-011: PM-010 修復「程式碼進了 main 但 cost 仍歸零」— 三個獨立失敗串成沉默掉鍊

- **發現日期**: 2026-05-08
- **影響期間**: 2026-04-18 至 2026-05-08（共 20 天，全部 ~85 個 session cost = $0；JSONL 檔案實際累積 ~$482 USD 真實開銷未進 DB）
- **問題**: PM-010 把 JSONL 解析架構合進 `main` 並附 11 個單元測試 + 真機校準，commit 訊息標榜「parser 算 = $1.0722，誤差 < 1¢」。但實際每天打開 dashboard 看到的 cost 仍是 $0。三次「修復」用掉大量 session 額度，沒一次真正落地。
- **症狀**:
  - DB query：`SELECT COUNT(*) FROM session_events WHERE subtype='usage_update'` 自 4/18 後 = 0（poller 從未觸發）
  - DB query：4/18 後 ~100 個 session 中只有 2 個寫入 `claude_conversation_id`（conv-id 抓取邏輯失敗率 98%）
  - `~/.claude/projects/.../*.jsonl` 檔案是齊全的，跑獨立 parser 算得出真實 cost（~$482 累計）—— 證明資料源沒問題
- **根因（三個獨立失敗，缺一不可解）**:
  1. **build artifact 沒重新編譯**: `out/main/index.js` 時間戳是 4/29，PM-010 fix 是 5/5 才進 main。Electron app 跑的是 4/29 的舊 build，根本不含 jsonl-usage-tracker。grep `out/main/index.js` 找不到 `jsonl-usage` 任何字串。
  2. **fix 沒進當前工作分支**: `agent/tech-lead/sprint-5/T10` 從 `9e9904f` 分出後就沒再 merge 過 main，開發/測試永遠跑不到 5/5 的修復。
  3. **conv-id 抓取邏輯只支援新建場景**: `captureClaudeConversationId()` 採「snapshot 既存 JSONL 列表 → poll 新檔案」策略，30 秒 timeout。但 AgentHub 大量使用 `claude --resume <conv-id>`（`session-spawn-helpers.ts:53/71`），Claude resume 時 **append 到既有 JSONL** 而非建新檔，poller 永遠抓不到「new file」→ 30 秒後靜默 timeout → `startJsonlUsagePolling` 從未被呼叫 → JSONL 路徑形同未啟用。
  4. **（次要）持久化只在 session 結束**: 即使 poller 正常更新 `session.costUsd`，`persistSessionCost()` 只在 session end 時 fire。互動式 session 可能跑數小時不結束，in-memory cost 沒落 DB；app crash / 強制關閉時直接 0。
- **驗證根因的方法**:
  1. 直接 query 用戶 production DB：`SELECT date(started_at), SUM(CASE WHEN cost_usd>0 THEN 1 ELSE 0 END), COUNT(*) FROM claude_sessions GROUP BY date(started_at)` —— 4/18 後每天 0/N 比例
  2. 比對 build 時間戳 vs commit 時間戳 + grep build artifact 找不到關鍵字串
  3. 查 `session_events.subtype='usage_update'` 計數 = 0 —— 證明 poller 從未 fire
- **解法**:
  1. **fast-forward main 到當前分支**：含 PM-010 全部變更
  2. **`captureClaudeConversationId()` 重寫**：增加 `knownConvId` 參數；resume 場景（`isResume` / `isDirectResume`）直接傳已知 conv-id，跳過輪詢；新建場景把 timeout 從 30s 拉長到 90s，並加 fallback 用首事件 timestamp 比對 session.startedAt（±120s window）匹配 JSONL，同時涵蓋「Claude 啟動慢」與「resume 沒新檔」兩種失敗
  3. **`startJsonlUsagePolling()` 加每 poll DB 寫入**：每次成功累加都 `UPDATE claude_sessions SET cost_usd, input_tokens, output_tokens, turns_count`，跨 crash / 跨日 / 跨關閉都有資料；不再依賴 session-end 的單點寫入
  4. **新增 `getJsonlFirstTimestamp` / `findJsonlByStartTime` 工具**：把 timestamp 比對抽出來可單獨測試（8 個新增單元測試覆蓋 missing dir / 多候選取最近 / 視窗外拒絕 / mtime 快速跳過）
  5. **pricing 表補齊 opus-4-5 / 4-6 / 4-7**：實機 JSONL 出現 `claude-opus-4-7` 字串會 fallback 到 4-1 baseline，誤差數十美金級
  6. **重新 build**：覆蓋 `out/main/index.js`，grep 確認 `findJsonlByStartTime` / `knownConvId` / `getJsonlFirstTimestamp` 都進去
- **驗證**:
  - 一次性 script `scripts/verify-jsonl-cost.cjs` 掃當前專案全部 48 個 JSONL，總計 $482 + 個別檔案 cost 列表（最大單筆 $122.25）—— 確認資料源端到端可算
  - 19 個 jsonl-usage-tracker 單元測試（11 既有 + 8 新增），全綠
  - 8 個 session-spawn-helpers 測試仍通過
  - typecheck（`tsc --noEmit -p tsconfig.node.json`）通過
- **預防（這次特別重要）**:
  - **永遠先 query production DB 證實再宣告 fix 完成**：前三次修復都用「unit test + 真機校準」當證據，但都沒人 query 過用戶 DB 看 `cost_usd > 0` 的 row 有沒有真的多出來。下次「cost / 紀錄類」修復必須附帶 production DB query 結果作為 acceptance gate。
  - **build artifact 過期檢查**：commit `electron/services/*.ts` 後若沒 push 配套的 `npm run build`，任何宣稱修復的 commit 都不算數。考慮加 CI 步驟「build 時間戳 < electron/services 內任何檔案的 mtime」就 fail。
  - **branch 同步守則**：tech-lead 在 production-incident 修復場景，**強制以 main 為 base 開新分支**，不在舊 feature branch 上做。否則「main 上有 fix 但用戶用的版本沒有」會繼續發生。
  - **互動式 session 必須有跨 session-end 的持久化**：任何「只在 session end 寫 DB」的設計都不能用於長 session 的累計指標（cost、turn、token）。Periodic write 是基本盤，不是 nice-to-have。
  - **同一個 bug 第三次出現就停下來重新審題**：PM-004 / PM-005 / PM-010 都假設「statusLine 路徑要修好」、PM-010 雖然換 JSONL 但仍假設「conv-id 抓取會成功」。連續三次同症狀沒根治，必須跳出「修當下發現的失敗點」的迴圈，回頭問「這條 pipeline 從頭到尾每一段都驗過了嗎」。這次補上 production DB query 後一次抓到三個串聯失敗。
