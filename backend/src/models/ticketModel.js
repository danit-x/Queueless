import { pool } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import {
  TICKET_VIEW_COLUMNS,
  TICKET_VIEW_FROM,
  mapTicketView,
} from "./ticketPresenter.js";

export const TICKET_STATUSES = Object.freeze(["waiting", "serving", "served", "cancelled"]);

const ACTIVE_STATUSES = ["waiting", "serving"];

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

  return rows[0] ?? null;
}

/**
 * Sets a waiting or serving ticket to 'served'.
 * @param {string} ticketId
 */
export async function completeTicket(ticketId) {
  const { rows } = await pool.query(
    `UPDATE tickets
        SET status = 'served'
      WHERE id = $1
        AND status IN ('waiting', 'serving')
      RETURNING id`,
    [ticketId]
  );

  return rows.length > 0;
}

/**
 * Cancels a ticket. Idempotent: cancelling an already-cancelled ticket succeeds
 * but reports that the ticket was already cancelled.
 *
 * @param {string} ticketId
 * @returns {Promise<{ alreadyCancelled: boolean }>}
 */
export async function cancelTicket(ticketId) {
  const { rows } = await pool.query(
    `UPDATE tickets
        SET status = 'cancelled'
      WHERE id = $1
        AND status <> 'cancelled'
      RETURNING id`,
    [ticketId]
  );

  return { alreadyCancelled: rows.length === 0 };
}