# Sprint 提案書: Sprint 3 — Skill 自訂管理 UI

> **提案人**: 老闆 + PM
> **日期**: 2026-04-07
> **專案**: AgentHub
> **狀態**: G0 已通過

---

## 1. 目標

補齊 AgentHub Harness 頁 Skill 分頁的 CRUD UI，讓老闆可以完全透過 GUI 新增、編輯、刪除、啟用/停用、部署自訂 Skill，不需要手動操作檔案系統。後端 `SkillManager` 與 IPC 均已就緒，本 Sprint 為純前端 UI 實作。

---

## 2. 範圍定義

### 做

| # | 功能/任務 | 優先級 | 說明 |
|---|----------|--------|------|
| 1 | 新增 Skill Modal | P0 | `+ New Skill` 按鈕 → `SkillCreateModal.vue`，填名稱、Scope（global/project）、Markdown 內容，呼叫 `createSkill` IPC |
| 2 | 編輯 Skill（詳情面板）| P0 | `SkillDetailPanel.vue` 新增 edit mode，textarea 編輯內容，Save 呼叫 `updateSkill`，僅 user skill 可啟用編輯 |
| 3 | 刪除 Skill | P0 | 詳情面板 Delete 按鈕 + 確認 Dialog，呼叫 `deleteSkill`；System Skill 隱藏按鈕 |
| 4 | Enable/Disable Toggle | P1 | 詳情面板 Toggle 開關，呼叫 `toggleSkill`，同步 list 圖示狀態 |
| 5 | 部署到專案 | P1 | 全局 Skill 詳情面板加「Deploy」，多選專案 Dropdown，呼叫 `deploySkill` |

### 不做（明確排除）

- Markdown 語法高亮 Editor（`<textarea>` 即可）
- Skill 版本控制 / 歷史紀錄
- Skill 預設範本庫
- 批量建立 / 批量刪除
- Project-scoped Skill 部署（project skill 本身即在專案內）

---

## 3. 流程決策（G0 核心產出）

### 步驟勾選

| 勾選 | 步驟 | 說明 | 對應關卡 | 備註 |
|------|------|------|---------|------|
| [x] | 需求分析 | 需求文件、任務拆解 | G0（本文件）| 必選 |
| [ ] | 設計 | 架構/API 設計 | — | 後端已就緒，不需要架構設計 |
| [ ] | UI 圖稿 | HTML mockup | G1 | 延用現有 Skill 分頁視覺風格，無需獨立圖稿審核 |
| [x] | 實作 | 程式碼開發 | G2: 程式碼審查 | 核心工作 |
| [x] | 測試 | 手動測試 + unit test | G3: 測試驗收 | |
| [ ] | 文件 | 文件更新 | G4 | 無新 API 或架構文件需更新 |
| [ ] | 部署 | 環境配置、CI/CD | G5 | 桌面 App，無部署流程 |
| [ ] | 發佈 | 正式對外發佈 | G6 | — |

**確認的流程**: 需求（G0）→ 實作 → G2（程式碼審查）→ 測試 → G3（測試驗收）

### 阻斷規則

- [x] G3（測試）通過前不得關閉 Sprint

### 額外步驟

無

---

## 4. 團隊分配

| 角色 | Agent | 負責範圍 |
|------|-------|---------|
| L1 領導 | tech-lead | 整體規劃、拆解任務、Code Review、Gate 提交 |
| L2 執行 | frontend-developer | Vue component 實作（SkillCreateModal、SkillDetailPanel 編輯模式）|
| L2 執行 | test-writer-fixer | Unit test 撰寫與手動測試驗證 |

---

## 5. 風險評估

| 風險 | 可能性 | 影響 | 緩解措施 |
|------|--------|------|---------|
| SkillDetailPanel preview/edit mode 切換導致 UI 狀態混亂 | 低 | 低 | 用 `ref<'preview' \| 'edit'>` 明確控制，reset on skill change |
| createSkill 名稱衝突錯誤未妥善顯示 | 低 | 低 | catch IPC error 並在 Modal 顯示 inline error message |
| toggleSkill 後 list 狀態不同步 | 低 | 低 | toggle 完成後呼叫 `store.fetchSkills()` 重新整理 |

---

## 6. 失敗模式分析

| 失敗場景 | 可能性 | 影響 | 偵測方式 | 緩解措施 |
|---------|--------|------|---------|---------|
| 新增 Skill 後檔案未實際寫入 | 低 | 中 | 重新整理 list 後比對 | IPC 回傳 `{ success, path }`，顯示路徑確認 |
| 刪除 System Skill（應被阻擋）| 極低 | 低 | Server-side 拒絕並 throw | UI 層已隱藏 Delete 按鈕；server 二次防護 |

---

## 7. 可觀測性

- **日誌策略**: `SkillManager` 各操作已有 `logger.info` 記錄，維持現狀
- **UI 回饋**: 每個操作完成後顯示 toast 通知（success/error）
- **告警規則**: 無（桌面 App 本地操作）

---

## 8. Rollback 計畫

| 項目 | 說明 |
|------|------|
| 程式碼回滾 | `git revert` 本 Sprint commit |
| DB 回滾 | skill_settings 表無新 migration，無需 rollback |
| 判斷標準 | create/update/delete IPC 任一操作導致 crash 或資料損毀 |
| 負責人 | Tech Lead |

---

## 9. 驗收標準

- [ ] 可從 GUI 建立 Global User Skill，`knowledge/user/skill-templates/{name}/SKILL.md` 實際存在
- [ ] 可從 GUI 建立 Project-scoped Skill，`{projectPath}/.claude/commands/{name}.md` 實際存在
- [ ] 可從 GUI 編輯 User Skill 內容並儲存，檔案內容正確更新
- [ ] System Skill 的 Edit / Delete 按鈕不出現（或顯示 disabled）
- [ ] 可從 GUI 刪除 User Skill，對應目錄/檔案被移除，list 自動更新
- [ ] Toggle 開關狀態正確反映在 DB 與 list 視覺中
- [ ] 所有操作完成後 list 自動重新整理（無需手動重載頁面）
- [ ] G2（程式碼審查）通過
- [ ] G3（測試驗收）通過

---

**G0 審核結果**

**老闆決策**: [x] 通過

**審核意見**: 老闆已確認提案，2026-04-07

**確認的流程**: 需求（G0）→ 實作 → G2（程式碼審查）→ 測試 → G3（測試驗收）
