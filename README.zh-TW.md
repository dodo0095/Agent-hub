<div align="center">

# 史塔克實驗室 AgentHub

### AI Agent 虛擬開發公司管理平台

基於 [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub) 深度改造，大幅強化跨 Agent 通訊、執行觀測、智慧任務調度，與 Harness 工程紀律機制。

**[快速開始](#快速開始)** · **[這是什麼？](#這是什麼)** · **[更新日誌](#更新日誌)** · **[架構](#架構)**

</div>

[English](README.md) | 繁體中文

---

## 這是什麼？

**AgentHub** 是一個 Electron 桌面應用程式，讓你用 Claude Code 驅動一整支虛擬 AI 開發公司。

想像你是一間一人公司的老闆，底下有 46 位 AI 員工，分屬 9 個部門。每個 Agent 都有自己的角色、技能和工作規範，透過嚴格的指揮鏈執行任務。你下命令，系統自動協調、分工、品質把關，你專注在決策。

### 核心設計理念

- **你是老闆，Agent 是員工** — 只跟 L1（部門主管）說話，L1 往下分派
- **Harness 工程** — Skill 標準化流程、Hook 強制品質門禁、FileWatcher 即時同步
- **跨 Agent 通訊** — Agent 之間可以透過 SendMessage 互傳指令、移交任務
- **可觀測性** — 成本、Token、工具呼叫一覽無遺，14 天趨勢即時追蹤

### 團隊架構（9 部門 / 46 Agent）

```
老闆（你）
├── Product Manager（L1）
│   └── Feedback Synthesizer、Sprint Prioritizer、Trend Researcher
├── Tech Lead（L1）
│   └── Frontend Dev、Backend Architect、AI Engineer、DevOps、Mobile、Prototyper
├── Design Director（L1）
│   └── UI Designer、UX Researcher、Visual Storyteller、Brand Guardian
├── Marketing Lead（L1）
│   └── Content Creator、Growth Hacker、社群媒體（Twitter/IG/TikTok/Reddit）
├── QA Lead（L1）
│   └── Test Writer、API Tester、Performance Benchmarker
├── Project Lead（L1）
│   └── Project Shipper、Studio Producer、Experiment Tracker
├── Operations Lead（L1）
│   └── Company Manager、Analytics、Finance、Legal、Support
└── 特殊角色：Studio Coach、Joker
```

**L2 不能跳過 L1。老闆只對接 L1。就像真正的公司。**

---

## Fork 新增功能

本 Fork 參考 **CrewAI** 和 **Dify** 的設計模式，補齊原版的關鍵缺口：

### 跨 Agent 通訊
- **訊息中心 UI** — 完整收件匣，支援專案 / Agent / 狀態篩選
- **專案隔離** — 訊息按專案隔離，不同專案互不干擾
- **雙系統橋接** — AgentHub SQLite MessageBroker ↔ Claude Code Teams JSON inbox 雙向同步
- **即時推送** — 訊息、任務狀態、投遞確認全部即時推送到 UI

### 智慧任務調度（CrewAI 風格）
- **任務輸出鏈** — Task A 完成 → 輸出自動注入 Task B 的 system prompt（依賴圖驅動）
- **自動解鎖下游任務** — 前置依賴全數完成 → 下游任務自動 `created → assigned`
- **序列執行策略** — 任務沿著依賴 DAG 自動流轉

### 執行觀測（Dify 風格）
- **成本 / Token 儀表板** — Chart.js 互動圖表（折線、甜甜圈、長條圖）
- **Per-Agent / Per-Project 拆解** — 清楚看到錢花在哪裡
- **14 天每日趨勢** — 成本 + Session 數雙軸折線圖
- **摘要統計** — Total Tokens / Tool Calls / Sessions 一覽

### Agent 智慧化
- **自主委派** — System prompt 自動注入同事清單 + SendMessage 指引，Agent 自行判斷何時委派
- **持久記憶** — `agent_memory` 表儲存跨 Session key-value 記憶，spawn 時自動載入
- **Session 輸出持久化** — `result_summary` 自動擷取存檔，供後續任務引用

### 體驗優化
- **任務卡片即時更新** — 修復完整事件鏈（原版完全斷裂）
- **PTY 訊息 debounce** — 批次合併連續寫入，穩定輸出
- **內容大小保護** — 50 KB 上限防止 PTY Buffer 溢位
- **PTY 錯誤處理** — 寫入失敗優雅降級

---

## 架構

```
┌─────────────────────────────────────────┐
│            Vue 3 Renderer               │
│  Views (10) → Components → Stores (9)   │
│         ↕ IPC (contextBridge)           │
├─────────────────────────────────────────┤
│          Electron Main Process          │
│  Services (~18) → IPC Handlers (~14)    │
│         ↕ node-pty / chokidar / sql.js  │
├─────────────────────────────────────────┤
│              系統層                      │
│  Claude Code CLI / 檔案系統 / SQLite    │
└─────────────────────────────────────────┘
```

### 核心服務

| 服務 | 職責 |
|------|------|
| SessionManager | PTY 生命週期、輸出緩衝、自動任務狀態轉換 |
| MessageBroker | 跨 Session 訊息傳遞、自動投遞、JSON inbox 同步 |
| PromptAssembler | System prompt 組裝（依賴輸出 + 記憶 + 同事注入） |
| TaskManager | CRUD、狀態機、依賴圖、自動解鎖 |
| ProjectSync | chokidar → markdown 解析 → DB upsert → eventBus |
| HookManager | 技術棧偵測、stop-validator、pre-commit 品質檢查 |

### 資料流：任務輸出鏈

```
Task A（frontend-dev）完成
  → output_summary 儲存到 DB
  → Task B（test-writer）依賴 A
  → Task B spawn → PromptAssembler 查詢依賴
  → Task A 的輸出注入為「前置任務輸出」段落
  → test-writer 擁有完整的建置脈絡
```

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端 | Vue 3 + TailwindCSS 4 + TypeScript |
| 圖表 | Chart.js + vue-chartjs |
| 狀態管理 | Pinia（9 個 store） |
| 資料庫 | sql.js（WASM SQLite） |
| 終端機 | xterm.js + node-pty |
| AI 引擎 | Claude Code CLI |
| 檔案監控 | chokidar |

---

## 快速開始

### 前置需求

| 必要項目 | 版本 |
|---------|------|
| [Node.js](https://nodejs.org/) | >= 18 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 最新版 |
| [Git](https://git-scm.com/) | >= 2.30 |
| C++ Build Tools | 依平台而定（node-pty 需要） |

```bash
# Windows（管理員 PowerShell）
npm install --global windows-build-tools

# macOS
xcode-select --install

# Linux (Ubuntu/Debian)
sudo apt-get install -y build-essential python3
```

### 安裝與執行

```bash
# Clone
git clone https://github.com/dodo0095/Agent-hub.git
cd Agent-hub

# 安裝相依套件
npm install

# 啟動開發模式
npm run dev
```

### 常用指令

```bash
npm run dev          # Electron + Vite HMR 開發模式
npm run build        # 正式打包
npm run typecheck    # TypeScript 型別檢查
npm run test         # 單元測試（Vitest）
npm run lint         # ESLint 程式碼檢查
```

---

## 更新日誌

### 2026-05-08 — PM-011 Cost Tracking 根治修復

- **JSONL polling 落地** — 捨棄不穩定的 IPC 呼叫鏈，改由後端直接解析 Claude JSONL 使用紀錄寫入 production DB
- **三個串聯失敗全數修復** — Session spawn → cost event → DB write → 前端圖表全鏈路貫通
- **Windows env var 繼承** — 確保 node-pty 子程序正確繼承 `ANTHROPIC_API_KEY` 等環境變數

---

### 2026-05-05 — PM-010 Cost Tracking 多輪修復

- **主來源改為 JSONL 解析** — 直接解析 `~/.claude/projects/*/conversation.jsonl`，不依賴 CLI 輸出格式
- **Workspace trust 自動接受** — 修復 Claude Code 在新目錄詢問 trust 導致 cost tracking 卡死的問題
- **Interactive session 流量更新** — 修復 interactive session 的 token/cost 數據無法同步到前端儀表板

---

### 2026-04-29 — Sprint 5 版控 + Harness 規範納入

- **版控強化** — `.claude/commands/`、`.claude/hooks/`、`settings.json` 全部納入 git 版控
- **Sprint 5 計畫書** — `proposal/sprint5-dev-plan.md` 正式納入
- **Postmortem 補齊** — 新增 PM-007（Skill tool 阻擋）、PM-008（Hook 路徑問題）、PM-009（SendMessage 工具落差）
- **G2 Code Review 通過** — Sprint 5 T2～T6 批准合併

---

### 2026-04-25 — Claude-Mem 脫鉤 + Hook 路徑全面修正

- **claude-mem 完全移除** — 清除 `~/.claude/settings.json` 中的 `extraKnownMarketplaces` / `enabledPlugins`；Worker process 確認停止
- **Hook 路徑修正** — 所有 `.claude/hooks/*.js` 改用 Node.js 完整路徑（`/c/Program Files/nodejs/node`），解決 `/usr/bin/bash` 環境 PATH 找不到 `node` 的問題
- **stop-validator 修正** — `execSync('npm ...')` 改用 `process.execPath` + npm-cli.js 完整路徑，Stop Hook 能正確執行 test/lint
- **Lint 零錯誤** — 修復 `project-sync.ts`（3 處 `no-useless-escape`）、`session-manager.ts`（ternary `no-unused-expressions`）、`SkillCreateModal.vue`（`no-useless-escape`）

---

### 2026-04-24 — 全站視窗標題更名為 Starklab AgentHub

- **視窗標題統一** — 從 `Yu AgentHub` 改為 `Starklab AgentHub`，涵蓋：
  - `src/index.html` 瀏覽器 `<title>`
  - `electron-builder.yml` `productName`（安裝程式 / 工作列）
  - `electron/main.ts` 啟動 log + macOS 應用程式選單
  - `electron/services/tray-service.ts` 系統匣 tooltip 與右鍵選單
  - `src/locales/en.json` / `zh-TW.json` About 選單文字

---

### 2026-04-11 — 品牌重塑 + StatusLine 費用追蹤

#### 品牌重塑：StarkLab
- **Logo** — 以官方 `starklab_logo.png` 取代側邊欄佔位頭像
- **品牌色** — 全域主題色從紫色（`#6c5ce7`）換為 StarkLab 品牌藍（`#0066cc` / `#4da3ff`），涵蓋 CSS 變數、Terminal cursor、圖表配色

#### StatusLine 費用追蹤
- **新腳本** — `electron/utils/session-statusline.js` 讀取 Claude CLI 用量資料，寫入成本 / token 共享檔
- **自動路徑解析** — `getStatuslineScriptPath()` 同時相容開發環境（`__dirname`）與打包環境（`process.resourcesPath`）
- **Session 注入** — Interactive session 自動寫入暫存 `settings-{id}.json`，透過 `--settings` 傳給 Claude CLI
- **Build 打包** — `electron-builder.yml` 新增 `extraResource`，確保 production build 包含 statusline 腳本

#### 知識庫建立
- 新增 `.knowledge/company-rules.md`、`team-workflow.md`、`postmortem-common.md`
- 新增 `.knowledge/templates/` — Sprint 提案書、開發計畫書、內部審查、Postmortem 範本

---

### 2026-04-13 — Sprint 4：學術研究部門

- **新部門** — `academic-research` 部門上線，服務東吳大學資料科學系教授
- **四條學術工作流程** — 期刊投稿、研討會論文、論文審稿、國科會計畫申請
- **7 位學術 Agent** — 含 Lit Reviewer、Hypothesis Generator、Stat Analyst、Grant Writer 等
- **知識庫** — `.knowledge/academic/` 下新增 SOP、Agent prompts、期刊清單、學者檔案

---

### 2026-04-初 — 核心功能首次上線

- **跨 Agent 通訊** — Messages UI、雙系統橋接、即時推送
- **智慧任務調度** — 任務輸出鏈、自動解鎖下游任務
- **執行觀測** — Cost/Token 儀表板，Chart.js 互動圖表
- **Agent 智慧化** — 自主委派、持久記憶、Session 輸出持久化
- **品質修復** — 任務卡片即時更新、PTY debounce、50 KB 保護

---

## 致謝

- 原始專案 [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub)
- Harness 工程方法論來自 [Claude Code Mastery](https://github.com/Stanshy/Claude-code-mastery)
- 任務鏈與記憶系統參考 [CrewAI](https://github.com/crewAIInc/crewAI)
- 觀測面板設計參考 [Dify](https://github.com/langgenius/dify)

## License

MIT

---

<div align="center">

*為想做大事的一人公司而生。*

**[GitHub](https://github.com/dodo0095/Agent-hub)**

</div>
