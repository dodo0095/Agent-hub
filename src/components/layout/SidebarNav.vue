<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSessionsStore } from '../../stores/sessions';
import { useMessagesStore } from '../../stores/messages';

const route = useRoute();
const sessionsStore = useSessionsStore();
const messagesStore = useMessagesStore();
const { t } = useI18n();
const expanded = ref(false);

const navGroups = computed(() => [
  [
    { to: '/', icon: '⬫', label: t('nav.dashboard'), name: 'dashboard' },
    { to: '/sessions', icon: '▷', label: t('nav.sessions'), name: 'sessions', badge: 'session' },
  ],
  [
    { to: '/projects', icon: '▤', label: t('nav.projects'), name: 'projects' },
    { to: '/tasks', icon: '☰', label: t('nav.tasks'), name: 'tasks' },
    { to: '/gates', icon: '◈', label: t('nav.gates'), name: 'gates' },
    { to: '/messages', icon: '✉', label: t('nav.messages'), name: 'messages', badge: 'messages' },
    { to: '/agents', icon: '◉', label: t('nav.agents'), name: 'agents' },
    { to: '/harness', icon: '⚡', label: 'Harness', name: 'harness' },
    { to: '/knowledge', icon: '📚', label: t('nav.knowledge'), name: 'knowledge' },
  ],
  [
    { to: '/settings', icon: '⚙', label: t('nav.settings'), name: 'settings' },
  ],
]);

function isActive(item: { to: string }): boolean {
  if (item.to === '/') return route.path === '/';
  return route.path.startsWith(item.to);
}
</script>

<template>
  <aside
    class="sidebar-rail"
    :class="{ 'sidebar-expanded': expanded }"
    @mouseenter="expanded = true"
    @mouseleave="expanded = false"
  >
    <!-- Brand — replaced the old "Y" text avatar with the official StarkLab logo image -->
    <div class="flex items-center gap-2 px-3 pb-4 pt-2">
      <img
        src="../../assets/starklab_logo.png"
        alt="史塔克實驗室"
        class="h-7 w-7 min-w-[28px] rounded-md object-cover"
      />
      <span class="sidebar-label text-sm font-bold tracking-tight text-text-primary">史塔克實驗室</span>
    </div>

    <!-- Nav groups -->
    <nav class="flex-1">
      <template v-for="(group, gi) in navGroups" :key="gi">
        <div v-if="gi > 0" class="mx-3 my-2 h-px bg-border-default"></div>
        <RouterLink
          v-for="item in group"
          :key="item.name"
          :to="item.to"
          class="group relative flex items-center gap-2.5 border-l-[3px] border-transparent px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-all duration-150 hover:bg-bg-hover hover:text-text-primary"
          :class="{
            '!border-l-accent !bg-bg-active !text-accent-light': isActive(item),
          }"
        >
          <span class="w-5 min-w-[20px] text-center text-[15px]">{{ item.icon }}</span>
          <span class="sidebar-label">{{ item.label }}</span>

          <!-- Badge dot (collapsed) -->
          <span
            v-if="item.badge === 'session' && sessionsStore.activeCount > 0"
            class="badge-dot bg-accent"
          ></span>
          <span
            v-if="item.badge === 'messages' && messagesStore.unreadCount > 0"
            class="badge-dot bg-warning"
          ></span>

          <!-- Badge number (expanded) -->
          <span
            v-if="item.badge === 'session' && sessionsStore.activeCount > 0"
            class="sidebar-label ml-auto rounded-full bg-accent px-[7px] py-[2px] text-[10px] font-semibold text-white"
          >
            {{ sessionsStore.activeCount }}
          </span>
          <span
            v-if="item.badge === 'messages' && messagesStore.unreadCount > 0"
            class="sidebar-label ml-auto rounded-full bg-warning px-[7px] py-[2px] text-[10px] font-semibold text-white"
          >
            {{ messagesStore.unreadCount }}
          </span>
        </RouterLink>
      </template>
    </nav>

    <!-- Bottom version -->
    <div class="mt-auto flex items-center gap-2 px-4 py-2 text-[10px] text-text-muted">
      <span>v0.1</span>
      <span
        v-if="sessionsStore.activeCount > 0"
        class="sidebar-label ml-auto rounded-full bg-success-dim px-2 py-0.5 text-[10px] text-success"
      >
        {{ $t('components.sidebar.activeCount', { n: sessionsStore.activeCount }) }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-rail {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 52px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow: hidden;
  white-space: nowrap;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-default);
  transition: width 200ms ease;
}

.sidebar-expanded {
  width: 200px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
}

/* Labels: hidden by default, fade in on expand */
.sidebar-label {
  opacity: 0;
  transition: opacity 150ms ease 50ms;
}
.sidebar-expanded .sidebar-label {
  opacity: 1;
}

/* Badge dot: shown when collapsed, hidden when expanded */
.badge-dot {
  position: absolute;
  top: 8px;
  left: 34px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: opacity 150ms;
}
.sidebar-expanded .badge-dot {
  opacity: 0;
}
</style>
