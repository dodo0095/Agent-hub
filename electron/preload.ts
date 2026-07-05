import { contextBridge, ipcRenderer } from 'electron';

export interface MaestroApi {
  system: {
    getHealth: () => Promise<{
      version: string;
      claudeCodeAvailable: boolean;
      claudeCodeVersion: string | null;
      dbConnected: boolean;
      agentsLoaded: number;
      activeSessions: number;
    }>;
    selectFolder: () => Promise<string | null>;
    clearDatabase: () => Promise<{ deletedCounts: Record<string, number> }>;
  };
  sessions: {
    spawn: (params: {
      agentId: string;
      task: string;
      model?: string;
      maxTurns?: number;
      projectId?: string | null;
      taskId?: string | null;
      interactive?: boolean;
      parentSessionId?: string;
      resumeSessionId?: string;
      resumeConversationId?: string;
      projectPath?: string;
    }) => Promise<{ sessionId: string; ptyId: string }>;
    stop: (sessionId: string, force?: boolean) => Promise<{ success: boolean }>;
    list: (limit?: number) => Promise<unknown[]>;
    listByTask: (taskId: string) => Promise<unknown[]>;
    listByProject: (projectId: string) => Promise<unknown[]>;
    getActive: () => Promise<unknown[]>;
    getOutputBuffer: (ptyId: string) => Promise<string>;
    getLog: (sessionId: string) => Promise<string>;
    previewPrompt: (agentId: string, projectId?: string) => Promise<string>;
    assignTask: (params: {
      sessionId: string;
      taskId: string;
      taskTitle: string;
      taskDescription: string;
    }) => Promise<{ success: boolean }>;
    sendDelegation: (params: {
      sourceSessionId: string;
      targetSessionId: string;
      instruction: string;
    }) => Promise<unknown>;
    listDelegations: () => Promise<unknown[]>;
    requestSummary: (sessionId: string) => Promise<string | null>;
    getSummaries: (sessionId: string) => Promise<Array<{ content: string; createdAt: string }>>;
    scanResumable: (limit?: number) => Promise<import('./types').ResumableSession[]>;
    getCostStats: (filters?: { projectId?: string; days?: number }) => Promise<unknown>;
  };
  agents: {
    list: (filters?: {
      department?: string;
      level?: string;
      search?: string;
    }) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    getDepartments: () => Promise<unknown[]>;
  };
  tasks: {
    create: (params: unknown) => Promise<unknown>;
    list: (filters?: unknown) => Promise<unknown[]>;
    get: (projectId: string, id: string) => Promise<unknown>;
    update: (projectId: string, id: string, params: unknown) => Promise<unknown>;
    delete: (projectId: string, id: string) => Promise<{ success: boolean }>;
    transition: (params: { projectId?: string; taskId: string; toStatus: string }) => Promise<unknown>;
    addDependency: (projectId: string, taskId: string, dependsOnId: string) => Promise<{ success: boolean }>;
    removeDependency: (projectId: string, taskId: string, dependsOnId: string) => Promise<{ success: boolean }>;
    getReady: (projectId: string) => Promise<unknown[]>;
    getSessionCounts: (taskIds: string[]) => Promise<Record<string, { total: number; active: number }>>;
  };
  sprints: {
    create: (params: { projectId: string; name: string; goal?: string; sprintType?: string }) => Promise<unknown>;
    list: (projectId: string) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    start: (id: string) => Promise<unknown>;
    enterReview: (id: string) => Promise<unknown>;
    complete: (id: string) => Promise<unknown>;
    getStatus: (id: string) => Promise<unknown>;
  };
  projects: {
    create: (params: { name: string; description?: string; template?: string; workDir?: string }) => Promise<unknown>;
    list: () => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    update: (id: string, params: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<{ success: boolean }>;
    getBudget: (projectId: string) => Promise<unknown>;
    getStats: (projectId: string) => Promise<{
      tasksDone: number;
      tasksInProgress: number;
      totalTasks: number;
      totalTokens: number;
      totalCostUsd: number;
      activeSprint: { name: string; progressPct: number; activeCount: number } | null;
      latestGate: { type: string; status: string } | null;
    }>;
    initClaudeDir: (projectId: string) => Promise<{ success: boolean; created: string[]; error?: string }>;
    getClaudeDir: (projectId: string) => Promise<{ exists: boolean; files: Array<{ path: string; type: 'file' | 'dir' }> }>;
  };
  knowledge: {
    listTree: () => Promise<unknown[]>;
    readFile: (path: string) => Promise<string | null>;
    search: (query: string) => Promise<unknown[]>;
  };
  gates: {
    create: (params: {
      projectId: string;
      sprintId?: string | null;
      gateType: string;
    }) => Promise<unknown>;
    list: (filters?: unknown) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    submit: (params: {
      gateId: string;
      submittedBy: string;
      checklist: Record<string, boolean>;
    }) => Promise<unknown>;
    review: (params: {
      gateId: string;
      reviewer: string;
      decision: 'approved' | 'rejected';
      comment?: string;
      checklist?: Record<string, boolean>;
      itemReasons?: Record<string, string>;
    }) => Promise<unknown>;
    getChecklists: () => Promise<unknown[]>;
    initPipeline: (params: { projectId: string; sprintId: string }) => Promise<unknown[]>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    update: (params: { key: string; value: string; category?: string }) => Promise<unknown>;
    getAll: () => Promise<Record<string, string>>;
  };
  hooks: {
    getConfig: (workDir: string) => Promise<{
      autoInject: boolean;
      stopValidatorEnabled: boolean;
      stack: { testCommand: string; lintCommand: string };
    }>;
    updateConfig: (params: { workDir: string; autoInject?: boolean; stopValidatorEnabled?: boolean }) => Promise<{ success: boolean }>;
    list: (params?: { projectPath?: string }) => Promise<Array<{
      name: string;
      source: 'system' | 'user';
      scope: 'global' | 'project';
      projectPath?: string;
      type: string;
      matcher: string;
      enabled: boolean;
    }>>;
    get: (params: { name: string; scope?: string; projectPath?: string }) => Promise<{
      name: string;
      source: 'system' | 'user';
      scope: 'global' | 'project';
      projectPath?: string;
      type: string;
      matcher: string;
      enabled: boolean;
      script: string;
    }>;
    create: (params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    update: (params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    delete: (params: { name: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    toggle: (params: { name: string; enabled: boolean; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    getLogs: (filters?: { hookName?: string; result?: string; limit?: number; offset?: number; projectPath?: string; dateRange?: 'today' | '7d' | '30d' | 'all' }) => Promise<Array<{
      id: number;
      hook_name: string;
      hook_type: string;
      trigger_time: string;
      trigger_reason: string | null;
      result: 'blocked' | 'passed' | 'warned';
      details: string | null;
      session_id: string | null;
      scope: string;
      project_path: string | null;
      created_at: string;
    }>>;
    getStats: (projectPath?: string) => Promise<{ total: number; blocked: number; passed: number; warned: number }>;
  };
  skills: {
    list: (params?: { projectPath?: string }) => Promise<Array<{
      name: string;
      source: 'system' | 'user';
      scope: 'global' | 'project';
      projectPath?: string;
      enabled: boolean;
    }>>;
    get: (params: { name: string; scope?: string; projectPath?: string }) => Promise<{
      name: string;
      source: 'system' | 'user';
      scope: 'global' | 'project';
      projectPath?: string;
      enabled: boolean;
      content: string;
      deployedTo: string[];
    }>;
    create: (params: { name: string; content: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean; path: string }>;
    update: (params: { name: string; content: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    delete: (params: { name: string; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    deploy: (params: { name: string; projects: string[] }) => Promise<{ success: boolean; deployed: string[] }>;
    toggle: (params: { name: string; enabled: boolean; scope?: string; projectPath?: string }) => Promise<{ success: boolean }>;
    export: (params: { names: string[] }) => Promise<{
      version: number;
      exportedAt: string;
      skills: Array<{
        name: string;
        content: string;
        source: 'system' | 'user';
        scope: 'global' | 'project';
      }>;
    }>;
    import: (params: {
      bundle: {
        version: number;
        exportedAt: string;
        skills: Array<{
          name: string;
          content: string;
          source: 'system' | 'user';
          scope: 'global' | 'project';
        }>;
      };
      onConflict: 'skip' | 'overwrite';
    }) => Promise<{
      imported: string[];
      skipped: string[];
      overwritten: string[];
      errors: string[];
    }>;
  };
  messages: {
    send: (params: { fromAgent: string; toAgent: string; content: string; projectId?: string | null; replyTo?: string | null }) => Promise<unknown>;
    list: (filters?: { agent?: string; toAgent?: string; fromAgent?: string; projectId?: string; status?: string; limit?: number }) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    markRead: (id: string) => Promise<{ success: boolean }>;
    getUnreadCount: (agentId: string) => Promise<{ count: number }>;
  };
  memory: {
    list: (agentId: string, projectId?: string | null) => Promise<unknown[]>;
    save: (params: { agentId: string; projectId?: string | null; key: string; value: string }) => Promise<{ id: string; updated: boolean }>;
    delete: (params: { agentId: string; key: string; projectId?: string | null }) => Promise<{ success: boolean }>;
  };
  pitfall: {
    getOverdue: () => Promise<Array<{
      project: string;
      title: string;
      category: string;
      dueDate: string;
      daysOverdue: number;
      problem: string;
    }>>;
  };
  audit: {
    query: (params?: unknown) => Promise<unknown[]>;
  };
  git: {
    getStatus: (cwd: string) => Promise<unknown>;
    getDiff: (cwd: string) => Promise<unknown[]>;
    getFileDiff: (cwd: string, filePath: string) => Promise<{ original: string; modified: string }>;
    getLog: (cwd: string, limit?: number) => Promise<unknown[]>;
    getBranches: (cwd: string) => Promise<unknown>;
    createWorktree: (cwd: string, branch: string, path: string) => Promise<unknown>;
    removeWorktree: (cwd: string, path: string) => Promise<unknown>;
    listWorktrees: (cwd: string) => Promise<unknown[]>;
    stage: (cwd: string, files?: string[]) => Promise<{ success: boolean }>;
    commit: (cwd: string, message: string, files?: string[]) => Promise<{ hash: string; message: string; filesChanged: number }>;
    push: (cwd: string, remote?: string, branch?: string, setUpstream?: boolean) => Promise<{ success: boolean; branch: string; remote: string }>;
    pull: (cwd: string, remote?: string, branch?: string) => Promise<{ success: boolean; summary: string; filesChanged: number }>;
    createBranch: (cwd: string, branchName: string, checkout?: boolean) => Promise<{ success: boolean }>;
    checkout: (cwd: string, branchName: string) => Promise<{ success: boolean }>;
    deleteBranch: (cwd: string, branchName: string, force?: boolean) => Promise<{ success: boolean }>;
  };
  pty: {
    input: (ptyId: string, data: string) => void;
    resize: (ptyId: string, cols: number, rows: number) => void;
  };
  clipboard: {
    read: () => Promise<string>;
    write: (text: string) => Promise<{ success: boolean }>;
  };
  projectSync: {
    start: (params: { projectId: string; workDir: string }) => Promise<{ success: boolean }>;
    stop: (params: { projectId: string }) => Promise<{ success: boolean }>;
    fullSync: (params: { projectId: string; workDir: string }) => Promise<{
      tasksUpdated: number;
      gatesUpdated: number;
      errors: string[];
    }>;
  };
  on: {
    sessionEvent: (callback: (data: unknown) => void) => void;
    sessionStatus: (callback: (data: unknown) => void) => void;
    ptyData: (callback: (data: { ptyId: string; data: string }) => void) => void;
    notification: (callback: (data: unknown) => void) => void;
    agentsReloaded: (callback: (data: unknown) => void) => void;
    delegationReport: (callback: (data: unknown) => void) => void;
    gateStatusChanged: (callback: (data: unknown) => void) => void;
    projectSynced: (callback: (data: { projectId: string; type: string; filePath?: string }) => void) => void;
    messageCreated: (callback: (data: unknown) => void) => void;
    messageDelivered: (callback: (data: unknown) => void) => void;
    messageRead: (callback: (data: unknown) => void) => void;
    taskUpdated: (callback: (data: unknown) => void) => void;
    costBackfillCompleted: (callback: (data: {
      scanned: number;
      candidates: number;
      matched: number;
      written: number;
      totalUsdRecovered: number;
      durationMs: number;
    }) => void) => void;
  };
}

const api: MaestroApi = {
  system: {
    getHealth: () => ipcRenderer.invoke('system:get-health'),
    selectFolder: () => ipcRenderer.invoke('system:select-folder'),
    clearDatabase: () => ipcRenderer.invoke('system:clear-database'),
  },
  sessions: {
    spawn: (params) => ipcRenderer.invoke('session:spawn', params),
    stop: (sessionId, force) => ipcRenderer.invoke('session:stop', { sessionId, force }),
    list: (limit) => ipcRenderer.invoke('session:list', limit),
    listByTask: (taskId) => ipcRenderer.invoke('session:list-by-task', taskId),
    listByProject: (projectId) => ipcRenderer.invoke('session:list-by-project', projectId),
    getActive: () => ipcRenderer.invoke('session:get-active'),
    getOutputBuffer: (ptyId: string) => ipcRenderer.invoke('session:get-output-buffer', ptyId),
    getLog: (sessionId: string) => ipcRenderer.invoke('session:get-log', sessionId),
    previewPrompt: (agentId, projectId) =>
      ipcRenderer.invoke('session:preview-prompt', agentId, projectId),
    assignTask: (params) => ipcRenderer.invoke('session:assign-task', params),
    sendDelegation: (params) => ipcRenderer.invoke('session:send-delegation', params),
    listDelegations: () => ipcRenderer.invoke('session:list-delegations'),
    requestSummary: (sessionId) => ipcRenderer.invoke('session:request-summary', sessionId),
    getSummaries: (sessionId) => ipcRenderer.invoke('session:get-summaries', sessionId),
    scanResumable: (limit?) => ipcRenderer.invoke('session:scan-resumable', limit),
    getCostStats: (filters?: { projectId?: string; days?: number }) => ipcRenderer.invoke('session:cost-stats', filters),
  },
  agents: {
    list: (filters) => ipcRenderer.invoke('agent:list', filters),
    get: (id) => ipcRenderer.invoke('agent:get', id),
    getDepartments: () => ipcRenderer.invoke('agent:get-departments'),
  },
  tasks: {
    create: (params) => ipcRenderer.invoke('task:create', params),
    list: (filters) => ipcRenderer.invoke('task:list', filters),
    get: (projectId, id) => ipcRenderer.invoke('task:get', projectId, id),
    update: (projectId, id, params) => ipcRenderer.invoke('task:update', projectId, id, params),
    delete: (projectId, id) => ipcRenderer.invoke('task:delete', projectId, id),
    transition: (params) => ipcRenderer.invoke('task:transition', params),
    addDependency: (projectId, taskId, dependsOnId) =>
      ipcRenderer.invoke('task:add-dependency', projectId, taskId, dependsOnId),
    removeDependency: (projectId, taskId, dependsOnId) =>
      ipcRenderer.invoke('task:remove-dependency', projectId, taskId, dependsOnId),
    getReady: (projectId) => ipcRenderer.invoke('task:get-ready', projectId),
    getSessionCounts: (taskIds) => ipcRenderer.invoke('task:get-session-counts', taskIds),
  },
  sprints: {
    create: (params) => ipcRenderer.invoke('sprint:create', params),
    list: (projectId) => ipcRenderer.invoke('sprint:list', projectId),
    get: (id) => ipcRenderer.invoke('sprint:get', id),
    start: (id) => ipcRenderer.invoke('sprint:start', id),
    enterReview: (id) => ipcRenderer.invoke('sprint:enter-review', id),
    complete: (id) => ipcRenderer.invoke('sprint:complete', id),
    getStatus: (id) => ipcRenderer.invoke('sprint:get-status', id),
  },
  projects: {
    create: (params) => ipcRenderer.invoke('project:create', params),
    list: () => ipcRenderer.invoke('project:list'),
    get: (id) => ipcRenderer.invoke('project:get', id),
    update: (id, params) => ipcRenderer.invoke('project:update', id, params),
    delete: (id) => ipcRenderer.invoke('project:delete', id),
    getBudget: (projectId) => ipcRenderer.invoke('project:get-budget', projectId),
    getStats: (projectId) => ipcRenderer.invoke('project:get-stats', projectId),
    initClaudeDir: (projectId) => ipcRenderer.invoke('project:init-claude-dir', projectId),
    getClaudeDir: (projectId) => ipcRenderer.invoke('project:get-claude-dir', projectId),
  },
  knowledge: {
    listTree: () => ipcRenderer.invoke('knowledge:list-tree'),
    readFile: (path) => ipcRenderer.invoke('knowledge:read-file', path),
    search: (query) => ipcRenderer.invoke('knowledge:search', query),
  },
  gates: {
    create: (params) => ipcRenderer.invoke('gate:create', params),
    list: (filters) => ipcRenderer.invoke('gate:list', filters),
    get: (id) => ipcRenderer.invoke('gate:get', id),
    submit: (params) => ipcRenderer.invoke('gate:submit', params),
    review: (params) => ipcRenderer.invoke('gate:review', params),
    getChecklists: () => ipcRenderer.invoke('gate:get-checklists'),
    initPipeline: (params) => ipcRenderer.invoke('gate:init-pipeline', params),
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    update: (params) => ipcRenderer.invoke('settings:update', params),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
  },
  hooks: {
    getConfig: (workDir: string) => ipcRenderer.invoke('hook:get-config', workDir),
    updateConfig: (params) => ipcRenderer.invoke('hook:update-config', params),
    list: (params?) => ipcRenderer.invoke('hook:list', params),
    get: (params) => ipcRenderer.invoke('hook:get', params),
    create: (params) => ipcRenderer.invoke('hook:create', params),
    update: (params) => ipcRenderer.invoke('hook:update', params),
    delete: (params) => ipcRenderer.invoke('hook:delete', params),
    toggle: (params) => ipcRenderer.invoke('hook:toggle', params),
    getLogs: (filters?) => ipcRenderer.invoke('hook:getLogs', filters),
    getStats: (projectPath?) => ipcRenderer.invoke('hook:getStats', projectPath),
  },
  skills: {
    list: (params?) => ipcRenderer.invoke('skill:list', params),
    get: (params) => ipcRenderer.invoke('skill:get', params),
    create: (params) => ipcRenderer.invoke('skill:create', params),
    update: (params) => ipcRenderer.invoke('skill:update', params),
    delete: (params) => ipcRenderer.invoke('skill:delete', params),
    deploy: (params) => ipcRenderer.invoke('skill:deploy', params),
    toggle: (params) => ipcRenderer.invoke('skill:toggle', params),
    export: (params) => ipcRenderer.invoke('skill:export', params),
    import: (params) => ipcRenderer.invoke('skill:import', params),
  },
  messages: {
    send: (params) => ipcRenderer.invoke('message:send', params),
    list: (filters?) => ipcRenderer.invoke('message:list', filters),
    get: (id) => ipcRenderer.invoke('message:get', id),
    markRead: (id) => ipcRenderer.invoke('message:mark-read', id),
    getUnreadCount: (agentId: string, projectId?: string | null) => ipcRenderer.invoke('message:unread-count', agentId, projectId),
  },
  memory: {
    list: (agentId: string, projectId?: string | null) => ipcRenderer.invoke('memory:list', agentId, projectId),
    save: (params: { agentId: string; projectId?: string | null; key: string; value: string }) => ipcRenderer.invoke('memory:save', params),
    delete: (params: { agentId: string; key: string; projectId?: string | null }) => ipcRenderer.invoke('memory:delete', params),
  },
  pitfall: {
    getOverdue: () => ipcRenderer.invoke('pitfall:getOverdue'),
  },
  audit: {
    query: (params) => ipcRenderer.invoke('audit:query', params),
  },
  git: {
    getStatus: (cwd) => ipcRenderer.invoke('git:get-status', cwd),
    getDiff: (cwd) => ipcRenderer.invoke('git:get-diff', cwd),
    getFileDiff: (cwd, filePath) => ipcRenderer.invoke('git:get-file-diff', cwd, filePath),
    getLog: (cwd, limit) => ipcRenderer.invoke('git:get-log', cwd, limit),
    getBranches: (cwd) => ipcRenderer.invoke('git:get-branches', cwd),
    createWorktree: (cwd, branch, path) =>
      ipcRenderer.invoke('git:create-worktree', cwd, branch, path),
    removeWorktree: (cwd, path) => ipcRenderer.invoke('git:remove-worktree', cwd, path),
    listWorktrees: (cwd) => ipcRenderer.invoke('git:list-worktrees', cwd),
    stage: (cwd, files?) => ipcRenderer.invoke('git:stage', cwd, files),
    commit: (cwd, message, files?) => ipcRenderer.invoke('git:commit', cwd, message, files),
    push: (cwd, remote?, branch?, setUpstream?) =>
      ipcRenderer.invoke('git:push', cwd, remote, branch, setUpstream),
    pull: (cwd, remote?, branch?) => ipcRenderer.invoke('git:pull', cwd, remote, branch),
    createBranch: (cwd, branchName, checkout?) =>
      ipcRenderer.invoke('git:create-branch', cwd, branchName, checkout),
    checkout: (cwd, branchName) => ipcRenderer.invoke('git:checkout', cwd, branchName),
    deleteBranch: (cwd, branchName, force?) =>
      ipcRenderer.invoke('git:delete-branch', cwd, branchName, force),
  },
  pty: {
    input: (ptyId, data) => ipcRenderer.send('pty:input', { ptyId, data }),
    resize: (ptyId, cols, rows) => ipcRenderer.send('pty:resize', { ptyId, cols, rows }),
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
  },
  on: {
    sessionEvent: (callback) => {
      ipcRenderer.on('session:event', (_e, data) => callback(data));
    },
    sessionStatus: (callback) => {
      ipcRenderer.on('session:status', (_e, data) => callback(data));
    },
    ptyData: (callback) => {
      ipcRenderer.on('pty:data', (_e, data) => callback(data));
    },
    notification: (callback) => {
      ipcRenderer.on('notification', (_e, data) => callback(data));
    },
    agentsReloaded: (callback) => {
      ipcRenderer.on('agents:reloaded', (_e, data) => callback(data));
    },
    delegationReport: (callback) => {
      ipcRenderer.on('delegation:report', (_e, data) => callback(data));
    },
    gateStatusChanged: (callback) => {
      ipcRenderer.on('gate:status-changed', (_e, data) => callback(data));
    },
    projectSynced: (callback) => {
      ipcRenderer.on('project-sync:status', (_e, data) => callback(data));
    },
    messageCreated: (callback: (data: unknown) => void) => {
      ipcRenderer.on('message:created', (_e, data) => callback(data));
    },
    messageDelivered: (callback: (data: unknown) => void) => {
      ipcRenderer.on('message:delivered', (_e, data) => callback(data));
    },
    messageRead: (callback: (data: unknown) => void) => {
      ipcRenderer.on('message:read', (_e, data) => callback(data));
    },
    taskUpdated: (callback: (data: unknown) => void) => {
      ipcRenderer.on('task:updated', (_e, data) => callback(data));
    },
    costBackfillCompleted: (callback) => {
      ipcRenderer.on('cost:backfill-completed', (_e, data) => callback(data));
    },
  },
  projectSync: {
    start: (params) => ipcRenderer.invoke('project-sync:start', params),
    stop: (params) => ipcRenderer.invoke('project-sync:stop', params),
    fullSync: (params) => ipcRenderer.invoke('project-sync:full', params),
  },
};

contextBridge.exposeInMainWorld('maestro', api);
