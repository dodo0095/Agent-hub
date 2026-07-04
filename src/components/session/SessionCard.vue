<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import StatusDot from '../common/StatusDot.vue';
import SessionTerminal from './SessionTerminal.vue';
import type { ActiveSession } from '../../stores/sessions';
import { useTasksStore } from '../../stores/tasks';
import { formatTokens } from '../../utils/format-tokens';

const props = defineProps<{
  session: ActiveSession;
  selected?: boolean;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  stop: [sessionId: string];
  remix: [session: ActiveSession];
  navigateToTask: [taskId: string];
  delegation: [session: ActiveSession];
  assignTask: [session: ActiveSession];
  requestSummary: [session: ActiveSession];
}>();

const { t } = useI18n();
const tasksStore = useTasksStore();

const linkedTask = computed(() => {
  if (!props.session.taskId) return null;
  return tasksStore.tasks.find((t) => t.id === props.session.taskId) || null;
});

const statusDotMapping = computed(() => {
  const s = props.session.status;
  if (s === 'thinking' || s === 'starting') return 'thinking';
  if (s === 'running' || s === 'executing_tool') return 'running';
  if (s === 'summarizing') return 'thinking';
  if (s === 'failed') return 'error';
  if (s === 'completed' || s === 'stopped') return 'idle';
  return 'thinking';
});

const isSummarizing = computed(() => props.session.status === 'summarizing');

const formattedTokens = computed(() => {
  return formatTokens(props.session.inputTokens + props.session.outputTokens);
});

const formattedDuration = computed(() => {
  const ms = props.session.durationMs;
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
});

const isRunning = computed(() => {
  return !['completed', 'failed', 'stopped'].includes(props.session.status);
});


</script>

<template>
  <!-- ── Card (single / dual / triple grid modes) ── -->
  <div
    class="session-card"
    :class="[
      selected ? 'session-card--selected' : 'session-card--default',
    ]"
    @click="emit('select', session.sessionId)"
  >
    <!-- Card header -->
    <div class="session-card__header">
      <StatusDot :status="statusDotMapping" class="session-card__status-dot" />
      <div class="session-card__header-info">
        <div class="session-card__agent-name">{{ session.agentName }}</div>
        <div class="session-card__task">{{ session.task }}</div>
      </div>
      <div class="session-card__actions">
        <!-- Model tag -->
        <span
          class="session-card__model-tag"
          :class="{
            'session-card__model-tag--haiku': session.model?.includes('haiku'),
            'session-card__model-tag--sonnet': session.model?.includes('sonnet'),
            'session-card__model-tag--opus': session.model?.includes('opus'),
            'session-card__model-tag--unknown': !session.model,
          }"
        >{{ session.model }}</span>
        <!-- Stop button -->
        <button
          v-if="isRunning"
          class="session-card__btn session-card__btn--stop"
          :title="isSummarizing ? $t('sessions.card.forceStop') : $t('sessions.card.stop')"
          @click.stop="emit('stop', session.sessionId)"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
          <span v-if="isSummarizing" class="session-card__btn-label">{{ $t('sessions.card.forceStopLabel') }}</span>
        </button>
        <!-- Remix button -->
        <button
          v-if="!isRunning"
          class="session-card__btn session-card__btn--remix"
          :title="$t('sessions.card.remix')"
          @click.stop="emit('remix', session)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </div>

    <!-- PM-008: Worktree branch (if isolated) -->
    <div v-if="session.gitBranch" class="session-card__branch-bar" :title="session.workDir">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
      <span class="session-card__branch-name">{{ session.gitBranch }}</span>
    </div>

    <!-- Linked task (if any) -->
    <div v-if="linkedTask" class="session-card__linked-task-bar">
      <span
        class="session-card__linked-task-link"
        @click.stop="emit('navigateToTask', linkedTask.id)"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        {{ linkedTask.title }}
      </span>
    </div>

    <!-- Terminal mini preview -->
    <div class="session-card__terminal">
      <SessionTerminal :pty-id="session.ptyId" :active="selected" />
    </div>

    <!-- Card footer: status + duration -->
    <div class="session-card__footer">
      <span
        class="session-card__status-tag"
        :class="{
          'session-card__status-tag--running': session.status === 'running',
          'session-card__status-tag--thinking': ['thinking', 'starting', 'executing_tool', 'summarizing'].includes(session.status),
          'session-card__status-tag--waiting': ['awaiting_approval', 'waiting_input'].includes(session.status),
          'session-card__status-tag--idle': ['completed', 'failed', 'stopped'].includes(session.status),
        }"
      >{{ { running: $t('sessions.statusLabels.running'), thinking: $t('sessions.statusLabels.thinking'), starting: $t('sessions.statusLabels.starting'), executing_tool: $t('sessions.statusLabels.executing_tool'), awaiting_approval: $t('sessions.statusLabels.awaiting_approval'), waiting_input: $t('sessions.statusLabels.waiting_input'), summarizing: $t('sessions.statusLabels.summarizing'), completed: $t('sessions.statusLabels.completed'), failed: $t('sessions.statusLabels.failed'), stopped: $t('sessions.statusLabels.stopped') }[session.status] || session.status }}</span>
      <span class="session-card__duration">{{ formattedDuration }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ── Session Card ── */
.session-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.session-card--selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.2);
}

.session-card--default {
  border-color: var(--color-border-default);
}

.session-card--default:hover {
  border-color: var(--color-border-light);
}

.session-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
}

.session-card__status-dot {
  flex-shrink: 0;
}

.session-card__header-info {
  min-width: 0;
  flex: 1;
}

.session-card__agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.session-card__task {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.session-card__model-tag {
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.session-card__model-tag--haiku {
  background-color: rgba(0, 214, 143, 0.2);
  color: var(--color-success);
}

.session-card__model-tag--sonnet {
  background-color: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.session-card__model-tag--opus {
  background-color: rgba(255, 170, 0, 0.2);
  color: var(--color-warning);
}

.session-card__model-tag--unknown {
  background-color: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.session-card__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.session-card__btn--stop {
  gap: 4px;
  padding: 0 6px;
}

.session-card__btn--stop:hover {
  background-color: rgba(255, 107, 107, 0.2);
  color: var(--color-danger);
}

.session-card__btn--remix {
  width: 24px;
  padding: 0;
}

.session-card__btn--remix:hover {
  background-color: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.session-card__btn-label {
  font-size: 10px;
}

.session-card__linked-task-bar {
  border-top: 1px solid var(--color-border-default);
  padding: 6px 14px;
}

/* PM-008: worktree 分支列 */
.session-card__branch-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid var(--color-border-default);
  padding: 6px 14px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.session-card__branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-card__linked-task-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-accent-light);
  cursor: pointer;
}

.session-card__linked-task-link:hover {
  text-decoration: underline;
}

.session-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--color-border-default);
  padding: 8px 14px;
}

.session-card__status-tag {
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
}

.session-card__status-tag--running {
  background-color: rgba(0, 214, 143, 0.15);
  color: var(--color-success);
}

.session-card__status-tag--thinking {
  background-color: rgba(108, 92, 231, 0.15);
  color: var(--color-accent-light);
}

.session-card__status-tag--waiting {
  background-color: rgba(255, 170, 0, 0.15);
  color: var(--color-warning);
}

.session-card__status-tag--idle {
  background-color: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.session-card__duration {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.session-card__terminal {
  height: 360px;
  background-color: #0a0b0f;
}
</style>
