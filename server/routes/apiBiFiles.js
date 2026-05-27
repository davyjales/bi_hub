const express = require('express');
const multer = require('multer');
const config = require('../config');
const biStorage = require('../lib/biStorage');
const biAudit = require('../models/biAudit');
const usersModel = require('../models/users');
const {
  canManageBiFiles,
  getManageableAreaKeys,
  assertCanManageArea,
} = require('../lib/biPermissions');
const { relativePathToAreaKey } = require('../lib/areaPaths');
const { requireAuth } = require('../middleware/resolveUser');
const { decodeUploadedFileName } = require('../lib/uploadFilename');

const router = express.Router();

const uploadPreview = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.png') && !name.endsWith('.jpg') && !name.endsWith('.jpeg') && !name.endsWith('.webp') && !name.endsWith('.gif')) {
      return cb(new Error('Preview inválido (use png/jpg/jpeg/webp/gif).'));
    }
    cb(null, true);
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.bi.maxUploadBytes },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.pbix')) {
      return cb(new Error('Apenas ficheiros .pbix são permitidos.'));
    }
    cb(null, true);
  },
});

function handleMulterError(err, _req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'Ficheiro demasiado grande.' });
  }
  return res.status(400).json({ ok: false, error: err.message || 'Erro no upload.' });
}

/** Lista relatórios .pbix do disco (respeita permissões de visualização). */
router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    if (!biStorage.storageConfigured()) {
      return res.json({ ok: true, reports: [], storageConfigured: false });
    }
    const keys = await usersModel.getAllowedAreaKeys(req.authUser.id, req.authUser.role);
    const reports = await biStorage.listReportsForAreaKeys(keys);
    res.json({ ok: true, reports, storageConfigured: true });
  } catch (e) {
    next(e);
  }
});

/** Áreas em que o utilizador pode inserir/apagar. */
router.get('/manage-areas', requireAuth, async (req, res, next) => {
  try {
    const canManage = canManageBiFiles(req.authUser.role);
    if (!canManage) {
      return res.json({ ok: true, canManage: false, areaKeys: [] });
    }
    const keys = await getManageableAreaKeys(req.authUser);
    res.json({
      ok: true,
      canManage: true,
      areaKeys: keys == null ? 'all' : keys,
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/upload',
  requireAuth,
  (req, res, next) => {
    const mw = (req2, res2, next2) => upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }])(req2, res2, next2);
    mw(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      return next();
    });
  },
  async (req, res, next) => {
    try {
      if (!biStorage.storageConfigured()) {
        return res.status(503).json({ ok: false, error: 'BI_STORAGE_ROOT não configurado no servidor.' });
      }
      const areaKey = String(req.body?.areaKey || '').trim();
      if (!areaKey) return res.status(400).json({ ok: false, error: 'Área obrigatória.' });
      await assertCanManageArea(req.authUser, areaKey);
      const pbixFile = req.files?.file?.[0] || null;
      const previewFile = req.files?.preview?.[0] || null;
      if (!pbixFile?.buffer?.length) {
        return res.status(400).json({ ok: false, error: 'Ficheiro .pbix obrigatório.' });
      }
      const uploadName = decodeUploadedFileName(
        req.body?.fileName || pbixFile.originalname,
      );
      const saved = await biStorage.saveUpload(areaKey, uploadName, pbixFile.buffer);
      let preview = null;
      if (previewFile?.buffer?.length) {
        const rel = await biStorage.savePreviewForPbix(saved.relativePath, previewFile.originalname, previewFile.buffer);
        preview = biStorage.previewToPublicUrl(rel);
      }
      await biAudit.insertEntry({
        userId: req.authUser.id,
        username: req.authUser.username,
        action: 'upload',
        areaKey,
        fileName: saved.fileName,
        relativePath: saved.relativePath,
      });
      res.status(201).json({ ok: true, ...saved, areaKey, preview });
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/file',
  requireAuth,
  (req, res, next) => {
    const mw = (req2, res2, next2) =>
      uploadPreview.single('preview')(req2, res2, next2);
    mw(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      return next();
    });
  },
  async (req, res, next) => {
    try {
      if (!biStorage.storageConfigured()) {
        return res.status(503).json({ ok: false, error: 'BI_STORAGE_ROOT não configurado no servidor.' });
      }

      const relativePath = String(req.body?.relativePath || req.query?.relativePath || '').trim();
      const newTitle = String(req.body?.newTitle || '').trim();

      if (!relativePath) return res.status(400).json({ ok: false, error: 'relativePath obrigatório.' });
      if (!newTitle) return res.status(400).json({ ok: false, error: 'newTitle obrigatório.' });

      const areaKey = relativePathToAreaKey(relativePath);
      if (!areaKey) return res.status(400).json({ ok: false, error: 'Caminho inválido.' });
      await assertCanManageArea(req.authUser, areaKey);

      const safeBase = decodeUploadedFileName(newTitle).replace(/[\\/]/g, '').trim();
      if (!safeBase || safeBase.includes('..')) return res.status(400).json({ ok: false, error: 'Título inválido.' });

      const relNorm = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = relNorm.split('/');
      const oldFile = parts[parts.length - 1];
      const dir = parts.slice(0, -1).join('/');
      const newFile = safeBase.toLowerCase().endsWith('.pbix') ? safeBase : safeBase + '.pbix';
      const newRelativePath = (dir ? dir + '/' : '') + newFile;

      if (newRelativePath !== relNorm) {
        await biStorage.renamePbixRelativePath(relNorm, newRelativePath);
        await biStorage.movePreviewForPbix(relNorm, newRelativePath);
      }

      let preview = await biStorage.resolvePreviewRelativePath(newRelativePath);
      if (req.file?.buffer?.length) {
        const rel = await biStorage.savePreviewForPbix(newRelativePath, req.file.originalname, req.file.buffer);
        preview = rel;
      }
      preview = biStorage.previewToPublicUrl(preview);

      await biAudit.insertEntry({
        userId: req.authUser.id,
        username: req.authUser.username,
        action: 'edit',
        areaKey,
        fileName: newFile,
        relativePath: newRelativePath,
      });

      res.json({ ok: true, areaKey, oldRelativePath: relNorm, relativePath: newRelativePath, fileName: newFile, preview });
    } catch (e) {
      next(e);
    }
  },
);

router.delete('/file', requireAuth, async (req, res, next) => {
  try {
    if (!biStorage.storageConfigured()) {
      return res.status(503).json({ ok: false, error: 'BI_STORAGE_ROOT não configurado no servidor.' });
    }
    const relativePath = String(req.body?.relativePath || req.query?.relativePath || '').trim();
    if (!relativePath) return res.status(400).json({ ok: false, error: 'relativePath obrigatório.' });
    const areaKey = relativePathToAreaKey(relativePath);
    if (!areaKey) return res.status(400).json({ ok: false, error: 'Caminho inválido.' });
    await assertCanManageArea(req.authUser, areaKey);
    const removed = await biStorage.deleteFile(relativePath);
    await biAudit.insertEntry({
      userId: req.authUser.id,
      username: req.authUser.username,
      action: 'delete',
      areaKey: removed.areaKey,
      fileName: removed.fileName,
      relativePath: removed.relativePath,
    });
    res.json({ ok: true, ...removed });
  } catch (e) {
    next(e);
  }
});

/** Histórico: admin e viewer_all vêem tudo; owner_setor vê as suas áreas. */
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    if (!canManageBiFiles(req.authUser.role)) {
      return res.status(403).json({ ok: false, error: 'Sem permissão.' });
    }
    const limit = req.query.limit;
    let entries;
    if (req.authUser.role === 'admin' || req.authUser.role === 'viewer_all') {
      entries = await biAudit.listEntries({ limit });
    } else {
      const areaKeys = await getManageableAreaKeys(req.authUser);
      entries = await biAudit.listEntries({ limit, areaKeys });
    }
    res.json({ ok: true, entries });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
