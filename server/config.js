const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const required = ['JWT_SECRET', 'DB_NAME'];

function validateEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `[bi-hub] Variáveis em falta no .env: ${missing.join(', ')} — copie .env.example para .env.`,
    );
  }
}

validateEnv();

function normalizeDir(p) {
  if (!p) return '';
  const trimmed = String(p).trim();
  if (!trimmed) return '';
  return trimmed.replace(/[/\\]+$/, '');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  bi: {
    /** Raiz no servidor Linux onde ficam os .pbix (ex.: /mnt/publico/202/20 - Power BI) */
    storageRoot: normalizeDir(process.env.BI_STORAGE_ROOT),
    /**
     * Caminho Windows mostrado ao cliente para abrir no Power BI Desktop (opcional).
     * Ex.: P:\2026\20 - Power BI
     */
    clientPathPrefix: normalizeDir(process.env.BI_CLIENT_PATH_PREFIX),
    maxUploadBytes: Number(process.env.BI_MAX_UPLOAD_MB || 200) * 1024 * 1024,
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
    tlsInsecure:
      process.env.SMTP_TLS_INSECURE === 'true' || process.env.SMTP_TLS_INSECURE === '1',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    appName: process.env.MAIL_APP_NAME || 'Visteon BI Hub',
    loginUrl: process.env.APP_LOGIN_URL || '',
  },
};
