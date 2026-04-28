# Sprint 提案書: Sprint 4 — 學術論文寫作 Agent 部門（含國科會計畫）

> **提案人**: project-lead + boss
> **日期**: 2026-04-11
> **專案**: AgentHub
> **狀態**: ⚠️ G0 附條件通過（2026-04-11）

---

## 1. 目標

建立全新 **`academic-research`（學術研究）部門**，整合 `claude-scientific-skills` 核心技能 + **自建 `nstc-grant` Skill**，讓東吳大學資料科學系教授（AI/資訊教育/金融科技領域）能透過 7 位專屬 Agent 完整執行四條學術工作流程：

| 工作流程 | 主要產出 | 目標 Venue |
|---------|---------|-----------|
| **期刊投稿** | IMRAD 英文論文稿件 | C&E / IEEE TLT / AJFS / SSCI 系列 |
| **研討會論文** | 4~12頁短篇論文 + 投影片 | AIED / ICCE / SIGCSE / NeurIPS / ICML |
| **論文審稿** | 結構化審稿意見報告 | IEEE / ACM / Elsevier 任意稿件 |
| **國科會計畫** | CM03 完整計畫書（30頁內）+ 預算表 | 一般型（主）/ 產學合作（次）|

---

## 2. 範圍定義

### 做

| # | 功能/任務 | 優先級 | 說明 |
|---|----------|--------|------|
| 1 | 建立 `academic-research` 部門 + 7 位 Agent 設定 | P0 | 新增至 `agent-roster.md`，含 1 L1 + 6 L2（新增 grant-writer） |
| 2 | 整合 13 個核心 Skills 至 `.claude/commands/` | P0 | 含 SKILL.md 複製與命名規範調整（新增 research-grants） |
| 3 | 四條工作流程文件（期刊 / 研討會 / 審稿 / **國科會計畫**） | P0 | `.knowledge/academic/` 目錄，含 SOP + 流程圖 |
| 4 | **自建 `nstc-grant.md` 擴充 Skill**（國科會專用） | P0 | 庫中無此 Skill，需自行撰寫（見下方說明） |
| 5 | AI/ML 領域專用 Venue 清單 | P1 | NeurIPS/ICML/CVPR/ICLR/CHI 等格式規範整理 |
| 6 | Agent 提示詞設計（System Prompt 草稿） | P1 | 每位 Agent 的角色定義與技能綁定 |
| 7 | E2E 測試：跑一篇 AI 論文完整流程 + 國科會計畫摘要 | P1 | 以「金融科技 × LLM / AI 應用」為測試題材（G0 調整） |

### 不做（明確排除）

- 不整合生物醫學、化學、物理等非目標領域的 Skills（138 個只取相關的 ~20 個）
- 不實作 Python 套件技能（scikit-learn / PyTorch 等需要環境安裝的 Skills）
- 不做論文 PDF 排版引擎（LaTeX 編譯環境複雜，WSL2 待後續 Sprint）
- 不串接外部 API 金鑰（PubMed / OpenAlex 免費層已足夠測試）
- 不修改現有 6 個部門的任何 Agent 設定
- 不做國科會線上系統（iRePS）的自動填表（格式每年變動，人工填寫較安全）

---

## 3. 流程決策（G0 核心產出）

> **本區由老闆在 G0 審核時勾選確認，決定後續要走哪些步驟和關卡。**

### 步驟勾選

| 勾選 | 步驟 | 說明 | 對應關卡 | 備註 |
|------|------|------|---------|------|
| [x] | 需求分析 | 需求文件、任務拆解 | G0（本文件） | 必選 |
| [x] | 設計 | 部門架構 + Agent 角色設計 | — | 新部門需架構設計 |
| [ ] | UI 圖稿 | HTML mockup | G1: 圖稿審核 | 本 Sprint 無新 UI |
| [x] | 實作 | Skills 整合 + Agent 設定 + 文件建立 | G2: 程式碼審查 | 核心工作 |
| [x] | 測試 | E2E 論文流程測試 | G3: 測試驗收 | 以真實任務驗證 |
| [x] | 文件 | 工作流程文件 + Agent Prompt | G4: 文件審查 | 知識庫更新 |
| [ ] | 部署 | 環境配置、CI/CD | G5: 部署就緒 | 本 Sprint 不上線 |
| [ ] | 發佈 | 正式對外發佈 | G6: 正式發佈 | 本 Sprint 不發佈 |

### 阻斷規則

- [x] 架構設計通過前不得開始 Skills 整合（避免目錄結構反覆修改）
- [x] G2（實作）通過前不得進行 E2E 測試
- [ ] G1（圖稿）通過前不得開始實作（本 Sprint 無 UI，不適用）

### 額外步驟

| 勾選 | 步驟名稱 | 說明 | 審核方式 |
|------|---------|------|---------|
| [x] | 技能分類驗證 | 確認 13 個 Skills 正確對應四條工作流程 | L1 自審（tech-lead 參與） |
| [x] | nstc-grant Skill 撰寫 | 自建國科會專用 Skill（庫中無此內容） | research-director 草稿 + 老闆確認 |
| [ ] | LaTeX 環境建置 | Windows 安裝 MiKTeX / WSL2 | 後續 Sprint |

---

## 4. 部門架構設計

### 新增部門：`academic-research`（學術研究部）

```
academic-research 部門
│
├── research-director (L1) ── 研究總監
│   匯報給：boss / project-lead
│   協作：product-manager, tech-lead
│
├── literature-scout (L2) ── 文獻搜尋員
├── paper-writer (L2) ── 論文撰寫員
├── research-analyst (L2) ── 研究分析員
├── manuscript-reviewer (L2) ── 稿件審查員
├── research-visualizer (L2) ── 研究視覺化員
└── grant-writer (L2) ── 計畫申請撰寫員  ← 新增（國科會專用）
```

### Agent 技能綁定規劃

| Agent | 主要 Skills | 對應工作流程 |
|-------|------------|-------------|
| `research-director` | scientific-brainstorming, hypothesis-generation | 全流程統籌 |
| `literature-scout` | literature-review, pubmed-database, openalex-database, biorxiv-database, perplexity-search, research-lookup | 期刊/研討會/審稿/計畫 |
| `paper-writer` | scientific-writing, citation-management, venue-templates | 期刊/研討會 |
| `research-analyst` | statistical-analysis, scientific-critical-thinking, scholar-evaluation | 期刊/審稿/計畫 |
| `manuscript-reviewer` | peer-review, scientific-critical-thinking | 審稿 |
| `research-visualizer` | scientific-schematics, scientific-slides, pptx-posters | 研討會/期刊/計畫 |
| `grant-writer` | **nstc-grant**（自建）, research-grants（NSF 框架參考）, scientific-writing | **國科會計畫** |

---

## 5. 三條工作流程定義

### 流程 A：期刊投稿（Journal Submission）

```
老闆：「幫我寫一篇 [主題] 期刊論文，投 [目標期刊]」
    ↓
research-director：確認研究問題 + 假說生成
    ↓
literature-scout：PubMed/OpenAlex 系統性文獻搜尋
    ↓
research-analyst：統計分析 + 文獻批判評估
    ↓
paper-writer：IMRAD 結構撰寫（初稿）
    ↑──── 同步進行 ────↑
research-visualizer：圖表製作（研究流程圖 + 結果視覺化）
    ↓
manuscript-reviewer：內部 Peer Review
    ↓
paper-writer：修訂稿件 + venue-templates 套用期刊格式
    ↓
research-director：最終審核 → 交付老闆
```

**支援期刊類型**: IEEE Transactions、ACM Digital Library、Computers & Education、
Journal of AI Research、Expert Systems with Applications 等

---

### 流程 B：研討會論文（Conference Paper）

```
老闆：「幫我寫一篇 [主題] 研討會論文，投 [目標會議]」
    ↓
research-director：確認研究貢獻點 + 目標 venue 要求
    ↓
literature-scout：相關論文搜尋（強調近 2 年最新研究）
    ↓
paper-writer：撰寫 4~8 頁短篇論文（venue-templates 套用格式）
    ↑──── 同步進行 ────↑
research-visualizer：製作海報 / 投影片（scientific-slides）
    ↓
manuscript-reviewer：快速 Review（研討會周期較短）
    ↓
research-director：最終審核 → 交付老闆
```

**支援會議**: NeurIPS、ICML、CVPR、ICLR（AI/ML）、
CHI（HCI）、SIGCSE（資訊教育）、CIKM（數據分析）等

---

### 流程 C：論文審稿（Peer Review）

```
老闆：「幫我審這篇論文 [上傳 PDF]」
    ↓
manuscript-reviewer：全文結構分析 + 方法論評估
    ↓
research-analyst：統計方法驗證 + 結果可重現性評估
    ↓
literature-scout：驗證文獻引用正確性 + 查漏引重要相關研究
    ↓
manuscript-reviewer：產出審稿意見（Major/Minor Revisions）
    ↓
research-director：整合意見 → 交付老闆
```

**產出格式**:
- 整體評分（Methodology / Novelty / Writing / Significance）
- Major Revision 清單
- Minor Revision 清單
- 建議決定：Accept / Minor Revision / Major Revision / Reject

---

### 流程 D：國科會計畫申請（NSTC Grant Proposal）

> ⚠️ **重要發現**：`claude-scientific-skills` 庫中的 `research-grants` 技能**只涵蓋美國機構**（NSF / NIH / DOE / DARPA），**完全沒有國科會（NSTC）相關格式與規範**。因此本 Sprint 需要**自行撰寫** `nstc-grant.md` 客製化 Skill。

**NSF（美國）vs 國科會（台灣）結構對照：**

| 面向 | NSF（庫中已有） | 國科會（需自建） |
|------|----------------|-----------------|
| 英文名稱 | National Science Foundation | National Science and Technology Council |
| 計畫類型 | Standard / CAREER / RAPID | 一般型 / 優秀年輕學者 / 產學合作 |
| 摘要格式 | Project Summary (1頁) | 中英文摘要（各 300-500 字） |
| 核心章節 | Intellectual Merit + Broader Impacts | 研究目的 + 文獻探討 + 研究方法 + 預期成果 |
| 審查標準 | Scientific Merit + Broader Impact | 創新性 + 重要性 + 可行性 + 影響力 |
| 經費格式 | Modular Budget | 經費需求表（人事費/業務費/設備費） |
| 頁數限制 | 15 頁 | 依計畫類型（一般型通常 10-25 頁） |
| 語言 | 英文 | **中文為主**（部分章節需英文摘要） |
| 提交系統 | Grants.gov / FastLane | **iRePS**（國科會線上申辦系統） |

```
老闆：「幫我寫國科會一般型計畫，主題：[主題]，計畫年限：2年」
    ↓
grant-writer：載入 nstc-grant.md Skill → 確認計畫類型與格式要求
    ↓
literature-scout：搜尋國內外相關研究（強調近 3 年 + 台灣研究現況）
    ↓
research-analyst：界定研究缺口 + 建立研究假說
    ↓
grant-writer：撰寫核心章節
    ├── 計畫中文摘要（300字）
    ├── 計畫英文摘要（300字）
    ├── 研究目的與重要性
    ├── 文獻探討
    ├── 研究方法與步驟
    ├── 預期成果與貢獻
    └── 研究時程（甘特圖）
    ↑──── 同步進行 ────↑
research-visualizer：研究架構圖 + 研究流程圖 + 甘特圖
    ↓
manuscript-reviewer：計畫書審查（學術邏輯 + 格式合規）
    ↓
grant-writer：修訂 → 產出最終版計畫書
    ↓
research-director：最終審核 → 交付老闆（人工填入 iRePS）
```

**支援計畫類型**:
- **一般型研究計畫**：2~3 年，個人申請，最常用
- **優秀年輕學者研究計畫**：針對早期職涯研究者
- **產學合作研究計畫**：需有合作企業
- **多年期研究計畫**：3 年以上整合型計畫

**不支援（本 Sprint 排除）**：
- 國際合作計畫（格式特殊，後續再做）
- 補助國際差旅費申請表（行政表單，超出範疇）
- iRePS 系統自動填表（每年格式變動，人工填入較安全）

---

## 6. 整合 Skills 清單（13 個核心技能）

### 期刊投稿用（6 個）

| Skill | 來源路徑 | 目標路徑 | 用途 |
|-------|---------|---------|------|
| `scientific-writing` | `claude-scientific-skills/scientific-skills/scientific-writing/SKILL.md` | `.claude/commands/academic-writing.md` | 論文撰寫核心 |
| `literature-review` | `claude-scientific-skills/scientific-skills/literature-review/SKILL.md` | `.claude/commands/lit-review.md` | 系統性文獻回顧 |
| `citation-management` | `claude-scientific-skills/scientific-skills/citation-management/SKILL.md` | `.claude/commands/cite-manage.md` | 引用管理 |
| `statistical-analysis` | `claude-scientific-skills/scientific-skills/statistical-analysis/SKILL.md` | `.claude/commands/stat-analysis.md` | 統計分析 |
| `scientific-critical-thinking` | `claude-scientific-skills/scientific-skills/scientific-critical-thinking/SKILL.md` | `.claude/commands/critical-thinking.md` | 批判性評估 |
| `scientific-schematics` | `claude-scientific-skills/scientific-skills/scientific-schematics/SKILL.md` | `.claude/commands/schematics.md` | 研究圖表製作 |

### 研討會用（3 個）

| Skill | 來源路徑 | 目標路徑 | 用途 |
|-------|---------|---------|------|
| `venue-templates` | `claude-scientific-skills/scientific-skills/venue-templates/SKILL.md` | `.claude/commands/venue-format.md` | 期刊/會議格式 |
| `scientific-slides` | `claude-scientific-skills/scientific-skills/scientific-slides/SKILL.md` | `.claude/commands/research-slides.md` | 研討會投影片 |
| `pptx-posters` | `claude-scientific-skills/scientific-skills/pptx-posters/SKILL.md` | `.claude/commands/research-poster.md` | 學術海報 |

### 審稿用（2 個）

| Skill | 來源路徑 | 目標路徑 | 用途 |
|-------|---------|---------|------|
| `peer-review` | `claude-scientific-skills/scientific-skills/peer-review/SKILL.md` | `.claude/commands/peer-review.md` | 論文審稿 |
| `scholar-evaluation` | `claude-scientific-skills/scientific-skills/scholar-evaluation/SKILL.md` | `.claude/commands/scholar-eval.md` | 研究者/論文評估 |

### 國科會計畫用（2 個）

| Skill | 來源路徑 | 目標路徑 | 用途 |
|-------|---------|---------|------|
| `research-grants` | `claude-scientific-skills/scientific-skills/research-grants/SKILL.md` | `.claude/commands/grant-writing.md` | NSF框架參考（預算結構、審查邏輯） |
| `nstc-grant` ⭐ **自建** | **不存在於庫中，需新建** | `.claude/commands/nstc-grant.md` | 國科會專用格式、章節規範、審查標準 |

### 共用工具（1 個）

| Skill | 來源路徑 | 目標路徑 | 用途 |
|-------|---------|---------|------|
| `hypothesis-generation` | `claude-scientific-skills/scientific-skills/hypothesis-generation/SKILL.md` | `.claude/commands/hypothesis.md` | 假說生成 |

---

## 7. 團隊分配

| 角色 | Agent | 負責範圍 |
|------|-------|---------|
| PM | product-manager | 需求確認、驗收標準制定 |
| L1 領導（專案） | project-lead | 整體規劃、進度追蹤、G0~G4 回報 |
| L1 領導（學術） | research-director（新） | 部門架構設計、Agent Prompt 草稿、E2E 測試 |
| L2 實作 | tech-lead | Skills 整合、`.claude/commands/` 目錄建立 |
| L2 實作 | paper-writer（新） | 工作流程文件撰寫（`.knowledge/academic/`） |
| L2 實作 | grant-writer（新） | **nstc-grant.md 自建 Skill 撰寫**（最關鍵任務） |
| L2 測試 | manuscript-reviewer（新） | 審稿 + 國科會計畫書審查 E2E 驗證 |

---

## 8. 風險評估

| 風險 | 可能性 | 影響 | 緩解措施 |
|------|--------|------|---------|
| SKILL.md 格式與 AgentHub 命名骨架衝突 | 中 | 中 | 整合前先 dry-run 格式對照，必要時局部改寫 |
| venue-templates 缺少台灣在地研討會格式 | 高 | 低 | 補充 TAAI、ICCE 等台灣/亞洲 AI/教育會議格式 |
| 文獻 DOI 驗證需要網路連線 | 低 | 中 | 離線 fallback：標記待驗證，不阻擋流程 |
| research-director Prompt 設計迭代多 | 中 | 低 | Sprint 4 產出草稿，Sprint 5 再精煉 |
| 138 個 Skills 中有重複功能導致 Agent 混淆 | 中 | 中 | 嚴格限制每個 Agent 只能呼叫指定 Skills |
| **nstc-grant.md 自建品質不夠** | 高 | 高 | 需老闆（真實申請者）審閱確認格式正確性後才能 GA |
| **國科會格式每年微調（iRePS 變動）** | 中 | 中 | Skill 設計為「原則框架」而非「死板模板」，減少格式耦合 |

---

## 9. 失敗模式分析

| 失敗場景 | 可能性 | 影響 | 偵測方式 | 緩解措施 |
|---------|--------|------|---------|---------|
| paper-writer 產出有子彈點而非完整段落 | 高 | 高 | Review 時人工檢查 | SKILL.md 已明確規定「禁止 bullet points in final manuscript」|
| literature-scout 搜到不相關領域文獻 | 中 | 中 | E2E 測試驗收 | Prompt 明確指定 AI/ML/FinTech 領域關鍵字（含金融風險、智慧投資、LLM 金融應用）|
| 幻覺引用（AI 捏造文獻） | 中 | 高 | cite-check 步驟強制驗證 DOI | `citation-management` 的 verify_citations.py 強制執行 |
| venue-templates 格式與期刊最新要求不符 | 中 | 低 | 對照官方投稿指南 | research-director 負責最終格式確認 |
| 三條流程互相干擾（設計不清） | 低 | 高 | G0 審核時明確確認觸發條件 | 工作流程文件加入「判斷樹」|

---

## 10. 可觀測性

> 壞了怎麼知道？

- **日誌策略**: 每個 Agent 的任務開始/完成記錄於 `.tasks/`，每篇論文建立獨立任務追蹤
- **關鍵指標**: 論文初稿字數、文獻引用數量、DOI 驗證通過率
- **告警規則**: 引用驗證失敗率 > 10% 時，literature-scout 需重新搜尋；段落品質 (bullet points 殘留) 觸發 paper-writer 重寫

---

## 11. Rollback 計畫

| 項目 | 說明 |
|------|------|
| 程式碼回滾 | `.claude/commands/` 新增檔案為純新增，刪除即可回滾，不影響現有功能 |
| 部門回滾 | `agent-roster.md` 中移除 `academic-research` 部門 6 行 |
| 判斷標準 | E2E 測試中 3 個流程有 2 個以上失敗，或 paper-writer 連續 2 次產出 bullet points |
| 負責人 | project-lead 決策，tech-lead 執行 |

---

## 12. 驗收標準

### 結構驗收

- [ ] `agent-roster.md` 新增 `academic-research` 部門，含 7 個 Agent（1 L1 + 6 L2，包含 grant-writer）
- [ ] `.claude/commands/` 新增 13 個 academic Skills 指令（含自建 `nstc-grant.md`）
- [ ] `.knowledge/academic/` 目錄建立，含**四條**流程 SOP 文件

### 功能驗收（期刊流程）

- [ ] 以「LLM 在金融科技的應用」為題（例：智慧投資決策 / 金融風險評估 / 文本情感分析應用於市場預測），完整走完期刊投稿流程
- [ ] 產出 IMRAD 結構初稿，無 bullet points 殘留
- [ ] 引用 10 筆以上文獻，DOI 驗證通過率 100%
- [ ] 目標期刊：**AJFS**（Asia-Pacific Journal of Financial Studies）或 **Expert Systems with Applications**（金融 AI 應用）

### 功能驗收（研討會流程）

- [ ] 以同一金融科技主題產出 **ACM ICAIF**（AI in Finance）或 **IEEE ICDM**（數據挖掘 × 金融）格式論文
- [ ] 研討會投影片（scientific-slides）成功產出

### 功能驗收（審稿流程）

- [ ] 上傳一篇 AI 相關論文 PDF，產出包含 Major/Minor 意見的審稿報告
- [ ] 審稿報告含整體評分 + 建議決定

### 功能驗收（國科會計畫流程）

- [ ] 以「AI / LLM 應用於金融科技」為主題（例：金融風險評估、智慧投資、ESG 投資決策），grant-writer 成功產出一般型計畫書草稿
- [ ] 包含：中英文摘要、研究目的、文獻探討、研究方法、預期成果、研究時程
- [ ] 研究時程甘特圖由 research-visualizer 產出
- [ ] **老闆確認格式與內容符合實際國科會申請需求**（此驗收由老闆親自確認）

### 品質驗收

- [ ] G2 程式碼審查通過（tech-lead Review）
- [ ] G3 測試驗收通過（**四條**流程 E2E 全數通過）
- [ ] G4 文件審查通過（`.knowledge/academic/` 文件完整度）
- [ ] `nstc-grant.md` 自建 Skill 經老闆確認格式正確（**必要條件**）

---

## 13. Sprint 時程規劃

| 日 | 任務 | Agent |
|----|------|-------|
| Day 1 | G0 審核 → 架構設計 → 7 位 Agent Prompt 草稿 | project-lead + tech-lead |
| Day 2 | 12 個既有 Skills 整合至 `.claude/commands/` | tech-lead |
| Day 2 | **`nstc-grant.md` 自建 Skill 撰寫**（並行） | grant-writer（新） |
| Day 3 | `.knowledge/academic/` 四條流程 SOP 文件 | paper-writer（新） |
| Day 4 | E2E 測試：期刊流程 + 研討會流程 | research-director（新） |
| Day 5 | E2E 測試：審稿流程 + **國科會計畫流程** + G2/G3/G4 Review | manuscript-reviewer + grant-writer |

---

---

## 14. 已完成的設計產出（Sprint 4 啟動前預產出）

> 以下文件已在 G0 審核前產出，Sprint 啟動後直接使用：

| 文件 | 路徑 | 狀態 |
|------|------|------|
| 國科會專用 Skill | `.claude/commands/nstc-grant.md` | ✅ 已完成（基於真實計畫書 115WFD0310041）|
| 7 位 Agent System Prompts | `.knowledge/academic/agent-prompts.md` | ✅ 已完成 |
| 目標 Venue 清單 | `.knowledge/academic/venue-list.md` | ✅ 已完成（14個期刊 + 20個研討會）|
| research-grants Skill | `.claude/commands/grant-writing.md` | 🔲 待複製（Sprint Day 2）|
| 期刊/研討會/審稿 SOP | `.knowledge/academic/sop-*.md` | 🔲 待建立（Sprint Day 3）|

### 國科會 Skill 的真實依據

本 `nstc-grant.md` Skill 基於以下真實資料建立：
- **來源計畫書**：115WFD0310041（東吳大學資料科學系，邱嘉豪助理教授）
- **計畫類型**：新進人員研究計畫，個別型，1年期
- **核心領域**：資訊教育（HSS03-6），AI行為資料平台
- **完整包含**：CM01~CM12 格式規範、預算結構、IRB要求、審查標準

---

**G0 審核結果**

**老闆決策**: [ ] 通過 / [x] 調整後通過 / [ ] 擱置

**審核日期**: 2026-04-11

**審核意見**:
1. E2E 測試題材由「資訊教育」**改為「金融科技」**（智慧投資 / 金融風險 / ESG 投資決策）
2. 目標期刊調整：AJFS / Expert Systems with Applications
3. 目標研討會調整：ACM ICAIF / IEEE ICDM
4. `nstc-grant.md` 自建 Skill 驗收：**老闆親自 Review**（Day 5 交付後）
5. 其餘範圍、時程、部門架構維持不變

**確認的流程**: 需求 → 設計 → 實作 → G2 → 測試 → G3 → 文件 → G4

**後續行動**（project-lead 執行）:
- [x] 更新提案書第 2/9/12 節（測試題材改金融科技）
- [ ] 執行 `/dev-plan` 產出 `sprint4-dev-plan.md`
- [ ] 在 dev-plan 第 10 節記錄 G0 附條件通過
- [ ] 通知 research-director / tech-lead / product-manager 準備 Day 1 啟動
