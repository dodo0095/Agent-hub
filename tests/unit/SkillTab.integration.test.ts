import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillTab from '../../src/components/harness/SkillTab.vue';
import SkillDetailPanel from '../../src/components/harness/SkillDetailPanel.vue';
import type { SkillItem } from '../../src/stores/harness';

// ── i18n stub ─────────────────────────────────────────────
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

// ── Mutable store instance（各 test 共享，beforeEach reset）─
const mockSelectSkill = vi.fn();
const mockFetchSkills = vi.fn();

let mockStoreInstance: Record<string, unknown>;

vi.mock('../../src/stores/harness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/stores/harness')>();
  return {
    ...actual,
    useHarnessStore: () => mockStoreInstance,
  };
});

// ── IPC mock ──────────────────────────────────────────────
const mockExportSkills = vi.fn(() => Promise.resolve({ version: 1, skills: [] }));

vi.mock('../../src/composables/useIpc', () => ({
  useIpc: () => ({
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    toggleSkill: vi.fn(),
    deploySkill: vi.fn(),
    exportSkills: mockExportSkills,
    importSkills: vi.fn(),
    listSkills: vi.fn(() => Promise.resolve([])),
    getSkill: vi.fn(() => Promise.resolve(null)),
  }),
}));

// ── fixture ───────────────────────────────────────────────
const userSkill: SkillItem = {
  name: 'my-skill',
  path: 'my-skill',
  source: 'custom',
  scope: 'global',
  enabled: true,
  content: '## Hello',
};

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
    mockFetchSkills.mockReset().mockResolvedValue(undefined);
    mockSelectSkill.mockReset().mockResolvedValue(undefined);

    // 每次 reset 一份新的 store stub
    mockStoreInstance = {
      skills: [],
      hooks: [],
      loading: false,
      searchQuery: '',
      projectFilter: 'all',
      filteredSkills: [],
      selectedSkill: null,
      selectedSkillName: 'some-previous-skill',   // 預設非 null，便於驗證 delete 清空
      fetchSkills: mockFetchSkills,
      fetchHooks: vi.fn(),
      selectSkill: mockSelectSkill,
      setTab: vi.fn(),
    };
  });

  // ── Create ────────────────────────────────────────────
  it('「✨ 新增」按鈕可開啟 SkillCreateModal', async () => {
    const wrapper = mountTab();

    expect(wrapper.find('.modal-overlay').exists()).toBe(false);

    const newBtn = wrapper.findAll('button').find(b => b.text().includes('新增'));
    await newBtn!.trigger('click');

    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  // ── onEditSkill ───────────────────────────────────────
  it('onEditSkill 呼叫 selectSkill 並觸發 DetailPanel enterEditMode', async () => {
    // 給 DetailPanel 一個 skill 讓 edit mode 可以渲染
    mockStoreInstance.selectedSkill = userSkill;
    const wrapper = mountTab();

    // spy on exposed enterEditMode
    const detailPanel = wrapper.findComponent(SkillDetailPanel);
    const enterEditModeSpy = vi.spyOn(detailPanel.vm as { enterEditMode: () => void }, 'enterEditMode');

    // 由 SkillList emit edit 事件觸發 onEditSkill
    await wrapper.findComponent({ name: 'SkillList' }).vm.$emit('edit', userSkill);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick(); // 等 selectSkill resolved + nextTick

    expect(mockSelectSkill).toHaveBeenCalledWith('my-skill', 'global', undefined);
    expect(enterEditModeSpy).toHaveBeenCalled();
  });

  // ── Delete ────────────────────────────────────────────
  it('delete emit 後呼叫 fetchSkills 並清空 selectedSkillName', async () => {
    const wrapper = mountTab();

    // 確認初始值非 null
    expect(mockStoreInstance.selectedSkillName).toBe('some-previous-skill');

    await wrapper.findComponent(SkillDetailPanel).vm.$emit(
      'delete', 'my-skill', 'global', undefined,
    );
    await wrapper.vm.$nextTick();

    expect(mockFetchSkills).toHaveBeenCalled();
    expect(mockStoreInstance.selectedSkillName).toBeNull();
  });

  // ── Deploy ────────────────────────────────────────────
  it('deploy emit 後呼叫 fetchSkills 並顯示 toast', async () => {
    const wrapper = mountTab();

    await wrapper.findComponent(SkillDetailPanel).vm.$emit(
      'deploy', 'my-skill', ['/projects/alpha', '/projects/beta'],
    );
    await wrapper.vm.$nextTick();

    expect(mockFetchSkills).toHaveBeenCalled();
    expect(wrapper.find('.toast').text()).toContain('2');
  });
});
