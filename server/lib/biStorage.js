const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { areaKeyToRelativeDir, relativePathToAreaKey } = require('./areaPaths');
const { decodeUploadedFileName } = require('./uploadFilename');

const PBIX_EXT = '.pbix';
const SUPPORTED_PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

function storageConfigured() {
  return Boolean(config.bi.storageRoot);
}

function getStorageRoot() {
  if (!storageConfigured()) {
    const err = new Error('Armazenamento de BI não configurado (BI_STORAGE_ROOT).');
    err.statusCode = 503;
    throw err;
  }
  return config.bi.storageRoot;
}

function resolveUnderRoot(relativePath) {
  const root = path.resolve(getStorageRoot());
  const rel = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    const err = new Error('Caminho inválido.');
    err.statusCode = 400;
    throw err;
  }
  return { root, relative: rel, full };
}

function areaDirFull(areaKey) {
  const rel = areaKeyToRelativeDir(areaKey);
  if (!rel) {
    const err = new Error('Área inválida.');
    err.statusCode = 400;
    throw err;
  }
  return resolveUnderRoot(rel);
}

function assertPbixFileName(fileName) {
  const base = path.basename(decodeUploadedFileName(fileName));
  if (!base || base.includes('..') || !base.toLowerCase().endsWith(PBIX_EXT)) {
    const err = new Error('Nome de ficheiro inválido (apenas .pbix).');
    err.statusCode = 400;
    throw err;
  }
  return base;
}

function toClientFilePath(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/');
  const prefix = config.bi.clientPathPrefix;
  if (prefix) {
    return prefix.replace(/[/\\]+$/, '') + '\\' + rel.replace(/\//g, '\\');
  }
  return path.join(getStorageRoot(), rel);
}

function titleFromFileName(fileName) {
  return path.basename(fileName, PBIX_EXT);
}

function stripExt(p) {
  const rel = String(p || '').replace(/\\/g, '/');
  const base = path.basename(rel);
  const dir = path.posix.dirname(rel);
  const i = base.lastIndexOf('.');
  const noExt = i > 0 ? base.slice(0, i) : base;
  return (dir && dir !== '.' ? dir + '/' : '') + noExt;
}

async function tryStat(fullPath) {
  try {
    return await fs.stat(fullPath);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

function previewToPublicUrl(previewRelativePath) {
  if (!previewRelativePath) return null;
  const rel = String(previewRelativePath).replace(/\\/g, '/').replace(/^\/+/, '');
  const withoutPrefix = rel.startsWith('previews/') ? rel.slice('previews/'.length) : rel;
  if (!withoutPrefix) return null;
  return `/storage-previews/${withoutPrefix.split('/').map(encodeURIComponent).join('/')}`;
}

async function resolvePreviewRelativePath(pbixRelativePath) {
  const rel = String(pbixRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return null;
  const baseNoExt = stripExt(rel);
  for (const ext of SUPPORTED_PREVIEW_EXTS) {
    const candidateRel = `previews/${baseNoExt}${ext}`;
    const { full } = resolveUnderRoot(candidateRel);
    const st = await tryStat(full);
    if (st && st.isFile()) return candidateRel;
  }
  return null;
}

async function savePreviewForPbix(pbixRelativePath, fileName, buffer) {
  const relPbix = String(pbixRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relPbix) {
    const err = new Error('relativePath obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  const areaKey = relativePathToAreaKey(relPbix);
  if (!areaKey) {
    const err = new Error('Caminho inválido.');
    err.statusCode = 400;
    throw err;
  }
  const baseNoExt = stripExt(relPbix);
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (!SUPPORTED_PREVIEW_EXTS.includes(ext)) {
    const err = new Error('Preview inválido (use png/jpg/jpeg/webp/gif).');
    err.statusCode = 400;
    throw err;
  }
  if (!buffer || !buffer.length) {
    const err = new Error('Preview vazio.');
    err.statusCode = 400;
    throw err;
  }
  const relPreview = `previews/${baseNoExt}${ext}`;
  const { full } = resolveUnderRoot(relPreview);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return relPreview;
}

async function movePreviewForPbix(oldPbixRelativePath, newPbixRelativePath) {
  const oldRel = String(oldPbixRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const newRel = String(newPbixRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!oldRel || !newRel || oldRel === newRel) return { oldPreview: null, newPreview: null };

  const oldPreview = await resolvePreviewRelativePath(oldRel);
  if (!oldPreview) return { oldPreview: null, newPreview: null };

  const ext = path.extname(oldPreview).toLowerCase();
  const newBaseNoExt = stripExt(newRel);
  const newPreview = `previews/${newBaseNoExt}${ext}`;

  const { full: oldFull } = resolveUnderRoot(oldPreview);
  const { full: newFull } = resolveUnderRoot(newPreview);
  await fs.mkdir(path.dirname(newFull), { recursive: true });
  await fs.rename(oldFull, newFull);
  return { oldPreview, newPreview };
}

async function deletePreviewForPbix(pbixRelativePath) {
  const prev = await resolvePreviewRelativePath(pbixRelativePath);
  if (!prev) return false;
  const { full } = resolveUnderRoot(prev);
  try {
    await fs.unlink(full);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    throw e;
  }
}

async function renamePbixRelativePath(oldRelativePath, newRelativePath) {
  const oldRel = String(oldRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const newRel = String(newRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const { full: oldFull } = resolveUnderRoot(oldRel);
  const { full: newFull } = resolveUnderRoot(newRel);
  await fs.mkdir(path.dirname(newFull), { recursive: true });
  await fs.rename(oldFull, newFull);
}

async function walkPbix(dirFull, relativePrefix, out) {
  let entries;
  try {
    entries = await fs.readdir(dirFull, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const ent of entries) {
    const rel = relativePrefix ? `${relativePrefix}/${ent.name}` : ent.name;
    const full = path.join(dirFull, ent.name);
    if (ent.isDirectory()) {
      await walkPbix(full, rel, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(PBIX_EXT)) {
      const areaKey = relativePathToAreaKey(rel);
      if (!areaKey) continue;
      let mtime = null;
      try {
        const st = await fs.stat(full);
        mtime = st.mtime;
      } catch (_) {}
      const pbixRelativePath = rel.replace(/\\/g, '/');
      let preview = null;
      try {
        preview = await resolvePreviewRelativePath(pbixRelativePath);
      } catch (_) {
        preview = null;
      }
      out.push({
        title: titleFromFileName(ent.name),
        area: areaKey,
        fileName: ent.name,
        relativePath: pbixRelativePath,
        file: toClientFilePath(pbixRelativePath),
        updated: mtime ? mtime.toLocaleDateString('pt-BR') : '—',
        preview: previewToPublicUrl(preview),
      });
    }
  }
}

async function pathExists(dir) {
  try {
    await fs.access(dir);
    return true;
  } catch (_) {
    return false;
  }
}

async function listReportsForAreaKeys(areaKeys) {
  const root = getStorageRoot();
  if (!(await pathExists(root))) {
    return [];
  }
  const out = [];
  const keys = areaKeys == null ? null : new Set(areaKeys);

  if (keys == null) {
    await walkPbix(root, '', out);
    return out.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }

  const seenDirs = new Set();
  for (const areaKey of keys) {
    const { relative, full } = areaDirFull(areaKey);
    if (seenDirs.has(relative)) continue;
    seenDirs.add(relative);
    await walkPbix(full, relative.replace(/\\/g, '/'), out);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

async function saveUpload(areaKey, fileName, buffer) {
  const safeName = assertPbixFileName(fileName);
  const { full, relative } = areaDirFull(areaKey);
  await fs.mkdir(full, { recursive: true });
  const relFile = path.join(relative, safeName).replace(/\\/g, '/');
  const { full: destFull } = resolveUnderRoot(relFile);
  await fs.writeFile(destFull, buffer);
  return { fileName: safeName, relativePath: relFile };
}

async function deleteFile(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const { full } = resolveUnderRoot(rel);
  const areaKey = relativePathToAreaKey(rel);
  if (!areaKey) {
    const err = new Error('Caminho inválido.');
    err.statusCode = 400;
    throw err;
  }
  let st;
  try {
    st = await fs.stat(full);
  } catch (e) {
    if (e.code === 'ENOENT') {
      const err = new Error('Ficheiro não encontrado.');
      err.statusCode = 404;
      throw err;
    }
    throw e;
  }
  if (!st.isFile() || !full.toLowerCase().endsWith(PBIX_EXT)) {
    const err = new Error('Apenas ficheiros .pbix podem ser removidos.');
    err.statusCode = 400;
    throw err;
  }
  await fs.unlink(full);
  await deletePreviewForPbix(rel);
  return { areaKey, fileName: path.basename(rel), relativePath: rel };
}

module.exports = {
  storageConfigured,
  listReportsForAreaKeys,
  saveUpload,
  renamePbixRelativePath,
  deleteFile,
  resolvePreviewRelativePath,
  savePreviewForPbix,
  movePreviewForPbix,
  deletePreviewForPbix,
  relativePathToAreaKey,
  toClientFilePath,
  previewToPublicUrl,
};
