import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { pool, withTransaction } from "./db.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Columns the API depends on. Used by verifySchema() to detect a database that
// predates the current schema.
const REQUIRED_COLUMNS = Object.freeze({
  users: ["id", "name", "email", "password_hash", "role", "created_at"],
  queues: [
    "id",
    "name",
    "category",
    "description",
    "owner_id",
    "status",
    "ticket_prefix",
    "avg_service_minutes",
    "next_ticket_number",
    "created_at",
    "updated_at",
  ],
  tickets: [
    "id",
    "queue_id",
    "user_id",
    "ticket_number",
    "code",
    "status",
    "created_at",
    "updated_at",
  ],
});

/**
 * Locates schema.sql across the layouts we ship: local checkout (database/ sits
 * beside backend/) and the container image (/app/database/schema.sql).
 * SCHEMA_PATH overrides every candidate.
 */
function resolveSchemaPath() {
  const candidates = [
    env.schemaPath,
    process.env.SCHEMA_PATH,
    path.resolve(moduleDir, "../../../database/schema.sql"),
    path.resolve(moduleDir, "../database/schema.sql"),
    path.resolve(process.cwd(), "database/schema.sql"),
    path.resolve(process.cwd(), "../database/schema.sql"),
    "/app/database/schema.sql",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/**
 * Reads information_schema and reports which tables/columns are missing.
 * @returns {Promise<{ ok: boolean, missing: string[] }>}
 */
export async function verifySchema() {
  const { rows } = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );

  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!columns.some((column) => present.has(`${table}.${column}`))) {
      missing.push(table);
      continue;
    }
    for (const column of columns) {
      if (!present.has(`${table}.${column}`)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Applies schema.sql. The file is fully idempotent, so this also upgrades a
 * database created by an earlier version of the schema.
 * @returns {Promise<boolean>}
 */
export async function applySchema() {
  const schemaPath = resolveSchemaPath();

  if (!schemaPath) {
    console.error(
      "[db] schema.sql not found; set SCHEMA_PATH or mount database/schema.sql into the image."
    );
    return false;
  }

  try {
    const sql = fs.readFileSync(schemaPath, "utf8");

    // PostgreSQL DDL is transactional, so a partial application is impossible.
    await withTransaction((client) => client.query(sql));
    console.log(`[db] Schema applied from ${schemaPath}`);
    return true;
  } catch (error) {
    console.error(
      `[db] Failed to apply schema from ${schemaPath}: ${error.code ?? ""} ${error.message}`.trim()
    );
    return false;
  }
}

/**
 * Startup hook.
 *
 * AUTO_MIGRATE=true  -> apply schema.sql, then verify it landed.
 * AUTO_MIGRATE=false -> verify only, and refuse to serve traffic on a stale schema.
 */
export async function initializeDatabase() {
  if (env.autoMigrate) {
    const applied = await applySchema();
    if (!applied) return false;
  }

  const { ok, missing } = await verifySchema();

  if (!ok) {
    console.error(
      `[db] Schema is out of date. Missing: ${missing.join(", ")}. ` +
        "Run: psql \"$DATABASE_URL\" -f database/schema.sql"
    );
    return false;
  }

  return true;
}

export default initializeDatabase;