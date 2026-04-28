# 開發計畫書: Sprint 3 — Skill 自訂管理 UI

> **撰寫者**: Product Manager
> **日期**: 2026-04-07
> **專案**: AgentHub
> **Sprint 提案書**: `proposal/sprint3-proposal.md`
> **狀態**: G0 通過，執行中

---

> 本文件在 G0 通過後由 PM 撰寫，依據提案書中勾選的步驟展開技術細節。

## 1. 需求摘要

補齊 AgentHub Harness 頁 Skill 分頁的 CRUD UI。目前後端 `SkillManager`（create/update/delete/deploy/toggle）、所有 IPC handler、所有 `useIpc.ts` wrapper 已完整就緒，但前端 `SkillTab.vue` 只有 Export/Import 功能，`onEditSkill` 仍是空 placeholder。

本 Sprint 為**純前端 UI 工作**，不修改任何後端或 IPC 程式碼。

### 確認的流程

需求（G0）→ 實作 → G2（程式碼審查）→ 測試 → G3（測試驗收）

---

## 2. 技術方案

### 選定方案

延用現有 Skill 分頁的 Vue 3 Component 模式：

1. **新增 `SkillCreateModal.vue`** — 仿照 `SkillImportModal.vue` 結構，包含表單輸入（名稱、Scope、Markdown 內容 textarea）
2. **`SkillDetailPanel.vue` 擴充** — 新增 `mode: 'preview' | 'edit'` ref，edit mode 顯示 textarea + Save/Cancel 按鈕
3. **`SkillDetailPanel.vue` 新增刪除** — Delete 按鈕 + inline confirm（`v-if` 控制確認狀態）
4. **`SkillTab.vue` 補實作** — `onEditSkill` 接入 `store.selectSkill` 並切換 detail panel mode；新增 `+ New Skill` 按鈕

所有 IPC 呼叫透過現有 `useIpc()` composable，操作完成後呼叫 `store.fetchSkills()` 重整 list。

### 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|------|------|------|------|
| A: inline edit mode（在 DetailPanel 切換）| 不增加新 component 層，UX 流暢 | DetailPanel 邏輯稍複雜 | ✅ 選定（編輯用）|
| B: 獨立 Edit Modal | 和 Create 一致 | 多一個 Modal，來回感覺割裂 | ❌ 排除 |
| C: Markdown 語法高亮編輯器 | 好看 | 引入新依賴，超出範圍 | ❌ 排除 |

---

## 3. UI 圖稿

本 Sprint 不勾選「UI 圖稿」步驟，延用現有 Skill 分頁視覺風格（同 SkillImportModal 的 Modal 風格、同 DetailPanel 的配色規範）。

---

## 4. 檔案變更清單

### 新增

| 檔案 | 用途 |
|------|------|
| `src/components/harness/SkillCreateModal.vue` | 新增 Skill 的表單 Modal（名稱、Scope、內容）|

### 修改

| 檔案 | 變更內容 |
|------|---------|
| `src/components/harness/SkillDetailPanel.vue` | 新增 edit mode（textarea + Save/Cancel）、Delete 按鈕 + confirm、Toggle 開關、Deploy 面板 |
| `src/components/harness/SkillTab.vue` | 新增 `+ New Skill` 按鈕；補實作 `onEditSkill`；接入 create/delete/toggle/deploy 邏輯 |

### 刪除

無

---

## 5. 介面設計

### IPC — 不新增任何通道

本 Sprint 全部使用現有 IPC（已在 `useIpc.ts` 暴露）：

| 現有 IPC wrapper | 用途 |
|----------------|------|
| `ipc.createSkill({ name, content, scope, projectPath })` | 新增 Skill |
| `ipc.updateSkill({ name, content, scope, projectPath })` | 儲存編輯 |
| `ipc.deleteSkill(name, scope, projectPath)` | 刪除 Skill |
| `ipc.toggleSkill(name, enabled, scope, projectPath)` | 啟用/停用 |
| `ipc.deploySkill(name, projects)` | 部署到專案 |

### 型別定義（僅 props 新增）

```typescript
// SkillDetailPanel.vue — 新增 emit
defineEmits<{
  save: [name: string, content: string, scope: string, projectPath?: string];
  delete: [name: string, scope: string, projectPath?: string];
  toggle: [name: string, enabled: boolean, scope: string, projectPath?: string];
  deploy: [name: string, projects: string[]];
}>();

// SkillCreateModal.vue — props
defineProps<{
  show: boolean;
  projectPaths: string[]; // 可選的 project scope 清單
}>();

defineEmits<{
  close: [];
  created: []; // 建立成功，觸發 fetchSkills
}>();
```

---

## 6. 任務定義與分配

> L1 讀取本節後按依賴順序執行。第一步先執行 `/task-delegation` 建立 `.tasks/` 檔案，系統自動追蹤進度。

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 依賴 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|---------|---------|
| T1 | SkillCreateModal 實作 | 新增 `src/components/harness/SkillCreateModal.vue`：名稱 input、Scope select（global / project + projectPath dropdown）、Markdown textarea、Submit 呼叫 `createSkill`、inline error 顯示、成功後 emit `created` + 關閉 | frontend-developer | 無 | 實作 | Modal 可正常開啟關閉；Global Skill 建立後檔案實際存在於 `knowledge/user/skill-templates/`；名稱衝突顯示錯誤訊息 |
| T2 | SkillDetailPanel 編輯模式 | `SkillDetailPanel.vue` 新增 `mode` ref（preview/edit）；edit mode 顯示 textarea + Save/Cancel；Save 呼叫 `updateSkill`；System Skill 不顯示 Edit 按鈕；skill 切換時 reset mode | frontend-developer | T1（並行可） | 實作 | User Skill 可進入編輯並儲存，內容正確更新；System Skill 無 Edit 按鈕 |
| T3 | SkillDetailPanel 刪除 + Toggle + Deploy | 在 DetailPanel footer 新增：Delete 按鈕（System Skill 隱藏）+ inline confirm → `deleteSkill`；Toggle 開關 → `toggleSkill`；全局 Skill 顯示 Deploy section（multi-select 專案）→ `deploySkill` | frontend-developer | T2 | 實作 | Delete 後 list 更新；Toggle 狀態正確同步；Deploy 後目標專案 `.claude/commands/` 有對應檔案 |
| T4 | SkillTab 整合 | `SkillTab.vue`：新增 `+ New Skill` 按鈕及 `showCreateModal` ref；補實作 `onEditSkill`（選中 skill + 觸發 DetailPanel edit mode）；接收 DetailPanel emits 並呼叫對應 IPC + `store.fetchSkills()` | frontend-developer | T1, T2, T3 | 實作 | 完整流程可跑通（新增→列表更新→選取→編輯→儲存→刪除）|
| T5 | 單元測試 | 針對 T1-T4 撰寫測試：SkillCreateModal 表單驗證（空名稱/重複名稱）、SkillDetailPanel mode 切換邏輯、deleteSkill 呼叫確認 | test-writer-fixer | T4 | 測試 | 測試全部通過；涵蓋 P0 功能的 happy path + error case |

### 依賴圖

```
T1 ──┐
     ├→ T4 → T5
T2 ──┤
     │
T3 ──┘
（T1、T2、T3 可並行開發；T4 需等 T1~T3 完成；T5 需等 T4）
```

### L1 執行指令

> PM 產出此區塊，老闆複製貼入 Tech Lead session 即可啟動。

```
請執行 Sprint 3「Skill 自訂管理 UI」開發計畫。

📄 計畫書：proposal/sprint3-dev-plan.md
📋 本次確認流程：需求（G0 已通過）→ 實作 → G2 → 測試 → G3

任務分配：
🔧 委派 frontend-developer：T1（SkillCreateModal）、T2（DetailPanel 編輯模式）、T3（刪除/Toggle/Deploy）、T4（SkillTab 整合）
🧪 委派 test-writer-fixer：T5（單元測試）

⚠️ 阻斷規則：G3（測試）通過前不得關閉 Sprint
⚠️ 注意：本 Sprint 不新增任何 IPC 通道，所有 IPC 呼叫使用現有 useIpc() wrapper
⚠️ System Skill 不可編輯/刪除，UI 層需隱藏對應按鈕，server-side 已有二次防護

第一步請先執行 /task-delegation 建立任務檔案。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `src/components/harness/SkillTab.vue` | T1, T2, T3, T4 | 中（T4 整合時需合併其他任務的 emit 接收）|
| `src/components/harness/SkillDetailPanel.vue` | T2, T3 | 中（T2 和 T3 都修改同一檔案，建議同一人完成或拆 PR）|

---

## 7. 測試計畫

### 單元測試（T5 負責）

| 測試檔案 | 測試案例 |
|---------|---------|
| `tests/unit/SkillCreateModal.test.ts` | 空名稱送出顯示 error；名稱含特殊字元顯示 error；createSkill IPC 呼叫正確參數；成功後 emit created 並關閉 |
| `tests/unit/SkillDetailPanel.test.ts` | preview mode 預設；User Skill 有 Edit 按鈕；System Skill 無 Edit/Delete 按鈕；edit mode save 呼叫 updateSkill；cancel reset 內容；skill prop 變更時 mode reset 為 preview |
| `tests/unit/SkillTab.integration.test.ts` | + New Skill 按鈕開啟 Modal；onEditSkill 觸發 DetailPanel edit mode；delete 後呼叫 fetchSkills |

### E2E 測試

本 Sprint 以手動測試為主，不新增 E2E test（Skill 操作涉及檔案系統，手動驗收較快）。

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| T2/T3 同時修改 SkillDetailPanel，衝突 | 低 | 建議同一 Agent（frontend-developer）依序完成 T2 再做 T3 |
| createSkill 成功但 list 未更新（cache 問題）| 低 | 所有操作後統一呼叫 `store.fetchSkills()` |
| 刪除後 selectedSkill 仍指向已刪除項 | 低 | delete 成功後清空 `store.selectedSkill` |

---

## 9. 文件更新

本 Sprint 不勾選「文件」步驟，無需更新 `.knowledge/` 文件（無新 API 或架構變更）。

---

## 10. 任務與審核紀錄（備查）

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 SkillCreateModal | 2026-04-10 | ✅ 通過 | 第二輪 Review 通過 |
| T2 DetailPanel 編輯模式 | 2026-04-10 | ✅ 通過 | 第二輪 Review 通過 |
| T3 DetailPanel 刪除/Toggle/Deploy | 2026-04-10 | ✅ 通過 | 第二輪 Review 通過 |
| T4 SkillTab 整合 | 2026-04-11 | ✅ 通過 | Review 通過，Minor x2（onSkillDeleted 清空時機、Deploy 雙重回饋）|
| T5 單元測試 | 2026-04-11 | ✅ 通過 | 第二輪 Review 通過，13 cases，store mock 架構優化 |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| Task Delegation Review | 2026-04-07 | 通過 | Blocker:0 Major:0 Minor:0 — 補齊 T1~T5 task 文件的 `開始時間`/`完工時間` 欄位（doc-integrity） |
| G2 實作審查（第一輪）| 2026-04-10 | 不通過 | Blocker:2 Major:1 Minor:2 — handleDelete/handleToggle 無使用者可見錯誤回饋（Blocker）；task 狀態值 pending_review 不合法應為 in_review（Major）|
| G2 實作審查（第二輪）| 2026-04-10 | 通過 | Blocker:0 Major:0 Minor:0 — 所有修正確認，handleDelete 改進優於原設計 |
| G2 實作審查（T4）| 2026-04-11 | 通過 | Blocker:0 Major:0 Minor:2 — onEditSkill/defineExpose 正確；InstanceType 型別精準；Minor：onSkillDeleted 清空時機、Deploy 雙重回饋 |
| G3 測試驗收（第一輪）| 2026-04-11 | 不通過 | Blocker:0 Major:1 Minor:2 — SkillTab.integration.test 缺少 onEditSkill 測試（T5 規格必要項目）|
| G3 測試驗收（第二輪）| 2026-04-11 | 通過 | Blocker:0 Major:0 Minor:0 — 13 cases 全覆蓋，vi.spyOn enterEditMode 精準，store mock 架構優化 |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-04-07 | ✅ 通過 | 老闆確認，提案書 `proposal/sprint3-proposal.md` |
| G2 | 2026-04-11 | ✅ 通過 | T1~T4 實作 Review 全部通過，程式碼品質合格，IPC 規範遵守，handleDelete/handleToggle 錯誤處理完整 |
| G3 | 2026-04-11 | ✅ 通過 | T5 單元測試 13 cases 全覆蓋，vi.mock 完整隔離，onEditSkill/defineExpose 測試到位 |

---

**確認**: [x] Tech Lead 確認（2026-04-07，Task Delegation Review 通過）
**確認**: [x] Tech Lead 確認（2026-04-11，G2 + G3 通過，Sprint 3 全部任務完成）
