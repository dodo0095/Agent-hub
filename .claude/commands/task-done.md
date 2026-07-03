---
name: task-done
description: Mark a task as in_review (pending L1 review) and record in dev plan section 10
allowed-tools: Read, Edit, Glob
---

# 任務完成提交

更新任務狀態為 `in_review`（待 L1 審查），並在開發計畫書第 10 節記錄。

## 使用方式
```
/task-done <task-id> [備註]
```

## 參數
- `$0`: 任務 ID（如 `T1`）
- `$ARGUMENTS`: 完整參數（含備註）

## 格式規範（系統解析依賴，務必遵守）

### .tasks/ 狀態欄位（第 2 欄 `| 狀態 | xxx |`）
必須使用以下英文值：

| 狀態值 | 說明 |
|--------|------|
| `in_review` | 待 L1 審查 |

### dev-plan 第 10 節「結果」欄位（第 3 欄）

| 結果值 | 對應系統狀態 | 說明 |
|--------|-------------|------|
| `🔍 待審查` | in_review | 已提交，待 L1 Review |
| `🔧 需修正` | in_review | 需返工 |

> 系統解析器 `normalizeStatus()` 依賴 `完成/✅/修正/🔧` 等關鍵字判斷。

### 日期欄位（第 2 欄）
格式：`YYYY-MM-DD`

## 執行步驟

1. 找到對應的任務檔案（支援 Sprint 子目錄）：
!`find .tasks -name "$0-*" -o -name "$0.*" 2>/dev/null | head -1`

> 任務檔案可能在 `.tasks/sprint-{N}/T1-xxx.md`，不再只在 `.tasks/` 根目錄。

2. **驗收標準確認（必要）**：
   - 讀取任務檔案，找到 `## 驗收標準` 區塊
   - 逐項檢查每個 `- [ ]` 項目是否已完成
   - 將所有已完成的項目打勾：`- [ ]` → `- [x]`
   - **如果有項目無法確認完成，必須在備註中說明，不可跳過**

2b. **完成證據（必要，源自 PM-011 三次假修復教訓）**：
   在任務檔案追加 `## 完成證據` 區塊，逐條列出**本次實際執行過**的驗證（不是「應該會過」的推論）：
   - **程式碼變更**：貼上實際跑過的指令與結果摘要（如 `npx vitest run tests/xxx → 19 passed`、`npm run typecheck → exit 0`）
   - **資料/紀錄類修復**（cost、統計、log）：必須附 production DB / 實際資料的 query 結果，證明修復後資料真的變了。單元測試綠不算數
   - **需要重新 build 才生效的變更**（electron/**）：確認 `out/` build 時間戳新於原始碼，或註明「未重 build，生效需 npm run build」
   - **檢查分支基底**：production 修復必須以 main 為 base；確認 fix 所在分支會被 merge 到用戶實際跑的版本
   > 鐵律：**沒有貼得出來的證據 = 沒有完成**。寧可寫「未驗證」也不可寫推論當事實。

3. **取得真實時間（必要，不可跳過）**：
!`node -e "console.log(new Date().toISOString())"`
   > ⚠️ **禁止自行編造時間**。Agent 不知道真實時間，必須透過上述指令取得。將輸出存為變數 `$NOW` 供後續步驟使用。

4. 更新找到的任務檔案：
   - 將 `| 狀態 | ... |` 改為 `| 狀態 | in_review |`
   - 將 `| 完工時間 | ... |` 改為 `| 完工時間 | $NOW |`
   - **若 `完工時間` 已有非 `—` 的值，不覆蓋**（代表被退回後重新提交，保留首次完工時間）
   - **若找不到 `| 完工時間 |` 欄位**，在 `| 建立時間 |` 行之後插入 `| 完工時間 | $NOW |`
   - 在 `## 事件紀錄` 區塊底部 append：
   ```
   ### $NOW — 狀態變更 → in_review
   {備註}
   ```

5. 找到當前 dev-plan：
!`ls -t proposal/sprint*-dev-plan.md 2>/dev/null | head -1`

6. 在 dev-plan 第 10 節「任務完成紀錄」表格，找到對應任務行並更新：
```
| $0 | {YYYY-MM-DD} | 🔍 待審查 | {備註} |
```
