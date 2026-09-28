import { extractIpcErrorMessage, parseArsError, type ArsErrorCode } from './ipc-error';

/** Minimal shape of vue-i18n's `t()` this module needs — kept loose so callers
 * don't have to pull in vue-i18n's full type just to call `notifySpawnError`. */
export type Translate = (key: string) => string;

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
    const bodyKey = ARS_ERROR_BODY_KEYS[arsError.code];
    return {
      title: t(ARS_ERROR_TITLE_KEYS[arsError.code]),
      message: bodyKey ? t(bodyKey) : arsError.detail,
    };
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
