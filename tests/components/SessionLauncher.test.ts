import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionLauncher from '../../src/components/session/SessionLauncher.vue';
import { useAgentsStore, type AgentDefinition } from '../../src/stores/agents';
import { useUiStore } from '../../src/stores/ui';
import en from '../../src/locales/en.json';
import { sharedMessages } from '../../packages/i18n-shared/src';

// ── i18n stub (real en messages so titles/hints are observable) ────────────
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { ...(sharedMessages.en as object), ...(en as object) },
  },
});

const PUBLICATION_AGENT: AgentDefinition = {
  id: 'publication-operator',
  name: 'Publication Operator',
  level: 'L2',
  department: 'academic-publication',
  description: '',
  tools: [],
  color: '#000000',
  model: 'sonnet',
  manages: [],
  reportsTo: 'research-director',
  coordinatesWith: [],
  filePath: '',
};

// ── helpers ─────────────────────────────────────────────────────────────
function mountLauncher(pinia: Pinia) {
  const agentsStore = useAgentsStore();
  agentsStore.agents.push(PUBLICATION_AGENT);

  const wrapper = mount(SessionLauncher, {
    global: { plugins: [pinia, i18n] },
    props: { show: false, preselectedAgentId: PUBLICATION_AGENT.id },
  });
  return wrapper;
}

/** The launch button's footer is rendered through BaseModal's <Teleport to="body">,
 * so it lives in `document.body`, not inside the wrapper's own subtree
 * (verified: `wrapper.find()` cannot see teleported nodes with @vue/test-utils). */
function findLaunchButton(): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Launch',
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error('Launch button not found in document');
  return btn;
}

describe('SessionLauncher — launch failure feedback', () => {
  let pinia: Pinia;
  // The launch button is rendered through BaseModal's <Teleport to="body">, which
  // is NOT cleaned up automatically between tests unless the wrapper is unmounted —
  // otherwise a stale button from a previous test's DOM would be matched instead.
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(window.maestro.sessions.spawn).mockReset();
    vi.mocked(window.maestro.tasks.list).mockReset().mockReturnValue([]);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it('shows an ARS_PATH_NOT_SET toast with the unwrapped, human-readable message and keeps the launcher open', async () => {
    vi.mocked(window.maestro.sessions.spawn).mockRejectedValue(
      new Error(
        "Error invoking remote method 'sessions:spawn': Error: ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑",
      ),
    );

    wrapper = mountLauncher(pinia);
    await wrapper.setProps({ show: true });
    await flushPromises();

    findLaunchButton().click();
    await flushPromises();

    const uiStore = useUiStore(pinia);
    expect(uiStore.toasts).toHaveLength(1);
    const toast = uiStore.toasts[0];
    expect(toast.type).toBe('error');
    expect(toast.title).toBe('ARS Path Not Set');
    // IPC wrapper + inner "Error:" prefix must be stripped — only the ARS detail + hint remain.
    expect(toast.message).not.toContain('Error invoking remote method');
    expect(toast.message).toContain('尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑');
    expect(toast.message).toContain('Academic Publication');

    // Launcher must stay open on failure.
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.emitted('launched')).toBeUndefined();
  });

  it('shows a generic launch-failed toast for non-ARS errors, with the message unwrapped', async () => {
    vi.mocked(window.maestro.sessions.spawn).mockRejectedValue(
      new Error("Error invoking remote method 'sessions:spawn': Error: agent not found"),
    );

    wrapper = mountLauncher(pinia);
    await wrapper.setProps({ show: true });
    await flushPromises();

    findLaunchButton().click();
    await flushPromises();

    const uiStore = useUiStore(pinia);
    expect(uiStore.toasts).toHaveLength(1);
    const toast = uiStore.toasts[0];
    expect(toast.type).toBe('error');
    expect(toast.title).toBe('Launch Failed');
    expect(toast.message).toBe('agent not found');

    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('does not show any toast and closes the launcher on a successful spawn', async () => {
    vi.mocked(window.maestro.sessions.spawn).mockResolvedValue({
      sessionId: 'sess-1',
      ptyId: 'pty-1',
    });

    wrapper = mountLauncher(pinia);
    await wrapper.setProps({ show: true });
    await flushPromises();

    findLaunchButton().click();
    await flushPromises();

    const uiStore = useUiStore(pinia);
    expect(uiStore.toasts).toHaveLength(0);
    expect(wrapper.emitted('launched')).toEqual([['sess-1']]);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
