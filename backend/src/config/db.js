import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL Database");
});

pool.on("error", (err) => {
  console.error("Unexpected DB Error:", err);
  process.exit(-1);
});

export default pool;
