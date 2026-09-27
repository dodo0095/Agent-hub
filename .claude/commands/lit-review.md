---
name: lit-review
description: 系統性文獻回顧，跨資料庫搜尋 + DOI 驗證 + 文獻綜述撰寫
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch, WebSearch
---

# 系統性文獻回顧（lit-review）

> 本 Skill 為 `claude-scientific-skills/scientific-skills/literature-review/SKILL.md` 的本地封裝。

## 使用 Agent

- **主要**: `literature-scout`
- **副**: `research-analyst`（批判評估階段）

## 使用時機

- 期刊投稿前文獻盤點（近 3-5 年）
- 研討會論文近期研究對標（近 2 年）
- 國科會計畫文獻探討（國內外 + 台灣研究現況）
- 審稿時驗證被審稿件的文獻引用完整性

## 搜尋策略

1. **主力資料庫**: PubMed / OpenAlex / bioRxiv / arXiv / SSRN（金融）
2. **關鍵字組合**: 主題 + 方法 + 領域限定
3. **DOI 驗證通過率必須 ≥ 90%**，否則流程暫停
4. **研究主軸關鍵字**: 依**目前專案工作目錄**的 `.knowledge/academic/scholar-profile.md` §2 研究主軸組出關鍵字（不寫死在 Hub）
5. **必讀檔案**: 執行任何搜尋前先讀專案內 `.knowledge/academic/scholar-profile.md` §5 確認自引規則；若檔案不存在，請使用者從 Hub 範本 `.knowledge/academic/scholar-profile.template.md` 建立，不得自行編造研究者資料

## 原始 SKILL 位置

```
claude-scientific-skills/scientific-skills/literature-review/SKILL.md
```
