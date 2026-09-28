/**
 * ARS (Academic Research Skills) plugin directory integrity validator.
 *
 * Background (PM-015): when ARS is installed by extracting a zip download on
 * Windows, git symlinks inside `skills/<name>/` degrade into plain-text stub
 * files (containing something like "../academic-pipeline") instead of real
 * directories. Claude Code then silently loads 0 skills from that plugin.
 *
 * This validator only checks *existence* of the required files as real
 * files — it does not parse their content. See
 * `.knowledge/specs/api-design.md` §6.3 for the authoritative contract.
 */
import { existsSync } from 'fs';
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
 * - Each required path must exist as a real file. A zip download with a
 *   degraded symlink stub leaves `skills/<name>` as a plain file instead of
 *   a directory (PM-015): Node's `existsSync` on `skills/<name>/SKILL.md`
 *   then correctly returns false (ENOTDIR — nothing to descend into), so
 *   that SKILL.md is reported missing without needing any special-casing.
 * - Only existence is checked; file contents are never parsed.
 */
export function validateArsPluginDir(dir: string): ArsValidationResult {
  const missing: string[] = [];

  for (const relPath of ARS_REQUIRED_FILES) {
    if (!existsSync(join(dir, relPath))) {
      missing.push(relPath);
    }
  }

  return { ok: missing.length === 0, missing };
}
