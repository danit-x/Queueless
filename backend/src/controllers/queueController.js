import {
  QUEUE_STATUSES,
  advanceQueue,
  createQueue,
  deleteQueue,
  findQueueById,
  issueTicket,
  listQueueTickets,
  listQueues,
  mapQueue,
  updateQueue,
  updateQueueStatus,
} from "../models/queueModel.js";
import {
  cancelTicket,
  completeTicket,
  findTicketRecord,
  getTicketView,
  listUserTickets,
} from "../models/ticketModel.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isUuid } from "../utils/validation.js";

/** Rejects a malformed UUID before it reaches PostgreSQL (which would throw 22P02). */
function requireUuid(value, label) {
  if (!isUuid(value)) {
    throw ApiError.badRequest(`Invalid ${label}.`);
  }
  return value;
}

function isStaff(user) {
  return user.role === "merchant" || user.role === "admin";
}

/**
 * Loads the queue and, for non-admins, asserts the caller manages it.
 * @returns {Promise<object>} raw summary row
 */
async function loadManagedQueue(req, queueId) {
  const queue = await findQueueById(queueId);

  if (!queue) {
    throw ApiError.notFound("Queue not found.");
  }

  const canManage =
    req.user.role === "admin" || queue.owner_id === req.user.id;

  if (!canManage) {
    throw ApiError.notFound("Queue not found.");
  }

  return queue;
}

/**
 * GET /api/queues
 *
 * Query params:
 *   status  'active' (default), 'paused', 'closed' or 'all'
 *   mine    'true' to return only queues the caller owns
 */
export const getQueues = asyncHandler(async (req, res) => {
  const { status = "active", mine } = req.query ?? {};

  if (status !== "all" && !QUEUE_STATUSES.includes(status)) {
    throw ApiError.badRequest(
      `status must be one of: ${QUEUE_STATUSES.join(", ")}, all.`
    );
  }

  // Ownership is never enumerable across tenants: mine=true scopes to the caller.
  const mineOnly = mine === "true" || mine === "1";
  const ownerId = mineOnly ? req.user.id : undefined;

  const queues = await listQueues({ status, ownerId, viewerId: req.user.id });

  return res.json({ queues, count: queues.length });
});

/** GET /api/queues/my-tickets — the caller's ticket history. */
export const getMyTickets = asyncHandler(async (req, res) => {
  const { status, limit } = req.query ?? {};

  const tickets = await listUserTickets(req.user.id, { scope: status, limit });

  return res.json({ tickets, count: tickets.length });
});

/** GET /api/queues/:queueId */
export const getQueue = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  const queue = await findQueueById(queueId);

  if (!queue) {
    throw ApiError.notFound("Queue not found.");
  }

  return res.json({ queue: mapQueue(queue, req.user.id) });
});

/** POST /api/queues — merchants and admins only (enforced by authorizeRoles). */
export const createQueueHandler = asyncHandler(async (req, res) => {
  const { name, category, description, avgServiceMinutes, ticketPrefix } = req.body ?? {};

  if (!name?.trim()) {
    throw ApiError.badRequest("Queue name is required.");
  }

  if (name.trim().length > 120) {
    throw ApiError.badRequest("Queue name must be 120 characters or fewer.");
  }

  if (category !== undefined && category.trim().length > 60) {
    throw ApiError.badRequest("Category must be 60 characters or fewer.");
  }

  const minutes = Number(avgServiceMinutes ?? 10);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
    throw ApiError.badRequest("avgServiceMinutes must be a whole number between 1 and 480.");
  }

  if (ticketPrefix !== undefined && !/^[A-Za-z]{1,3}$/.test(ticketPrefix.trim())) {
    throw ApiError.badRequest("ticketPrefix must be 1 to 3 letters.");
  }

  const queue = await createQueue({
    name,
    category,
    description,
    avgServiceMinutes: minutes,
    ticketPrefix,
    ownerId: req.user.id,
  });

  return res.status(201).json({ queue: mapQueue(queue, req.user.id) });
});

/** PATCH /api/queues/:queueId — owner or admin. */
export const patchQueue = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  await loadManagedQueue(req, queueId);

  const { name, category, description, avgServiceMinutes, status } = req.body ?? {};
  const patch = {};

  if (name !== undefined) {
    if (!name?.trim()) throw ApiError.badRequest("Queue name cannot be empty.");
    patch.name = name;
  }

  if (category !== undefined) {
    if (!category?.trim()) throw ApiError.badRequest("Category cannot be empty.");
    patch.category = category;
  }

  if (description !== undefined) {
    patch.description = description;
  }

  if (avgServiceMinutes !== undefined) {
    const minutes = Number(avgServiceMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
      throw ApiError.badRequest("avgServiceMinutes must be a whole number between 1 and 480.");
    }
    patch.avgServiceMinutes = minutes;
  }

  if (status !== undefined) {
    if (!QUEUE_STATUSES.includes(status)) {
      throw ApiError.badRequest(`status must be one of: ${QUEUE_STATUSES.join(", ")}.`);
    }
    patch.status = status;
  }

  if (Object.keys(patch).length === 0) {
    throw ApiError.badRequest("Provide at least one field to update.");
  }

  const queue = await updateQueue(queueId, patch);

  return res.json({ queue: mapQueue(queue, req.user.id) });
});

/** PATCH /api/queues/:queueId/status — owner or admin. */
export const patchQueueStatus = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  await loadManagedQueue(req, queueId);

  const { status } = req.body ?? {};

  if (!QUEUE_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${QUEUE_STATUSES.join(", ")}.`);
  }

  const queue = await updateQueueStatus(queueId, status);

  return res.json({ queue: mapQueue(queue, req.user.id) });
});

/** DELETE /api/queues/:queueId — owner or admin; tickets cascade. */
export const removeQueue = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  await loadManagedQueue(req, queueId);

  await deleteQueue(queueId);

  return res.json({ message: "Queue deleted." });
});

/** POST /api/queues/:queueId/join — issues a ticket atomically. */
export const joinQueue = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");

  const ticket = await issueTicket({ queueId, userId: req.user.id });

  return res.status(201).json({ ticket });
});

/** POST /api/queues/:queueId/next — owner or admin. */
export const serveNextTicket = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  await loadManagedQueue(req, queueId);

  const queue = await advanceQueue(queueId);

  return res.json({ queue: mapQueue(queue, req.user.id) });
});

/** GET /api/queues/:queueId/tickets — owner or admin (staff console). */
export const getQueueTickets = asyncHandler(async (req, res) => {
  const queueId = requireUuid(req.params.queueId, "queue id");
  await loadManagedQueue(req, queueId);

  const tickets = await listQueueTickets(queueId);

  return res.json({ tickets, count: tickets.length });
});

/** GET /api/tickets/:ticketId — the owner, the queue owner, or an admin. */
export const getTicket = asyncHandler(async (req, res) => {
  const ticketId = requireUuid(req.params.ticketId, "ticket id");

  const record = await findTicketRecord(ticketId);

  if (!record) {
    throw ApiError.notFound("Ticket not found.");
  }

  const permitted =
    record.user_id === req.user.id ||
    req.user.role === "admin" ||
    (isStaff(req.user) && record.queue_owner_id === req.user.id);

  if (!permitted) {
    // 404 rather than 403: another customer's ticket must not be confirmed to exist.
    throw ApiError.notFound("Ticket not found.");
  }

  const ticket = await getTicketView(ticketId);

  return res.json({ ticket });
});

/** DELETE /api/tickets/:ticketId — the customer leaves the queue. */
export const leaveQueue = asyncHandler(async (req, res) => {
  const ticketId = requireUuid(req.params.ticketId, "ticket id");

  const record = await findTicketRecord(ticketId);

  if (!record) {
    throw ApiError.notFound("Ticket not found.");
  }

  const isOwner = record.user_id === req.user.id;
  const isQueueOwner = isStaff(req.user) && record.queue_owner_id === req.user.id;

  if (!isOwner && !isQueueOwner && req.user.role !== "admin") {
    throw ApiError.notFound("Ticket not found.");
  }

  if (record.status === "served") {
    throw ApiError.conflict("This ticket has already been served.");
  }

  const { alreadyCancelled } = await cancelTicket(ticketId);

  return res.json({
    message: alreadyCancelled ? "You had already left this queue." : "You left the queue.",
    ticket: await getTicketView(ticketId),
  });
});

/** PATCH /api/tickets/:ticketId/complete — owner or admin marks a ticket served. */
export const completeTicketHandler = asyncHandler(async (req, res) => {
  const ticketId = requireUuid(req.params.ticketId, "ticket id");

  const record = await findTicketRecord(ticketId);

  if (!record) {
    throw ApiError.notFound("Ticket not found.");
  }

  const permitted =
    record.user_id === req.user.id ||
    req.user.role === "admin" ||
    (isStaff(req.user) && record.queue_owner_id === req.user.id);

  if (!permitted) {
    throw ApiError.notFound("Ticket not found.");
  }

  const updated = await completeTicket(ticketId);

  if (!updated) {
    throw ApiError.conflict("This ticket is not waiting or being served.");
  }

  return res.json({ ticket: await getTicketView(ticketId) });
});