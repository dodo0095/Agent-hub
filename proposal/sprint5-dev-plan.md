# 開發計畫書: Sprint 5 — 跨 Agent 通訊機制（SendMessage MCP Server）

> **撰寫者**: tech-lead
> **日期**: 2026-04-28
> **專案**: AgentHub
> **Sprint 提案書**: [sprint5-proposal.md](./sprint5-proposal.md)
> **狀態**: G0 通過，執行中

---

> 本文件在 G0 通過後由 tech-lead 撰寫，依據提案書中勾選的步驟展開技術細節。
> PM-006 的根因：`prompt-assembler.ts:267` 注入 `SendMessage` 工具但 harness 從未部署對應實作。
> 本 Sprint 直接做完整版：把 `message-broker.send()` 包成 MCP server，真正暴露給 agent session 呼叫。

## 1. 需求摘要

`message-broker.ts` 已完整實作跨 agent 訊息傳遞（PTY 注入 + JSON inbox 同步 + 排程補送），但只能透過 Electron IPC（GUI 側）觸發，agent session 內完全呼叫不到。本 Sprint 的目標：

1. 實作 **Claude Code MCP Server**，暴露 `send_message` + `list_inbox` 兩個工具
2. Session spawn 時自動注入 `--mcp-config`，讓每個 agent 啟動時就有這兩個工具可用
3. **白名單安全模型**：每個 agent 只能寄訊息給 `manages`、`reportsTo`、`coordinatesWith` 名單內的對象
4. 更新 prompt-assembler 單元測試，確保「宣告的工具 = 實際工具」，防止 PM-006 重演
5. PM-006 在 `postmortem-log.md` 標記為「已解決」

### 確認的流程

需求 → 設計 → 實作 → G2 → 測試 → G3 → 文件 → G4

（跳過 G1 UI 圖稿、G5 部署、G6 發佈）

### 阻斷規則

- 安全模型設計確認前，不得開始 MCP server 實作
- G2（實作）通過前不得進行 E2E 測試

---

## 2. 技術方案

### 核心架構決策：JSON Inbox 橋接模式

MCP server 是由 Claude Code CLI 直接 spawn 的子程序，**無法 import Electron main process 的服務**（會有 circular dep + process boundary 問題）。選擇透過已有的 JSON inbox 檔案橋接：

```
Agent Session
  └─ Claude Code CLI
       └─ MCP Server (stdio)
            ├─ send_message → 寫入 ~/.claude/teams/default/inboxes/{to}.json
            └─ list_inbox  → 讀取 ~/.claude/teams/default/inboxes/{me}.json

Electron Main Process
  └─ MessageBroker.inboxPoller（每 3 秒）
       └─ 讀取 inboxes/*.json → PTY 注入 → DB 持久化 → EventBus UI 更新
```

**優點**：
- 完全重用 `message-broker.ts` 已有的 inbox polling 機制
- MCP server 無需跨 process boundary 呼叫 Electron
- DB 持久化由 MessageBroker 負責，MCP server 只做輕量檔案 I/O
- 符合 PM-004 教訓：subprocess 不依賴 env var 繼承

**已知限制**：
- 訊息延遲最多 3 秒（inbox poll interval）
- MCP server 不直接回傳 DB message ID（回傳 UUID 供追蹤）

### MCP Server 工具 Schema

```typescript
// Tool 1: send_message
{
  name: 'send_message',
  description: '寄訊息給另一位 Agent',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Agent ID（如 tech-lead, product-manager）' },
      content: { type: 'string', description: '訊息內容' },
      reply_to: { type: 'string', description: '回覆的訊息 ID（選填）' }
    },
    required: ['to', 'content']
  }
}

// Tool 2: list_inbox
{
  name: 'list_inbox',
  description: '查看收件匣（未讀訊息）',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: '最多回傳幾則（預設 10，最大 50）' },
      include_read: { type: 'boolean', description: '是否包含已讀（預設 false）' }
    }
  }
}
```

### Per-Session 設定注入流程

Electron 在 `buildClaudeArgs()` 中（`session-spawn-helpers.ts`）：

```
1. 從 AgentLoader 取得 agent 定義（manages / reportsTo / coordinatesWith）
2. 計算 allowedTargets = manages ∪ {reportsTo} ∪ coordinatesWith
3. 寫 mcp-agent-config-{sessionId}.json：
   { agentId, allowedTargets, inboxDir, projectId, rateLimit }
4. 寫 mcp-servers-{sessionId}.json（Claude CLI MCP config）：
   { mcpServers: { send-message: { command: "node", args: [serverPath, configPath] } } }
5. 在 Claude CLI args 加入 --mcp-config {mcp-servers-{sessionId}.json}
```

### 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|------|------|------|------|
| A: JSON Inbox 橋接（本方案） | 重用現有基礎設施、無 process boundary | 最多 3 秒延遲 | ✅ **選定** |
| B: HTTP 本地伺服器（Electron 暴露） | 即時、可回傳 DB ID | 需管理 port、Windows 防火牆風險 | ❌ 排除 |
| C: Named pipe / IPC socket | 即時、原生 | Windows 實作複雜、測試麻煩 | ❌ 排除 |
| D: 直接呼叫 Electron IPC | 即時 | MCP subprocess 無法呼叫 Electron contextBridge | ❌ 不可行 |

### 訊息頻率限制（G0 決策）

- 20 條 / session / 小時
- 由 MCP server 在記憶體中追蹤（per agentId），Electron 不需介入
- 超限回傳明確 error，不靜默退化

---

## 3. UI 圖稿

> 本 Sprint 無 UI 變更，略過 G1 審核。
> Dashboard 訊息面板已有（Sprint 3 實作），本 Sprint 不動 GUI。

---

## 4. 檔案變更清單

### 新增

| 檔案 | 用途 |
|------|------|
| `electron/mcp/send-message-server.ts` | MCP stdio server 主程式（TypeScript 原始碼） |
| `electron/mcp/send-message-server.js` | 編譯後的執行檔（Node.js，不依賴 Electron） |
| `electron/mcp/types.ts` | MCP server 用的型別定義（AgentMcpConfig 等） |
| `tests/mcp/send-message-server.test.ts` | MCP server 單元測試（whitelist / inbox write） |
| `tests/services/prompt-assembler-tool-sync.test.ts` | SendMessage 工具一致性測試 |

### 修改

| 檔案 | 變更內容 |
|------|---------|
| `electron/services/session-spawn-helpers.ts` | `buildClaudeArgs()` 加白名單計算 + `--mcp-config` 注入 |
| `electron/services/agent-loader.ts` | 確認 `manages / reportsTo / coordinatesWith` 欄位有正確暴露 |
| `electron/types/index.ts` | 新增 `AgentMcpConfig`、`McpServerConfig` 型別 |
| `electron/utils/cleanup.ts`（若存在）或新增邏輯 | session 結束後清理 mcp-agent-config-*.json、mcp-servers-*.json |
| `.knowledge/postmortem-log.md` | PM-006 標記為「已解決」，補充解決方案 |
| `.knowledge/architecture.md` | Sprint 5 新增區塊：SendMessage MCP Server |

### 刪除

| 檔案 | 原因 |
|------|------|
| （無） | — |

---

## 5. 介面設計

### MCP Config 型別定義

```typescript
// electron/mcp/types.ts

/** 寫入 .maestro-prompts/mcp-agent-config-{sessionId}.json */
export interface AgentMcpConfig {
  /** 發訊息的 agent（送出端身份） */
  agentId: string;
  /** 允許寄送的對象清單（manages ∪ reportsTo ∪ coordinatesWith） */
  allowedTargets: string[];
  /** JSON inbox 目錄：~/.claude/teams/default/inboxes/ */
  inboxDir: string;
  /** 目前專案 ID（選填，寫入 inbox 的 project 欄位） */
  projectId: string | null;
  /** 訊息頻率上限（預設 20 條/小時） */
  rateLimit: number;
}

/** 寫入 .maestro-prompts/mcp-servers-{sessionId}.json（Claude CLI --mcp-config 格式） */
export interface McpServerConfig {
  mcpServers: {
    'send-message': {
      command: 'node';
      args: [string, string]; // [serverScriptPath, agentConfigPath]
      type: 'stdio';
    };
  };
}
```

### MCP Server 回應格式

```typescript
// send_message 成功回應
{ message_id: string; status: 'pending'; to: string; queued_at: string }

// send_message 失敗（越權）
{ error: 'UNAUTHORIZED'; message: `${from} 無權傳送訊息給 ${to}` }

// send_message 失敗（頻率超限）
{ error: 'RATE_LIMITED'; message: '訊息頻率超限（20條/小時），請稍後再試' }

// list_inbox 成功回應
{ messages: Array<{ from: string; content: string; timestamp: string; read: boolean; project: string | null }> }
```

### JSON Inbox 格式（與現有 message-broker 相同）

```json
[
  {
    "from": "product-manager",
    "text": "訊息內容",
    "summary": "訊息內容前 80 字",
    "timestamp": "2026-04-28T10:30:00.000Z",
    "read": false,
    "project": "project-uuid-or-null",
    "messageId": "uuid-v4"
  }
]
```

### session-spawn-helpers.ts 修改重點

```typescript
// buildClaudeArgs() 中，system prompt 寫完後加入：

// 1. 取得 agent 定義
const agentDef = agentLoader.getAgent(params.agentId);

// 2. 計算白名單
const allowedTargets = [
  ...(agentDef?.manages ?? []),
  ...(agentDef?.reportsTo ? [agentDef.reportsTo] : []),
  ...(agentDef?.coordinatesWith ?? []),
];

// 3. 寫 agent config
const mcpAgentConfig: AgentMcpConfig = {
  agentId: params.agentId,
  allowedTargets,
  inboxDir: join(homedir(), '.claude', 'teams', 'default', 'inboxes'),
  projectId: params.projectId || null,
  rateLimit: 20,
};
const mcpAgentConfigPath = join(promptDir, `mcp-agent-config-${sessionId.slice(0, 8)}.json`);
writeFileSync(mcpAgentConfigPath, JSON.stringify(mcpAgentConfig, null, 2), 'utf-8');

// 4. 寫 MCP servers config
const serverScriptPath = getMcpServerPath(); // 類似 getStatuslineScriptPath()
const mcpServersConfig: McpServerConfig = {
  mcpServers: {
    'send-message': {
      command: 'node',
      args: [serverScriptPath, mcpAgentConfigPath],
      type: 'stdio',
    }
  }
};
const mcpServersConfigPath = join(promptDir, `mcp-servers-${sessionId.slice(0, 8)}.json`);
writeFileSync(mcpServersConfigPath, JSON.stringify(mcpServersConfig), 'utf-8');

// 5. 注入 CLI arg
args.push('--mcp-config', mcpServersConfigPath);
```

---

## 6. 任務定義與分配

> tech-lead 讀取本節後按依賴順序執行。第一步先執行 `/task-delegation` 建立 `.tasks/sprint-5/` 檔案。

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 依賴 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|---------|---------|
| T1 | 設計確認 + 安全模型 | 確認 MCP schema、白名單規則、config 格式、rate limit；產出設計文件（可為 inline 或 comment） | tech-lead | 無 | 設計 | allowedTargets 計算規則文件化；MCP tool schema 定稿；老闆無異議 |
| T2 | MCP server 實作 | 撰寫 `electron/mcp/send-message-server.ts`；實作 send_message + list_inbox；whitelist 驗證；rate limit；編譯為 .js | backend-architect | T1 | 實作 | `send_message` 白名單內成功寫 inbox JSON；越權回傳 UNAUTHORIZED；rate limit 回傳 RATE_LIMITED；`list_inbox` 正確讀取；`node send-message-server.js` 啟動不崩潰 |
| T3 | Spawn 注入 | `session-spawn-helpers.ts` 的 `buildClaudeArgs()` 加白名單計算 + config 寫入 + `--mcp-config` arg；`getMcpServerPath()` 函數（dev/packaged 雙模式） | backend-architect | T1 | 實作 | 新 session spawn 後，`.maestro-prompts/` 目錄有對應 mcp-agent-config / mcp-servers 兩個 JSON 檔；Claude CLI 啟動時能載入 MCP server（ToolSearch 可見 send_message）|
| T4 | Agent-loader 欄位確認 | 確認 `agent-loader.ts` 的 `manages`、`reportsTo`、`coordinatesWith` 欄位有正確解析並暴露；如缺少則補強 | backend-architect | 無 | 實作 | `agentLoader.getAgent('tech-lead')` 能正確回傳三個欄位 |
| T5 | Prompt-assembler 一致性測試 | `tests/services/prompt-assembler-tool-sync.test.ts`：解析所有 agent system prompt 中提及的工具名稱，斷言每個名稱都存在於 MCP server 工具清單中 | backend-architect | T2 | 實作 | 測試通過；若新增工具 → prompt 不更新會失敗 |
| T6 | MCP server 單元測試 | `tests/mcp/send-message-server.test.ts`：白名單允許 / 拒絕、inbox 寫入格式、rate limit、list_inbox 讀取 | backend-architect | T2 | 測試 | 6 個測試案例全通過（見第 7 節）|
| T7 | G2 內部 Review | tech-lead 對 T2~T6 做 Code Review（對程式碼 + 對規範） | tech-lead | T2, T3, T4, T5, T6 | G2 | 0 Blocker、0 Major → 通過 → `/pm-review` |
| T8 | E2E：4 層通訊接力 | 啟動 boss session → 呼叫 SendMessage(to: 'product-manager') → 驗證 PM inbox 收到 → PM session 呼叫 SendMessage(to: 'tech-lead') → tech-lead 收到 → tech-lead SendMessage(to: 'backend-architect') → backend-architect 收到；全鏈通 | tech-lead | T7 | 測試 | 4 個 agent PTY 全都收到格式正確的訊息；訊息延遲 ≤ 5 秒（含 3 秒 poll）|
| T9 | E2E：越權攔截 | 讓 L2 agent 嘗試 SendMessage 給跨部門的 L2 → 驗證回傳 UNAUTHORIZED、訊息不寫入 inbox | tech-lead | T7 | 測試 | 越權呼叫明確被拒絕，inbox 無對應記錄 |
| T10 | E2E：rate limit | 單一 session 連發 21 條 → 第 21 條應回傳 RATE_LIMITED | tech-lead | T7 | 測試 | 前 20 條成功，第 21 條 RATE_LIMITED |
| T11 | G3 測試驗收 | T8~T10 全通過後提交 G3 Gate | tech-lead | T8, T9, T10 | G3 | `/pm-review` 通過 |
| T12 | 文件更新 + PM-006 收尾 | 更新 `architecture.md` Sprint 5 區塊；`postmortem-log.md` PM-006 標記已解決 + 補解法；CLAUDE.md 無需更新（架構文件索引已有） | tech-lead | T11 | 文件 | architecture.md Sprint 5 區塊完整；PM-006 狀態更新為「✅ 已解決」|
| T13 | G4 文件審查 | 確認文件與實作一致，送 G4 | tech-lead | T12 | G4 | G4 通過 |

### 依賴圖

```
T4 (agent-loader) ───────────────────────────────┐
T1 (設計確認) ─┬─ T2 (MCP server) ─┬─ T5 (prompt test) ─┐
               └─ T3 (spawn 注入) ──┤                     ├─ T7 (G2 Review)
                                    └─ T6 (MCP test) ─────┘
                                                               │
                                                         ┌─────┴─────┐
                                                    T8 (E2E 4層)  T9 (越權)  T10 (rate)
                                                         └─────┬─────┘
                                                            T11 (G3)
                                                               │
                                                           T12 (文件)
                                                               │
                                                           T13 (G4)
```

### L1 執行指令

```
請執行 Sprint 5 跨 Agent 通訊機制開發計畫。

📄 計畫書：proposal/sprint5-dev-plan.md
📋 你（tech-lead）負責的任務：T1, T7, T8, T9, T10, T11, T12, T13（第 6 節）
🔧 委派 backend-architect：T2, T3, T4, T5, T6（MCP server 實作 + 測試）

⚠️ 阻斷規則：
  - T2、T3 必須等 T1 完成（設計確認通過後才動工）
  - T8~T10 必須等 T7 通過（G2 Review 通過後才做 E2E）
  - T4 可與 T1 並行（獨立任務）

⚠️ 技術注意事項：
  - MCP server 編譯為獨立 .js（不能 import Electron modules）
  - 使用 JSON inbox 橋接，不直接呼叫 messageBroker
  - getMcpServerPath() 需支援 dev（__dirname）和 packaged（resourcesPath）兩個模式
  - IPC 四方同步規則：本 Sprint 不新增 IPC channel，不觸發此規則

第一步請先執行 /task-delegation 建立任務檔案。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `electron/services/session-spawn-helpers.ts` | T3 | 高（spawn 流程核心，改壞會影響所有 session）|
| `electron/services/agent-loader.ts` | T4, T3 | 中（T4 先確認再 T3 使用）|
| `.maestro-prompts/` 目錄 | T3, cleanup | 低（新增 2 種 JSON 檔，不影響現有 prompt/settings 檔案）|

---

## 7. 測試計畫

### 單元測試（T5、T6）

| 測試檔案 | 測試案例 |
|---------|---------|
| `tests/mcp/send-message-server.test.ts` | (1) 白名單內 send → inbox JSON 有新記錄；(2) 越權 send → UNAUTHORIZED，inbox 不變；(3) 連發 21 條 → 第 21 RATE_LIMITED；(4) list_inbox → 正確讀取未讀；(5) list_inbox include_read → 含已讀；(6) 訊息 content > 50KB → 截斷 |
| `tests/services/prompt-assembler-tool-sync.test.ts` | (1) tech-lead system prompt 提及 SendMessage → MCP server tool 清單包含 send_message；(2) 所有有 colleagues 的 agent prompt 都有 send_message 可用；(3) 無 colleagues 的 agent（如 solo L2）prompt 不注入 SendMessage 段落（若現有邏輯如此）|

### E2E 測試（T8~T10）

| 測試場景 | 測試案例 |
|---------|---------|
| E2E-4層接力（T8） | boss → product-manager → tech-lead → backend-architect 全鏈通；每步驗證 inbox JSON 有新記錄、PTY 收到格式化訊息 |
| 越權攔截（T9） | literature-scout（academic L2）→ backend-architect（engineering L2）→ UNAUTHORIZED；inbox 無新記錄 |
| Rate limit（T10） | 單一 session 連發 21 條到同一對象；前 20 ✅，第 21 RATE_LIMITED |

> E2E 測試為人工驗證（非自動化），驗收時由 tech-lead 實際操作並截圖記錄結果。

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| `--mcp-config` Claude CLI flag 在 Windows 行為異常 | 高 | 啟動時加 verbose log；若 flag 不支援當前版本則 fallback：MCP server 改用 `--add-mcp` 或改用 `settings.json` 注入 |
| MCP server 啟動失敗（node 路徑找不到）| 高 | `getMcpServerPath()` dev/packaged 雙模式 + 啟動前存在性檢查；失敗時 log warn 但不阻擋 session spawn（graceful degradation）|
| `~/.claude/teams/default/inboxes/` 目錄不存在 | 中 | MCP server 啟動時 `mkdirSync(inboxDir, { recursive: true })`（已有 MessageBroker 同樣邏輯可參考）|
| 多個 session 同時寫同一個 inbox JSON（race condition） | 中 | 接受最終一致性（目前 MessageBroker 也有此問題）；後續用 file lock 或 db 替代，本 Sprint 不處理 |
| agent-loader.ts 欄位缺少（coordinatesWith 可能未解析）| 中 | T4 先確認，有問題立即補強；完成後才啟動 T3 |
| Rate limit 記憶體追蹤在 server restart 後重置 | 低 | 已知 limitation，接受；Electron restart 等同清除計數，符合合理預期 |
| PM-006 prompt 清單與 MCP tool 名稱 case/hyphen 不一致 | 低 | T5 測試會 catch 這個問題；修正 prompt-assembler 的 SendMessage 說明文字 |

---

## 9. 文件更新

完成後需同步更新：

- [ ] `.knowledge/architecture.md`：Sprint 5 新增區塊（SendMessage MCP Server、JSON inbox 橋接、白名單機制）
- [ ] `.knowledge/postmortem-log.md`：PM-006 補充解法 + 標記 ✅ 已解決（2026-04-28）

不需更新：
- `CLAUDE.md`：無新增知識庫文件
- `agent-roster.md`：無新增 Agent

---

## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | 2026-04-29 | ✅ done | 設計在 dev-plan §2、§5 已完整記錄，老闆確認無調整意見 |
| T2 | 2026-04-29 | ✅ done | G2 通過；send-message-server.ts 零 Electron import，8 TC 全過 |
| T3 | 2026-04-29 | ✅ done | G2 通過；getMcpServerPath() dev/packaged 雙模式，graceful degradation 到位 |
| T4 | 2026-04-29 | ✅ done | G2 通過；三欄位 fallback 正確，getAgent() alias 新增 |
| T5 | 2026-04-29 | ✅ done | G2 通過；6 TC 全過，MCP_TOOL_NAMES 常數驅動，防退化有效 |
| T6 | 2026-04-29 | ✅ done | G2 通過；8 TC 全過，tmpdir 隔離，純 Node.js |
| T7 | 2026-04-29 | ✅ done | G2 Review：0 Blocker / 0 Major / 3 Minor（記錄在案）|
| T8 | | | |
| T9 | | | |
| T10 | | | |
| T11 | | | |
| T12 | | | |
| T13 | | | |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| 設計 Review（T1）| 2026-04-29 | ✅ 通過 | 設計文件完整，老闆確認無調整 |
| 實作 Review（T2~T6）| 2026-04-29 | 通過 | Blocker:0 Major:0 Minor:3 — type duplication(M1), reply_to 靜默忽略(M2), list_inbox 未宣告(M3)；Minor 於 T12 處理 |
| 測試 Review（T8~T10）| | | |
| 文件 Review（T12）| | | |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-04-28 | ✅ 通過 | 老闆口頭核准；4 項議題全依 PM 建議定案（順序執行、20條/hr限制、跨層完全禁止、明確 error fallback）|
| G2 | | | |
| G3 | | | |
| G4 | | | |

---

**確認**: [ ] L1（tech-lead）確認 / [ ] 老闆確認
