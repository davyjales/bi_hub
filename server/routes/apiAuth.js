const express = require('express');
const usersModel = require('../models/users');
const { signToken } = require('../lib/token');
const { setTokenCookie } = require('../lib/cookies');
const { hashPassword } = require('../lib/password');
const { validateNewPasswordPair } = require('../lib/changePassword');
const { requireAuth } = require('../middleware/resolveUser');
const { canManageBiFiles } = require('../lib/biPermissions');
const { requestPasswordReset, isMailConfigured } = require('../lib/passwordReset');

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json({ ok: true, passwordResetAvailable: isMailConfigured() });
});

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
      access:
        req.authUser.role === 'viewer_area' || req.authUser.role === 'owner_setor'
          ? { type: 'scoped', allowedAreaKeys: keys }
          : { type: 'all' },
      canManageBi: canManageBiFiles(req.authUser.role),
      mustChangePassword: !!req.authUser.mustChangePassword,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const validationError = validateNewPasswordPair(req.body?.password, req.body?.password_confirm);
    if (validationError) {
      return res.status(400).json({ ok: false, error: validationError });
    }
    await usersModel.updateUserFields(req.authUser.id, {
      passwordHash: await hashPassword(String(req.body.password)),
      mustChangePassword: false,
    });
    return res.json({ ok: true });
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
    if (u.status !== 'approved') {
      return res.status(403).json({
        ok: false,
        error: 'Conta pendente de aprovação ou inactiva. Contacte o administrador.',
      });
    }

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
      access:
        u.role === 'viewer_area' || u.role === 'owner_setor'
          ? { type: 'scoped', allowedAreaKeys: keys }
          : { type: 'all' },
      canManageBi: canManageBiFiles(u.role),
      mustChangePassword: !!u.mustChangePassword,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const result = await requestPasswordReset(req.body?.email);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, message: result.message });
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
