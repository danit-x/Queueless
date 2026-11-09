import express from "express";
import {
  deleteProfilePhoto,
  getMe,
  getProfilePhoto,
  login,
  patchMe,
  putProfilePhoto,
  register,
} from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: credentials in, token out.
router.post("/register", register);
router.post("/login", login);

// Everything below requires a valid Bearer token.
router.use(authenticateToken);

router.get("/me", getMe);
router.patch("/me", patchMe);
router.get("/me/photo", getProfilePhoto);
router.put("/me/photo", express.raw({ type: "image/*", limit: "2mb" }), putProfilePhoto);
router.delete("/me/photo", deleteProfilePhoto);

export default router;