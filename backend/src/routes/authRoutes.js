import express from "express";
import { getMe, login, register } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: credentials in, token out.
router.post("/register", register);
router.post("/login", login);

// Everything below requires a valid Bearer token.
router.use(authenticateToken);

router.get("/me", getMe);

export default router;