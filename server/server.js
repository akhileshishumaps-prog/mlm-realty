import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { openDb, initDb } from "./db.js";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import {
  calculateCommissionSummary,
  buildPeopleIndex,
  getStageSummary,
  getDownlineDepth,
  toPeopleModel,
  toSalesModel,
} from "./analytics.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.disable("x-powered-by");

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes("*");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowAllOrigins) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json());

const cacheStore = new Map();
const DEFAULT_CACHE_TTL = 20000;

const PINCODE_DATA_PATH = path.join(
  process.cwd(),
  "node_modules",
  "india-pincode-lookup",
  "pincodes.json"
);
let pincodeSeedPromise = null;

const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const titleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizePhone = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .trim();

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const ensurePincodeSeeded = async () => {
  if (pincodeSeedPromise) return pincodeSeedPromise;
  pincodeSeedPromise = (async () => {
    try {
      const existing = await getAsync("SELECT COUNT(1) AS count FROM pincodes");
      if (Number(existing?.count || 0) > 0) return;
      if (!fs.existsSync(PINCODE_DATA_PATH)) {
        console.warn("Pincode data file not found:", PINCODE_DATA_PATH);
        return;
      }
      const raw = fs.readFileSync(PINCODE_DATA_PATH, "utf8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || !data.length) return;
      const insertSql =
        "INSERT INTO pincodes (pincode, office_name, district, state, state_key, name_key, district_key) VALUES (?, ?, ?, ?, ?, ?, ?)";
      if (isPostgres) {
        const client = await db.pool.connect();
        try {
          await client.query("BEGIN");
          for (const entry of data) {
            if (!entry || !entry.stateName || !entry.pincode) continue;
            const stateKey = normalizeKey(entry.stateName);
            if (!stateKey) continue;
            await client.query(replacePlaceholders(insertSql), [
              String(entry.pincode),
              entry.officeName || "",
              entry.districtName || "",
              titleCase(entry.stateName),
              stateKey,
              normalizeKey(entry.officeName || ""),
              normalizeKey(entry.districtName || ""),
            ]);
          }
          await client.query("COMMIT");
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackErr) {
            console.error("Failed to rollback pincode seed", rollbackErr);
          }
          throw err;
        } finally {
          client.release();
        }
      } else {
        await runAsync("BEGIN TRANSACTION");
        const stmt = db.sqlite.prepare(insertSql);
        for (const entry of data) {
          if (!entry || !entry.stateName || !entry.pincode) continue;
          const stateKey = normalizeKey(entry.stateName);
          if (!stateKey) continue;
          stmt.run(
            String(entry.pincode),
            entry.officeName || "",
            entry.districtName || "",
            titleCase(entry.stateName),
            stateKey,
            normalizeKey(entry.officeName || ""),
            normalizeKey(entry.districtName || "")
          );
        }
        await new Promise((resolve, reject) =>
          stmt.finalize((err) => (err ? reject(err) : resolve()))
        );
        await runAsync("COMMIT");
      }
      console.log("Seeded pincodes table.");
    } catch (err) {
      console.error("Failed to seed pincodes table", err);
      try {
        if (!isPostgres) {
          await runAsync("ROLLBACK");
        }
      } catch (rollbackErr) {
        console.error("Failed to rollback pincode seed", rollbackErr);
      }
    }
  })();
  return pincodeSeedPromise;
};

const makeCacheKey = (req) => {
  const params = new URLSearchParams();
  Object.keys(req.query || {})
    .sort()
    .forEach((key) => {
      const value = req.query[key];
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, item));
      } else if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
  const query = params.toString();
  return query ? `${req.path}?${query}` : req.path;
};

const getCache = (key) => {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (key, value, ttl = DEFAULT_CACHE_TTL) => {
  cacheStore.set(key, { value, expiresAt: Date.now() + ttl });
};

const clearCache = () => {
  cacheStore.clear();
};

app.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) {
        clearCache();
      }
    });
  }
  next();
});

const db = openDb();
await initDb(db);
const isPostgres = db.mode === "postgres";

const replacePlaceholders = (sql) => {
  if (!isPostgres) return sql;
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const runAsync = (sql, params = []) => {
  if (isPostgres) {
    return db.pool.query(replacePlaceholders(sql), params);
  }
  return new Promise((resolve, reject) => {
    db.sqlite.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
};

const allAsync = async (sql, params = []) => {
  if (isPostgres) {
    const result = await db.pool.query(replacePlaceholders(sql), params);
    return result.rows;
  }
  return new Promise((resolve, reject) => {
    db.sqlite.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

const getAsync = async (sql, params = []) => {
  if (isPostgres) {
    const result = await db.pool.query(replacePlaceholders(sql), params);
    return result.rows[0];
  }
  return new Promise((resolve, reject) => {
    db.sqlite.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const buildSalesWithPayments = async (salesRows) => {
  if (!salesRows.length) return [];
  const payments = await allAsync("SELECT sale_id, amount FROM payments");
  const totals = payments.reduce((acc, payment) => {
    const current = acc[payment.sale_id] || 0;
    acc[payment.sale_id] = current + payment.amount;
    return acc;
  }, {});
  const sales = toSalesModel(salesRows);
  return sales.map((sale) => ({
    ...sale,
    paidAmount: totals[sale.id] || 0,
  }));
};

const resolveCustomer = async ({ name, phone, address }) => {
  const trimmedName = String(name || "").trim();
  const cleanedPhone = normalizePhone(phone);
  if (!trimmedName) {
    throw new Error("Customer name is required.");
  }
  if (!cleanedPhone || cleanedPhone.length < 10) {
    throw new Error("Customer phone must include 10 digits.");
  }
  const existing = await getAsync(
    "SELECT * FROM customers WHERE phone = ?",
    [cleanedPhone]
  );
  if (existing) {
    const existingName = normalizeName(existing.name);
    if (normalizeName(trimmedName) !== existingName) {
      throw new Error("Customer phone already exists with a different name.");
    }
    if (address && address !== existing.address) {
      await runAsync(
        "UPDATE customers SET address = ? WHERE id = ?",
        [address, existing.id]
      );
    }
    return { ...existing, name: existing.name, phone: cleanedPhone };
  }
  const id = randomUUID();
  await runAsync(
    "INSERT INTO customers (id, name, phone, address, created_at) VALUES (?, ?, ?, ?, ?)",
    [
      id,
      trimmedName,
      cleanedPhone,
      address || null,
      new Date().toISOString(),
    ]
  );
  return { id, name: trimmedName, phone: cleanedPhone, address: address || null };
};

if (process.env.NODE_ENV === "production" && !process.env.APP_SECRET) {
  throw new Error("APP_SECRET is required in production.");
}
const TOKEN_SECRET = process.env.APP_SECRET || "mlm-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_OWNER = {
  username: process.env.ADMIN_USERNAME || "",
  password: process.env.ADMIN_PASSWORD || "",
  role: process.env.ADMIN_ROLE || "Owner",
  permissions: ["*"],
};

const base64url = (input) =>
  Buffer.from(JSON.stringify(input))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const signToken = (payload) => {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const body = base64url(payload);
  const signature = createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = createHmac("sha256", TOKEN_SECRET)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    if (expected !== signature) return null;
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (_err) {
    return null;
  }
};

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, "hex"), derived);
};

const hasPermission = (user, permission) => {
  if (!user) return false;
  const perms = user.permissions || [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
};

const ensureDefaultOwner = async () => {
  const row = await getAsync("SELECT COUNT(*) as count FROM users");
  if (Number(row?.count || 0) > 0) return;
  if (!DEFAULT_OWNER.username || !DEFAULT_OWNER.password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No users found. Set ADMIN_USERNAME and ADMIN_PASSWORD to bootstrap the first user."
      );
    }
    console.warn(
      "No users found and ADMIN_USERNAME/ADMIN_PASSWORD not set. Skipping default owner creation."
    );
    return;
  }
  const id = randomUUID();
  await runAsync(
    `INSERT INTO users (id, username, password_hash, role, permissions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      DEFAULT_OWNER.username,
      hashPassword(DEFAULT_OWNER.password),
      DEFAULT_OWNER.role,
      JSON.stringify(DEFAULT_OWNER.permissions),
      new Date().toISOString(),
    ]
  );
  console.log(`Default owner created. Username: ${DEFAULT_OWNER.username}`);
};

const upsertCommissionConfig = async (config) => {
  const payload = JSON.stringify(config || {});
  if (isPostgres) {
    await runAsync(
      "INSERT INTO app_config (key, value) VALUES ('commission_config', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [payload]
    );
    return;
  }
  await runAsync(
    "INSERT OR REPLACE INTO app_config (key, value) VALUES ('commission_config', ?)",
    [payload]
  );
};

const requireAuth = async (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  try {
    const user = await getAsync("SELECT * FROM users WHERE id = ?", [
      payload.id,
    ]);
    if (!user || user.active === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions_json ? JSON.parse(user.permissions_json) : [],
    };
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Auth lookup failed." });
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.user, permission)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};

const requireAnyPermission = (permissions) => (req, res, next) => {
  if (permissions.some((perm) => hasPermission(req.user, perm))) {
    return next();
  }
  return res.status(403).json({ error: "Forbidden" });
};

ensureDefaultOwner().catch((err) => {
  console.error("Failed to ensure default owner", err);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

const addWorkingDays = (startDate, days) => {
  const date = new Date(startDate);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date;
};

const addMonths = (startDate, months) => {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const toISODate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
};

const getCommissionConfig = async () => {
  const row = await getAsync(
    "SELECT value FROM app_config WHERE key = 'commission_config'"
  );
  if (!row?.value) {
    return {
      levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
      personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
    };
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return {
      levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
      personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
    };
  }
};

const getCommissionConfigHistory = async () => {
  const rows = await allAsync(
    "SELECT created_at, level_rates_json, personal_rates_json FROM commission_config_history ORDER BY created_at ASC"
  );
  return rows
    .map((row) => {
      let levelRates = [];
      let personalRates = [];
      try {
        levelRates = row.level_rates_json
          ? JSON.parse(row.level_rates_json)
          : [];
        personalRates = row.personal_rates_json
          ? JSON.parse(row.personal_rates_json)
          : [];
      } catch {
        levelRates = [];
        personalRates = [];
      }
      return {
        createdAt: row.created_at,
        levelRates,
        personalRates,
      };
    })
    .filter((entry) => entry.createdAt);
};

const cancelSale = async (sale, refundAmount, reason) => {
  const cancelledAt = new Date().toISOString();
  await runAsync(
    "UPDATE sales SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
    [cancelledAt, sale.id]
  );
  if (sale.buyback_enabled) {
    await runAsync(
      "UPDATE sales SET buyback_status = 'cancelled' WHERE id = ?",
      [sale.id]
    );
  }
  if (sale.property_id) {
    await runAsync(
      "UPDATE project_properties SET status = 'available', last_sale_id = NULL WHERE id = ?",
      [sale.property_id]
    );
  }
  await logActivity({
    action_type: "CANCEL_SALE",
    entity_type: "sale",
    entity_id: sale.id,
    payload: {
      reason,
      refund_amount: refundAmount,
      sale_date: sale.sale_date,
      cancelled_at: cancelledAt,
    },
  });
};

const cancelInvestment = async (investment, refundAmount, reason) => {
  const cancelledAt = new Date().toISOString();
  await runAsync(
    "UPDATE investments SET payment_status = 'cancelled', cancelled_at = ? WHERE id = ?",
    [cancelledAt, investment.id]
  );
  if (investment.property_id) {
    await runAsync(
      "UPDATE project_properties SET status = 'available', last_investment_id = NULL WHERE id = ?",
      [investment.property_id]
    );
  }
  await runAsync(
    "UPDATE people SET status = 'inactive' WHERE id = ?",
    [investment.person_id]
  );
  await logActivity({
    action_type: "CANCEL_INVESTMENT",
    entity_type: "investment",
    entity_id: investment.id,
    payload: {
      reason,
      refund_amount: refundAmount,
      investment_date: investment.date,
      cancelled_at: cancelledAt,
    },
  });
};

const getSalaryReleaseDate = (monthKey) => {
  const [year, month] = String(monthKey).split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month, 7, 9, 0, 0);
};

const autoCancelOverdueSales = async () => {
  const sales = await allAsync("SELECT * FROM sales");
  if (!sales.length) return 0;
  const payments = await allAsync("SELECT * FROM payments");
  const paymentsBySale = payments.reduce((acc, payment) => {
    acc[payment.sale_id] = acc[payment.sale_id] || [];
    acc[payment.sale_id].push(payment);
    return acc;
  }, {});
  const now = new Date();
  let cancelledCount = 0;
  for (const sale of sales) {
    if (sale.status === "cancelled") continue;
    const dueDate = addWorkingDays(sale.sale_date, 15);
    if (now <= dueDate) continue;
    const salePayments = paymentsBySale[sale.id] || [];
    const totalPaid = salePayments.reduce(
      (acc, payment) => acc + payment.amount,
      0
    );
    const paidByDueDate = salePayments.reduce((acc, payment) => {
      const paymentDate = new Date(payment.date);
      if (paymentDate <= dueDate) {
        return acc + payment.amount;
      }
      return acc;
    }, 0);
    if (paidByDueDate >= sale.total_amount) continue;
    await cancelSale(
      sale,
      totalPaid,
      "Overdue payment (15 working days)"
    );
    cancelledCount += 1;
  }
  return cancelledCount;
};

const autoCancelOverdueInvestments = async () => {
  const investments = await allAsync("SELECT * FROM investments");
  if (!investments.length) return 0;
  const payments = await allAsync("SELECT * FROM investment_payments");
  const paymentsByInvestment = payments.reduce((acc, payment) => {
    acc[payment.investment_id] = acc[payment.investment_id] || [];
    acc[payment.investment_id].push(payment);
    return acc;
  }, {});
  const now = new Date();
  let cancelledCount = 0;
  for (const investment of investments) {
    if (investment.payment_status === "paid") continue;
    if (investment.payment_status === "cancelled") continue;
    const dueDate = addWorkingDays(investment.date, 15);
    if (now <= dueDate) continue;
    const invPayments = paymentsByInvestment[investment.id] || [];
    const totalPaid = invPayments.reduce(
      (acc, payment) => acc + payment.amount,
      0
    );
    const paidByDueDate = invPayments.reduce((acc, payment) => {
      const paymentDate = new Date(payment.date);
      if (paymentDate <= dueDate) {
        return acc + payment.amount;
      }
      return acc;
    }, 0);
    if (paidByDueDate >= investment.amount) {
      const completionDate = invPayments.reduce((latest, payment) => {
        if (!latest) return payment.date;
        return new Date(payment.date) > new Date(latest) ? payment.date : latest;
      }, null);
      const buybackDate = completionDate
        ? toISODate(addMonths(completionDate, Number(investment.buyback_months || 36)))
        : "";
      await runAsync(
        "UPDATE investments SET payment_status = 'paid', paid_amount = ?, paid_date = ?, buyback_date = ? WHERE id = ?",
        [paidByDueDate, completionDate, buybackDate, investment.id]
      );
      await runAsync(
        "UPDATE people SET status = 'active' WHERE id = ?",
        [investment.person_id]
      );
      continue;
    }
    await cancelInvestment(
      investment,
      totalPaid,
      "Overdue payment (15 working days)"
    );
    cancelledCount += 1;
  }
  return cancelledCount;
};

const logActivity = async ({
  action_type,
  entity_type,
  entity_id = null,
  payload = null,
  undo_payload = null,
  status = "active",
}) => {
  await runAsync(
    `INSERT INTO activity_logs (id, action_type, entity_type, entity_id, payload_json, undo_payload_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      action_type,
      entity_type,
      entity_id,
      payload ? JSON.stringify(payload) : null,
      undo_payload ? JSON.stringify(undo_payload) : null,
      status,
      new Date().toISOString(),
    ]
  );
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }
  try {
    const user = await getAsync("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    if (user.active === 0) {
      return res.status(403).json({ error: "Account disabled." });
    }
    const permissions = user.permissions_json
      ? JSON.parse(user.permissions_json)
      : [];
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    });
    await runAsync("UPDATE users SET last_login = ? WHERE id = ?", [
      new Date().toISOString(),
      user.id,
    ]);
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions,
        last_login: user.last_login,
        active: user.active !== 0,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed." });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    permissions: req.user.permissions || [],
  });
});

app.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "All fields are required." });
  }
  try {
    const user = await getAsync("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    await runAsync("UPDATE users SET password_hash = ? WHERE id = ?", [
      hashPassword(newPassword),
      req.user.id,
    ]);
    await logActivity({
      action_type: "UPDATE_PASSWORD",
      entity_type: "user",
      entity_id: req.user.id,
      payload: { username: req.user.username },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update password." });
  }
});

app.get("/users", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const filters = [];
  const params = [];
  if (search) {
    filters.push("(lower(username) LIKE ? OR lower(role) LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const totalRow = await getAsync(
    `SELECT COUNT(*) as count FROM users ${where}`,
    params
  );
  const rows = await allAsync(
    `SELECT id, username, role, permissions_json, created_at, last_login, active
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({
    rows: rows.map((row) => ({
      ...row,
      permissions: row.permissions_json ? JSON.parse(row.permissions_json) : [],
    })),
    total: totalRow?.count || 0,
  });
});

app.post("/users", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const { username, password, role, permissions } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, and role are required." });
  }
  if (String(username).toLowerCase() === DEFAULT_OWNER.username) {
    return res.status(400).json({ error: "Owner username is reserved." });
  }
  const existing = await getAsync("SELECT id FROM users WHERE username = ?", [
    username,
  ]);
  if (existing) {
    return res.status(400).json({ error: "Username already exists." });
  }
  const id = randomUUID();
  const perms = Array.isArray(permissions) ? permissions : [];
  await runAsync(
    `INSERT INTO users (id, username, password_hash, role, permissions_json, created_at, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      username,
      hashPassword(password),
      role,
      JSON.stringify(perms),
      new Date().toISOString(),
      1,
    ]
  );
  await logActivity({
    action_type: "CREATE_USER",
    entity_type: "user",
    entity_id: id,
    payload: { username, role, permissions: perms },
  });
  res.json({ id });
});

app.put("/users/:id", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const { role, permissions, password, active } = req.body || {};
  const user = await getAsync("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (user.username === DEFAULT_OWNER.username) {
    return res.status(403).json({ error: "Owner account cannot be edited." });
  }
  const nextRole = role || user.role;
  const nextPerms = Array.isArray(permissions)
    ? permissions
    : user.permissions_json
    ? JSON.parse(user.permissions_json)
    : [];
  const nextHash = password ? hashPassword(password) : user.password_hash;
  const nextActive =
    active === undefined ? user.active : active ? 1 : 0;
  await runAsync(
    "UPDATE users SET role = ?, permissions_json = ?, password_hash = ?, active = ? WHERE id = ?",
    [nextRole, JSON.stringify(nextPerms), nextHash, nextActive, req.params.id]
  );
  await logActivity({
    action_type: "UPDATE_USER",
    entity_type: "user",
    entity_id: req.params.id,
    payload: {
      role: nextRole,
      permissions: nextPerms,
      password_changed: !!password,
      active: nextActive === 1,
    },
    undo_payload: {
      role: user.role,
      permissions: user.permissions_json ? JSON.parse(user.permissions_json) : [],
      password_hash: user.password_hash,
      active: user.active,
    },
  });
  res.json({ ok: true });
});

app.use(requireAuth);

app.get("/activity-logs", requirePermission("activity:read"), async (req, res) => {
  const cacheKey = makeCacheKey(req);
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const action = String(req.query.action || "").trim();
  const entity = String(req.query.entity || "").trim();
  const status = String(req.query.status || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const filters = [];
  const params = [];

  if (search) {
    filters.push(
      "(lower(action_type) LIKE ? OR lower(entity_type) LIKE ? OR lower(payload_json) LIKE ?)"
    );
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (action && action !== "all") {
    filters.push("action_type = ?");
    params.push(action);
  }
  if (entity && entity !== "all") {
    filters.push("entity_type = ?");
    params.push(entity);
  }
  if (status && status !== "all") {
    filters.push("status = ?");
    params.push(status);
  }
  if (from) {
    filters.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    filters.push("created_at <= ?");
    params.push(to);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const totalRow = await getAsync(
    `SELECT COUNT(*) as count FROM activity_logs ${where}`,
    params
  );
  const rows = await allAsync(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const actionOptions = await allAsync(
    "SELECT DISTINCT action_type FROM activity_logs ORDER BY action_type ASC"
  );
  const entityOptions = await allAsync(
    "SELECT DISTINCT entity_type FROM activity_logs ORDER BY entity_type ASC"
  );
  const response = {
    rows,
    total: totalRow?.count || 0,
    actionOptions: actionOptions.map((row) => row.action_type),
    entityOptions: entityOptions.map((row) => row.entity_type),
  };
  setCache(cacheKey, response, 8000);
  res.json(response);
});

app.get("/dashboard/summary", requirePermission("dashboard:read"), async (req, res) => {
  const cancelledInvestments = await autoCancelOverdueInvestments();
  if (cancelledInvestments) {
    clearCache();
  }
  const cacheKey = makeCacheKey(req);
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const totals = await getAsync(
    "SELECT COALESCE(SUM(total_amount), 0) as total_amount, COALESCE(SUM(area_sq_yd), 0) as total_area FROM sales WHERE status != 'cancelled'"
  );
  const pendingRow = await getAsync(
    "SELECT COUNT(*) as count FROM investments WHERE status = 'pending' AND payment_status = 'paid'"
  );
  const recentSales = await allAsync(
    `SELECT s.*, p.name as seller_name, pr.name as project_name, b.name as block_name, prop.name as property_name,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) as paid_amount
     FROM sales s
     LEFT JOIN people p ON p.id = s.seller_id
     LEFT JOIN projects pr ON pr.id = s.project_id
     LEFT JOIN project_blocks b ON b.id = s.block_id
     LEFT JOIN project_properties prop ON prop.id = s.property_id
     WHERE s.status != 'cancelled'
     ORDER BY s.sale_date DESC
     LIMIT 5`
  );

  let topEarners = [];
  let totalCommission = 0;
  if (hasPermission(req.user, "commissions:read")) {
    const [peopleRows, investmentsRows, salesRows, commissionPayments] =
      await Promise.all([
        allAsync("SELECT * FROM people"),
        allAsync("SELECT * FROM investments"),
        allAsync("SELECT * FROM sales"),
        allAsync("SELECT * FROM commission_payments"),
      ]);
    const config = await getCommissionConfig();
    const configHistory = await getCommissionConfigHistory();
    const people = toPeopleModel(peopleRows, investmentsRows);
    const sales = await buildSalesWithPayments(salesRows);
    const summary = calculateCommissionSummary(
      people,
      sales,
      config,
      commissionPayments,
      configHistory
    );
    totalCommission = summary.totalCommission;
    topEarners = summary.topEarners.map((entry) => ({
      person_id: entry.person.id,
      name: entry.person.name,
      total_commission: entry.totalCommission,
      max_level: entry.maxLevel,
    }));
  }

  const response = {
    totalSales: totals?.total_amount || 0,
    totalArea: totals?.total_area || 0,
    totalCommission,
    pendingBuybacks: pendingRow?.count || 0,
    recentSales,
    topEarners,
  };
  setCache(cacheKey, response, 15000);
  res.json(response);
});

app.get("/people/lookup", requirePermission("people:read"), async (_req, res) => {
  const rows = await allAsync(
    "SELECT id, name, sponsor_id FROM people ORDER BY name ASC"
  );
  res.json(rows);
});

app.get("/people-summary", requirePermission("people:read"), async (req, res) => {
  const cancelledInvestments = await autoCancelOverdueInvestments();
  if (cancelledInvestments) {
    clearCache();
  }
  const cacheKey = makeCacheKey(req);
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const limit = Math.min(Number(req.query.limit) || 10, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const sort = String(req.query.sort || "recent").trim();
  const view = String(req.query.view || "active").trim();
  const due = String(req.query.due || "all").trim();

  const [peopleRows, investmentsRows, salesRows, commissionPayments] =
    await Promise.all([
      allAsync("SELECT * FROM people"),
      allAsync("SELECT * FROM investments"),
      allAsync("SELECT * FROM sales"),
      allAsync("SELECT * FROM commission_payments"),
    ]);
  const investmentPayments = await allAsync(
    "SELECT * FROM investment_payments"
  );
  const config = await getCommissionConfig();
  const configHistory = await getCommissionConfigHistory();
  const people = toPeopleModel(peopleRows, investmentsRows);
  const sales = await buildSalesWithPayments(salesRows);
  const summary = calculateCommissionSummary(
    people,
    sales,
    config,
    commissionPayments,
    configHistory
  );
  const peopleIndex = buildPeopleIndex(people);
  const paymentsByInvestment = investmentPayments.reduce((acc, payment) => {
    const entry = acc[payment.investment_id] || { totalPaid: 0 };
    entry.totalPaid += payment.amount;
    acc[payment.investment_id] = entry;
    return acc;
  }, {});
  const now = new Date();
  const msInDay = 1000 * 60 * 60 * 24;

  let rows = people.map((person) => {
    const commissionRow = summary.byPerson[person.id];
    const direct = peopleIndex[person.id]?.directRecruits.length || 0;
    const stageSummary = getStageSummary(person, peopleIndex, sales);
    const investments = person.investments || [];
    const firstInvestment = [...investments].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    )[0];
    const paymentEntry = firstInvestment
      ? paymentsByInvestment[firstInvestment.id] || { totalPaid: 0 }
      : { totalPaid: 0 };
    const paymentPercent = firstInvestment?.amount
      ? Math.min(
          100,
          Math.round((paymentEntry.totalPaid / firstInvestment.amount) * 100)
        )
      : 0;
    const dueDate = firstInvestment?.date
      ? addWorkingDays(firstInvestment.date, 15)
      : null;
    const daysLeft = dueDate
      ? Math.max(0, Math.ceil((dueDate - now) / msInDay))
      : null;
    return {
      id: person.id,
      name: person.name,
      sponsor_id: person.sponsorId,
      sponsor_name: person.sponsorId
        ? peopleIndex[person.sponsorId]?.name || ""
        : "Owner",
      stage: stageSummary.stage,
      direct_recruits: direct,
      invested_area: firstInvestment?.areaSqYd || 0,
      max_level: commissionRow?.maxLevel || 0,
      total_commission: commissionRow?.totalCommission || 0,
      join_date: person.joinDate,
      status: person.status || "active",
      is_special: person.isSpecial ? 1 : 0,
      payment_percent: firstInvestment ? paymentPercent : null,
      payment_paid: firstInvestment ? paymentEntry.totalPaid : null,
      payment_total: firstInvestment?.amount || 0,
      payment_status: person.isSpecial
        ? "special"
        : firstInvestment?.paymentStatus || "pending",
      payment_due_date: dueDate ? dueDate.toISOString() : null,
      payment_days_left: firstInvestment ? daysLeft : null,
    };
  });

  if (search) {
    rows = rows.filter((row) => row.name.toLowerCase().includes(search));
  }
  if (view === "inactive") {
    rows = rows.filter((row) => row.status === "inactive");
  } else if (view === "active") {
    rows = rows.filter((row) => row.status !== "inactive");
  }
  if (due === "soon") {
    rows = rows.filter(
      (row) =>
        row.payment_days_left !== null &&
        row.payment_days_left <= 5 &&
        row.payment_status !== "paid" &&
        row.payment_status !== "cancelled"
    );
  }

  if (sort === "alpha") {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "commission") {
    rows.sort((a, b) => b.total_commission - a.total_commission);
  } else if (sort === "stage") {
    rows.sort(
      (a, b) => b.stage - a.stage || b.join_date.localeCompare(a.join_date)
    );
  } else if (sort === "recruits") {
    rows.sort(
      (a, b) =>
        b.direct_recruits - a.direct_recruits ||
        b.join_date.localeCompare(a.join_date)
    );
  } else {
    rows.sort((a, b) => b.join_date.localeCompare(a.join_date));
  }

  const total = rows.length;
  const paged = rows.slice(offset, offset + limit);
  const response = { rows: paged, total };
  setCache(cacheKey, response, 20000);
  res.json(response);
});

app.get("/commissions-summary", requirePermission("commissions:read"), async (req, res) => {
  const cacheKey = makeCacheKey(req);
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const limit = Math.min(Number(req.query.limit) || 10, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const stage = String(req.query.stage || "all").trim();
  const balance = String(req.query.balance || "all").trim();
  const minEarned = Number(req.query.minEarned || 0);

  const [peopleRows, investmentsRows, salesRows, commissionPayments] =
    await Promise.all([
      allAsync("SELECT * FROM people"),
      allAsync("SELECT * FROM investments"),
      allAsync("SELECT * FROM sales"),
      allAsync("SELECT * FROM commission_payments"),
    ]);
  const config = await getCommissionConfig();
  const configHistory = await getCommissionConfigHistory();
  const people = toPeopleModel(peopleRows, investmentsRows);
  const sales = await buildSalesWithPayments(salesRows);
  const summary = calculateCommissionSummary(
    people,
    sales,
    config,
    commissionPayments,
    configHistory
  );

  let rows = summary.peopleRows.map((row) => ({
    id: row.person.id,
    name: row.person.name,
    stage: row.stage,
    personal_rate: row.personalRate,
    total_commission: row.totalCommission,
    total_paid: row.totalPaid,
  }));

  if (search) {
    rows = rows.filter((row) => row.name.toLowerCase().includes(search));
  }
  if (stage !== "all") {
    rows = rows.filter((row) => row.stage === Number(stage));
  }
  if (balance === "due") {
    rows = rows.filter((row) => row.total_commission - row.total_paid > 0);
  }
  if (balance === "paid") {
    rows = rows.filter((row) => row.total_commission - row.total_paid <= 0);
  }
  if (minEarned) {
    rows = rows.filter((row) => row.total_commission >= minEarned);
  }

  const total = rows.length;
  const paged = rows.slice(offset, offset + limit);
  const response = { rows: paged, total };
  setCache(cacheKey, response, 20000);
  res.json(response);
});

app.get("/commissions/balance", requirePermission("commissions:read"), async (req, res) => {
  const personId = String(req.query.personId || "").trim();
  if (!personId) {
    return res.status(400).json({ error: "personId is required." });
  }
  const [peopleRows, investmentsRows, salesRows, commissionPayments] =
    await Promise.all([
      allAsync("SELECT * FROM people"),
      allAsync("SELECT * FROM investments"),
      allAsync("SELECT * FROM sales"),
      allAsync("SELECT * FROM commission_payments"),
    ]);
  const config = await getCommissionConfig();
  const configHistory = await getCommissionConfigHistory();
  const people = toPeopleModel(peopleRows, investmentsRows);
  const sales = await buildSalesWithPayments(salesRows);
  const summary = calculateCommissionSummary(
    people,
    sales,
    config,
    commissionPayments,
    configHistory
  );
  const row = summary.byPerson[personId];
  if (!row) {
    return res.status(404).json({ error: "Person not found." });
  }
  res.json({
    totalCommission: row.totalCommission || 0,
    totalPaid: row.totalPaid || 0,
  });
});

app.get("/sales-summary", requirePermission("sales:read"), async (req, res) => {
  const cancelledCount = await autoCancelOverdueSales();
  if (cancelledCount) {
    clearCache();
  }
  const cacheKey = makeCacheKey(req);
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const limit = Math.min(Number(req.query.limit) || 10, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const sort = String(req.query.sort || "recent").trim();
  const view = String(req.query.view || "active").trim();
  const due = String(req.query.due || "all").trim();

  const filters = [];
  const params = [];
  if (view === "cancelled") {
    filters.push("s.status = 'cancelled'");
  } else {
    filters.push("s.status != 'cancelled'");
  }
  if (search) {
    filters.push(
      "(lower(p.name) LIKE ? OR lower(pr.name) LIKE ? OR lower(b.name) LIKE ? OR lower(prop.name) LIKE ? OR lower(s.location) LIKE ? OR lower(c.name) LIKE ? OR c.phone LIKE ?)"
    );
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const orderBy =
    sort === "alpha"
      ? "ORDER BY pr.name ASC"
      : "ORDER BY s.sale_date DESC";

  const baseQuery = `SELECT s.*, p.name as seller_name, pr.name as project_name, b.name as block_name, prop.name as property_name,
            c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) as paid_amount
     FROM sales s
     LEFT JOIN people p ON p.id = s.seller_id
     LEFT JOIN projects pr ON pr.id = s.project_id
     LEFT JOIN project_blocks b ON b.id = s.block_id
     LEFT JOIN project_properties prop ON prop.id = s.property_id
     LEFT JOIN customers c ON c.id = s.customer_id
     ${where}
     ${orderBy}`;

  const now = new Date();
  const msInDay = 1000 * 60 * 60 * 24;

  if (due === "soon") {
    const rows = await allAsync(baseQuery, params);
    const enhancedRows = rows.map((row) => {
      const dueDate = row.sale_date ? addWorkingDays(row.sale_date, 15) : null;
      const daysLeft = dueDate
        ? Math.max(0, Math.ceil((dueDate - now) / msInDay))
        : null;
      return {
        ...row,
        payment_due_date: dueDate ? dueDate.toISOString() : null,
        payment_days_left: daysLeft,
      };
    });
    const filtered = enhancedRows.filter(
      (row) =>
        row.payment_days_left !== null &&
        row.payment_days_left <= 5 &&
        row.status !== "cancelled"
    );
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);
    const response = { rows: paged, total };
    setCache(cacheKey, response, 20000);
    return res.json(response);
  }

  const totalRow = await getAsync(
    `SELECT COUNT(*) as count
     FROM sales s
     LEFT JOIN people p ON p.id = s.seller_id
     LEFT JOIN projects pr ON pr.id = s.project_id
     LEFT JOIN project_blocks b ON b.id = s.block_id
     LEFT JOIN project_properties prop ON prop.id = s.property_id
     LEFT JOIN customers c ON c.id = s.customer_id
     ${where}`,
    params
  );

  const rows = await allAsync(
    `${baseQuery}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const enhancedRows = rows.map((row) => {
    const dueDate = row.sale_date ? addWorkingDays(row.sale_date, 15) : null;
    const daysLeft = dueDate
      ? Math.max(0, Math.ceil((dueDate - now) / msInDay))
      : null;
    return {
      ...row,
      payment_due_date: dueDate ? dueDate.toISOString() : null,
      payment_days_left: daysLeft,
    };
  });
  const response = { rows: enhancedRows, total: totalRow?.count || 0 };
  setCache(cacheKey, response, 20000);
  res.json(response);
});

app.post("/activity-logs", requirePermission("activity:write"), async (req, res) => {
  const { action_type, entity_type, entity_id, payload } = req.body;
  await logActivity({
    action_type,
    entity_type,
    entity_id,
    payload,
    undo_payload: null,
  });
  res.json({ ok: true });
});

app.post("/activity-logs/:id/undo", requirePermission("activity:write"), async (req, res) => {
  const { id } = req.params;
  const logRow = await getAsync(
    "SELECT * FROM activity_logs WHERE id = ?",
    [id]
  );
  if (!logRow) return res.status(404).json({ error: "Not found" });
  if (logRow.status !== "active") {
    return res.status(400).json({ error: "Already undone" });
  }
  const undoPayload = logRow.undo_payload_json
    ? JSON.parse(logRow.undo_payload_json)
    : null;
  try {
    switch (logRow.action_type) {
      case "CREATE_PERSON":
        await runAsync("DELETE FROM investments WHERE person_id = ?", [
          logRow.entity_id,
        ]);
        await runAsync("DELETE FROM people WHERE id = ?", [logRow.entity_id]);
        break;
      case "CREATE_USER":
        await runAsync("DELETE FROM users WHERE id = ?", [logRow.entity_id]);
        break;
      case "UPDATE_USER":
        if (!undoPayload) {
          return res.status(400).json({ error: "Undo payload missing." });
        }
        await runAsync(
          "UPDATE users SET role = ?, permissions_json = ?, password_hash = ?, active = ? WHERE id = ?",
          [
            undoPayload.role,
            JSON.stringify(undoPayload.permissions || []),
            undoPayload.password_hash,
            undoPayload.active,
            logRow.entity_id,
          ]
        );
        break;
      case "UPDATE_PERSON":
        await runAsync(
          "UPDATE people SET name = ?, phone = ?, join_date = ? WHERE id = ?",
          [
            undoPayload.name,
            undoPayload.phone,
            undoPayload.join_date,
            logRow.entity_id,
          ]
        );
        break;
      case "CREATE_SALE":
        {
          const sale = await getAsync("SELECT * FROM sales WHERE id = ?", [
            logRow.entity_id,
          ]);
          if (sale?.property_id) {
            await runAsync(
              "UPDATE project_properties SET status = 'available', last_sale_id = NULL WHERE id = ?",
              [sale.property_id]
            );
          }
          await runAsync("DELETE FROM payments WHERE sale_id = ?", [
            logRow.entity_id,
          ]);
          await runAsync("DELETE FROM sales WHERE id = ?", [logRow.entity_id]);
        }
        break;
      case "UPDATE_SALE":
        {
          const currentSale = await getAsync(
            "SELECT * FROM sales WHERE id = ?",
            [logRow.entity_id]
          );
          if (!undoPayload) {
            return res.status(400).json({ error: "Undo payload missing." });
          }
          await runAsync(
            `UPDATE sales
             SET seller_id = ?, property_name = ?, location = ?, area_sq_yd = ?, actual_area_sq_yd = ?, total_amount = ?, sale_date = ?, project_id = ?, block_id = ?, property_id = ?, customer_id = ?, buyback_enabled = ?, buyback_months = ?, buyback_return_percent = ?, buyback_date = ?, buyback_status = ?, buyback_paid_amount = ?, buyback_paid_date = ?, status = ?, cancelled_at = ?
             WHERE id = ?`,
            [
              undoPayload.seller_id,
              undoPayload.property_name,
              undoPayload.location,
              undoPayload.area_sq_yd,
              undoPayload.actual_area_sq_yd ?? null,
              undoPayload.total_amount,
              undoPayload.sale_date,
              undoPayload.project_id || null,
              undoPayload.block_id || null,
              undoPayload.property_id || null,
              undoPayload.customer_id || null,
              undoPayload.buyback_enabled || 0,
              undoPayload.buyback_months || null,
              undoPayload.buyback_return_percent || null,
              undoPayload.buyback_date || null,
              undoPayload.buyback_status || "pending",
              undoPayload.buyback_paid_amount || null,
              undoPayload.buyback_paid_date || null,
              undoPayload.status || "active",
              undoPayload.cancelled_at || null,
              logRow.entity_id,
            ]
          );
          if (currentSale?.property_id && currentSale.property_id !== undoPayload.property_id) {
            await runAsync(
              "UPDATE project_properties SET status = 'available', last_sale_id = NULL WHERE id = ?",
              [currentSale.property_id]
            );
          }
          if (undoPayload.property_id) {
            const nextStatus =
              undoPayload.status === "cancelled" ? "available" : "sold";
            const nextSaleId =
              undoPayload.status === "cancelled" ? null : logRow.entity_id;
            await runAsync(
              "UPDATE project_properties SET status = ?, last_sale_id = ? WHERE id = ?",
              [nextStatus, nextSaleId, undoPayload.property_id]
            );
          }
        }
        break;
      case "CREATE_PAYMENT":
        await runAsync("DELETE FROM payments WHERE id = ?", [logRow.entity_id]);
        break;
      case "CREATE_INVESTMENT":
        {
          const investment = await getAsync(
            "SELECT * FROM investments WHERE id = ?",
            [logRow.entity_id]
          );
          if (investment?.property_id) {
            await runAsync(
              "UPDATE project_properties SET status = 'available', last_investment_id = NULL WHERE id = ?",
              [investment.property_id]
            );
          }
          await runAsync("DELETE FROM investment_payments WHERE investment_id = ?", [
            logRow.entity_id,
          ]);
          await runAsync("DELETE FROM investments WHERE id = ?", [
            logRow.entity_id,
          ]);
          if (investment?.person_id) {
            const person = await getAsync("SELECT * FROM people WHERE id = ?", [
              investment.person_id,
            ]);
            if (person && person.is_special === 1) {
              await runAsync("UPDATE people SET status = 'active' WHERE id = ?", [
                investment.person_id,
              ]);
            } else {
              const remainingPaid = await getAsync(
                "SELECT COUNT(*) as count FROM investments WHERE person_id = ? AND payment_status = 'paid'",
                [investment.person_id]
              );
              const nextStatus =
                (remainingPaid?.count || 0) > 0 ? "active" : "pending";
              await runAsync("UPDATE people SET status = ? WHERE id = ?", [
                nextStatus,
                investment.person_id,
              ]);
            }
          }
        }
        break;
      case "CREATE_COMMISSION_PAYMENT":
        await runAsync("DELETE FROM commission_payments WHERE id = ?", [
          logRow.entity_id,
        ]);
        break;
      case "CREATE_EMPLOYEE":
        await runAsync("DELETE FROM salary_payments WHERE employee_id = ?", [
          logRow.entity_id,
        ]);
        await runAsync("DELETE FROM employees WHERE id = ?", [logRow.entity_id]);
        break;
      case "UPDATE_EMPLOYEE":
        if (!undoPayload) {
          return res.status(400).json({ error: "Undo payload missing." });
        }
        await runAsync(
          "UPDATE employees SET name = ?, role = ?, phone = ?, join_date = ?, monthly_salary = ? WHERE id = ?",
          [
            undoPayload.name,
            undoPayload.role,
            undoPayload.phone,
            undoPayload.join_date,
            undoPayload.monthly_salary,
            logRow.entity_id,
          ]
        );
        break;
      case "CREATE_INVESTMENT_PAYMENT":
        {
          await runAsync("DELETE FROM investment_payments WHERE id = ?", [
            logRow.entity_id,
          ]);
          let investmentId = undoPayload?.investment_id || null;
          if (!investmentId && logRow?.payload_json) {
            try {
              investmentId = JSON.parse(logRow.payload_json).investment_id || null;
            } catch {
              investmentId = null;
            }
          }
          if (investmentId) {
            const investment = await getAsync(
              "SELECT * FROM investments WHERE id = ?",
              [investmentId]
            );
            if (investment) {
              const remainingPayments = await allAsync(
                "SELECT amount FROM investment_payments WHERE investment_id = ?",
                [investmentId]
              );
              const totalPaid = remainingPayments.reduce(
                (acc, payment) => acc + payment.amount,
                0
              );
              const paymentStatus =
                totalPaid >= investment.amount ? "paid" : "pending";
              await runAsync(
                "UPDATE investments SET payment_status = ? WHERE id = ?",
                [paymentStatus, investmentId]
              );
              const person = await getAsync(
                "SELECT * FROM people WHERE id = ?",
                [investment.person_id]
              );
              if (person && person.is_special === 1) {
                await runAsync(
                  "UPDATE people SET status = 'active' WHERE id = ?",
                  [investment.person_id]
                );
              } else {
                const paidCount = await getAsync(
                  "SELECT COUNT(*) as count FROM investments WHERE person_id = ? AND payment_status = 'paid'",
                  [investment.person_id]
                );
                const nextStatus =
                  (paidCount?.count || 0) > 0 ? "active" : "pending";
                await runAsync(
                  "UPDATE people SET status = ? WHERE id = ?",
                  [nextStatus, investment.person_id]
                );
              }
            }
          }
        }
        break;
      case "CREATE_SALARY_PAYMENT":
        await runAsync("DELETE FROM salary_payments WHERE id = ?", [
          logRow.entity_id,
        ]);
        break;
      case "UPDATE_BUYBACK":
      case "UPDATE_INVESTMENT":
        await runAsync(
          "UPDATE investments SET status = ?, paid_amount = ?, paid_date = ?, area_sq_yd = ?, actual_area_sq_yd = ?, return_percent = ? WHERE id = ?",
          [
            undoPayload.status,
            undoPayload.paid_amount,
            undoPayload.paid_date,
            undoPayload.area_sq_yd,
            undoPayload.actual_area_sq_yd ?? null,
            undoPayload.return_percent,
            logRow.entity_id,
          ]
        );
        break;
      case "UPDATE_SALE_BUYBACK":
        if (!undoPayload) {
          return res.status(400).json({ error: "Undo payload missing." });
        }
        await runAsync(
          "UPDATE sales SET buyback_status = ?, buyback_paid_amount = ?, buyback_paid_date = ? WHERE id = ?",
          [
            undoPayload.buyback_status || "pending",
            undoPayload.buyback_paid_amount || null,
            undoPayload.buyback_paid_date || null,
            logRow.entity_id,
          ]
        );
        break;
      case "CANCEL_SALE":
        {
          const sale = await getAsync("SELECT * FROM sales WHERE id = ?", [
            logRow.entity_id,
          ]);
          if (sale) {
            await runAsync(
              "UPDATE sales SET status = 'active', cancelled_at = NULL WHERE id = ?",
              [logRow.entity_id]
            );
            if (sale.buyback_enabled) {
              await runAsync(
                "UPDATE sales SET buyback_status = 'pending' WHERE id = ?",
                [logRow.entity_id]
              );
            }
            if (sale.property_id) {
              await runAsync(
                "UPDATE project_properties SET status = 'sold', last_sale_id = ? WHERE id = ?",
                [logRow.entity_id, sale.property_id]
              );
            }
          }
        }
        break;
      case "CANCEL_INVESTMENT":
        {
          const investment = await getAsync(
            "SELECT * FROM investments WHERE id = ?",
            [logRow.entity_id]
          );
          if (investment) {
            const payments = await allAsync(
              "SELECT amount FROM investment_payments WHERE investment_id = ?",
              [investment.id]
            );
            const totalPaid = payments.reduce(
              (acc, payment) => acc + payment.amount,
              0
            );
            const paymentStatus =
              totalPaid >= investment.amount ? "paid" : "pending";
            await runAsync(
              "UPDATE investments SET payment_status = ?, cancelled_at = NULL WHERE id = ?",
              [paymentStatus, investment.id]
            );
            const person = await getAsync("SELECT * FROM people WHERE id = ?", [
              investment.person_id,
            ]);
            if (person && person.is_special === 1) {
              await runAsync(
                "UPDATE people SET status = 'active' WHERE id = ?",
                [investment.person_id]
              );
            } else {
              const paidCount = await getAsync(
                "SELECT COUNT(*) as count FROM investments WHERE person_id = ? AND payment_status = 'paid'",
                [investment.person_id]
              );
              const nextStatus =
                (paidCount?.count || 0) > 0 ? "active" : "pending";
              await runAsync(
                "UPDATE people SET status = ? WHERE id = ?",
                [nextStatus, investment.person_id]
              );
            }
            if (investment.property_id) {
              await runAsync(
                "UPDATE project_properties SET status = 'sold', last_investment_id = ? WHERE id = ?",
                [investment.id, investment.property_id]
              );
            }
          }
        }
        break;
      case "UPDATE_CONFIG":
        await upsertCommissionConfig(undoPayload);
        await runAsync(
          `INSERT INTO commission_config_history (id, created_at, level_rates_json, personal_rates_json)
           VALUES (?, ?, ?, ?)`,
          [
            randomUUID(),
            new Date().toISOString(),
            JSON.stringify(undoPayload?.levelRates || []),
            JSON.stringify(undoPayload?.personalRates || []),
          ]
        );
        clearCache();
        break;
      default:
        return res.status(400).json({ error: "Undo not supported" });
    }
    clearCache();
    await runAsync("UPDATE activity_logs SET status = 'undone' WHERE id = ?", [
      id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Undo failed" });
  }
});

app.get("/config", requirePermission("settings:read"), async (_req, res) => {
  const row = await getAsync(
    "SELECT value FROM app_config WHERE key = 'commission_config'"
  );
  res.json(row ? JSON.parse(row.value) : null);
});

app.get(
  "/config/history",
  requireAnyPermission(["settings:read", "commissions:read"]),
  async (_req, res) => {
    const rows = await allAsync(
      "SELECT created_at, level_rates_json, personal_rates_json FROM commission_config_history ORDER BY created_at ASC"
    );
    const history = rows.map((row) => ({
      createdAt: row.created_at,
      levelRates: row.level_rates_json ? JSON.parse(row.level_rates_json) : [],
      personalRates: row.personal_rates_json
        ? JSON.parse(row.personal_rates_json)
        : [],
    }));
    res.json(history);
  }
);

app.get("/projects", requirePermission("projects:read"), async (_req, res) => {
  const projects = await allAsync(
    `SELECT pr.*,
      COALESCE(stats.total_properties, 0) AS total_properties,
      COALESCE(stats.available_properties, 0) AS available_properties,
      COALESCE(stats.sold_properties, 0) AS sold_properties,
      COALESCE(stats.by_sale, 0) AS by_sale,
      COALESCE(stats.by_investment, 0) AS by_investment
     FROM projects pr
     LEFT JOIN (
       SELECT project_id,
         COUNT(*) AS total_properties,
         SUM(CASE WHEN status IS NULL OR status = 'available' THEN 1 ELSE 0 END) AS available_properties,
         SUM(CASE WHEN status IS NULL OR status = 'available' THEN 0 ELSE 1 END) AS sold_properties,
         SUM(CASE WHEN last_sale_id IS NOT NULL THEN 1 ELSE 0 END) AS by_sale,
         SUM(CASE WHEN last_investment_id IS NOT NULL THEN 1 ELSE 0 END) AS by_investment
       FROM project_properties
       GROUP BY project_id
     ) stats ON stats.project_id = pr.id
     ORDER BY pr.created_at DESC`
  );
  const blocks = await allAsync(
    "SELECT * FROM project_blocks ORDER BY name ASC"
  );
  res.json({ projects, blocks, properties: [] });
});

app.get("/pincodes", requirePermission("projects:read"), async (req, res) => {
  const state = String(req.query.state || "").trim();
  const query = String(req.query.q || "").trim();
  if (!state || !query) {
    return res.json({ results: [] });
  }
  await ensurePincodeSeeded();
  const stateKey = normalizeKey(state);
  const stateAliasMap = {
    delhi: ["delhi", "nctofdelhi"],
    puducherry: ["puducherry", "pondicherry"],
    odisha: ["odisha", "orissa"],
    uttarakhand: ["uttarakhand", "uttaranchal"],
    chhattisgarh: ["chhattisgarh", "chattisgarh"],
    andamanandnicobarislands: [
      "andamanandnicobarislands",
      "andamanandnicobar",
    ],
    telangana: ["andhrapradesh"],
    dadraandnagarhavelianddamananddiu: [
      "dadraandnagarhaveli",
      "damananddiu",
    ],
  };
  const acceptedStates = stateAliasMap[stateKey] || [stateKey];
  if (query.length < 3) {
    return res.json({ results: [] });
  }
  const isNumeric = /^\d+$/.test(query);
  const term = `%${normalizeKey(query)}%`;
  const pinPrefix = `${query}%`;
  const statePlaceholders = acceptedStates.map(() => "?").join(",");
  const params = [...acceptedStates];
  let where = `state_key IN (${statePlaceholders}) AND pincode LIKE ?`;
  params.push(pinPrefix);
  if (!isNumeric) {
    where = `state_key IN (${statePlaceholders}) AND (pincode LIKE ? OR name_key LIKE ? OR district_key LIKE ?)`;
    params.push(term, term);
  }
  try {
    const rows = await allAsync(
      `SELECT pincode,
              MIN(office_name) AS office_name,
              MIN(district) AS district,
              MIN(state) AS state
       FROM pincodes
       WHERE (${where})
       GROUP BY pincode
       ORDER BY pincode ASC`,
      params
    );
    const results = rows.map((row) => ({
      pincode: row.pincode,
      name: row.office_name || "",
      district: row.district || "",
      state: row.state || state,
    }));
    res.json({ results });
  } catch (err) {
    console.error("Pincode lookup failed", err);
    res.json({ results: [] });
  }
});

app.get(
  "/projects/:id/properties",
  requirePermission("projects:read"),
  async (req, res) => {
    const { id } = req.params;
    const status = String(req.query.status || "all").toLowerCase();
    const params = [id];
    let where = "WHERE prop.project_id = ?";
    if (status === "available") {
      where += " AND prop.status = 'available'";
    } else if (status === "sold") {
      where += " AND prop.status = 'sold'";
    }
    const properties = await allAsync(
      `SELECT prop.*,
        s.sale_date AS last_sale_date,
        s.total_amount AS last_sale_amount,
        s.area_sq_yd AS last_sale_area,
        s.actual_area_sq_yd AS last_sale_actual_area,
        s.status AS last_sale_status,
        s.seller_id AS last_sale_seller_id,
        sp.name AS last_sale_seller_name,
        sp.phone AS last_sale_seller_phone,
        c.name AS last_sale_customer_name,
        c.phone AS last_sale_customer_phone,
        inv.date AS last_investment_date,
        inv.amount AS last_investment_amount,
        inv.area_sq_yd AS last_investment_area,
        inv.actual_area_sq_yd AS last_investment_actual_area,
        inv.return_percent AS last_investment_return_percent,
        inv.buyback_date AS last_investment_buyback_date,
        inv.status AS last_investment_status,
        inv.person_id AS last_investment_person_id,
        ip.name AS last_investment_person_name
       FROM project_properties prop
       LEFT JOIN sales s ON s.id = prop.last_sale_id
       LEFT JOIN people sp ON sp.id = s.seller_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN investments inv ON inv.id = prop.last_investment_id
       LEFT JOIN people ip ON ip.id = inv.person_id
       ${where}
       ORDER BY prop.name ASC`,
      params
    );
    res.json({ properties });
  }
);

app.get(
  "/blocks/:id/properties",
  requirePermission("projects:read"),
  async (req, res) => {
    const { id } = req.params;
    const status = String(req.query.status || "available").toLowerCase();
    const params = [id];
    let where = "WHERE prop.block_id = ?";
    if (status === "available") {
      where += " AND prop.status = 'available'";
    } else if (status === "sold") {
      where += " AND prop.status = 'sold'";
    }
    const properties = await allAsync(
      `SELECT prop.*,
        s.sale_date AS last_sale_date,
        s.total_amount AS last_sale_amount,
        s.area_sq_yd AS last_sale_area,
        s.actual_area_sq_yd AS last_sale_actual_area,
        s.status AS last_sale_status,
        s.seller_id AS last_sale_seller_id,
        sp.name AS last_sale_seller_name,
        sp.phone AS last_sale_seller_phone,
        c.name AS last_sale_customer_name,
        c.phone AS last_sale_customer_phone,
        inv.date AS last_investment_date,
        inv.amount AS last_investment_amount,
        inv.area_sq_yd AS last_investment_area,
        inv.actual_area_sq_yd AS last_investment_actual_area,
        inv.return_percent AS last_investment_return_percent,
        inv.buyback_date AS last_investment_buyback_date,
        inv.status AS last_investment_status,
        inv.person_id AS last_investment_person_id,
        ip.name AS last_investment_person_name
       FROM project_properties prop
       LEFT JOIN sales s ON s.id = prop.last_sale_id
       LEFT JOIN people sp ON sp.id = s.seller_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN investments inv ON inv.id = prop.last_investment_id
       LEFT JOIN people ip ON ip.id = inv.person_id
       ${where}
       ORDER BY prop.name ASC`,
      params
    );
    res.json({ properties });
  }
);

app.post("/projects", requirePermission("projects:write"), async (req, res) => {
  const {
    name,
    city,
    state,
    pincode,
    address,
    total_area,
    total_value,
    blocks,
  } = req.body;
  const id = randomUUID();
  const cleanedBlocks = Array.isArray(blocks)
    ? blocks.map((block) => ({
        name: String(block.name || "")
          .trim()
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase(),
        total_properties: Number(block.total_properties || 0),
      }))
    : [];
  if (cleanedBlocks.some((block) => !block.name)) {
    return res.status(400).json({ error: "Block names must be letters only." });
  }
  await runAsync(
    `INSERT INTO projects (id, name, city, state, pincode, address, total_area, total_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      city,
      state,
      pincode,
      address,
      total_area || null,
      total_value || null,
      new Date().toISOString(),
    ]
  );
  if (cleanedBlocks.length) {
    for (const block of cleanedBlocks) {
      const blockId = randomUUID();
      await runAsync(
        `INSERT INTO project_blocks (id, project_id, name, total_properties)
         VALUES (?, ?, ?, ?)`,
        [
          blockId,
          id,
          block.name,
          Number(block.total_properties || 0),
        ]
      );
      const totalProps = Number(block.total_properties || 0);
      for (let i = 1; i <= totalProps; i += 1) {
        const propId = randomUUID();
        await runAsync(
          `INSERT INTO project_properties (id, project_id, block_id, name, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            propId,
            id,
            blockId,
            `${block.name}-${i}`,
            "available",
            new Date().toISOString(),
          ]
        );
      }
    }
  }
  await logActivity({
    action_type: "CREATE_PROJECT",
    entity_type: "project",
    entity_id: id,
    payload: {
      name,
      city,
      state,
      pincode,
      address,
      total_area,
      total_value,
      blocks: cleanedBlocks,
    },
  });
  res.json({ id });
});

app.put("/config", requirePermission("settings:write"), async (req, res) => {
  const current = await getAsync(
    "SELECT value FROM app_config WHERE key = 'commission_config'"
  );
  const config = req.body;
  await upsertCommissionConfig(config);
  await runAsync(
    `INSERT INTO commission_config_history (id, created_at, level_rates_json, personal_rates_json)
     VALUES (?, ?, ?, ?)`,
    [
      randomUUID(),
      new Date().toISOString(),
      JSON.stringify(config.levelRates || []),
      JSON.stringify(config.personalRates || []),
    ]
  );
  clearCache();
  await logActivity({
    action_type: "UPDATE_CONFIG",
    entity_type: "config",
    entity_id: "commission_config",
    payload: config,
    undo_payload: current ? JSON.parse(current.value) : null,
  });
  res.json({ ok: true });
});

app.get("/people", requirePermission("people:read"), async (_req, res) => {
  const cancelledCount = await autoCancelOverdueInvestments();
  if (cancelledCount) {
    clearCache();
  }
  const rows = await allAsync("SELECT * FROM people ORDER BY join_date DESC");
  res.json(rows);
});

app.post("/people", requirePermission("people:write"), async (req, res) => {
  const { name, sponsor_id, sponsor_stage, phone, join_date, is_special } = req.body;
  const trimmedName = String(name || "").trim();
  const existing = await getAsync(
    "SELECT id FROM people WHERE lower(trim(name)) = lower(trim(?))",
    [trimmedName]
  );
  if (existing) {
    return res.status(400).json({ error: "Person name must be unique." });
  }
  if (sponsor_id) {
    const recruitCount = await getAsync(
      "SELECT COUNT(*) as count FROM people WHERE sponsor_id = ?",
      [sponsor_id]
    );
    if ((recruitCount?.count || 0) >= 6) {
      return res
        .status(400)
        .json({ error: "This member already has 6 direct recruits." });
    }
  }
  const id = randomUUID();
  const specialFlag = Number(is_special || 0) === 1 ? 1 : 0;
  const status = specialFlag ? "active" : "pending";
  await runAsync(
    "INSERT INTO people (id, name, sponsor_id, sponsor_stage, phone, join_date, status, is_special) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      trimmedName,
      sponsor_id || null,
      sponsor_stage || null,
      phone || null,
      join_date,
      status,
      specialFlag,
    ]
  );
  await logActivity({
    action_type: "CREATE_PERSON",
    entity_type: "person",
    entity_id: id,
    payload: {
      name: trimmedName,
      sponsor_id,
      sponsor_stage,
      phone,
      join_date,
      status,
      is_special: specialFlag,
    },
  });
  res.json({ id });
});

app.put("/people/:id", requirePermission("people:write"), async (req, res) => {
  const { id } = req.params;
  const { name, phone, join_date } = req.body;
  const trimmedName = String(name || "").trim();
  const existing = await getAsync(
    "SELECT id FROM people WHERE lower(trim(name)) = lower(trim(?)) AND id <> ?",
    [trimmedName, id]
  );
  if (existing) {
    return res.status(400).json({ error: "Person name must be unique." });
  }
  const current = await getAsync("SELECT * FROM people WHERE id = ?", [id]);
  await runAsync(
    "UPDATE people SET name = ?, phone = ?, join_date = ? WHERE id = ?",
    [trimmedName, phone || null, join_date, id]
  );
  await logActivity({
    action_type: "UPDATE_PERSON",
    entity_type: "person",
    entity_id: id,
    payload: { name: trimmedName, phone, join_date },
    undo_payload: current
      ? {
          name: current.name,
          phone: current.phone,
          join_date: current.join_date,
        }
      : null,
  });
  res.json({ ok: true });
});

app.delete("/people/:id", requirePermission("people:write"), async (req, res) => {
  const { id } = req.params;
  const recruits = await allAsync(
    "SELECT id FROM people WHERE sponsor_id = ? LIMIT 1",
    [id]
  );
  if (recruits.length > 0) {
    return res
      .status(400)
      .json({ error: "Cannot delete member with recruits." });
  }
  const sales = await allAsync(
    "SELECT id FROM sales WHERE seller_id = ? LIMIT 1",
    [id]
  );
  if (sales.length > 0) {
    return res
      .status(400)
      .json({ error: "Cannot delete member with property sales." });
  }
  await runAsync("DELETE FROM investments WHERE person_id = ?", [id]);
  await runAsync("DELETE FROM commission_payments WHERE person_id = ?", [id]);
  await runAsync("DELETE FROM people WHERE id = ?", [id]);
  res.json({ ok: true });
});

app.get("/sales", requirePermission("sales:read"), async (_req, res) => {
  const cancelledCount = await autoCancelOverdueSales();
  if (cancelledCount) {
    clearCache();
  }
  const rows = await allAsync("SELECT * FROM sales ORDER BY sale_date DESC");
  res.json(rows);
});

app.get("/sales/:id", requirePermission("sales:read"), async (req, res) => {
  const { id } = req.params;
  const sale = await getAsync("SELECT * FROM sales WHERE id = ?", [id]);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found." });
  }
  const payments = await allAsync(
    "SELECT amount, date FROM payments WHERE sale_id = ? ORDER BY date ASC",
    [id]
  );
  res.json({ sale, payments });
});

app.post(
  "/sales/:id/buyback",
  requirePermission("buybacks:write"),
  async (req, res) => {
    const { id } = req.params;
    const { paid_amount, paid_date } = req.body;
    if (!paid_date) {
      return res.status(400).json({ error: "Paid date is required." });
    }
    const sale = await getAsync("SELECT * FROM sales WHERE id = ?", [id]);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found." });
    }
    if (!sale.buyback_enabled) {
      return res.status(400).json({ error: "Buyback is not enabled for this sale." });
    }
    if (sale.status === "cancelled") {
      return res.status(400).json({ error: "Cancelled sale cannot be paid out." });
    }
    const paidRow = await getAsync(
      "SELECT COALESCE(SUM(amount),0) as total_paid FROM payments WHERE sale_id = ?",
      [id]
    );
    if ((paidRow?.total_paid || 0) < sale.total_amount) {
      return res.status(400).json({ error: "Sale is not fully paid." });
    }
    if (sale.buyback_date) {
      const dueDate = sale.buyback_date.includes("T")
        ? new Date(sale.buyback_date)
        : new Date(`${sale.buyback_date}T23:59:59`);
      if (new Date(paid_date) < dueDate) {
        return res
          .status(400)
          .json({ error: "Buyback date is yet to come." });
      }
    }
    const expectedAmount = sale.buyback_return_percent
      ? Math.round((sale.total_amount * sale.buyback_return_percent) / 100)
      : sale.total_amount;
    const finalAmount =
      paid_amount === undefined || paid_amount === null || paid_amount === ""
        ? expectedAmount
        : Number(paid_amount);
    const previousBuyback = {
      buyback_status: sale.buyback_status,
      buyback_paid_amount: sale.buyback_paid_amount,
      buyback_paid_date: sale.buyback_paid_date,
    };
    await runAsync(
      "UPDATE sales SET buyback_status = 'paid', buyback_paid_amount = ?, buyback_paid_date = ? WHERE id = ?",
      [finalAmount, paid_date, id]
    );
    await logActivity({
      action_type: "UPDATE_SALE_BUYBACK",
      entity_type: "sale",
      entity_id: id,
      payload: {
        buyback_paid_amount: finalAmount,
        buyback_paid_date: paid_date,
      },
      undo_payload: previousBuyback,
    });
    res.json({ ok: true });
  }
);

app.get("/customers", requirePermission("sales:read"), async (req, res) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  const sort = String(req.query.sort || "recent").trim();
  const filters = [];
  const params = [];
  if (search) {
    filters.push("(lower(c.name) LIKE ? OR c.phone LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const orderBy =
    sort === "alpha" ? "ORDER BY c.name ASC" : "ORDER BY last_purchase DESC";
  const rows = await allAsync(
    `SELECT c.*,
            COUNT(s.id) as total_purchases,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END),0) as total_spent,
            MAX(s.sale_date) as last_purchase
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id
     ${where}
     GROUP BY c.id
     ${orderBy}`,
    params
  );
  res.json(rows);
});

app.get("/customers/:id", requirePermission("sales:read"), async (req, res) => {
  const { id } = req.params;
  const customer = await getAsync("SELECT * FROM customers WHERE id = ?", [id]);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found." });
  }
  const sales = await allAsync(
    `SELECT s.*, pr.name as project_name, b.name as block_name, prop.name as property_name
     FROM sales s
     LEFT JOIN projects pr ON pr.id = s.project_id
     LEFT JOIN project_blocks b ON b.id = s.block_id
     LEFT JOIN project_properties prop ON prop.id = s.property_id
     WHERE s.customer_id = ?
     ORDER BY s.sale_date DESC`,
    [id]
  );
  res.json({ customer, sales });
});

app.post("/sales", requirePermission("sales:write"), async (req, res) => {
  const {
    seller_id,
    property_name,
    project_id,
    block_id,
    property_id,
    location,
    area_sq_yd,
    actual_area_sq_yd,
    total_amount,
    sale_date,
    customer_name,
    customer_phone,
    customer_address,
    buyback_enabled,
    buyback_months,
    buyback_return_percent,
  } = req.body;
  if (!property_id) {
    return res.status(400).json({ error: "Property selection is required." });
  }
  let customer = null;
  try {
    customer = await resolveCustomer({
      name: customer_name,
      phone: customer_phone,
      address: customer_address,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid customer." });
  }
  const buybackEnabled = Number(buyback_enabled || 0) === 1;
  if (buybackEnabled && !buyback_months) {
    return res
      .status(400)
      .json({ error: "Buyback period is required." });
  }
  if (buybackEnabled && !buyback_return_percent) {
    return res
      .status(400)
      .json({ error: "Buyback return percentage is required." });
  }
  const property = await getAsync(
    "SELECT * FROM project_properties WHERE id = ?",
    [property_id]
  );
  if (!property) {
    return res.status(400).json({ error: "Invalid property selection." });
  }
  if (property.status !== "available") {
    return res.status(400).json({ error: "Property is not available." });
  }
  if (project_id && property.project_id !== project_id) {
    return res.status(400).json({ error: "Property does not match project." });
  }
  if (block_id && property.block_id !== block_id) {
    return res.status(400).json({ error: "Property does not match block." });
  }
  let displayName = String(property_name || "").trim();
  if (!displayName && project_id && block_id) {
    const project = await getAsync("SELECT name FROM projects WHERE id = ?", [
      project_id,
    ]);
    const block = await getAsync(
      "SELECT name FROM project_blocks WHERE id = ?",
      [block_id]
    );
    if (project && block) {
      displayName = `${project.name} - ${block.name}`;
    }
  }
  if (!displayName) {
    displayName = "Property";
  }
  const id = randomUUID();
  const buybackDate = null;
  await runAsync(
    `INSERT INTO sales (id, seller_id, property_name, location, area_sq_yd, actual_area_sq_yd, total_amount, sale_date, status, project_id, block_id, property_id, customer_id, buyback_enabled, buyback_months, buyback_return_percent, buyback_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      seller_id,
      displayName,
      location,
      area_sq_yd,
      actual_area_sq_yd ?? null,
      total_amount,
      sale_date,
      "active",
      project_id || null,
      block_id || null,
      property_id,
      customer?.id || null,
      buybackEnabled ? 1 : 0,
      buybackEnabled ? Number(buyback_months) : null,
      buybackEnabled ? Number(buyback_return_percent) : null,
      buybackDate,
    ]
  );
  await runAsync(
    "UPDATE project_properties SET status = 'sold', last_sale_id = ? WHERE id = ?",
    [id, property_id]
  );
  await logActivity({
    action_type: "CREATE_SALE",
    entity_type: "sale",
    entity_id: id,
    payload: {
      seller_id,
      property_name: displayName,
      project_id,
      block_id,
      property_id,
      location,
      area_sq_yd,
      actual_area_sq_yd: actual_area_sq_yd ?? null,
      total_amount,
      sale_date,
      customer_id: customer?.id || null,
      buyback_enabled: buybackEnabled ? 1 : 0,
      buyback_months: buybackEnabled ? Number(buyback_months) : null,
      buyback_return_percent: buybackEnabled ? Number(buyback_return_percent) : null,
      buyback_date: buybackDate,
    },
  });
  res.json({ id });
});

app.put("/sales/:id", requirePermission("sales:write"), async (req, res) => {
  const { id } = req.params;
  const {
    seller_id,
    property_name,
    project_id,
    block_id,
    property_id,
    location,
    area_sq_yd,
    actual_area_sq_yd,
    total_amount,
    sale_date,
    customer_name,
    customer_phone,
    customer_address,
    buyback_enabled,
    buyback_months,
    buyback_return_percent,
  } = req.body;
  if (!property_id) {
    return res.status(400).json({ error: "Property selection is required." });
  }
  let customer = null;
  try {
    customer = await resolveCustomer({
      name: customer_name,
      phone: customer_phone,
      address: customer_address,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid customer." });
  }
  const buybackEnabled = Number(buyback_enabled || 0) === 1;
  if (buybackEnabled && !buyback_months) {
    return res
      .status(400)
      .json({ error: "Buyback period is required." });
  }
  if (buybackEnabled && !buyback_return_percent) {
    return res
      .status(400)
      .json({ error: "Buyback return percentage is required." });
  }
  const property = await getAsync(
    "SELECT * FROM project_properties WHERE id = ?",
    [property_id]
  );
  if (!property) {
    return res.status(400).json({ error: "Invalid property selection." });
  }
  if (project_id && property.project_id !== project_id) {
    return res.status(400).json({ error: "Property does not match project." });
  }
  if (block_id && property.block_id !== block_id) {
    return res.status(400).json({ error: "Property does not match block." });
  }
  let displayName = String(property_name || "").trim();
  if (!displayName && project_id && block_id) {
    const project = await getAsync("SELECT name FROM projects WHERE id = ?", [
      project_id,
    ]);
    const block = await getAsync(
      "SELECT name FROM project_blocks WHERE id = ?",
      [block_id]
    );
    if (project && block) {
      displayName = `${project.name} - ${block.name}`;
    }
  }
  if (!displayName) {
    displayName = "Property";
  }
  const current = await getAsync("SELECT * FROM sales WHERE id = ?", [id]);
  if (property.status !== "available" && property.id !== current.property_id) {
    return res.status(400).json({ error: "Property is not available." });
  }
  const payments = await allAsync(
    "SELECT amount, date FROM payments WHERE sale_id = ?",
    [id]
  );
  const totalPaid = payments.reduce((acc, payment) => acc + payment.amount, 0);
  const completionDate = totalPaid >= Number(total_amount || 0)
    ? payments.reduce((latest, payment) => {
        if (!latest) return payment.date;
        return new Date(payment.date) > new Date(latest) ? payment.date : latest;
      }, null)
    : null;
  const buybackDate =
    buybackEnabled && completionDate
      ? toISODate(addMonths(completionDate, Number(buyback_months || 0)))
      : null;
  const nextBuybackStatus = buybackEnabled
    ? current?.buyback_status === "paid"
      ? "paid"
      : "pending"
    : "cancelled";
  await runAsync(
    `UPDATE sales
     SET seller_id = ?, property_name = ?, location = ?, area_sq_yd = ?, actual_area_sq_yd = ?, total_amount = ?, sale_date = ?, project_id = ?, block_id = ?, property_id = ?, customer_id = ?, buyback_enabled = ?, buyback_months = ?, buyback_return_percent = ?, buyback_date = ?, buyback_status = ?
     WHERE id = ?`,
    [
      seller_id,
      displayName,
      location,
      area_sq_yd,
      actual_area_sq_yd ?? null,
      total_amount,
      sale_date,
      project_id || null,
      block_id || null,
      property_id,
      customer?.id || null,
      buybackEnabled ? 1 : 0,
      buybackEnabled ? Number(buyback_months) : null,
      buybackEnabled ? Number(buyback_return_percent) : null,
      buybackDate,
      nextBuybackStatus,
      id,
    ]
  );
  if (current.property_id && current.property_id !== property_id) {
    await runAsync(
      "UPDATE project_properties SET status = 'available', last_sale_id = NULL WHERE id = ?",
      [current.property_id]
    );
  }
  if (property_id && current.property_id !== property_id) {
    await runAsync(
      "UPDATE project_properties SET status = 'sold', last_sale_id = ? WHERE id = ?",
      [id, property_id]
    );
  }
  await logActivity({
    action_type: "UPDATE_SALE",
    entity_type: "sale",
    entity_id: id,
    payload: {
      seller_id,
      property_name: displayName,
      project_id,
      block_id,
      property_id,
      location,
      area_sq_yd,
      actual_area_sq_yd: actual_area_sq_yd ?? null,
      total_amount,
      sale_date,
      customer_id: customer?.id || null,
      buyback_enabled: buybackEnabled ? 1 : 0,
      buyback_months: buybackEnabled ? Number(buyback_months) : null,
      buyback_return_percent: buybackEnabled ? Number(buyback_return_percent) : null,
      buyback_date: buybackDate,
    },
    undo_payload: current,
  });
  res.json({ ok: true });
});

app.get(
  "/investments",
  requireAnyPermission(["people:read", "buybacks:read"]),
  async (_req, res) => {
  const cancelledCount = await autoCancelOverdueInvestments();
  if (cancelledCount) {
    clearCache();
  }
  const rows = await allAsync(
    "SELECT * FROM investments ORDER BY date DESC"
  );
  res.json(rows);
});

app.post(
  "/investments",
  requireAnyPermission(["people:write", "buybacks:write"]),
  async (req, res) => {
  const {
    person_id,
    stage,
    amount,
    area_sq_yd,
    actual_area_sq_yd,
    date,
    buyback_months,
    return_percent,
    project_id,
    block_id,
    property_id,
    status,
    initial_payment_amount,
    initial_payment_date,
  } = req.body;
  if (!property_id) {
    return res.status(400).json({ error: "Property selection is required." });
  }
  const property = await getAsync(
    "SELECT * FROM project_properties WHERE id = ?",
    [property_id]
  );
  if (!property) {
    return res.status(400).json({ error: "Invalid property selection." });
  }
  if (property.status !== "available") {
    return res.status(400).json({ error: "Property is not available." });
  }
  if (project_id && property.project_id !== project_id) {
    return res.status(400).json({ error: "Property does not match project." });
  }
  if (block_id && property.block_id !== block_id) {
    return res.status(400).json({ error: "Property does not match block." });
  }
  const id = randomUUID();
  const baseAmount = Number(amount || 0);
  const initialPayment = Number(initial_payment_amount || 0);
  if (initialPayment) {
    const minFirstPayment = Math.ceil(baseAmount * 0.1);
    if (initialPayment < minFirstPayment) {
      return res.status(400).json({
        error: `First payment must be at least ${minFirstPayment}.`,
      });
    }
    if (initialPayment > baseAmount) {
      return res.status(400).json({
        error: "Initial payment exceeds investment amount.",
      });
    }
  }
  const paymentStatus = initialPayment >= baseAmount && baseAmount > 0 ? "paid" : "pending";
  const paidDate = paymentStatus === "paid" ? (initial_payment_date || date) : null;
  const buybackDate =
    paymentStatus === "paid"
      ? toISODate(addMonths(paidDate, Number(buyback_months || 36)))
      : "";
  const paidAmount = paymentStatus === "paid" ? baseAmount : null;
  await runAsync(
    `INSERT INTO investments (id, person_id, stage, amount, area_sq_yd, actual_area_sq_yd, date, buyback_date, buyback_months, return_percent, project_id, block_id, property_id, status, payment_status, paid_amount, paid_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      person_id,
      stage,
      baseAmount,
      area_sq_yd || 0,
      actual_area_sq_yd ?? null,
      date,
      buybackDate,
      buyback_months || 36,
      return_percent || 200,
      project_id || null,
      block_id || null,
      property_id,
      status,
      paymentStatus,
      paidAmount,
      paidDate,
    ]
  );
  if (initialPayment) {
    const paymentId = randomUUID();
    await runAsync(
      "INSERT INTO investment_payments (id, investment_id, amount, date) VALUES (?, ?, ?, ?)",
      [
        paymentId,
        id,
        initialPayment,
        initial_payment_date || date,
      ]
    );
  }
  await runAsync(
    "UPDATE people SET status = ? WHERE id = ?",
    [paymentStatus === "paid" ? "active" : "pending", person_id]
  );
  await runAsync(
    "UPDATE project_properties SET status = 'sold', last_investment_id = ? WHERE id = ?",
    [id, property_id]
  );
  await logActivity({
    action_type: "CREATE_INVESTMENT",
    entity_type: "investment",
    entity_id: id,
    payload: {
      person_id,
      stage,
      amount,
      area_sq_yd,
      actual_area_sq_yd: actual_area_sq_yd ?? null,
      date,
      buyback_date: buybackDate,
      buyback_months,
      return_percent,
      project_id,
      block_id,
      property_id,
      status,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      paid_date: paidDate,
    },
  });
  res.json({ id });
});

app.put(
  "/investments/:id",
  requireAnyPermission(["people:write", "buybacks:write"]),
  async (req, res) => {
  const { id } = req.params;
  const {
    status,
    paid_amount,
    paid_date,
    area_sq_yd,
    actual_area_sq_yd,
    return_percent,
  } = req.body;
  const current = await getAsync("SELECT * FROM investments WHERE id = ?", [id]);
  if (!current) return res.status(404).json({ error: "Not found" });
  const nextStatus = status ?? current.status;
  const nextPaidDate =
    paid_date === undefined ? current.paid_date : paid_date;
  let nextBuybackDate = current.buyback_date || "";
  if (nextStatus === "paid") {
    const completionDate = nextPaidDate || new Date().toISOString();
    nextBuybackDate = toISODate(
      addMonths(completionDate, Number(current.buyback_months || 36))
    );
  }
  if (nextStatus === "paid" && current.status !== "paid") {
    if (current.buyback_date) {
      const dueDate = current.buyback_date.includes("T")
        ? new Date(current.buyback_date)
        : new Date(`${current.buyback_date}T23:59:59`);
      if (new Date() < dueDate) {
        return res
          .status(400)
          .json({ error: "Buyback date is yet to come." });
      }
    }
  }
  const nextPaidAmount =
    paid_amount === undefined ? current.paid_amount : paid_amount;
  const nextAreaSqYd =
    area_sq_yd === undefined ? current.area_sq_yd : area_sq_yd;
  const nextActualAreaSqYd =
    actual_area_sq_yd === undefined ? current.actual_area_sq_yd : actual_area_sq_yd;
  const nextReturnPercent =
    return_percent === undefined ? current.return_percent : return_percent;
  await runAsync(
    "UPDATE investments SET status = ?, paid_amount = ?, paid_date = ?, buyback_date = ?, area_sq_yd = ?, actual_area_sq_yd = ?, return_percent = ? WHERE id = ?",
    [
      nextStatus,
      nextPaidAmount || null,
      nextPaidDate || null,
      nextBuybackDate,
      nextAreaSqYd,
      nextActualAreaSqYd ?? null,
      nextReturnPercent,
      id,
    ]
  );
  const actionType =
    area_sq_yd !== undefined || return_percent !== undefined
      ? "UPDATE_INVESTMENT"
      : "UPDATE_BUYBACK";
  await logActivity({
    action_type: actionType,
    entity_type: "investment",
    entity_id: id,
    payload: {
      status: nextStatus,
      paid_amount: nextPaidAmount,
      paid_date: nextPaidDate,
      buyback_date: nextBuybackDate,
      area_sq_yd: nextAreaSqYd,
      actual_area_sq_yd: nextActualAreaSqYd ?? null,
      return_percent: nextReturnPercent,
    },
    undo_payload: current,
  });
  res.json({ ok: true });
});

app.get("/payments", requirePermission("sales:read"), async (_req, res) => {
  const cancelledCount = await autoCancelOverdueSales();
  if (cancelledCount) {
    clearCache();
  }
  const rows = await allAsync("SELECT * FROM payments ORDER BY date DESC");
  res.json(rows);
});

app.post("/payments", requirePermission("sales:write"), async (req, res) => {
  const { sale_id, amount, date } = req.body;
  const sale = await getAsync("SELECT * FROM sales WHERE id = ?", [sale_id]);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found." });
  }
  if (sale.status === "cancelled") {
    return res.status(400).json({ error: "Cannot add payment to cancelled sale." });
  }
  const dueDate = addWorkingDays(sale.sale_date, 15);
  const paymentDate = new Date(date);
  if (Number.isNaN(paymentDate.getTime())) {
    return res.status(400).json({ error: "Invalid payment date." });
  }
  const existingPayments = await allAsync(
    "SELECT amount, date FROM payments WHERE sale_id = ?",
    [sale_id]
  );
  const paidSoFar = existingPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0
  );
  if (paidSoFar === 0) {
    const minFirstPayment = Math.ceil(sale.total_amount * 0.1);
    if (Number(amount) < minFirstPayment) {
      return res.status(400).json({
        error: `First payment must be at least ${minFirstPayment}.`,
      });
    }
  }
  if (paidSoFar >= sale.total_amount) {
    return res.status(400).json({ error: "Sale is already fully paid." });
  }
  if (paidSoFar + Number(amount) > sale.total_amount) {
    return res
      .status(400)
      .json({ error: "Payment exceeds remaining amount." });
  }
  if (paymentDate > dueDate) {
    await cancelSale(
      sale,
      paidSoFar,
      "Payment received after 15 working days"
    );
    return res.status(400).json({
      error: "Payment is beyond 15 working days. Sale cancelled.",
    });
  }
  const id = randomUUID();
  await runAsync(
    "INSERT INTO payments (id, sale_id, amount, date) VALUES (?, ?, ?, ?)",
    [id, sale_id, amount, date]
  );
  const newTotal = paidSoFar + Number(amount);
  if (newTotal >= sale.total_amount && Number(sale.buyback_enabled || 0) === 1) {
    const buybackDate = toISODate(
      addMonths(date, Number(sale.buyback_months || 0))
    );
    const nextStatus = sale.buyback_status === "paid" ? "paid" : "pending";
    await runAsync(
      "UPDATE sales SET buyback_date = ?, buyback_status = ? WHERE id = ?",
      [buybackDate, nextStatus, sale_id]
    );
  }
  await logActivity({
    action_type: "CREATE_PAYMENT",
    entity_type: "payment",
    entity_id: id,
    payload: { sale_id, amount, date },
  });
  await autoCancelOverdueSales();
  res.json({ id });
});

app.get(
  "/investment-payments",
  requireAnyPermission(["people:read", "buybacks:read"]),
  async (req, res) => {
    const investmentId = String(req.query.investmentId || "").trim();
    const params = [];
    let where = "";
    if (investmentId) {
      where = "WHERE investment_id = ?";
      params.push(investmentId);
    }
    const rows = await allAsync(
      `SELECT * FROM investment_payments ${where} ORDER BY date DESC`,
      params
    );
    res.json(rows);
  }
);

app.post(
  "/investment-payments",
  requireAnyPermission(["people:write", "buybacks:write"]),
  async (req, res) => {
    const { investment_id, amount, date } = req.body;
    if (!investment_id || !amount || !date) {
      return res.status(400).json({ error: "All payment fields are required." });
    }
    const investment = await getAsync(
      "SELECT * FROM investments WHERE id = ?",
      [investment_id]
    );
    if (!investment) {
      return res.status(404).json({ error: "Investment not found." });
    }
    if (investment.payment_status === "cancelled") {
      return res
        .status(400)
        .json({ error: "Cannot add payment to cancelled investment." });
    }
    if (investment.payment_status === "paid") {
      return res
        .status(400)
        .json({ error: "Investment is already fully paid." });
    }
    const dueDate = addWorkingDays(investment.date, 15);
    const paymentDate = new Date(date);
    if (Number.isNaN(paymentDate.getTime())) {
      return res.status(400).json({ error: "Invalid payment date." });
    }
    const existingPayments = await allAsync(
      "SELECT amount, date FROM investment_payments WHERE investment_id = ?",
      [investment_id]
    );
    const paidSoFar = existingPayments.reduce(
      (acc, payment) => acc + payment.amount,
      0
    );
    if (paidSoFar === 0) {
      const minFirstPayment = Math.ceil(investment.amount * 0.1);
      if (Number(amount) < minFirstPayment) {
        return res.status(400).json({
          error: `First payment must be at least ${minFirstPayment}.`,
        });
      }
    }
    if (paidSoFar + Number(amount) > investment.amount) {
      return res
        .status(400)
        .json({ error: "Payment exceeds remaining amount." });
    }
    if (paymentDate > dueDate) {
      await cancelInvestment(
        investment,
        paidSoFar,
        "Payment received after 15 working days"
      );
      return res.status(400).json({
        error: "Payment is beyond 15 working days. Investment cancelled.",
      });
    }
    const id = randomUUID();
    await runAsync(
      "INSERT INTO investment_payments (id, investment_id, amount, date) VALUES (?, ?, ?, ?)",
      [id, investment_id, amount, date]
    );
    await logActivity({
      action_type: "CREATE_INVESTMENT_PAYMENT",
      entity_type: "investment_payment",
      entity_id: id,
      payload: { investment_id, amount, date },
    });
    const newTotal = paidSoFar + Number(amount);
    if (newTotal >= investment.amount) {
      const buybackDate = toISODate(
        addMonths(date, Number(investment.buyback_months || 36))
      );
      await runAsync(
        "UPDATE investments SET payment_status = 'paid', paid_amount = ?, paid_date = ?, buyback_date = ? WHERE id = ?",
        [newTotal, date, buybackDate, investment_id]
      );
      await runAsync("UPDATE people SET status = 'active' WHERE id = ?", [
        investment.person_id,
      ]);
    }
    res.json({ id });
  }
);

app.get(
  "/commission-payments",
  requirePermission("commissions:read"),
  async (_req, res) => {
  const rows = await allAsync(
    "SELECT * FROM commission_payments ORDER BY date DESC"
  );
  res.json(rows);
});

app.post(
  "/admin/repair-stage-recruits",
  requirePermission("settings:write"),
  async (_req, res) => {
  const people = await allAsync("SELECT * FROM people");
  const investments = await allAsync("SELECT * FROM investments");

  const peopleIndex = new Map();
  people.forEach((person) => {
    peopleIndex.set(person.id, {
      ...person,
      recruits: [],
    });
  });
  people.forEach((person) => {
    if (person.sponsor_id && peopleIndex.has(person.sponsor_id)) {
      peopleIndex.get(person.sponsor_id).recruits.push(person);
    }
  });

  const investmentsByPerson = new Map();
  investments.forEach((inv) => {
    const list = investmentsByPerson.get(inv.person_id) || [];
    list.push(inv);
    investmentsByPerson.set(inv.person_id, list);
  });

  const updates = [];
  const assignStages = (sponsorId) => {
    const sponsor = peopleIndex.get(sponsorId);
    if (!sponsor) return;
    const sponsorInvestments = investmentsByPerson.get(sponsorId) || [];
    const maxStage = sponsorInvestments.length
      ? Math.max(...sponsorInvestments.map((inv) => inv.stage))
      : 1;
    const recruits = sponsor.recruits.sort((a, b) =>
      a.join_date.localeCompare(b.join_date)
    );

    let cursor = 0;
    for (let stage = 1; stage <= maxStage; stage += 1) {
      const slice = recruits.slice(cursor, cursor + 6);
      slice.forEach((recruit) => {
        if (recruit.sponsor_stage !== stage) {
          updates.push({ id: recruit.id, sponsor_stage: stage });
        }
      });
      cursor += 6;
    }

    recruits.forEach((recruit) => assignStages(recruit.id));
  };

  people
    .filter((person) => !person.sponsor_id)
    .forEach((root) => assignStages(root.id));

  for (const update of updates) {
    await runAsync("UPDATE people SET sponsor_stage = ? WHERE id = ?", [
      update.sponsor_stage,
      update.id,
    ]);
  }

  res.json({ updated: updates.length });
});

app.post(
  "/commission-payments",
  requirePermission("commissions:write"),
  async (req, res) => {
  const { person_id, amount, date, note } = req.body;
  const id = randomUUID();
  await runAsync(
    "INSERT INTO commission_payments (id, person_id, amount, date, note) VALUES (?, ?, ?, ?, ?)",
    [id, person_id, amount, date, note || null]
  );
  await logActivity({
    action_type: "CREATE_COMMISSION_PAYMENT",
    entity_type: "commission_payment",
    entity_id: id,
    payload: { person_id, amount, date, note },
  });
  res.json({ id });
});

app.get("/employees", requirePermission("employees:read"), async (_req, res) => {
  const rows = await allAsync("SELECT * FROM employees ORDER BY join_date DESC");
  res.json(rows);
});

app.post(
  "/employees",
  requirePermission("employees:write"),
  async (req, res) => {
    const { name, role, phone, join_date, monthly_salary } = req.body;
    if (!name || !role || !join_date || !monthly_salary) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const id = randomUUID();
    await runAsync(
      `INSERT INTO employees (id, name, role, phone, join_date, monthly_salary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        role,
        phone || null,
        join_date,
        monthly_salary,
        new Date().toISOString(),
      ]
    );
    await logActivity({
      action_type: "CREATE_EMPLOYEE",
      entity_type: "employee",
      entity_id: id,
      payload: { name, role, phone, join_date, monthly_salary },
    });
    res.json({ id });
  }
);

app.put(
  "/employees/:id",
  requirePermission("employees:write"),
  async (req, res) => {
    const { id } = req.params;
    const { name, role, phone, join_date, monthly_salary } = req.body;
    const current = await getAsync("SELECT * FROM employees WHERE id = ?", [
      id,
    ]);
    if (!current) {
      return res.status(404).json({ error: "Employee not found." });
    }
    const nextName = name ?? current.name;
    const nextRole = role ?? current.role;
    const nextPhone = phone ?? current.phone;
    const nextJoinDate = join_date ?? current.join_date;
    const nextSalary =
      monthly_salary === undefined ? current.monthly_salary : monthly_salary;
    await runAsync(
      "UPDATE employees SET name = ?, role = ?, phone = ?, join_date = ?, monthly_salary = ? WHERE id = ?",
      [nextName, nextRole, nextPhone, nextJoinDate, nextSalary, id]
    );
    await logActivity({
      action_type: "UPDATE_EMPLOYEE",
      entity_type: "employee",
      entity_id: id,
      payload: {
        name: nextName,
        role: nextRole,
        phone: nextPhone,
        join_date: nextJoinDate,
        monthly_salary: nextSalary,
      },
      undo_payload: current,
    });
    res.json({ ok: true });
  }
);

app.get(
  "/salary-payments",
  requirePermission("employees:read"),
  async (_req, res) => {
    const rows = await allAsync(
      "SELECT * FROM salary_payments ORDER BY paid_date DESC"
    );
    res.json(rows);
  }
);

app.post(
  "/salary-payments",
  requirePermission("employees:write"),
  async (req, res) => {
    const { employee_id, month, amount, paid_date } = req.body;
    if (!employee_id || !month || !amount || !paid_date) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const releaseDate = getSalaryReleaseDate(month);
    if (!releaseDate || new Date() < releaseDate) {
      return res
        .status(400)
        .json({ error: "Salary release date has not arrived yet." });
    }
    const employee = await getAsync(
      "SELECT * FROM employees WHERE id = ?",
      [employee_id]
    );
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }
    const existing = await getAsync(
      "SELECT id FROM salary_payments WHERE employee_id = ? AND month = ?",
      [employee_id, month]
    );
    if (existing) {
      return res.status(400).json({ error: "Salary already paid for this month." });
    }
    const id = randomUUID();
    await runAsync(
      `INSERT INTO salary_payments (id, employee_id, month, amount, paid_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, employee_id, month, amount, paid_date, new Date().toISOString()]
    );
    await logActivity({
      action_type: "CREATE_SALARY_PAYMENT",
      entity_type: "salary_payment",
      entity_id: id,
      payload: { employee_id, month, amount, paid_date },
    });
    res.json({ id });
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
