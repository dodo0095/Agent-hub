# academic-research 部門結構（詳細欄位）

> 版本: v1.0 | Sprint 4 | 最後更新: 2026-04-11
> 本文件為 `agent-roster.md` 學術研究部的詳細補充，對齊 `.knowledge/specs/data-model.md` §1-2

---

## 部門概述

- **部門代號**: `academic-research`
- **部門名稱**: 學術研究部
- **建立 Sprint**: Sprint 4（2026-04-11）
- **成員數**: 7 位（1 L1 + 6 L2）
- **核心使命**: 支援四條學術工作流程 —— 期刊投稿 / 研討會論文 / 論文審稿 / 國科會計畫申請
- **主要題材**（依老闆研究主軸 2026-04-11 確認）:
  1. **金融**（AI 金融分析：ML/NLP × Finance，延續 IJDMMM 2021 研究脈絡）
  2. **教育**（LLM 教育應用：ChatGPT × CS Education / Learning Analytics）
  3. **AI 跨領域應用**（AI/ML/LLM 作為方法學貫穿各領域的核心能力）
- **題材詳細檔案**: `.knowledge/academic/scholar-profile.md`（老闆研究者檔案 + 6 篇代表論文）
- **Sprint 4 E2E 測試分派**:
  - T9 期刊流程 → **金融科技**（G0 決議）
  - T10 研討會流程 → **金融科技**（G0 決議，ACM ICAIF 或 IEEE ICDM）
  - T11 審稿流程 → AI 跨領域論文
  - T12 國科會流程 → **金融科技**（維持 G0 決議）
  > ⚠️ G2 Review 修正（2026-04-12）：原記載 T10「教育主題」與 G0 決議衝突，已更正為金融科技。

---

## Agent 完整定義

### 1. research-director (L1) — 研究總監

| 欄位 | 值 |
|------|-----|
| id | `research-director` |
| name | 研究總監 |
| level | L1 |
| department | `academic-research` |
| reports_to | `["boss", "project-lead"]` |
| manages | `["literature-scout", "paper-writer", "research-analyst", "manuscript-reviewer", "research-visualizer", "grant-writer"]` |
| collaborates_with | `["product-manager", "tech-lead"]` |
| skills | `["hypothesis", "critical-thinking"]` |
| skills_sub | 所有下屬 Skills（統籌時可代呼叫） |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#research-director` |
| 負責流程 | 四條全流程統籌 + 最終審核 |

---

### 2. literature-scout (L2) — 文獻搜尋員

| 欄位 | 值 |
|------|-----|
| id | `literature-scout` |
| name | 文獻搜尋員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["paper-writer", "research-analyst", "grant-writer"]` |
| skills | `["lit-review", "cite-manage"]` |
| skills_sub | 外部 DB 查詢（PubMed / OpenAlex / bioRxiv via Perplexity） |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#literature-scout` |
| 負責流程 | 期刊 / 研討會 / 審稿 / 計畫（全部） |
| 領域關鍵字提示 | Sprint 4 預設金融科技（LLM / AI × Finance / FinTech / Risk / Investment）|

---

### 3. paper-writer (L2) — 論文撰寫員

| 欄位 | 值 |
|------|-----|
| id | `paper-writer` |
| name | 論文撰寫員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["literature-scout", "research-visualizer", "manuscript-reviewer"]` |
| skills | `["academic-writing", "venue-format"]` |
| skills_sub | `["cite-manage"]` |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#paper-writer` |
| 負責流程 | 期刊 / 研討會 |
| 硬性規則 | 最終稿禁止 bullet points，必須完整段落 |

---

### 4. research-analyst (L2) — 研究分析員

| 欄位 | 值 |
|------|-----|
| id | `research-analyst` |
| name | 研究分析員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["literature-scout", "paper-writer", "manuscript-reviewer", "grant-writer"]` |
| skills | `["stat-analysis", "critical-thinking", "scholar-eval"]` |
| skills_sub | `["hypothesis"]` |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#research-analyst` |
| 負責流程 | 期刊 / 審稿 / 計畫 |

---

### 5. manuscript-reviewer (L2) — 稿件審查員

| 欄位 | 值 |
|------|-----|
| id | `manuscript-reviewer` |
| name | 稿件審查員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["research-analyst", "literature-scout"]` |
| skills | `["peer-review", "critical-thinking"]` |
| skills_sub | `["scholar-eval"]` |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#manuscript-reviewer` |
| 負責流程 | 審稿（主）+ 內部審查（所有流程）|
| 產出格式 | 整體評分（Methodology / Novelty / Writing / Significance）+ Major/Minor + 建議決定 |

---

### 6. research-visualizer (L2) — 研究視覺化員

| 欄位 | 值 |
|------|-----|
| id | `research-visualizer` |
| name | 研究視覺化員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["paper-writer", "grant-writer"]` |
| skills | `["schematics", "research-slides", "research-poster"]` |
| skills_sub | — |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#research-visualizer` |
| 負責流程 | 研討會 / 期刊 / 計畫（並行產出圖表）|
| 產出類型 | 研究流程圖、結果圖、投影片（PPTX）、海報、甘特圖 |

---

### 7. grant-writer (L2) ⭐ — 計畫申請撰寫員（新增）

| 欄位 | 值 |
|------|-----|
| id | `grant-writer` |
| name | 計畫申請撰寫員 |
| level | L2 |
| department | `academic-research` |
| reports_to | `["research-director"]` |
| collaborates_with | `["literature-scout", "research-analyst", "research-visualizer", "manuscript-reviewer"]` |
| skills | `["nstc-grant", "grant-writing", "academic-writing"]` |
| skills_sub | `["cite-manage", "schematics"]` |
| system_prompt_ref | `.knowledge/academic/agent-prompts.md#grant-writer` |
| 負責流程 | **國科會計畫**（主）|
| 特殊權限 | **`nstc-grant` Skill 專屬使用者**（其他 Agent 一律禁用） |
| 硬性規則 | 所有產出需 research-director → **老闆親自 Review** |

---

## 部門指揮鏈圖

```
                    boss
                     │
              project-lead (L1)
                     │
              research-director (L1) ──── 協作: product-manager, tech-lead
                     │
         ┌───────────┼───────────────┬──────────────┐
         │           │               │              │
   literature-   paper-writer   research-     manuscript-
      scout                       analyst       reviewer
         │           │               │              │
         └───────────┼───────────────┴──────────────┤
                     │                              │
              research-visualizer            grant-writer ⭐
                                             (nstc-grant 專屬)
```

---

## 約束與不變量

1. **L2 不得跳過 research-director 直接向 boss 匯報**
2. **nstc-grant Skill 僅限 grant-writer 使用**
3. **academic-research Agent 不得呼叫其他部門 Skills**（禁止跨部門 Skill 借用）
4. **paper-writer 最終稿禁止 bullet points**（SKILL.md 強制規則）
5. **literature-scout 的 DOI 驗證率 < 90% 時，流程自動暫停**
