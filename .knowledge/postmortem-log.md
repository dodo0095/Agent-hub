# 踩坑紀錄

> **版本**: v1.0
> **最後更新**: 2026-03-24

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

### PM-010: PM-004/PM-005 修復後仍歸零 — Claude Code v2.1.51 安全機制擋住 statusLine

- **發現日期**: 2026-05-04
- **影響期間**: 2026-04-17 至 2026-05-04（共 17 天，28 個 session cost = $0；累積 ~25 USD 真實開銷無紀錄）
- **問題**: Dashboard 30 日用量自 4/17 後完全停止累計，每個 session 也都 cost = 0；前兩次修復（PM-004 env var + PM-005 全域覆寫）皆未根治
- **症狀**:
  - DB `claude_sessions` 最後一筆有 cost 的 session 是 `2026-04-17 13:33`
  - `.maestro-usage/` 完全空目錄（statusLine 從未寫入）
  - `.maestro-prompts/settings-*.json` 都正確產生（含 usage file path 參數）
  - 手動執行 `node session-statusline.js <path>` 並餵 stdin 是正常寫入的（script 沒問題）
  - Session log 也找不到 `tok: ` / `$0.` 等 statusLine 應該輸出的字串
- **根因**: Claude Code v2.1.51 引入安全修復——「`statusLine` and `fileSuggestion` hook commands could execute without workspace trust acceptance in interactive mode」。互動模式下，cwd 在 `~/.claude.json` 中 `hasTrustDialogAccepted` 不為 true 時，statusLine command **完全不執行**（連 subprocess 都不 spawn）。AgentHub 為各專案 spawn 的 cwd（如 `Agent-hub`、`StarkLab` 等）都 `hasTrustDialogAccepted: false` → statusLine silent skip → usage file 永不寫入 → cost 永遠 = 0。v2.1.80 雖然修了「statusLine 顯示 nothing」UI bug，但底層命令仍受 trust 控制
- **觸發時機**: Claude Code 升版到 ≥ 2.1.51（user 約在 4/17 升級）
- **解法**:
  1. `electron/services/session-spawn-helpers.ts` 新增 `ensureWorkspaceTrust(cwd)` 函式：在 spawn 前讀寫 `~/.claude.json`，把目標 cwd 標為 `hasTrustDialogAccepted: true`
  2. `session-manager.ts` 在 `resolveSpawnCwd()` 之後立刻呼叫
  3. Idempotent：已 trust 則 no-op；non-blocking：寫入失敗只 warn log
  4. 路徑規範化：Windows `\\` → `/`（Claude Code 內部 key 格式）
- **驗證**:
  - 8 個單元測試（`tests/services/session-spawn-helpers.test.ts`）涵蓋首次 trust、idempotent、空 projects 欄位、malformed JSON、寫入失敗、路徑規範化
  - 真機 spawn 一個 session → 確認 `.maestro-usage/<sid>.json` 有寫入 → DB `cost_usd > 0`
- **預防**:
  - **上游版本變更監控**：Claude Code changelog 中與 statusLine / hooks / settings 相關的 security fix 必須當下評估對 AgentHub 的影響
  - **避免假修復**：PM-004 與 PM-005 都鎖定在 env var / 全域覆寫，沒有從「為什麼 statusLine subprocess 根本沒被 spawn」這個更上游的問題去查；下次調查 statusLine 失效務必先驗證 subprocess 是否被執行（log strace / 手動跑 + 比對 PTY 輸出是否含 `tok: `）
  - **工具**：考慮在 spawn 時 log Claude Code 版本，方便日後追溯哪一版開始問題
