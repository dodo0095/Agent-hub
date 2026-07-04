import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useIpc } from '../composables/useIpc';
import { useAgentsStore } from './agents';
import { useProjectsStore } from './projects';
import { useUiStore, type SessionGroupMode } from './ui';

export interface SessionGroup {
  key: string;
  label: string;
  sessions: ActiveSession[];
}

export type SessionStatus =
  | 'starting'
  | 'running'
  | 'thinking'
  | 'executing_tool'
  | 'awaiting_approval'
  | 'waiting_input'
  | 'summarizing'
  | 'completed'
  | 'failed'
  | 'stopped';

export type LayoutMode = 'single' | 'list' | 'dual' | 'triple';

export interface ActiveSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  task: string;
  taskId: string | null;
  projectId: string | null;
  model: string;
  status: SessionStatus;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
  turnsCount: number;
  durationMs: number;
  startedAt: string;
  ptyId: string;
  /** PM-008: session 實際工作目錄（worktree 路徑或專案根目錄） */
  workDir: string;
  /** PM-008: worktree 綁定的分支；未使用 worktree 時為 null */
  gitBranch: string | null;
}

export interface SessionRecord {
  id: string;
  agent_id: string;
  task: string;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  model: string;
  status: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  turns_count: number;
  duration_ms: number;
  result_summary: string | null;
  parent_session_id: string | null;
  claude_conversation_id: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ResumableSession {
  conversationId: string;
  projectPath: string;
  projectName: string;
  firstMessage: string;
  lastModified: string;
  fileSize: number;
}

export const useSessionsStore = defineStore('sessions', () => {
  const ipc = useIpc();

  const activeSessions = ref<ActiveSession[]>([]);
  const history = ref<SessionRecord[]>([]);
  const resumableSessions = ref<ResumableSession[]>([]);
  const stored = localStorage.getItem('maestro-layout-mode') as LayoutMode | null;
  const layoutMode = ref<LayoutMode>(
    stored && stored !== 'list' ? stored : 'single',
  );
  const selectedSessionId = ref<string | null>(null);
  const loading = ref(false);

  const activeCount = computed(() => activeSessions.value.length);
  const totalTokens = computed(() =>
    activeSessions.value.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0),
  );
  const totalCost = computed(() =>
    activeSessions.value.reduce((sum, s) => sum + s.costUsd, 0),
  );

  const selectedSession = computed(() =>
    activeSessions.value.find((s) => s.sessionId === selectedSessionId.value) || null,
  );

  const groupedSessions = computed<SessionGroup[]>(() => {
    const uiStore = useUiStore();
    const mode = uiStore.sessionGroupMode;
    if (mode === 'none') return [];

    const groups = new Map<string, ActiveSession[]>();

    if (mode === 'project') {
      const projectsStore = useProjectsStore();
      for (const s of activeSessions.value) {
        const key = s.projectId || '__none__';
        const list = groups.get(key) || [];
        list.push(s);
        groups.set(key, list);
      }
      return Array.from(groups.entries()).map(([key, sessions]) => {
        const project = key !== '__none__'
          ? projectsStore.projects.find((p) => p.id === key)
          : null;
        return { key, label: project?.name || '未指定專案', sessions };
      });
    }

    // department
    const agentsStore = useAgentsStore();
    for (const s of activeSessions.value) {
      const agent = agentsStore.getById(s.agentId);
      const key = agent?.department || '__none__';
      const list = groups.get(key) || [];
      list.push(s);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([key, sessions]) => ({
      key,
      label: key === '__none__' ? '未知部門' : key,
      sessions,
    }));
  });

  async function fetchActive() {
    try {
      const sessions = (await ipc.getActiveSessions()) as ActiveSession[];
      activeSessions.value = sessions;
    } catch (err) {
      console.error('Failed to fetch active sessions', err);
    }
  }

  async function fetchHistory(limit = 50) {
    try {
      history.value = (await ipc.listSessions(limit)) as SessionRecord[];
    } catch (err) {
      console.error('Failed to fetch session history', err);
    }
  }

  async function fetchResumable(limit = 50) {
    try {
      resumableSessions.value = (await ipc.scanResumableSessions(limit)) as ResumableSession[];
    } catch (err) {
      console.error('Failed to scan resumable sessions', err);
    }
  }

  async function resumeByConversationId(item: ResumableSession) {
    loading.value = true;
    try {
      const result = await ipc.spawnSession({
        agentId: '',
        task: item.firstMessage || '(resumed)',
        interactive: true,
        resumeConversationId: item.conversationId,
        projectPath: item.projectPath,
      });
      activeSessions.value.push({
        sessionId: result.sessionId,
        agentId: '(resumed)',
        agentName: '(resumed)',
        task: item.firstMessage || '(resumed)',
        taskId: null,
        projectId: null,
        model: 'sonnet',
        status: 'starting',
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCallsCount: 0,
        turnsCount: 0,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        ptyId: result.ptyId,
        workDir: item.projectPath,
        gitBranch: null,
      });
      selectedSessionId.value = result.sessionId;
      return result;
    } finally {
      loading.value = false;
    }
  }

  const taskSessions = ref<SessionRecord[]>([]);

  async function spawn(params: {
    agentId: string;
    task: string;
    model?: string;
    maxTurns?: number;
    projectId?: string | null;
    taskId?: string | null;
    interactive?: boolean;
    parentSessionId?: string;
    resumeSessionId?: string;
  }) {
    loading.value = true;
    try {
      const result = await ipc.spawnSession(params);
      // Immediately add a placeholder active session
      activeSessions.value.push({
        sessionId: result.sessionId,
        agentId: params.agentId,
        agentName: params.agentId,
        task: params.task,
        taskId: params.taskId || null,
        projectId: params.projectId || null,
        model: params.model || 'sonnet',
        status: 'starting',
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCallsCount: 0,
        turnsCount: 0,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        ptyId: result.ptyId,
        // placeholder：真實 workDir / gitBranch 由下一次 fetchActive() 從主進程帶回
        workDir: '',
        gitBranch: null,
      });
      selectedSessionId.value = result.sessionId;
      return result;
    } finally {
      loading.value = false;
    }
  }

  async function fetchByTask(taskId: string) {
    try {
      taskSessions.value = (await ipc.listSessionsByTask(taskId)) as SessionRecord[];
    } catch (err) {
      console.error('Failed to fetch sessions by task', err);
    }
  }

  async function fetchByProject(projectId: string) {
    try {
      return (await ipc.listSessionsByProject(projectId)) as SessionRecord[];
    } catch (err) {
      console.error('Failed to fetch sessions by project', err);
      return [];
    }
  }

  async function resume(record: SessionRecord) {
    return spawn({
      agentId: record.agent_id,
      task: record.task || '(resumed)',
      model: record.model as 'opus' | 'sonnet' | 'haiku' | undefined,
      projectId: record.project_id,
      taskId: record.task_id,
      interactive: true,
      resumeSessionId: record.id,
    });
  }

  async function stop(sessionId: string, force?: boolean) {
    try {
      await ipc.stopSession(sessionId, force);
    } catch (err) {
      console.error('Failed to stop session', err);
    }
  }

  function setLayout(mode: LayoutMode) {
    layoutMode.value = mode;
    localStorage.setItem('maestro-layout-mode', mode);
  }

  function selectSession(sessionId: string | null) {
    selectedSessionId.value = sessionId;
  }

  async function assignTask(sessionId: string, taskId: string, taskTitle: string, taskDescription: string) {
    await ipc.assignTaskToSession({ sessionId, taskId, taskTitle, taskDescription });
    // Update local state
    const session = activeSessions.value.find((s) => s.sessionId === sessionId);
    if (session) {
      session.taskId = taskId;
    }
  }

  async function sendDelegation(sourceSessionId: string, targetSessionId: string, instruction: string) {
    return ipc.sendDelegation({ sourceSessionId, targetSessionId, instruction });
  }

  function setupListeners() {
    ipc.onSessionEvent((data: any) => {
      const session = activeSessions.value.find((s) => s.sessionId === data.sessionId);
      if (session) {
        if (data.costUsd !== undefined) session.costUsd = data.costUsd;
        if (data.inputTokens !== undefined) session.inputTokens = data.inputTokens;
        if (data.outputTokens !== undefined) session.outputTokens = data.outputTokens;
        if (data.durationMs !== undefined) session.durationMs = data.durationMs;
      }
    });

    ipc.onSessionStatus((data: any) => {
      const session = activeSessions.value.find((s) => s.sessionId === data.sessionId);
      if (session) {
        session.status = data.status;
      }

      // Remove from active list if terminal status
      if (['completed', 'failed', 'stopped'].includes(data.status)) {
        setTimeout(() => {
          activeSessions.value = activeSessions.value.filter(
            (s) => s.sessionId !== data.sessionId,
          );
          if (selectedSessionId.value === data.sessionId) {
            selectedSessionId.value =
              activeSessions.value.length > 0 ? activeSessions.value[0].sessionId : null;
          }
          // Refresh history
          fetchHistory();
        }, 3000);
      }
    });
  }

  return {
    // State
    activeSessions,
    history,
    resumableSessions,
    taskSessions,
    layoutMode,
    selectedSessionId,
    loading,
    // Computed
    activeCount,
    totalTokens,
    totalCost,
    selectedSession,
    groupedSessions,
    // Actions
    fetchActive,
    fetchHistory,
    fetchResumable,
    resumeByConversationId,
    fetchByTask,
    fetchByProject,
    spawn,
    resume,
    stop,
    assignTask,
    sendDelegation,
    setLayout,
    selectSession,
    setupListeners,
  };
});
