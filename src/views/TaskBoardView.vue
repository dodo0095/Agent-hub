<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTasksStore } from '../stores/tasks';
import { useProjectsStore } from '../stores/projects';
import { useIpc } from '../composables/useIpc';
import type { SprintRecord } from '../stores/projects';
import BaseTag from '../components/common/BaseTag.vue';
import TaskDetailPanel from '../components/task/TaskDetailPanel.vue';

const { t } = useI18n();
const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const { listSprints } = useIpc();

const filterProjectId = ref('');
const filterSprintId = ref('');
const sprints = ref<SprintRecord[]>([]);

// 篩選下拉只顯示進行中的專案，隱藏已完成 / 已封存（關閉）的專案；
// 但保留目前已選中的專案，避免與當前篩選狀態不一致。
const selectableProjects = computed(() =>
  projectsStore.projects.filter(
    (p) => !['completed', 'archived'].includes(p.status) || p.id === filterProjectId.value,
  ),
);

onMounted(async () => {
  if (projectsStore.projects.length === 0) await projectsStore.fetchAll();
  await tasksStore.fetchTasks();
});

async function onProjectChange() {
  filterSprintId.value = '';
  sprints.value = [];
  if (filterProjectId.value) {
    try {
      sprints.value = (await listSprints(filterProjectId.value)) as SprintRecord[];
    } catch {
      sprints.value = [];
    }
  }
  tasksStore.setContext(filterProjectId.value || null, null);
  await tasksStore.fetchTasks();
}

async function onSprintChange() {
  tasksStore.setContext(filterProjectId.value || null, filterSprintId.value || null);
  await tasksStore.fetchTasks();
}

const priorityColor: Record<string, string> = {
  P0: 'bg-danger',
  P1: 'bg-warning',
  P2: 'bg-info',
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-info',
  low: 'bg-text-muted',
};

const priorityLabel = computed<Record<string, string>>(() => ({
  P0: t('taskboard.priorityLabels.P0'),
  P1: t('taskboard.priorityLabels.P1'),
  P2: t('taskboard.priorityLabels.P2'),
  critical: t('taskboard.priorityLabels.critical'),
  high: t('taskboard.priorityLabels.high'),
  medium: t('taskboard.priorityLabels.medium'),
  low: t('taskboard.priorityLabels.low'),
}));

const tagColor: Record<string, 'purple' | 'blue' | 'yellow' | 'green' | 'red'> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  critical: 'red',
  high: 'yellow',
  medium: 'blue',
  low: 'purple',
};

const columnHeaderColor: Record<string, string> = {
  created: 'text-text-muted',
  assigned: 'text-info',
  in_progress: 'text-warning',
  in_review: 'text-accent-light',
  done: 'text-success',
};

const visibleColumns = computed(() =>
  tasksStore.columns.filter((col) =>
    ['created', 'assigned', 'in_progress', 'in_review', 'done'].includes(col.key),
  ),
);
</script>

<template>
  <div class="task-board-view">
    <!-- Page Header -->
    <div class="board-header">
      <h2 class="board-title">{{ $t('taskboard.title') }}</h2>
      <span class="progress-badge">
        {{ $t('taskboard.completed', { done: tasksStore.doneCount, total: tasksStore.totalCount }) }}
      </span>
      <div class="header-spacer"></div>
      <select
        v-model="filterProjectId"
        class="filter-select"
        @change="onProjectChange"
      >
        <option value="">{{ $t('taskboard.allProjects') }}</option>
        <option
          v-for="project in selectableProjects"
          :key="project.id"
          :value="project.id"
        >
          {{ project.name }}
        </option>
      </select>
      <select
        v-model="filterSprintId"
        class="filter-select"
        :disabled="!filterProjectId"
        @change="onSprintChange"
      >
        <option value="">{{ $t('taskboard.allSprints') }}</option>
        <option
          v-for="sprint in sprints"
          :key="sprint.id"
          :value="sprint.id"
        >
          {{ sprint.name }}
        </option>
      </select>
    </div>

    <!-- Loading skeleton -->
    <div v-if="tasksStore.loading" class="kanban-wrapper">
      <div class="kanban-board">
        <div v-for="col in visibleColumns" :key="col.key" class="kanban-col">
          <div class="col-header">
            <div class="col-dot" :class="`col-dot--${col.key}`"></div>
            <span class="col-title">{{ $t(`taskboard.columnLabels.${col.key}`) }}</span>
            <span class="col-badge" :class="`col-badge--${col.key}`">—</span>
          </div>
          <div class="col-body">
            <div v-for="i in 3" :key="i" class="skeleton-card"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Kanban board -->
    <div v-else class="kanban-wrapper">
      <div class="kanban-board">
        <div
          v-for="col in visibleColumns"
          :key="col.key"
          class="kanban-col"
          :class="{ 'kanban-col--done': col.key === 'done' }"
        >
          <!-- Column header -->
          <div class="col-header">
            <div class="col-dot" :class="`col-dot--${col.key}`"></div>
            <span class="col-title">{{ $t(`taskboard.columnLabels.${col.key}`) }}</span>
            <span class="col-badge" :class="`col-badge--${col.key}`">
              {{ tasksStore.tasksByStatus[col.key]?.length ?? 0 }}
            </span>
          </div>

          <!-- Column body -->
          <div class="col-body">
            <!-- Empty state -->
            <div
              v-if="(tasksStore.tasksByStatus[col.key]?.length ?? 0) === 0"
              class="empty-col"
            >
              <div class="empty-col-icon">○</div>
              <div class="empty-col-text">{{ $t('taskboard.noTasks') }}</div>
            </div>

            <!-- Task cards -->
            <div
              v-for="task in tasksStore.tasksByStatus[col.key]"
              :key="task.id"
              class="task-card"
              :class="`task-card--${task.priority}`"
              @click="tasksStore.selectTask(task.id)"
            >
              <!-- Task title -->
              <div class="task-title">
                <span class="task-title-text">
                  <span v-if="col.key === 'done'" class="done-check">✓</span>
                  {{ task.title }}
                </span>
                <span v-if="task.estimatedHours != null" class="estimated-hours">
                  {{ task.estimatedHours }}h
                </span>
              </div>

              <!-- Task meta: priority tag + agent + extra tags + depends-on -->
              <div class="task-meta">
                <BaseTag :color="tagColor[task.priority]" class="priority-tag-override">
                  {{ priorityLabel[task.priority] }}
                </BaseTag>

                <span v-if="task.assignedTo" class="agent-tag">
                  {{ task.assignedTo }}
                </span>
                <template v-if="task.tags">
                  <span
                    v-for="tag in task.tags.split(',').map((t) => t.trim()).filter(Boolean)"
                    :key="tag"
                    class="extra-tag"
                  >
                    {{ tag }}
                  </span>
                </template>
                <span v-if="task.dependsOn.length > 0" class="depends-on-tag">
                  ← {{ task.dependsOn.join(', ') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task detail side panel -->
    <TaskDetailPanel />
  </div>
</template>

<style scoped>
/* ── Layout ── */
.task-board-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Page Header ── */
.board-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.board-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.3px;
}

.progress-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-success);
  background: var(--color-success-dim, #00d68f33);
  padding: 3px 8px;
  border-radius: 20px;
}

.header-spacer {
  flex: 1;
}

.filter-select {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 24px 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%235c5e72' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: border-color 150ms ease;
}

.filter-select:focus {
  border-color: var(--color-accent);
}

.filter-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Kanban Wrapper ── */
.kanban-wrapper {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 20px 24px;
  min-height: 0;
}

.kanban-board {
  display: flex;
  gap: 12px;
  height: 100%;
  min-width: max-content;
}

/* ── Column ── */
.kanban-col {
  min-width: 220px;
  width: 220px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.col-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-dot--created   { background: var(--color-text-muted); }
.col-dot--assigned  { background: var(--color-info); }
.col-dot--in_progress { background: var(--color-warning); }
.col-dot--in_review { background: var(--color-accent-light); }
.col-dot--done      { background: var(--color-success); }

.col-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  flex: 1;
}

.col-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: auto;
}

.col-badge--created   { color: var(--color-text-muted); background: rgba(92, 94, 114, 0.2); }
.col-badge--assigned  { color: var(--color-info); background: var(--color-info-dim, #339af033); }
.col-badge--in_progress { color: var(--color-warning); background: var(--color-warning-dim, #ffaa0033); }
.col-badge--in_review { color: var(--color-accent-light); background: rgba(108, 92, 231, 0.2); }
.col-badge--done      { color: var(--color-success); background: var(--color-success-dim, #00d68f33); }

/* ── Column Body ── */
.col-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.col-body::-webkit-scrollbar {
  width: 3px;
}

.col-body::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}

/* ── Empty State ── */
.empty-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
}

.empty-col-icon {
  font-size: 22px;
  opacity: 0.3;
  color: var(--color-text-muted);
}

.empty-col-text {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* ── Task Card ── */
.task-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 10px 10px 10px 14px;
  position: relative;
  cursor: pointer;
  transition: all 150ms ease;
  overflow: hidden;
  flex-shrink: 0;
}

/* Priority left color bar via ::before */
.task-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 8px 0 0 8px;
}

.task-card--critical::before { background: var(--color-danger); }
.task-card--high::before     { background: var(--color-warning); }
.task-card--medium::before   { background: var(--color-info); }
.task-card--low::before      { background: var(--color-text-muted); }

.task-card:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-light);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* Done column: dim cards */
.kanban-col--done .task-card {
  opacity: 0.6;
}

.kanban-col--done .task-card:hover {
  opacity: 0.9;
}

/* ── Card Contents ── */
.task-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.4;
  margin-bottom: 8px;
}

.task-title-text {
  flex: 1;
  min-width: 0;
}

.estimated-hours {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}

.done-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  background: var(--color-success);
  border-radius: 50%;
  color: #fff;
  font-size: 8px;
  line-height: 1;
  margin-right: 4px;
  flex-shrink: 0;
  vertical-align: middle;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Make BaseTag text match mockup (uppercase, 10px) */
.priority-tag-override {
  font-size: 10px !important;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.agent-tag {
  font-size: 10px;
  color: var(--color-text-muted);
  background: var(--color-bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.extra-tag {
  font-size: 10px;
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
}

.depends-on-tag {
  font-size: 10px;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

/* ── Skeleton Loading ── */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}

.skeleton-card {
  height: 68px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-hover) 50%,
    var(--color-bg-card) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite;
  flex-shrink: 0;
}

.skeleton-card:nth-child(2n) {
  height: 52px;
}
</style>
