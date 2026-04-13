# Sprint 4 — Agent / Skill 結構模型

> 版本: v1.0 | Sprint 4 | 最後更新: 2026-04-11
> 範圍: `academic-research` 部門的 Agent 階層 + Skill 綁定關係

## 概述

Sprint 4 無資料庫 schema 變更。本文件定義 **Agent 階層結構** 與 **Agent-Skill 綁定對應表**，作為 Code Review 的比對基準。

---

## 1. 部門階層

```
academic-research 部門（新增）
│
├── research-director (L1)
│   匯報給：boss, project-lead
│   協作：product-manager, tech-lead
│   管理：literature-scout, paper-writer, research-analyst,
│         manuscript-reviewer, research-visualizer, grant-writer
│
├── literature-scout (L2)          ── 文獻搜尋員
├── paper-writer (L2)              ── 論文撰寫員
├── research-analyst (L2)          ── 研究分析員
├── manuscript-reviewer (L2)       ── 稿件審查員
├── research-visualizer (L2)       ── 研究視覺化員
└── grant-writer (L2) ⭐           ── 計畫申請撰寫員（新）
```

### Agent 資料結構（`agent-roster.md` 新增區塊）

每位 Agent 紀錄需含：

| 欄位 | 型別 | 範例 |
|------|------|------|
| id | string | `research-director` |
| name | string | 研究總監 |
| level | L1 / L2 | L1 |
| department | string | `academic-research` |
| reports_to | string[] | `["boss", "project-lead"]` |
| manages | string[] | `["literature-scout", ...]`（L1 專用）|
| collaborates_with | string[] | `["product-manager", "tech-lead"]` |
| skills | string[] | `["hypothesis", "critical-thinking"]` |
| system_prompt_ref | string | `.knowledge/academic/agent-prompts.md#research-director` |

---

## 2. Agent-Skill 綁定表（Single Source of Truth）

> ⚠️ 每位 Agent 只能呼叫此表中明列的 Skills，禁止逾越。違反視為 G2 Review 失敗。

| Agent | 主 Skills | 副 Skills（可選呼叫） | 負責工作流程 |
|-------|-----------|---------------------|-------------|
| `research-director` | `hypothesis`, `critical-thinking` | 所有下屬 Skills（統籌時） | 四條全流程 |
| `literature-scout` | `lit-review`, `cite-manage` | 外部 DB（PubMed/OpenAlex/bioRxiv via Perplexity）| 期刊/研討會/審稿/計畫 |
| `paper-writer` | `academic-writing`, `venue-format` | `cite-manage` | 期刊/研討會 |
| `research-analyst` | `stat-analysis`, `critical-thinking`, `scholar-eval` | `hypothesis` | 期刊/審稿/計畫 |
| `manuscript-reviewer` | `peer-review`, `critical-thinking` | `scholar-eval` | 審稿 |
| `research-visualizer` | `schematics`, `research-slides`, `research-poster` | — | 研討會/期刊/計畫 |
| `grant-writer` ⭐ | **`nstc-grant`**, `grant-writing`, `academic-writing` | `cite-manage`, `schematics` | **國科會計畫** |

---

## 3. 四條工作流程的狀態轉換

### 流程狀態機（所有四條流程共用）

```
[受理] → [文獻搜尋] → [分析/撰寫] → [視覺化] → [內審] → [修訂] → [交付]
   ↓         ↓              ↓           ↓        ↓       ↓       ↓
 老闆     literature-   paper-writer/  research- manuscript-  → research-
 下單     scout         research-      visualizer reviewer    director
                        analyst                                ↓
                                                             老闆驗收
```

### 狀態欄位

每個任務（`.tasks/sprint-4/*.md`）需記錄：

| 欄位 | 值域 |
|------|------|
| workflow | `journal` / `conference` / `peer-review` / `nstc-grant` |
| stage | `accepted` / `literature` / `drafting` / `visualizing` / `internal-review` / `revising` / `delivered` |
| topic | 自由文字（本 Sprint E2E 為「金融科技」類主題） |
| assigned_agent | Agent id |

---

## 4. 檔案儲存模型

```
.outputs/                             # 新增（加入 .gitignore）
├── papers/
│   └── fintech-llm-{timestamp}/
│       ├── manuscript.md             # IMRAD 草稿
│       ├── refs.md                   # 文獻清單 + DOI
│       ├── figures/*.png
│       └── slides.pptx
├── reviews/
│   └── {paper-id}.md                 # 審稿報告
└── grants/
    └── nstc-fintech-{timestamp}/
        ├── CM01-cover.md
        ├── CM03-summary-zh.md
        ├── CM03-summary-en.md
        ├── CM04-body.md              # 研究目的 + 文獻 + 方法
        ├── CM05-timeline.md          # 甘特圖
        └── CM06-budget.md
```

---

## 5. 約束與不變量（Invariants）

1. **Agent-Skill 綁定不可跨部門**：`academic-research` 的 Agent 不得呼叫其他部門的 Skills。
2. **L2 不得直接向 boss 匯報**：必須經 research-director。
3. **nstc-grant 僅限 grant-writer 呼叫**：其他 Agent 一律禁用（防止 Skill 誤用）。
4. **`.outputs/` 絕不進 git**：學術產出可能涉及未發表研究，需隔離。
