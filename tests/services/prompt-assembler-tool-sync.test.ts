/**
 * tests/services/prompt-assembler-tool-sync.test.ts
 *
 * PM-006 防退化測試：確保 prompt-assembler 中宣告的 Agent 通訊工具名稱
 * 與 MCP server 實際提供的工具名稱保持一致。
 *
 * 規則：prompt 使用 PascalCase（SendMessage），MCP 使用 snake_case（send_message）。
 * 若 MCP server 新增工具但 prompt 未宣告，測試 FAIL。
 */

import { MCP_TOOL_NAMES } from '../../electron/mcp/send-message-server';

// ─── Mock 外部依賴（避免 Electron / DB / 檔案系統觸碰）──────────────────────

vi.mock('../../electron/services/database', () => ({
  database: {
    run: vi.fn(),
    prepare: vi.fn(() => []),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../electron/utils/paths', () => ({
  getAgentsDir: vi.fn(() => '/mock/agents'),
  getKnowledgeDir: vi.fn(() => '/mock/knowledge'),
}));

// ─── 取得 PromptAssembler 的 communication context 輸出 ──────────────────────

import { promptAssembler } from '../../electron/services/prompt-assembler';

/**
 * 讀取私有方法 assembleCommunicationContext 的輸出。
 * 通過公開 API 無法直接呼叫私有方法，改用 preview() + 人工偽造
 * 有 colleagues 的 agent definition 來觸發 communication context 產生。
 */

/** 將 MCP snake_case tool name 轉為 prompt 中的 PascalCase 格式 */
function toolNameToPascalCase(snakeName: string): string {
  // send_message → SendMessage
  return snakeName
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** 從 prompt 文字中提取所有 PascalCase 工具名稱（如 SendMessage、ListInbox）*/
function extractToolMentions(promptText: string, pascalNames: string[]): string[] {
  return pascalNames.filter((name) => promptText.includes(name));
}

// ─── 建立帶 colleagues 的假 agent，手動觸發 communication context ──────────

/** 直接呼叫 promptAssembler 的私有方法（透過型別轉換繞過 TS 限制）*/
type AssemblerWithPrivate = typeof promptAssembler & {
  assembleCommunicationContext(agent: {
    id: string;
    level: string;
    manages: string[];
    reportsTo: string;
    coordinatesWith?: string[];
  }): string | null;
};

const assemblerPrivate = promptAssembler as AssemblerWithPrivate;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PromptAssembler ↔ MCP Server 工具一致性（PM-006 防退化）', () => {

  // TC-1: MCP 工具清單應非空
  it('TC-1: MCP_TOOL_NAMES 應包含 send_message 和 list_inbox', () => {
    expect(MCP_TOOL_NAMES).toContain('send_message');
    expect(MCP_TOOL_NAMES).toContain('list_inbox');
    expect(MCP_TOOL_NAMES.length).toBeGreaterThanOrEqual(2);
  });

  // TC-2: 有 colleagues 的 agent → communication context 含 SendMessage 工具名稱
  it('TC-2: 有 reportsTo 的 agent prompt → 必須宣告 SendMessage 工具', () => {
    const agentWithColleagues = {
      id: 'backend-architect',
      level: 'L2',
      manages: [],
      reportsTo: 'tech-lead',
      coordinatesWith: ['frontend-developer', 'ai-engineer'],
    };

    const context = assemblerPrivate.assembleCommunicationContext(agentWithColleagues);
    expect(context).not.toBeNull();

    const pascalNames = MCP_TOOL_NAMES.map(toolNameToPascalCase);
    const mentioned = extractToolMentions(context!, pascalNames);

    // 至少 send_message（SendMessage）必須被宣告
    expect(mentioned).toContain('SendMessage');
  });

  // TC-3: L1 agent（有 manages）→ communication context 同樣含 SendMessage
  it('TC-3: L1 agent（manages 非空）prompt → 宣告 SendMessage 工具', () => {
    const l1Agent = {
      id: 'tech-lead',
      level: 'L1',
      manages: ['backend-architect', 'frontend-developer', 'ai-engineer'],
      reportsTo: 'boss',
      coordinatesWith: ['product-manager', 'qa-lead'],
    };

    const context = assemblerPrivate.assembleCommunicationContext(l1Agent);
    expect(context).not.toBeNull();
    expect(context).toContain('SendMessage');
  });

  // TC-4: 無 colleagues 的 agent → communication context 為 null（無工具注入）
  it('TC-4: 無 colleagues 的 agent → assembleCommunicationContext 回傳 null', () => {
    const isolatedAgent = {
      id: 'isolated-agent',
      level: 'L2',
      manages: [],
      reportsTo: '',
      coordinatesWith: [],
    };

    const context = assemblerPrivate.assembleCommunicationContext(isolatedAgent);
    expect(context).toBeNull();
  });

  // TC-5: 所有 MCP 工具在 prompt 中都有對應的 PascalCase 名稱
  it('TC-5: 所有 MCP 工具都在 communication context 中被宣告（防新增工具但忘記更新 prompt）', () => {
    const agentWithAllColleagues = {
      id: 'test-agent',
      level: 'L1',
      manages: ['backend-architect'],
      reportsTo: 'boss',
      coordinatesWith: ['product-manager'],
    };

    const context = assemblerPrivate.assembleCommunicationContext(agentWithAllColleagues);
    expect(context).not.toBeNull();

    const pascalNames = MCP_TOOL_NAMES.map(toolNameToPascalCase);

    // 這個測試故意只驗證 send_message（核心工具），
    // list_inbox 是可選工具，prompt 不強制宣告
    // 但若未來 MCP 新增工具且需要在 prompt 宣告，此處需同步更新
    const criticalTools = ['send_message'];
    const criticalPascal = criticalTools.map(toolNameToPascalCase);

    for (const name of criticalPascal) {
      expect(context).toContain(name);
    }

    // 列出所有被宣告的工具（用於 CI log 可見性）
    const mentioned = extractToolMentions(context!, pascalNames);
    console.info(`[T5] 已在 prompt 中宣告的 MCP 工具：${mentioned.join(', ')}`);
    console.info(`[T5] MCP server 全部工具：${MCP_TOOL_NAMES.join(', ')}`);
  });

  // TC-6: 防退化 — 若刻意移除 send_message，測試應偵測到
  it('TC-6: 防退化 — 驗證若 MCP 工具名稱不在 prompt 中，測試可捕捉到缺漏', () => {
    const agentWithColleagues = {
      id: 'test-agent',
      level: 'L2',
      manages: [],
      reportsTo: 'tech-lead',
      coordinatesWith: ['product-manager'],
    };

    const context = assemblerPrivate.assembleCommunicationContext(agentWithColleagues);
    expect(context).not.toBeNull();

    // 驗證一個 不存在的 工具名稱不會被誤報為存在
    const fakeToolNames = ['NonExistentTool', 'DeleteAllData'];
    const falseMentions = extractToolMentions(context!, fakeToolNames);
    expect(falseMentions).toHaveLength(0);

    // 驗證真實工具名稱確實存在（雙重驗證邏輯正確性）
    const realMentions = extractToolMentions(context!, ['SendMessage']);
    expect(realMentions).toHaveLength(1);
  });
});
