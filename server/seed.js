/**

 * Execução: `npm install` na pasta server, depois `npm run seed` (a partir da pasta server).

 *

 * Precisa do ficheiro .env do servidor e do schema já importado (database/schema.sql).

 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });



const mysql = require('mysql2/promise');

const bcrypt = require('bcryptjs');



const DIR_KEYS = [

  'Engenharia Industrial',

  'Finance',

  'Manufatura',

  'MPL',

  'New Models',

  'OPEX',

  'Qualidade',

  'RH',

  'Tax',

  'MPL · PCP',

  'MPL · RFU',

  'MPL · WH',

  'MPL · CS',

  'MPL · Cycle Count',

  'MPL · Inventário',

];



const SEED_ADMIN_USER = process.env.SEED_ADMIN_USER || 'djales';

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Visteon2020';
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || null;



async function main() {

  const pool = mysql.createPool({

    host: process.env.DB_HOST || '127.0.0.1',

    port: Number(process.env.DB_PORT) || 3306,

    user: process.env.DB_USER || 'root',

    password: process.env.DB_PASSWORD ?? '',

    database: process.env.DB_NAME || 'bi_hub',

    waitForConnections: true,

    connectionLimit: 2,

  });



  console.log('[seed] A inserir diretórios (INSERT IGNORE)...');

  const placeholders = DIR_KEYS.map(() => '(?)').join(', ');

  await pool.query(`INSERT IGNORE INTO hub_directories (area_key) VALUES ${placeholders}`, DIR_KEYS);



  const hash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);

  console.log(`[seed] A garantir utilizador administrador "${SEED_ADMIN_USER}"...`);

  await pool.query(
    `INSERT INTO users (username, email, password_hash, role, status)
      VALUES (?, ?, ?, 'admin', 'approved')
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       status = VALUES(status),
       email = COALESCE(VALUES(email), email)`,
    [SEED_ADMIN_USER, SEED_ADMIN_EMAIL, hash],
  );




  const [[admin]] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [SEED_ADMIN_USER]);

  if (admin) await pool.query('DELETE FROM user_directory_access WHERE user_id = ?', [admin.id]);



  await pool.end();

  console.log('[seed] Concluído.');

}



main().catch((err) => {

  console.error('[seed]', err.message || err);

  process.exit(1);

});


