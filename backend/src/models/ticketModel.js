import { pool, withTransaction } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import {
  TICKET_VIEW_COLUMNS,
  TICKET_VIEW_FROM,
  mapTicketView,
} from "./ticketPresenter.js";

export const TICKET_STATUSES = Object.freeze(["waiting", "serving", "served", "cancelled", "no_show"]);
export const NO_SHOW_GRACE_PERIOD_MINUTES = 10;
export const NO_SHOW_SWEEP_INTERVAL_MS = 15_000;

const ACTIVE_STATUSES = ["waiting", "serving"];

async function callNextWaitingTicket(client, queueId, queueStatus) {
  if (queueStatus !== "active") return;

  const { rows } = await client.query(
    `SELECT id
       FROM tickets
      WHERE queue_id = $1
        AND status = 'waiting'
      ORDER BY ticket_number ASC, created_at ASC
      LIMIT 1
      FOR UPDATE`,
    [queueId]
  );

  if (rows[0]) {
    await client.query(
      "UPDATE tickets SET status = 'serving', called_at = clock_timestamp() WHERE id = $1",
      [rows[0].id]
    );
  }
}

/**
 * Resolves the caller's ticket to a status filter.
 * @param {string | undefined} scope
 *   omitted or 'all' -> full history, 'active' -> waiting and serving only,
 *   otherwise a single exact status.
 */
function buildStatusFilter(scope) {
  if (!scope || scope === "all") {
    return { clause: "", values: [] };
  }

  if (scope === "active") {
    return { clause: "AND t.status = ANY($2)", values: [ACTIVE_STATUSES] };
  }

  if (!TICKET_STATUSES.includes(scope)) {
    throw ApiError.badRequest(
      `status must be one of: ${TICKET_STATUSES.join(", ")}, active, all.`
    );
  }

  return { clause: "AND t.status = $2", values: [scope] };
}

/**
 * Ticket history for a user, newest first.
 * @param {string} userId
 * @param {{ scope?: string, limit?: number }} options
 */
export async function listUserTickets(userId, { scope, limit = 50 } = {}) {
  const { clause, values: filterValues } = buildStatusFilter(scope);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const values = [userId, ...filterValues, safeLimit];

  const { rows } = await pool.query(
    `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM}
      WHERE t.user_id = $1 ${clause}
      ORDER BY t.created_at DESC
      LIMIT $${values.length}`,
    values
  );

  return rows.map(mapTicketView);
}

/** Raw ticket row, including owner ids, for authorization checks. */
export async function findTicketRecord(ticketId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.queue_id, t.user_id, t.ticket_number, t.code, t.status,
            q.owner_id AS queue_owner_id, q.status AS queue_status
       FROM tickets t
       JOIN queues q ON q.id = t.queue_id
      WHERE t.id = $1`,
    [ticketId]
  );

  return rows[0] ?? null;
}

/** @param {string} ticketId */
export async function getTicketView(ticketId) {
  const { rows } = await pool.query(
    `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM} WHERE t.id = $1`,
    [ticketId]
  );

  return mapTicketView(rows[0]);
}

/**
 * Records a customer's arrival within the database-enforced grace period.
 * @param {string} ticketId
 */
export async function markTicketArrived(ticketId) {
  return withTransaction(async (client) => {
    const { rows: queueRows } = await client.query(
      `SELECT q.id, q.status
         FROM queues q
         JOIN tickets t ON t.queue_id = q.id
        WHERE t.id = $1
        FOR UPDATE OF q`,
      [ticketId]
    );

    if (queueRows.length === 0) {
      throw ApiError.notFound("Ticket not found.");
    }

    const queue = queueRows[0];
    const { rows: ticketRows } = await client.query(
      "SELECT status, called_at, arrived_at FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );
    const ticket = ticketRows[0];

    if (ticket.status === "no_show") {
      const { rows } = await client.query(
        `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM} WHERE t.id = $1`,
        [ticketId]
      );
      return mapTicketView(rows[0]);
    }

    if (ticket.status !== "serving" || !ticket.called_at) {
      throw ApiError.conflict("Arrival can only be confirmed after your ticket is called.");
    }

    if (ticket.arrived_at) {
      const { rows } = await client.query(
        `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM} WHERE t.id = $1`,
        [ticketId]
      );
      return mapTicketView(rows[0]);
    }

    const { rows: deadlineRows } = await client.query(
      `SELECT $1::timestamptz <= clock_timestamp() - ($2 * INTERVAL '1 minute') AS expired`,
      [ticket.called_at, NO_SHOW_GRACE_PERIOD_MINUTES]
    );

    if (deadlineRows[0].expired) {
      await client.query(
        `UPDATE tickets
            SET status = 'no_show'
          WHERE id = $1 AND status = 'serving' AND arrived_at IS NULL`,
        [ticketId]
      );
      await callNextWaitingTicket(client, queue.id, queue.status);
    } else {
      await client.query(
        "UPDATE tickets SET arrived_at = clock_timestamp() WHERE id = $1",
        [ticketId]
      );
    }

    const { rows } = await client.query(
      `SELECT ${TICKET_VIEW_COLUMNS} ${TICKET_VIEW_FROM} WHERE t.id = $1`,
      [ticketId]
    );
    return mapTicketView(rows[0]);
  });
}

/**
 * Completes the serving ticket and calls the next waiting ticket atomically.
 * @param {string} ticketId
 */
export async function completeTicket(ticketId) {
  return withTransaction(async (client) => {
    const { rows: queueRows } = await client.query(
      `SELECT q.id, q.status
         FROM queues q
         JOIN tickets t ON t.queue_id = q.id
        WHERE t.id = $1
        FOR UPDATE OF q`,
      [ticketId]
    );

    if (queueRows.length === 0) return false;
    const queue = queueRows[0];

    const { rows: ticketRows } = await client.query(
      "SELECT status, arrived_at FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );

    if (ticketRows[0]?.status !== "serving") return false;
    if (!ticketRows[0].arrived_at) return false;

    await client.query(
      "UPDATE tickets SET status = 'served', completed_at = clock_timestamp() WHERE id = $1",
      [ticketId]
    );
    await callNextWaitingTicket(client, queue.id, queue.status);

    return true;
  });
}

/**
 * Marks expired called tickets as no-shows and calls the next customer.
 * Queue and ticket row locks with SKIP LOCKED coordinate multiple API instances.
 * @returns {Promise<number>} number of tickets transitioned to no-show
 */
export async function expireNoShowTickets() {
  return withTransaction(async (client) => {
    const { rows: expiredTickets } = await client.query(
      `SELECT q.id AS queue_id, q.status AS queue_status, t.id AS ticket_id
         FROM queues q
         JOIN tickets t ON t.queue_id = q.id
        WHERE t.status = 'serving'
          AND t.arrived_at IS NULL
          AND t.called_at <= clock_timestamp() - ($1 * INTERVAL '1 minute')
        ORDER BY t.called_at, t.id
        LIMIT 100
        FOR UPDATE OF q, t SKIP LOCKED`,
      [NO_SHOW_GRACE_PERIOD_MINUTES]
    );

    let transitioned = 0;
    for (const ticket of expiredTickets) {
      const { rowCount } = await client.query(
        `UPDATE tickets
            SET status = 'no_show'
          WHERE id = $1
            AND status = 'serving'
            AND arrived_at IS NULL
            AND called_at <= clock_timestamp() - ($2 * INTERVAL '1 minute')`,
        [ticket.ticket_id, NO_SHOW_GRACE_PERIOD_MINUTES]
      );

      if (rowCount === 0) continue;

      transitioned += 1;
      await callNextWaitingTicket(client, ticket.queue_id, ticket.queue_status);
    }

    return transitioned;
  });
}

/**
 * Cancels a ticket. Idempotent: cancelling an already-cancelled ticket succeeds
 * but reports that the ticket was already cancelled.
 *
 * @param {string} ticketId
 * @returns {Promise<{ alreadyCancelled: boolean }>}
 */
export async function cancelTicket(ticketId) {
  return withTransaction(async (client) => {
    const { rows: queueRows } = await client.query(
      `SELECT q.id
         FROM queues q
         JOIN tickets t ON t.queue_id = q.id
        WHERE t.id = $1
        FOR UPDATE OF q`,
      [ticketId]
    );
    if (queueRows.length === 0) return { alreadyCancelled: true };

    const { rows } = await client.query(
      "SELECT status FROM tickets WHERE id = $1 FOR UPDATE",
      [ticketId]
    );
    if (rows[0]?.status === "cancelled") return { alreadyCancelled: true };
    if (rows[0]?.status !== "waiting") {
      throw ApiError.conflict("Only a waiting ticket can be cancelled.");
    }

    await client.query("UPDATE tickets SET status = 'cancelled' WHERE id = $1", [ticketId]);
    return { alreadyCancelled: false };
  });
}