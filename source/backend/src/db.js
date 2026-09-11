const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

/** Run a query, get the rows back. */
async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Same, but for a query that returns one row (or none). */
async function one(sql, params = []) {
  return (await q(sql, params))[0] || null;
}

module.exports = { q, one };
