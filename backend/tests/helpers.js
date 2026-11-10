/**
 * Shared test setup.
 *
 * Tests run against a real PostgreSQL named by DATABASE_URL. Every test creates
 * its own users and queues with unique emails, so the suite never truncates
 * tables and can run against a database that already holds data. Use a
 * dedicated database anyway: test rows are left behind.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";

// Defaults must be in place before env.js is evaluated, hence the dynamic
// imports below. dotenv never overrides variables that are already set.
process.env.NODE_ENV ??= "test";
process.env.BCRYPT_ROUNDS ??= "4"; // Real cost factor would make the suite slow.

const { createApp } = await import("../src/server.js");
const { pool, closePool } = await import("../src/config/db.js");
const { applySchema, verifySchema } = await import("../src/config/initDb.js");

export { pool, closePool };

export const app = createApp();
export const api = () => request(app);

export const TEST_PASSWORD = "correct-horse-battery";

// Arbitrary key for pg_advisory_lock. node --test runs each file in its own
// process, so concurrent schema application must be serialised.
const SCHEMA_LOCK_KEY = 7_270_001;

/** Applies database/schema.sql once (it is idempotent) and fails loudly if it is unusable. */
export async function prepareDatabase() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
    const { ok } = await verifySchema();
    if (!ok && !(await applySchema())) {
      throw new Error("Could not apply database/schema.sql to the test database.");
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]);
    client.release();
  }
}

export const uniqueEmail = (tag = "user") => `${tag}-${randomUUID()}@test.queueless.dev`;

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Registers a user through the API. Non-customer roles are granted with SQL,
 * exactly as the README instructs, since registration always creates customers.
 */
export async function registerUser({ role = "customer", name = "Test User" } = {}) {
  const email = uniqueEmail(role);
  const res = await api()
    .post("/api/auth/register")
    .send({ name, email, password: TEST_PASSWORD });

  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  if (role !== "customer") {
    // The middleware re-reads the user on every request, so the existing token
    // picks up the new role immediately.
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, res.body.user.id]);
  }

  return { token: res.body.token, user: { ...res.body.user, role }, email };
}

/** Creates a queue as the given merchant and returns the API payload. */
export async function createQueue(token, overrides = {}) {
  const res = await api()
    .post("/api/queues")
    .set(bearer(token))
    .send({ name: `Queue ${randomUUID().slice(0, 8)}`, ticketPrefix: "T", ...overrides });

  if (res.status !== 201) {
    throw new Error(`create queue failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.queue;
}

export async function joinQueue(token, queueId) {
  return api().post(`/api/queues/${queueId}/join`).set(bearer(token));
}

// Returns the supertest request, so callers can `await` it or chain `.expect()`.
export function arriveTicket(token, ticketId) {
  return api().post(`/api/tickets/${ticketId}/arrive`).set(bearer(token));
}
