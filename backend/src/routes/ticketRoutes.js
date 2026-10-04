import express from "express";
import {
  completeTicketHandler,
  getMyTickets,
  getTicket,
  leaveQueue,
} from "../controllers/queueController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

// Alias of GET /api/queues/my-tickets, kept because the frontend service layer
// and the published README both address /api/tickets/me.
router.get("/me", getMyTickets);

router.get("/:ticketId", getTicket);
router.delete("/:ticketId", leaveQueue);
router.patch("/:ticketId/complete", completeTicketHandler);

export default router;