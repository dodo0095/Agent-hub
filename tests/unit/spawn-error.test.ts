import { describe, expect, it, vi } from 'vitest';
import { buildSpawnErrorToast, notifySpawnError } from '../../src/utils/spawn-error';

// A tiny stand-in for vue-i18n's `t()` — resolves the exact keys this module uses.
const MESSAGES: Record<string, string> = {
  'sessions.launcher.launchFailed': 'Launch Failed',
  'sessions.launcher.launchFailedFallback': 'An unknown error occurred while launching',
  'sessions.launcher.arsPathNotSetTitle': 'ARS Path Not Set',
  'sessions.launcher.arsInstallIncompleteTitle': 'ARS Installation Incomplete',
  'sessions.launcher.arsRequiresInteractiveTitle': 'ARS Requires Interactive Mode',
  'sessions.launcher.arsPathNotSetHint': 'Go to Settings → Academic Publication to set the ARS path.',
  'sessions.launcher.arsRequiresInteractiveHint':
    'Academic Publication sessions must be launched in interactive mode. Please retry using the normal launch flow.',
};
const t = (key: string) => MESSAGES[key] ?? key;

describe('buildSpawnErrorToast', () => {
  it('ARS_PATH_NOT_SET: i18n title + i18n body only — never echoes the backend Chinese detail (MN-10)', () => {
    const err = new Error(
      "Error invoking remote method 'sessions:spawn': Error: ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑",
    );
    const toast = buildSpawnErrorToast(err, t);
    expect(toast).toEqual({
      title: 'ARS Path Not Set',
      message: 'Go to Settings → Academic Publication to set the ARS path.',
    });
    expect(toast.message).not.toContain('尚未設定');
  });

  it('ARS_REQUIRES_INTERACTIVE: i18n title + i18n body only, same rule as ARS_PATH_NOT_SET (MN-10)', () => {
    const err = new Error(
      "Error invoking remote method 'sessions:spawn': Error: ARS_REQUIRES_INTERACTIVE: ARS 檢查點必須由老闆回覆，出版部只能以互動模式啟動",
    );
    const toast = buildSpawnErrorToast(err, t);
    expect(toast).toEqual({
      title: 'ARS Requires Interactive Mode',
      message:
        'Academic Publication sessions must be launched in interactive mode. Please retry using the normal launch flow.',
    });
    expect(toast.message).not.toContain('檢查點');
  });

  it('ARS_INSTALL_INCOMPLETE (resume path, MJ-3): i18n title, but keeps the backend detail verbatim (dynamic missing-file list + fix instructions)', () => {
    // This is the exact scenario from the G2 review's MJ-3 finding: resuming a
    // conversation whose ARS install has since gone stale.
    const err = new Error(
      "Error invoking remote method 'sessions:spawn': Error: ARS_INSTALL_INCOMPLETE: 缺少 skills/academic-paper/SKILL.md, skills/deep-research/SKILL.md；若為 zip 下載，請把 skills/ 內的 stub 檔換成同名資料夾，或改用 git clone",
    );
    const toast = buildSpawnErrorToast(err, t);
    expect(toast.title).toBe('ARS Installation Incomplete');
    expect(toast.message).toBe(
      '缺少 skills/academic-paper/SKILL.md, skills/deep-research/SKILL.md；若為 zip 下載，請把 skills/ 內的 stub 檔換成同名資料夾，或改用 git clone',
    );
  });

  it('non-ARS error: generic "Launch Failed" title with the unwrapped message', () => {
    const err = new Error("Error invoking remote method 'sessions:spawn': Error: agent not found");
    const toast = buildSpawnErrorToast(err, t);
    expect(toast).toEqual({ title: 'Launch Failed', message: 'agent not found' });
  });

  it('falls back to the i18n fallback message for an empty/non-Error rejection', () => {
    const toast = buildSpawnErrorToast(undefined, t);
    expect(toast).toEqual({
      title: 'Launch Failed',
      message: 'An unknown error occurred while launching',
    });
  });
});

describe('notifySpawnError', () => {
  it('pushes an error toast built from the error onto the given ui store (resume entry point, MJ-3)', () => {
    const addToast = vi.fn();
    const err = new Error(
      "Error invoking remote method 'sessions:resumeByConversationId': Error: ARS_INSTALL_INCOMPLETE: 缺少 skills/deep-research/SKILL.md",
    );

    notifySpawnError(err, t, { addToast });

    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      '缺少 skills/deep-research/SKILL.md',
      'error',
      'ARS Installation Incomplete',
    );
  });

  it('pushes a generic error toast for a plain launch failure', () => {
    const addToast = vi.fn();
    notifySpawnError(new Error('boom'), t, { addToast });
    expect(addToast).toHaveBeenCalledWith('boom', 'error', 'Launch Failed');
  });
});
