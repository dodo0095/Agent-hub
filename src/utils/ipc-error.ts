/**
 * Electron's `ipcRenderer.invoke()` rejects with an Error whose `.message` wraps
 * the original main-process error, e.g.:
 *
 *   "Error invoking remote method 'sessions:spawn': Error: ARS_PATH_NOT_SET: ..."
 *
 * `extractIpcErrorMessage` strips that wrapper (and the inner `Error: ` prefix,
 * if present) so the UI can show the original message. It degrades gracefully
 * for plain strings / non-Error rejections and returns `fallback` when there is
 * nothing usable to show.
 */
export function extractIpcErrorMessage(err: unknown, fallback = ''): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw) return fallback;

  const withoutIpcPrefix = raw.replace(
    /^Error invoking remote method '[^']*':\s*/,
    '',
  );
  const withoutErrorPrefix = withoutIpcPrefix.replace(/^Error:\s*/, '');

  return withoutErrorPrefix || fallback;
}

/** Error codes the Academic Publication department's ARS integration can throw
 * from `buildClaudeArgs()` / resume path (see `.knowledge/specs/api-design.md` §6.4).
 * Each is thrown as `` `${code}: <human-readable detail>` `` — see
 * `electron/services/session-spawn-helpers.ts`. */
export const ARS_ERROR_CODES = [
  'ARS_PATH_NOT_SET',
  'ARS_INSTALL_INCOMPLETE',
  'ARS_REQUIRES_INTERACTIVE',
] as const;

export type ArsErrorCode = (typeof ARS_ERROR_CODES)[number];

export interface ParsedArsError {
  code: ArsErrorCode;
  /** The human-readable part after `<code>: `. */
  detail: string;
}

/** Parses a (already IPC-unwrapped) error message for a leading ARS_* code.
 * Returns `null` when the message isn't one of the known ARS errors. */
export function parseArsError(message: string): ParsedArsError | null {
  for (const code of ARS_ERROR_CODES) {
    if (message.startsWith(`${code}:`)) {
      return { code, detail: message.slice(code.length + 1).trim() };
    }
  }
  return null;
}
