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
