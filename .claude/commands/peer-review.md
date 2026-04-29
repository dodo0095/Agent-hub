---
name: peer-review
description: 學術論文同儕審稿（Major/Minor Revisions + 整體評分）
allowed-tools: Read, Write, Edit, Glob, Grep
---

# 論文同儕審稿（peer-review）

> ⚠️ 本 Skill 名稱與既有 `/review` 指令不同（`/review` 是程式碼 Review），注意區別。
>
> 本 Skill 為 `claude-scientific-skills/scientific-skills/peer-review/SKILL.md` 的本地封裝。

## 使用 Agent

- **主要**: `manuscript-reviewer`
- **副**: `research-director`（整合意見交付）

## 使用時機

- 老闆上傳一篇論文 PDF 要求審稿
- 內部審查自家論文草稿（送期刊前的壓測）
- 國科會計畫書審查（學術邏輯 + 格式合規）

## 產出格式（硬性規範）

1. 整體評分四項：**Methodology / Novelty / Writing / Significance**（各 1-5 分）
2. **Major Revisions** 清單（需修改才能被接受）
3. **Minor Revisions** 清單（建議改進）
4. **建議決定**：Accept / Minor Revision / Major Revision / Reject
5. 存放位置：`.outputs/reviews/{paper-id}.md`

## 原始 SKILL 位置

```
claude-scientific-skills/scientific-skills/peer-review/SKILL.md
```
