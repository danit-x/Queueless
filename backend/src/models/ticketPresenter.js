/**
 * Shared presentation layer for tickets.
 *
 * Both queueModel (ticket issuance, queue advancement) and ticketModel (ticket
 * reads) need the same customer-facing ticket shape, so the SQL and the mapping
 * live here to keep the two models from drifting apart.
 */

const peopleAheadExpression = `
  CASE WHEN t.status = 'waiting' THEN (
    SELECT COUNT(*)::int
      FROM tickets ahead
     WHERE ahead.queue_id = t.queue_id
       AND ahead.status = 'waiting'
       AND ahead.ticket_number < t.ticket_number
  ) ELSE 0 END`;

/**
 * SELECT list + FROM/JOIN clauses producing a ticket joined to its queue, the
 * code currently being served in that queue, and the caller's position.
 * Aliases the ticket table as `t`.
 */
export const TICKET_VIEW_FROM = `
  FROM tickets t
  JOIN queues q ON q.id = t.queue_id
  LEFT JOIN LATERAL (
    SELECT s.code
      FROM tickets s
     WHERE s.queue_id = t.queue_id
       AND s.status = 'serving'
     LIMIT 1
  ) serving ON TRUE`;

export const TICKET_VIEW_COLUMNS = `
  t.id,
  t.queue_id,
  t.user_id,
  t.ticket_number,
  t.code,
  t.status,
  t.created_at,
  t.updated_at,
  q.name AS queue_name,
  q.category,
  q.avg_service_minutes,
  serving.code AS current_serving,
  ${peopleAheadExpression} AS people_ahead`;

/** Maps a raw ticket-view row to the documented API payload. */
export function mapTicketView(row) {
  if (!row) return null;

  const peopleAhead = row.people_ahead ?? 0;

  return {
    id: row.id,
    queueId: row.queue_id,
    userId: row.user_id,
    queueName: row.queue_name,
    category: row.category,
    code: row.code,
    status: row.status,
    ticketNumber: row.ticket_number,
    currentServing: row.current_serving ?? null,
    peopleAhead,
    estimatedWaitMinutes: peopleAhead * row.avg_service_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}