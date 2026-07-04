---
name: pitfall-record
description: Record a pitfall or lesson learned in the postmortem log
allowed-tools: Read, Edit, Glob
---

# 踩坑紀錄

將踩坑經驗記錄到 postmortem log。

## 使用方式
```
/pitfall-record <category> <title>
```

## 參數
- `$0`: 分類（build / runtime / deploy / test / process）
- `$1`: 標題
- `$ARGUMENTS`: 完整描述

## 執行步驟

1. 讀取現有 postmortem log：
!`cat .knowledge/postmortem-log.md 2>/dev/null | tail -20 || echo "尚無踩坑紀錄"`

2. 計算到期日：紀錄日期 + 14 天，格式為 YYYY-MM-DD。

3. 在 `.knowledge/postmortem-log.md` 末尾 append：

```markdown
### {日期} — $1

| 項目 | 內容 |
|------|------|
| 分類 | $0 |
| 問題 | {問題描述} |
| 原因 | {根本原因} |
| 解法 | {解決方式} |
| 預防 | {未來如何避免} |
| 狀態 | open |
| 到期日 | {日期+14天, YYYY-MM-DD 格式} |
```

4. **修復閉環（必要，不可跳過）**：若紀錄中含「修復方向（待後續 Sprint）」「預防措施待實作」等未完成項目，**必須同時建立 backlog 任務檔** `.tasks/backlog/PM-{id}-{slug}.md`（格式同一般任務檔，狀態 `created`），並在踩坑紀錄中回填任務檔路徑。
   > 制度依據：PM-009 的修復方案在 postmortem 裡躺了 2 個月沒人執行，期間 hook 持續誤攔正常指令。**只記錄不建任務 = 沒有記錄**。

5. **快速參考表同步**：若這次教訓可以濃縮成一行「場景 → 規則」，把它加進 postmortem-log.md 頂部的「踩坑快速參考」表（**必須加在 `<!-- QUICKREF:START -->` 與 `<!-- QUICKREF:END -->` 標記之間**——這段由 SessionStart hook 自動注入每個 session，是弱模型保證看得到的部分，保持每行精簡）。

6. **決策表同步**：若教訓屬於「需要判斷的時刻」（該不該繼續修、該不該問人、該交什麼證據），評估是否把它改寫成 if-then 規則加進 `.knowledge/decision-tables.md` 對應的表（收錄門檻見該文件表 7）。

7. 如果涉及通用規則，建議是否需更新 CLAUDE.md 或公司規範（跨專案傳播用 `/knowledge-feedback`）。
