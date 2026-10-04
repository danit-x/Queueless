import express from "express";
import {
  completeTicketHandler,
  createQueueHandler,
  getMyTickets,
  getQueue,
  getQueueTickets,
  getQueues,
  getTicket,
  joinQueue,
  leaveQueue,
  patchQueue,
  patchQueueStatus,
  removeQueue,
  serveNextTicket,
} from "../controllers/queueController.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

// Static segments must be declared before `/:queueId`, otherwise Express treats
// "my-tickets" as a queue id and the lookup fails with "Invalid queue id".
router.get("/my-tickets", getMyTickets);

router.get("/", getQueues);
router.post("/", authorizeRoles("merchant", "admin"), createQueueHandler);

router.get("/:queueId", getQueue);
router.patch("/:queueId", patchQueue);
router.patch("/:queueId/status", patchQueueStatus);
router.delete("/:queueId", removeQueue);

// Any authenticated customer can take a ticket.
router.post("/:queueId/join", joinQueue);

// Advancing the line is restricted to the queue owner or an admin.
router.post("/:queueId/next", serveNextTicket);
router.get("/:queueId/tickets", getQueueTickets);

export default router;