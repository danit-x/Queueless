import { pool, withTransaction } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import {
  TICKET_VIEW_COLUMNS,
  TICKET_VIEW_FROM,
  mapTicketView,
} from "./ticketPresenter.js";

export const QUEUE_STATUSES = Object.freeze(["active", "paused", "closed"]);

const QUEUE_SUMMARY_FROM = `
  FROM queues q
  LEFT JOIN LATERAL (
    SELECT s.code
      FROM tickets s
     WHERE s.queue_id = q.id
       AND s.status = 'serving'
     LIMIT 1
  ) serving ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS waiting_count
      FROM tickets w
     WHERE w.queue_id = q.id
       AND w.status = 'waiting'
  ) counts ON TRUE`;

const QUEUE_SUMMARY_COLUMNS = `
  q.id,
  q.name,
  q.category,
  q.description,
  q.status,
  q.ticket_prefix,
  q.avg_service_minutes,
  q.owner_id,
  q.created_at,
  q.updated_at,
  serving.code AS current_serving,
  counts.waiting_count,
  (COALESCE(counts.waiting_count, 0) * q.avg_service_minutes)::int AS estimated_wait_minutes`;

/**
 * Maps a queue summary row to the documented API payload, resolving ownership
 * against the requesting user.
 */
export function mapQueue(row, viewerId = null) {
  if (!row) return null;

  const waitingCount = row.waiting_count ?? 0;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    status: row.status,
    ticketPrefix: row.ticket_prefix,
    avgServiceMinutes: row.avg_service_minutes,
    currentServing: row.current_serving ?? null,
    waitingCount,
    estimatedWaitMinutes: row.estimated_wait_minutes ?? waitingCount * row.avg_service_minutes,
    ownerId: row.owner_id ?? null,
    isOwner: Boolean(viewerId) && row.owner_id === viewerId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lists queues with live waiting counts.
 *
 * @param {{ status?: string, ownerId?: string, viewerId?: string }} options
 *   `status` defaults to 'active'. Pass 'all' to include paused and closed.
 */
export async function listQueues({ status = "active", ownerId, viewerId } = {}) {
  const conditions = [];
  const params = [];

  if (status && status !== "all") {
    params.push(status);
    conditions.push(`q.status = $${params.length}`);
  }

  if (ownerId) {
    params.push(ownerId);
    conditions.push(`q.owner_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const order = status === "all" || ownerId ? "q.updated_at DESC" : "q.created_at DESC";

  const { rows } = await pool.query(
    `SELECT ${QUEUE_SUMMARY_COLUMNS} ${QUEUE_SUMMARY_FROM} ${where} ORDER BY ${order}`,
    params
  );

  return rows.map((row) => mapQueue(row, viewerId));
}

/** @param {string} queueId */
export async function findQueueById(queueId) {
  const { rows } = await pool.query(
    `SELECT ${QUEUE_SUMMARY_COLUMNS} ${QUEUE_SUMMARY_FROM} WHERE q.id = $1`,
    [queueId]
  );

  return rows[0] ?? null;
}

/**
 * @param {{ name: string, category?: string, description?: string,
 *           avgServiceMinutes?: number, ticketPrefix?: string,
 *           ownerId: string }} input
 */
export async function createQueue({
  name,
  category,
  description,
  avgServiceMinutes,
  ticketPrefix,
  ownerId,
}) {
  const { rows } = await pool.query(
    `INSERT INTO queues (name, category, description, owner_id, avg_service_minutes, ticket_prefix)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      name.trim(),
      (category ?? "General").trim(),
      description?.trim() || null,
      ownerId,
      avgServiceMinutes ?? 10,
      (ticketPrefix ?? "Q").trim().toUpperCase(),
    ]
  );

  return findQueueById(rows[0].id);
}

/**
 * @param {string} queueId
 * @param {string} status one of QUEUE_STATUSES
 */
export async function updateQueueStatus(queueId, status) {
  const { rowCount } = await pool.query(
    "UPDATE queues SET status = $1 WHERE id = $2",
    [status, queueId]
  );

  if (rowCount === 0) {
    throw ApiError.notFound("Queue not found.");
  }

  return findQueueById(queueId);
}

/** Partial update used by the CRUD endpoint. */
export async function updateQueue(queueId, patch) {
  const assignments = [];
  const params = [];

  const push = (column, value) => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (patch.name !== undefined) push("name", patch.name.trim());
  if (patch.category !== undefined) push("category", patch.category.trim());
  if (patch.description !== undefined) push("description", patch.description?.trim() || null);
  if (patch.avgServiceMinutes !== undefined) push("avg_service_minutes", patch.avgServiceMinutes);
  if (patch.status !== undefined) push("status", patch.status);

  if (assignments.length === 0) {
    return findQueueById(queueId);
  }

  params.push(queueId);
  const { rowCount } = await pool.query(
    `UPDATE queues SET ${assignments.join(", ")} WHERE id = $${params.length}`,
    params
  );

  if (rowCount === 0) {
    throw ApiError.notFound("Queue not found.");
  }

  return findQueueById(queueId);
}

/** Deletes a queue; its tickets cascade. */
export async function deleteQueue(queueId) {
  const { rowCount } = await pool.query("DELETE FROM queues WHERE id = $1", [queueId]);

  if (rowCount === 0) {
    throw ApiError.notFound("Queue not found.");
  }
}

/**
 * Issues a ticket atomically.
 *
 * Concurrency safety comes from three layers:
 *   1. `SELECT ... FOR UPDATE` takes a row lock on the queue, serialising every
 *      issuance and advancement for that queue.
 *   2. `UPDATE ... SET next_ticket_number = next_ticket_number + 1 RETURNING`
 *      is a single atomic statement, so the counter can never hand out the same
 *      number twice even if the row lock were bypassed.
 *   3. `idx_tickets_queue_number` rejects a duplicate (queue_id, ticket_number)
 *      as a last line of defence.
 *
 * The queue lock plus the active-ticket check also make the 409 on rejoin exact
 * rather than a racy read-then-write.
 *
 * @param {{ queueId: string, userId: string }} input
 * @returns {Promise<object>} the new ticket in API shape
 */
export async function issueTicket({ queueId, userId }) {
  return withTransaction(async (client) => {
    const { rows: queueRows } = await client.query(
      `SELECT id, name, status
         FROM queues
        WHERE id = $1
        FOR UPDATE`,
      [queueId]
    );

    const queue = queueRows[0];
    if (!queue) {
      throw ApiError.notFound("Queue not found.");
    }

    if (queue.status !== "active") {
      throw ApiError.conflict(
        queue.status === "closed"
          ? "This queue is closed and no longer accepts tickets."
          : "This queue is paused and is not accepting tickets right now."
      );
    }

    const { rows: activeRows } = await client.query(
      `SELECT 1
         FROM tickets
        WHERE queue_id = $1
          AND user_id = $2
          AND status IN ('waiting', 'serving')`,
      [queueId, userId]
    );

    if (activeRows.length > 0) {
      throw ApiError.conflict("You already have an active ticket for this queue.");
    }

    const { rows: counterRows } = await client.query(
      `UPDATE queues
          SET next_ticket_number = next_ticket_number + 1
        WHERE id = $1
        RETURNING next_ticket_number - 1 AS ticket_number,
                  ticket_prefix`,
      [queueId]
    );

    const { ticket_number: ticketNumber, ticket_prefix: prefix } = counterRows[0];

    const { rows: ticketRows } = await client.query(
      `INSERT INTO tickets (queue_id, user_id, ticket_number, code, status)
       VALUES ($1, $2, $3, $4, 'waiting')
       RETURNING id`,
      [queueId, userId, ticketNumber, `${prefix}${ticketNumber}`]
    );

    const { rows } = await client.query(
      `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM} WHERE t.id = $1`,
      [ticketRows[0].id]
    );

    return mapTicketView(rows[0]);
  });
}

/**
 * Advances the queue: the customer currently being served is marked 'served' and
 * the lowest waiting ticket is promoted to 'serving'. Runs as one transaction so
 * the queue is never left with two serving customers or none mid-update.
 *
 * @param {string} queueId
 * @returns {Promise<object>} the updated queue in API shape
 */
export async function advanceQueue(queueId) {
  await withTransaction(async (client) => {
    const { rows: queueRows } = await client.query(
      "SELECT id, status FROM queues WHERE id = $1 FOR UPDATE",
      [queueId]
    );

    const queue = queueRows[0];
    if (!queue) {
      throw ApiError.notFound("Queue not found.");
    }

    if (queue.status !== "active") {
      throw ApiError.conflict(
        queue.status === "closed"
          ? "This queue is closed."
          : "This queue is paused. Resume it before calling the next customer."
      );
    }

    // Complete the current customer first: idx_tickets_one_serving_per_queue
    // permits only one 'serving' row per queue.
    const { rows: servingRows } = await client.query(
      `SELECT id
         FROM tickets
        WHERE queue_id = $1
          AND status = 'serving'
        FOR UPDATE`,
      [queueId]
    );

    if (servingRows.length > 0) {
      await client.query("UPDATE tickets SET status = 'served' WHERE id = $1", [
        servingRows[0].id,
      ]);
    }

    const { rows: nextRows } = await client.query(
      `SELECT id
         FROM tickets
        WHERE queue_id = $1
          AND status = 'waiting'
        ORDER BY ticket_number ASC, created_at ASC
        LIMIT 1
        FOR UPDATE`,
      [queueId]
    );

    if (nextRows.length === 0) {
      if (servingRows.length === 0) {
        throw ApiError.conflict("Nobody is waiting in this queue.");
      }
      return;
    }

    await client.query("UPDATE tickets SET status = 'serving' WHERE id = $1", [
      nextRows[0].id,
    ]);
  });

  return findQueueById(queueId);
}

/** Full ticket list for a queue, for the staff console. */
export async function listQueueTickets(queueId) {
  const { rows } = await pool.query(
    `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM}
      WHERE t.queue_id = $1
      ORDER BY t.ticket_number ASC`,
    [queueId]
  );

  return rows.map(mapTicketView);
}