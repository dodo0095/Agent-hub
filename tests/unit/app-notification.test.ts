import { describe, expect, it } from 'vitest';
import {
  buildAppNotificationToast,
  isValidAppNotification,
  type AppNotificationPayload,
} from '../../src/utils/app-notification';

// A tiny stand-in for vue-i18n's `t()` — resolves the exact keys this module
// (and the `spawn-error.ts` rules it reuses) needs, including interpolation.
const MESSAGES: Record<string, string> = {
  'sessions.launcher.arsPathNotSetTitle': 'ARS Path Not Set',
  'sessions.launcher.arsInstallIncompleteTitle': 'ARS Installation Incomplete',
  'sessions.launcher.arsRequiresInteractiveTitle': 'ARS Requires Interactive Mode',
  'sessions.launcher.arsPathNotSetHint': 'Go to Settings → Academic Publication to set the ARS path.',
  'sessions.launcher.arsRequiresInteractiveHint':
    'Academic Publication sessions must be launched in interactive mode. Please retry using the normal launch flow.',
  'notifications.genericTitle': 'Notification',
};
const t = (key: string, params?: Record<string, unknown>) => {
  if (key === 'notifications.agentTag' && params?.agentId) return `[${params.agentId}]`;
  return MESSAGES[key] ?? key;
};

describe('isValidAppNotification', () => {
  it('accepts a well-formed payload', () => {
    expect(
      isValidAppNotification({ level: 'error', message: 'boom', source: 'message-broker' }),
    ).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isValidAppNotification(null)).toBe(false);
    expect(isValidAppNotification(undefined)).toBe(false);
    expect(isValidAppNotification('a string')).toBe(false);
    expect(isValidAppNotification(42)).toBe(false);
    expect(isValidAppNotification(['array'])).toBe(false);
  });

  it('rejects an object missing `message`', () => {
    expect(isValidAppNotification({ level: 'error', source: 'message-broker' })).toBe(false);
  });

  it('rejects an object with an empty `message`', () => {
    expect(isValidAppNotification({ level: 'error', message: '', source: 'x' })).toBe(false);
  });

  it('rejects a non-string `message`', () => {
    expect(isValidAppNotification({ level: 'error', message: 123, source: 'x' })).toBe(false);
  });
});

describe('buildAppNotificationToast', () => {
  it('ARS_PATH_NOT_SET: reuses the spawn-error i18n rule — title + i18n body only, no backend Chinese leaking into the en UI (MN-10)', () => {
    const payload: AppNotificationPayload = {
      level: 'error',
      code: 'ARS_PATH_NOT_SET',
      message: '尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑',
      source: 'message-broker',
    };
    const toast = buildAppNotificationToast(payload, t);
    expect(toast).toEqual({
      type: 'error',
      title: 'ARS Path Not Set',
      message: 'Go to Settings → Academic Publication to set the ARS path.',
    });
    expect(toast.message).not.toContain('尚未設定');
  });

  it('ARS_INSTALL_INCOMPLETE: keeps the backend detail verbatim (dynamic missing-file list)', () => {
    const payload: AppNotificationPayload = {
      level: 'error',
      code: 'ARS_INSTALL_INCOMPLETE',
      message: '缺少 skills/deep-research/SKILL.md',
      source: 'message-broker',
    };
    const toast = buildAppNotificationToast(payload, t);
    expect(toast.title).toBe('ARS Installation Incomplete');
    expect(toast.message).toBe('缺少 skills/deep-research/SKILL.md');
  });

  it('non-ARS payload with a backend-provided title: uses it verbatim', () => {
    const payload: AppNotificationPayload = {
      level: 'warning',
      title: 'Custom Title',
      message: 'something happened',
      source: 'message-broker',
    };
    const toast = buildAppNotificationToast(payload, t);
    expect(toast).toEqual({ type: 'warning', title: 'Custom Title', message: 'something happened' });
  });

  it('non-ARS payload without a title: falls back to the generic i18n title', () => {
    const payload: AppNotificationPayload = {
      level: 'info',
      message: 'fyi',
      source: 'message-broker',
    };
    const toast = buildAppNotificationToast(payload, t);
    expect(toast).toEqual({ type: 'info', title: 'Notification', message: 'fyi' });
  });

  it('prefixes the title with the agentId when present', () => {
    const payload: AppNotificationPayload = {
      level: 'error',
      code: 'ARS_REQUIRES_INTERACTIVE',
      message: 'ARS 檢查點必須由老闆回覆，出版部只能以互動模式啟動',
      source: 'message-broker',
      agentId: 'publication-operator',
    };
    const toast = buildAppNotificationToast(payload, t);
    expect(toast.title).toBe('[publication-operator] ARS Requires Interactive Mode');
    expect(toast.message).toBe(
      'Academic Publication sessions must be launched in interactive mode. Please retry using the normal launch flow.',
    );
  });

  it('normalizes an invalid/missing level to "error"', () => {
    const payload = {
      message: 'no level given',
      source: 'message-broker',
    } as unknown as AppNotificationPayload;
    const toast = buildAppNotificationToast(payload, t);
    expect(toast.type).toBe('error');
  });
});
