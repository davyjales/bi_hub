const path = require('path');
const express = require('express');
const config = require('./config');
const biStorage = require('./lib/biStorage');
const { attachCookieMiddleware } = require('./lib/cookies');
const { attachUser } = require('./middleware/resolveUser');

const authForms = require('./routes/authForms');
const apiAuth = require('./routes/apiAuth');
const apiDirectories = require('./routes/apiDirectories');
const apiAdminUsers = require('./routes/apiAdminUsers');
const apiUserApproval = require('./routes/apiUsersApproval');
const apiBiFiles = require('./routes/apiBiFiles');
const { isMailConfigured } = require('./lib/passwordReset');


const ROOT = path.join(__dirname, '..');

const app = express();

app.disable('x-powered-by');
app.use(attachCookieMiddleware());
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '128kb' }));
app.use(attachUser);

app.use('/auth', authForms);

app.use('/api/auth', apiAuth);
app.use('/api/directories', apiDirectories);
app.use('/api/users', apiAdminUsers);
app.use('/api/users', apiUserApproval);
app.use('/api/bi-files', apiBiFiles);

const staticOpts = {
  etag: true,
  maxAge: config.nodeEnv === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
};

if (biStorage.storageConfigured()) {
  const previewsDir = path.join(config.bi.storageRoot, 'previews');
  app.use('/storage-previews', express.static(previewsDir, staticOpts));
}

app.use(express.static(ROOT, staticOpts));

app.use((_req, res) => res.status(404).type('txt').send('Não encontrado.'));

app.use((err, _req, res, _next) => {
  console.error('[bi-hub]', err);
  const message = config.nodeEnv === 'production' ? 'Erro no servidor.' : err.message || 'Erro.';
  res.status(err.statusCode && Number(err.statusCode) >= 400 ? err.statusCode : 500).json({
    ok: false,
    error: message,
  });
});

app.listen(config.port, () => {
  console.log(`[bi-hub] A servir hub em http://localhost:${config.port}`);
  if (isMailConfigured()) {
    console.log('[bi-hub] Recuperação de palavra-passe por e-mail: activa (SMTP configurado).');
  } else {
    console.warn(
      '[bi-hub] Recuperação por e-mail inactiva — defina SMTP_HOST e SMTP_FROM no .env (ver .env.example).',
    );
  }
});
