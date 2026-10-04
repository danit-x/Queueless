const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

export const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

export const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** PostgreSQL unique_violation. */
export const PG_UNIQUE_VIOLATION = "23505";
/** PostgreSQL foreign_key_violation. */
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** PostgreSQL check_violation. */
export const PG_CHECK_VIOLATION = "23514";
/** PostgreSQL serialization_failure and deadlock_detected. */
export const PG_SERIALIZATION_FAILURE = "40001";
export const PG_DEADLOCK_DETECTED = "40P01";