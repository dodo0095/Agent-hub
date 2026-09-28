/**
 * App-wide UI notification payload (Sprint 7.1 T10, PM-016 follow-up).
 * Sent from main → renderer over the existing `notification` IPC channel
 * (`IpcChannels.NOTIFICATION`, see `electron/types/ipc.ts`); no new IPC
 * channel is introduced. Main emits it via the `app:notification` eventBus
 * event (`electron/main.ts` forwards it with `safeSend`, same pattern as
 * `message:created`). See `.knowledge/specs/api-design.md` §7.3.
 */
export interface AppNotification {
  level: 'error' | 'warning' | 'info';
  /** e.g. 'ARS_PATH_NOT_SET' — present for backend errors with a known code. */
  code?: string;
  /** Backend may omit this — the frontend derives a title from `code` via i18n when absent. */
  title?: string;
  /** The original error message or a human-readable explanation. */
  message: string;
  source: 'message-broker';
  /** The agent whose auto-spawn failed, when applicable. */
  agentId?: string;
}
