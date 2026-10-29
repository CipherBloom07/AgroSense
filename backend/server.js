require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,https://cipherbloom07.github.io")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Configure it in backend/.env locally or your host environment settings.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: true } : undefined,
  max: 5,
  // Retire idle connections sooner to reduce reuse of stale Neon connections.
  idleTimeoutMillis: 10000,
  // Allow time for Neon to wake a suspended compute instance.
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error:", error.message, error.code || "");
});

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by AgroSense API."));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "20kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", service: "AgroSense API" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.get("/api/schemes", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT id, name, location_description, notes, created_at, updated_at FROM schemes ORDER BY name");
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/schemes", async (req, res, next) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const location = typeof req.body.location_description === "string" ? req.body.location_description.trim() : null;
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim() : null;
  if (!name || name.length > 120) return res.status(400).json({ error: "Scheme name is required and must be at most 120 characters." });
  if (location && location.length > 200) return res.status(400).json({ error: "Location must be at most 200 characters." });
  try {
    const result = await pool.query(
      "INSERT INTO schemes (name, location_description, notes) VALUES ($1, $2, $3) RETURNING id, name, location_description, notes, created_at",
      [name, location || null, notes || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) { next(error); }
});

app.get("/api/fields", async (req, res, next) => {
  const schemeId = req.query.scheme_id;
  if (schemeId !== undefined && !/^\d+$/.test(String(schemeId))) return res.status(400).json({ error: "scheme_id must be a positive integer." });
  try {
    const values = [];
    let where = "";
    if (schemeId !== undefined) { values.push(Number(schemeId)); where = "WHERE f.scheme_id = $1"; }
    const sql = "SELECT f.id, f.scheme_id, s.name AS scheme_name, f.field_code, f.crop_name, " +
      "f.area_hectares, f.soil_type, f.growth_stage, f.notes, f.created_at " +
      "FROM fields f JOIN schemes s ON s.id = f.scheme_id " + where + " ORDER BY s.name, f.field_code";
    const result = await pool.query(sql, values);
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/fields", async (req, res, next) => {
  const schemeId = Number(req.body.scheme_id);
  const fieldCode = typeof req.body.field_code === "string" ? req.body.field_code.trim() : "";
  const cropName = typeof req.body.crop_name === "string" ? req.body.crop_name.trim() : "";
  const area = Number(req.body.area_hectares);
  const soilType = typeof req.body.soil_type === "string" ? req.body.soil_type.trim() : null;
  const growthStage = typeof req.body.growth_stage === "string" ? req.body.growth_stage.trim() : null;
  if (!Number.isSafeInteger(schemeId) || schemeId <= 0) return res.status(400).json({ error: "A valid scheme_id is required." });
  if (!fieldCode || fieldCode.length > 60) return res.status(400).json({ error: "Field code is required and must be at most 60 characters." });
  if (!cropName || cropName.length > 80) return res.status(400).json({ error: "Crop name is required and must be at most 80 characters." });
  if (!Number.isFinite(area) || area <= 0 || area > 1000000000) return res.status(400).json({ error: "Area must be a positive number." });
  try {
    const result = await pool.query(
      "INSERT INTO fields (scheme_id, field_code, crop_name, area_hectares, soil_type, growth_stage) " +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      "RETURNING id, scheme_id, field_code, crop_name, area_hectares, soil_type, growth_stage, created_at",
      [schemeId, fieldCode, cropName, area, soilType || null, growthStage || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That field code already exists in this scheme." });
    if (error.code === "23503") return res.status(400).json({ error: "The selected scheme does not exist." });
    next(error);
  }
});

app.get("/api/water-plans", async (req, res, next) => {
  const fieldId = req.query.field_id;
  if (fieldId !== undefined && !/^\d+$/.test(String(fieldId))) return res.status(400).json({ error: "field_id must be a positive integer." });
  try {
    const values = [];
    let where = "";
    if (fieldId !== undefined) { values.push(Number(fieldId)); where = "WHERE wp.field_id = $1"; }
    const sql = "SELECT wp.id, wp.field_id, f.field_code, f.crop_name, f.area_hectares, " +
      "wp.target_depth_mm_per_day, wp.application_efficiency_percent, wp.net_volume_m3_per_day, " +
      "wp.gross_volume_m3_per_day, wp.calculation_method, wp.assumptions, wp.data_source, wp.planned_for, wp.created_at " +
      "FROM water_plans wp JOIN fields f ON f.id = wp.field_id " + where + " ORDER BY wp.planned_for DESC, wp.created_at DESC";
    const result = await pool.query(sql, values);
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/water-plans", async (req, res, next) => {
  const fieldId = Number(req.body.field_id);
  const depth = Number(req.body.target_depth_mm_per_day);
  const efficiency = Number(req.body.application_efficiency_percent);
  const assumptions = typeof req.body.assumptions === "string" ? req.body.assumptions.trim() : null;
  const dataSource = req.body.data_source === "sample" ? "sample" : "user_entered";
  const plannedFor = req.body.planned_for;
  if (!Number.isSafeInteger(fieldId) || fieldId <= 0) return res.status(400).json({ error: "A valid field_id is required." });
  if (!Number.isFinite(depth) || depth < 0 || depth > 1000) return res.status(400).json({ error: "Target depth must be between 0 and 1000 mm/day." });
  if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 100) return res.status(400).json({ error: "Application efficiency must be greater than 0 and at most 100 percent." });
  if (plannedFor !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(plannedFor))) return res.status(400).json({ error: "planned_for must use YYYY-MM-DD format." });
  try {
    const fieldResult = await pool.query("SELECT id, area_hectares FROM fields WHERE id = $1", [fieldId]);
    if (!fieldResult.rows.length) return res.status(400).json({ error: "The selected field does not exist." });
    const area = Number(fieldResult.rows[0].area_hectares);
    const net = Number((area * depth * 10).toFixed(3));
    const gross = Number((net / (efficiency / 100)).toFixed(3));
    const result = await pool.query(
      "INSERT INTO water_plans (field_id, target_depth_mm_per_day, application_efficiency_percent, " +
      "net_volume_m3_per_day, gross_volume_m3_per_day, assumptions, data_source, planned_for) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE)) " +
      "RETURNING id, field_id, target_depth_mm_per_day, application_efficiency_percent, net_volume_m3_per_day, " +
      "gross_volume_m3_per_day, assumptions, data_source, planned_for, created_at",
      [fieldId, depth, efficiency, net, gross, assumptions || null, dataSource, plannedFor || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === "23503") return res.status(400).json({ error: "The selected field does not exist." });
    next(error);
  }
});

app.delete("/api/water-plans/:id", async (req, res, next) => {
  const id = req.params.id;
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) return res.status(400).json({ error: "A valid water plan ID is required." });
  try {
    const result = await pool.query("DELETE FROM water_plans WHERE id = $1 RETURNING id", [Number(id)]);
    if (!result.rows.length) return res.status(404).json({ error: "Water plan not found." });
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) { next(error); }
});

app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
app.use((error, _req, res, _next) => {
  if (error.message === "Origin is not allowed by AgroSense API.") return res.status(403).json({ error: "This origin is not allowed." });
  console.error("API request failed:", {
    message: error.message,
    code: error.code || null,
    detail: error.detail || null
  });
  res.status(500).json({ error: "An unexpected server error occurred." });
});

const server = app.listen(port, () => console.log("AgroSense API listening on port " + port));
async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
