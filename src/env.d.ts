/// <reference types="vite/client" />

interface ResumableSession {
  conversationId: string;
  projectPath: string;
  projectName: string;
  firstMessage: string;
  lastModified: string;
  fileSize: number;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface MaestroApi {
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
    scanResumable: (limit?: number) => Promise<ResumableSession[]>;
    getCostStats: (filters?: { projectId?: string; days?: number }) => Promise<{
      totals: {
        sessions: number;
        totalCost: number;
        inputTokens: number;
        outputTokens: number;
        toolCalls: number;
      };
      byAgent: Array<{ agentId: string; sessions: number; totalCost: number; totalTokens: number }>;
      byProject: Array<{ projectId: string; projectName: string; sessions: number; totalCost: number; totalTokens: number }>;
      daily: Array<{ day: string; cost: number; sessions: number }>;
    }>;
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
    send: (params: {
      fromAgent: string;
      toAgent: string;
      content: string;
      projectId?: string | null;
      replyTo?: string | null;
    }) => Promise<{
      id: string;
      fromAgent: string;
      toAgent: string;
      content: string;
      status: 'pending' | 'delivered' | 'read';
      projectId: string | null;
      sessionId: string | null;
      replyTo: string | null;
      createdAt: string;
      deliveredAt: string | null;
      readAt: string | null;
    }>;
    list: (filters?: {
      agent?: string;
      toAgent?: string;
      fromAgent?: string;
      projectId?: string;
      status?: 'pending' | 'delivered' | 'read';
      limit?: number;
    }) => Promise<Array<{
      id: string;
      fromAgent: string;
      toAgent: string;
      content: string;
      status: 'pending' | 'delivered' | 'read';
      projectId: string | null;
      sessionId: string | null;
      replyTo: string | null;
      createdAt: string;
      deliveredAt: string | null;
      readAt: string | null;
    }>>;
    get: (id: string) => Promise<{
      id: string;
      fromAgent: string;
      toAgent: string;
      content: string;
      status: 'pending' | 'delivered' | 'read';
      projectId: string | null;
      sessionId: string | null;
      replyTo: string | null;
      createdAt: string;
      deliveredAt: string | null;
      readAt: string | null;
    } | null>;
    markRead: (id: string) => Promise<{ success: boolean }>;
    getUnreadCount: (agentId: string, projectId?: string | null) => Promise<{ count: number }>;
  };
  memory: {
    list: (agentId: string, projectId?: string | null) => Promise<Array<{
      id: string;
      agentId: string;
      projectId: string | null;
      key: string;
      value: string;
      createdAt: string;
      updatedAt: string;
    }>>;
    save: (params: {
      agentId: string;
      projectId?: string | null;
      key: string;
      value: string;
    }) => Promise<{ id: string; updated: boolean }>;
    delete: (params: {
      agentId: string;
      key: string;
      projectId?: string | null;
    }) => Promise<{ success: boolean }>;
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
    taskUpdated: (callback: (data: { projectId: string; taskId: string; fromStatus: string; toStatus: string }) => void) => void;
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

interface Window {
  maestro: MaestroApi;
}
