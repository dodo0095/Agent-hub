<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from '../../stores/ui';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();

// Fallback title shown when no route-level titleKey is defined (e.g. root or unknown routes)
const pageTitle = computed(() => {
  const key = route.meta.titleKey as string | undefined;
  return key ? t(key) : 'StarkLab AgentHub';
});

const showUserDropdown = ref(false);
const userPillRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);

function toggleDropdown() {
  showUserDropdown.value = !showUserDropdown.value;
}

function closeDropdown() {
  showUserDropdown.value = false;
}

function goToSettings() {
  router.push('/settings');
}

function onClickOutside(e: MouseEvent) {
  if (
    showUserDropdown.value &&
    userPillRef.value &&
    dropdownRef.value &&
    !userPillRef.value.contains(e.target as Node) &&
    !dropdownRef.value.contains(e.target as Node)
  ) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside, true);
});
onUnmounted(() => {
  document.removeEventListener('click', onClickOutside, true);
});
</script>

<template>
  <header
    class="flex h-[52px] min-h-[52px] items-center gap-4 border-b border-border-default bg-bg-secondary pl-6 pr-[144px]"
    style="-webkit-app-region: drag"
  >
    <h1 class="whitespace-nowrap text-base font-semibold">{{ pageTitle }}</h1>

    <div style="-webkit-app-region: no-drag">
      <slot name="actions" />
    </div>

    <!-- Right section -->
    <div class="relative ml-auto flex items-center gap-2.5" style="-webkit-app-region: no-drag">
      <!-- Search box -->
      <div
        class="flex cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-bg-card px-3 py-1.5 text-[13px] text-text-muted"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="flex-shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span>{{ $t('components.topbar.search') }}</span>
        <kbd
          class="rounded border border-border-light bg-bg-hover px-1.5 py-[1px] font-sans text-[11px]"
        >
          Ctrl+K
        </kbd>
      </div>

      <!-- Theme toggle -->
      <button
        class="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-lg border border-border-default bg-transparent text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        :title="uiStore.theme === 'dark' ? $t('components.topbar.switchToLight') : $t('components.topbar.switchToDark')"
        @click="uiStore.toggleTheme()"
      >
        {{ uiStore.theme === 'dark' ? '\u25D1' : '\u25D0' }}
      </button>

      <!-- Settings gear -->
      <button
        class="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-lg border border-border-default bg-transparent text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        :title="$t('components.topbar.settingsTitle')"
        @click="goToSettings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  </header>
</template>
