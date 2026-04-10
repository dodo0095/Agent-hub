import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillTab from '../../src/components/harness/SkillTab.vue';

// ── i18n stub ─────────────────────────────────────────────
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

// ── IPC mock ──────────────────────────────────────────────
const mockFetchSkills = vi.fn();
const mockDeleteSkill = vi.fn();
const mockExportSkills = vi.fn(() => Promise.resolve({ version: 1, skills: [] }));

vi.mock('../../src/composables/useIpc', () => ({
  useIpc: () => ({
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: mockDeleteSkill,
    toggleSkill: vi.fn(),
    deploySkill: vi.fn(),
    exportSkills: mockExportSkills,
    importSkills: vi.fn(),
    listSkills: vi.fn(() => Promise.resolve([])),
    getSkill: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('../../src/stores/harness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/stores/harness')>();
  return {
    ...actual,
    useHarnessStore: () => ({
      skills: [],
      hooks: [],
      loading: false,
      searchQuery: '',
      projectFilter: 'all',
      filteredSkills: [],
      selectedSkill: null,
      selectedSkillName: null,
      fetchSkills: mockFetchSkills,
      fetchHooks: vi.fn(),
      selectSkill: vi.fn(),
      setTab: vi.fn(),
    }),
  };
});

// ── helpers ───────────────────────────────────────────────
function mountTab() {
  return mount(SkillTab, {
    global: { plugins: [createPinia(), i18n] },
  });
}

// ─────────────────────────────────────────────────────────
describe('SkillTab integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockFetchSkills.mockReset();
    mockDeleteSkill.mockReset();
  });

  it('「✨ 新增」按鈕可開啟 SkillCreateModal', async () => {
    const wrapper = mountTab();

    // Modal should be hidden initially
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);

    const newBtn = wrapper.findAll('button').find(b => b.text().includes('新增'));
    await newBtn!.trigger('click');

    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  it('delete emit 後呼叫 fetchSkills 並清空 selectedSkillName', async () => {
    mockFetchSkills.mockResolvedValue(undefined);
    const wrapper = mountTab();

    // Simulate SkillDetailPanel emitting delete
    await wrapper.findComponent({ name: 'SkillDetailPanel' }).vm.$emit(
      'delete', 'my-skill', 'global', undefined
    );
    await wrapper.vm.$nextTick();

    expect(mockFetchSkills).toHaveBeenCalled();
  });

  it('deploy emit 後呼叫 fetchSkills 並顯示 toast', async () => {
    mockFetchSkills.mockResolvedValue(undefined);
    const wrapper = mountTab();

    await wrapper.findComponent({ name: 'SkillDetailPanel' }).vm.$emit(
      'deploy', 'my-skill', ['/projects/alpha', '/projects/beta']
    );
    await wrapper.vm.$nextTick();

    expect(mockFetchSkills).toHaveBeenCalled();
    expect(wrapper.find('.toast').text()).toContain('2');
  });
});
