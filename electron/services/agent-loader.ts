import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import { getAgentsDir } from '../utils/paths';
import { logger } from '../utils/logger';
import type { AgentDefinition, Department } from '../types';

const DEPARTMENT_LABELS: Record<string, string> = {
  engineering: '工程部',
  design: '設計部',
  product: '產品部',
  marketing: '行銷部',
  testing: '測試部',
  'project-management': '專案管理部',
  'studio-operations': '工作室營運',
  company: '公司管理',
  bonus: '特殊',
  'academic-research': '學術研究部',
};

const DEPARTMENT_COLORS: Record<string, string> = {
  engineering: 'green',
  design: 'purple',
  product: 'blue',
  marketing: 'yellow',
  testing: 'red',
  'project-management': 'blue',
  'studio-operations': 'yellow',
  company: 'cyan',
  bonus: 'purple',
  'academic-research': 'indigo',
};

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // engineering
  'tech-lead': '技術主管',
  'backend-architect': '後端架構師',
  'frontend-developer': '前端工程師',
  'mobile-app-builder': '行動端工程師',
  'ai-engineer': 'AI 工程師',
  'rapid-prototyper': '快速原型師',
  'devops-automator': 'DevOps 自動化師',
  'test-writer-fixer': '測試撰寫修復師',
  // design
  'design-director': '設計總監',
  'brand-guardian': '品牌守護者',
  'ui-designer': 'UI 設計師',
  'ux-researcher': 'UX 研究員',
  'visual-storyteller': '視覺敘事師',
  'whimsy-injector': '趣味注入師',
  // product
  'product-manager': '產品經理',
  'feedback-synthesizer': '回饋分析師',
  'sprint-prioritizer': '衝刺排序師',
  'trend-researcher': '趨勢研究員',
  // marketing
  'marketing-lead': '行銷主管',
  'growth-hacker': '成長駭客',
  'content-creator': '內容創作者',
  'app-store-optimizer': '應用商店優化師',
  'instagram-curator': 'Instagram 策展人',
  'tiktok-strategist': 'TikTok 策略師',
  'twitter-engager': 'Twitter 互動師',
  'reddit-community-builder': 'Reddit 社群建設者',
  // testing
  'qa-lead': 'QA 主管',
  'api-tester': 'API 測試師',
  'performance-benchmarker': '效能基準測試師',
  'test-results-analyzer': '測試結果分析師',
  'tool-evaluator': '工具評估師',
  'workflow-optimizer': '流程優化師',
  // project-management
  'project-lead': '專案主管',
  'experiment-tracker': '實驗追蹤師',
  'project-shipper': '專案發佈師',
  'studio-producer': '工作室製作人',
  // studio-operations
  'operations-lead': '營運主管',
  'analytics-reporter': '分析報告師',
  'context-manager': '上下文管理師',
  'finance-tracker': '財務追蹤師',
  'infrastructure-maintainer': '基礎設施維護師',
  'legal-compliance-checker': '法規合規檢查師',
  'support-responder': '支援回應師',
  // bonus
  'joker': '小丑',
  'studio-coach': '工作室教練',
  'company-manager': '公司知識管理者',
  // academic-research
  'research-director': '研究總監',
  'literature-scout': '文獻搜尋員',
  'paper-writer': '論文撰寫員',
  'research-analyst': '研究分析員',
  'manuscript-reviewer': '稿件審查員',
  'research-visualizer': '研究視覺化員',
  'grant-writer': '計畫申請撰寫員',
};

/**
 * Fallback parser for agent .md files where gray-matter fails (invalid YAML).
 * Extracts key-value pairs from the frontmatter block using regex.
 */
function parseFrontmatterFallback(raw: string): { data: Record<string, any>; content: string } {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    // No frontmatter at all — entire file is content
    return { data: {}, content: raw };
  }

  const fmBlock = fmMatch[1];
  const content = fmMatch[2];
  const data: Record<string, any> = {};

  // Extract simple key: value pairs (single line)
  for (const line of fmBlock.split('\n')) {
    const kv = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
    if (kv) {
      const key = kv[1];
      let value: any = kv[2].trim();

      // Handle arrays like "Read, Write, Bash"
      if (key === 'tools' && !value.startsWith('[')) {
        data[key] = value.split(',').map((s: string) => s.trim());
        continue;
      }

      // Handle YAML list references (manages, coordinates_with)
      if (value.startsWith('[') && value.endsWith(']')) {
        data[key] = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, ''));
        continue;
      }

      data[key] = value;
    }
  }

  // Extract YAML list items (e.g., manages: \n  - item1 \n  - item2)
  const listPattern = /^(\w[\w_-]*)\s*:\s*\n((?:\s+-\s+.+\n?)+)/gm;
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listPattern.exec(fmBlock)) !== null) {
    const key = listMatch[1];
    const items = listMatch[2]
      .split('\n')
      .map((line) => line.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean);
    data[key] = items;
  }

  return { data, content };
}

class AgentLoader {
  private agents = new Map<string, AgentDefinition>();
  private departments = new Map<string, Department>();
  private loaded = false;

  load(): void {
    const agentsDir = getAgentsDir();
    const defsDir = join(agentsDir, 'definitions');

    if (!existsSync(defsDir)) {
      logger.warn(`Agent definitions directory not found: ${defsDir}`);
      return;
    }

    this.agents.clear();
    this.departments.clear();

    const deptDirs = readdirSync(defsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dept of deptDirs) {
      const deptPath = join(defsDir, dept);
      const files = readdirSync(deptPath).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        try {
          const filePath = join(deptPath, file);
          const raw = readFileSync(filePath, 'utf-8');

          // Try gray-matter first, fallback to manual parsing
          let data: Record<string, any>;
          let content: string;

          try {
            const parsed = matter(raw);
            data = parsed.data;
            content = parsed.content;
          } catch {
            // gray-matter failed (invalid YAML) — use fallback parser
            const fallback = parseFrontmatterFallback(raw);
            data = fallback.data;
            content = fallback.content;
          }

          const id = data.name || basename(file, '.md');
          const department = data.department || dept;
          const level = data.level || (data.manages && data.manages.length > 0 ? 'L1' : 'L2');
          const model = data.model || 'sonnet';
          const displayName = AGENT_DISPLAY_NAMES[id] || id;

          const agent: AgentDefinition = {
            id,
            name: displayName,
            level,
            department,
            description: data.description
              ? String(data.description).split('\\n')[0].split('\n')[0].slice(0, 200)
              : '',
            tools: Array.isArray(data.tools)
              ? data.tools
              : typeof data.tools === 'string'
                ? data.tools.split(',').map((t: string) => t.trim())
                : [],
            color: data.color || DEPARTMENT_COLORS[department] || 'purple',
            model,
            manages: data.manages || [],
            reportsTo: data.reports_to || data.reportsTo || '',
            coordinatesWith: data.coordinates_with || data.coordinatesWith || [],
            filePath,
          };

          // Store system prompt in a separate field for AgentDetail use
          (agent as any)._systemPrompt = content.trim();

          this.agents.set(id, agent);
        } catch (err) {
          logger.error(`Failed to load agent definition: ${file}`, err);
        }
      }
    }

    // Build department index
    for (const agent of this.agents.values()) {
      const dept = this.departments.get(agent.department);
      if (dept) {
        dept.agentCount++;
      } else {
        this.departments.set(agent.department, {
          id: agent.department,
          name: DEPARTMENT_LABELS[agent.department] || agent.department,
          color: DEPARTMENT_COLORS[agent.department] || 'purple',
          agentCount: 1,
        });
      }
    }

    this.loaded = true;
    logger.info(`Loaded ${this.agents.size} agents across ${this.departments.size} departments`);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getById(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  /** Alias for getById — used by session-spawn-helpers for MCP config injection. */
  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getSystemPrompt(id: string): string {
    const agent = this.agents.get(id);
    if (!agent) return '';
    return (agent as any)._systemPrompt || '';
  }

  getByDepartment(department: string): AgentDefinition[] {
    return this.getAll().filter((a) => a.department === department);
  }

  getFiltered(filters: { department?: string; level?: string; search?: string }): AgentDefinition[] {
    let result = this.getAll();

    if (filters.department) {
      result = result.filter((a) => a.department === filters.department);
    }
    if (filters.level) {
      result = result.filter((a) => a.level === filters.level);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }

    return result;
  }

  getDepartments(): Department[] {
    return Array.from(this.departments.values());
  }

  getCount(): number {
    return this.agents.size;
  }
}

export const agentLoader = new AgentLoader();
