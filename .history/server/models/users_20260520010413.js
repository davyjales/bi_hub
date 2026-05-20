const { pool } = require('../dbPool');

async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash AS passwordHash, role, status FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  return rows[0] || null;
}

async function findPublicById(id) {
  const [rows] = await pool.query(
    'SELECT id, username, role, status, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

async function insertUser(username, passwordHash, role, status = 'pending') {
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)',
    [username, passwordHash, role, status],
  );
  return r.insertId;
}

async function setUserStatus(id, status) {
  const [r] = await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  return r.affectedRows > 0;
}


async function listUsers() {
  const [rows] = await pool.query(
    `SELECT 
        u.id, 
        u.username, 
        u.role, 
        u.status,
        u.created_at AS createdAt, 
        u.updated_at AS updatedAt,
        GROUP_CONCAT(uda.hub_directory_id ORDER BY uda.hub_directory_id SEPARATOR '|') AS dirIdsCsv,
        GROUP_CONCAT(d.area_key ORDER BY uda.hub_directory_id SEPARATOR '|') AS areaKeysCsv
     FROM users u
     LEFT JOIN user_directory_access uda ON u.id = uda.user_id
     LEFT JOIN hub_directories d ON d.id = uda.hub_directory_id
     GROUP BY u.id, u.username, u.role, u.status, u.created_at, u.updated_at
     ORDER BY u.username ASC`,
  );

  return rows.map((row) => {
    const directoryIds =
      row.dirIdsCsv && row.role === 'viewer_area'
        ? row.dirIdsCsv
            .split('|')
            .map((x) => Number(x))
            .filter((n) => n > 0)
        : [];

    const directories =
      row.areaKeysCsv && row.role === 'viewer_area'
        ? row.areaKeysCsv.split('|').map((areaKey) => ({ areaKey }))
        : [];

    const { dirIdsCsv, areaKeysCsv, ...rest } = row;

    return {
      ...rest,
      status: rest.status || 'pending', // 🔥 GARANTIA FINAL
      directoryIds,
      directories,
    };
  });
}
async function updateUserFields(id, patch) {
  const fields = [];
  const vals = [];
  if (patch.username != null) {
    fields.push('username = ?');
    vals.push(patch.username);
  }
  if (patch.passwordHash != null) {
    fields.push('password_hash = ?');
    vals.push(patch.passwordHash);
  }
  if (patch.role != null) {
    fields.push('role = ?');
    vals.push(patch.role);
  }
  if (!fields.length) return false;
  vals.push(id);
  const [r] = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
  return r.affectedRows > 0;
}

async function deleteUser(id) {
  const [r] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

async function setDirectoryAccess(userId, directoryIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_directory_access WHERE user_id = ?', [userId]);
    if (directoryIds.length) {
      const rows = directoryIds.map((did) => [userId, did]);
      await conn.query(
        `INSERT INTO user_directory_access (user_id, hub_directory_id) VALUES ${rows
          .map(() => '(?, ?)')
          .join(', ')}`,
        rows.flat(),
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getAllowedAreaKeys(userId, role) {
  if (role === 'viewer_area') {
    const [rows] = await pool.query(
      `SELECT d.area_key AS areaKey FROM user_directory_access uda
        JOIN hub_directories d ON d.id = uda.hub_directory_id
       WHERE uda.user_id = ? ORDER BY d.area_key`,
      [userId],
    );
    return rows.map((r) => r.areaKey);
  }
  return null;
}

module.exports = {
  findByUsername,
  findPublicById,
  insertUser,
  setUserStatus,
  listUsers,
  updateUserFields,
  deleteUser,
  setDirectoryAccess,
  getAllowedAreaKeys,
};

