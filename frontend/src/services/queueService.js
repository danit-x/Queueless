import { apiClient } from "./api";

export async function getQueues() {
  const { data } = await apiClient.get("/queues");
  return data;
}

export async function createQueue(queueData) {
  const { data } = await apiClient.post("/queues", queueData);
  return data;
}

export async function joinQueue(queueId) {
  const { data } = await apiClient.post(`/queues/${queueId}/join`);
  return data;
}

export async function callNextTicket(queueId) {
  const { data } = await apiClient.post(`/queues/${queueId}/next`);
  return data;
}

export async function updateQueueStatus(queueId, status) {
  const { data } = await apiClient.patch(`/queues/${queueId}/status`, { status });
  return data;
}

export async function getMyTickets({ status } = {}) {
  const { data } = await apiClient.get("/tickets/me", {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getQueue(queueId) {
  const { data } = await apiClient.get(`/queues/${queueId}`);
  return data;
}

export async function getTicket(ticketId) {
  const { data } = await apiClient.get(`/tickets/${ticketId}`);
  return data;
}

export async function leaveTicket(ticketId) {
  const { data } = await apiClient.delete(`/tickets/${ticketId}`);
  return data;
}

export const queueApi = {
  getQueues,
  listQueues: getQueues,
  createQueue,
  joinQueue,
  callNextTicket,
  serveNext: callNextTicket,
  updateQueueStatus,
  getMyTickets,
  myTickets: getMyTickets,
  getQueue,
  getTicket,
  leaveTicket,
};

export const POLL_INTERVAL_MS = 5000;

// Customers get a "coming soon" alert once this many people or fewer are ahead.
export const TURN_SOON_THRESHOLD = 2;

// Must match the roles in database/schema.sql: customer, merchant, admin.
export const STAFF_ROLES = ["merchant", "admin"];

export function canManageQueues(user) {
  return STAFF_ROLES.includes(user?.role);
}
