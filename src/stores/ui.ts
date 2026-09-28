import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useIpc } from '../composables/useIpc';
import { i18n } from '../plugins/i18n';
import { buildAppNotificationToast, isValidAppNotification } from '../utils/app-notification';

export type Theme = 'dark' | 'light';
export type SessionGroupMode = 'none' | 'project' | 'department';

export interface ErrorItem {
  id: string;
  message: string;
  timestamp: number;
}

export interface ToastItem {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  message: string;
}

export const useUiStore = defineStore('ui', () => {
  const activeSessions = ref(0);
  const theme = ref<Theme>('dark');
  const errors = ref<ErrorItem[]>([]);
  const toasts = ref<ToastItem[]>([]);
  const scrollPositions = ref<Record<string, number>>({});
  const sessionGroupMode = ref<SessionGroupMode>(
    (localStorage.getItem('maestro-session-group') as SessionGroupMode) || 'none',
  );

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme.value);
    localStorage.setItem('maestro-theme', theme.value);
  }

  function initTheme() {
    const saved = localStorage.getItem('maestro-theme') as Theme | null;
    if (saved) {
      theme.value = saved;
    }
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  function addError(message: string) {
    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    errors.value.push({ id, message, timestamp: Date.now() });
    // Auto-dismiss after 5s
    setTimeout(() => {
      errors.value = errors.value.filter((e) => e.id !== id);
    }, 5000);
  }

  function dismissError(id: string) {
    errors.value = errors.value.filter((e) => e.id !== id);
  }

  function addToast(
    message: string,
    type: ToastItem['type'],
    title?: string,
    duration: number = 5000,
  ) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    toasts.value.push({ id, type, title, message });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, duration);
  }

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function saveScrollPosition(path: string, top: number) {
    scrollPositions.value[path] = top;
  }

  function getScrollPosition(path: string): number {
    return scrollPositions.value[path] || 0;
  }

  function setSessionGroupMode(mode: SessionGroupMode) {
    sessionGroupMode.value = mode;
    localStorage.setItem('maestro-session-group', mode);
  }

  // Guarded inside the store's setup() closure (mirrors `tasks.ts`'s
  // `initSyncListener`), which Pinia runs exactly once per store instance —
  // so calling `setupNotificationListener()` more than once (e.g. App.vue
  // remounting) never registers the IPC listener twice.
  let notificationListenerRegistered = false;

  /** Subscribes once to the existing `notification` IPC channel
   * (api-design §7.3) and turns each payload into a toast. Malformed
   * payloads (not an object, or missing `message`) are dropped with a
   * `console.warn` — they must never crash the renderer. */
  function setupNotificationListener() {
    if (notificationListenerRegistered) return;
    notificationListenerRegistered = true;

    const { onNotification } = useIpc();
    onNotification((data: unknown) => {
      if (!isValidAppNotification(data)) {
        console.warn('Ignoring malformed app notification payload', data);
        return;
      }
      const { title, message, type } = buildAppNotificationToast(data, i18n.global.t);
      addToast(message, type, title);
    });
  }

  return {
    activeSessions,
    theme,
    errors,
    toasts,
    toggleTheme,
    initTheme,
    addError,
    dismissError,
    addToast,
    dismissToast,
    scrollPositions,
    saveScrollPosition,
    getScrollPosition,
    sessionGroupMode,
    setSessionGroupMode,
    setupNotificationListener,
  };
});
