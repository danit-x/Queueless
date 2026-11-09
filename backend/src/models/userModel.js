import { pool } from "../config/db.js";
import { normalizeEmail } from "../utils/validation.js";

/**
 * Columns safe to send to a client. `password_hash` is never included, so a
 * caller cannot leak it by spreading a model result into a response.
 */
const PUBLIC_FIELDS =
  "id, name, email, role, phone_number, (profile_photo IS NOT NULL) AS has_profile_photo, created_at";

/** Strips the snake_case database shape down to the documented API payload. */
export function toPublicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phoneNumber: row.phone_number ?? "",
    hasProfilePhoto: Boolean(row.has_profile_photo),
    createdAt: row.created_at,
  };
}

/**
 * Full record including `password_hash`, for login only.
 * @param {string} email
 */
export async function findUserByEmailWithHash(email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, password_hash, role, phone_number,
            (profile_photo IS NOT NULL) AS has_profile_photo, created_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)]
  );

  return rows[0] ?? null;
}

/** Existence check that avoids loading the password hash. */
export async function emailExists(email) {
  const { rows } = await pool.query("SELECT 1 FROM users WHERE email = $1", [
    normalizeEmail(email),
  ]);

  return rows.length > 0;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [
    id,
  ]);

  return rows[0] ?? null;
}

/**
 * Inserts a user. Email uniqueness is enforced by the database, so a concurrent
 * registration of the same address fails here rather than silently duplicating.
 *
 * @param {{ name: string, email: string, passwordHash: string, role?: string }} input
 */
export async function createUser({ name, email, passwordHash, role = "customer" }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_FIELDS}`,
    [name.trim(), normalizeEmail(email), passwordHash, role]
  );

  return rows[0];
}

export async function updateUserProfile(id, { name, email, phoneNumber }) {
  const { rows } = await pool.query(
    `UPDATE users
        SET name = $1, email = $2, phone_number = $3
      WHERE id = $4
      RETURNING ${PUBLIC_FIELDS}`,
    [name, normalizeEmail(email), phoneNumber || null, id]
  );

  return rows[0] ?? null;
}

export async function updateUserProfilePhoto(id, photo, mimeType) {
  const { rows } = await pool.query(
    `UPDATE users
        SET profile_photo = $1, profile_photo_mime = $2
      WHERE id = $3
      RETURNING ${PUBLIC_FIELDS}`,
    [photo, mimeType, id]
  );

  return rows[0] ?? null;
}

export async function removeUserProfilePhoto(id) {
  const { rows } = await pool.query(
    `UPDATE users
        SET profile_photo = NULL, profile_photo_mime = NULL
      WHERE id = $1
      RETURNING ${PUBLIC_FIELDS}`,
    [id]
  );

  return rows[0] ?? null;
}

export async function findUserProfilePhoto(id) {
  const { rows } = await pool.query(
    "SELECT profile_photo, profile_photo_mime FROM users WHERE id = $1",
    [id]
  );

  return rows[0] ?? null;
}