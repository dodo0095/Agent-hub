export const IpcChannels = {
  // System
  SYSTEM_GET_HEALTH: 'system:get-health',
  SYSTEM_SELECT_FOLDER: 'system:select-folder',
  SYSTEM_CLEAR_DATABASE: 'system:clear-database',

  // Sessions
  SESSION_SPAWN: 'session:spawn',
  SESSION_STOP: 'session:stop',
  SESSION_LIST: 'session:list',
  SESSION_LIST_BY_TASK: 'session:list-by-task',
  SESSION_LIST_BY_PROJECT: 'session:list-by-project',
  SESSION_GET_ACTIVE: 'session:get-active',
  SESSION_GET_OUTPUT_BUFFER: 'session:get-output-buffer',
  SESSION_GET_LOG: 'session:get-log',
  SESSION_PREVIEW_PROMPT: 'session:preview-prompt',
  SESSION_ASSIGN_TASK: 'session:assign-task',
  SESSION_SEND_DELEGATION: 'session:send-delegation',
  SESSION_LIST_DELEGATIONS: 'session:list-delegations',
  SESSION_REQUEST_SUMMARY: 'session:request-summary',
  SESSION_GET_SUMMARIES: 'session:get-summaries',
  SESSION_SCAN_RESUMABLE: 'session:scan-resumable',
  SESSION_COST_STATS: 'session:cost-stats',

  // Agents
  AGENT_LIST: 'agent:list',
  AGENT_GET: 'agent:get',
  AGENT_GET_DEPARTMENTS: 'agent:get-departments',

  // Tasks
  TASK_CREATE: 'task:create',
  TASK_LIST: 'task:list',
  TASK_GET: 'task:get',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_TRANSITION: 'task:transition',
  TASK_ADD_DEPENDENCY: 'task:add-dependency',
  TASK_REMOVE_DEPENDENCY: 'task:remove-dependency',
  TASK_GET_READY: 'task:get-ready',
  TASK_GET_SESSION_COUNTS: 'task:get-session-counts',

  // Sprints
  SPRINT_CREATE: 'sprint:create',
  SPRINT_LIST: 'sprint:list',
  SPRINT_GET: 'sprint:get',
  SPRINT_START: 'sprint:start',
  SPRINT_ENTER_REVIEW: 'sprint:enter-review',
  SPRINT_COMPLETE: 'sprint:complete',
  SPRINT_GET_STATUS: 'sprint:get-status',

  // Projects
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_GET_BUDGET: 'project:get-budget',
  PROJECT_GET_STATS: 'project:get-stats',
  PROJECT_INIT_CLAUDE_DIR: 'project:init-claude-dir',
  PROJECT_GET_CLAUDE_DIR: 'project:get-claude-dir',

  // Project Sync
  PROJECT_SYNC_START: 'project-sync:start',
  PROJECT_SYNC_STOP: 'project-sync:stop',
  PROJECT_SYNC_FULL: 'project-sync:full',
  PROJECT_SYNC_STATUS: 'project-sync:status',

  // Knowledge
  KNOWLEDGE_LIST_TREE: 'knowledge:list-tree',
  KNOWLEDGE_READ_FILE: 'knowledge:read-file',
  KNOWLEDGE_SEARCH: 'knowledge:search',

  // Gates
  GATE_CREATE: 'gate:create',
  GATE_LIST: 'gate:list',
  GATE_GET: 'gate:get',
  GATE_SUBMIT: 'gate:submit',
  GATE_REVIEW: 'gate:review',
  GATE_GET_CHECKLISTS: 'gate:get-checklists',
  GATE_INIT_PIPELINE: 'gate:init-pipeline',

  // Audit
  AUDIT_QUERY: 'audit:query',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Hooks
  HOOK_GET_CONFIG: 'hook:get-config',
  HOOK_UPDATE_CONFIG: 'hook:update-config',
  HOOK_LIST: 'hook:list',
  HOOK_GET: 'hook:get',
  HOOK_CREATE: 'hook:create',
  HOOK_UPDATE: 'hook:update',
  HOOK_DELETE: 'hook:delete',
  HOOK_TOGGLE: 'hook:toggle',
  HOOK_GET_LOGS: 'hook:getLogs',
  HOOK_GET_STATS: 'hook:getStats',

  // Skills
  SKILL_LIST: 'skill:list',
  SKILL_GET: 'skill:get',
  SKILL_CREATE: 'skill:create',
  SKILL_UPDATE: 'skill:update',
  SKILL_DELETE: 'skill:delete',
  SKILL_DEPLOY: 'skill:deploy',
  SKILL_TOGGLE: 'skill:toggle',
  SKILL_EXPORT: 'skill:export',
  SKILL_IMPORT: 'skill:import',

  // Agent Memory
  MEMORY_LIST: 'memory:list',
  MEMORY_SAVE: 'memory:save',
  MEMORY_DELETE: 'memory:delete',

  // Pitfall
  PITFALL_GET_OVERDUE: 'pitfall:getOverdue',

  // Git
  GIT_GET_STATUS: 'git:get-status',
  GIT_GET_DIFF: 'git:get-diff',
  GIT_GET_FILE_DIFF: 'git:get-file-diff',
  GIT_GET_LOG: 'git:get-log',
  GIT_GET_BRANCHES: 'git:get-branches',
  GIT_CREATE_WORKTREE: 'git:create-worktree',
  GIT_REMOVE_WORKTREE: 'git:remove-worktree',
  GIT_LIST_WORKTREES: 'git:list-worktrees',
  GIT_STAGE: 'git:stage',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_CHECKOUT: 'git:checkout',
  GIT_DELETE_BRANCH: 'git:delete-branch',

  // PTY
  PTY_INPUT: 'pty:input',
  PTY_RESIZE: 'pty:resize',

  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_LIST: 'message:list',
  MESSAGE_GET: 'message:get',
  MESSAGE_MARK_READ: 'message:mark-read',
  MESSAGE_UNREAD_COUNT: 'message:unread-count',

  // Push events (Main → Renderer)
  GATE_STATUS_CHANGED: 'gate:status-changed',
  SESSION_EVENT: 'session:event',
  SESSION_STATUS: 'session:status',
  PTY_DATA: 'pty:data',
  NOTIFICATION: 'notification',
  AGENTS_RELOADED: 'agents:reloaded',
  DELEGATION_REPORT: 'delegation:report',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  TASK_UPDATED: 'task:updated',
  COST_BACKFILL_COMPLETED: 'cost:backfill-completed',
} as const;

export interface IpcError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResumableSession {
  conversationId: string;
  projectPath: string;
  projectName: string;
  firstMessage: string;
  lastModified: string;
  fileSize: number;
}
