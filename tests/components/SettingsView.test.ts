import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '../../src/views/SettingsView.vue';
import en from '../../src/locales/en.json';
import { sharedMessages } from '../../packages/i18n-shared/src';

// ── i18n stub (real en messages so labels/hints are observable in the DOM) ──
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { ...(sharedMessages.en as object), ...(en as object) },
  },
});

// ── helpers ──────────────────────────────────────────────────────────────
function mountSettings() {
  return mount(SettingsView, {
    global: { plugins: [createPinia(), i18n] },
  });
}

function findArsField(wrapper: ReturnType<typeof mount>) {
  const fields = wrapper.findAll('.form-field');
  const field = fields.find((f) => f.find('.field-label').text() === 'ARS Path');
  if (!field) throw new Error('ARS Path field not found');
  return field;
}

describe('SettingsView — ARS path field', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(window.maestro.settings.getAll).mockReset();
    vi.mocked(window.maestro.settings.get).mockReset();
    vi.mocked(window.maestro.settings.update).mockReset();
    vi.mocked(window.maestro.settings.update).mockResolvedValue(undefined);
  });

  it('renders the ARS path label and hint text', async () => {
    vi.mocked(window.maestro.settings.getAll).mockResolvedValue({});
    const wrapper = mountSettings();
    await flushPromises();

    const field = findArsField(wrapper);
    expect(field.text()).toContain('ARS Path');
    expect(field.text()).toContain('Academic Research Skills');
    expect(field.text()).toContain('CC BY-NC 4.0');
    expect(field.text()).toContain('https://creativecommons.org/licenses/by-nc/4.0/');
  });

  it('loads the existing ars.plugin-dir value into the input on mount', async () => {
    vi.mocked(window.maestro.settings.getAll).mockResolvedValue({
      'ars.plugin-dir': '/opt/ars-root',
    });
    const wrapper = mountSettings();
    await flushPromises();

    const input = findArsField(wrapper).find('input');
    expect((input.element as HTMLInputElement).value).toBe('/opt/ars-root');
  });

  it('saves the edited path by calling settings.update with key "ars.plugin-dir"', async () => {
    vi.mocked(window.maestro.settings.getAll).mockResolvedValue({});
    const wrapper = mountSettings();
    await flushPromises();

    const input = findArsField(wrapper).find('input');
    await input.setValue('C:\\ars\\my-root');

    const saveButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save Settings');
    if (!saveButton) throw new Error('Save button not found');
    await saveButton.trigger('click');
    await flushPromises();

    expect(window.maestro.settings.update).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ars.plugin-dir', value: 'C:\\ars\\my-root' }),
    );
  });
});
