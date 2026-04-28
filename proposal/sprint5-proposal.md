# Sprint 提案書: Sprint 5 — 跨 Agent 通訊機制（SendMessage MCP Server）

> **提案人**: product-manager
> **日期**: 2026-04-28
> **專案**: AgentHub
> **狀態**: ✅ G0 通過（2026-04-28，老闆口頭核准）

---

## 1. 背景

### 為什麼要做

PM-006（postmortem-log）發現一個系統設計與實作的落差：

- `prompt-assembler.ts:267` 在每個 agent 的 system prompt 都注入「使用 SendMessage 工具聯繫同事」
- 但 harness 從未部署 `SendMessage` 為 Claude Code 工具或 MCP server
- 所有 L1 / L2 agent 只能在內心戲講「我要 SendMessage 給 XXX」，實際呼叫不到任何東西
- 跨 agent 協作目前只能靠老闆手動切換 session 人肉轉達

後端基礎設施其實**已經備齊**：`message-broker.ts` 能把訊息寫進目標 agent 的 PTY、handle 訊息狀態（pending/delivered/read）、處理排程與回覆指引。只差「暴露給 agent session 呼叫」這一層。

### 老闆已決策（2026-04-28 對話）

- 不採短期方案 A（移除 prompt 段落）
- 直接做完整版 B：實作 MCP server，讓 prompt 宣告的工具真的存在

---

## 2. 目標

讓 Maestro v2 的「虛擬開發公司」承諾兌現：

| 工作流程 | 現況 | 目標 |
|---------|------|------|
| L1 派工給 L2 | 老闆手動切 session 轉達 | L1 直接呼叫 SendMessage(to: 'L2-id', content: '...') |
| L2 完成回報 L1 | 老闆手動轉達結果 | L2 SendMessage 回覆，L1 自動收到並繼續決策 |
| 跨部門協作 | 不可能 | PM ↔ Tech Lead ↔ Design Director 自主溝通 |
| 上級指令 | 老闆切 session | Boss → L1 透過 SendMessage 派工 |

---

## 3. 範圍定義

### 做

| # | 功能/任務 | 優先級 | 說明 |
|---|----------|--------|------|
| 1 | 設計 MCP server 介面（list_tools / send_message / list_inbox） | P0 | 由 tech-lead 在 dev-plan 階段細化 |
| 2 | 實作 MCP server，包裝 `message-broker.send()` | P0 | Node.js MCP SDK，本地 stdio 或 socket |
| 3 | spawn 時自動注入 MCP server 到 agent session | P0 | `session-spawn-helpers.ts` 加 `--mcp-config` |
| 4 | 工具白名單：每個 agent 能寄訊息的對象由 `manages / reportsTo / coordinatesWith` 限定 | P0 | 防止越權跨層級指揮 |
| 5 | 訊息送達確認回饋（target session 不存在時返回明確錯誤） | P1 | 避免幻覺式「已送出」 |
| 6 | E2E 測試：boss → product-manager → tech-lead 真實接力 | P0 | 三層通訊跑通才算驗收 |
| 7 | 更新 prompt-assembler，加入單元測試確保「宣告的工具必須在 ToolSearch 可見」 | P1 | 預防 PM-006 重演 |

### 不做（明確排除）

- 不做訊息 GUI（dashboard 已有 message inbox 視覺化，本 sprint 不動 UI）
- 不做歷史訊息查詢工具（agent 只能寄、不能翻舊帳，避免 context 爆炸）
- 不做附件 / 檔案傳輸（純文字訊息，附件用 task / 共享檔案）
- 不做跨 project 通訊（同 project 內才能寄；跨 project 由老闆協調）
- 不修改 message-broker 既有介面（只新增 MCP wrapper，避免破壞 GUI 訊息系統）

---

## 4. 流程決策（G0 核心產出）

> **本區由老闆在 G0 審核時勾選確認。**

### 步驟勾選

| 勾選 | 步驟 | 說明 | 對應關卡 |
|------|------|------|---------|
| [x] | 需求分析 | 本提案書 + dev-plan 任務拆解 | G0（本文件） |
| [x] | 設計 | MCP server 協議設計 + 安全模型 | — |
| [ ] | UI 圖稿 | 無新 UI | G1（不適用） |
| [x] | 實作 | MCP server + spawn 整合 + 白名單 | G2 |
| [x] | 測試 | 單元測試 + E2E 三層通訊測試 | G3 |
| [x] | 文件 | 更新 architecture.md / postmortem PM-006 收尾 | G4 |
| [ ] | 部署 | 隨 main merge 自然上線 | G5（不適用） |
| [ ] | 發佈 | 內部工具，不對外發佈 | G6（不適用） |

### 阻斷規則

- [x] G2（實作）通過前不得進行 E2E 測試
- [x] 安全模型（白名單）設計通過前不得開始 MCP server 實作
- [ ] G1 不適用

### 額外步驟

| 勾選 | 步驟名稱 | 說明 | 審核方式 |
|------|---------|------|---------|
| [x] | 安全模型審核 | 白名單規則：誰能寄給誰、能不能跨層級 | tech-lead + 老闆共同確認 |
| [x] | Prompt 一致性檢查 | 確保 prompt-assembler 注入內容與實際工具完全對應 | PM 自審 |

---

## 5. 風險與緩解

| 風險 | 影響 | 緩解 |
|------|------|------|
| MCP server 進程在 Windows 上不穩 | Agent 收不到訊息 | 失敗時 fallback 到既有 IPC 路徑 + 明確 log 錯誤 |
| Agent 濫用 SendMessage 造成無限對話 | Token 爆炸 | 1) 每個 session 訊息上限（如 20 條/小時） 2) Stop hook 偵測迴圈 |
| 越權指揮（L2 跨部門對 L2 直接下令） | 破壞指揮鏈 | 白名單嚴格依 `manages / reportsTo / coordinatesWith` 過濾 |
| 訊息送達 target 已 stopped 的 session | 訊息石沉大海 | message-broker 已有 pending 機制，session resume 時補送 |
| 老闆手動指揮被取代後不知道發生什麼 | 失去掌控感 | Dashboard 即時顯示所有 SendMessage 流動（GUI 已有 message panel） |

---

## 6. 估時

| 階段 | 預估工時 | 負責 |
|------|---------|------|
| 設計（MCP 介面 + 安全模型） | 0.5 day | tech-lead |
| 實作（MCP server + 整合） | 1.5 day | tech-lead 派 backend agent |
| 測試（單元 + E2E） | 1 day | qa-lead |
| 文件 + Retro | 0.5 day | PM |
| **合計** | **~3.5 day** | |

> 注：若 Sprint 4（學術部門）尚未收尾，本 Sprint 5 視老闆排程決定併行或順序。

---

## 7. 驗收標準

- [ ] L1 agent 在 session 內呼叫 `SendMessage(to: 'tech-lead', content: '...')` 能成功寄出，回傳含訊息 ID
- [ ] target agent 的 PTY 收到格式化訊息（含「來自 XXX 的訊息」標題）
- [ ] 越權呼叫（如 PM 直接寄給對方部門 L2）回傳明確錯誤，訊息不送出
- [ ] target session 已關閉時，訊息進入 pending 狀態，session resume 時自動補送
- [ ] Dashboard 訊息面板能看到所有 SendMessage 流動
- [ ] E2E 測試：boss → PM → tech-lead → backend-architect 四層接力跑通
- [ ] PM-006 在 postmortem-log.md 標記為「已解決」

---

## 8. 待老闆 G0 決策事項

| # | 議題 | 我的建議 |
|---|------|---------|
| 1 | Sprint 5 是否與 Sprint 4 併行？ | **順序**（Sprint 4 收尾後再啟動 5），避免 tech-lead 注意力分散 |
| 2 | 訊息頻率上限（防迴圈） | 20 條/session/小時 起跳，retro 後調整 |
| 3 | 跨層級指揮是否完全禁止？ | **完全禁止**：boss 只能對 L1，L1 只能對自己 manages 名單，否則必須走 reportsTo 路徑 |
| 4 | MCP 失敗時 fallback 行為 | **明確 error**（不要靜默退化），讓 agent 知道訊息沒送出 |

---

**老闆決策**: [x] 通過 / [ ] 調整 / [ ] 擱置

### G0 決策紀錄（2026-04-28）

| # | 議題 | PM 建議 | 老闆裁示 |
|---|------|---------|---------|
| 1 | Sprint 5 與 Sprint 4 併行/順序 | 順序 | （依建議：Sprint 4 收尾後啟動） |
| 2 | 訊息頻率上限 | 20 條/session/小時 | （依建議，retro 後調整） |
| 3 | 跨層級指揮 | 完全禁止，必須走 reportsTo | （依建議） |
| 4 | MCP 失敗 fallback | 明確 error，不靜默退化 | （依建議） |

> 老闆核准方式：對話直接覆「OK」，未對 4 條建議提出調整 → 全數依建議定案。
> 後續：等 Sprint 4 retro 完成 → tech-lead 寫 dev-plan → 派工。
