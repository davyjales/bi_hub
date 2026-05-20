const path = require('path');
const express = require('express');
const config = require('./config');
const { attachCookieMiddleware } = require('./lib/cookies');
const { attachUser } = require('./middleware/resolveUser');

const authForms = require('./routes/authForms');
const apiAuth = require('./routes/apiAuth');
const apiDirectories = require('./routes/apiDirectories');
const apiAdminUsers = require('./routes/apiAdminUsers');
const apiUserApproval = require('./routes/apiUsersApproval');


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


const staticOpts = {
  etag: true,
  maxAge: config.nodeEnv === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
};

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
});
