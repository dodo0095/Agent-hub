import { describe, expect, it } from 'vitest';
import {
  ARS_ERROR_CODES,
  extractIpcErrorMessage,
  parseArsError,
} from '../../src/utils/ipc-error';

describe('extractIpcErrorMessage', () => {
  it('strips the Electron "Error invoking remote method" + inner "Error:" wrapper', () => {
    const err = new Error(
      "Error invoking remote method 'sessions:spawn': Error: ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑",
    );
    expect(extractIpcErrorMessage(err)).toBe(
      'ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑',
    );
  });

  it('returns the message unchanged when there is no IPC wrapper', () => {
    const err = new Error('Spawn failed: agent not found');
    expect(extractIpcErrorMessage(err)).toBe('Spawn failed: agent not found');
  });

  it('handles plain string rejections', () => {
    expect(extractIpcErrorMessage('boom')).toBe('boom');
  });

  it('returns the fallback for empty/non-Error values', () => {
    expect(extractIpcErrorMessage(undefined, 'fallback message')).toBe('fallback message');
    expect(extractIpcErrorMessage(null, 'fallback message')).toBe('fallback message');
    expect(extractIpcErrorMessage(new Error(''), 'fallback message')).toBe('fallback message');
  });

  it('defaults the fallback to an empty string when omitted', () => {
    expect(extractIpcErrorMessage(null)).toBe('');
  });
});

describe('parseArsError', () => {
  it.each(ARS_ERROR_CODES)('recognizes the %s code and extracts the detail', (code) => {
    const result = parseArsError(`${code}: some detail text`);
    expect(result).toEqual({ code, detail: 'some detail text' });
  });

  it('returns null for a non-ARS error message', () => {
    expect(parseArsError('Spawn failed: agent not found')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseArsError('')).toBeNull();
  });
});
