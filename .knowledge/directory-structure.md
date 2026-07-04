# 目錄結構說明

> **版本**: v1.3
> **最後更新**: 2026-07-04（補 Sprint 5 MCP、cost 追蹤系列、worktree-manager、migrations、scripts）

---

## 頂層結構

```
AgentHub/
├── electron/                    # Electron Main Process
├── src/                         # Vue 3 Renderer
├── agents/                      # Agent 定義 (YAML)
├── tests/                       # 單元測試
├── e2e/                         # E2E 測試
├── .knowledge/                  # 專案級技術規範
├── .claude/                     # Claude Code 設定
├── .tasks/                      # 任務獨立資料夾
├── proposal/                    # Sprint 規劃
├── build/                       # 打包資源
├── CLAUDE.md                    # 專案最高規範
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── vitest.config.ts
└── electron-builder.yml
```

## Electron Main Process

```
electron/
├── main.ts                      # App 進入點、視窗建立、事件轉發
├── preload.ts                   # contextBridge 暴露 API（MaestroApi 型別）
├── ipc/                         # IPC Handlers
│   ├── index.ts                 # 統一註冊所有 handler
│   ├── sessions.ts              # Session spawn/stop/list
│   ├── tasks.ts                 # Task CRUD + 狀態機
│   ├── projects.ts              # Project CRUD + 初始化
│   ├── gates.ts                 # Gate 審核流程
│   ├── sprints.ts               # Sprint 生命週期
│   ├── agents.ts                # Agent 列表
│   ├── knowledge.ts             # 知識庫讀取
│   ├── settings.ts              # 使用者設定
│   ├── git.ts                   # Git 操作
│   ├── hooks.ts                 # Hook 管理
│   ├── project-sync.ts          # 專案檔案同步 IPC
│   └── system.ts                # 系統健康、資料夾選擇
├── services/                    # 核心服務（~29 個）
│   ├── session-manager.ts       # 核心：PTY 管理、Session 生命週期
│   ├── session-spawn-helpers.ts # spawn 參數組裝、cwd 解析、workspace trust
│   ├── session-delegation.ts    # Session 間任務委派
│   ├── session-conversation-scanner.ts # 掃描可 resume 的 Claude 對話
│   ├── session-cost-tracker.ts  # Session cost 統計（statusLine fallback）
│   ├── jsonl-usage-tracker.ts   # JSONL cost 解析（主要來源，PM-010）
│   ├── cost-backfill.ts         # App 啟動補登歷史 session cost（PM-011）
│   ├── pricing.ts               # 模型價目表（tracker/backfill 共用）
│   ├── worktree-manager.ts      # 每 session 獨立 git worktree（PM-008）
│   ├── message-broker.ts        # 跨 Agent 訊息（inbox poll → PTY 注入）
│   ├── pty-manager.ts           # PTY spawn/kill/輸出處理
│   ├── database.ts              # sql.js 初始化、migration
│   ├── agent-loader.ts          # Agent YAML 載入
│   ├── prompt-assembler.ts      # System Prompt 組裝
│   ├── event-parser.ts          # Claude 輸出解析
│   ├── event-bus.ts             # 事件發佈/訂閱
│   ├── gate-keeper.ts           # Gate 審核邏輯
│   ├── task-manager.ts          # 任務管理
│   ├── sprint-manager.ts        # Sprint 管理
│   ├── skill-manager.ts         # Skill CRUD / 部署
│   ├── pitfall-service.ts       # 踩坑紀錄服務
│   ├── git-manager.ts           # Git 操作封裝
│   ├── knowledge-reader.ts      # 知識庫讀取
│   ├── file-watcher.ts          # 檔案監控
│   ├── audit-logger.ts          # 稽核日誌
│   ├── tray-service.ts          # 系統列圖示
│   ├── hook-manager.ts          # Hook 偵測/產生/寫入
│   ├── markdown-parser.ts       # 解析 .tasks/*.md + dev-plan 第 10 節
│   └── project-sync.ts          # chokidar 監聽 → DB 同步
├── mcp/                         # MCP Servers（Sprint 5）
│   └── send-message-server.ts   # 跨 Agent send_message / list_inbox（build:mcp → out/mcp/）
├── migrations/                  # DB migrations（001~017，新增 schema 必加版本）
├── types/                       # 共享型別
│   └── ipc.ts                   # IpcChannels 常數 + 型別定義
└── utils/
    └── skill-generator.ts       # Skill 注入工具
```

## Scripts（scripts/）

```
scripts/
├── smoke-test-hooks.cjs         # Hook 煙霧測試（修改 .claude/hooks/*.js 後必跑）
├── verify-jsonl-cost.cjs        # 一次性掃描 JSONL 驗算 cost（PM-011 驗證用）
├── verify-backfill.cjs          # backfill 結果驗證
├── backfill-cost.cjs            # （已由 cost-backfill.ts 取代，留存參考）
└── gen-e2e-doc.py               # E2E 驗證文件產生
```

## Vue 3 Renderer

```
src/
├── App.vue
├── main.ts
├── router/
│   └── index.ts                 # 8 個路由
├── stores/                      # Pinia（8 個）
│   ├── sessions.ts
│   ├── projects.ts
│   ├── tasks.ts
│   ├── gates.ts
│   ├── agents.ts
│   ├── git.ts
│   ├── settings.ts
│   └── ui.ts
├── views/                       # 頁面（8 個）
│   ├── DashboardView.vue        # 監控：Sprint + 任務 + Gate + Session
│   ├── SessionsView.vue         # 核心：終端互動
│   ├── ProjectsView.vue         # 操作：專案列表 + 建立
│   ├── ProjectDetailView.vue    # 操作：專案詳情
│   ├── TaskBoardView.vue        # Sprint 3：任務看板（Kanban）
│   ├── GatesView.vue            # Sprint 3：Gate 紀錄時間線
│   ├── AgentsView.vue           # Sprint 3：Agent 團隊清單
│   └── SettingsView.vue         # 設定
├── components/
│   ├── common/                  # 通用元件
│   │   ├── BaseButton.vue
│   │   ├── BaseModal.vue
│   │   ├── BaseTag.vue
│   │   ├── ErrorToast.vue
│   │   ├── ProgressBar.vue
│   │   ├── StatCard.vue
│   │   ├── StatusDot.vue
│   │   ├── ToastContainer.vue
│   │   ├── VirtualList.vue
│   │   └── index.ts
│   ├── session/                 # Session 相關
│   │   ├── SessionCard.vue
│   │   ├── SessionGrid.vue
│   │   ├── SessionLauncher.vue
│   │   └── SessionTerminal.vue
│   ├── gate/                    # Gate 相關
│   │   ├── GateChecklistPanel.vue
│   │   └── GateReviewBanner.vue
│   ├── project/                 # 專案相關
│   │   ├── ProjectCard.vue
│   │   └── ProjectCreateModal.vue
│   ├── harness/                 # Harness（Skill/Hook/觸發紀錄）
│   │   ├── HookTab.vue
│   │   ├── SkillTab.vue
│   │   └── TriggerLogsTab.vue
│   ├── task/                    # 任務相關
│   │   └── TaskDetailPanel.vue
│   └── layout/                  # 佈局
│       ├── SidebarNav.vue
│       └── TopBar.vue
├── composables/
│   └── useIpc.ts                # IPC wrapper（三方一致第 3 點）
└── assets/
    └── main.css                 # TailwindCSS 4 入口
```

## 知識庫與規劃

```
.knowledge/                      # 專案級規範 + 公司知識庫（唯一來源）
├── project-overview.md
├── architecture.md
├── directory-structure.md       # 本文件
├── coding-standards.md
├── testing-standards.md
├── quality-checklist.md
├── postmortem-log.md
├── doc-governance.md
├── team-hierarchy.md
└── company/                     # 公司規範（部署到子專案）
    ├── sop/                     # 標準作業程序
    ├── standards/               # 編碼/API/安全標準
    ├── templates/               # 提案書/計畫書/Review 範本
    ├── project-templates/       # 專案類型模板（web-app/api-service/...）
    ├── skill-templates/         # Skill 模板（部署到子專案 .claude/skills/）
    ├── hook-templates/          # Hook 模板（部署到子專案 .claude/settings.json）
    └── agent-roster.md          # Agent 名單

proposal/                        # Sprint 規劃
├── sprint1-proposal.md
├── sprint1-dev-plan.md
└── product-roadmap-draft.md

.tasks/                          # 任務獨立資料夾
└── T1-xxx.md                    # 每個任務一個 .md 檔
```

## Agent 定義

```
agents/
└── definitions/                 # Agent 角色定義（YAML）
    ├── product/                 # 產品部門
    ├── engineering/             # 工程部門
    ├── design/                  # 設計部門
    ├── testing/                 # 測試部門
    ├── marketing/               # 行銷部門
    ├── project-management/      # 專案管理部門
    ├── studio-operations/       # 營運部門
    └── bonus/                   # 特殊角色
```
