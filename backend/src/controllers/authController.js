import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createUser, findUserByEmailWithHash, toPublicUser } from "../models/userModel.js";
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