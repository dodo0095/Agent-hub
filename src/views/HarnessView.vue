<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHarnessStore } from '../stores/harness';
import { useSessionsStore, type ActiveSession } from '../stores/sessions';
import SessionTerminal from '../components/session/SessionTerminal.vue';

const { t } = useI18n();
const harnessStore = useHarnessStore();
const sessionsStore = useSessionsStore();

const SkillTab = defineAsyncComponent(() => import('../components/harness/SkillTab.vue'));
const HookTab = defineAsyncComponent(() => import('../components/harness/HookTab.vue'));
const TriggerLogsTab = defineAsyncComponent(() => import('../components/harness/TriggerLogsTab.vue'));

// Session state
const activeSession = ref<ActiveSession | null>(null);
const launching = ref(false);

// Check if there's already a running harness-manager session
const existingSession = computed(() =>
  sessionsStore.activeSessions.find((s) => s.agentId === 'harness-manager'),
);

const sessionStatusClass = computed(() => {
  const s = activeSession.value?.status;
  if (!s || s === 'starting') return 'is-starting';
  if (['running', 'thinking', 'executing_tool', 'awaiting_approval', 'waiting_input'].includes(s)) return 'is-running';
  return 'is-done';
});

const sessionStatusLabel = computed(() => {
  const labels: Record<string, string> = {
    starting: t('sessions.statusLabels.starting'),
    running: t('sessions.statusLabels.running'),
    thinking: t('sessions.statusLabels.thinking'),
    executing_tool: t('sessions.statusLabels.executing_tool'),
    awaiting_approval: t('sessions.statusLabels.awaiting_approval'),
    waiting_input: t('sessions.statusLabels.waiting_input'),
    summarizing: t('sessions.statusLabels.summarizing'),
    completed: t('sessions.statusLabels.completed'),
    failed: t('sessions.statusLabels.failed'),
    stopped: t('sessions.statusLabels.stopped'),
  };
  return labels[activeSession.value?.status || ''] || t('sessions.statusLabels.starting');
});

onMounted(() => {
  Promise.all([
    harnessStore.fetchSkills(),
    harnessStore.fetchHooks(),
    harnessStore.fetchHookStats(),
  ]);

  // Restore existing session if any
  if (existingSession.value) {
    activeSession.value = existingSession.value;
  }
});

// Watch for session status changes
watch(
  () => sessionsStore.activeSessions,
  (sessions) => {
    if (activeSession.value) {
      const updated = sessions.find((s) => s.sessionId === activeSession.value!.sessionId);
      if (updated) {
        activeSession.value = updated;
      } else {
        activeSession.value = null;
      }
    }
  },
  { deep: true },
);

async function launchSession() {
  if (existingSession.value) {
    activeSession.value = existingSession.value;
    return;
  }
  launching.value = true;
  try {
    const result = await sessionsStore.spawn({
      agentId: 'harness-manager',
      task: '',
      interactive: true,
    });
    const session = sessionsStore.activeSessions.find(
      (s) => s.sessionId === result.sessionId,
    );
    if (session) activeSession.value = session;
  } catch (err) {
    console.error('Failed to launch harness-manager session', err);
  } finally {
    launching.value = false;
  }
}

async function stopSession() {
  if (!activeSession.value) return;
  try {
    await sessionsStore.stop(activeSession.value.sessionId);
  } catch (err) {
    console.error('Failed to stop session', err);
  }
}
</script>

<template>
  <div class="harness-view">
    <!-- TopBar -->
    <div class="harness-topbar">
      <div class="harness-topbar-icon">
        <!-- Bolt icon — stroke uses StarkLab accent-light (#4da3ff) -->
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4da3ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <div class="harness-topbar-text">
        <div class="harness-topbar-title">{{ $t('harness.title') }}</div>
        <div class="harness-topbar-subtitle">{{ $t('harness.subtitle') }}</div>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="harness-tab-bar">
      <button
        class="harness-tab"
        :class="{ 'harness-tab--active': harnessStore.activeTab === 'skill' }"
        @click="harnessStore.setTab('skill')"
      >
        <span class="harness-tab-icon">🧩</span>
        Skill
      </button>
      <button
        class="harness-tab"
        :class="{ 'harness-tab--active': harnessStore.activeTab === 'hook' }"
        @click="harnessStore.setTab('hook')"
      >
        <span class="harness-tab-icon">🪝</span>
        Hook
      </button>
      <button
        class="harness-tab"
        :class="{ 'harness-tab--active': harnessStore.activeTab === 'record' }"
        @click="harnessStore.setTab('record')"
      >
        <span class="harness-tab-icon">📋</span>
        {{ $t('harness.tabs.record') }}
      </button>
      <button
        class="harness-tab"
        :class="{ 'harness-tab--active': harnessStore.activeTab === 'session' }"
        @click="harnessStore.setTab('session')"
      >
        <span class="harness-tab-icon">🤖</span>
        {{ $t('harness.tabs.session') }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="harness-content">
      <Suspense>
        <div class="harness-tab-panels">
          <div v-show="harnessStore.activeTab === 'skill'" class="harness-tab-panel">
            <SkillTab />
          </div>
          <div v-show="harnessStore.activeTab === 'hook'" class="harness-tab-panel">
            <HookTab />
          </div>
          <div v-show="harnessStore.activeTab === 'record'" class="harness-tab-panel">
            <TriggerLogsTab />
          </div>
          <div v-show="harnessStore.activeTab === 'session'" class="harness-tab-panel">
            <div class="session-panel">
              <!-- No session state: launch button -->
              <div v-if="!activeSession && !launching" class="session-empty">
                <span class="session-empty-icon">🤖</span>
                <p class="session-empty-title">{{ $t('harness.session.emptyTitle') }}</p>
                <p class="session-empty-desc">{{ $t('harness.session.emptyDesc') }}</p>
                <button class="session-launch-btn" @click="launchSession">
                  ▶ {{ $t('harness.session.launch') }}
                </button>
              </div>

              <!-- Launching state -->
              <div v-else-if="launching && !activeSession" class="session-empty">
                <span class="session-empty-icon">⏳</span>
                <p class="session-empty-title">{{ $t('harness.session.launching') }}</p>
              </div>

              <!-- Active session -->
              <template v-else-if="activeSession">
                <div class="session-header">
                  <span class="session-hdr-icon">🤖</span>
                  <span class="session-hdr-name">harness-manager</span>
                  <span class="session-hdr-status" :class="sessionStatusClass">● {{ sessionStatusLabel }}</span>
                  <div class="session-hdr-spacer"></div>
                  <button class="session-stop-btn" @click="stopSession">{{ $t('harness.session.stop') }}</button>
                </div>
                <div class="session-terminal-wrap">
                  <SessionTerminal :pty-id="activeSession.ptyId" :active="harnessStore.activeTab === 'session'" />
                </div>
              </template>
            </div>
          </div>
        </div>
        <template #fallback>
          <div class="harness-loading">{{ $t('common.loading') }}</div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
.harness-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* TopBar */
.harness-topbar {
  min-height: 64px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.harness-topbar-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(108, 92, 231, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.harness-topbar-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.harness-topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.harness-topbar-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Tab bar */
.harness-tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.harness-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
  user-select: none;
}

.harness-tab:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
}

.harness-tab--active {
  background: var(--color-bg-active);
  color: var(--color-accent-light);
  border-color: var(--color-border-light);
}

.harness-tab-icon {
  font-size: 14px;
}

/* Content area */
.harness-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.harness-tab-panels {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.harness-tab-panel {
  height: 100%;
  overflow: hidden;
}

.harness-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* Session Panel */
.session-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.session-empty-icon {
  font-size: 48px;
  line-height: 1;
  opacity: 0.4;
}

.session-empty-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.session-empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 320px;
  line-height: 1.6;
}

.session-launch-btn {
  margin-top: 8px;
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.session-launch-btn:hover {
  opacity: 0.85;
}

.session-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.session-hdr-icon {
  font-size: 18px;
  line-height: 1;
}

.session-hdr-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.session-hdr-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 500;
}

.session-hdr-status.is-running {
  background: var(--color-success-dim);
  color: var(--color-success);
}

.session-hdr-status.is-done {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-muted);
}

.session-hdr-status.is-starting {
  background: var(--color-info-dim);
  color: var(--color-info);
}

.session-hdr-spacer {
  flex: 1;
}

.session-stop-btn {
  padding: 4px 12px;
  border-radius: 5px;
  border: 1px solid var(--color-border-default);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.session-stop-btn:hover {
  background: var(--color-danger-dim);
  color: var(--color-danger);
  border-color: var(--color-danger);
}

.session-terminal-wrap {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg-primary);
}
</style>
