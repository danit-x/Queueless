import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import authRoutes from "./routes/authRoutes.js";
import { verifyDatabaseConnection } from "./config/db.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "QueueLess API" });
});

app.use("/api/auth", authRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((error, req, res, next) => {
  res.status(500).json({ message: "Unexpected server error." });
});

async function startServer() {
  try {
    await verifyDatabaseConnection();
    app.listen(port, () => {
      console.log(`QueueLess API running on port ${port}`);
    });
  } catch (error) {
    console.error("Unable to connect to PostgreSQL. Check DATABASE_URL and database status.");
    process.exit(1);
  }
}

startServer();

