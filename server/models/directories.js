const { pool } = require('../dbPool');

async function seedDirectories(areaKeys) {
  if (!areaKeys.length) return;
  const placeholders = areaKeys.map(() => '(?)').join(', ');
  await pool.query(`INSERT IGNORE INTO hub_directories (area_key) VALUES ${placeholders}`, areaKeys);
}

async function listDirectories() {
  const [rows] = await pool.query(
    'SELECT id, area_key FROM hub_directories ORDER BY area_key ASC',
  );
  return rows;
}

module.exports = { seedDirectories, listDirectories };
