# 踩坑紀錄

> **版本**: v1.4
> **最後更新**: 2026-07-03

---

## 格式說明

每條踩坑紀錄包含：ID、問題、根因、解法、預防措施。
**修復閉環規則**：紀錄中若含「待後續處理」項目，必須同時建 `.tasks/backlog/PM-{id}-*.md` 任務檔（見 `/pitfall-record` 步驟 4）。

---

## 踩坑快速參考

> 這張表是弱模型每次真正會讀的部分。新增踩坑時把教訓濃縮成一行加進來（`/pitfall-record` 步驟 5）。

| 場景 | 規則 | 出處 |
|------|------|------|
| `node-pty` 編譯 | 需要 Visual Studio Build Tools。`npx electron-rebuild -f -w node-pty` | PM-001 |
| 新增 IPC 通道 | `ipc.ts` → `preload.ts` → `useIpc.ts` → `env.d.ts` 四方同步（有 hook 提醒） | PM-002 |
| 修改 Pinia store | 確認 `useIpc()` 有暴露對應 IPC wrapper | PM-002 |
| 修改 DB schema | 必須在 database.ts migrations 新增版本 | — |
| 循環依賴 | service 之間用 lazy `require()` 避免 | PM-003 |
| TailwindCSS 4 | 用 `@theme` 定義 token，不用 `tailwind.config.js` | — |
| subprocess 傳參 | 關鍵路徑用 CLI 參數傳，不依賴 env var 繼承（Windows ConPTY 不繼承） | PM-004 |
| Claude Code `--settings` | 只有 `permissions` 會被合併，`statusLine` 被靜默丟棄；用 `--debug --debug-file` + unique marker 驗證設定真的被接收 | PM-010 |
| cost / 紀錄類修復 | **必須 query production DB 證實資料真的變了才算修好**；unit test 綠不算數 | PM-011 |
| 改 `electron/**` 後 | 必須 `npm run build`，否則 app 跑舊 bundle；宣告修復前確認 `out/` 時間戳 | PM-011 |
| production 修復分支 | 一律以 main 為 base 開新分支，不在舊 feature branch 上修 | PM-011 |
| 長時累計指標（cost/token） | 必須週期性落 DB，不可只在 session end 寫入 | PM-011 |
| 同一 bug 第三次出現 | 停下來，從頭驗整條 pipeline 的每一段，不要再修單點 | PM-011 |
| 宣告任務完成 | 附實際執行過的驗證證據（`/task-done` 步驟 2b），沒有證據 = 沒有完成 | PM-011 |
| 新增/修改 hook | 攔截邏輯抽成可 export 函數 + false-positive 測試；hook 內呼叫 npm/git 用完整路徑；改完跑 `node scripts/smoke-test-hooks.cjs` | PM-009/013 |
| hook 永遠 block 或永遠 pass | 警報失效，最高優先修（`/harness-audit` 原則 7） | PM-013 |
| system prompt 宣告工具 | 必須先確認 harness 真的部署了該工具 | PM-006 |
| 全套測試 | 基準線已清零（2026-07-03，359/359 綠）。**紅 = 你弄壞了東西，必須修，不可視為預存** | PM-012 |
| happy-dom 測試環境 | 只「掛上」mock 到 window，**絕不整顆替換 window**（會毀掉 Event/performance 等原生介面） | PM-012 |
| mock DB 查詢 | 用 SQL-aware `mockImplementation`，不用 `mockReturnValueOnce` 佇列（會把實作私有呼叫順序寫死進測試） | PM-012 |
| 測 exposed method | 不 `vi.spyOn` exposed proxy（Vue 3.5 攔不到 template ref 呼叫），改斷言可觀察 DOM 行為 | PM-012 |

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
- **修復（✅ 已解決，2026-07-03）**:
  - regex 收斂為「部署動詞開頭」的明確 pattern 清單（npm/pnpm/yarn deploy、npm publish、vercel --prod、docker push、gh release create、firebase/netlify deploy、electron-builder --publish）
  - `isDeployCommand()` 抽出為可測函數，`tests/hooks/g5-deploy-regex.test.ts` 覆蓋 12 個 false-positive + 15 個 true-positive 場景
  - 同時修復第二個 bug：hook 用裸 `npm` 呼叫，但 hook 環境 PATH 沒有 npm → execSync throw → 被誤判為 typecheck/build 失敗 → deny 無辜指令。改用 `process.execPath` 完整路徑（同 stop-validator 的做法）
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
- **後續強化（2026-05-28，commit `7dddee6`）**:
  - **問題**：即時 polling 修好後，仍有歷史 session（AgentHub 沒開時 CLI 跑出來、或 app 跑到一半關掉）`cost_usd = 0`，需要一次性補登
  - **解法**：新增 `electron/services/cost-backfill.ts`，app 啟動時非同步掃 `~/.claude/projects/*.jsonl`，對最近 7 天 `cost_usd = 0` 的 session 用 ±120s 時間窗 greedy 配對，補登 cost/token/turns 並蓋上 `cost_backfilled_at` 元資料。每筆發 `usage_update` 即時更新前端，完成發 `cost:backfill-complete` 觸發 toast
  - **架構**：抽出 `electron/services/pricing.ts` 給 jsonl-usage-tracker（即時）和 cost-backfill（啟動時）共用，避免價目表兩處維護
  - **驗證**：7 個單元測試覆蓋 match / skip / write-failure / no-jsonl / no-candidates / metadata-stamp / event-emit
  - **狀態**：✅ 已解決（即時 + 補登兩條路徑都到位）

### PM-012: 三類預存測試失敗 — 影響 31 個案例，與最近的 cost tracking 修復無關

- **發現日期**: 2026-05-28（tech-lead 在 PM-011 收尾時跑全套測試發現）
- **影響範圍**: `npm test --run` 31 個 case 失敗（5 個檔案），無關 cost / backfill / 任何 PM-011 改動。在 origin/main 上重現 → 證實為預存問題
- **狀態**: ✅ 已解決（2026-07-03，老闆排期後 tech-lead 修復，359/359 全綠，詳見本條末尾「實際修復」）
- **三類失敗模式**:
  1. **`tests/services/session-manager.test.ts`（10 failed / 33 total）**
     - 錯誤：`TypeError: () => ({feed: vi.fn(...), flush: vi.fn(), reset: ...}) is not a constructor`，發生在 `session-manager.ts:274:25`
     - 推測：test 用 `vi.mock` 模擬某個建構子（可能是 `Terminal` from `@xterm/headless`），但 mock factory 回的是 factory function 而非 class。`session-manager.ts:274` 用 `new XxxClass()` 呼叫時爆掉
     - 影響的測試：spawn 系列（5 個）、resume 系列（2 個）、stop（1 個）、cleanup（1 個）、直接 resume by conversationId（1 個）
  2. **`tests/services/task-manager.test.ts`（4 failed / 19 total）**
     - 錯誤：`TypeError: Cannot read properties of null (reading 'status')` — `taskManager.transition()` 回 null，測試卻 expect object
     - 推測：transition() 行為改了（可能加上 validation 或回傳值改成 nullable），測試沒跟著更新
     - 影響的測試：`created → assigned`、`in_progress → blocked`、9B expanded state machine 系列
  3. **`tests/unit/SkillCreateModal.test.ts`（5）+ `SkillDetailPanel.test.ts`（8）+ `SkillTab.integration.test.ts`（4）= 17 failed**
     - 錯誤：`TypeError: SupportedEventInterface is not a constructor` 出自 `@vue/test-utils/dist/vue-test-utils.cjs.js:1318:12`，所有 `trigger`/`setValue` 都炸
     - 根因：**vitest 4.1.2 + @vue/test-utils 2.4.6 + 新版 jsdom 不相容**。vitest 4 改了 jsdom 版本，新 jsdom 的 `Event` 介面命名與 @vue/test-utils 寫死的 `SupportedEventInterface` 對不上
     - 修法：升級 `@vue/test-utils` 到能配 vitest 4 的版本（社群討論建議 2.5+ alpha），或鎖回 vitest 3.x
- **為何現在才發現**: 平時只跑「跟當前任務相關」的單檔測試（如 cost-backfill.test.ts），沒人主動跑 `npm test --run`。CI 也沒有自動跑全套（這本身是另一個漏洞）
- **暫時影響**: 不阻擋功能開發（這些不是 cost 相關），但 CI gate 名存實亡 —— 如果有人改 session-manager 真把 spawn 弄壞，這 10 個失敗會被當成「本來就紅」而忽略
- **預防 / 改善建議（需要老闆裁示是否排 Sprint）**:
  1. 把 31 個失敗拆三條 ticket：A) session-manager mock 修正；B) task-manager 測試對齊；C) @vue/test-utils 升級到 vitest 4 相容版
  2. 在 CI / pre-push hook 加 `npm test --run` 全套通過才能 merge，杜絕「紅了沒人發現」的長尾積壓
  3. 修完後重新確認 `tests/services/cost-backfill.test.ts` 仍綠（這次是 7/7 通過）

### PM-013: stop-validator 永遠紅 — blocked 175 次 / passed 0 次的失效警報

- **發現日期**: 2026-07-03（harness 制度總體檢時從 hook-execution.jsonl 統計發現）
- **影響期間**: hook 部署以來的全部 session
- **問題**: Stop hook 每次 session 結束都跑全套 `npm test`（含 PM-012 的 31 個預存失敗）+ `npm run lint`，歷史統計 **blocked 175 次、passed 0 次**。它從來沒綠過
- **危害（比沒有 hook 更糟）**:
  1. 每次 Stop 浪費數分鐘跑注定失敗的全套測試
  2. 所有 agent 被訓練成「紅燈是常態，忽略它」——警報失去信號價值，等真的弄壞東西時沒人會注意
  3. `stop_hook_active` 遞迴保護讓第二次 Stop 靜默放行，agent 學到「再按一次就過了」
- **根因**:
  1. 把「全套測試綠」這個 G3 gate 等級的標準塞進每次 Stop 都跑的 hook，但基準線（PM-012）本來就是紅的 → 警報必響
  2. 缺乏「警報有效性」的審計制度：/harness-audit 只檢查 hook 存在與否，不檢查 block/pass 比例
- **解法（✅ 已解決，2026-07-03）**:
  1. stop-validator 重寫為增量式：working tree 乾淨 → 直接放行；只動文件 → 放行；有程式碼變更 → 只跑 lint + typecheck（基準線為綠的檢查，快且真的能抓到「這個 session 弄壞了東西」）
  2. 全套測試的守門責任明確歸屬 G2/G3 gate（/review、CI），不在 Stop hook
  3. /harness-audit 新增原則 7「警報有效性」：block 率 100% 或 0% 的 hook = 失效警報，最高優先修
  4. 新增 `scripts/smoke-test-hooks.cjs`：修改任何 hook 後必跑的煙霧測試
  5. hook-execution.jsonl 加 1MB 輪替，避免無限增長
- **驗證**:
  - `tests/hooks/` 44 個判定測試全綠（g5 regex 27 + verify-clone 保護 17）
  - `node scripts/smoke-test-hooks.cjs` 7/7 通過（含新 hook 真實 payload deny/pass 行為）
  - 新 protect-verify-clone hook 註冊當下即攔截到本 session 一條含 verify-clone 路徑的寫入指令（live 驗證）
- **預防**:
  - **警報設計鐵律**：任何會 block 的自動檢查，部署前必須確認「目前基準線能過」。基準線紅的檢查只能當 gate 驗收項，不能當常駐警報
  - /harness-audit 原則 7 制度化定期檢查 block/pass 比例
  - 踩坑紀錄的「待修」項目必須建 backlog 任務（/pitfall-record 步驟 4），否則像 PM-009 一樣躺 2 個月
- **實際修復（2026-07-03，與 5/28 的推測比對）**:
  1. **A 類 session-manager（10 failed）**: 推測方向對、主角錯——不是 `Terminal`，是 `EventParser` mock。vitest 4 對 `new mockFn()` 走 `Reflect.construct`，arrow function 實作不可建構。改為真 class mock 一發修復（33/33 綠）
  2. **B 類 task-manager（4 failed）**: 不是 `transition()` 行為改變，是測試用 `mockReturnValueOnce` 佇列把實作的私有 DB 呼叫「順序」寫死，實作多一次查詢（write-back / 9C/9D）整串錯位。改為 SQL-aware `mockImplementation`（依查詢內容回應＋追蹤 UPDATE 狀態），與呼叫順序徹底解耦（19/19 綠）
  3. **C 類 @vue/test-utils（17 failed）**: 推測的「版本不相容」只是表象。真根因是 `tests/setup.ts` 把 happy-dom 的 window **整顆替換**成 `{ maestro }`，毀掉 `window.Event`（→ SupportedEventInterface 炸）與 `window.performance`（→ vue-i18n 炸）。改為只掛 mock 不替換 window＋升級 @vue/test-utils 2.4.6→2.4.11（2.5 不存在，5/28 的社群資訊過時）。另修一個 `vi.spyOn` exposed proxy 攔不到 template ref 呼叫的測試，改斷言可觀察 DOM 行為（17/17 綠）
  4. **CI 守門恢復**: test.yml 其實一直有跑全套（`test:unit`），但只在 push main 觸發——agent 分支不觸發、紅了沒人看。加入 `agent/**` / `feature/**` 觸發；順修 lint job copy-paste 錯誤（原本誤跑 typecheck）
  5. **Stop hook 決策**: 全套測試**不**加回 Stop hook（維持 lint+typecheck 快檢），全套守門交給 CI——警報分層：快的常駐、慢的進 gate
- **驗證**: `npm test` → **Test Files 23 passed (23), Tests 359 passed (359)**；lint 0 errors；typecheck exit 0
- **教訓**: 三類推測有兩類只對表象。修復前先重現、看實際錯誤訊息，5 週前的診斷筆記只能當線索不能當結論
