/**
 * ars-validator — ARS plugin directory integrity check (Sprint 7 T4)
 *
 * Three scenarios per .knowledge/specs/api-design.md §6.3:
 * 1. Complete ARS root → ok === true
 * 2. skills/academic-pipeline is a stub FILE (PM-015 zip symlink degradation)
 *    → missing contains 'skills/academic-pipeline/SKILL.md'
 * 3. Path does not exist → ok === false, missing === all required files
 *
 * Uses real temp directories under os.tmpdir() (no fs mocking), cleaned up
 * after each test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ARS_REQUIRED_FILES, validateArsPluginDir } from '../../electron/utils/ars-validator';

const createdDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ars-validator-test-'));
  createdDirs.push(dir);
  return dir;
}

/** Write a complete, valid ARS plugin root at `dir`. */
function writeCompleteArs(dir: string): void {
  for (const relPath of ARS_REQUIRED_FILES) {
    const fullPath = join(dir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, '# stub content\n', 'utf-8');
  }
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateArsPluginDir', () => {
  it('returns ok: true for a complete ARS plugin directory', () => {
    const dir = makeTempDir();
    writeCompleteArs(dir);

    const result = validateArsPluginDir(dir);

    expect(result).toEqual({ ok: true, missing: [] });
  });

  it('reports the SKILL.md as missing when skills/<name> is a stub FILE (PM-015)', () => {
    const dir = makeTempDir();
    writeCompleteArs(dir);

    // Simulate a zip-download symlink that degraded into a plain-text stub
    // file instead of a real directory (PM-015).
    const stubPath = join(dir, 'skills', 'academic-pipeline');
    rmSync(stubPath, { recursive: true, force: true });
    writeFileSync(stubPath, '../academic-pipeline', 'utf-8');

    const result = validateArsPluginDir(dir);

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('skills/academic-pipeline/SKILL.md');
    // The other required files are untouched and should still be found.
    expect(result.missing).not.toContain('.claude-plugin/plugin.json');
    expect(result.missing).not.toContain('skills/academic-paper/SKILL.md');
  });

  it('reports SKILL.md as missing when it is a directory instead of a file (MN-3, G2 review)', () => {
    const dir = makeTempDir();
    writeCompleteArs(dir);

    // A directory happening to share the required file's name must NOT
    // satisfy the requirement — only a real file counts.
    const skillMdPath = join(dir, 'skills', 'deep-research', 'SKILL.md');
    rmSync(skillMdPath, { force: true });
    mkdirSync(skillMdPath, { recursive: true });

    const result = validateArsPluginDir(dir);

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('skills/deep-research/SKILL.md');
  });

  it('returns ok: false with every required file missing when the path does not exist', () => {
    const dir = join(makeTempDir(), 'does-not-exist');

    const result = validateArsPluginDir(dir);

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([...ARS_REQUIRED_FILES]);
  });
});
