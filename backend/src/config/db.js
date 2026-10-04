import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

/**
 * Single shared connection pool.
 *
 * Every query in the app goes through `pool.query` (or `withTransaction`), which
 * always uses parameter placeholders ($1, $2, ...) so user input is never
 * interpolated into SQL.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl,
  application_name: "queueless-api",
  max: env.databasePoolMax,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Recycle connections so long-lived pool members never pin stale server state.
  maxUses: 10_000,
  // Cancel any query that outlives 10s instead of holding a connection forever.
  statement_timeout: 10_000,
  query_timeout: 15_000,
});

// An idle client can fail outside of any request (server restart, network drop).
// Without this listener Node would emit an unhandled 'error' event and exit.
pool.on("error", (error) => {
  console.error("[db] Unexpected idle client error:", error.message);
});

/**
 * Runs `work` inside a single transaction on a dedicated connection.
 *
 * The client is always released, and a failed transaction is always rolled back
 * before the error propagates. Used by ticket issuance and queue advancement so
 * multi-statement state changes are all-or-nothing.
 *
 * @template T
 * @param {(client: import("pg").PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already unusable; releasing it discards the aborted
      // transaction, so there is nothing useful left to clean up.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Confirms the database is reachable. Called during startup.
 * @returns {Promise<{ latencyMs: number }>}
 */
export async function verifyDatabaseConnection() {
  const startedAt = process.hrtime.bigint();
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }

  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return { latencyMs };
}

/**
 * Cheap liveness probe used by the /health endpoint. Never throws.
 * @returns {Promise<{ ok: boolean, latencyMs: number | null, error?: string }>}
 */
export async function checkDatabaseHealth() {
  try {
    const { latencyMs } = await verifyDatabaseConnection();
    return { ok: true, latencyMs };
  } catch (error) {
    return { ok: false, latencyMs: null, error: error.message };
  }
}

/** Drains the pool during graceful shutdown. */
export async function closePool() {
  await pool.end();
}

export default pool;