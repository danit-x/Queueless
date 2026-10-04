/**
 * Error type carrying an HTTP status so controllers and the global error
 * handler can return a correct response without try/catch in every handler.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Invalid request.", details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new ApiError(401, message);
  }

  static forbidden(message = "You do not have access to this resource.") {
    return new ApiError(403, message);
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, message);
  }

  static conflict(message = "That request conflicts with the current state.") {
    return new ApiError(409, message);
  }

  static unprocessable(message = "Request could not be processed.") {
    return new ApiError(422, message);
  }

  static internal(message = "Unexpected server error.") {
    return new ApiError(500, message);
  }
}

export default ApiError;