const sqlite3 = require("sqlite3").verbose();
const { randomBytes, scryptSync } = require("crypto");
const db = new sqlite3.Database("C:/Users/user/Chirag/server/mlm-realty.db");
const salt = randomBytes(16).toString("hex");
const hash = scryptSync("Owner@12345", salt, 64).toString("hex");
const password_hash = `${salt}:${hash}`;
db.run("UPDATE users SET password_hash=? WHERE username=?", [password_hash, "owner"], function (err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log("owner password reset", this.changes);
  db.close();
});
