const express = require('express');
const usersModel = require('../models/users');
const { hashPassword } = require('../lib/password');
const { normalizeEmail, isValidEmail } = require('../lib/emailValidate');
const { pool } = require('../dbPool');
const { requireAuth, requireAdmin, requirePasswordChanged } = require('../middleware/resolveUser');


const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const ROLES = new Set(['admin', 'viewer_all', 'viewer_area', 'owner_setor']);

const router = express.Router();
router.use(requireAuth, requirePasswordChanged);
router.use(requireAdmin);

async function validatedDirectoryIds(raw) {
  const ids = [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .map((x) => Number(String(x).trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.query(`SELECT id FROM hub_directories WHERE id IN (${ph}) ORDER BY id`, ids);
  const okIds = rows.map((r) => r.id);
  if (okIds.length !== ids.length) return null;
  return okIds;
}

router.get('/', async (_req, res, next) => {
  try {
    const list = await usersModel.listUsers();
    res.json({
      ok: true,
      users: list.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email || null,
        role: u.role,
        status: u.status || 'pending',
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        directoryIds: u.directoryIds || [],
        directories: u.directories || [],
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {

    const username = String(req.body.username || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const role = String(req.body.role || '').trim();
    const err = [];

    if (!USERNAME_RE.test(username)) err.push('Nome de utilizador inválido (3–64, letras, números, . _ -).');
    if (!isValidEmail(email)) err.push('E-mail inválido.');
    if (password.length < 8) err.push('Palavra-passe deve ter pelo menos 8 caracteres.');
    if (!ROLES.has(role)) err.push('Perfil inválido.');

    let dirIdsFinal = [];

    if (role === 'viewer_area' || role === 'owner_setor') {

      dirIdsFinal = await validatedDirectoryIds(req.body.directoryIds);

      if (dirIdsFinal == null || !dirIdsFinal.length) {

        err.push('Selecione um ou mais diretórios existentes.');
      }

    }

    const existing = await usersModel.findByUsername(username);
    const emailClash = await usersModel.findByEmail(email);

    if (existing) err.push('Já existe um utilizador com este nome.');
    if (emailClash) err.push('Já existe um utilizador com este e-mail.');
    if (err.length) return res.status(400).json({ ok: false, error: err.join(' ') });

    const phash = await hashPassword(password);

    const newId = await usersModel.insertUser(username, phash, role, 'approved', email);

    if (role === 'viewer_area' || role === 'owner_setor') await usersModel.setDirectoryAccess(newId, dirIdsFinal);

    else await usersModel.setDirectoryAccess(newId, []);

    const created = await usersModel.findPublicById(newId);
    const [didRows] = await pool.query(
      `SELECT hub_directory_id FROM user_directory_access WHERE user_id = ? ORDER BY hub_directory_id`,
      [newId],
    );

    res.status(201).json({
      ok: true,

      user: {
        id: created.id,

        username: created.username,
        email: created.email || null,
        role: created.role,

        status: created.status || 'pending',

        directoryIds: didRows.map((r) => r.hub_directory_id),
      },

    });

  } catch (e) {
    next(e);
  }

});

router.patch('/:id', async (req, res, next) => {

  try {

    const id = Number(req.params.id);


    const target = await usersModel.findPublicById(id);

    if (!target) return res.status(404).json({ ok: false, error: 'Utilizador não encontrado.' });

    const body = req.body || {};

    const { username: bodyUsername, email: bodyEmail, password, role: bodyRole, directoryIds } = body;

    const usernameProvided = Object.prototype.hasOwnProperty.call(body, 'username');
    const emailProvided = Object.prototype.hasOwnProperty.call(body, 'email');

    if (usernameProvided) {

      const u = String(bodyUsername ?? '').trim();

      if (!USERNAME_RE.test(u)) return res.status(400).json({ ok: false, error: 'Nome de utilizador inválido.' });

      const clash = await usersModel.findByUsername(u);

      if (clash && clash.id !== id) return res.status(400).json({ ok: false, error: 'Nome já está em uso.' });

      await usersModel.updateUserFields(id, { username: u });

    }

    if (emailProvided) {
      const mail = normalizeEmail(bodyEmail);
      if (!isValidEmail(mail)) {
        return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
      }
      const clashMail = await usersModel.findByEmail(mail);
      if (clashMail && clashMail.id !== id) {
        return res.status(400).json({ ok: false, error: 'E-mail já está em uso.' });
      }
      await usersModel.updateUserFields(id, { email: mail });
    }

    if (password != null && String(password).trim().length > 0) {

      if (String(password).length < 8) {

        return res.status(400).json({ ok: false, error: 'Palavra-passe demasiado curta.' });

      }

      await usersModel.updateUserFields(id, { passwordHash: await hashPassword(String(password)) });

    }

    let nextRole = target.role;

    const roleProvided = Object.prototype.hasOwnProperty.call(body, 'role');

    if (roleProvided) {

      const r = String(bodyRole ?? '').trim();

      if (!ROLES.has(r)) return res.status(400).json({ ok: false, error: 'Perfil inválido.' });

      if (req.authUser.id === id && target.role === 'admin' && r !== 'admin') {

        return res.status(400).json({ ok: false, error: 'Não pode remover o próprio perfil de administrador.' });

      }

      await usersModel.updateUserFields(id, { role: r });

      nextRole = r;

      if (nextRole !== 'viewer_area' && nextRole !== 'owner_setor') await usersModel.setDirectoryAccess(id, []);

    }

    const dirsProvided = Object.prototype.hasOwnProperty.call(body, 'directoryIds');

    if ((nextRole === 'viewer_area' || nextRole === 'owner_setor') && dirsProvided) {

      const v = await validatedDirectoryIds(directoryIds);

      if (v === null || !v.length) {

        return res.status(400).json({
          ok: false,
          error: 'Indique pelo menos um diretório válido.',
        });

      }

      await usersModel.setDirectoryAccess(id, v);

    } else if (roleProvided && (nextRole === 'viewer_area' || nextRole === 'owner_setor') && !dirsProvided) {
      const [[cntRow]] = await pool.query(
        `SELECT COUNT(*) AS c FROM user_directory_access WHERE user_id = ?`,
        [id],
      );

      const prevCount = cntRow?.c ?? 0;

      if (!prevCount) {
        return res.status(400).json({
          ok: false,
          error:
            'Utilizadores com acesso por diretório precisam de pelo menos um diretório. Envie directoryIds.',
        });
      }

    }

    const refreshed = await usersModel.findPublicById(id);

    const [didRows] = await pool.query(

      `SELECT hub_directory_id FROM user_directory_access WHERE user_id = ? ORDER BY hub_directory_id`,
      [id],

    );

    res.json({
      ok: true,
      user: {
        id: refreshed.id,

        username: refreshed.username,
        email: refreshed.email || null,
        role: refreshed.role,

        status: refreshed.status || 'pending',

        directoryIds: didRows.map((r) => r.hub_directory_id),
      },

    });

  } catch (e) {
    next(e);
  }

});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (id === req.authUser.id) {
      return res.status(400).json({ ok: false, error: 'Não pode eliminar a própria conta.' });

    }

    const okDel = await usersModel.deleteUser(id);

    if (!okDel) return res.status(404).json({ ok: false, error: 'Utilizador não encontrado.' });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
