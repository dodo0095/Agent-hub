<script setup lang="ts">
import { onMounted, onErrorCaptured, getCurrentInstance } from 'vue';
import MainLayout from './layouts/MainLayout.vue';
import ErrorToast from './components/common/ErrorToast.vue';
import ToastContainer from './components/common/ToastContainer.vue';
import { useSessionsStore } from './stores/sessions';
import { useAgentsStore } from './stores/agents';
import { useProjectsStore } from './stores/projects';
import { useGatesStore } from './stores/gates';
import { useSettingsStore } from './stores/settings';
import { useUiStore } from './stores/ui';
import { useTasksStore } from './stores/tasks';
import { useMessagesStore } from './stores/messages';
import { useIpc } from './composables/useIpc';

const sessionsStore = useSessionsStore();
const agentsStore = useAgentsStore();
const projectsStore = useProjectsStore();
const gatesStore = useGatesStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const tasksStore = useTasksStore();
const messagesStore = useMessagesStore();
const { onProjectSynced } = useIpc();

// Global error handler
onErrorCaptured((err) => {
  uiStore.addError(err.message || 'An unexpected error occurred');
  return false;
});

// Register global app error handler
const app = getCurrentInstance()?.appContext.app;
if (app) {
  app.config.errorHandler = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    uiStore.addError(message);
  };
}

onMounted(async () => {
  // Initialize theme
  uiStore.initTheme();

  // Initialize stores
  await Promise.all([
    agentsStore.fetchAll(),
    agentsStore.fetchDepartments(),
    sessionsStore.fetchActive(),
    sessionsStore.fetchHistory(),
    projectsStore.fetchAll(),
    gatesStore.fetchChecklists(),
    settingsStore.fetchAll(),
  ]);

  // Fetch ALL gates (cross-project) for sidebar badge
  gatesStore.fetchGates();

  // Setup real-time listeners
  sessionsStore.setupListeners();
  messagesStore.setupListeners();
  uiStore.setupNotificationListener();

  // Re-fetch stores when FileWatcher detects .tasks/ or dev-plan changes
  // Note: tasks store has its own sync listener, so we only handle gates + stats here
  onProjectSynced((data) => {
    if (data.type === 'task' || data.type === 'full') {
      projectsStore.fetchStats(data.projectId);
    }

    if (data.type === 'gate' || data.type === 'full') {
      gatesStore.fetchGates(
        gatesStore.selectedProjectId ?? undefined,
        gatesStore.selectedSprintId ?? undefined,
      );
      projectsStore.fetchStats(data.projectId);
    }
  });
});
</script>

<template>
  <MainLayout />
  <ErrorToast />
  <ToastContainer />
</template>
