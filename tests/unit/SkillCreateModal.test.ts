import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillCreateModal from '../../src/components/harness/SkillCreateModal.vue';

// ── i18n stub ─────────────────────────────────────────────
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

// ── IPC mock ──────────────────────────────────────────────
const mockCreateSkill = vi.fn();

vi.mock('../../src/composables/useIpc', () => ({
  useIpc: () => ({ createSkill: mockCreateSkill }),
}));

// ── helpers ───────────────────────────────────────────────
function mountModal(props = {}) {
  return mount(SkillCreateModal, {
    global: { plugins: [createPinia(), i18n] },
    props: { show: true, projectPaths: ['/projects/alpha', '/projects/beta'], ...props },
  });
}

// ─────────────────────────────────────────────────────────
describe('SkillCreateModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockCreateSkill.mockReset();
  });

  // ── Error cases ────────────────────────────────────────
  describe('validation', () => {
    it('空名稱送出時顯示 inline error，不觸發 IPC', async () => {
      const wrapper = mountModal();

      await wrapper.find('button.btn-primary').trigger('click');

      expect(wrapper.find('.field-error').text()).toContain('不可為空');
      expect(mockCreateSkill).not.toHaveBeenCalled();
    });

    it('名稱含特殊字元時顯示 inline error，不觸發 IPC', async () => {
      const wrapper = mountModal();

      await wrapper.find('input.form-input').setValue('bad name!');
      await wrapper.find('button.btn-primary').trigger('click');

      expect(wrapper.find('.field-error').text()).toContain('只能包含');
      expect(mockCreateSkill).not.toHaveBeenCalled();
    });
  });

  // ── Happy paths ────────────────────────────────────────
  describe('happy path', () => {
    it('createSkill IPC 以正確參數被呼叫', async () => {
      mockCreateSkill.mockResolvedValue(undefined);
      const wrapper = mountModal();

      await wrapper.find('input.form-input').setValue('my-skill');
      await wrapper.find('textarea.form-textarea').setValue('## Hello');
      await wrapper.find('button.btn-primary').trigger('click');

      expect(mockCreateSkill).toHaveBeenCalledWith({
        name: 'my-skill',
        content: '## Hello',
        scope: 'global',
        projectPath: undefined,
      });
    });

    it('成功建立後 emit created 並關閉 Modal', async () => {
      mockCreateSkill.mockResolvedValue(undefined);
      const wrapper = mountModal();

      await wrapper.find('input.form-input').setValue('my-skill');
      await wrapper.find('button.btn-primary').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('created')).toBeTruthy();
      expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('scope 選 project 時以 projectPath 傳入 IPC', async () => {
      mockCreateSkill.mockResolvedValue(undefined);
      const wrapper = mountModal();

      await wrapper.find('input.form-input').setValue('proj-skill');
      await wrapper.find('select.form-select').setValue('project');
      await wrapper.vm.$nextTick();

      const selects = wrapper.findAll('select.form-select');
      // second select is projectPath dropdown
      await selects[1].setValue('/projects/alpha');
      await wrapper.find('button.btn-primary').trigger('click');

      expect(mockCreateSkill).toHaveBeenCalledWith({
        name: 'proj-skill',
        content: '',
        scope: 'project',
        projectPath: '/projects/alpha',
      });
    });
  });
});
