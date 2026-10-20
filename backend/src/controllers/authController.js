import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  createUser,
  findUserByEmailWithHash,
  findUserProfilePhoto,
  removeUserProfilePhoto,
  toPublicUser,
  updateUserProfile,
  updateUserProfilePhoto,
} from "../models/userModel.js";
import { signAccessToken } from "../middleware/authMiddleware.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isValidEmail, normalizeEmail, PG_UNIQUE_VIOLATION } from "../utils/validation.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt truncates beyond 72 bytes.

function validateRegistration({ name, email, password, confirmPassword }) {
  if (!name?.trim() || !email?.trim() || !password) {
    throw ApiError.badRequest("Name, email and password are required.");
  }

  if (name.trim().length > 120) {
    throw ApiError.badRequest("Name must be 120 characters or fewer.");
  }

  if (!isValidEmail(email)) {
    throw ApiError.badRequest("Please enter a valid email address.");
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`
    );
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw ApiError.badRequest("Passwords do not match.");
  }
}

// A real hash of an unguessable value, computed once on the first failed login.
// Comparing against it keeps the response time of "unknown email" and "wrong
// password" indistinguishable, so the endpoint cannot be used to enumerate
// registered accounts.
let decoyHashPromise = null;
function getDecoyHash() {
  decoyHashPromise ??= bcrypt.hash(
    `decoy-${crypto.randomUUID()}`,
    env.bcryptRounds
  );
  return decoyHashPromise;
}

/**
 * POST /api/auth/register
 *
 * Hashing happens before the insert so the plaintext password is never passed to
 * the database layer, and any failure still reaches the global error handler.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body ?? {};

  validateRegistration({ name, email, password, confirmPassword });

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  let user;
  try {
    user = await createUser({
      name: name.trim(),
      email: normalizeEmail(email),
      passwordHash,
    });
  } catch (error) {
    // The pre-insert check is advisory; the unique index is the real guard, so a
    // concurrent duplicate must return 409 rather than 500.
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw ApiError.conflict("An account with this email already exists.");
    }
    throw error;
  }

  const publicUser = toPublicUser(user);

  return res.status(201).json({
    message: "Registration successful.",
    token: signAccessToken(publicUser),
    user: publicUser,
  });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email?.trim() || !password) {
    throw ApiError.badRequest("Email and password are required.");
  }

  if (!isValidEmail(email)) {
    throw ApiError.badRequest("Please enter a valid email address.");
  }

  const record = await findUserByEmailWithHash(email);
  const passwordHash = record?.password_hash ?? (await getDecoyHash());
  const passwordMatches = await bcrypt.compare(password, passwordHash);

  if (!record || !passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password.");
  }

  const user = toPublicUser(record);

  return res.json({ token: signAccessToken(user), user });
});

/** GET /api/auth/me */
export const getMe = asyncHandler(async (req, res) => res.json({ user: toPublicUser(req.user) }));

/** PATCH /api/auth/me */
export const patchMe = asyncHandler(async (req, res) => {
  const { name, email, phoneNumber } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    throw ApiError.badRequest("Name is required.");
  }
  if (name.trim().length > 120) {
    throw ApiError.badRequest("Name must be 120 characters or fewer.");
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    throw ApiError.badRequest("Please enter a valid email address.");
  }
  if (phoneNumber !== undefined && typeof phoneNumber !== "string") {
    throw ApiError.badRequest("Phone number must be a string.");
  }
  if (phoneNumber?.trim().length > 30) {
    throw ApiError.badRequest("Phone number must be 30 characters or fewer.");
  }

  let user;
  try {
    user = await updateUserProfile(req.user.id, {
      name: name.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber?.trim() ?? "",
    });
  } catch (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      throw ApiError.conflict("An account with this email already exists.");
    }
    throw error;
  }

  return res.json({ user: toPublicUser(user) });
});

/** PUT /api/auth/me/photo */
export const putProfilePhoto = asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw ApiError.badRequest("Choose a profile image to upload.");
  }

  const mimeType = req.get("content-type")?.split(";")[0].toLowerCase();
  const imageSignatures = {
    "image/jpeg": req.body.length >= 3 && req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff,
    "image/png": req.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp":
      req.body.length >= 12 &&
      req.body.toString("ascii", 0, 4) === "RIFF" &&
      req.body.toString("ascii", 8, 12) === "WEBP",
  };

  if (!imageSignatures[mimeType] || !imageSignatures[mimeType]) {
    throw ApiError.badRequest("Profile photo must be a valid JPEG, PNG, or WebP image.");
  }

  const user = await updateUserProfilePhoto(req.user.id, req.body, mimeType);
  return res.json({ user: toPublicUser(user) });
});

/** GET /api/auth/me/photo */
export const getProfilePhoto = asyncHandler(async (req, res) => {
  const photo = await findUserProfilePhoto(req.user.id);
  if (!photo?.profile_photo) {
    throw ApiError.notFound("No profile photo has been uploaded.");
  }

  res.set("Cache-Control", "private, no-store");
  return res.type(photo.profile_photo_mime).send(photo.profile_photo);
});

/** DELETE /api/auth/me/photo */
export const deleteProfilePhoto = asyncHandler(async (req, res) => {
  const user = await removeUserProfilePhoto(req.user.id);
  return res.json({ user: toPublicUser(user) });
});