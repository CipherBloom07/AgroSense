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


const crypto = require("node:crypto");
const SESSION_DAYS = 7;
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
function safeEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
async function requireAuth(req,res,next){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
    if(!token)return res.status(401).json({error:"Sign in to continue."});
    const result=await pool.query(
      "SELECT u.id,u.display_name,u.email,u.is_active FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
      [hashToken(token)]
    );
    if(!result.rows.length||!result.rows[0].is_active)return res.status(401).json({error:"Session is invalid or expired. Sign in again."});
    req.user=result.rows[0];req.tokenHash=hashToken(token);next();
  }catch(error){next(error);}
}
async function requireSchemeRole(req,res,next){
  try{
    const schemeId=Number(req.params.schemeId||req.body.scheme_id||req.query.scheme_id);
    if(!Number.isSafeInteger(schemeId)||schemeId<=0)return res.status(400).json({error:"A valid scheme_id is required."});
    const result=await pool.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,schemeId]);
    if(!result.rows.length)return res.status(403).json({error:"You are not assigned to this scheme."});
    req.schemeRole=result.rows[0].role;req.schemeId=schemeId;next();
  }catch(error){next(error);}
}
app.post("/api/auth/bootstrap",async(req,res,next)=>{
  const {setup_key,display_name,email,password,scheme_id}=req.body||{};
  if(!process.env.AGROSENSE_SETUP_KEY)return res.status(503).json({error:"Set AGROSENSE_SETUP_KEY on the API host before creating the first officer."});
  if(!safeEqual(setup_key||"",process.env.AGROSENSE_SETUP_KEY))return res.status(403).json({error:"Invalid setup key."});
  if(typeof display_name!=="string"||display_name.trim().length<2||typeof email!=="string"||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=="string"||password.length<12)return res.status(400).json({error:"Provide a name, valid email and password of at least 12 characters."});
  try{
    const existing=await pool.query("SELECT 1 FROM scheme_memberships WHERE role='irrigation_officer' LIMIT 1");
    if(existing.rows.length)return res.status(409).json({error:"An irrigation officer already exists. Ask an existing officer to create additional accounts."});
    const sid=scheme_id===undefined||scheme_id===null||scheme_id===""?null:Number(scheme_id);
    if(sid!==null&&(!Number.isSafeInteger(sid)||sid<=0))return res.status(400).json({error:"scheme_id must be a positive integer."});
    if(sid!==null){const scheme=await pool.query("SELECT id FROM schemes WHERE id=$1",[sid]);if(!scheme.rows.length)return res.status(400).json({error:"The selected scheme does not exist."});}
    const salt=crypto.randomBytes(16).toString("hex");
    const user=await pool.query("INSERT INTO app_users(display_name,email,password_salt,password_hash) VALUES($1,$2,$3,$4) RETURNING id,display_name,email",[display_name.trim(),email.trim().toLowerCase(),salt,hashPassword(password,salt)]);
    if(sid!==null)await pool.query("INSERT INTO scheme_memberships(user_id,scheme_id,role) VALUES($1,$2,'irrigation_officer')",[user.rows[0].id,sid]);
    res.status(201).json({data:user.rows[0],message:"First officer account created. Sign in to manage scheme membership."});
  }catch(error){if(error.code==="23505")return res.status(409).json({error:"An account with that email already exists."});next(error);}
});
app.post("/api/auth/login",async(req,res,next)=>{
  const email=typeof req.body.email==="string"?req.body.email.trim().toLowerCase():"";
  const password=typeof req.body.password==="string"?req.body.password:"";
  try{
    const result=await pool.query("SELECT id,display_name,email,password_salt,password_hash,is_active FROM app_users WHERE email=$1",[email]);
    const user=result.rows[0];
    if(!user||!user.is_active||!safeEqual(hashPassword(password,user.password_salt),user.password_hash))return res.status(401).json({error:"Email or password is incorrect."});
    const token=crypto.randomBytes(32).toString("base64url");
    const expires=new Date(Date.now()+SESSION_DAYS*86400000);
    await pool.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)",[user.id,hashToken(token),expires]);
    const memberships=await pool.query("SELECT sm.scheme_id,s.name AS scheme_name,sm.role FROM scheme_memberships sm JOIN schemes s ON s.id=sm.scheme_id WHERE sm.user_id=$1 ORDER BY s.name",[user.id]);
    res.json({data:{token,expires_at:expires.toISOString(),user:{id:user.id,display_name:user.display_name,email:user.email},memberships:memberships.rows}});
  }catch(error){next(error);}
});
app.post("/api/auth/logout",requireAuth,async(req,res,next)=>{
  try{await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1",[req.tokenHash]);res.json({data:{logged_out:true}});}catch(error){next(error);}
});
app.get("/api/auth/me",requireAuth,async(req,res,next)=>{
  try{const memberships=await pool.query("SELECT sm.scheme_id,s.name AS scheme_name,sm.role FROM scheme_memberships sm JOIN schemes s ON s.id=sm.scheme_id WHERE sm.user_id=$1 ORDER BY s.name",[req.user.id]);res.json({data:{user:req.user,memberships:memberships.rows}});}catch(error){next(error);}
});
app.post("/api/auth/users",requireAuth,async(req,res,next)=>{
  const {display_name,email,password,scheme_id,role}=req.body||{};
  const sid=Number(scheme_id);
  if(typeof display_name!=="string"||display_name.trim().length<2||typeof email!=="string"||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=="string"||password.length<12||!Number.isSafeInteger(sid)||sid<=0||!["farmer","irrigation_officer"].includes(role))return res.status(400).json({error:"Provide valid account details, scheme and role. Password must be at least 12 characters."});
  try{
    const access=await pool.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,sid]);
    if(!access.rows.some(x=>x.role==="irrigation_officer"))return res.status(403).json({error:"Only an officer assigned to this scheme can create its users."});
    const salt=crypto.randomBytes(16).toString("hex");
    const user=await pool.query("INSERT INTO app_users(display_name,email,password_salt,password_hash) VALUES($1,$2,$3,$4) RETURNING id,display_name,email",[display_name.trim(),email.trim().toLowerCase(),salt,hashPassword(password,salt)]);
    await pool.query("INSERT INTO scheme_memberships(user_id,scheme_id,role) VALUES($1,$2,$3)",[user.rows[0].id,sid,role]);
    res.status(201).json({data:{...user.rows[0],scheme_id:sid,role}});
  }catch(error){if(error.code==="23505")return res.status(409).json({error:"An account with that email already exists."});if(error.code==="23503")return res.status(400).json({error:"The selected scheme does not exist."});next(error);}
});

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
      "wp.gross_volume_m3_per_day, wp.calculation_method, wp.assumptions, wp.data_source, wp.planned_for, wp.status, wp.review_comment, wp.revision_number, wp.submitted_at, wp.reviewed_at, wp.created_at " +
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



app.post("/api/water-plans/:id/revise",requireAuth,async(req,res,next)=>{
  const id=Number(req.params.id),depth=Number(req.body.target_depth_mm_per_day),efficiency=Number(req.body.application_efficiency_percent);
  const assumptions=typeof req.body.assumptions==="string"?req.body.assumptions.trim():"";
  const plannedFor=req.body.planned_for;
  if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(depth)||depth<0||depth>1000||!Number.isFinite(efficiency)||efficiency<=0||efficiency>100)return res.status(400).json({error:"Enter a valid plan ID, target depth and efficiency."});
  if(plannedFor!==undefined&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(plannedFor)))return res.status(400).json({error:"planned_for must use YYYY-MM-DD format."});
  try{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("SELECT wp.id,wp.status,wp.created_by,wp.field_id,f.scheme_id,f.area_hectares FROM water_plans wp JOIN fields f ON f.id=wp.field_id WHERE wp.id=$1 FOR UPDATE",[id]);
      if(!found.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Water plan not found."});}
      const plan=found.rows[0],member=await client.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,plan.scheme_id]);
      if(Number(plan.created_by)!==Number(req.user.id)||!member.rows.some(x=>x.role==="farmer")){await client.query("ROLLBACK");return res.status(403).json({error:"Only the farmer who submitted this plan can revise it."});}
      if(plan.status!=="changes_requested"){await client.query("ROLLBACK");return res.status(409).json({error:"Only a plan returned for changes can be revised."});}
      const net=Number((Number(plan.area_hectares)*depth*10).toFixed(3)),gross=Number((net/(efficiency/100)).toFixed(3));
      const result=await client.query("UPDATE water_plans SET target_depth_mm_per_day=$2,application_efficiency_percent=$3,net_volume_m3_per_day=$4,gross_volume_m3_per_day=$5,assumptions=$6,planned_for=COALESCE($7::date,planned_for),status='draft',revision_number=revision_number+1,submitted_at=NULL,reviewed_at=NULL,reviewed_by=NULL,review_comment=NULL WHERE id=$1 RETURNING id,status,revision_number,target_depth_mm_per_day,application_efficiency_percent,net_volume_m3_per_day,gross_volume_m3_per_day,planned_for",[id,depth,efficiency,net,gross,assumptions||null,plannedFor||null]);
      await client.query("COMMIT");res.json({data:result.rows[0],message:"Revision saved as a draft. Submit it again for review."});
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }catch(error){next(error);}
});

app.post("/api/water-plans/:id/submit",requireAuth,async(req,res,next)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Invalid water plan ID."});
  try{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("SELECT wp.*,f.scheme_id FROM water_plans wp JOIN fields f ON f.id=wp.field_id WHERE wp.id=$1 FOR UPDATE",[id]);
      if(!found.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Water plan not found."});}
      const plan=found.rows[0],membership=await client.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,plan.scheme_id]);
      if(!membership.rows.some(x=>x.role==="farmer")){await client.query("ROLLBACK");return res.status(403).json({error:"Only a farmer assigned to this scheme can submit this plan."});}
      if(!["draft","changes_requested"].includes(plan.status)){await client.query("ROLLBACK");return res.status(409).json({error:"Only draft plans or plans returned for changes can be submitted."});}
      await client.query("UPDATE water_plans SET status='submitted',created_by=COALESCE(created_by,$2),submitted_at=NOW(),reviewed_at=NULL,reviewed_by=NULL,review_comment=NULL WHERE id=$1",[id,req.user.id]);
      await client.query("COMMIT");res.json({data:{id,status:"submitted"}});
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }catch(error){next(error);}
});
app.get("/api/water-plans/review-queue",requireAuth,async(req,res,next)=>{
  const schemeId=Number(req.query.scheme_id);if(!Number.isSafeInteger(schemeId)||schemeId<=0)return res.status(400).json({error:"A valid scheme_id is required."});
  try{
    const membership=await pool.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,schemeId]);
    if(!membership.rows.some(x=>x.role==="irrigation_officer"))return res.status(403).json({error:"Only an officer assigned to this scheme can review plans."});
    const result=await pool.query("SELECT wp.id,wp.field_id,f.field_code,f.crop_name,f.area_hectares,s.name AS scheme_name,wp.target_depth_mm_per_day,wp.application_efficiency_percent,wp.net_volume_m3_per_day,wp.gross_volume_m3_per_day,wp.assumptions,wp.planned_for,wp.status,wp.submitted_at,wp.revision_number,u.display_name AS submitted_by FROM water_plans wp JOIN fields f ON f.id=wp.field_id JOIN schemes s ON s.id=f.scheme_id LEFT JOIN app_users u ON u.id=wp.created_by WHERE f.scheme_id=$1 AND wp.status IN ('submitted','under_review') ORDER BY wp.submitted_at ASC",[schemeId]);
    res.json({data:result.rows});
  }catch(error){next(error);}
});
app.post("/api/water-plans/:id/review",requireAuth,async(req,res,next)=>{
  const id=Number(req.params.id),decision=req.body.decision,comment=typeof req.body.comment==="string"?req.body.comment.trim():"";
  if(!Number.isSafeInteger(id)||id<=0||!["under_review","approved","changes_requested","rejected"].includes(decision)||comment.length>2000)return res.status(400).json({error:"Provide a valid decision and a comment of at most 2000 characters."});
  if(["changes_requested","rejected"].includes(decision)&&comment.length<3)return res.status(400).json({error:"A clear reason is required for changes requested or rejection."});
  try{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("SELECT wp.id,wp.status,wp.revision_number,f.scheme_id,wp.created_by FROM water_plans wp JOIN fields f ON f.id=wp.field_id WHERE wp.id=$1 FOR UPDATE",[id]);
      if(!found.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Water plan not found."});}
      const plan=found.rows[0],membership=await client.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,plan.scheme_id]);
      if(!membership.rows.some(x=>x.role==="irrigation_officer")){await client.query("ROLLBACK");return res.status(403).json({error:"Only an assigned irrigation officer can review this plan."});}
      if(Number(plan.created_by)===Number(req.user.id)){await client.query("ROLLBACK");return res.status(403).json({error:"You cannot review a plan you submitted yourself."});}
      if(!["submitted","under_review"].includes(plan.status)){await client.query("ROLLBACK");return res.status(409).json({error:"This plan is not awaiting review."});}
      await client.query("UPDATE water_plans SET status=$2,reviewed_at=CASE WHEN $2='under_review' THEN NULL ELSE NOW() END,reviewed_by=CASE WHEN $2='under_review' THEN NULL ELSE $3 END,review_comment=$4 WHERE id=$1",[id,decision,req.user.id,comment||null]);
      await client.query("INSERT INTO water_plan_reviews(water_plan_id,reviewer_id,decision,comment,plan_revision) VALUES($1,$2,$3,$4,$5)",[id,req.user.id,decision,comment||null,plan.revision_number]);
      await client.query("COMMIT");res.json({data:{id,status:decision,reviewed_by:req.user.id}});
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }catch(error){next(error);}
});
app.get("/api/water-plans/:id/reviews",requireAuth,async(req,res,next)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Invalid water plan ID."});
  try{
    const access=await pool.query("SELECT f.scheme_id FROM water_plans wp JOIN fields f ON f.id=wp.field_id WHERE wp.id=$1",[id]);
    if(!access.rows.length)return res.status(404).json({error:"Water plan not found."});
    const member=await pool.query("SELECT 1 FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,access.rows[0].scheme_id]);
    if(!member.rows.length)return res.status(403).json({error:"You are not assigned to this scheme."});
    const result=await pool.query("SELECT r.id,r.decision,r.comment,r.plan_revision,r.created_at,u.display_name AS reviewer FROM water_plan_reviews r JOIN app_users u ON u.id=r.reviewer_id WHERE r.water_plan_id=$1 ORDER BY r.created_at",[id]);
    res.json({data:result.rows});
  }catch(error){next(error);}
});
app.post("/api/water-plans/:id/irrigation-events",requireAuth,async(req,res,next)=>{
  const id=Number(req.params.id),volume=Number(req.body.actual_volume_m3),appliedOn=req.body.applied_on,notes=typeof req.body.notes==="string"?req.body.notes.trim():"";
  if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(volume)||volume<0||volume>100000000000||notes.length>2000)return res.status(400).json({error:"Enter a valid plan, actual volume and optional notes."});
  if(appliedOn&&!Number.isFinite(Date.parse(appliedOn)))return res.status(400).json({error:"applied_on must be a valid date/time."});
  try{
    const plan=await pool.query("SELECT wp.status,wp.field_id,f.scheme_id FROM water_plans wp JOIN fields f ON f.id=wp.field_id WHERE wp.id=$1",[id]);
    if(!plan.rows.length)return res.status(404).json({error:"Water plan not found."});
    if(plan.rows[0].status!=="approved"&&plan.rows[0].status!=="completed")return res.status(409).json({error:"Actual irrigation can only be recorded against an approved plan."});
    const member=await pool.query("SELECT role FROM scheme_memberships WHERE user_id=$1 AND scheme_id=$2",[req.user.id,plan.rows[0].scheme_id]);
    if(!member.rows.length)return res.status(403).json({error:"You are not assigned to this scheme."});
    const result=await pool.query("INSERT INTO irrigation_events(water_plan_id,field_id,recorded_by,applied_on,actual_volume_m3,notes) VALUES($1,$2,$3,COALESCE($4::timestamptz,NOW()),$5,$6) RETURNING id,water_plan_id,field_id,applied_on,actual_volume_m3,notes,created_at",[id,plan.rows[0].field_id,req.user.id,appliedOn||null,volume,notes||null]);
    await pool.query("UPDATE water_plans SET status='completed' WHERE id=$1",[id]);
    res.status(201).json({data:result.rows[0]});
  }catch(error){next(error);}
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
