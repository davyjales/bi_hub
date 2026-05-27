/**
 * Aplica migrações SQL incrementais (sem DROP/reimportar schema.sql).
 *
 * Uso (na pasta server, com .env configurado):
 *   npm run migrate
 *   npm run migrate -- 001_owner_setor_audit_edit.sql
 */
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

async function listMigrationFiles(onlyFile) {
  if (onlyFile) {
    const full = path.join(MIGRATIONS_DIR, onlyFile);
    try {
      await fs.access(full);
      return [onlyFile];
    } catch (_) {
      throw new Error(`Migração não encontrada: ${onlyFile}`);
    }
  }
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function isApplied(conn, filename) {
  const [rows] = await conn.query(
    'SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1',
    [filename],
  );
  return rows.length > 0;
}

async function markApplied(conn, filename) {
  await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
}

async function runFile(conn, filename) {
  const full = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(full, 'utf8');
  console.log(`[migrate] A aplicar ${filename}…`);
  await conn.query({ sql, multipleStatements: true });
  await markApplied(conn, filename);
  console.log(`[migrate] OK — ${filename}`);
}

async function main() {
  const onlyFile = process.argv[2] || null;
  const files = await listMigrationFiles(onlyFile);

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  try {
    await ensureMigrationsTable(conn);

    for (const file of files) {
      if (await isApplied(conn, file)) {
        console.log(`[migrate] Ignorado (já aplicado): ${file}`);
        continue;
      }
      await runFile(conn, file);
    }

    console.log('[migrate] Concluído.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate]', err.message || err);
  process.exit(1);
});
