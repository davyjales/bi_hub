const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { areaKeyToRelativeDir, relativePathToAreaKey } = require('./areaPaths');
const { decodeUploadedFileName } = require('./uploadFilename');

const PBIX_EXT = '.pbix';

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
      out.push({
        title: titleFromFileName(ent.name),
        area: areaKey,
        fileName: ent.name,
        relativePath: rel.replace(/\\/g, '/'),
        file: toClientFilePath(rel),
        updated: mtime ? mtime.toLocaleDateString('pt-BR') : '—',
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
  return { areaKey, fileName: path.basename(rel), relativePath: rel };
}

module.exports = {
  storageConfigured,
  listReportsForAreaKeys,
  saveUpload,
  deleteFile,
  relativePathToAreaKey,
  toClientFilePath,
};
