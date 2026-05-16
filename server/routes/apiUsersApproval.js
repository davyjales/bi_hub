const express = require('express');
const usersModel = require('../models/users');
const { requireAuth, requireAdmin } = require('../middleware/resolveUser');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

router.post('/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido.' });
    const ok = await usersModel.setUserStatus(id, 'approved');
    if (!ok) return res.status(404).json({ ok: false, error: 'Utilizador não encontrado.' });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido.' });
    const ok = await usersModel.setUserStatus(id, 'pending');
    if (!ok) return res.status(404).json({ ok: false, error: 'Utilizador não encontrado.' });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

