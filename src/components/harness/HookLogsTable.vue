<template>
  <div class="panel-right">
    <div v-if="hasAnyLogs" class="records-table-wrap">
      <table class="records-table">
        <thead>
          <tr>
            <th>{{ $t('harness.triggerLogs.tableTime') }}</th>
            <th>{{ $t('harness.triggerLogs.tableHookName') }}</th>
            <th>{{ $t('harness.triggerLogs.tableType') }}</th>
            <th>{{ $t('harness.triggerLogs.tableTriggerReason') }}</th>
            <th>{{ $t('harness.triggerLogs.tableResult') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(log, idx) in logs"
            :key="log.id"
            :class="{ 'row-even': idx % 2 === 1 }"
          >
            <td class="td-time">{{ formatTime(log.triggerTime) }}</td>
            <td class="td-hook">{{ log.hookName }}</td>
            <td class="td-type">
              <span class="tag" :class="hookTypeClass(log.hookType)">
                {{ hookTypeLabel(log.hookType) }}
              </span>
            </td>
            <td class="td-reason">{{ log.triggerReason ?? '—' }}</td>
            <td class="td-result">
              <span class="tag" :class="resultClass(log.result)">
                {{ resultLabel(log.result) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Right empty state -->
    <div v-else class="right-empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">{{ $t('harness.triggerLogs.noLogsRight') }}</div>
      <div class="empty-desc">{{ $t('harness.triggerLogs.noLogsRightDesc') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  logs: {
    id: string | number;
    triggerTime: string;
    hookName: string;
    hookType: string;
    triggerReason?: string | null;
    result: string;
  }[];
  hasAnyLogs: boolean;
}>();

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toTimeString().slice(0, 8); // HH:mm:ss
  } catch {
    return iso;
  }
}

function hookTypeClass(hookType: string): string {
  if (hookType === 'PreToolUse') return 'tag-pre';
  if (hookType === 'PostToolUse') return 'tag-post';
  if (hookType === 'Stop') return 'tag-stop';
  return 'tag-pre';
}

function hookTypeLabel(hookType: string): string {
  if (hookType === 'PreToolUse') return 'Pre';
  if (hookType === 'PostToolUse') return 'Post';
  if (hookType === 'Stop') return 'Stop';
  return hookType;
}

function resultClass(result: string): string {
  if (result === 'blocked') return 'tag-blocked';
  if (result === 'passed') return 'tag-passed';
  if (result === 'warned') return 'tag-warning-tag';
  return 'tag-passed';
}

function resultLabel(result: string): string {
  if (result === 'blocked') return 'Blocked';
  if (result === 'passed') return 'Passed';
  if (result === 'warned') return 'Warning';
  return result;
}
</script>

<style scoped>
/* ── Right Panel ── */
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.records-table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* ── Records Table ── */
.records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.records-table thead th {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-default);
  position: sticky;
  top: 0;
  z-index: 2;
  white-space: nowrap;
  text-align: left;
}

.records-table tbody tr {
  transition: background 0.12s;
  border-bottom: 1px solid var(--color-border-default);
}

.records-table tbody tr.row-even {
  background: rgba(255, 255, 255, 0.018);
}

.records-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.records-table td {
  padding: 9px 12px;
  vertical-align: middle;
}

.td-time {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.td-hook {
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.td-reason {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11px;
  color: var(--color-text-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-type,
.td-result {
  white-space: nowrap;
}

/* ── Tags ── */
.tag {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.6;
}

/* Hook type tags — colours aligned with StarkLab brand blue palette */
.tag-pre {
  /* PreToolUse hooks: StarkLab blue */
  background: rgba(0, 102, 204, 0.15);
  color: #4da3ff;
}

.tag-post {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
}

.tag-stop {
  background: rgba(255, 146, 43, 0.15);
  color: #ff922b;
}

/* Result tags */
.tag-blocked {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.tag-passed {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.tag-warning-tag {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

/* ── Right Empty State ── */
.right-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
  text-align: center;
}

.right-empty .empty-icon {
  font-size: 40px;
  opacity: 0.4;
  margin-bottom: 12px;
}

.right-empty .empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.right-empty .empty-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  max-width: 340px;
}

/* ── Scrollbar ── */
.records-table-wrap::-webkit-scrollbar {
  width: 4px;
}

.records-table-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.records-table-wrap::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}
</style>
