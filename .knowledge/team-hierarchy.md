# 團隊架構與指揮鏈

> **版本**: v1.0
> **最後更新**: 2026-03-25

---

## 團隊管理架構

```
老闆（最終決策者）
├── product-manager (PM) — L1
│   ├── feedback-synthesizer — L2
│   ├── sprint-prioritizer — L2
│   └── trend-researcher — L2
├── tech-lead — L1
│   ├── frontend-developer — L2
│   ├── backend-architect — L2
│   └── ai-engineer — L2
├── design-director — L1
│   ├── ui-designer — L2
│   └── ux-researcher — L2
├── qa-lead — L1
│   └── test-writer-fixer — L2
├── research-director — L1（學術研究部門，Sprint 4 新增）
│   ├── paper-writer — L2（期刊/研討會論文）
│   ├── grant-writer — L2（國科會計畫申請）
│   ├── manuscript-reviewer — L2（論文審稿）
│   ├── literature-scout — L2（文獻搜尋）
│   ├── research-analyst — L2（統計分析）
│   └── research-visualizer — L2（圖表/投影片）
└── 公司管理 Agent — L1（知識庫回饋專用）
```

### 學術研究部門職責說明

| Agent | 負責領域 | 對應工作流程 |
|-------|---------|------------|
| research-director | 部門指揮、品質把關、最終審核 | 全部四條工作流程 |
| paper-writer | IMRAD 論文撰寫、格式套用 | 期刊投稿、研討會論文 |
| grant-writer | 國科會計畫書 CM01~CM12 撰寫 | 國科會計畫申請 |
| manuscript-reviewer | 結構化審稿意見（Major/Minor Revisions）| 論文審稿 |
| literature-scout | 多資料庫文獻搜尋、DOI 驗證 | 全部四條工作流程（支援）|
| research-analyst | 研究缺口分析、假說生成、統計方法 | 全部四條工作流程（支援）|
| research-visualizer | Mermaid 流程圖、Marp 投影片、甘特圖 | 全部四條工作流程（支援）|

---

## 指揮鏈規則

- ❌ L2 不得跳過 L1 直接向老闆回報
- ❌ 老闆不得跳過 L1 直接指揮 L2
- ❌ L1 不得在未 Review 的情況下提交 Gate
- 老闆只對接 L1 層，L1 負責指揮 L2 subagent

---

## Sprint 流程概覽

> 完整 SOP 見 `.knowledge/company/sop/sprint-planning.md`

```
老闆 + PM 討論需求
    ↓
撰寫提案書（sprint-proposal.md）
    ↓
G0 審核：確認目標、範圍、勾選步驟和關卡
    ↓
L1 撰寫開發計畫書（dev-plan.md）
    ↓
老闆透過 PM 下達指令 → 手動轉達 L1 Agent
    ↓
L1 指揮 L2 執行 → 完成後更新 .tasks/ 狀態
    ↓
FileWatcher 偵測 → GUI Dashboard 即時同步
    ↓
L1 Review → PM Gate 審核 → 老闆決策
    ↓
所有關卡通過 → Sprint 完成
```
