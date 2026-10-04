import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findUserById } from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Extracts the raw token from an `Authorization: Bearer <token>` header. */
function readBearerToken(req) {
  const header = req.get("authorization");

  if (!header) return null;

  const [scheme, token] = header.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

/**
 * Requires a valid `Authorization: Bearer <token>` header and attaches the
 * matching user record to `req.user`.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token payload, so a deleted account or a role change takes effect
 * immediately instead of persisting until the token expires.
 */
export const authenticateToken = asyncHandler(async (req, _res, next) => {
  const token = readBearerToken(req);

  if (!token) {
    throw ApiError.unauthorized(
      "Authentication token is required. Send 'Authorization: Bearer <token>'."
    );
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    const message =
      error.name === "TokenExpiredError" ? "Your session has expired." : "Invalid token.";
    throw ApiError.unauthorized(message);
  }

  const user = await findUserById(payload.sub);

  if (!user) {
    throw ApiError.unauthorized("User account was not found.");
  }

  req.user = user;
  req.token = token;
  next();
});

/**
 * Restricts a route to the given roles. Must run after `authenticateToken`.
 *
 * @example router.post("/", authenticateToken, authorizeRoles("merchant", "admin"), createQueue)
 */
export function authorizeRoles(...allowedRoles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required."));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${allowedRoles.join(", ")}.`
        )
      );
    }

    return next();
  };
}

/**
 * Signs the access token handed to the client on register and login.
 * The user id lives in the registered `sub` claim, which is what
 * `authenticateToken` reads.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: "queueless-api", audience: "queueless-app" }
  );
}