import pg from "pg";

const { Client } = pg;

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
    
    // Disable triggers/constraints temporarily on target database for smooth insert
    console.log("Temporarily disabling constraints and truncating tables in target database...");
    await targetClient.query("SET CONSTRAINTS ALL DEFERRED");
    
    // Truncate tables in reverse order to clear any target data cleanly
    for (const table of [...TABLES].reverse()) {
      try {
        await targetClient.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`Truncated target table: ${table}`);
      } catch (err) {
        console.log(`Warning: Could not truncate ${table} (it might not exist yet):`, err.message);
      }
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
