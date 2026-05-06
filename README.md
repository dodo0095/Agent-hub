<div align="center">

# StarkLab AgentHub

### AI Agent Team Management Platform — 史塔克實驗室 Edition

Forked from [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub), with significant enhancements in cross-agent communication, execution observability, and intelligent task orchestration.

**[Quick Start](#quick-start)** · **[What's New](#whats-new-in-this-fork)** · **[Latest Updates](#latest-updates)** · **[Architecture](#architecture)**

</div>

---

## Latest Updates

### 2026-04-25 — Claude-Mem 脫鉤 + Hook 路徑修正

- **claude-mem 完全移除** — 從 `~/.claude/settings.json` 清除 `extraKnownMarketplaces` 與 `enabledPlugins` 登記；`installed_plugins.json` 清空；Worker process 確認已停止
- **Hook 路徑修正** — 所有 `.claude/hooks/*.js` 的呼叫改用 Node.js 完整路徑（`/c/Program Files/nodejs/node`），解決 `/usr/bin/bash` 執行環境 PATH 找不到 `node` 的問題
- **stop-validator 修正** — `execSync('npm ...')` 改用 `process.execPath` + npm-cli.js 完整路徑，確保 Stop Hook 能正確執行 test/lint
- **Lint 修正** — 修復 `project-sync.ts`（3 處 `no-useless-escape`）、`session-manager.ts`（ternary statement `no-unused-expressions`）、`SkillCreateModal.vue`（`no-useless-escape`），lint 現在 0 errors

---

### 2026-04-24 — Window Title Rename to Starklab AgentHub

- **Window title** — Changed from `Yu AgentHub` → `Starklab AgentHub` across all surfaces:
  - `src/index.html` — browser `<title>` tag
  - `electron-builder.yml` — `productName` (installer / taskbar)
  - `electron/main.ts` — startup log + macOS app menu label
  - `electron/services/tray-service.ts` — system tray tooltip + context menu label
  - `src/locales/en.json` — "About" menu English text
  - `src/locales/zh-TW.json` — "About" menu Chinese text
  - `electron/utils/session-statusline.sh` — script comment header

---

### 2026-04-11 — Brand Rebrand + StatusLine Cost Tracking

#### 🎨 Brand Rebrand: StarkLab
- **Logo** — Replaced the placeholder "Y" avatar with the official `starklab_logo.png` in the sidebar
- **Name** — Renamed from "Yu AgentHub" → **StarkLab AgentHub** across all UI surfaces
- **Accent colour** — Global theme colour changed from purple (`#6c5ce7`) to **StarkLab brand blue** (`#0066cc` / `#4da3ff`) in:
  - CSS custom properties (`main.css`) — both dark and light themes
  - Terminal cursor & selection highlight (`SessionTerminal.vue`)
  - Hook type tag (`HookLogsTable.vue`)
  - Harness topbar icon (`HarnessView.vue`)
  - Dashboard chart colours (`DashboardView.vue`)

#### ⚡ StatusLine Cost Tracking
- **New script** — `electron/utils/session-statusline.js` reads Claude CLI's usage data and writes cost/token info to a shared file
- **Auto path resolution** — `getStatuslineScriptPath()` resolves the correct path in both **dev** (`__dirname`) and **packaged** (`process.resourcesPath`) environments
- **Session injection** — Interactive sessions automatically write a temp `settings-{id}.json` and pass it to Claude CLI via `--settings`, enabling real-time cost tracking without manual config
- **Build bundling** — `electron-builder.yml` now includes `session-statusline.js` as an `extraResource` so it is available in production builds

#### 📚 Knowledge Base
- Added `.knowledge/company-rules.md`, `team-workflow.md`, `postmortem-common.md`
- Added `.knowledge/templates/` — Sprint proposal, dev plan, internal review, postmortem templates

---

## What Is This?

An **Electron desktop app** for managing a virtual AI development team powered by Claude Code. Each Agent is a Claude Code CLI session with its own role, skills, and constraints. The platform orchestrates them through Harness Engineering — Skills standardize workflows, Hooks enforce quality, FileWatcher syncs in real-time.

**You are the boss. Agents execute. The system enforces discipline.**

---

## What's New In This Fork

This fork adds features inspired by **Dify** and **CrewAI**, addressing key gaps in the original:

### Cross-Agent Communication
- **Messages UI** — Full inbox with project/agent/status filters
- **Project-scoped messaging** — Messages isolated per project, no cross-project noise
- **Dual system bridge** — AgentHub SQLite MessageBroker syncs with Claude Code Teams JSON inbox
- **Real-time events** — Messages, task status changes, and delivery all push to UI instantly

### Intelligent Task Orchestration (CrewAI-inspired)
- **Task output chaining** — When Task A completes, its output auto-injects into Task B's system prompt via dependency graph
- **Auto-unlock downstream tasks** — Dependencies all done → downstream task auto-transitions `created → assigned`
- **Sequential execution strategy** — Tasks flow through the dependency DAG automatically

### Execution Observability (Dify-inspired)
- **Cost/token dashboard** — Chart.js visualizations with Line, Doughnut, and Bar charts
- **Per-agent and per-project breakdowns** — See exactly where spend is going
- **Daily trend analysis** — 14-day cost + session count with dual-axis line chart
- **Summary stats** — Total tokens, tool calls, sessions at a glance

### Agent Intelligence
- **Autonomous delegation** — System prompt auto-injects colleague list + SendMessage instructions; agents decide when to delegate
- **Persistent memory** — `agent_memory` table stores key-value context across sessions; auto-loaded on spawn
- **Session output persistence** — `result_summary` captured and stored for both sessions and tasks

### Quality of Life
- **Task cards auto-update** — Full event chain from backend transition to UI (was completely broken)
- **PTY message debounce** — Batches consecutive messages into single writes
- **Content size protection** — 50KB limit prevents PTY buffer overflow
- **PTY error handling** — Graceful fallback when write fails

---

## Architecture

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
│            System Layer                 │
│  Claude Code CLI / File System / SQLite │
└─────────────────────────────────────────┘
```

### Key Services

| Service | Purpose |
|---------|---------|
| SessionManager | PTY lifecycle, output buffering, auto task transitions |
| MessageBroker | Cross-session messaging with auto-delivery + JSON inbox sync |
| PromptAssembler | System prompt assembly with dependency outputs, memory, colleague injection |
| TaskManager | CRUD, status machine, dependency graph, auto-unlock |
| ProjectSync | chokidar → markdown parser → DB upsert → eventBus |
| HookManager | Tech stack detection, stop-validator, pre-commit checks |

### Data Flow: Task Output Chaining

```
Task A (frontend-dev) completes
  → output_summary stored in DB
  → Task B (test-writer) depends on A
  → Task B spawns → PromptAssembler queries dependencies
  → Task A's output injected as "前置任務輸出" section
  → test-writer has full context of what was built
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 35 |
| Frontend | Vue 3 + TailwindCSS 4 + TypeScript |
| Charts | Chart.js + vue-chartjs |
| State | Pinia (9 stores) |
| Database | sql.js (WASM SQLite) |
| Terminal | xterm.js + node-pty |
| AI Engine | Claude Code CLI |
| File Watching | chokidar |

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| [Node.js](https://nodejs.org/) | >= 18 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Latest |
| [Git](https://git-scm.com/) | >= 2.30 |
| C++ Build Tools | Platform-specific (for node-pty) |

### Platform Setup

```bash
# macOS
xcode-select --install

# Windows (Admin PowerShell)
npm install --global windows-build-tools

# Linux (Ubuntu/Debian)
sudo apt-get install -y build-essential python3
```

## Quick Start

```bash
# Clone
git clone https://github.com/starklab/Agent-hub.git
cd Agent-hub

# Install
npm install

# Dev
npm run dev
```

### Commands

```bash
npm run dev          # Electron + Vite HMR
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run test         # Unit tests (Vitest)
npm run lint         # ESLint
```

---

## Team Structure

9 departments, 46 Agents with strict chain of command:

```
Boss (You)
├── Product Manager (L1)
│   ├── Feedback Synthesizer, Sprint Prioritizer, Trend Researcher
├── Tech Lead (L1)
│   ├── Frontend Dev, Backend Architect, AI Engineer, DevOps, Mobile, Prototyper
├── Design Director (L1)
│   ├── UI Designer, UX Researcher, Visual Storyteller, Brand Guardian
├── Marketing Lead (L1)
│   ├── Content Creator, Growth Hacker, Social Media (Twitter/IG/TikTok/Reddit)
├── QA Lead (L1)
│   ├── Test Writer, API Tester, Performance Benchmarker
├── Project Lead (L1)
│   ├── Project Shipper, Studio Producer, Experiment Tracker
├── Operations Lead (L1)
│   ├── Company Manager, Analytics, Finance, Legal, Support
└── Special: Studio Coach, Joker
```

**L2 cannot bypass L1. Boss only interfaces with L1.** Just like a real company.

---

## Acknowledgements

- Original project by [Stanshy/AgentHub](https://github.com/Stanshy/AgentHub)
- Harness Engineering methodology from [Claude Code Mastery](https://github.com/Stanshy/Claude-code-mastery)
- Task chaining and memory patterns inspired by [CrewAI](https://github.com/crewAIInc/crewAI)
- Observability patterns inspired by [Dify](https://github.com/langgenius/dify)

## License

MIT

---

<div align="center">

*Built for one-person companies that think big.*

**[GitHub](https://github.com/starklab/Agent-hub)**

</div>
