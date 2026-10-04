import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pathToFileURL } from "node:url";

import { env } from "./config/env.js";
import { checkDatabaseHealth, closePool, verifyDatabaseConnection } from "./config/db.js";
import { initializeDatabase } from "./config/initDb.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import queueRoutes from "./routes/queueRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";

const API_VERSION = "1.0.0";

/**
 * Builds the Express application. Kept separate from the listener so the app can
 * be mounted in tests without binding a port.
 */
export function createApp() {
  const app = express();

  // Required for correct client IPs and rate limiting behind nginx/ALB.
  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");

  app.use(helmet());

  app.use(
    cors({
      origin: env.clientOrigin === "*" ? true : env.clientOrigin.split(",").map((o) => o.trim()),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  // A 100kb body is far more than any queue payload needs.
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // Slows credential stuffing without affecting normal queue polling, which the
  // frontend repeats every 4 seconds on the queue routes, not the auth routes.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.isProduction ? 20 : 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts. Please try again in a few minutes." },
  });

  /**
   * Liveness/readiness probe.
   * Reports 200 while the process is up and 503 when PostgreSQL is unreachable,
   * so orchestrators stop routing traffic to a broken instance.
   */
  const healthHandler = async (_req, res) => {
    const database = await checkDatabaseHealth();

    res.status(database.ok ? 200 : 503).json({
      status: database.ok ? "ok" : "degraded",
      service: "QueueLess API",
      version: API_VERSION,
      database: database.ok ? "up" : "down",
      ...(database.ok ? {} : { databaseError: database.error }),
      uptimeSeconds: Math.round(process.uptime()),
    });
  };

  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/queues", queueRoutes);
  app.use("/api/tickets", ticketRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Verifies the database and schema, then starts listening. Refuses to serve
 * traffic if the database or schema is unusable, so a broken deployment fails
 * fast instead of returning 500s.
 */
async function startServer() {
  const { latencyMs } = await verifyDatabaseConnection();
  console.log(`[db] Connected (${latencyMs.toFixed(1)}ms)`);

  const schemaReady = await initializeDatabase();
  if (!schemaReady) {
    throw new Error(
      "Database schema is missing or out of date. Apply database/schema.sql before starting."
    );
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(
      `[api] QueueLess API v${API_VERSION} listening on port ${env.port} (${env.nodeEnv})`
    );
  });

  // Slightly above a typical 60s load-balancer idle timeout so the balancer,
  // not Node, is the side that closes an idle connection.
  server.keepAliveTimeout = 60_000;
  server.headersTimeout = 65_000;

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down gracefully.`);

    server.close(async (error) => {
      if (error) {
        console.error("[api] Error while closing HTTP server:", error.message);
      }

      try {
        await closePool();
        console.log("[db] Connection pool closed.");
      } catch (poolError) {
        console.error("[db] Error while closing pool:", poolError.message);
      }

      process.exit(error ? 1 : 0);
    });

    // Do not let a hung connection block the deploy indefinitely.
    setTimeout(() => {
      console.error("[api] Graceful shutdown timed out, forcing exit.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("[api] Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[api] Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  return server;
}

// Only listen when executed directly, so importing createApp() from a test does
// not bind a port.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startServer().catch((error) => {
    console.error(`[api] Failed to start: ${error.message}`);
    process.exit(1);
  });
}