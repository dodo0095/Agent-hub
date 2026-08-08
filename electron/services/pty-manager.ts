import * as pty from 'node-pty';
import { logger } from '../utils/logger';

// ─── ANSI / TUI stripping ────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes + TUI control sequences from raw PTY output.
 * Converts terminal-rendered output to readable plain text (used for log files).
 */
export function stripAnsiAndControl(raw: string): string {
  return raw
    // Remove OSC sequences: ESC] ... (BEL or ST)
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    // Replace CSI cursor-movement sequences with a space (to preserve word separation)
    .replace(/\x1b\[[0-9;?]*[ABCDEFGHJKST]/g, ' ')
    // Remove all other CSI sequences
    .replace(/\x1b\[[0-9;?]*[a-zA-Z@]/g, '')
    // Remove remaining ESC sequences
    .replace(/\x1b[^[(\x1b]/g, '')
    // Remove other control chars (except newline, tab, carriage return)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Remove TUI spinner characters (Claude Code animation)
    .replace(/[✽✻✶✢·*●]/g, '')
    // Remove bracketed paste markers
    .replace(/200~[\s\S]*?201~/g, '')
    // Remove Claude Code TUI noise: repeated status words, thinking indicators, spinner text
    .replace(/(?:Dilly-dallying|Ebbing|Garnishing|Harmonizing|Orchestrating|Frosting|Crystallizing)…/g, '')
    .replace(/\(thinking\)/g, '')
    .replace(/\(thought for \d+s\)/g, '')
    // Remove lines that are only box-drawing / decoration
    .replace(/^[─━═┌┐└┘├┤┬┴┼╭╮╰╯│▪▐▛▜▝▘▌❯\s]+$/gm, '')
    // Remove "esc to interrupt" and "? for shortcuts" prompts
    .replace(/esc to interrupt/g, '')
    .replace(/\? for shortcuts/g, '')
    // Collapse multiple spaces
    .replace(/ {2,}/g, ' ')
    // Collapse multiple blank lines into max 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip all terminal escape sequences and Claude Code TUI artifacts from raw
 * PTY output, leaving only the meaningful text content.
 */
export function stripTerminalOutput(raw: string): string {
  let text = raw;

  // 1. CSI sequences: \x1b[ (optionally ?) digits/semicolons then a letter
  text = text.replace(/\x1b\[\??[0-9;]*[a-zA-Z]/g, '');

  // 2. OSC sequences: \x1b] ... (terminated by BEL \x07 or ST \x1b\\)
  text = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '');

  // 3. Remaining bare ESC + single char
  text = text.replace(/\x1b[^[\]]/g, '');

  // 4. Stray control characters (except \n and \t)
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 5. Bare carriage returns not followed by newline (TUI in-place rewrite residue)
  text = text.replace(/\r(?!\n)/g, '');

  // 6. TUI spinner / decoration characters
  text = text.replace(/[·✢✶✻✽●⠐⠂✳]/g, '');

  // 7. Separator lines (box-drawing)
  text = text.replace(/[─━]{3,}/g, '');

  // 8. Claude Code TUI chrome lines
  text = text.replace(/❯\s*/g, '');
  text = text.replace(/esc\s*to\s*interrupt/gi, '');
  text = text.replace(/\?\s*for\s*shortcuts/gi, '');
  text = text.replace(/⎿\s*.*$/gm, '');
  text = text.replace(/Tip:\s*Run\s.*$/gm, '');
  text = text.replace(/\(thinking\)/g, '');
  text = text.replace(/\(thought for \d+s?\)/g, '');

  // 9. TUI token counter and model info residue
  //    e.g. "1.0k tokens)" "500 tokens)" "23.5k tokens"
  text = text.replace(/[\d.]+k?\s*tokens?\)?/gi, '');
  //    e.g. "claude-sonnet-4-6" "opus" etc. appearing as status line fragments
  text = text.replace(/claude[-\w]*/gi, '');
  //    e.g. "(sonnet)" "(opus)" standalone model markers
  text = text.replace(/\((?:sonnet|opus|haiku)\)/gi, '');

  // 10. Spinner animation fragments — "Gitifying" and its garbled remnants
  text = text.replace(/Gitifying…/g, '');
  text = text.replace(/[*Gitfy…]{2,}/g, ''); // garbled spinner residue

  // 11. Standalone single-char lines from TUI spinner (*, single letters)
  text = text.replace(/^\*\s*$/gm, '');
  text = text.replace(/^[a-zA-Z]\s*$/gm, '');

  // 12. Collapse excessive whitespace
  text = text.replace(/[ \t]+$/gm, '');   // trailing spaces per line
  text = text.replace(/\n{3,}/g, '\n\n'); // max 2 consecutive newlines
  text = text.trim();

  return text;
}

// ─── PTY write helpers ───────────────────────────────────────────────────────

/**
 * Write a message to a PTY and submit it with Enter.
 * Uses bracketed paste mode (\x1b[200~ ... \x1b[201~) so multi-line text
 * is treated as a single paste by the TUI, preventing \n from being
 * interpreted as individual Enter key-presses.
 *
 * Reliability note (why the delay is scaled + the Enter is retried):
 *   A single fixed 500ms wait before one \r was the root cause of the
 *   "message got typed into the box but was never submitted → had to press
 *   Enter / paste manually" flakiness. Two failure modes:
 *     1. Large pastes take the TUI longer to ingest; if \r lands while the
 *        bracketed-paste buffer is still open it is swallowed as a newline
 *        instead of submitting. → scale the wait with content length.
 *     2. Even with a good delay the first \r occasionally races the paste
 *        finalisation. → send a second \r as a safety net. If the message
 *        was already submitted, an extra \r on an empty prompt is a no-op;
 *        if the first \r was absorbed as a newline, the second submits it.
 */
export function ptyWriteAndSubmit(ptyProcess: pty.IPty, text: string): void {
  ptyProcess.write('\x1b[200~' + text + '\x1b[201~');

  // Floor 500ms; +1ms per ~50 chars; capped at 2.5s so the pipeline never hangs.
  const submitDelay = Math.min(2500, 500 + Math.floor(text.length / 50));

  const sendEnter = () => {
    try {
      ptyProcess.write('\r');
    } catch { /* PTY already closed */ }
  };

  setTimeout(sendEnter, submitDelay);
  // Safety-net retry — harmless no-op if the first \r already submitted.
  setTimeout(sendEnter, submitDelay + 450);
}

// ─── PTY spawn helpers ───────────────────────────────────────────────────────

export interface PtySpawnOptions {
  claudePath: string;
  mockClaudeCliPath?: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * Spawn a PTY process for Claude CLI.
 * Handles Windows cmd.exe vs Unix bash shell differences, and MOCK_CLAUDE_CLI support.
 */
export function spawnPty(opts: PtySpawnOptions): pty.IPty {
  const { mockClaudeCliPath, args, cwd, env, cols = 120, rows = 30 } = opts;

  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
  const escapeArg = (a: string) =>
    process.platform === 'win32'
      ? (a.includes(' ') ? `"${a}"` : a)
      : `'${a.replace(/'/g, "'\\''")}'`;
  const argsStr = args.map(escapeArg).join(' ');

  let shellArgs: string[];
  if (mockClaudeCliPath) {
    const mockEscaped = process.platform === 'win32'
      ? (mockClaudeCliPath.includes(' ') ? `"${mockClaudeCliPath}"` : mockClaudeCliPath)
      : `'${mockClaudeCliPath.replace(/'/g, "'\\''")}'`;
    shellArgs = process.platform === 'win32'
      ? ['/s', '/c', `node ${mockEscaped} ${argsStr}`]
      : ['-c', `node ${mockEscaped} ${argsStr}`];
  } else {
    const cmdName = process.platform === 'win32' ? 'claude' : (opts.claudePath || 'claude');
    shellArgs = process.platform === 'win32'
      ? ['/s', '/c', `${cmdName} ${argsStr}`]
      : ['-c', `${cmdName} ${argsStr}`];
  }

  logger.info(`Spawning PTY: shell=${shell} cwd=${cwd}`);

  return pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env,
  });
}

// ─── PTY resize / write / cleanup ────────────────────────────────────────────

/**
 * Resize an existing PTY process. Silently ignores errors (PTY may already be closed).
 */
export function resizePtyProcess(ptyProcess: pty.IPty, cols: number, rows: number): void {
  try {
    ptyProcess.resize(cols, rows);
  } catch (err) {
    logger.warn('Failed to resize PTY', err);
  }
}

/**
 * Kill a PTY process. Silently ignores errors.
 */
export function killPtyProcess(ptyProcess: pty.IPty): void {
  try {
    ptyProcess.kill();
  } catch { /* PTY already dead */ }
}
