import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import {
  PG_CHECK_VIOLATION,
  PG_DEADLOCK_DETECTED,
  PG_FOREIGN_KEY_VIOLATION,
  PG_SERIALIZATION_FAILURE,
  PG_UNIQUE_VIOLATION,
} from "../utils/validation.js";

/** Terminal handler for unmatched routes. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

/**
 * Maps a PostgreSQL driver error onto the right HTTP response, so a constraint
 * violation surfaces as a 409 or 400 instead of a generic 500.
 */
function translateDatabaseError(error) {
  switch (error.code) {
    case PG_UNIQUE_VIOLATION:
      return ApiError.conflict("That record already exists.");
    case PG_FOREIGN_KEY_VIOLATION:
      return ApiError.badRequest("A referenced record does not exist.");
    case PG_CHECK_VIOLATION:
      return ApiError.badRequest("A value is outside the allowed range.");
    case PG_SERIALIZATION_FAILURE:
    case PG_DEADLOCK_DETECTED:
      return ApiError.conflict("The request conflicted with another one. Please retry.");
    default:
      return null;
  }
}

/**
 * Single Express error handler. Every error in the app funnels here, so error
 * responses always share the `{ message }` shape the frontend expects.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity.
export function errorHandler(error, req, res, next) {
  let apiError = error instanceof ApiError ? error : null;

  // Malformed JSON surfaces as a SyntaxError with a status from body-parser.
  if (!apiError && error instanceof SyntaxError && "body" in error) {
    apiError = ApiError.badRequest("Request body must be valid JSON.");
  }

  // A request body over the express.json limit.
  if (!apiError && error?.type === "entity.too.large") {
    apiError = new ApiError(413, "Request body is too large.");
  }

  if (!apiError) {
    apiError = translateDatabaseError(error) ?? ApiError.internal();
  }

  if (apiError.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  if (res.headersSent) {
    return res.end();
  }

  const body = { message: apiError.message };

  if (apiError.details !== undefined) {
    body.details = apiError.details;
  }

  // Stack traces are useful in development and a leak in production.
  if (!env.isProduction && apiError.status >= 500 && error?.stack) {
    body.stack = error.stack;
  }

  return res.status(apiError.status).json(body);
}

export default errorHandler;