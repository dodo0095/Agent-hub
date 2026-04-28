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
