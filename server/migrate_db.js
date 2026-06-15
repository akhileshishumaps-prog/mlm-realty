import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, "schema.sql");

// Fetch URLs from environment variables
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;
const NEW_DATABASE_URL = process.env.NEW_DATABASE_URL;

if (!OLD_DATABASE_URL || !NEW_DATABASE_URL) {
  console.error("Error: Please set OLD_DATABASE_URL and NEW_DATABASE_URL environment variables.");
  process.exit(1);
}

// We will migrate tables in dependency order
const TABLES = [
  "people",
  "customers",
  "projects",
  "project_blocks",
  "project_properties",
  "sales",
  "payments",
  "investments",
  "investment_payments",
  "commission_payments",
  "employees",
  "salary_payments",
  "users",
  "app_config",
  "commission_config_history",
  "activity_logs",
  "pincodes"
];

const loadSchemaStatements = () => {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  return schema
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .filter((stmt) => !stmt.toUpperCase().startsWith("PRAGMA"));
};

async function migrate() {
  console.log("Starting migration process...");
  
  // Set up connection clients
  const sourceClient = new Client({
    connectionString: OLD_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  const targetClient = new Client({
    connectionString: NEW_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await sourceClient.connect();
    console.log("Connected to SOURCE (DigitalOcean) database.");
    
    await targetClient.connect();
    console.log("Connected to TARGET (Neon) database.");
    
    // --- STEP 1: INITIALIZE SCHEMA ON TARGET DATABASE ---
    console.log("Initializing database schema on target database...");
    const statements = loadSchemaStatements();
    for (const stmt of statements) {
      await targetClient.query(stmt);
    }
    
    // Create pincodes table if not exists
    await targetClient.query(
      `CREATE TABLE IF NOT EXISTS pincodes (
        pincode TEXT NOT NULL,
        office_name TEXT,
        district TEXT,
        state TEXT NOT NULL,
        state_key TEXT NOT NULL,
        name_key TEXT,
        district_key TEXT
      )`
    );
    
    // Run schema migrations to add columns if they don't exist
    const migrations = [
      "ALTER TABLE people ADD COLUMN IF NOT EXISTS sponsor_stage INTEGER",
      "ALTER TABLE people ADD COLUMN IF NOT EXISTS status TEXT",
      "ALTER TABLE people ADD COLUMN IF NOT EXISTS is_special INTEGER",
      "ALTER TABLE people ADD COLUMN IF NOT EXISTS address TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS paid_amount INTEGER",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS paid_date TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS area_sq_yd INTEGER",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS actual_area_sq_yd REAL",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS buyback_months INTEGER",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS return_percent INTEGER",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS payment_status TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS cancelled_at TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS project_id TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS block_id TEXT",
      "ALTER TABLE investments ADD COLUMN IF NOT EXISTS property_id TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS actual_area_sq_yd REAL",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_enabled INTEGER",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_months INTEGER",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_return_percent INTEGER",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_date TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_status TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_paid_amount INTEGER",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyback_paid_date TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS project_id TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS block_id TEXT",
      "ALTER TABLE sales ADD COLUMN IF NOT EXISTS property_id TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS active INTEGER",
    ];

    for (const stmt of migrations) {
      await targetClient.query(stmt);
    }
    console.log("Schema initialization and migrations completed on target database.");
    
    // --- STEP 2: TRUNCATE AND COPY DATA ---
    console.log("Temporarily disabling constraints and truncating tables in target database...");
    await targetClient.query("SET CONSTRAINTS ALL DEFERRED");
    
    // Truncate tables in reverse order to clear any target data cleanly
    for (const table of [...TABLES].reverse()) {
      await targetClient.query(`TRUNCATE TABLE ${table} CASCADE`);
      console.log(`Truncated target table: ${table}`);
    }
    
    // Copy data table-by-table
    for (const table of TABLES) {
      console.log(`Migrating table: ${table}...`);
      
      // 1. Fetch data from source
      let sourceRowsResult;
      try {
        sourceRowsResult = await sourceClient.query(`SELECT * FROM ${table}`);
      } catch (err) {
        console.log(`Table ${table} does not exist in source database or failed to query. Skipping.`);
        continue;
      }
      
      const rows = sourceRowsResult.rows;
      console.log(`Found ${rows.length} rows in source table: ${table}`);
      
      if (rows.length === 0) {
        continue;
      }
      
      // 2. Insert into target
      const columns = Object.keys(rows[0]);
      const columnNames = columns.join(", ");
      
      // Build batch insert query
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const insertQuery = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`;
        
        await targetClient.query(insertQuery, values);
      }
      
      console.log(`Successfully migrated ${rows.length} rows into target table: ${table}`);
    }
    
    console.log("\nMigration completed successfully! 🎉");
    
  } catch (err) {
    console.error("Migration failed with error:", err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
    console.log("Database connections closed.");
  }
}

migrate();
