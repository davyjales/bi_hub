const { pool } = require('../dbPool');

async function insertEntry({ userId, username, action, areaKey, fileName, relativePath }) {
  const [r] = await pool.query(
    `INSERT INTO bi_file_audit (user_id, username, action, area_key, file_name, relative_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, username, action, areaKey, fileName, relativePath],
  );
  return r.insertId;
}

async function listEntries({ limit = 100, userId = null, areaKeys = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const clauses = [];
  const vals = [];

  if (userId != null) {
    clauses.push('user_id = ?');
    vals.push(userId);
  }
  if (areaKeys && areaKeys.length) {
    clauses.push(`area_key IN (${areaKeys.map(() => '?').join(', ')})`);
    vals.push(...areaKeys);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, username, action, area_key AS areaKey,
            file_name AS fileName, relative_path AS relativePath, created_at AS createdAt
       FROM bi_file_audit
       ${where}
       ORDER BY created_at DESC
       LIMIT ${lim}`,
    vals,
  );
  return rows;
}

module.exports = { insertEntry, listEntries };
