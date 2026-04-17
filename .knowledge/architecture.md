# 系統架構

> **版本**: v1.2
> **最後更新**: 2026-03-25

---

## 架構核心

**每個 Agent = 一個 Claude Code Session**。AgentHub 不自建 Agent Runtime，而是透過 node-pty 啟動 Claude Code CLI 子程序，並在 xterm.js 中即時渲染輸出。

## 三層架構

```
┌─────────────────────────────────────────┐
│            Vue 3 Renderer               │
│  Views (8) → Components → Stores (8)   │
│         ↕ IPC (contextBridge)           │
├─────────────────────────────────────────┤
│          Electron Main Process          │
│  Services (~16) → IPC Handlers (~12)    │
│         ↕ node-pty / chokidar / sql.js  │
├─────────────────────────────────────────┤
│            系統層                        │
│  Claude Code CLI / 檔案系統 / SQLite    │
└─────────────────────────────────────────┘
```

## 服務清單（保留）

### 核心服務

| 服務 | 檔案 | 職責 |
|------|------|------|
| SessionManager | `session-manager.ts` | Session 生命週期、PTY 管理、輸出緩衝 |
| Database | `database.ts` | sql.js 初始化、migration、CRUD |
| AgentLoader | `agent-loader.ts` | 載入 Agent YAML 定義 |
| PromptAssembler | `prompt-assembler.ts` | 組裝 System Prompt |
| EventParser | `event-parser.ts` | 解析 Claude 輸出（tool calls、file edits）|
| EventBus | `event-bus.ts` | 事件發佈/訂閱（main → renderer 轉發）|

### 流程服務

| 服務 | 檔案 | 職責 |
|------|------|------|
| GateKeeper | `gate-keeper.ts` | Gate 生命週期、checklist、審核流程 |
| TaskManager | `task-manager.ts` | 任務 CRUD、狀態機、依賴管理 |
| SprintManager | `sprint-manager.ts` | Sprint 生命週期 |
| AuditLogger | `audit-logger.ts` | 操作稽核紀錄 |

### 工具服務

| 服務 | 檔案 | 職責 |
|------|------|------|
| GitManager | `git-manager.ts` | Git 操作（status, diff, log, commit）|
| KnowledgeReader | `knowledge-reader.ts` | 知識庫讀取和搜尋 |
| FileWatcher | `file-watcher.ts` | 檔案監控 |
| TrayService | `tray-service.ts` | 系統列圖示 |

### Sprint 2 新增（已實作）

| 服務 | 檔案 | 職責 |
|------|------|------|
| HookManager | `hook-manager.ts` | 偵測技術棧、產生 stop-validator、寫入 hook settings |

| 工具 | 檔案 | 職責 |
|------|------|------|
| SkillGenerator | `utils/skill-generator.ts` | Agent Skill + Workflow Skill 部署到子專案 |

### Sprint 2 Workflow Skills（9 個）

| Skill | 模板位置 | 核心產出 |
|-------|---------|---------|
| `/sprint-proposal` | `skill-templates/sprint-proposal/` | proposal/sprintN-proposal.md |
| `/dev-plan` | `skill-templates/dev-plan/` | proposal/sprintN-dev-plan.md |
| `/gate-record` | `skill-templates/gate-record/` | append dev-plan 第 10 節 Gate 紀錄 |
| `/task-delegation` | `skill-templates/task-delegation/` | 第 6 節任務表 + .tasks/TN-xxx.md |
| `/task-done` | `skill-templates/task-done/` | 更新任務狀態 + append 第 10 節 |
| `/review` | `skill-templates/review/` | checklist + append Review 紀錄 |
| `/pm-review` | `skill-templates/pm-review/` | 6 項 checklist + 摘要建議 |
| `/sprint-retro` | `skill-templates/sprint-retro/` | 帶入第 10 節數據 → 回顧報告 |
| `/pitfall-record` | `skill-templates/pitfall-record/` | append postmortem-log.md |

### Sprint 3 新增（已實作）

| 服務 | 檔案 | 職責 |
|------|------|------|
| ProjectSync | `project-sync.ts` | chokidar 監聽子專案 → markdown-parser → DB upsert → eventBus |
| MarkdownParser | `markdown-parser.ts` | 解析 .tasks/*.md 元資料表格 + dev-plan 第 10 節三張表格 |

### Sprint 4 新增（已實作）

| 項目 | 說明 |
|------|------|
| Agent: company-manager | 公司知識管理者（L1），跨子專案踩坑收集 → 與老闆討論 → 更新公司知識庫 |
| PromptAssembler 擴充 | `assembleCompanyManagerContext()` — 注入已知子專案清單（workDir + 檔案路徑提示） |
| SessionManager 擴充 | company-manager 強制使用 AgentHub 作為 workDir，不切換到子專案目錄 |
| Skill: `/knowledge-feedback` | 掃描子專案 postmortem → 分類 → 提出公司規範修改建議（僅部署到 AgentHub） |
| SkillGenerator 擴充 | `AGENTHUB_ONLY_SKILLS` 清單，排除公司專用 Skill 部署到子專案 |

### Sprint 4 新增：學術研究部門（academic-research）

| Agent | 層級 | 主責 | 可用 Skills |
|-------|------|------|-----------|
| research-director | L1 | 部門指揮、E2E 期刊/研討會流程 | academic-writing, lit-review, cite-manage, stat-analysis, schematics, venue-format |
| paper-writer | L2 | 期刊論文、研討會論文 | academic-writing, lit-review, cite-manage, venue-format, research-slides, research-poster |
| grant-writer | L2 | 國科會計畫申請 | nstc-grant, grant-writing, hypothesis, stat-analysis |
| manuscript-reviewer | L2 | 論文同儕審稿 | peer-review, critical-thinking, scholar-eval |
| literature-scout | L2 | 文獻搜尋與管理 | lit-review, cite-manage, scholar-eval |
| research-analyst | L2 | 統計分析、假說生成 | stat-analysis, hypothesis, critical-thinking |
| research-visualizer | L2 | 圖表製作、投影片 | schematics, research-slides, research-poster |

> **Skill 整合策略（Wrapper 模式）**：14 個 Skills 以 50-80 行 wrapper 封裝，引用 `claude-scientific-skills/scientific-skills/` 目錄。若該目錄被移動，14 個 wrapper 需同步更新路徑（已知風險，已接受）。

> **產出隔離**：所有學術產出物存放於 `.outputs/` 目錄，已加入 `.gitignore`，防止未發表論文外流。

### Sprint 5 新增（已實作）

| 工具 | 檔案 | 職責 |
|------|------|------|
| i18n（Main Process） | `utils/i18n.ts` | Electron main process 專用輕量 i18n helper；`initI18n()` 以 readFileSync 載入 locale JSON，`t()` 支援 dot-notation key 及 `{n}` 參數替換；語言從 DB `user_preferences.language` 讀取，預設 `zh-TW` |

> 注意：`initI18n()` 須在 `database.initialize()` 之後、`Menu.buildFromTemplate()` 之前呼叫。Main process 不使用 vue-i18n，僅使用本 helper。

## 已移除服務

| 服務 | 原因 |
|------|------|
| SyncManager, NotionApi, DocSyncManager, MarkdownNotion, SyncScheduler | Notion 同步不需要 |
| AuthManager, GithubApi | GitHub OAuth 不需要，用 gh CLI |
| CommunicationBus, Orchestrator, DelegationParser | 不實用 |
| BrowseServer | Playwright 瀏覽器不需要 |
| CostTracker | 成本追蹤暫不需要 |
| MemoryManager, ContextManager, ErrorRecovery | 功能重疊或不需要 |
| NotificationService, UpdaterService, ShortcutService, CrashReporter | 精簡 |

## IPC 架構

### 保留的 IPC Handler 模組

| 模組 | 主要通道 |
|------|---------|
| sessions | SPAWN, STOP, LIST, GET_ACTIVE, PTY_INPUT/RESIZE |
| tasks | CREATE, LIST, GET, UPDATE, DELETE, TRANSITION |
| projects | CREATE, LIST, GET, UPDATE, DELETE, INIT_CLAUDE_DIR |
| gates | CREATE, LIST, SUBMIT, REVIEW, GET_CHECKLISTS |
| sprints | CREATE, LIST, GET, START, COMPLETE, GET_STATUS |
| agents | LIST, GET, GET_DEPARTMENTS |
| knowledge | LIST_TREE, READ_FILE, SEARCH |
| settings | GET, UPDATE, GET_ALL |
| git | GET_STATUS, GET_DIFF, GET_LOG, COMMIT, PUSH, PULL |
| system | GET_HEALTH, SELECT_FOLDER, CLEAR_DATABASE |
| hooks | GET_CONFIG, UPDATE_CONFIG |
| project-sync | START, STOP, FULL, STATUS（push）|

### 已移除 IPC 模組

sync, doc-sync, auth, browse, costs, objections

### IPC 三方一致規則（強制）

新增或修改 IPC 通道時，**以下三處必須同步更新**，缺一不可：

| # | 檔案 | 內容 |
|---|------|------|
| 1 | `electron/types/ipc.ts` | IpcChannels 常數定義 |
| 2 | `electron/preload.ts` | MaestroApi 型別 + contextBridge 實作 |
| 3 | `src/composables/useIpc.ts` | useIpc() wrapper 函數 + return |

> 三處名稱、參數型別、回傳型別必須完全一致。不一致 = runtime 炸。
> 第四方：`src/env.d.ts` 的 MaestroApi 型別也須同步。

## DB Schema（保留）

| 表 | 用途 |
|----|------|
| projects | 專案元資料 |
| sprints | Sprint 生命週期 |
| tasks | 任務 CRUD + 狀態 |
| task_dependencies | 任務依賴關係 |
| gates | Gate 審核 + checklist |
| claude_sessions | Session 記錄 + token 統計 |
| session_events | Session 事件流 |
| decisions | 技術決策記錄 |
| audit_logs | 稽核日誌 |
| user_preferences | 使用者設定 |
| sprint_reviews | Sprint 回顧 |
| schema_migrations | DB 版本管理 |

> Sprint 1 實際保留 11 張業務表 + schema_migrations = 12 張（含 migrations 基礎設施表）
