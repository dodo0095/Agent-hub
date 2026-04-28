# 開發計畫書: Sprint 4 — 學術論文寫作 Agent 部門（含國科會計畫）

> **撰寫者**: project-lead
> **日期**: 2026-04-11
> **專案**: AgentHub
> **Sprint 提案書**: [sprint4-proposal.md](./sprint4-proposal.md)
> **狀態**: ✅ Sprint 完成（G0~G4 全數通過，2026-04-16）

---

> 本文件在 G0 通過後由 L1 撰寫，依據提案書中勾選的步驟展開技術細節。
> G0 調整：E2E 測試題材由「資訊教育」改為「**金融科技**」。

## 1. 需求摘要

建立全新 `academic-research`（學術研究）部門，整合 13 個核心學術 Skills（含自建 `nstc-grant.md`），讓東吳大學資料科學系教授能透過 7 位專屬 Agent 完成四條學術工作流程：

1. **期刊投稿**（IMRAD 英文論文）
2. **研討會論文**（4-8 頁短篇 + 投影片）
3. **論文審稿**（結構化審稿意見）
4. **國科會計畫申請**（CM01~CM12 完整計畫書）

**測試題材**：金融科技 × AI/LLM（G0 決議）

### 確認的流程

需求 → 設計 → 實作 → G2 → 測試 → G3 → 文件 → G4

（跳過 G1 UI 圖稿、G5 部署、G6 發佈）

### 阻斷規則

- 架構設計通過前不得開始 Skills 整合
- G2（實作）通過前不得進行 E2E 測試
- nstc-grant Skill 未經老闆 Review 不得結束 Sprint

---

## 2. 技術方案

### 選定方案

**「複製 + 改名 + 綁定」三段式整合**，不直接符號連結或 git submodule：

1. **複製**: 從 `claude-scientific-skills/scientific-skills/{skill}/SKILL.md` 複製至 `.claude/commands/{new-name}.md`
2. **改名**: 依 `api-design.md` 第 1.3 節映射表改名（避免與既有指令衝突）
3. **綁定**: 在 `agent-roster.md` 將每位 Agent 明確綁定到可呼叫的 Skills

### 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|------|------|------|------|
| A: 複製 + 改名 + 綁定 | 完全獨立、可客製、不受上游變動影響 | 需手動同步未來更新 | ⚠️ 原選定，執行中改為 A' |
| A': **Wrapper 模式**（T8 G2 批准）| 50-80 行封裝，避免 8800+ 行 context 爆炸；系統已正確識別 14 Skills | 依賴 `claude-scientific-skills/` 路徑不變 | ✅ **實際採用**（2026-04-12 tech-lead 批准）|
| B: git submodule | 自動同步上游 | 跨平台麻煩（Windows）、綁定受限 | ❌ 排除 |
| C: 符號連結 | 即時同步 | Windows 需 admin、git 不支援 | ❌ 排除 |

> **Wrapper 模式注意事項**：若 `claude-scientific-skills/scientific-skills/` 目錄被移動，13 個 wrapper 需同步更新路徑。路徑依賴為已知風險，已接受。

### 關鍵設計決策

1. **每個 Agent 嚴格限制 Skills 清單**（見 `data-model.md` 第 2 節），避免 138 個 Skills 互相干擾
2. **`.outputs/` 目錄隔離產出物**，加入 `.gitignore`（防未發表論文外流）
3. **nstc-grant 視為獨立關鍵任務**，與其他 12 個 Skills 整合並行，降低依賴風險

---

## 3. UI 圖稿

> 本 Sprint 無 UI 變更，略過 G1 審核。

---

## 4. 檔案變更清單

### 新增

| 檔案 | 用途 |
|------|------|
| `.claude/commands/academic-writing.md` | 論文撰寫核心 Skill |
| `.claude/commands/lit-review.md` | 系統性文獻回顧 |
| `.claude/commands/cite-manage.md` | 引用管理 |
| `.claude/commands/stat-analysis.md` | 統計分析 |
| `.claude/commands/critical-thinking.md` | 批判性評估 |
| `.claude/commands/schematics.md` | 研究圖表製作 |
| `.claude/commands/venue-format.md` | 期刊/會議格式 |
| `.claude/commands/research-slides.md` | 研討會投影片 |
| `.claude/commands/research-poster.md` | 學術海報 |
| `.claude/commands/peer-review.md` | 論文審稿 |
| `.claude/commands/scholar-eval.md` | 研究者評估 |
| `.claude/commands/grant-writing.md` | NSF 框架（國際計畫參考） |
| `.claude/commands/hypothesis.md` | 假說生成 |
| `.knowledge/academic/sop-journal.md` | 期刊流程 SOP |
| `.knowledge/academic/sop-conference.md` | 研討會流程 SOP |
| `.knowledge/academic/sop-peer-review.md` | 審稿流程 SOP |
| `.knowledge/academic/sop-nstc-grant.md` | 國科會計畫流程 SOP |
| `.knowledge/specs/api-design.md` | Skill 命名規範（✅ 已建立）|
| `.knowledge/specs/data-model.md` | Agent-Skill 綁定（✅ 已建立）|
| `.knowledge/specs/feature-spec.md` | 功能規格（✅ 已建立）|
| `.outputs/` | 產出目錄（需加 .gitignore） |

### 修改

| 檔案 | 變更內容 |
|------|---------|
| `agents/agent-roster.md` | 新增 `academic-research` 部門 7 位 Agent |
| `.gitignore` | 新增 `.outputs/` 排除 |
| `.knowledge/academic/venue-list.md` | 補強金融科技類 venue 權重 |
| `CLAUDE.md` | 索引區新增 academic 文件連結 |

### 刪除

| 檔案 | 原因 |
|------|------|
| （無） | — |

### 已存在（Pre-G0 預產出，無需再建）

| 檔案 | 狀態 |
|------|------|
| `.claude/commands/nstc-grant.md` | ✅ 已存在（基於真實計畫書 115WFD0310041） |
| `.knowledge/academic/agent-prompts.md` | ✅ 已存在（7 位 Agent System Prompt 草稿） |
| `.knowledge/academic/venue-list.md` | ✅ 已存在（14 期刊 + 20 研討會，需補金融類） |

---

## 5. 規範文件索引

> 本 Sprint 相關規範文件（作為 Code Review 對規範比對基準）

| 檔案 | 內容 | 狀態 |
|------|------|------|
| `.knowledge/specs/api-design.md` | Skill 命名規範、frontmatter、產出格式、錯誤處理 | ✅ 已建立 |
| `.knowledge/specs/data-model.md` | Agent 階層、Agent-Skill 綁定表、狀態機、儲存模型 | ✅ 已建立 |
| `.knowledge/specs/feature-spec.md` | 功能模組 F1-F6、用戶流程、驗收標準 | ✅ 已建立 |

---

## 6. 任務定義與分配

> L1 讀取本節後按依賴順序執行。第一步先執行 `/task-delegation` 建立 `.tasks/sprint-4/` 檔案。

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 依賴 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|---------|---------|
| T1 | 部門架構設計 | 在 `agent-roster.md` 新增 `academic-research` 部門與 7 位 Agent 完整欄位 | project-lead | 無 | 設計 | 7 位 Agent 資料完整，含 reports_to / manages / skills |
| T2 | Agent Prompt 精煉 | 依 `agent-prompts.md` 草稿精煉 7 位 System Prompt，對齊 Agent-Skill 綁定表 | studio-producer | T1 | 設計 | 每位 Agent Prompt ≥ 200 字，明確列出可呼叫 Skills |
| T3 | 12 個既有 Skills 整合 | 複製 + 改名 + frontmatter 合規化 | tech-lead | T1 | 實作 | 12 個檔案皆通過 `api-design.md` 命名與 frontmatter 檢查 |
| T4 | `nstc-grant.md` 金融科技壓測 | 以金融題材跑一次 Skill，驗證領域通用性（現為資訊教育底稿）| grant-writer | T1 | 實作 | Skill 無需改寫亦能產出合格金融科技計畫書草稿；若不合格則列出需修改點 |
| T5 | venue-list 金融類補強 | 補 AJFS / ESWA / ACM ICAIF / IEEE ICDM 等金融 venue 權重 | paper-writer | T1 | 實作 | ≥ 5 期刊 + 3 研討會金融類標記 |
| T6 | 四條 SOP 文件撰寫 | 產出 sop-journal / sop-conference / sop-peer-review / sop-nstc-grant | paper-writer | T3 | 文件 | 每份 SOP 含步驟圖 + 決策判斷樹 + fallback |
| T7 | `.outputs/` + `.gitignore` | 建立產出目錄並加入 gitignore | tech-lead | 無 | 實作 | `.outputs/` 存在且 `git check-ignore .outputs/test` 成功 |
| T8 | 內部 Review（G2）| tech-lead 對 T1~T7 做 Code Review | tech-lead | T1-T7 | G2 | 通過 `/review` → `/pm-review` |
| T9 | E2E 期刊流程測試 | 金融科技主題跑完整期刊流程，交付 IMRAD 初稿 | research-director | T8 | 測試 | 驗收條件見 feature-spec.md §4.2 |
| T10 | E2E 研討會流程測試 | 同主題產 ACM ICAIF 或 IEEE ICDM 論文 + 投影片 | research-director | T8 | 測試 | 驗收條件見 feature-spec.md §4.3 |
| T11 | E2E 審稿流程測試 | 上傳一篇 AI 論文 PDF，產出審稿報告 | manuscript-reviewer | T8 | 測試 | 驗收條件見 feature-spec.md §4.4 |
| T12 | E2E 國科會流程測試 | 金融科技主題產國科會一般型計畫書草稿 | grant-writer | T4, T8 | 測試 | 驗收條件見 feature-spec.md §4.5；**老闆親自 Review** |
| T13 | G3 測試驗收 | 4 條 E2E 全通過後提交 G3 Gate | project-lead | T9-T12 | G3 | `/pm-review` 通過 |
| T14 | CLAUDE.md 索引更新 + G4 | 更新文件索引、academic/ 區塊，送 G4 | project-shipper | T6 | 文件 | G4 通過 |

### 依賴圖

```
T1 ─┬─ T2 (Prompt)
    ├─ T3 (Skills 整合) ─┬─ T6 (SOP 文件) ──── T14 (文件 G4)
    ├─ T4 (nstc 壓測) ───┤
    └─ T5 (venue 補強) ──┤
                         └─ T8 (G2 Review) ─┬─ T9 (E2E 期刊)
T7 (outputs 目錄) ───────────────────────────┤─ T10 (E2E 研討會)
                                            ├─ T11 (E2E 審稿)
                                            └─ T12 (E2E 國科會) ─ T13 (G3)
```

### L1 執行指令

```
請執行 Sprint 4 學術論文寫作 Agent 部門開發計畫。

📄 計畫書：proposal/sprint4-dev-plan.md
📋 你（project-lead）負責的任務：T1, T13（第 6 節）
🎨 委派 studio-producer：T2（Agent Prompt 精煉）
🔧 委派 tech-lead：T3, T7, T8（Skills 整合 + outputs + G2 Review）
📝 委派 paper-writer：T5, T6（venue 補強 + 四條 SOP）
💰 委派 grant-writer：T4, T12（nstc 金融壓測 + E2E 國科會）
🧪 委派 research-director：T9, T10（E2E 期刊 + 研討會）
🔍 委派 manuscript-reviewer：T11（E2E 審稿）
📚 委派 project-shipper：T14（文件更新 + G4）

⚠️ 阻斷規則：
  - T3 必須等 T1 完成（架構設計通過）
  - T9~T12 必須等 T8 通過（G2 Review）
  - T12 必須等 T4 完成（nstc 壓測先確認 Skill 可用）
  - nstc-grant 最終產出須老闆親自 Review

第一步請先執行 /task-delegation 建立任務檔案。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `agents/agent-roster.md` | T1 | 高（所有後續任務依賴）|
| `.knowledge/academic/agent-prompts.md` | T1, T2 | 中 |
| `.knowledge/academic/venue-list.md` | T5 | 低 |
| `.claude/commands/nstc-grant.md` | T4, T12 | 高（核心驗收物）|

---

## 7. 測試計畫

### 單元測試

| 測試檔案 | 測試案例 |
|---------|---------|
| `tests/skills/frontmatter.test.ts` | 13 個 Skill 檔案 frontmatter 合規驗證 |
| `tests/agents/binding.test.ts` | Agent-Skill 綁定表與 agent-roster.md 一致性 |
| `tests/outputs/gitignore.test.ts` | `.outputs/` 確認被 gitignore |

### E2E 測試

| 測試檔案 | 測試案例 |
|---------|---------|
| `e2e/academic/journal-flow.spec.ts` | 金融科技主題跑完期刊流程，檢查 IMRAD 結構與 DOI 驗證率 |
| `e2e/academic/conference-flow.spec.ts` | 研討會論文 + 投影片產出 |
| `e2e/academic/peer-review-flow.spec.ts` | PDF 上傳 → 審稿報告 |
| `e2e/academic/nstc-grant-flow.spec.ts` | 金融科技 → 國科會一般型計畫書 → **待老闆 Review** |

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| `nstc-grant.md` 底稿為資訊教育，金融題材可能不適用 | 高 | T4 壓測先行，發現問題立即列待改點；Skill 設計為「原則框架」而非「死板模板」 |
| 13 個 Skills frontmatter 與 AgentHub 骨架衝突 | 中 | T3 整合前 dry-run 格式對照，必要時局部改寫（不改上游） |
| Agent-Skill 綁定過嚴導致 Agent 無法完成任務 | 中 | T8 Code Review 檢查綁定表完整性；不足時回補副 Skills |
| 金融文獻 DOI 驗證率 < 100% | 中 | 允許標記 `[UNVERIFIED]`，但最終交付前需人工補齊 |
| E2E 時間超標（> 30 分鐘單次） | 低 | 平行化 literature-scout 與 research-visualizer |
| 老闆 Day 5 無法 Review `nstc-grant` 金融產出 | 高 | 預告 Day 5 時段；若延後則 Sprint 4 結束延後，不強行 G3 過關 |

---

## 9. 文件更新

完成後需同步更新：

- [x] `CLAUDE.md` 索引區新增 `.knowledge/academic/` 連結
- [x] `.knowledge/project-overview.md` 技術棧新增「學術類 Skills」章節
- [x] `.knowledge/architecture.md` 補 `academic-research` 部門至服務清單
- [x] `.knowledge/team-hierarchy.md` 補 7 位 Agent 階層
- [x] `agents/agent-roster.md` 新增部門
- [x] `.gitignore` 新增 `.outputs/`

---

## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | 2026-04-11 | 🔧 需修正 | 待 T8 G2 Review；已產出 agent-roster.md + department-structure.md |
| T2 | 2026-04-11 | 🔧 需修正 | Prompt 加全域 preamble + 7 位 Skills 綁定區塊 + 三主軸關鍵字 |
| T3 | 2026-04-11 | 🔧 需修正 | 14 個 Skills 以 wrapper 模式整合，系統已自動識別；待 T8 G2 確認策略 |
| T4 | 2026-04-11 | 🔧 需修正 | 結論 Skill 可用 ✅；壓測產出 1000+ 字金融題材草稿 + 3 處選配補強點 |
| T5 | 2026-04-11 | 🔧 需修正 | venue-list 補金融 4 期刊 + 7 研討會，加入老闆投稿紀錄與三主軸決策邏輯 |
| T6 | 2026-04-11 | 🔧 需修正 | 四份 SOP 完成（sop-journal / sop-conference / sop-peer-review / sop-nstc-grant）；含 Mermaid 圖 + Agent 分工 + 判斷樹 + fallback + 金融/教育/AI 三範例 |
| T7 | 2026-04-11 | 🔧 需修正 | 待 T8 G2 Review；`.outputs/` + `.gitignore` + README 已建立 |
| T8 | 2026-04-12 | ✅ 完成 | G2 Review 通過 + PM 審核通過 + Gate 紀錄寫入 |
| T9 | 2026-04-12 | ✅ 完成 | IMRAD 完整草稿 + 18 篇引用 + 4 張圖；DOI 88.9%（2 篇 UNVERIFIED）|
| T10 | 2026-04-12 | ✅ 完成 | ACM ICAIF 格式 6 頁論文 + 12 頁 Marp 投影片 |
| T11 | 2026-04-12 | ✅ 完成 | 審稿報告含 4 Major + 5 Minor + 評分 + 建議 Major Revision |
| T12 | 2026-04-16 | ✅ 完成 | CM03~CM06 全部完成；研究問題（RQ1~RQ4）+ 成效評估三層次補強；老闆親自 Review 通過 |
| T13 | 2026-04-16 | ✅ 完成 | 四條 E2E 全通過（T9 期刊 / T10 研討會 / T11 審稿 / T12 國科會）；G3 正式關閉 |
| T14 | 2026-04-16 | ✅ 完成 | CLAUDE.md / project-overview / architecture / team-hierarchy 四份文件索引更新；G4 通過 |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| 設計 Review | 2026-04-12 | 通過 | Blocker:0 Major:0 Minor:1（agent-roster 兩檔分離設計已記錄）|
| 實作 Review（T3/T7）| 2026-04-12 | 通過 | Blocker:0 Major:1 Minor:1 — Wrapper 策略已批准，nstc-grant frontmatter 已修正 |
| 功能 Review（T4）| 2026-04-12 | 通過 | Blocker:0 Major:0 Minor:0 — nstc-grant 壓測通過，Skill 可用 |
| 橫向 G2 Review（T1-T7）| 2026-04-12 | 通過 | Blocker:1→修正 Major:2→修正 Minor:3 — 修正後通過；主要問題：T10 題材矛盾已更正，nstc-grant frontmatter 已統一格式，Wrapper 策略已書面批准 |
| 測試 Review（T4 功能）| 2026-04-16 | 通過 | Blocker:0 Major:0 Minor:0 — nstc-grant 壓測報告完整，90% 可用，3 處補強點清楚 |
| 文件 Review（T5/T6）| 2026-04-16 | 通過 | Blocker:0 Major:0 Minor:0 — venue-list 7 期刊 + 5 研討會金融類、4 份 SOP 含 Mermaid + 決策樹 + Fallback |
| 實作 Review（T7）| 2026-04-16 | 通過 | Blocker:0 Major:0 Minor:0 — .gitignore 確認、.outputs/ 三子目錄存在 |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-04-11 | ⚠️ 附條件通過 | 測試題材改金融科技；nstc-grant 由老闆親自 Review |
| G2 | 2026-04-12 | ✅ 通過 | PM 審核 6 項 checklist 全過：14 Skills 齊全、Agent-Skill 綁定一致、.outputs/ gitignore 驗證通過、Blocker 清零、Wrapper 策略已書面批准；建議核准 |
| G3 | 2026-04-16 | ✅ 通過 | 四條 E2E 全通過（期刊 IMRAD 18篇引用 / 研討會 ACM ICAIF 6頁+投影片 / 審稿報告 4 Major+5 Minor / 國科會計畫書 CM03~CM06）；老闆親自 Review nstc-grant 通過；硬性條件解除 |
| G4 | 2026-04-16 | ✅ 通過 | CLAUDE.md / project-overview / architecture / team-hierarchy 四份文件索引更新完成，與實際檔案一致，G4 通過 |

---

**確認**: [x] L1 確認 / [x] Tech Lead 確認 / [x] 老闆 Review（2026-04-16）
