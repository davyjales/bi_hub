const { pool } = require('../dbPool');

async function insertEntry({ userId, username, action, areaKey, oldAreaKey = null }) {
  const [r] = await pool.query(
    `INSERT INTO hub_directory_audit (user_id, username, action, area_key, old_area_key)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, username, action, areaKey, oldAreaKey || null],
  );
  return r.insertId;
}

async function listEntries({ limit = 100, userId = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const clauses = [];
  const vals = [];

  if (userId != null) {
    clauses.push('user_id = ?');
    vals.push(userId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, username, action, area_key AS areaKey,
            old_area_key AS oldAreaKey, created_at AS createdAt
       FROM hub_directory_audit
       ${where}
       ORDER BY created_at DESC
       LIMIT ${lim}`,
    vals,
  );
  return rows;
}

module.exports = { insertEntry, listEntries };
