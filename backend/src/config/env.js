import dotenv from "dotenv";

// Loaded once, before any other module reads process.env. ESM evaluates
// imports in declaration order, so every module that imports this one (directly
// or transitively) sees a populated, validated environment.
dotenv.config();

// Distinguishes "no fallback supplied, so this variable is required" from a
// fallback that legitimately happens to be undefined or null.
const REQUIRED = Symbol("required");

const missingVariable = (name) =>
  new Error(
    `Missing required environment variable ${name}. ` +
      "Copy backend/.env.example to backend/.env and fill it in."
  );

/** Returns the trimmed value, or undefined when unset or blank. */
function readOptional(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === "") return undefined;
  return raw.trim();
}

function readString(name, fallback = REQUIRED) {
  const raw = readOptional(name);

  if (raw === undefined) {
    if (fallback === REQUIRED) throw missingVariable(name);
    return fallback;
  }

  return raw;
}

function readInt(name, fallback) {
  const raw = readOptional(name);

  if (raw === undefined) {
    if (fallback === REQUIRED) throw missingVariable(name);
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}".`);
  }
  return value;
}

function readBool(name, fallback) {
  const raw = readOptional(name);

  if (raw === undefined) {
    if (fallback === REQUIRED) throw missingVariable(name);
    return fallback;
  }

  return raw.toLowerCase() === "true" || raw === "1";
}

// `DATABASE_SSL` is opt-in. Managed PostgreSQL hosts (RDS, Neon, Supabase)
// need TLS; the in-network Postgres container does not and would fail to
// negotiate it. Modes: off | require | verify-full.
function readDatabaseSsl() {
  const mode = readString("DATABASE_SSL", "off").toLowerCase();

  if (mode === "off" || mode === "false" || mode === "disable") return false;
  if (mode === "require" || mode === "true") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };

  throw new Error(
    `DATABASE_SSL must be one of: off, require, verify-full. Received "${mode}".`
  );
}

const nodeEnv = readString("NODE_ENV", "development");

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: readInt("PORT", 5000),
  databaseUrl: readString("DATABASE_URL"),
  databaseSsl: readDatabaseSsl(),
  databasePoolMax: readInt("DB_POOL_MAX", 10),
  jwtSecret: readString("JWT_SECRET"),
  jwtExpiresIn: readString("JWT_EXPIRES_IN", "1h"),
  bcryptRounds: readInt("BCRYPT_ROUNDS", 12),
  clientOrigin: readString("CLIENT_ORIGIN", "http://localhost:5173"),
  trustProxy: readBool("TRUST_PROXY", false),
  autoMigrate: readBool("AUTO_MIGRATE", true),
  schemaPath: readString("SCHEMA_PATH", null),
});

// A short secret makes JWTs guessable. Fail at boot rather than at first login.
if (env.jwtSecret.length < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 characters (received ${env.jwtSecret.length}). ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

export default env;