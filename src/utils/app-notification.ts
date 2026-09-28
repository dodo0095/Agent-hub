import { ARS_ERROR_CODES, parseArsError, type ArsErrorCode } from './ipc-error';
import { buildArsErrorToast, type SpawnErrorToast, type Translate } from './spawn-error';

/** Payload shape for the `notification` IPC channel (api-design §7.3). The
 * main process sends this via `safeSend(IpcChannels.NOTIFICATION, payload)`
 * — same wiring as `message:created` — for out-of-band events like a
 * MessageBroker auto-spawn failure.
 *
 * `source` is narrowed to the one value the backend actually emits today
 * (`electron/services/message-broker.ts`'s `handleArsAutoSpawnFailure`) for
 * type safety / documentation. `isValidAppNotification` deliberately does
 * NOT check `source` at runtime — an unrecognized value is still accepted
 * so a future emitter isn't silently dropped by the renderer. */
export interface AppNotificationPayload {
  level: 'error' | 'warning' | 'info';
  code?: string;
  title?: string;
  message: string;
  source: 'message-broker';
  agentId?: string;
}

const NOTIFICATION_LEVELS = ['error', 'warning', 'info'] as const;
type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

function isArsErrorCode(code: unknown): code is ArsErrorCode {
  return typeof code === 'string' && (ARS_ERROR_CODES as readonly string[]).includes(code);
}

/** Defensive type guard for the raw IPC payload — anything that isn't a
 * plain object, or is missing a non-empty `message`, is rejected. The
 * `notification` channel is fired by the main process (via `safeSend`)
 * without a renderer-side type check, so a malformed payload must never
 * throw and crash the renderer; the caller should `console.warn` and drop
 * it (see `useUiStore().setupNotificationListener`). */
export function isValidAppNotification(data: unknown): data is AppNotificationPayload {
  if (typeof data !== 'object' || data === null) return false;
  const message = (data as Record<string, unknown>).message;
  return typeof message === 'string' && message.length > 0;
}

function normalizeLevel(level: unknown): NotificationLevel {
  return (NOTIFICATION_LEVELS as readonly unknown[]).includes(level)
    ? (level as NotificationLevel)
    : 'error';
}

/** `message-broker.ts`'s `handleArsAutoSpawnFailure` sends the FULL error
 * string as `message` (e.g. `"ARS_INSTALL_INCOMPLETE: 缺少 ..."`), not just
 * the detail after the code — unlike the fixtures used when this module was
 * first written. Strip the `"<code>: "` prefix before handing the detail to
 * `buildArsErrorToast`, otherwise `ARS_INSTALL_INCOMPLETE` toasts show the
 * error code twice. `payload.code` is the source of truth for which code
 * this is; if the message's own prefix doesn't match it (should not happen
 * given how the backend builds `code` from the same string, but destructive
 * to guess at), the message is left untouched rather than stripping the
 * wrong thing. */
function stripKnownArsPrefix(code: ArsErrorCode, message: string): string {
  const parsed = parseArsError(message);
  return parsed && parsed.code === code ? parsed.detail : message;
}

export interface AppNotificationToast extends SpawnErrorToast {
  type: NotificationLevel;
}

/** Builds the `{ title, message, type }` to show for an already-validated
 * `AppNotification` (api-design §7.3):
 * - `ARS_*` codes reuse `buildArsErrorToast` from `spawn-error.ts` — the
 *   exact same i18n title/body rules as the spawn/resume error toasts
 *   (MN-10: `ARS_PATH_NOT_SET` / `ARS_REQUIRES_INTERACTIVE` never echo the
 *   backend's Chinese detail; `ARS_INSTALL_INCOMPLETE` keeps it verbatim).
 * - Anything else uses the backend's `title` if given, otherwise a generic
 *   i18n title, plus `message` verbatim.
 * - `agentId`, when present, is prefixed onto the title so the toast makes
 *   clear which agent the notification is about. */
export function buildAppNotificationToast(
  payload: AppNotificationPayload,
  t: Translate,
): AppNotificationToast {
  const type = normalizeLevel(payload.level);

  const base = isArsErrorCode(payload.code)
    ? buildArsErrorToast(payload.code, stripKnownArsPrefix(payload.code, payload.message), t)
    : { title: payload.title || t('notifications.genericTitle'), message: payload.message };

  if (!payload.agentId) {
    return { ...base, type };
  }
  return {
    title: `${t('notifications.agentTag', { agentId: payload.agentId })} ${base.title}`,
    message: base.message,
    type,
  };
}
