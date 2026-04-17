# 專案概述

> **版本**: v1.0
> **最後更新**: 2026-03-24

---

## 定位

AgentHub (Maestro v2) 是「一人軟體公司」管理平台的 Electron 桌面版。透過視覺化介面管理多個 Claude Code Session（每個 Session 扮演一個 AI Agent），完成完整軟體開發生命週期。

## v1 → v2 核心變化

### 設計理念轉變

```
v1: GUI 管理一切 → Agent 被動執行
v2: Harness（Skill + Hook + FileWatcher）驅動一切 → GUI 只做監控
```

### v1 問題

| 問題 | 表現 | 根因 |
|------|------|------|
| 過重 | 33 服務、13 頁面、156 IPC、27 張表 | 什麼都想用 GUI 做 |
| 不實用 | Notion 同步、通訊匯流排、委派解析器很少用 | 設計時想像的需求 |
| 兩個世界 | 子專案檔案 vs GUI SQLite 互不相通 | 沒有同步機制 |
| 無強制力 | 品質約束靠 CLAUDE.md 文字，Agent 可忽略 | 沒有 Hook 攔截 |

### v2 解決方案

**三層機制綁定兩個世界**：
1. **Skill**（格式標準化）— Agent 用 `/task-done`、`/gate-record` 寫入固定格式
2. **Hook**（系統強制）— stop-validator 攔截、pre-commit 檢查
3. **FileWatcher**（自動同步）— chokidar 監聽 .md → 解析 → upsert SQLite → GUI 刷新

### 量化精簡

| 指標 | v1 | v2 |
|------|----|----|
| 後端服務 | 33 | ~14 |
| 前端頁面 | 13 | 5 |
| Pinia Store | 12 | 7 |
| IPC handler 模組 | 17 | ~10 |
| DB 表 | 27 | ~12 |
| npm 依賴 | 14 | ~11 |

## GUI 的 3 個操作 + 監控

| 功能 | 說明 |
|------|------|
| **建立專案** | 設定 workDir、專案類型、引入公司模板到 .knowledge/ |
| **引入公司模板** | 複製公司知識庫到子專案，之後本地迭代 |
| **選 Agent 開 Session** | 選角色、開終端、開始工作 |
| **監控**（被動） | Dashboard 顯示 Sprint 進度、任務狀態、Gate 結果（從 FileWatcher 同步） |

## 子專案列表

| 專案 | 類型 | 狀態 |
|------|------|------|
| MorningGo | SaaS 線上點餐 | 已上線 |
| LexMind | AI 法律平台 | 開發中 |
| VideoBrief | 影片轉文章 | 開發中 |
| ChatPilot | LINE 聊天 AI | 開發中 |

---

## 技術棧

| 類型 | 技術 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 35+ |
| 前端 | Vue 3 + Vite + TypeScript | |
| UI | TailwindCSS | 4 |
| 終端 | xterm.js + node-pty | |
| 狀態管理 | Pinia | |
| 資料庫 | sql.js (WASM SQLite) | |
| 檔案監控 | chokidar | |
| Markdown | marked + gray-matter | |
| 測試 | Vitest + @vue/test-utils + happy-dom | |
| E2E | Playwright | |
| 打包 | electron-builder | |

> 已移除：monaco-editor, @notionhq/client, simple-git

---

## 學術類 Skills（Sprint 4 新增）

> **部門**：academic-research
> **服務對象**：東吳大學資料科學系教授（邱嘉豪）
> **整合策略**：Wrapper 模式（從 `claude-scientific-skills/scientific-skills/` 引用，50-80 行封裝）

| Skill 指令 | 用途 | 原始來源 |
|-----------|------|---------|
| `/academic-writing` | IMRAD 結構論文撰寫（禁 bullet points）| scientific-skills |
| `/lit-review` | 系統性文獻回顧 + DOI 驗證 | scientific-skills |
| `/cite-manage` | 引用管理、BibTeX 產出 | scientific-skills |
| `/stat-analysis` | 統計方法設計、假設檢定 | scientific-skills |
| `/critical-thinking` | 科學批判性評估 | scientific-skills |
| `/schematics` | 研究圖表製作 | scientific-skills |
| `/venue-format` | 期刊/研討會格式套用 | scientific-skills |
| `/research-slides` | 研討會投影片（PPTX）| scientific-skills |
| `/research-poster` | 學術海報（PPTX 單頁大尺寸）| scientific-skills |
| `/peer-review` | 論文同儕審稿報告 | scientific-skills |
| `/scholar-eval` | 研究者學術影響力評估 | scientific-skills |
| `/grant-writing` | 國際計畫框架（NSF/NIH，作為國科會參考）| scientific-skills |
| `/hypothesis` | 研究假說生成（H0/H1）| scientific-skills |
| `/nstc-grant` | 國科會專題研究計畫申請書（自建）| AgentHub 原生 |

### 四條學術工作流程

| 流程 | 產出 | 主責 Agent |
|------|------|-----------|
| 期刊投稿 | IMRAD 英文論文 | paper-writer + research-director |
| 研討會論文 | 4-8 頁短篇 + 投影片 | paper-writer + research-director |
| 論文審稿 | 結構化審稿意見（Major/Minor）| manuscript-reviewer |
| 國科會計畫申請 | CM01~CM12 完整計畫書 | grant-writer |

### 產出目錄

| 目錄 | 說明 |
|------|------|
| `.outputs/papers/` | 論文草稿（已加入 .gitignore，防未發表論文外流）|
| `.outputs/grants/` | 國科會計畫書草稿 |
| `.outputs/reviews/` | 審稿報告 |
| `.outputs/slides/` | 研討會投影片 |
