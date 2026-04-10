import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillDetailPanel from '../../src/components/harness/SkillDetailPanel.vue';
import type { SkillItem } from '../../src/stores/harness';

// ── i18n stub ─────────────────────────────────────────────
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

// ── IPC mock ──────────────────────────────────────────────
const mockUpdateSkill = vi.fn();

vi.mock('../../src/composables/useIpc', () => ({
  useIpc: () => ({ updateSkill: mockUpdateSkill }),
}));

// ── fixtures ──────────────────────────────────────────────
const userSkill: SkillItem = {
  name: 'my-skill',
  path: 'my-skill',
  source: 'custom',
  scope: 'global',
  enabled: true,
  content: '## My Skill Content',
};

const systemSkill: SkillItem = {
  name: 'system-skill',
  path: 'system-skill',
  source: 'system',
  scope: 'global',
  enabled: true,
  content: '## System',
};

// ── helpers ───────────────────────────────────────────────
function mountPanel(skill: SkillItem | null = userSkill, projectPaths: string[] = []) {
  return mount(SkillDetailPanel, {
    global: { plugins: [createPinia(), i18n] },
    props: { skill, projectPaths },
  });
}

// ─────────────────────────────────────────────────────────
describe('SkillDetailPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockUpdateSkill.mockReset();
  });

  // ── Preview mode defaults ─────────────────────────────
  describe('preview mode', () => {
    it('初始狀態為 preview mode，顯示 md-block 內容', () => {
      const wrapper = mountPanel();

      expect(wrapper.find('.md-block').exists()).toBe(true);
      expect(wrapper.find('.edit-textarea').exists()).toBe(false);
    });

    it('User Skill 顯示 Edit 按鈕', () => {
      const wrapper = mountPanel(userSkill);

      expect(wrapper.find('button.btn-outline').text()).toContain('編輯');
    });

    it('System Skill 不顯示 Edit 按鈕', () => {
      const wrapper = mountPanel(systemSkill);

      const editBtn = wrapper.findAll('button').find(b => b.text().includes('編輯'));
      expect(editBtn).toBeUndefined();
    });

    it('System Skill 不顯示 Delete 按鈕', () => {
      const wrapper = mountPanel(systemSkill);

      const deleteBtn = wrapper.findAll('button').find(b => b.text().includes('刪除'));
      expect(deleteBtn).toBeUndefined();
    });
  });

  // ── Edit mode ─────────────────────────────────────────
  describe('edit mode', () => {
    it('點 Edit 按鈕進入 edit mode，顯示 textarea', async () => {
      const wrapper = mountPanel();

      const editBtn = wrapper.findAll('button').find(b => b.text().includes('編輯'));
      await editBtn!.trigger('click');

      expect(wrapper.find('.edit-textarea').exists()).toBe(true);
      expect(wrapper.find('.md-block').exists()).toBe(false);
    });

    it('edit mode 點 Save 呼叫 updateSkill，emit save', async () => {
      mockUpdateSkill.mockResolvedValue(undefined);
      const wrapper = mountPanel();

      const editBtn = wrapper.findAll('button').find(b => b.text().includes('編輯'));
      await editBtn!.trigger('click');

      await wrapper.find('.edit-textarea').setValue('## Updated');
      const saveBtn = wrapper.findAll('button').find(b => b.text().includes('儲存'));
      await saveBtn!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(mockUpdateSkill).toHaveBeenCalledWith({
        name: 'my-skill',
        content: '## Updated',
        scope: 'global',
        projectPath: undefined,
      });
      expect(wrapper.emitted('save')).toBeTruthy();
    });

    it('edit mode 點 Cancel，mode 回 preview，textarea 消失', async () => {
      const wrapper = mountPanel();

      const editBtn = wrapper.findAll('button').find(b => b.text().includes('編輯'));
      await editBtn!.trigger('click');
      expect(wrapper.find('.edit-textarea').exists()).toBe(true);

      const cancelBtn = wrapper.findAll('button').find(b => b.text() === '取消');
      await cancelBtn!.trigger('click');

      expect(wrapper.find('.edit-textarea').exists()).toBe(false);
      expect(wrapper.find('.md-block').exists()).toBe(true);
    });
  });

  // ── Skill prop change ─────────────────────────────────
  describe('skill prop change', () => {
    it('skill prop 切換時 mode 自動 reset 為 preview', async () => {
      const wrapper = mountPanel(userSkill);

      // Enter edit mode
      const editBtn = wrapper.findAll('button').find(b => b.text().includes('編輯'));
      await editBtn!.trigger('click');
      expect(wrapper.find('.edit-textarea').exists()).toBe(true);

      // Switch skill prop
      await wrapper.setProps({ skill: { ...userSkill, name: 'other-skill' } });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.edit-textarea').exists()).toBe(false);
      expect(wrapper.find('.md-block').exists()).toBe(true);
    });
  });
});
