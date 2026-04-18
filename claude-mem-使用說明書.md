# Claude-Mem 使用說明書

> **版本**：v12.2.0（已安裝）
> **安裝日期**：2026-04-18
> **安裝位置**：`C:\Users\Bandai\.claude\plugins\marketplaces\thedotmack\`
> **適用平台**：Windows 11 + Claude Code v2.1.114

---

## 目錄

1. [這是什麼 / 為什麼要裝](#1-這是什麼--為什麼要裝)
2. [快速開始（3 步啟用）](#2-快速開始3-步啟用)
3. [已安裝元件清單](#3-已安裝元件清單)
4. [核心概念](#4-核心概念)
5. [日常使用情境](#5-日常使用情境)
6. [MCP 搜尋工具：3 層 Workflow](#6-mcp-搜尋工具3-層-workflow)
7. [隱私控制](#7-隱私控制)
8. [設定檔完整參考](#8-設定檔完整參考)
9. [常用指令速查](#9-常用指令速查)
10. [常見問題 FAQ](#10-常見問題-faq)
11. [故障排除](#11-故障排除)
12. [進階：切換 Beta / 結合 AgentHub](#12-進階切換-beta--結合-agenthub)
13. [安全與授權注意事項](#13-安全與授權注意事項)

---

## 1. 這是什麼 / 為什麼要裝

### 一句話介紹

**Claude-Mem** 是一個 Claude Code 外掛，會把你每一次對話過的內容壓縮成「觀察（observations）」存到本地 SQLite 資料庫，並在你開新 session 時把相關片段注入回去 —— 讓 Claude 記得你之前做過什麼。

### 為什麼可以省 token

- ❌ **沒裝之前**：每次新 session，Claude 對你的專案歷史一無所知。你必須把背景再貼一次，或讓它重新讀一堆檔案。
- ✅ **裝了之後**：SessionStart hook 自動注入相關摘要（預設 50 筆觀察 + 最後一次 session summary），Claude 直接「接上記憶」，不用重新讀檔探索。
- 💡 **3 層搜尋**：當你問「上週那個 bug 怎麼修的」，Claude 用 `search` 取得精簡索引（~50–100 tokens/筆）→ 篩選後才 `get_observations` 拿完整內容（~500–1,000 tokens/筆）。**大約可省 10 倍 token**。

### 它不會做什麼

- ❌ 不會把你的對話傳到作者或任何第三方伺服器（全本地儲存）
- ❌ 不會自動呼叫 API，所有 AI 壓縮動作都用你**現有的** Claude CLI 登入狀態執行
- ❌ 不會記憶含 `<private>...</private>` 標籤的片段

---

## 2. 快速開始（3 步啟用）

### 步驟 1｜重新啟動 Claude Code

關掉現在這個 Claude Code 視窗，重開一個新的。外掛的生命週期 hooks 會在**新 session 第一次啟動時自動掛載**。

### 步驟 2｜驗證 worker 是否已跑起來

打開新 session 後，在終端執行：

```bash
curl http://localhost:37777/api/health
```

看到 `{"ok":true}` 代表成功。

### 步驟 3｜打開 Web 查看介面

瀏覽器開啟：**http://localhost:37777**

你會看到一個 React UI，顯示：
- 每個專案的觀察時間軸
- 每個 session 的摘要
- 搜尋框（可直接查過去紀錄）
- 設定頁（可切 stable/beta、改模型）

---

## 3. 已安裝元件清單

| 元件 | 路徑 | 說明 |
|------|------|------|
| 外掛本體 | `C:\Users\Bandai\.claude\plugins\marketplaces\thedotmack\` | 由 npm 下載的正式版 v12.2.0 |
| Claude Code 註冊 | `C:\Users\Bandai\.claude\settings.json` | `enabledPlugins: { "claude-mem@thedotmack": true }` |
| Claude-Mem 設定 | `C:\Users\Bandai\.claude-mem\settings.json` | 環境變數型設定檔（見第 8 節） |
| SQLite 資料庫 | `C:\Users\Bandai\.claude-mem\claude-mem.db` | 首次 session 結束時自動建立 |
| Chroma 向量庫 | `C:\Users\Bandai\.claude-mem\chroma\` | 語義搜尋用，首次使用時建立 |
| 日誌 | `C:\Users\Bandai\.claude-mem\logs\claude-mem-YYYY-MM-DD.log` | 每天一個檔 |
| Bun runtime | `C:\Users\Bandai\.bun\bin\bun.exe`（fallback）+ `%AppData%\npm\bun.cmd`（PATH） | Worker 執行所需 |
| 全域 Claude CLI | `%AppData%\npm\claude.cmd` | v2.1.114 |

### 生命週期 Hooks（5 個自動執行）

| Hook | 觸發時機 | 作用 |
|------|---------|------|
| `SessionStart` | Claude Code 開啟新 session | 啟動 worker、注入過往記憶 |
| `UserPromptSubmit` | 每次你送出訊息 | 記錄 prompt、必要時補充 context |
| `PostToolUse` | 每次 Claude 用 tool 後 | 建立觀察（observation） |
| `Stop` | Session 被停止 | 觸發摘要生成 |
| `SessionEnd` | Session 完全結束 | 壓縮、寫入 SQLite、同步 Chroma |

---

## 4. 核心概念

### 觀察（Observation）

每次 Claude 呼叫一個工具（Read / Edit / Bash 等），都會產生一筆觀察，長這樣：

```json
{
  "id": 1234,
  "session_id": "abc-123",
  "project": "AgentHub",
  "type": "bugfix",
  "summary": "修復 worker 啟動時 PATH 未傳遞導致 Bun not found",
  "narrative": "完整敘述…",
  "timestamp": "2026-04-18T15:57:00Z",
  "files_touched": ["src/hooks/session-start.ts"]
}
```

### Session Summary

Session 結束時，Claude Agent SDK 會把整段對話壓縮成一份摘要（含目標、完成項目、未解決問題），存進 DB 供下次 session 開頭注入。

### 漸進式揭露（Progressive Disclosure）

claude-mem 預設**只注入摘要 + 索引**，不把完整對話拉回來。要看細節時，Claude 才主動呼叫 MCP 工具把特定 ID 的觀察拉出來。這是省 token 的核心機制。

---

## 5. 日常使用情境

### 情境 A｜接續昨天的工作

**你**：「繼續昨天那個 API 整合的任務」

**背後發生**：SessionStart 已經把昨天的 session summary 注入了。Claude 直接接著做，不用你重述。

### 情境 B｜回溯上週某個決策

**你**：「上週我們為什麼選用 Fastify 而不是 Express？」

**Claude 自動**：
1. 呼叫 `search(query="Fastify Express 比較", limit=10)` → 拿索引
2. 找到觀察 #456
3. 呼叫 `get_observations(ids=[456])` → 拿完整理由

### 情境 C｜找某個 Bug 的修復過程

**你**：「之前那個 auth token 過期的 bug，怎麼修的？」

**Claude 自動**：呼叫 `search(query="auth token 過期", type="bugfix")` → 給你摘要 + 改過哪些檔案。

### 情境 D｜手動主動搜尋

在對話中直接輸入：

```
/mem-search 上週改過 feedback-synthesizer 的哪些檔案
```

`mem-search` 是 skill，會做 hybrid 搜尋（關鍵字 + 語義），回一份可直接引用的清單。

---

## 6. MCP 搜尋工具：3 層 Workflow

這是 claude-mem 最重要的機制，Claude 會自動按這個順序呼叫：

### 層 1｜`search` — 拿索引

```typescript
search({
  query: "authentication bug",
  type: "bugfix",       // 可選：bugfix / feature / refactor / note
  limit: 10,
  date_from: "2026-03-01"
})
// 回傳：[{id, summary, timestamp, project, ...}] ← ~50-100 tokens/筆
```

### 層 2｜`timeline` — 看上下文

```typescript
timeline({
  observation_id: 456,    // 圍繞這筆觀察
  before: 5,
  after: 5
})
// 回傳：前後 10 筆觀察的精簡索引
```

### 層 3｜`get_observations` — 拿完整內容

```typescript
get_observations({
  ids: [456, 789, 1023]   // 一次帶多個 ID，別逐筆呼叫
})
// 回傳：[{id, summary, narrative, files_touched, ...}] ← ~500-1,000 tokens/筆
```

### 為什麼這樣省 token？

| 做法 | 假設搜 10 筆結果 | 成本 |
|------|--------|------|
| ❌ 直接拉完整 | 10 × ~800 tokens | **~8,000 tokens** |
| ✅ 3 層 workflow | 10 × 80 + 3 × 800 | **~3,200 tokens**（省 60%） |

真實情境省更多，因為通常搜出 50 筆你只真的需要 3 筆。

---

## 7. 隱私控制

### 方法 1｜`<private>` 標籤（最精準）

對話中任何用這個標籤包起來的內容**不會**被存進記憶庫：

```
這是我的信用卡號 <private>1234-5678-9012-3456</private>，幫我檢查格式
```

處理時機：在 hook 層（邊緣處理）就剝除，根本送不到 worker 或 DB。

### 方法 2｜排除整個專案

編輯 `C:\Users\Bandai\.claude-mem\settings.json`：

```json
"CLAUDE_MEM_EXCLUDED_PROJECTS": "C:\\Users\\Bandai\\Desktop\\secret-project,C:\\Users\\Bandai\\Desktop\\client-work"
```

逗號分隔，支援絕對路徑。

### 方法 3｜跳過特定工具

預設已跳過 `ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion`。可以追加其他不想記錄的工具名稱。

### 方法 4｜完全關閉

在 `C:\Users\Bandai\.claude\settings.json` 把 `claude-mem@thedotmack` 改為 `false`：

```json
"enabledPlugins": {
  "claude-mem@thedotmack": false
}
```

重啟 Claude Code 即生效，但**保留資料庫**（下次開啟還在）。

---

## 8. 設定檔完整參考

位置：`C:\Users\Bandai\.claude-mem\settings.json`

### 核心設定（最常改）

| Key | 預設 | 說明 |
|-----|------|------|
| `CLAUDE_MEM_MODEL` | `claude-sonnet-4-6` | 壓縮觀察用的模型 |
| `CLAUDE_MEM_PROVIDER` | `claude` | `claude` / `gemini` / `openrouter` |
| `CLAUDE_MEM_CLAUDE_AUTH_METHOD` | `cli` | 沿用 `claude` CLI 登入（不用 API Key） |
| `CLAUDE_MEM_MODE` | `code` | 觀察記錄語言：`code` / `code--zh`（簡中） / `code--ja`（日文） |
| `CLAUDE_MEM_WORKER_PORT` | `37777` | Worker HTTP 服務 port |
| `CLAUDE_MEM_LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARN` / `ERROR` |

### 注入策略（影響 session 開頭 token）

| Key | 預設 | 說明 |
|-----|------|------|
| `CLAUDE_MEM_CONTEXT_OBSERVATIONS` | `50` | 每次 session 注入幾筆索引 |
| `CLAUDE_MEM_CONTEXT_SESSION_COUNT` | `10` | 回溯幾個 session 的摘要 |
| `CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY` | `true` | 開頭顯示上次 session 摘要 |
| `CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE` | `false` | 是否顯示上次最後一句話 |
| `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT` | `true` | 顯示終端輸出 |
| `CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT` | `true` | 狀態列顯示省了幾 % token |

### 成本最佳化（tier routing）

| Key | 預設 | 說明 |
|-----|------|------|
| `CLAUDE_MEM_TIER_ROUTING_ENABLED` | `true` | 開啟分層路由 |
| `CLAUDE_MEM_TIER_SIMPLE_MODEL` | `haiku` | 簡單觀察用 haiku（便宜） |
| `CLAUDE_MEM_TIER_SUMMARY_MODEL` | `""` | 空值 = 用主模型 |

### 語義搜尋（Chroma）

| Key | 預設 | 說明 |
|-----|------|------|
| `CLAUDE_MEM_CHROMA_ENABLED` | `true` | 開啟語義搜尋 |
| `CLAUDE_MEM_CHROMA_MODE` | `local` | `local` / `remote` |
| `CLAUDE_MEM_CHROMA_PORT` | `8000` | 本地 Chroma 服務 port |
| `CLAUDE_MEM_SEMANTIC_INJECT` | `false` | 是否主動注入語義相關的觀察 |
| `CLAUDE_MEM_SEMANTIC_INJECT_LIMIT` | `5` | 語義注入上限 |

### 改完怎麼生效？

**重啟 Claude Code** 即可。設定檔在 hook 啟動時讀取。

---

## 9. 常用指令速查

### 在 Claude Code 對話中

| 指令 | 功能 |
|------|------|
| `/mem-search <關鍵字>` | 自然語言搜尋過去紀錄 |
| `/plugin` | 管理所有外掛（含 claude-mem 開關） |

### 在終端（Bash / PowerShell）

> 用前先確定 PATH 有 node 與 claude：`export PATH="/c/Program Files/nodejs:/c/Users/Bandai/AppData/Roaming/npm:$PATH"`

```bash
# Worker 生命週期
npx claude-mem start              # 啟動 worker
npx claude-mem stop               # 停止 worker
npx claude-mem status             # 查看狀態

# 資料相關
npx claude-mem list               # 列出所有專案的 session
npx claude-mem export             # 匯出記憶到 JSON

# 外掛管理
npx claude-mem install            # 重新安裝（修復用）
npx claude-mem uninstall          # 移除外掛（保留資料）
```

### 直接操作 Worker HTTP API

```bash
# 健康檢查
curl http://localhost:37777/api/health

# 搜尋
curl "http://localhost:37777/api/search?q=authentication&limit=5"

# 取觀察細節
curl "http://localhost:37777/api/observation/456"

# 時間軸
curl "http://localhost:37777/api/timeline?observation_id=456&before=5&after=5"
```

---

## 10. 常見問題 FAQ

### Q1. 會不會吃掉我的 Claude CLI 用量？

**會**，每次 session 結束的摘要壓縮會用 `claude-sonnet-4-6`（預設），每次大約 1–5k input + 200–800 output tokens。但**回來省**的注入+搜尋 token 通常是它的 10 倍以上。長期來看是**淨省**。

### Q2. 支不支援多個專案？

**支援**。每筆觀察都有 `project` 欄位（由工作目錄自動判斷），搜尋時會自動限定在當前專案，除非你指定 `project: "*"`。

### Q3. AgentHub 裡的 L1/L2 虛擬 Agent 會共享記憶嗎？

**預設共享**（同機器、同 `.claude-mem/` 目錄）。如果想讓某個 Agent 獨立記憶，可以設 `CLAUDE_CONFIG_DIR` 環境變數指到另一個目錄。

### Q4. 記憶會不會越存越大拖慢開機？

不會。SessionStart 只注入**索引**（預設 50 筆 × ~80 tokens = 4,000 tokens），不管 DB 多大都差不多。DB 本身就是 SQLite 索引，百萬筆查詢仍秒回。

### Q5. 我想在不同電腦同步記憶怎麼辦？

目前不內建同步。可以把 `C:\Users\Bandai\.claude-mem\` 整個目錄放到 OneDrive / Git / Syncthing。或升級到 **Pro 版**（作者未發佈）會支援 cloud sync。

### Q6. Beta 版有什麼？

主要是 **Endless Mode**（仿生物記憶架構，支援超長 session 不會爆 context）。從 Web UI `http://localhost:37777` → Settings 可切換。

### Q7. 會影響 Claude Code 啟動速度嗎？

SessionStart hook 大約增加 0.5–1.5 秒（首次啟動 worker 約 3 秒，之後已常駐不再多）。如果覺得慢可以把 worker 設成開機自啟。

### Q8. 其他 AI 編輯器（Cursor / Gemini CLI）能用嗎？

可以。安裝時加 `--ide`：
- `npx claude-mem install --ide gemini-cli`
- `npx claude-mem install --ide opencode`
- Cursor：`npx claude-mem cursor:install`

---

## 11. 故障排除

### 症狀 A｜`curl localhost:37777/api/health` 回 Connection refused

**原因**：worker 沒起來。

**排查**：
```bash
# 看最新日誌
tail -50 "C:\Users\Bandai\.claude-mem\logs\claude-mem-$(date +%Y-%m-%d).log"

# 手動啟動（不透過 hook）
npx claude-mem start
```

常見錯誤：
- `Bun not found` → 檢查 `C:\Users\Bandai\.bun\bin\bun.exe` 存在
- `Failed to spawn worker` → 通常是 PATH 沒帶到 PowerShell，重新從 Windows 主 shell 啟動 Claude Code
- `EADDRINUSE :37777` → port 被占用，改 `CLAUDE_MEM_WORKER_PORT`

### 症狀 B｜Claude 沒有「記得」上次內容

**排查 1**：確認外掛啟用：
```bash
cat "C:\Users\Bandai\.claude\settings.json" | grep claude-mem
# 應該是 "claude-mem@thedotmack": true
```

**排查 2**：確認 hooks 有註冊：
```bash
cat "C:\Users\Bandai\.claude\plugins\marketplaces\thedotmack\plugin\hooks\hooks.json"
```

**排查 3**：查看 session log 有無 SessionStart 事件。

### 症狀 C｜`/mem-search` 指令沒反應

**原因**：skill 未載入或 worker 未跑。

**解法**：
1. 先確認 worker 健康
2. 重啟 Claude Code
3. 若仍失敗：`npx claude-mem install`（重新部署 skill）

### 症狀 D｜Windows Terminal 一直開新分頁

這是 claude-mem 已知設計：hook 執行失敗時 exit code 0 避免 terminal 累積分頁。如果你看到一直開分頁代表**有 hook crash**，看 log 找原因。

### 症狀 E｜我在說明書看到某個設定找不到

`~/.claude-mem/settings.json` 沒有的 key，代表你的版本預設關閉。直接**新增**那一行即可，不存在的 key 會用程式內建預設值。

### 症狀 F｜改完設定沒生效

99% 是忘了重啟 Claude Code。Hook 只在 SessionStart 讀設定一次。

---

## 12. 進階：切換 Beta / 結合 AgentHub

### 切換 Stable ↔ Beta

**UI 方式**：瀏覽器打開 `http://localhost:37777` → Settings → Version Channel → 選 `beta` → 按 Switch。

**CLI 方式**：
```bash
npx claude-mem@beta install    # 切到 beta
npx claude-mem@latest install  # 切回 stable
```

### 結合 AgentHub 使用

你的 AgentHub 專案（`C:\Users\Bandai\Desktop\ALL PROJECT\Agent-hub\`）是管理虛擬開發公司的 Electron app。claude-mem 裝在**使用者層級**（`~/.claude/`），所以：

✅ **AgentHub 本身** 跟 **所有 L1/L2 虛擬 Agent** 的 Claude Code session 都共享同一套記憶。

✅ 你可以在 AgentHub 的 status line 或 GUI 顯示「目前記憶庫筆數」—— 直接打 `http://localhost:37777/api/stats`。

⚠️ 注意：如果 AgentHub 的 Agent 是跑在**容器**或**獨立的 workDir** 裡，要確認 `CLAUDE_CONFIG_DIR` 是否指到主目錄，否則它們會有**各自獨立的記憶庫**。

建議在 AgentHub 的 `.knowledge/` 中加一條規範：

```markdown
## claude-mem 整合規則
- 所有虛擬 Agent 共用 ~/.claude-mem/ 作為記憶庫
- Session 結束時由 hook 自動壓縮（不需手動呼叫）
- 機密資訊一律用 <private>...</private> 標記
```

### 匯出與備份

```bash
# 匯出成 JSON（可讀）
npx claude-mem export > backup-$(date +%Y%m%d).json

# 直接備份整個資料夾（含 Chroma 向量）
tar -czf claude-mem-backup.tgz -C ~ .claude-mem
```

---

## 13. 安全與授權注意事項

### 資料安全

- ✅ 所有觀察都存本地 SQLite，不外流
- ✅ Worker 只綁 `127.0.0.1`（localhost）—— 設定 `CLAUDE_MEM_WORKER_HOST`，預設已是 `127.0.0.1`
- ⚠️ 如果改成 `0.0.0.0` 對外開放，**任何區網內裝置都能讀你的記憶庫**，不要這樣做
- ⚠️ 團隊共用機器時，`.claude-mem/` 未加密 —— 用 Windows BitLocker 或 VeraCrypt 保護磁碟

### 授權條款

| 部分 | 授權 |
|------|------|
| claude-mem 主體 | **AGPL-3.0** |
| `ragtime/` 子目錄 | PolyForm Noncommercial License 1.0.0 |

**AGPL-3.0 重點**：
- 個人 / 企業內部開發用：✅ 完全免費、無限制
- 修改後重新分發：必須開源
- **修改後部署成網路服務**（例如 SaaS）：也必須開源修改的版本
- AgentHub 僅在本地使用 claude-mem：不受 AGPL 傳染

### Pro 版（未來）

作者規劃推出 Pro 版（Memory Stream UI、timeline scrubbing、advanced filtering），但**不會閹割開源版功能** —— 所有 localhost:37777 的 API 保持開放。Pro 版是 extends，不是 replaces。

---

## 🔖 附錄：關鍵路徑一覽

```
C:\Users\Bandai\
├── .claude\
│   ├── settings.json                            ← 註冊外掛的地方
│   └── plugins\marketplaces\thedotmack\         ← 外掛本體
│       ├── plugin\hooks\hooks.json              ← 5 個生命週期 hook 定義
│       ├── plugin\scripts\                      ← 執行腳本（worker / bun-runner 等）
│       ├── plugin\skills\mem-search\SKILL.md    ← /mem-search 指令
│       └── plugin\modes\                        ← 多國語言模式
│
├── .claude-mem\
│   ├── settings.json                            ← 所有設定環境變數
│   ├── claude-mem.db                            ← SQLite 主資料庫
│   ├── chroma\                                  ← 向量搜尋資料
│   └── logs\claude-mem-YYYY-MM-DD.log           ← 每天一份日誌
│
├── .bun\bin\bun.exe                             ← Bun runtime（fallback 路徑）
│
└── AppData\Roaming\npm\
    ├── bun.cmd                                  ← Bun（PATH 版本）
    └── claude.cmd                               ← Claude Code CLI v2.1.114
```

---

## 📞 官方資源

- **文件**：https://docs.claude-mem.ai
- **GitHub**：https://github.com/thedotmack/claude-mem
- **Discord**：https://discord.com/invite/J4wttp9vDu
- **X (Twitter)**：[@Claude_Memory](https://x.com/Claude_Memory)
- **作者**：Alex Newman ([@thedotmack](https://github.com/thedotmack))

---

**最後更新**：2026-04-18
**說明書製作**：Product Manager Agent（AgentHub）
