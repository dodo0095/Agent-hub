---
name: academic-writing
description: IMRAD 結構學術論文撰寫核心 Skill，禁止 bullet points 於最終稿
allowed-tools: Read, Write, Edit, Glob, Grep
---

# 學術論文撰寫（academic-writing）

> 本 Skill 為 `claude-scientific-skills/scientific-skills/scientific-writing/SKILL.md` 的本地封裝，
> 透過本檔案控制命名與 Agent 綁定，實際內容由 Claude 於執行時主動讀取原 SKILL.md。

## 使用 Agent

- **主要**: `paper-writer`
- **副**: `grant-writer`, `research-director`（統籌時）

## 使用時機

- 期刊投稿論文撰寫（IMRAD：Intro / Methods / Results / Discussion）
- 研討會論文（4-8 頁短篇）
- 國科會計畫書章節撰寫（研究目的 / 文獻探討 / 研究方法 / 預期成果）

## 硬性規則

1. **最終稿禁止 bullet points** — 必須完整段落
2. 引用必須有明確 DOI 驗證
3. 英文稿件：必須通過被動/主動語態一致性檢查
4. 中文稿件：必須使用繁體中文，學術用語嚴謹

## 原始 SKILL 位置（執行時請主動讀取）

```
claude-scientific-skills/scientific-skills/scientific-writing/SKILL.md
```

## Sprint 4 測試題材提示

金融科技 × AI/LLM（智慧投資 / 金融風險 / 情感分析）
