import { queueApi as httpQueueApi } from "./api";
import { mockQueueApi } from "./mockQueueApi";

// Uses the in-browser mock until the backend queue endpoints exist.
// Set VITE_USE_MOCK_API=false to talk to the real API.
export const usingMockApi = import.meta.env.VITE_USE_MOCK_API !== "false";

export const queueApi = usingMockApi ? mockQueueApi : httpQueueApi;

export const POLL_INTERVAL_MS = 4000;

// Customers get a "coming soon" alert once this many people or fewer are ahead.
export const TURN_SOON_THRESHOLD = 2;

export function canManageQueues(user) {
  return usingMockApi || ["staff", "admin"].includes(user?.role);
}
