import { pool } from "../config/db.js";

const publicUserFields = "id, name, email, role, created_at";

export async function findUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await pool.query(
    `SELECT ${publicUserFields} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createUser({ name, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${publicUserFields}`,
    [name, email.toLowerCase(), passwordHash]
  );
  return result.rows[0];
}

