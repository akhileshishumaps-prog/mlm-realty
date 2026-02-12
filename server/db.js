import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "mlm-realty.db");
const SCHEMA_PATH = path.resolve(__dirname, "schema.sql");

export const openDb = () =>
  new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Failed to open database", err);
    }
  });

export const initDb = (db) => {
  db.serialize(() => {
    db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;",
      (err) => {
        if (err) {
          console.error("Failed to set sqlite pragmas", err);
        }
      }
    );
    const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schema, (err) => {
      if (err) {
        console.error("Failed to apply schema", err);
      }
    });
    db.run("ALTER TABLE people ADD COLUMN sponsor_stage INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sponsor_stage column", err);
      }
    });
    db.run("ALTER TABLE people ADD COLUMN status TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add people status column", err);
      }
    });
    db.run("ALTER TABLE people ADD COLUMN is_special INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add people is_special column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN paid_amount INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add paid_amount column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN paid_date TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add paid_date column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN area_sq_yd INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add area_sq_yd column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN actual_area_sq_yd REAL", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add actual_area_sq_yd column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN buyback_months INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add buyback_months column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN return_percent INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add return_percent column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN payment_status TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add investment payment_status column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN cancelled_at TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add investment cancelled_at column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN project_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add investment project_id column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN block_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add investment block_id column", err);
      }
    });
    db.run("ALTER TABLE investments ADD COLUMN property_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add investment property_id column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN status TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales status column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN cancelled_at TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add cancelled_at column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN actual_area_sq_yd REAL", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales actual_area_sq_yd column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN customer_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales customer_id column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_enabled INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_enabled column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_months INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_months column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_return_percent INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_return_percent column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_date TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_date column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_status TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_status column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_paid_amount INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_paid_amount column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN buyback_paid_date TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales buyback_paid_date column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN project_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales project_id column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN block_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales block_id column", err);
      }
    });
    db.run("ALTER TABLE sales ADD COLUMN property_id TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add sales property_id column", err);
      }
    });
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run("ALTER TABLE users ADD COLUMN active INTEGER", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Failed to add users active column", err);
      }
    });
    db.run("UPDATE users SET active = 1 WHERE active IS NULL", (err) => {
      if (err && !err.message.includes("no such column")) {
        console.error("Failed to backfill users active", err);
      }
    });
    db.run(
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
    db.run(
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
    db.run(
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
    db.run("UPDATE sales SET status = 'active' WHERE status IS NULL", (err) => {
      if (err) {
        console.error("Failed to backfill sales status", err);
      }
    });
    db.run(
      "UPDATE people SET status = 'active' WHERE status IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill people status", err);
        }
      }
    );
    db.run(
      "UPDATE people SET is_special = 0 WHERE is_special IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill people is_special", err);
        }
      }
    );
    db.run(
      "UPDATE people SET sponsor_stage = 1 WHERE sponsor_stage IS NULL AND sponsor_id IS NOT NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill sponsor_stage", err);
        }
      }
    );
    db.run(
      "UPDATE investments SET return_percent = 200 WHERE return_percent IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill return_percent", err);
        }
      }
    );
    db.run(
      "UPDATE investments SET payment_status = 'pending' WHERE payment_status IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill investment payment_status", err);
        }
      }
    );
    db.run(
      "UPDATE sales SET buyback_enabled = 0 WHERE buyback_enabled IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill sales buyback_enabled", err);
        }
      }
    );
    db.run(
      "UPDATE sales SET buyback_status = 'pending' WHERE buyback_status IS NULL",
      (err) => {
        if (err) {
          console.error("Failed to backfill sales buyback_status", err);
        }
      }
    );
    db.run(
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
    db.get(
      "SELECT COUNT(*) as count FROM commission_config_history",
      (countErr, countRow) => {
        if (countErr) {
          console.error("Failed to check commission config history", countErr);
          return;
        }
        if ((countRow?.count || 0) > 0) return;
        db.get(
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
            db.run(
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

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)",
      (err) => {
        if (err) console.error("Failed to create idx_people_name", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_pincodes_state ON pincodes(state_key)",
      (err) => {
        if (err) console.error("Failed to create idx_pincodes_state", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_pincodes_pin ON pincodes(pincode)",
      (err) => {
        if (err) console.error("Failed to create idx_pincodes_pin", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_people_sponsor ON people(sponsor_id)",
      (err) => {
        if (err) console.error("Failed to create idx_people_sponsor", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_investments_person ON investments(person_id)",
      (err) => {
        if (err) console.error("Failed to create idx_investments_person", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_investments_payment_status ON investments(payment_status)",
      (err) => {
        if (err) console.error("Failed to create idx_investments_payment_status", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date)",
      (err) => {
        if (err) console.error("Failed to create idx_investments_date", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id)",
      (err) => {
        if (err) console.error("Failed to create idx_sales_seller", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)",
      (err) => {
        if (err) console.error("Failed to create idx_sales_date", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id)",
      (err) => {
        if (err) console.error("Failed to create idx_payments_sale", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
      (err) => {
        if (err) console.error("Failed to create idx_activity_created", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
      (err) => {
        if (err) console.error("Failed to create idx_users_username", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)",
      (err) => {
        if (err) console.error("Failed to create idx_projects_name", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_project_props_project ON project_properties(project_id)",
      (err) => {
        if (err) console.error("Failed to create idx_project_props_project", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_project_props_block ON project_properties(block_id)",
      (err) => {
        if (err) console.error("Failed to create idx_project_props_block", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_project_props_status ON project_properties(status)",
      (err) => {
        if (err) console.error("Failed to create idx_project_props_status", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_investment_payments_investment ON investment_payments(investment_id)",
      (err) => {
        if (err) console.error("Failed to create idx_investment_payments_investment", err);
      }
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)",
      (err) => {
        if (err) console.error("Failed to create idx_customers_phone", err);
      }
    );
  });
};
