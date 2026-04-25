/**
 * ProjectSyncService — chokidar-based file watcher for child project directories.
 *
 * Monitors:
 *   - <workDir>/.tasks/**\/*.md     → parses as task files, upserts into `tasks` table (supports sprint subfolders)
 *   - <workDir>/proposal/sprint*-dev-plan.md → parses Section 10, upserts into `gates` table
 *
 * Design decisions:
 *   - Debounce 500 ms per file to coalesce rapid sequential writes
 *   - recentlyWritten guard (2 s) prevents self-triggering when Maestro writes files
 *   - Uses synchronous fs API (Electron main process, no UI blocking concern)
 *   - Singleton export for app-wide use
 */

import { watch as chokidarWatch, type FSWatcher, type ChokidarOptions } from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { database } from './database';
import { eventBus } from './event-bus';
import { logger } from '../utils/logger';
import { parseTaskFile, parseDevPlanSection10, parseConfirmedFlow } from './markdown-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  tasksUpdated: number;
  gatesUpdated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 500;
const WRITTEN_TTL_MS = 2000;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

class ProjectSyncService {
  /** projectId → active chokidar FSWatcher */
  private watchers: Map<string, FSWatcher> = new Map();

  /** filePath → timestamp of Maestro-initiated write (self-write guard) */
  private recentlyWritten: Map<string, number> = new Map();

  /** filePath → pending debounce timer handle */
  private syncTimer: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // -------------------------------------------------------------------------
  // Public watch control
  // -------------------------------------------------------------------------

  startWatch(projectId: string, workDir: string): void {
    if (this.watchers.has(projectId)) {
      logger.debug(`ProjectSync: already watching project ${projectId}`);
      return;
    }

    // Watch directories directly instead of globs — chokidar glob matching
    // fails for dot-prefixed directories (.tasks) on Windows.
    const tasksDir = path.join(workDir, '.tasks').replace(/\\/g, '/');
    const proposalDir = path.join(workDir, 'proposal').replace(/\\/g, '/');
    const watchPaths = [tasksDir, proposalDir];

    try {
      const watchOptions: ChokidarOptions = {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      };
      logger.info(`ProjectSync: watching dirs — ${watchPaths.join(' | ')}`);
      const watcher = chokidarWatch(watchPaths, watchOptions);

      const isRelevant = (filePath: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        // .tasks/**/*.md (task files in any subfolder)
        if (normalized.includes('/.tasks/') && normalized.endsWith('.md')) return true;
        // proposal/sprint*-dev-plan.md
        if (/\/proposal\/sprint.*-dev-plan\.md$/.test(normalized)) return true;
        return false;
      };

      watcher.on('ready', () => {
        logger.info(`ProjectSync: watcher READY for project ${projectId}`);
      });

      watcher.on('add', (filePath: string) => {
        if (!isRelevant(filePath)) return;
        logger.debug(`ProjectSync: [add] ${filePath}`);
        this.scheduleSync(projectId, workDir, filePath);
      });

      watcher.on('change', (filePath: string) => {
        if (!isRelevant(filePath)) return;
        logger.debug(`ProjectSync: [change] ${filePath}`);
        this.scheduleSync(projectId, workDir, filePath);
      });

      watcher.on('error', (err: unknown) => {
        logger.warn(`ProjectSync: watcher error for project ${projectId}`, err);
      });

      this.watchers.set(projectId, watcher);
      logger.info(`ProjectSync: started watching project ${projectId} at ${workDir}`);
    } catch (err) {
      logger.warn(`ProjectSync: failed to start watcher for project ${projectId}`, err);
    }
  }

  stopWatch(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (!watcher) return;

    watcher.close().catch((err: unknown) => {
      logger.warn(`ProjectSync: error closing watcher for project ${projectId}`, err);
    });
    this.watchers.delete(projectId);
    logger.info(`ProjectSync: stopped watching project ${projectId}`);
  }

  stopAll(): void {
    for (const projectId of this.watchers.keys()) {
      this.stopWatch(projectId);
    }
    // Clear pending debounce timers
    for (const timer of this.syncTimer.values()) {
      clearTimeout(timer);
    }
    this.syncTimer.clear();
    logger.info('ProjectSync: all watchers stopped');
  }

  /**
   * Mark a file as recently written by Maestro itself.
   * Callers (e.g. task-manager, sprint-manager) should invoke this before writing
   * to prevent the watcher from re-processing the file.
   */
  markWritten(filePath: string): void {
    const normalized = path.normalize(filePath);
    this.recentlyWritten.set(normalized, Date.now());
    setTimeout(() => {
      this.recentlyWritten.delete(normalized);
    }, WRITTEN_TTL_MS);
  }

  // -------------------------------------------------------------------------
  // Full sync (on-demand)
  // -------------------------------------------------------------------------

  async fullSync(projectId: string, workDir: string): Promise<SyncResult> {
    const result: SyncResult = { tasksUpdated: 0, gatesUpdated: 0, errors: [] };

    // --- Tasks (supports flat .tasks/*.md and sprint subfolders .tasks/sprint-N/*.md) ---
    const tasksDir = path.join(workDir, '.tasks');
    if (fs.existsSync(tasksDir)) {
      const taskFiles: Array<{ filePath: string; sprintFolder: string | null }> = [];
      try {
        const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            // Flat: .tasks/T1-xxx.md
            taskFiles.push({ filePath: path.join(tasksDir, entry.name), sprintFolder: null });
          } else if (entry.isDirectory()) {
            // Sprint subfolder: .tasks/sprint-1/T1-xxx.md
            const subDir = path.join(tasksDir, entry.name);
            try {
              const subEntries = fs.readdirSync(subDir).filter((f) => f.endsWith('.md'));
              for (const subFile of subEntries) {
                taskFiles.push({ filePath: path.join(subDir, subFile), sprintFolder: entry.name });
              }
            } catch (err) {
              result.errors.push(`Failed to read .tasks/${entry.name}: ${String(err)}`);
            }
          }
        }
      } catch (err) {
        result.errors.push(`Failed to read .tasks directory: ${String(err)}`);
      }

      for (const { filePath, sprintFolder } of taskFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const task = parseTaskFile(content);
          if (task) {
            this.upsertTask(task, projectId, sprintFolder);
            result.tasksUpdated++;
          }
        } catch (err) {
          result.errors.push(`Task parse error (${path.basename(filePath)}): ${String(err)}`);
        }
      }
    }

    // --- Dev-plan gates ---
    const proposalDir = path.join(workDir, 'proposal');
    if (fs.existsSync(proposalDir)) {
      let devPlanFiles: string[] = [];
      try {
        devPlanFiles = fs
          .readdirSync(proposalDir)
          .filter((f) => /^sprint.*-dev-plan\.md$/.test(f));
      } catch (err) {
        result.errors.push(`Failed to read proposal directory: ${String(err)}`);
      }

      for (const filename of devPlanFiles) {
        const filePath = path.join(proposalDir, filename);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Extract goal from dev-plan title (line 1: "# 開發計畫書: XXX — Sprint N")
          const goal = extractDevPlanGoal(content);
          // Derive sprint slug then resolve to actual UUID in DB (auto-create if missing)
          const derivedSlug = deriveSprintIdFromFilename(filename);
          const sprintId = resolveSprintId(projectId, derivedSlug, goal);
          // 1) Ensure all gates from confirmed flow exist (pending)
          const confirmedGates = parseConfirmedFlow(content);
          this.ensureGatesFromFlow(confirmedGates, projectId, sprintId);
          // 2) Overlay actual decisions from Section 10
          const section10 = parseDevPlanSection10(content);
          const updated = this.upsertGates(section10.gateRecords, projectId, sprintId);
          result.gatesUpdated += updated;
        } catch (err) {
          result.errors.push(`Dev-plan parse error (${filename}): ${String(err)}`);
        }
      }
    }

    eventBus.emitFileSynced({ projectId, type: 'full' });
    logger.info(
      `ProjectSync: fullSync for ${projectId} — tasks: ${result.tasksUpdated}, gates: ${result.gatesUpdated}, errors: ${result.errors.length}`,
    );

    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private scheduleSync(projectId: string, workDir: string, filePath: string): void {
    const key = `${projectId}:${filePath}`;
    const existing = this.syncTimer.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.syncTimer.delete(key);
      this.handleFileChange(projectId, workDir, filePath);
    }, DEBOUNCE_MS);

    this.syncTimer.set(key, timer);
  }

  private handleFileChange(projectId: string, workDir: string, filePath: string): void {
    const normalized = path.normalize(filePath);

    // Self-write guard: ignore files Maestro wrote within the last 2 s
    const writtenAt = this.recentlyWritten.get(normalized);
    if (writtenAt !== undefined && Date.now() - writtenAt < WRITTEN_TTL_MS) {
      logger.debug(`ProjectSync: skipping self-written file ${filePath}`);
      return;
    }

    logger.info(`ProjectSync: file changed — ${filePath}`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(workDir, filePath).replace(/\\/g, '/');

      if (relativePath.startsWith('.tasks/') && relativePath.endsWith('.md')) {
        // Task file — extract sprint folder from path if present
        // e.g. ".tasks/sprint-1/T1-xxx.md" → sprintFolder = "sprint-1"
        //      ".tasks/T1-xxx.md"           → sprintFolder = null
        const pathParts = relativePath.split('/');
        const sprintFolder = pathParts.length >= 3 ? pathParts[1] : null;
        const task = parseTaskFile(content);
        if (task) {
          this.upsertTask(task, projectId, sprintFolder);
          eventBus.emitFileSynced({ projectId, type: 'task', filePath });
          logger.info(`ProjectSync: task upserted — ${sprintFolder ? sprintFolder + '/' : ''}${task.id}`);
        } else {
          logger.warn(`ProjectSync: could not parse task file ${filePath}`);
        }
      } else if (relativePath.startsWith('proposal/') && /sprint.*-dev-plan\.md$/.test(relativePath)) {
        // Dev-plan file
        const filename = path.basename(filePath);
        const goal = extractDevPlanGoal(content);
        const derivedSlug = deriveSprintIdFromFilename(filename);
        const sprintId = resolveSprintId(projectId, derivedSlug, goal);
        // 1) Ensure all gates from confirmed flow exist (pending)
        const confirmedGates = parseConfirmedFlow(content);
        this.ensureGatesFromFlow(confirmedGates, projectId, sprintId);
        // 2) Overlay actual decisions from Section 10
        const section10 = parseDevPlanSection10(content);
        const updated = this.upsertGates(section10.gateRecords, projectId, sprintId);
        eventBus.emitFileSynced({ projectId, type: 'gate', filePath });
        logger.info(`ProjectSync: gates upserted — ${updated} records (${confirmedGates.length} in flow) from ${filename}`);
      } else {
        logger.debug(`ProjectSync: unrecognised file pattern, skipping — ${relativePath}`);
      }
    } catch (err) {
      logger.warn(`ProjectSync: error handling file change for ${filePath}`, err);
    }
  }

  /**
   * Upsert a parsed task into the DB.
   * @param task - Parsed task from markdown
   * @param projectId - Always the watcher-context UUID (never the display name from metadata)
   * @param sprintFolder - Sprint subfolder name if present (e.g. "sprint-1"), null for flat .tasks/
   */
  private upsertTask(
    task: ReturnType<typeof parseTaskFile> & object,
    projectId: string,
    sprintFolder?: string | null,
  ): void {
    if (!task) return;

    // Construct scoped task ID: "sprint-1/T1" for nested, "T1" for flat
    const scopedId = sprintFolder ? `${sprintFolder}/${task.id}` : task.id;

    // Resolve sprint: prefer folder name over metadata field
    const sprintRef = sprintFolder || task.sprintId;
    const resolvedSprintId = resolveSprintId(projectId, sprintRef);

    const now = new Date().toISOString();

    // Auto-calculate actual_hours from started_at / completed_at
    let actualHours: number | null = null;
    if (task.startedAt && task.completedAt) {
      const start = new Date(task.startedAt).getTime();
      const end = new Date(task.completedAt).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        actualHours = Math.round(((end - start) / 3_600_000) * 100) / 100;
      }
    }

    database.run(
      `INSERT OR REPLACE INTO tasks
         (id, project_id, sprint_id, title, description, status, assigned_to,
          priority, tags, estimated_hours, actual_hours, started_at, completed_at,
          updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?,
               COALESCE((SELECT created_at FROM tasks WHERE project_id = ? AND id = ?), ?))`,
      [
        scopedId,
        projectId,
        resolvedSprintId,
        task.title,
        task.description || null,
        task.status,
        task.assignedTo,
        task.priority,
        task.tags,
        task.estimatedHours,
        actualHours,
        task.startedAt || null,
        task.completedAt || null,
        now,
        // created_at subquery params (composite key lookup)
        projectId,
        scopedId,
        task.createdAt || now,
      ],
    );

    // Sync task dependencies — only when dependsOn is present
    if (task.dependsOn) {
      // Clear existing dependencies for this task before re-inserting
      database.run(
        `DELETE FROM task_dependencies WHERE project_id = ? AND task_id = ?`,
        [projectId, scopedId],
      );

      // dependsOn may be comma-separated (e.g. "T1,T3")
      // Scope each dependency ID with the same sprint folder
      const depIds = task.dependsOn
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== '—' && !/^G\d+$/.test(s)); // skip gate refs like "G1"

      for (const rawDepId of depIds) {
        const scopedDepId = sprintFolder ? `${sprintFolder}/${rawDepId}` : rawDepId;
        try {
          database.run(
            `INSERT OR IGNORE INTO task_dependencies (project_id, task_id, depends_on) VALUES (?, ?, ?)`,
            [projectId, scopedId, scopedDepId],
          );
        } catch {
          // Silently ignore FK violations — the referenced task may not have been synced yet.
        }
      }
    }
  }

  /**
   * Ensure all gates from the confirmed flow exist in DB with 'pending' status.
   * Also removes gates that are no longer in the flow (dynamic re-planning).
   * Does NOT overwrite gates that already have a decision (approved/rejected).
   */
  private ensureGatesFromFlow(
    gateTypes: string[],
    projectId: string,
    sprintId: string | null,
  ): void {
    if (gateTypes.length === 0) return;

    for (const gateType of gateTypes) {
      try {
        const existing = database.prepare(
          `SELECT id FROM gates WHERE project_id = ? AND sprint_id IS ? AND gate_type = ? LIMIT 1`,
          [projectId, sprintId, gateType],
        );
        if (existing.length > 0) continue; // already exists, skip

        const id = randomUUID();
        const now = new Date().toISOString();
        database.run(
          `INSERT INTO gates
             (id, project_id, sprint_id, gate_type, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
          [id, projectId, sprintId, gateType, now],
        );
        logger.info(`ProjectSync: auto-created gate ${gateType} (pending) for sprint ${sprintId}`);
      } catch (err) {
        logger.warn(`ProjectSync: failed to ensure gate ${gateType}`, err);
      }
    }

    // Remove gates no longer in the confirmed flow (only if still 'pending')
    if (sprintId) {
      try {
        const placeholders = gateTypes.map(() => '?').join(', ');
        database.run(
          `DELETE FROM gates
           WHERE project_id = ? AND sprint_id = ? AND status = 'pending'
             AND gate_type NOT IN (${placeholders})`,
          [projectId, sprintId, ...gateTypes],
        );
      } catch (err) {
        logger.warn(`ProjectSync: failed to clean up removed gates`, err);
      }
    }

    // Deduplicate: keep only the newest gate per gate_type (remove duplicates)
    if (sprintId) {
      try {
        database.run(
          `DELETE FROM gates
           WHERE project_id = ? AND sprint_id = ?
             AND id NOT IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (
                   PARTITION BY gate_type ORDER BY
                     CASE status WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
                     created_at DESC
                 ) AS rn
                 FROM gates WHERE project_id = ? AND sprint_id = ?
               ) WHERE rn = 1
             )`,
          [projectId, sprintId, projectId, sprintId],
        );
      } catch (err) {
        logger.warn(`ProjectSync: failed to deduplicate gates`, err);
      }
    }
  }

  private upsertGates(
    gateRecords: ParsedDevPlanSection10['gateRecords'],
    projectId: string,
    sprintId: string | null,
  ): number {
    let count = 0;
    for (const record of gateRecords) {
      if (!record.gateType || !record.decision) continue;

      try {
        // Try to update existing gate matched by project + sprint + gate_type
        const existing = database.prepare(
          `SELECT id FROM gates WHERE project_id = ? AND sprint_id IS ? AND gate_type = ? LIMIT 1`,
          [projectId, sprintId, record.gateType],
        );

        if (existing.length > 0) {
          const gateId = (existing[0] as any).id as string;
          database.run(
            `UPDATE gates
             SET decision = ?, status = ?, submitted_by = ?, reviewer = ?,
                 reviewed_at = ?
             WHERE id = ?`,
            [
              record.decision,
              decisionToStatus(record.decision),
              record.submittedBy,
              record.reviewer,
              record.date,
              gateId,
            ],
          );
        } else {
          // Insert new gate record
          const { randomUUID } = require('crypto') as typeof import('crypto');
          const id = randomUUID();
          const now = new Date().toISOString();
          database.run(
            `INSERT INTO gates
               (id, project_id, sprint_id, gate_type, status, submitted_by,
                reviewer, decision, reviewed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              projectId,
              sprintId,
              record.gateType,
              decisionToStatus(record.decision),
              record.submittedBy,
              record.reviewer,
              record.decision,
              record.date,
              now,
            ],
          );
        }
        count++;
      } catch (err) {
        logger.warn(`ProjectSync: failed to upsert gate ${record.gateType}`, err);
      }
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Write-back: DB → .tasks/ markdown (reverse sync)
  // -------------------------------------------------------------------------

  /**
   * Update a task's status field in its .tasks/ markdown file.
   * Called by TaskManager when a task transitions.
   */
  writeBackTaskStatus(projectId: string, taskId: string, newStatus: string): void {
    // Resolve project work_dir
    let workDir: string | null = null;
    try {
      const rows = database.prepare('SELECT work_dir FROM projects WHERE id = ?', [projectId]);
      workDir = rows.length > 0 ? (rows[0] as any).work_dir : null;
    } catch { /* ignore */ }

    if (!workDir) {
      logger.debug(`ProjectSync: writeBack skipped — no work_dir for project ${projectId}`);
      return;
    }

    // taskId may be scoped like "sprint-1/T3" or flat like "T3"
    const parts = taskId.split('/');
    let filePath: string;
    if (parts.length >= 2) {
      // Scoped: sprint-1/T3 → .tasks/sprint-1/T3-*.md
      const folder = parts.slice(0, -1).join('/');
      const shortId = parts[parts.length - 1];
      filePath = this.findTaskFile(path.join(workDir, '.tasks', folder), shortId);
    } else {
      // Flat: T3 → .tasks/T3-*.md or search sprint subfolders
      filePath = this.findTaskFile(path.join(workDir, '.tasks'), taskId);
      if (!filePath) {
        // Try sprint subfolders
        const tasksDir = path.join(workDir, '.tasks');
        if (fs.existsSync(tasksDir)) {
          try {
            const subDirs = fs.readdirSync(tasksDir, { withFileTypes: true })
              .filter((d) => d.isDirectory());
            for (const dir of subDirs) {
              const found = this.findTaskFile(path.join(tasksDir, dir.name), taskId);
              if (found) { filePath = found; break; }
            }
          } catch { /* ignore */ }
        }
      }
    }

    if (!filePath) {
      logger.debug(`ProjectSync: writeBack skipped — file not found for task ${taskId}`);
      return;
    }

    try {
      let content = fs.readFileSync(filePath, 'utf-8');

      // Replace status in markdown table: "| 狀態 | xxx |" → "| 狀態 | newStatus |"
      const statusRegex = /(\|\s*狀態\s*\|\s*)([^|]+)(\|)/;
      if (statusRegex.test(content)) {
        content = content.replace(statusRegex, `$1${newStatus} $3`);
      }

      // Update timestamps
      const now = new Date().toISOString();
      if (newStatus === 'in_progress') {
        const startRegex = /(\|\s*開始時間\s*\|\s*)([^|]+)(\|)/;
        if (startRegex.test(content)) {
          content = content.replace(startRegex, `$1${now} $3`);
        }
      } else if (newStatus === 'done') {
        const endRegex = /(\|\s*完工時間\s*\|\s*)([^|]+)(\|)/;
        if (endRegex.test(content)) {
          content = content.replace(endRegex, `$1${now} $3`);
        }
      }

      // Append event to 事件紀錄
      const eventLine = `\n### ${now} — 狀態自動更新（${newStatus}）\n由系統自動同步\n`;
      content += eventLine;

      // Mark as self-written to prevent re-sync loop
      this.markWritten(filePath);
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info(`ProjectSync: writeBack — ${taskId} → ${newStatus} (${path.basename(filePath)})`);
    } catch (err) {
      logger.warn(`ProjectSync: writeBack failed for task ${taskId}`, err);
    }
  }

  /**
   * Find a task markdown file by short ID (e.g. "T3") in a directory.
   * Looks for files matching T3-*.md or T3.md.
   */
  private findTaskFile(dir: string, shortId: string): string {
    if (!fs.existsSync(dir)) return '';
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      // Exact match: T3-remove-services.md or T3.md
      const match = files.find((f) => {
        const base = f.replace('.md', '');
        return base === shortId || base.startsWith(`${shortId}-`);
      });
      return match ? path.join(dir, match) : '';
    } catch {
      return '';
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

type ParsedDevPlanSection10 = ReturnType<typeof parseDevPlanSection10>;

/**
 * Map a decision string from the markdown table to a gate status value.
 * Recognises common Chinese and English decision words.
 */
function decisionToStatus(decision: string): string {
  const lower = decision.toLowerCase();
  // Use includes() to handle emoji prefixes like "✅ 通過"
  if (lower.includes('approved') || lower.includes('通過') || lower.includes('pass')) return 'approved';
  if (lower.includes('rejected') || lower.includes('拒絕') || lower.includes('未通過') || lower.includes('駁回')) return 'rejected';
  if (lower.includes('pending') || lower.includes('待審') || lower.includes('待定')) return 'pending';
  if (lower.includes('附條件') || lower.includes('conditional')) return 'approved'; // 附條件通過 = approved
  return 'pending';
}

/**
 * Extract the goal/title from a dev-plan's first heading or section 1.
 * E.g. "# 開發計畫書: 個人行事曆助理 — Sprint 1" → "個人行事曆助理"
 * Falls back to the section 1 summary if heading doesn't match.
 */
function extractDevPlanGoal(content: string): string | undefined {
  // Try H1: "# 開發計畫書: {goal} — Sprint N" or "# 開發計畫書: {goal}"
  const h1Match = /^#\s+開發計畫書[:：]\s*(.+?)(?:\s*[—–-]\s*Sprint\s*\d+)?$/m.exec(content);
  if (h1Match) return h1Match[1].trim();

  // Try section 1 first non-empty line after "## 1."
  const sec1Match = /##\s*1\.\s*需求摘要[\s\S]*?\n\n(.+)/m.exec(content);
  if (sec1Match) {
    const line = sec1Match[1].trim();
    if (line && !line.startsWith('#') && !line.startsWith('|')) {
      return line.length > 100 ? line.slice(0, 100) : line;
    }
  }

  return undefined;
}

/**
 * Derive a sprint ID slug from a dev-plan filename.
 * sprint1-dev-plan.md  → sprint-1
 * sprint2-dev-plan.md  → sprint-2
 * sprint10-dev-plan.md → sprint-10
 * Falls back to null if pattern doesn't match.
 */
function deriveSprintIdFromFilename(filename: string): string | null {
  const match = /^sprint(\d+)-dev-plan\.md$/.exec(filename);
  if (!match) return null;
  return `sprint-${match[1]}`;
}

/**
 * Resolve a sprint reference to the actual UUID in the DB.
 * Accepts multiple formats: "sprint-1", "Sprint 1", "sprint1", "Sprint1".
 * Returns the UUID if found, otherwise returns the original value.
 */
function resolveSprintId(projectId: string, sprintRef: string | null, goal?: string): string | null {
  if (!sprintRef) return null;

  // Already looks like a UUID — return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(sprintRef)) return sprintRef;

  // Extract sprint number from various formats:
  // "sprint-1" → "1", "Sprint 1" → "1", "sprint1" → "1", "Sprint1" → "1"
  const numMatch = /sprint[- ]?(\d+)/i.exec(sprintRef);
  if (!numMatch) return sprintRef;
  const num = numMatch[1];

  // Try to find a matching sprint in DB by name pattern
  try {
    const rows = database.prepare(
      `SELECT id FROM sprints WHERE project_id = ? AND (
        LOWER(name) = LOWER(?) OR
        LOWER(name) = LOWER(?) OR
        LOWER(name) = LOWER(?) OR
        LOWER(name) = LOWER(?)
      ) LIMIT 1`,
      [projectId, `Sprint ${num}`, `sprint-${num}`, `Sprint${num}`, `sprint ${num}`],
    );
    if (rows.length > 0) {
      const sprintId = (rows[0] as { id: string }).id;
      // Dev-plan exists → Sprint should be active (not stuck in planning)
      database.run(
        `UPDATE sprints SET status = 'active', started_at = COALESCE(started_at, datetime('now')) WHERE id = ? AND status = 'planning'`,
        [sprintId],
      );
      return sprintId;
    }
  } catch {
    // DB query failed, fall back
  }

  // Auto-create sprint if not found — dev-plan exists so sprint should too
  try {
    const sprintName = `Sprint ${num}`;
    const id = randomUUID();
    database.run(
      `INSERT INTO sprints (id, project_id, name, goal, sprint_type, status, started_at) VALUES (?, ?, ?, ?, 'full', 'active', datetime('now'))`,
      [id, projectId, sprintName, goal || null],
    );
    logger.info(`ProjectSync: auto-created sprint "${sprintName}" (${id}) for project ${projectId}`);
    return id;
  } catch (err) {
    logger.warn(`ProjectSync: failed to auto-create sprint`, err);
  }

  // Fall back to original value if creation failed
  return sprintRef;
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const projectSync = new ProjectSyncService();
