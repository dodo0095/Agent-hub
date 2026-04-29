---
name: cite-manage
description: 引用管理、DOI 驗證、BibTeX 產出、防止 AI 幻覺引用
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch
---

# 引用管理（cite-manage）

> 本 Skill 為 `claude-scientific-skills/scientific-skills/citation-management/SKILL.md` 的本地封裝。

## 使用 Agent

- **主要**: `literature-scout`, `paper-writer`
- **副**: `grant-writer`

## 使用時機

- 論文引用清單維護
- DOI 驗證（防止 AI 幻覺文獻）
- BibTeX / EndNote 格式匯出
- 國科會計畫書參考文獻格式（APA / Chicago / GB/T 7714）

## 硬性規則

1. **所有引用必須驗證 DOI 存在且可達**
2. 驗證失敗的引用標記 `[UNVERIFIED]`，不得進入最終稿
3. `verify_citations.py` 為必執行腳本（見原 SKILL）

## 原始 SKILL 位置

```
claude-scientific-skills/scientific-skills/citation-management/SKILL.md
```
