const express = require('express');
const dirs = require('../models/directories');
const directoryAudit = require('../models/directoryAudit');
const { requireAuth, requireAdmin, requirePasswordChanged } = require('../middleware/resolveUser');

const router = express.Router();

async function logDirectoryAudit(entry) {
  try {
    await directoryAudit.insertEntry(entry);
  } catch (err) {
    console.error('[hub_directory_audit]', err.message);
  }
}

router.get('/history', requireAuth, requirePasswordChanged, requireAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const entries = await directoryAudit.listEntries({ limit });
    res.json({ ok: true, entries });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    await dirs.syncDirectoriesWithFilesystem().catch(() => null);
    const list = await dirs.listDirectories();
    res.json({
      ok: true,
      directories: list.map((d) => ({ id: d.id, areaKey: d.area_key })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, requirePasswordChanged, requireAdmin, async (req, res, next) => {
  try {
    const areaKey = String(req.body?.areaKey || '').trim();
    const created = await dirs.createDirectory(areaKey);
    if (!created.existed) {
      await logDirectoryAudit({
        userId: req.authUser.id,
        username: req.authUser.username,
        action: 'create',
        areaKey: created.areaKey,
      });
    }
    res.status(201).json({ ok: true, directory: created });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requireAuth, requirePasswordChanged, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const areaKey = String(req.body?.areaKey || '').trim();
    const updated = await dirs.renameDirectory(id, areaKey);
    if (updated.oldAreaKey && updated.oldAreaKey !== updated.areaKey) {
      await logDirectoryAudit({
        userId: req.authUser.id,
        username: req.authUser.username,
        action: 'rename',
        areaKey: updated.areaKey,
        oldAreaKey: updated.oldAreaKey,
      });
    }
    res.json({ ok: true, directory: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireAuth, requirePasswordChanged, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const removed = await dirs.deleteDirectory(id);
    await logDirectoryAudit({
      userId: req.authUser.id,
      username: req.authUser.username,
      action: 'delete',
      areaKey: removed.areaKey,
    });
    res.json({ ok: true, directory: removed });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
