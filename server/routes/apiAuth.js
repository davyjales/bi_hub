const express = require('express');
const usersModel = require('../models/users');
const { signToken } = require('../lib/token');
const { setTokenCookie } = require('../lib/cookies');
const { requireAuth } = require('../middleware/resolveUser');

const router = express.Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const keys = await usersModel.getAllowedAreaKeys(req.authUser.id, req.authUser.role);
    const fullUser = await usersModel.findPublicById(req.authUser.id);
    res.json({
      ok: true,
      user: {
        id: fullUser.id,
        username: fullUser.username,
        role: fullUser.role,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
      },
      access: req.authUser.role === 'viewer_area' ? { type: 'scoped', allowedAreaKeys: keys } : { type: 'all' },
    });
  } catch (e) {
    next(e);
  }
});

/** Login via JSON (ferramentas/admin); define o mesmo cookie httpOnly das rotas em formulário. */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const u = await usersModel.findByUsername(String(username || '').trim());
    if (!u) return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });

    const { verifyPassword } = require('../lib/password');
    const ok = await verifyPassword(String(password || ''), u.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });

    const token = signToken({ userId: u.id, role: u.role });
    setTokenCookie(res, token);
    const keys = await usersModel.getAllowedAreaKeys(u.id, u.role);
    res.json({
      ok: true,
      token,
      user: { id: u.id, username: u.username, role: u.role },
      access: u.role === 'viewer_area' ? { type: 'scoped', allowedAreaKeys: keys } : { type: 'all' },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (_req, res) => {
  const { clearTokenCookie } = require('../lib/cookies');
  clearTokenCookie(res);
  res.json({ ok: true });
});

module.exports = router;
