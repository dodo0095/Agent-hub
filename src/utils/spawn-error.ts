import { extractIpcErrorMessage, parseArsError, type ArsErrorCode } from './ipc-error';

/** Minimal shape of vue-i18n's `t()` this module needs — kept loose so callers
 * don't have to pull in vue-i18n's full type just to call `notifySpawnError`.
 * The optional `params` covers interpolated keys (e.g. `{ agentId }`). */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Minimal shape of the `ui` Pinia store's `addToast` this module needs. */
export interface ToastNotifier {
  addToast: (
    message: string,
    type: 'error' | 'success' | 'warning' | 'info',
    title?: string,
  ) => void;
}

const ARS_ERROR_TITLE_KEYS: Record<ArsErrorCode, string> = {
  ARS_PATH_NOT_SET: 'sessions.launcher.arsPathNotSetTitle',
  ARS_INSTALL_INCOMPLETE: 'sessions.launcher.arsInstallIncompleteTitle',
  ARS_REQUIRES_INTERACTIVE: 'sessions.launcher.arsRequiresInteractiveTitle',
};

/** `ARS_PATH_NOT_SET` / `ARS_REQUIRES_INTERACTIVE` show i18n text only — the
 * backend detail (already a Chinese string from the main process, see
 * `electron/services/session-spawn-helpers.ts`) is never echoed, so it can't
 * duplicate the hint or mix Chinese into the English UI.
 * `ARS_INSTALL_INCOMPLETE` is intentionally absent: its detail is dynamic
 * (the missing-file list + fix instructions) and is worth showing verbatim. */
const ARS_ERROR_BODY_KEYS: Partial<Record<ArsErrorCode, string>> = {
  ARS_PATH_NOT_SET: 'sessions.launcher.arsPathNotSetHint',
  ARS_REQUIRES_INTERACTIVE: 'sessions.launcher.arsRequiresInteractiveHint',
};

export interface SpawnErrorToast {
  title: string;
  message: string;
}

/** Builds the `{ title, message }` pair for a known ARS_* error code + its
 * detail text. Shared by `buildSpawnErrorToast` (parses a raw spawn/resume
 * error) and `buildAppNotificationToast` (`src/utils/app-notification.ts`,
 * which already receives `code` and `message` as separate fields from the
 * `notification` IPC channel) so the MN-10 rule — `ARS_PATH_NOT_SET` /
 * `ARS_REQUIRES_INTERACTIVE` show i18n text only, never the backend's
 * Chinese detail — lives in exactly one place. */
export function buildArsErrorToast(
  code: ArsErrorCode,
  detail: string,
  t: Translate,
): SpawnErrorToast {
  const bodyKey = ARS_ERROR_BODY_KEYS[code];
  return {
    title: t(ARS_ERROR_TITLE_KEYS[code]),
    message: bodyKey ? t(bodyKey) : detail,
  };
}

/** Builds the `{ title, message }` pair to show for a failed session spawn or
 * resume (`sessionsStore.spawn` / `resumeByConversationId`, and anything else
 * that goes through `ipc.spawnSession`). Centralizing this means every UI
 * entry point (launcher, resume-from-history, harness/company-manager quick
 * launch, …) reports failures the same way instead of some of them silently
 * swallowing the error. */
export function buildSpawnErrorToast(err: unknown, t: Translate): SpawnErrorToast {
  const message = extractIpcErrorMessage(err, t('sessions.launcher.launchFailedFallback'));
  const arsError = parseArsError(message);
  if (arsError) {
    return buildArsErrorToast(arsError.code, arsError.detail, t);
  }
  return { title: t('sessions.launcher.launchFailed'), message };
}

/** Convenience wrapper: builds the toast via `buildSpawnErrorToast` and pushes
 * it onto the `ui` store as an error toast. Use this from a `catch` block
 * around any spawn/resume call. */
export function notifySpawnError(err: unknown, t: Translate, uiStore: ToastNotifier): void {
  const { title, message } = buildSpawnErrorToast(err, t);
  uiStore.addToast(message, 'error', title);
}
