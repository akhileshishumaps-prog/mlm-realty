PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sponsor_id TEXT,
  sponsor_stage INTEGER,
  phone TEXT,
  join_date TEXT NOT NULL,
  FOREIGN KEY (sponsor_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  stage INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  area_sq_yd INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  buyback_date TEXT NOT NULL,
  buyback_months INTEGER NOT NULL DEFAULT 36,
  return_percent INTEGER NOT NULL DEFAULT 200,
  project_id TEXT,
  block_id TEXT,
  property_id TEXT,
  status TEXT NOT NULL,
  paid_amount INTEGER,
  paid_date TEXT,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  location TEXT NOT NULL,
  area_sq_yd INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  sale_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  cancelled_at TEXT,
  project_id TEXT,
  block_id TEXT,
  property_id TEXT,
  FOREIGN KEY (seller_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  address TEXT NOT NULL,
  total_area INTEGER,
  total_value INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_blocks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  total_properties INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_properties (
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
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS commission_payments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  join_date TEXT NOT NULL,
  monthly_salary INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commission_config_history (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  level_rates_json TEXT NOT NULL,
  personal_rates_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT,
  undo_payload_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
