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
    // Suporta área-mãe -> descendentes (ex.: Finance -> Finance/2024/Q1)
    // e MPL root (MPL -> MPL · ...).
    const escapeLike = (s) => String(s || '').replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const ors = [];
    for (const k of areaKeys) {
      if (!k) continue;
      ors.push('area_key = ?');
      vals.push(k);

      if (k === 'MPL') {
        ors.push('area_key LIKE ? ESCAPE \'\\\'');
        vals.push('MPL · %');
      } else {
        ors.push('area_key LIKE ? ESCAPE \'\\\'');
        vals.push(escapeLike(k) + '/%');
      }
    }
    if (ors.length) clauses.push(`(${ors.join(' OR ')})`);
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
