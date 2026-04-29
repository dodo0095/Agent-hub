---
name: hypothesis
description: 研究假說生成（H0/H1 對立假設 + 可檢驗性評估）
allowed-tools: Read, Write, Edit, Glob, Grep
---

# 假說生成（hypothesis）

> 本 Skill 為 `claude-scientific-skills/scientific-skills/hypothesis-generation/SKILL.md` 的本地封裝。

## 使用 Agent

- **主要**: `research-director`, `research-analyst`
- **副**: `grant-writer`（國科會計畫研究問題制定）

## 使用時機

- 期刊論文的 Introduction 章節研究問題設計
- 國科會計畫的研究目的與假說陳述
- Sprint 4 金融科技範例：
  - H1: LLM 情感分析能顯著提升股市短期波動預測準確度
  - H1: 強化學習投資策略於台股市場的 Sharpe Ratio 顯著優於被動投資

## 硬性規則

1. 假說必須可檢驗（falsifiable）
2. 必須陳述對立假設（null hypothesis）
3. 必須明確指出統計檢定方法

## 原始 SKILL 位置

```
claude-scientific-skills/scientific-skills/hypothesis-generation/SKILL.md
```
