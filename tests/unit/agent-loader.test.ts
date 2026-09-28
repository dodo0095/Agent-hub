/**
 * agent-loader — academic-publication 部門註冊（Sprint 7 T3）
 *
 * 驗證載入真實 agents/definitions/ 後：
 * - getByDepartment('academic-publication') 回傳 publication-operator
 * - 部門中文名稱為「學術出版部」
 *
 * mock 手法沿用 tests/manual/skill-generator.test.ts：真讀 repo 內的
 * agents/ 目錄（不 mock fs），只 mock electron/utils/paths 與 logger。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { join } from 'path';

vi.mock('../../electron/utils/paths', () => ({
  getAgentsDir: () => join(process.cwd(), 'agents'),
  getKnowledgeDir: () => join(process.cwd(), 'knowledge'),
  getDataDir: () => join(process.cwd(), '.test-data'),
  getDbPath: () => join(process.cwd(), '.test-data', 'test.db'),
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { agentLoader } from '../../electron/services/agent-loader';

describe('agent-loader — academic-publication department', () => {
  beforeAll(() => {
    agentLoader.load();
  });

  it('registers the academic-publication department with the Chinese label', () => {
    const dept = agentLoader.getDepartments().find((d) => d.id === 'academic-publication');
    expect(dept).toBeDefined();
    expect(dept?.name).toBe('學術出版部');
  });

  it('getByDepartment("academic-publication") returns publication-operator', () => {
    const agents = agentLoader.getByDepartment('academic-publication');
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('publication-operator');
    expect(agents[0].name).toBe('出版流程操作員');
    expect(agents[0].reportsTo).toBe('research-director');
  });
});
