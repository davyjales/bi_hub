const express = require('express');
const usersModel = require('../models/users');
const { verifyPassword } = require('../lib/password');
const { signToken } = require('../lib/token');
const { setTokenCookie, clearTokenCookie } = require('../lib/cookies');

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const ROUTE_ROLES = new Set(['viewer_all', 'viewer_area']);

function parseDirectoryIds(raw) {
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const nums = arr.map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(nums)];
}

function redirectAuth(res, query) {
  const q = query ? `?${query}` : '';
  res.redirect(302, `/auth.html${q}`);
}

async function idsExist(directoryIds) {
  if (!directoryIds.length) return [];
  const { pool } = require('../dbPool');
  const placeholders = directoryIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id FROM hub_directories WHERE id IN (${placeholders})`,
    directoryIds,
  );
  return rows.map((r) => r.id);
}

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const u = await usersModel.findByUsername(username);
    if (!u) return redirectAuth(res, `err=${encodeURIComponent('Credenciais inválidas.')}`);
    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) return redirectAuth(res, `err=${encodeURIComponent('Credenciais inválidas.')}`);

    const token = signToken({ userId: u.id, role: u.role });
    setTokenCookie(res, token);
    res.redirect(302, '/index.html');
  } catch (e) {
    next(e);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '').trim();

    const err = [];

    if (!USERNAME_RE.test(username)) err.push('Utilizador: 3–64 caracteres (letras, números, . _ -).');
    if (password.length < 8) err.push('A palavra-passe deve ter pelo menos 8 caracteres.');
    if (!ROUTE_ROLES.has(role)) err.push('Nível de acesso inválido.');

    const directoryIds = parseDirectoryIds(req.body.directory_ids);
    let dirIdsValidated = [];

    if (role === 'viewer_area') {
      if (!directoryIds.length) err.push('Selecione pelo menos um diretório.');
      dirIdsValidated = await idsExist(directoryIds);
      if (role === 'viewer_area' && directoryIds.length && dirIdsValidated.length !== directoryIds.length) {
        err.push('Diretório inválido ou desatualizado.');
      }
    }

    const existing = await usersModel.findByUsername(username);

    if (existing) err.push('Este nome de utilizador já está em uso.');

    if (err.length) {
      return redirectAuth(res, [
        `err=${encodeURIComponent(err.join(' '))}`,
        'tab=register',
      ].join('&'));
    }

    const { hashPassword } = require('../lib/password');
    const hash = await hashPassword(password);

    // Para perfis solicitados (viewer_*), o acesso só é liberado após aprovação do admin.
    const status = 'pending';
    const newId = await usersModel.insertUser(username, hash, role, status);

    if (role === 'viewer_area') await usersModel.setDirectoryAccess(newId, dirIdsValidated);

    // Não criar sessão/token ainda.
    res.redirect(
      302,
      '/auth.html?err=' +
        encodeURIComponent('Pedido de acesso enviado. Aguarde a aprovação do registro por um administrador.'),
    );



  } catch (e) {
    next(e);
  }
});

router.get('/logout', (_req, res) => {
  clearTokenCookie(res);
  redirectAuth(res);
});

module.exports = router;
