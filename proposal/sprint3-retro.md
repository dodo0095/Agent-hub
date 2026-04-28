# Sprint 回顧: Sprint 3 — Skill 自訂管理 UI

> **撰寫者**: Tech Lead
> **日期**: 2026-04-11
> **Sprint 期間**: 2026-04-07 ~ 2026-04-11（5 天）
> **參考文件**: `proposal/sprint3-dev-plan.md`, `proposal/sprint3-proposal.md`

---

## 1. 完成狀況

### 任務完成率

| 任務 | 預估 | 開始 | 完成 | 狀態 | 輪數 |
|------|------|------|------|------|------|
| T1 SkillCreateModal | 2h | 04-10 | 04-10 | ✅ done | 2 輪 |
| T2 DetailPanel 編輯模式 | 2h | 04-10 | 04-10 | ✅ done | 2 輪 |
| T3 DetailPanel 刪除/Toggle/Deploy | 2h | 04-10 | 04-10 | ✅ done | 2 輪 |
| T4 SkillTab 整合 | 2h | 04-10 | 04-11 | ✅ done | 1 輪 |
| T5 單元測試 | 2h | 04-11 | 04-11 | ✅ done | 2 輪 |

- **任務完成率**: 5 / 5 = **100%**
- **首輪 Review 通過率**: 2 / 5（T4 + 只算第一批提交的整體）= **40%**（T1~T3 第一輪不通過，T4 一輪通過，T5 一輪不通過）
- **所有任務最終通過**: ✅

### 驗收標準對照（來自提案書第 9 節）

| 驗收項目 | 結果 |
|---------|------|
| GUI 建立 Global User Skill，檔案實際存在 | ✅（T1 實作，IPC 驗證）|
| GUI 建立 Project-scoped Skill | ✅（T1 scope=project 路徑）|
| GUI 編輯 User Skill，內容正確更新 | ✅（T2 updateSkill）|
| System Skill Edit / Delete 按鈕不出現 | ✅（`source !== 'system'` 條件）|
| GUI 刪除 User Skill，list 自動更新 | ✅（T3 + fetchSkills）|
| Toggle 狀態正確反映 DB 與 list | ✅（T3 toggleSkill）|
| 操作完成後 list 自動重整 | ✅（所有 emit handler 呼叫 fetchSkills）|
| G2 程式碼審查通過 | ✅ 2026-04-11 |
| G3 測試驗收通過 | ✅ 2026-04-11 |

**驗收標準達成率**: 9 / 9 = **100%**

---

## 2. 品質指標

### Review 統計

| Review | 輪次 | 結果 | Blocker | Major | Minor |
|--------|------|------|---------|-------|-------|
| Task Delegation | 1 | 通過 | 0 | 0 | 0 |
| G2 實作 T1~T3（第一輪）| 1 | 不通過 | 2 | 1 | 2 |
| G2 實作 T1~T3（第二輪）| 2 | 通過 | 0 | 0 | 0 |
| G2 實作 T4 | 1 | 通過 | 0 | 0 | 2 |
| G3 測試 T5（第一輪）| 1 | 不通過 | 0 | 1 | 2 |
| G3 測試 T5（第二輪）| 2 | 通過 | 0 | 0 | 0 |

- **總 Review 輪次**: 6 輪
- **一輪通過**: 2 / 5 任務（T4、Task Delegation）
- **兩輪通過**: 3 / 5 任務（T1~T3 合批、T5）
- **累計 Blocker 數**: 2（均在 G2 T1~T3 第一輪）
- **累計 Major 數**: 2（狀態值格式 × 1、測試缺失 × 1）

### Gate 通過率

| Gate | 決策 |
|------|------|
| G0 | ✅ 通過（2026-04-07）|
| G2 | ✅ 通過（2026-04-11）|
| G3 | ✅ 通過（2026-04-11）|

---

## 3. 做得好的 ✅

### 程式碼品質

1. **`handleDelete` 主動升級設計**：第一輪 Blocker 修正時，將 `showDeleteConfirm = false` 從 `finally` 移至 `try` 內，失敗時保持 confirm 對話框開啟讓使用者可重試，比原始設計更嚴謹。

2. **`InstanceType<typeof SkillDetailPanel>` 型別**：T4 使用比建議更精準的 Vue 3 慣用型別，TypeScript 可自動推導 expose 出的方法，不需要手動寫型別交集。

3. **Store mock 架構升級**：T5 第二輪將 store mock 從 inline 物件改為 `let mockStoreInstance` + `beforeEach` 重建，讓跨 test 的狀態斷言（selectedSkillName 清空）成為可能。

4. **vi.spyOn 應用精準**：`onEditSkill` 測試透過 `vi.spyOn` 直接 spy `defineExpose` 暴露的函數，比覆寫 mock 更優雅，且能驗證實際執行路徑。

5. **超出規格的測試覆蓋**：SkillCreateModal 測試多寫了 `scope=project 帶 projectPath` 的 happy path；SkillDetailPanel 測試將「無 Edit 按鈕」與「無 Delete 按鈕」拆為獨立 case，覆蓋更細緻。

6. **Toast 動畫 transform 保留正確**：`toast-enter-from` 保留了 `translateX(-50%)`，確保動畫不破壞置中定位，細節到位。

---

## 4. 需改進的 ⚠️

### 重複發生的問題

1. **Task 狀態值 `pending_review` 連續三批出現**（T1~T3 第一批、T4、T5 均使用了不合法的狀態值）
   - 合法值：`in_review`
   - 實際提交：`pending_review`
   - 影響：觸發 doc-integrity Major，拖慢 Review 流程

2. **Review 首輪不通過率偏高**（3/5 任務第一輪不通過）
   - T1~T3：handleDelete/handleToggle 錯誤處理均為靜默 `console.error`，屬於可在自查時發現的問題
   - T5：`onEditSkill` 測試缺失，T5 規格明確列出卻遺漏

### Minor 未修正項目（可後續 Sprint 處理）

- `onSkillDeleted` 中 `selectedSkillName` 清空時機在 `fetchSkills` 之後（短暫狀態不一致窗口）
- Deploy 操作有雙重回饋：SkillDetailPanel 內的 `deployResult` + SkillTab 的 toast

---

## 5. 行動項目

| # | 問題 | 行動 | 負責人 | 時程 |
|---|------|------|--------|------|
| A1 | Task 狀態值格式反覆錯誤 | 在 `.knowledge/postmortem-log.md` 補充「合法 task 狀態值速查」，每次提交前自查 | frontend-developer | 下個 Sprint 前 |
| A2 | IPC 錯誤處理自查習慣 | 每個 IPC 呼叫完成後，明確確認 catch block 有使用者可見的 error 反饋（不只是 console.error）| frontend-developer | 立即生效 |
| A3 | 測試案例對照任務規格 | 提交測試前，逐行核對 task 文件中的測試案例清單 | frontend-developer | 立即生效 |
| A4 | `onSkillDeleted` 清空順序 | 下次修到相關邏輯時，將 `store.selectedSkillName = null` 移至 `fetchSkills()` 之前 | frontend-developer | 機會性修正 |
| A5 | Deploy 雙重回饋 | 評估移除 SkillDetailPanel 內的 `deployResult` 文字，統一由 SkillTab toast 處理 | frontend-developer | 機會性修正 |

---

## 6. 技術亮點（值得帶入下次 Sprint）

```
defineExpose + InstanceType<typeof Component>
```
Parent 透過 template ref 呼叫 child expose 的方法，比 prop/emit 更適合「命令式觸發」的場景（如：外部觸發 modal open、強制進入某個 mode）。

```typescript
// mutable store stub 模式
let mockStoreInstance: Record<string, unknown>;
beforeEach(() => {
  mockStoreInstance = { selectedSkillName: 'previous', ... };
});
// → 可在 test 中直接斷言 store 狀態變化
```

---

## 7. Sprint 總評

| 指標 | 結果 |
|------|------|
| 任務完成率 | 100% |
| 驗收標準達成率 | 100% |
| 平均 Review 輪次 | 1.6 輪 |
| Gate 全數通過 | ✅ G0 / G2 / G3 |
| 遺留技術債 | 低（2 Minor，均為 UX 優化，非功能缺陷）|

Sprint 3 目標全部達成，後端 IPC 已就緒的基礎讓純前端工作進展順暢。主要改進空間在**提交前自查流程**（狀態值、錯誤處理、測試案例對照），若這三項建立習慣，下次 Sprint 首輪通過率可顯著提升。
