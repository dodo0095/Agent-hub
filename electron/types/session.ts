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

export interface SessionRecord {
  id: string;
  agentId: string;
  task: string;
  taskId: string | null;
  projectId: string | null;
  model: string;
  status: SessionStatus;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCallsCount: number;
  turnsCount: number;
  durationMs: number;
  resultSummary: string | null;
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

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

export interface SpawnParams {
  agentId: string;
  task: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  maxTurns?: number;
  projectId?: string | null;
  taskId?: string | null;
  /** true = interactive Claude Code TUI; false = one-shot -p mode (default) */
  interactive?: boolean;
  /** ID of the parent session for continuation sessions */
  parentSessionId?: string;
  /** Resume a previous session using claude --resume (looks up conversation ID from DB) */
  resumeSessionId?: string;
  /** Resume directly by Claude conversation ID (from file-system scan) */
  resumeConversationId?: string;
  /** Working directory override (used with resumeConversationId) */
  projectPath?: string;
}

export interface SpawnResult {
  sessionId: string;
  ptyId: string;
}

export interface StopParams {
  sessionId: string;
  force?: boolean;
}

export type SessionEventType =
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system';

export interface SessionEvent {
  sessionId: string;
  type: SessionEventType;
  subtype?: string;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  timestamp: string;
}

export interface PtyData {
  ptyId: string;
  data: string;
}

export interface PtyInputData {
  ptyId: string;
  data: string;
}

export interface PtyResizeData {
  ptyId: string;
  cols: number;
  rows: number;
}

export interface AssignTaskParams {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
}

export interface DelegationRequest {
  id: string;
  sourceSessionId: string;
  targetSessionId: string;
  instruction: string;
  status: 'pending' | 'delivered' | 'completed';
  report?: string;
  createdAt: string;
}

export interface SendDelegationParams {
  sourceSessionId: string;
  targetSessionId: string;
  instruction: string;
}

// ─── Cross-session messaging ─────────────────────────────────────────────────

export type MessageStatus = 'pending' | 'delivered' | 'read';

export interface MessageRecord {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  status: MessageStatus;
  projectId: string | null;
  sessionId: string | null;
  replyTo: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface SendMessageParams {
  fromAgent: string;
  toAgent: string;
  content: string;
  projectId?: string | null;
  replyTo?: string | null;
}

export interface MessageFilters {
  agent?: string;        // messages to or from this agent
  toAgent?: string;      // messages to this agent only
  fromAgent?: string;    // messages from this agent only
  projectId?: string;
  status?: MessageStatus;
  limit?: number;
}
