<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseTag from '../common/BaseTag.vue';
import { useProjectsStore, type ProjectRecord, type ProjectStats } from '../../stores/projects';

const props = defineProps<{
  project: ProjectRecord;
  stats: ProjectStats | null;
}>();

const { t } = useI18n();
const projectsStore = useProjectsStore();

const isArchived = computed(() => props.project.status === 'archived');

async function toggleArchive() {
  const nextStatus = isArchived.value ? 'active' : 'archived';
  try {
    await projectsStore.update(props.project.id, { status: nextStatus });
  } catch (err) {
    console.error('Failed to toggle project archive status', err);
  }
}

const statusLabel = computed<Record<string, string>>(() => ({
  planning: t('projects.statusLabels.planning'),
  active: t('projects.statusLabels.active'),
  paused: t('projects.statusLabels.paused'),
  completed: t('projects.statusLabels.completed'),
  archived: t('projects.statusLabels.archived'),
}));

const statusColor = computed((): 'purple' | 'green' | 'yellow' | 'red' | 'blue' => {
  const map: Record<string, 'purple' | 'green' | 'yellow' | 'red' | 'blue'> = {
    planning: 'blue',
    active: 'green',
    paused: 'yellow',
    completed: 'purple',
    archived: 'red',
  };
  return map[props.project.status] || 'purple';
});

const isCompleted = computed(() =>
  ['completed', 'archived'].includes(props.project.status),
);

const gateStatusColor = computed((): 'green' | 'yellow' | 'red' | 'blue' | 'purple' => {
  if (!props.stats?.latestGate) return 'purple';
  const map: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'purple'> = {
    approved: 'green',
    pending: 'yellow',
    rejected: 'red',
    submitted: 'blue',
  };
  return map[props.stats.latestGate.status] || 'purple';
});

const gateStatusLabel: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  submitted: 'Submitted',
};

function formatDate(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('projects.card.createdToday');
  if (diffDays === 1) return t('projects.card.createdYesterday');
  if (diffDays < 14) return t('projects.card.createdDaysAgo', { n: diffDays });
  const diffWeeks = Math.floor(diffDays / 7);
  return t('projects.card.createdWeeksAgo', { n: diffWeeks });
}

const sprintProgressLabel = computed(() => {
  if (!props.stats) return '';
  const s = props.stats.activeSprint;
  if (s) {
    return s.activeCount > 1 ? t('projects.card.sprintsTotalProgress', { n: s.activeCount }) : t('projects.card.sprintProgress', { name: s.name });
  }
  if (isCompleted.value) return t('projects.card.allSprintsDone');
  return t('projects.card.noActiveSprint');
});

const sprintProgressPct = computed(() => {
  if (!props.stats) return 0;
  if (props.stats.activeSprint) return props.stats.activeSprint.progressPct;
  if (isCompleted.value) return 100;
  return 0;
});

const sprintFooterText = computed(() => {
  if (!props.stats) return '';
  if (props.stats.activeSprint) return props.stats.activeSprint.name;
  if (isCompleted.value) return t('projects.card.allSprintsDone');
  return t('projects.card.noActiveSprint');
});
</script>

<template>
  <router-link
    :to="'/projects/' + project.id"
    class="project-card"
    :class="{ 'project-card--completed': isCompleted }"
  >
    <!-- Row 1: title (left) + status tag + archive toggle (right) -->
    <div class="project-card__header">
      <h3 class="project-card__title">{{ project.name }}</h3>
      <div class="project-card__header-actions">
        <BaseTag :color="statusColor">{{ statusLabel[project.status] }}</BaseTag>
        <button
          type="button"
          class="project-card__archive-btn"
          :title="isArchived ? t('projects.card.unarchiveAction') : t('projects.card.archiveAction')"
          :aria-label="isArchived ? t('projects.card.unarchiveAction') : t('projects.card.archiveAction')"
          @click.stop.prevent="toggleArchive"
        >
          <!-- Archive box icon (when project is active) -->
          <svg
            v-if="!isArchived"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="2" y="4" width="20" height="5" rx="1" />
            <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
            <line x1="10" y1="13" x2="14" y2="13" />
          </svg>
          <!-- Rotate / reactivate icon (when project is archived) -->
          <svg
            v-else
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <polyline points="3 4 3 10 9 10" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Row 2: description -->
    <p class="project-card__desc">{{ project.description || '' }}</p>

    <!-- Divider -->
    <div class="project-card__divider" />

    <!-- Stats skeleton -->
    <template v-if="!stats">
      <div class="project-card__sprint-section">
        <div class="project-card__sprint-row">
          <div class="project-card__skeleton project-card__skeleton--sprint-name" />
          <div class="project-card__skeleton project-card__skeleton--sprint-gate" />
        </div>
        <div class="project-card__skeleton project-card__skeleton--progress-bar" />
      </div>
      <div class="project-card__stats-row">
        <div class="project-card__stat-item">
          <div class="project-card__skeleton project-card__skeleton--stat-value" />
          <div class="project-card__skeleton project-card__skeleton--stat-label" />
        </div>
        <div class="project-card__stat-item">
          <div class="project-card__skeleton project-card__skeleton--stat-value" />
          <div class="project-card__skeleton project-card__skeleton--stat-label" />
        </div>
      </div>
      <div class="project-card__footer">
        <div class="project-card__skeleton project-card__skeleton--footer" />
      </div>
    </template>

    <!-- Stats data -->
    <template v-else>
      <!-- Sprint section: name + gate count row, then progress bar -->
      <div class="project-card__sprint-section">
        <div class="project-card__sprint-row">
          <span class="project-card__sprint-label">{{ sprintFooterText }}</span>
          <span v-if="stats.latestGate" class="project-card__sprint-gate">
            {{ stats.latestGate.type }} · {{ gateStatusLabel[stats.latestGate.status] || stats.latestGate.status }}
          </span>
          <span v-else class="project-card__sprint-gate">—</span>
        </div>
        <div class="project-card__progress-track">
          <div
            class="project-card__progress-fill"
            :style="{ width: `${sprintProgressPct}%` }"
          />
        </div>
      </div>

      <!-- Stats row: task completion + sprint progress -->
      <div class="project-card__stats-row">
        <div class="project-card__stat-item">
          <span class="project-card__stat-value">{{ $t('projects.card.tasksDoneOf', { done: stats.tasksDone, total: stats.totalTasks }) }}</span>
          <span class="project-card__stat-label">{{ $t('projects.card.tasksDoneLabel') }}</span>
        </div>
        <div class="project-card__stat-item">
          <span class="project-card__stat-value">{{ sprintProgressPct }}%</span>
          <span class="project-card__stat-label">{{ $t('projects.card.sprintProgressLabel') }}</span>
        </div>
      </div>

      <!-- Footer: gate tag (left) + date (right) -->
      <div class="project-card__footer">
        <div class="project-card__footer-tags">
          <BaseTag v-if="stats.latestGate" :color="gateStatusColor">
            {{ gateStatusLabel[stats.latestGate.status] || stats.latestGate.status }}
          </BaseTag>
        </div>
        <span class="project-card__footer-meta">{{ formatDate(project.createdAt) }}</span>
      </div>
    </template>

    <!-- workDir path at bottom -->
    <span v-if="project.workDir" class="project-card__path" :title="project.workDir">
      {{ project.workDir }}
    </span>
  </router-link>
</template>

<style scoped>
/* Card base */
.project-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  padding: 18px;
  min-height: 280px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  text-decoration: none;
  color: inherit;
}

.project-card:hover {
  transform: translateY(-1px);
  border-color: var(--color-border-light);
  background-color: var(--color-bg-hover);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.project-card--completed {
  opacity: 0.7;
}

/* Header: title left, status tag right */
.project-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.project-card__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.project-card__archive-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.project-card__archive-btn:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border-light);
  background-color: var(--color-bg-hover);
}

.project-card__archive-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.project-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

/* Description */
.project-card__desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Divider */
.project-card__divider {
  height: 1px;
  background-color: var(--color-border-default);
  flex-shrink: 0;
}

/* Sprint section */
.project-card__sprint-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-card__sprint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.project-card__sprint-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.project-card__sprint-gate {
  color: var(--color-text-muted);
}

.project-card__progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background-color: var(--color-border-default);
}

.project-card__progress-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-light));
  transition: width 0.3s ease;
}

/* Stats row */
.project-card__stats-row {
  display: flex;
  gap: 16px;
}

.project-card__stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-card__stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.project-card__stat-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Footer */
.project-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.project-card__footer-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.project-card__footer-meta {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Path */
.project-card__path {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: 'Consolas', 'SF Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Skeletons */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.project-card__skeleton {
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-hover);
  animation: pulse 1.5s ease-in-out infinite;
}

.project-card__skeleton--sprint-name {
  height: 14px;
  width: 80px;
}

.project-card__skeleton--sprint-gate {
  height: 14px;
  width: 60px;
}

.project-card__skeleton--progress-bar {
  height: 6px;
  border-radius: 99px;
  width: 100%;
}

.project-card__skeleton--stat-value {
  height: 20px;
  width: 90px;
}

.project-card__skeleton--stat-label {
  height: 12px;
  width: 60px;
}

.project-card__skeleton--footer {
  height: 16px;
  width: 8rem;
}
</style>
