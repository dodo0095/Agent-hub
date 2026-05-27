/**
 * Verify backfill results — count rows where cost was just written.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

(async () => {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'maestro-v2', 'maestro.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Schema check
  const schema = db.exec(`PRAGMA table_info(claude_sessions)`);
  console.log('claude_sessions columns:');
  for (const row of schema[0]?.values || []) {
    console.log(`  ${row[1]} (${row[2]})`);
  }
  console.log('');

  // Count rows by cost status, since 2026-04-18
  const r1 = db.exec(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN cost_usd > 0 THEN 1 ELSE 0 END) AS with_cost,
      SUM(CASE WHEN cost_usd = 0 THEN 1 ELSE 0 END) AS zero_cost,
      ROUND(SUM(cost_usd), 4) AS total_cost
    FROM claude_sessions
    WHERE started_at >= '2026-04-18'
  `);
  const cols = r1[0]?.columns;
  const vals = r1[0]?.values[0];
  console.log('Sessions since 2026-04-18:');
  for (let i = 0; i < cols.length; i++) console.log(`  ${cols[i]}: ${vals[i]}`);
  console.log('');

  // Total cost across DB
  const r2 = db.exec(`SELECT ROUND(SUM(cost_usd), 4) FROM claude_sessions`);
  console.log(`Grand total cost across all sessions: $${r2[0]?.values[0]?.[0]}`);

  // Top 15 by cost
  console.log('\nTop 15 sessions by cost:');
  console.log('id (8)   | started_at         | agent                 | cost      | conv_id (8)');
  console.log('-'.repeat(95));
  const r3 = db.exec(`
    SELECT id, started_at, agent_id, cost_usd, claude_conversation_id
    FROM claude_sessions
    ORDER BY cost_usd DESC
    LIMIT 15
  `);
  for (const row of (r3[0]?.values || [])) {
    console.log(
      `${String(row[0]).slice(0, 8)} | ${String(row[1]).slice(0, 19)} | ${String(row[2]).padEnd(21)} | $${String(row[3]).padStart(8)} | ${String(row[4] || '').slice(0, 8)}`,
    );
  }

  // Metadata sample (first non-null)
  console.log('\nFirst 3 non-null metadata samples:');
  const r4 = db.exec(`
    SELECT id, metadata FROM claude_sessions
    WHERE metadata IS NOT NULL AND metadata != '' AND metadata != '{}'
    LIMIT 3
  `);
  for (const row of (r4[0]?.values || [])) {
    console.log(`  ${String(row[0]).slice(0, 8)}: ${row[1]}`);
  }
})();
