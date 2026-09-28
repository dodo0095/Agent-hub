/**
 * ARS (Academic Research Skills) plugin directory integrity validator.
 *
 * Background (PM-015): when ARS is installed by extracting a zip download on
 * Windows, git symlinks inside `skills/<name>/` degrade into plain-text stub
 * files (containing something like "../academic-pipeline") instead of real
 * directories. Claude Code then silently loads 0 skills from that plugin.
 *
 * This validator only checks that the required files exist AS REAL FILES
 * (not as directories) — it does not parse their content. See
 * `.knowledge/specs/api-design.md` §6.3 for the authoritative contract.
 */
import { statSync } from 'fs';
import { join } from 'path';

export const ARS_REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  'skills/academic-paper/SKILL.md',
  'skills/academic-paper-reviewer/SKILL.md',
  'skills/academic-pipeline/SKILL.md',
  'skills/deep-research/SKILL.md',
] as const;

export interface ArsValidationResult {
  ok: boolean;
  missing: string[];
}

/**
 * Validate that `dir` is a complete ARS plugin root.
 *
 * - `dir` does not exist → `{ ok: false, missing: [...ARS_REQUIRED_FILES] }`
 * - Each required path must exist AND be a real file (`statSync(...).isFile()`):
 *   - A zip download with a degraded symlink stub leaves `skills/<name>` as
 *     a plain file instead of a directory (PM-015) — `skills/<name>/SKILL.md`
 *     then has no entry to stat (ENOTDIR under a non-directory parent), so
 *     `statSync(..., { throwIfNoEntry: false })` returns `undefined` and the
 *     path is reported missing without any special-casing.
 *   - A directory that happens to share the required file's name (e.g. an
 *     empty `SKILL.md/` folder) is NOT treated as satisfying the
 *     requirement — `isFile()` is false for it — even though a plain
 *     `existsSync` check would have wrongly accepted it (MN-3, G2 review).
 * - Only existence/file-type is checked; file contents are never parsed.
 */
export function validateArsPluginDir(dir: string): ArsValidationResult {
  const missing: string[] = [];

  for (const relPath of ARS_REQUIRED_FILES) {
    const stat = statSync(join(dir, relPath), { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      missing.push(relPath);
    }
  }

  return { ok: missing.length === 0, missing };
}
