import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../../src/stores/ui';
import { i18n } from '../../src/plugins/i18n';

describe('useUiStore().setupNotificationListener (api-design §7.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(window.maestro.on.notification).mockReset();
    // Deterministic locale so toast text assertions don't depend on the
    // test runner's navigator.language.
    i18n.global.locale.value = 'en';
  });

  function capturedCallback(): (data: unknown) => void {
    const calls = vi.mocked(window.maestro.on.notification).mock.calls;
    if (calls.length === 0) throw new Error('notification listener was never registered');
    return calls[0][0] as (data: unknown) => void;
  }

  it('registers exactly one IPC listener even when called multiple times (no duplicate registration)', () => {
    const uiStore = useUiStore();
    uiStore.setupNotificationListener();
    uiStore.setupNotificationListener();
    uiStore.setupNotificationListener();

    expect(window.maestro.on.notification).toHaveBeenCalledTimes(1);
  });

  it('shows a toast for an ARS_PATH_NOT_SET payload with i18n-only text (no backend Chinese in the en UI, MN-10)', () => {
    const uiStore = useUiStore();
    uiStore.setupNotificationListener();

    capturedCallback()({
      level: 'error',
      code: 'ARS_PATH_NOT_SET',
      message: '尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑',
      source: 'message-broker',
      agentId: 'publication-operator',
    });

    expect(uiStore.toasts).toHaveLength(1);
    const toast = uiStore.toasts[0];
    expect(toast.type).toBe('error');
    expect(toast.title).toBe('[publication-operator] ARS Path Not Set');
    expect(toast.message).toBe('Go to Settings → Academic Publication to set the ARS path.');
    expect(toast.message).not.toContain('尚未設定');
  });

  it('shows a toast for a non-ARS payload using the given title verbatim', () => {
    const uiStore = useUiStore();
    uiStore.setupNotificationListener();

    capturedCallback()({
      level: 'warning',
      title: 'Heads up',
      message: 'Something you should know',
      source: 'message-broker',
    });

    expect(uiStore.toasts).toHaveLength(1);
    expect(uiStore.toasts[0]).toMatchObject({
      type: 'warning',
      title: 'Heads up',
      message: 'Something you should know',
    });
  });

  it('ignores a malformed payload (not an object) and does not add a toast', () => {
    const uiStore = useUiStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    uiStore.setupNotificationListener();

    capturedCallback()('not an object');
    capturedCallback()(null);
    capturedCallback()(undefined);

    expect(uiStore.toasts).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it('ignores a payload missing `message` and does not add a toast', () => {
    const uiStore = useUiStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    uiStore.setupNotificationListener();

    capturedCallback()({ level: 'error', source: 'message-broker' });

    expect(uiStore.toasts).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
