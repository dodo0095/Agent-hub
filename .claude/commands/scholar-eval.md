---
name: scholar-eval
description: 研究者/論文的學術影響力評估（h-index / 引用數 / venue 權重）
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch
---

# 研究者/論文評估（scholar-eval）

> 本 Skill 為 `claude-scientific-skills/scientific-skills/scholar-evaluation/SKILL.md` 的本地封裝。

## 使用 Agent

- **主要**: `research-analyst`, `manuscript-reviewer`
- **副**: `literature-scout`（引用權重判斷）

## 使用時機

- 審稿時評估作者群的過往研究品質
- 國科會計畫書撰寫時選擇最具代表性的文獻引用
- 決定投稿 venue 前的期刊影響力對照

## 原始 SKILL 位置

```
claude-scientific-skills/scientific-skills/scholar-evaluation/SKILL.md
```
