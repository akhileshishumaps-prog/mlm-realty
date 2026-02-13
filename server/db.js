import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "mlm-realty.db");
const SCHEMA_PATH = path.resolve(__dirname, "schema.sql");
const DATABASE_URL = process.env.DATABASE_URL;
const sanitizeDatabaseUrl = (raw) => {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch (_err) {
    return raw;
  }
};
const USE_POSTGRES = Boolean(DATABASE_URL);

export const openDb = () => {
  if (USE_POSTGRES) {
    const sslOption =
      process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };
    const pool = new Pool({
      connectionString: sanitizeDatabaseUrl(DATABASE_URL),
      ssl: sslOption,
    });
    return { mode: "postgres", pool };
  }
  const sqlite = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Failed to open database", err);
    }
  });
  return { mode: "sqlite", sqlite };
};

const loadSchemaStatements = () => {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  return schema
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .filter((stmt) => !stmt.toUpperCase().startsWith("PRAGMA"));
};

export const initDb = async (db) => {
  if (db.mode === "sqlite") {
    const sqlite = db.sqlite;
    sqlite.serialize(() => {
      sqlite.exec(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;",
        (err) => {
          if (err) {
            console.error("Failed to set sqlite pragmas", err);
          }
        }
      );
      const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
      sqlite.exec(schema, (err) => {
        if (err) {
          console.error("Failed to apply schema", err);
        }
      });
      sqlite.run("ALTER TABLE people ADD COLUMN sponsor_stage INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sponsor_stage column", err);
        }
      });
      sqlite.run("ALTER TABLE people ADD COLUMN status TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add people status column", err);
        }
      });
      sqlite.run("ALTER TABLE people ADD COLUMN is_special INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add people is_special column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN paid_amount INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add paid_amount column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN paid_date TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add paid_date column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN area_sq_yd INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add area_sq_yd column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN actual_area_sq_yd REAL", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add actual_area_sq_yd column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN buyback_months INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add buyback_months column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN return_percent INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add return_percent column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN payment_status TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add investment payment_status column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN cancelled_at TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add investment cancelled_at column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN project_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add investment project_id column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN block_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add investment block_id column", err);
        }
      });
      sqlite.run("ALTER TABLE investments ADD COLUMN property_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add investment property_id column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN status TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales status column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN cancelled_at TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add cancelled_at column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN actual_area_sq_yd REAL", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales actual_area_sq_yd column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN customer_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales customer_id column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_enabled INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_enabled column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_months INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_months column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_return_percent INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_return_percent column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_date TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_date column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_status TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_status column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_paid_amount INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_paid_amount column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN buyback_paid_date TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales buyback_paid_date column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN project_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales project_id column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN block_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales block_id column", err);
        }
      });
      sqlite.run("ALTER TABLE sales ADD COLUMN property_id TEXT", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add sales property_id column", err);
        }
      });
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          pincode TEXT NOT NULL,
          address TEXT NOT NULL,
          total_area INTEGER,
          total_value INTEGER,
          created_at TEXT NOT NULL
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create projects table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS project_blocks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          total_properties INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create project_blocks table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS project_properties (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          block_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'available',
          last_sale_id TEXT,
          last_investment_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (block_id) REFERENCES project_blocks(id)
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create project_properties table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS investment_payments (
          id TEXT PRIMARY KEY,
          investment_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          date TEXT NOT NULL,
          FOREIGN KEY (investment_id) REFERENCES investments(id)
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create investment_payments table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          address TEXT,
          created_at TEXT NOT NULL
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create customers table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS pincodes (
          pincode TEXT NOT NULL,
          office_name TEXT,
          district TEXT,
          state TEXT NOT NULL,
          state_key TEXT NOT NULL,
          name_key TEXT,
          district_key TEXT
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create pincodes table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          permissions_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_login TEXT,
          active INTEGER NOT NULL DEFAULT 1
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create users table", err);
          }
        }
      );
      sqlite.run("ALTER TABLE users ADD COLUMN active INTEGER", (err) => {
        if (err && !err.message.includes("duplicate column")) {
          console.error("Failed to add users active column", err);
        }
      });
      sqlite.run("UPDATE users SET active = 1 WHERE active IS NULL", (err) => {
        if (err && !err.message.includes("no such column")) {
          console.error("Failed to backfill users active", err);
        }
      });
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          phone TEXT,
          join_date TEXT NOT NULL,
          monthly_salary INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create employees table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS salary_payments (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          month TEXT NOT NULL,
          amount INTEGER NOT NULL,
          paid_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (employee_id) REFERENCES employees(id)
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create salary_payments table", err);
          }
        }
      );
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS commission_config_history (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          level_rates_json TEXT NOT NULL,
          personal_rates_json TEXT NOT NULL
        )`,
        (err) => {
          if (err) {
            console.error("Failed to create commission_config_history table", err);
          }
        }
      );
      sqlite.run("UPDATE sales SET status = 'active' WHERE status IS NULL", (err) => {
        if (err) {
          console.error("Failed to backfill sales status", err);
        }
      });
      sqlite.run(
        "UPDATE people SET status = 'active' WHERE status IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill people status", err);
          }
        }
      );
      sqlite.run(
        "UPDATE people SET is_special = 0 WHERE is_special IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill people is_special", err);
          }
        }
      );
      sqlite.run(
        "UPDATE people SET sponsor_stage = 1 WHERE sponsor_stage IS NULL AND sponsor_id IS NOT NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill sponsor_stage", err);
          }
        }
      );
      sqlite.run(
        "UPDATE investments SET return_percent = 200 WHERE return_percent IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill return_percent", err);
          }
        }
      );
      sqlite.run(
        "UPDATE investments SET payment_status = 'pending' WHERE payment_status IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill investment payment_status", err);
          }
        }
      );
      sqlite.run(
        "UPDATE sales SET buyback_enabled = 0 WHERE buyback_enabled IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill sales buyback_enabled", err);
          }
        }
      );
      sqlite.run(
        "UPDATE sales SET buyback_status = 'pending' WHERE buyback_status IS NULL",
        (err) => {
          if (err) {
            console.error("Failed to backfill sales buyback_status", err);
          }
        }
      );
      sqlite.run(
        "INSERT OR IGNORE INTO app_config (key, value) VALUES ('commission_config', ?)",
        [
          JSON.stringify({
            levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
            personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
          }),
        ],
        (err) => {
          if (err) {
            console.error("Failed to seed commission config", err);
          }
        }
      );
      sqlite.get(
        "SELECT COUNT(*) as count FROM commission_config_history",
        (countErr, countRow) => {
          if (countErr) {
            console.error("Failed to check commission config history", countErr);
            return;
          }
          if ((countRow?.count || 0) > 0) return;
          sqlite.get(
            "SELECT value FROM app_config WHERE key = 'commission_config'",
            (configErr, configRow) => {
              if (configErr) {
                console.error("Failed to read commission config", configErr);
                return;
              }
              let config;
              try {
                config = configRow?.value ? JSON.parse(configRow.value) : null;
              } catch {
                config = null;
              }
              const fallback = {
                levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
                personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
              };
              const base = config || fallback;
              sqlite.run(
                `INSERT INTO commission_config_history (id, created_at, level_rates_json, personal_rates_json)
                 VALUES (lower(hex(randomblob(16))), ?, ?, ?)`,
                [
                  new Date().toISOString(),
                  JSON.stringify(base.levelRates || fallback.levelRates),
                  JSON.stringify(base.personalRates || fallback.personalRates),
                ],
                (insertErr) => {
                  if (insertErr) {
                    console.error("Failed to seed commission config history", insertErr);
                  }
                }
              );
            }
          );
        }
      );

      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)",
        (err) => {
          if (err) console.error("Failed to create idx_people_name", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_pincodes_state ON pincodes(state_key)",
        (err) => {
          if (err) console.error("Failed to create idx_pincodes_state", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_pincodes_pin ON pincodes(pincode)",
        (err) => {
          if (err) console.error("Failed to create idx_pincodes_pin", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_people_sponsor ON people(sponsor_id)",
        (err) => {
          if (err) console.error("Failed to create idx_people_sponsor", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_investments_person ON investments(person_id)",
        (err) => {
          if (err) console.error("Failed to create idx_investments_person", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_investments_payment_status ON investments(payment_status)",
        (err) => {
          if (err) console.error("Failed to create idx_investments_payment_status", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date)",
        (err) => {
          if (err) console.error("Failed to create idx_investments_date", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id)",
        (err) => {
          if (err) console.error("Failed to create idx_sales_seller", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)",
        (err) => {
          if (err) console.error("Failed to create idx_sales_date", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id)",
        (err) => {
          if (err) console.error("Failed to create idx_payments_sale", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
        (err) => {
          if (err) console.error("Failed to create idx_activity_created", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        (err) => {
          if (err) console.error("Failed to create idx_users_username", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)",
        (err) => {
          if (err) console.error("Failed to create idx_projects_name", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_project_props_project ON project_properties(project_id)",
        (err) => {
          if (err) console.error("Failed to create idx_project_props_project", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_project_props_block ON project_properties(block_id)",
        (err) => {
          if (err) console.error("Failed to create idx_project_props_block", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_project_props_status ON project_properties(status)",
        (err) => {
          if (err) console.error("Failed to create idx_project_props_status", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_investment_payments_investment ON investment_payments(investment_id)",
        (err) => {
          if (err) console.error("Failed to create idx_investment_payments_investment", err);
        }
      );
      sqlite.run(
        "CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)",
        (err) => {
          if (err) console.error("Failed to create idx_customers_phone", err);
        }
      );
    });
    return;
  }

  const statements = loadSchemaStatements();
  for (const stmt of statements) {
    await db.pool.query(stmt);
  }

  await db.pool.query(
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

  const migrations = [
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS sponsor_stage INTEGER",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS status TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS is_special INTEGER",
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
    await db.pool.query(stmt);
  }

  await db.pool.query("UPDATE users SET active = 1 WHERE active IS NULL");
  await db.pool.query("UPDATE sales SET status = 'active' WHERE status IS NULL");
  await db.pool.query("UPDATE people SET status = 'active' WHERE status IS NULL");
  await db.pool.query("UPDATE people SET is_special = 0 WHERE is_special IS NULL");
  await db.pool.query(
    "UPDATE people SET sponsor_stage = 1 WHERE sponsor_stage IS NULL AND sponsor_id IS NOT NULL"
  );
  await db.pool.query(
    "UPDATE investments SET return_percent = 200 WHERE return_percent IS NULL"
  );
  await db.pool.query(
    "UPDATE investments SET payment_status = 'pending' WHERE payment_status IS NULL"
  );
  await db.pool.query(
    "UPDATE sales SET buyback_enabled = 0 WHERE buyback_enabled IS NULL"
  );
  await db.pool.query(
    "UPDATE sales SET buyback_status = 'pending' WHERE buyback_status IS NULL"
  );

  await db.pool.query(
    "INSERT INTO app_config (key, value) VALUES ('commission_config', $1) ON CONFLICT (key) DO NOTHING",
    [
      JSON.stringify({
        levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
        personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
      }),
    ]
  );

  const countResult = await db.pool.query(
    "SELECT COUNT(*)::int AS count FROM commission_config_history"
  );
  if ((countResult.rows[0]?.count || 0) === 0) {
    const configResult = await db.pool.query(
      "SELECT value FROM app_config WHERE key = 'commission_config'"
    );
    let config;
    try {
      config = configResult.rows[0]?.value
        ? JSON.parse(configResult.rows[0].value)
        : null;
    } catch {
      config = null;
    }
    const fallback = {
      levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
      personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
    };
    const base = config || fallback;
    await db.pool.query(
      `INSERT INTO commission_config_history (id, created_at, level_rates_json, personal_rates_json)
       VALUES ($1, $2, $3, $4)`,
      [
        randomUUID(),
        new Date().toISOString(),
        JSON.stringify(base.levelRates || fallback.levelRates),
        JSON.stringify(base.personalRates || fallback.personalRates),
      ]
    );
  }

  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)",
    "CREATE INDEX IF NOT EXISTS idx_pincodes_state ON pincodes(state_key)",
    "CREATE INDEX IF NOT EXISTS idx_pincodes_pin ON pincodes(pincode)",
    "CREATE INDEX IF NOT EXISTS idx_people_sponsor ON people(sponsor_id)",
    "CREATE INDEX IF NOT EXISTS idx_investments_person ON investments(person_id)",
    "CREATE INDEX IF NOT EXISTS idx_investments_payment_status ON investments(payment_status)",
    "CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date)",
    "CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id)",
    "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)",
    "CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id)",
    "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    "CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)",
    "CREATE INDEX IF NOT EXISTS idx_project_props_project ON project_properties(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_project_props_block ON project_properties(block_id)",
    "CREATE INDEX IF NOT EXISTS idx_project_props_status ON project_properties(status)",
    "CREATE INDEX IF NOT EXISTS idx_investment_payments_investment ON investment_payments(investment_id)",
    "CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)",
  ];

  for (const stmt of indexStatements) {
    await db.pool.query(stmt);
  }
};
