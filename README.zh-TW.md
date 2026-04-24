<div align="center">

# Starklab AgentHub

### AI Agent 團隊管理平台 — 增強版 Fork

基於 [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub) 的增強版，大幅強化跨 Agent 通訊、執行觀測、與智慧任務調度。

**[快速開始](#快速開始)** · **[Fork 新增功能](#fork-新增功能)** · **[架構](#架構)**

</div>

[English](README.md) | [繁體中文](README.zh-TW.md)

---

## 最新更新

### 2026-04-24 — 視窗標題更名為 Starklab AgentHub

- **視窗標題** — 全站從 `Yu AgentHub` 改為 `Starklab AgentHub`：
  - `src/index.html` — 瀏覽器 `<title>` 標籤
  - `electron-builder.yml` — `productName`（安裝程式 / 工作列）
  - `electron/main.ts` — 啟動 log + macOS 應用程式選單 label
  - `electron/services/tray-service.ts` — 系統匣 tooltip + 右鍵選單 label
  - `src/locales/en.json` — About 選單英文文字
  - `src/locales/zh-TW.json` — About 選單中文文字
  - `electron/utils/session-statusline.sh` — 腳本註解標頭

---

## 這是什麼？

一個基於 Claude Code 的 **Electron 桌面 AI Agent 團隊管理平台**。每個 Agent 是一個 Claude Code CLI Session，有自己的角色、技能和約束。平台透過 Harness 工程進行編排 — Skill 標準化流程，Hook 強制品質，FileWatcher 即時同步。

**你是老闆。Agent 執行。系統強制紀律。**

---

## Fork 新增功能

本 Fork 參考 **Dify** 和 **CrewAI** 的設計模式，補齊原版的關鍵缺口：

### 跨 Agent 通訊
- **訊息中心 UI** — 完整收件匣，支援專案 / Agent / 狀態篩選
- **專案隔離** — 訊息按專案隔離，不同專案不互相干擾
- **雙系統橋接** — AgentHub SQLite 和 Claude Code Teams JSON 雙向同步
- **即時推送** — 訊息、任務狀態、投遞確認全部即時推送到 UI

### 智慧任務調度（CrewAI 風格）
- **任務輸出鏈** — Task A 完成後，其輸出自動注入 Task B 的 system prompt（透過依賴圖）
- **自動解鎖下游任務** — 前置依賴全部完成 → 下游任務自動 `created → assigned`
- **序列執行策略** — 任務沿著依賴 DAG 自動流轉

### 執行觀測（Dify 風格）
- **成本/Token 儀表板** — Chart.js 互動圖表（折線圖、甜甜圈圖、長條圖）
- **Per-Agent / Per-Project 成本拆解** — 清楚看到錢花在哪裡
- **每日趨勢** — 14 天成本 + Session 數雙軸折線圖
- **摘要數據** — Total Tokens / Tool Calls / Sessions 一覽

### Agent 智慧化
- **自主委派** — System prompt 自動注入同事清單 + SendMessage 使用指引，Agent 自行決定何時委派
- **持久記憶** — `agent_memory` 表儲存跨 Session 的 key-value 記憶，spawn 時自動載入
- **Session 輸出持久化** — `result_summary` 自動擷取並儲存到 sessions 和 tasks

### 體驗優化
- **任務卡片即時更新** — 修復完整事件鏈（原版完全斷裂）
- **PTY 訊息 debounce** — 批次合併，避免連續寫入
- **內容大小保護** — 50KB 上限，防止 PTY 溢位
- **PTY 錯誤處理** — 寫入失敗時優雅降級

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
│            系統層                        │
│  Claude Code CLI / 檔案系統 / SQLite    │
└─────────────────────────────────────────┘
```

### 任務輸出鏈流程

```
Task A (frontend-dev) 完成
  → output_summary 儲存到 DB
  → Task B (test-writer) 依賴 A
  → Task B spawn → PromptAssembler 查詢依賴
  → Task A 的輸出注入為「前置任務輸出」
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

## 前置需求

| 必要項目 | 版本 |
|---------|------|
| [Node.js](https://nodejs.org/) | >= 18 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 最新版 |
| [Git](https://git-scm.com/) | >= 2.30 |
| C++ Build Tools | 依平台而定（node-pty 需要）|

### 平台安裝

```bash
# macOS
xcode-select --install

# Windows（管理員 PowerShell）
npm install --global windows-build-tools

# Linux (Ubuntu/Debian)
sudo apt-get install -y build-essential python3
```

## 快速開始

```bash
# Clone
git clone https://github.com/shenjuneyu/yu-agent-hub.git
cd yu-agent-hub

# 安裝
npm install

# 開發
npm run dev
```

### 可用指令

```bash
npm run dev          # Electron + Vite HMR
npm run build        # 正式打包
npm run typecheck    # TypeScript 型別檢查
npm run test         # 單元測試 (Vitest)
npm run lint         # ESLint
```

---

## 團隊架構

9 個部門、46 個 Agent，嚴格的指揮鏈：

```
老闆（你）
├── Product Manager (L1)
│   ├── Feedback Synthesizer, Sprint Prioritizer, Trend Researcher
├── Tech Lead (L1)
│   ├── Frontend Dev, Backend Architect, AI Engineer, DevOps, Mobile, Prototyper
├── Design Director (L1)
│   ├── UI Designer, UX Researcher, Visual Storyteller, Brand Guardian
├── Marketing Lead (L1)
│   ├── Content Creator, Growth Hacker, 社群媒體 (Twitter/IG/TikTok/Reddit)
├── QA Lead (L1)
│   ├── Test Writer, API Tester, Performance Benchmarker
├── Project Lead (L1)
│   ├── Project Shipper, Studio Producer, Experiment Tracker
├── Operations Lead (L1)
│   ├── Company Manager, Analytics, Finance, Legal, Support
└── 特殊角色: Studio Coach, Joker
```

**L2 不能跳過 L1。老闆只對接 L1。** 就像真正的公司。

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

**[GitHub](https://github.com/shenjuneyu/yu-agent-hub)**

</div>
