# Sprint 4 — 功能規格書

> 版本: v2.0 | Sprint 4 建立、Sprint 7 擴充（ARS 整合）| 最後更新: 2026-09-28
> 範圍: academic-research 部門四條工作流程的功能規格與驗收標準

## 概述

建立新部門 `academic-research`，整合 13 個學術類 Skills，支援四條工作流程：
**期刊投稿 / 研討會論文 / 論文審稿 / 國科會計畫**

E2E 測試題材：**金融科技**（G0 決議）

---

## 1. 功能模組清單

### F1 - `academic-research` 部門建立
- **輸入**: Sprint 啟動指令
- **產出**: `agent-roster.md` 新增 7 位 Agent 設定
- **驗收**: 7 位 Agent 具備完整 id/name/level/reports_to/skills 欄位

### F2 - 13 個 Skills 整合至 `.claude/commands/`
- **輸入**: `claude-scientific-skills/scientific-skills/{skill}/SKILL.md`
- **產出**: `.claude/commands/{new-name}.md`（依 api-design.md 命名規範）
- **驗收**:
  - 13 個檔案全數存在
  - 每檔 YAML frontmatter 合規
  - 內容與原 SKILL.md 對齊（必要處改寫命名衝突）

### F3 - `nstc-grant.md` 自建 Skill（已存在，需驗證）
- **狀態**: Pre-G0 已產出（基於真實國科會計畫書格式）
- **驗收**:
  - CM01~CM12 表格格式齊全
  - 支援一般型 / 優秀年輕學者 / 產學合作三種計畫類型
  - **老闆親自 Review 確認格式正確**（Day 5 必驗）

### F4 - 四條工作流程 SOP 文件
- **產出**:
  - `.knowledge/academic/sop-journal.md`（期刊投稿）
  - `.knowledge/academic/sop-conference.md`（研討會）
  - `.knowledge/academic/sop-peer-review.md`（審稿）
  - `.knowledge/academic/sop-nstc-grant.md`（國科會計畫）
- **驗收**: 每份 SOP 含步驟圖 + 決策判斷樹 + 失敗 fallback

### F5 - Venue List 金融科技補強
- **輸入**: 原 `venue-list.md`（14 期刊 + 20 研討會，Pre-G0 已產出）
- **產出**: 補金融類權重標記
  - 期刊主力：**AJFS**、**Expert Systems with Applications**、Journal of Financial Economics
  - 研討會主力：**ACM ICAIF**（AI in Finance）、**IEEE ICDM**
- **驗收**: 金融類 venue 至少標註 5 個期刊 + 3 個研討會

### F6 - E2E 測試（4 條流程）
- **題材**: 金融科技 × LLM / AI 應用
- **建議測試子題**（grant-writer Day 5 與老闆確認其一）:
  1. LLM 應用於金融文本情感分析與市場預測
  2. AI 智慧投資決策系統（強化學習 × 金融）
  3. ESG 投資決策的 LLM 評分框架
  4. 金融風險評估的多模態 AI 模型

---

## 2. 用戶流程（四條）

### 2.1 期刊投稿流程
```
老闆：「幫我寫一篇『LLM 金融情感分析』期刊論文，投 ESWA」
  ↓ research-director 確認題目
  ↓ literature-scout 系統性搜尋（近 3 年 + 金融領域關鍵字）
  ↓ research-analyst 統計方法設計 + 文獻批判
  ↓ paper-writer 產出 IMRAD 初稿
  ‖ research-visualizer 並行產製研究流程圖、結果圖
  ↓ manuscript-reviewer 內審
  ↓ paper-writer 修訂 + venue-format 套 ESWA 格式
  ↓ research-director 最終審核 → 老闆驗收
```

### 2.2 研討會流程
同上，4-8 頁短篇，加入 research-slides 投影片產出。
目標：ACM ICAIF 或 IEEE ICDM。

### 2.3 審稿流程
```
老闆：「幫我審這篇論文 [PDF]」
  ↓ manuscript-reviewer 結構分析
  ↓ research-analyst 方法驗證
  ↓ literature-scout 引用正確性查核
  ↓ manuscript-reviewer 產出 Major/Minor 清單 + 整體評分
  ↓ research-director 整合 → 老闆
```

### 2.4 國科會計畫流程
```
老闆：「幫我寫國科會一般型計畫，主題：AI 金融風險評估，2 年」
  ↓ grant-writer 載入 nstc-grant Skill
  ↓ literature-scout 國內外搜尋（含台灣金融研究現況）
  ↓ research-analyst 研究缺口 + 假說
  ↓ grant-writer 撰寫 CM03 中英摘要 / CM04 核心章節 / CM05 時程 / CM06 預算
  ‖ research-visualizer 研究架構圖、甘特圖
  ↓ manuscript-reviewer 格式+邏輯審查
  ↓ grant-writer 修訂 → research-director → **老闆親自驗收**
```

---

## 3. 邊界條件

| 情境 | 預期行為 |
|------|---------|
| 老闆只給題目、未指定 venue | research-director 根據主題建議 2~3 個 venue，請老闆勾選 |
| 文獻搜到 < 10 筆 | literature-scout 放寬至近 5 年，再不足則回報「主題過於冷門」 |
| 引用 DOI 驗證失敗 > 10% | 流程暫停，literature-scout 重新搜尋 |
| paper-writer 產出殘留 bullet points | 自動退回重寫，最多 2 次，第 3 次回報 research-director |
| 國科會題材非金融（誤觸） | grant-writer 正常執行，不強制金融題材（僅 E2E 測試預設為金融）|

---

## 4. 驗收標準（完整版）

### 4.1 結構驗收
- [ ] `agent-roster.md` 含 `academic-research` 部門 7 位 Agent
- [ ] `.claude/commands/` 新增 13 個 academic Skills（含 `nstc-grant.md`）
- [ ] `.knowledge/academic/` 含 4 份 SOP + `agent-prompts.md` + `venue-list.template.md`（個人版放專案內）
- [ ] `.outputs/` 目錄建立並加入 `.gitignore`

### 4.2 功能驗收（期刊 — 金融科技主題）
- [ ] 完整走完期刊投稿流程
- [ ] IMRAD 結構初稿產出，無 bullet points 殘留
- [ ] 引用 ≥ 10 筆文獻，DOI 驗證通過率 100%
- [ ] 套用 AJFS 或 Expert Systems with Applications 格式

### 4.3 功能驗收（研討會 — 金融科技主題）
- [ ] 以同一主題產出 4~8 頁 ACM ICAIF 或 IEEE ICDM 格式論文
- [ ] 投影片（PPTX）成功產出

### 4.4 功能驗收（審稿）
- [ ] 上傳一篇 AI 相關論文 PDF，產出審稿報告
- [ ] 報告含整體評分 + Major/Minor + 建議決定

### 4.5 功能驗收（國科會 — 金融科技主題）
- [ ] grant-writer 產出一般型計畫書草稿
- [ ] 包含：中英文摘要、研究目的、文獻探討、研究方法、預期成果、研究時程、預算表
- [ ] 甘特圖由 research-visualizer 產出
- [ ] **老闆親自 Review 確認格式正確**（硬性條件）

### 4.6 品質驗收
- [ ] G2 程式碼審查通過（tech-lead）
- [ ] G3 測試驗收通過（4 條 E2E 全通過）
- [ ] G4 文件審查通過

---

## 5. 非功能性需求

| 面向 | 要求 |
|------|------|
| 效能 | 單次論文流程 < 30 分鐘（不含老闆 Review） |
| 可重現性 | 同一題目執行兩次，文獻搜尋結果一致性 ≥ 80% |
| 安全性 | `.outputs/` 不得進 git；禁止將未發表論文內容外流 |
| 可維護性 | 每個 Skill 獨立，修改一個不影響其他 |

---

## 6. Sprint 7 — 學術出版部與 ARS 整合（v2.0 新增）

> 使用者面的運作規則以 `README.md`「學術事業群使用指南」為準，本節定義系統行為與驗收標準。

### 6.1 功能模組

| # | 功能 | 說明 |
|---|------|------|
| F7 | 學術出版部 | 新部門 `academic-publication`，成員 publication-operator，GUI 顯示「學術出版部」 |
| F8 | ARS 路徑設定 | 設定頁輸入 ARS 根目錄，存 `ars.plugin-dir` |
| F9 | ARS 注入 | 啟動（含 resume）出版部 agent 時自動載入 ARS；其他 agent 不受影響 |
| F10 | ARS 完整性檢查 | 啟動前檢查 plugin.json 與 4 個 SKILL.md，不完整則拒絕啟動並說明修法 |

### 6.2 用戶流程

1. 老闆一次性準備：自行下載 ARS → 設定頁填 ARS 路徑。
2. 老闆向 research-director 提出論文需求 → 總監分流（README 分流表）→ 產出**開案簡報**，老闆確認。
3. 總監指派 publication-operator，Hub 以互動模式啟動並注入 ARS。
4. 操作員依簡報執行 ARS 指令（如 `/ars-full`）；**每個檢查點由老闆在該 session 直接回覆**，操作員不代答。
5. 例外（誠信檢查連 3 輪不過、Reject、成本或時程超出預估）→ 操作員回報總監，由總監召集老闆決定。
6. 定稿 → 操作員回報總監 → 總監做出口驗收與後續轉交。

### 6.3 邊界條件

| 情境 | 預期行為 |
|------|---------|
| 未設定 ARS 路徑 | 拒絕啟動，`ARS_PATH_NOT_SET` |
| ARS 為 zip 解壓、skills/ 內是 stub 檔 | 拒絕啟動，`ARS_INSTALL_INCOMPLETE`，列出缺的 SKILL.md 與修法 |
| 以非互動模式啟動出版部 agent（例如任務自動派發） | 拒絕，`ARS_REQUIRES_INTERACTIVE` |
| resume 中斷的出版部 session | 重新注入 `--plugin-dir`，ARS 仍可用 |
| 其他部門 agent 啟動 | 行為與 Sprint 7 前完全相同 |
| 設定了路徑但使用者之後移動或刪除 ARS | 下次啟動時由驗證器擋下 |

### 6.4 驗收標準

- [ ] GUI 部門列表出現「學術出版部」，含 publication-operator
- [ ] research-director 的 `manages` 含 publication-operator
- [ ] 設定頁可存取 ARS 路徑（zh-TW / en）
- [ ] 單元測試涵蓋 api-design §6 全部契約與三個錯誤碼
- [ ] 真實啟動證據：debug log 出現「Loaded 4 skills from plugin academic-research-skills」
- [ ] 與 Hub 的 `--mcp-config` 並用時 SendMessage 仍可用；ARS hooks 不與 Hub hooks 衝突
- [ ] resume 後 ARS 仍載入
