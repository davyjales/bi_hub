const { pool } = require('../dbPool');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { areaKeyToRelativeDir } = require('../lib/areaPaths');

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function serviceUnavailable(message) {
  const err = new Error(message);
  err.statusCode = 503;
  return err;
}

async function seedDirectories(areaKeys) {
  if (!areaKeys.length) return;
  const placeholders = areaKeys.map(() => '(?)').join(', ');
  await pool.query(`INSERT IGNORE INTO hub_directories (area_key) VALUES ${placeholders}`, areaKeys);
}

async function listDirectories() {
  const [rows] = await pool.query(
    'SELECT id, area_key FROM hub_directories ORDER BY area_key ASC',
  );
  return rows;
}

function assertAreaKeyInput(areaKey) {
  let key = String(areaKey || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!key) throw badRequest('Área inválida.');
  if (key.length > 160) throw badRequest('Área demasiado longa.');

  // Normaliza múltiplos '/'
  key = key.replace(/\/+/g, '/');

  // Bloqueia path traversal
  if (key.includes('..')) throw badRequest('Área inválida.');

  const validateSegments = (p) => {
    const segs = String(p || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!segs.length) throw badRequest('Área inválida.');

    for (const seg of segs) {
      if (!seg || seg === '.' || seg === '..') throw badRequest('Área inválida.');
      if (seg.includes('..')) throw badRequest('Área inválida.');
      if (seg === 'previews') throw badRequest('Área inválida (reservada).');
    }
  };

  if (key === 'MPL') return key;

  if (key.startsWith('MPL · ')) {
    const rest = key.slice('MPL · '.length);
    if (!rest) throw badRequest('Área inválida.');
    validateSegments(rest);
    return `MPL · ${rest.replace(/\/+/g, '/')}`;
  }

  validateSegments(key);
  const rel = areaKeyToRelativeDir(key);
  if (!rel) throw badRequest('Área inválida.');
  return key;
}

function storageRootConfigured() {
  return Boolean(config.bi.storageRoot);
}

function resolveUnderRoot(relativePath) {
  const root = path.resolve(config.bi.storageRoot);
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw badRequest('Caminho inválido.');
  }
  return { root, relative: rel, full };
}

async function pathExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function scanFilesystemAreaKeys() {
  if (!storageRootConfigured()) return { keys: [], rootExists: false };
  const { full: root } = resolveUnderRoot('');
  if (!(await pathExists(root))) return { keys: [], rootExists: false };

  function relativeDirToAreaKey(relDir) {
    const norm = String(relDir || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    if (!norm) return null;
    const parts = norm.split('/').filter(Boolean);
    if (!parts.length) return null;

    if (parts[0] === 'MPL') {
      if (parts.length === 1) return 'MPL';
      return `MPL · ${parts.slice(1).join('/')}`;
    }
    return norm;
  }

  const keys = new Set();

  async function scanSubdirectories(dirFull, dirRel) {
    let entries = [];
    try {
      entries = await fs.readdir(dirFull, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name === 'previews') continue;
      const name = ent.name;
      if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) continue;

      const childRel = dirRel ? `${dirRel}/${name}` : name;
      const areaKey = relativeDirToAreaKey(childRel);
      if (areaKey && areaKey.length <= 160) keys.add(areaKey);

      await scanSubdirectories(path.join(dirFull, name), childRel);
    }
  }

  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (_) {
    return { keys: [], rootExists: true };
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'previews') continue;

    const name = ent.name;
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) continue;

    if (name === 'MPL') {
      if ('MPL'.length <= 160) keys.add('MPL');
      await scanSubdirectories(path.join(root, 'MPL'), 'MPL');
    } else {
      if (name.length <= 160) keys.add(name);
      await scanSubdirectories(path.join(root, name), name);
    }
  }

  return { keys: Array.from(keys).sort((a, b) => a.localeCompare(b, 'pt-BR')), rootExists: true };
}

async function syncDirectoriesWithFilesystem() {
  if (!storageRootConfigured()) return { inserted: 0, removed: 0 };
  const { keys: diskKeys, rootExists } = await scanFilesystemAreaKeys();
  if (!rootExists) return { inserted: 0, removed: 0 };

  const [rows] = await pool.query('SELECT area_key FROM hub_directories');
  const dbKeys = new Set(rows.map((r) => r.area_key));
  const diskSet = new Set(diskKeys);

  const toInsert = diskKeys.filter((k) => !dbKeys.has(k));
  const toRemove = Array.from(dbKeys).filter((k) => !diskSet.has(k));

  if (toInsert.length) {
    const placeholders = toInsert.map(() => '(?)').join(', ');
    await pool.query(`INSERT IGNORE INTO hub_directories (area_key) VALUES ${placeholders}`, toInsert);
  }
  if (toRemove.length) {
    const placeholders = toRemove.map(() => '?').join(', ');
    await pool.query(`DELETE FROM hub_directories WHERE area_key IN (${placeholders})`, toRemove);
  }

  return { inserted: toInsert.length, removed: toRemove.length };
}

async function createDirectory(areaKey) {
  const key = assertAreaKeyInput(areaKey);
  if (!storageRootConfigured()) throw serviceUnavailable('BI_STORAGE_ROOT não configurado no servidor.');

  const [[existing]] = await pool.query(
    'SELECT id, area_key FROM hub_directories WHERE area_key = ? LIMIT 1',
    [key],
  );
  if (existing) return { id: existing.id, areaKey: key, existed: true };

  const rel = areaKeyToRelativeDir(key).replace(/\\/g, '/');
  const { full } = resolveUnderRoot(rel);
  await fs.mkdir(full, { recursive: true });

  const [r] = await pool.query('INSERT INTO hub_directories (area_key) VALUES (?)', [key]);
  return { id: r.insertId, areaKey: key, existed: false };
}

async function renameDirectory(id, newAreaKey) {
  const key = assertAreaKeyInput(newAreaKey);
  if (!storageRootConfigured()) throw serviceUnavailable('BI_STORAGE_ROOT não configurado no servidor.');

  const [[row]] = await pool.query('SELECT id, area_key FROM hub_directories WHERE id = ? LIMIT 1', [id]);
  if (!row) throw notFound('Diretório não encontrado.');

  const oldKey = row.area_key;
  if (oldKey === key) return { id: row.id, oldAreaKey: oldKey, areaKey: key };

  const [[clash]] = await pool.query(
    'SELECT id FROM hub_directories WHERE area_key = ? AND id <> ? LIMIT 1',
    [key, id],
  );
  if (clash) throw badRequest('Já existe um diretório com este area_key.');

  const oldRel = areaKeyToRelativeDir(oldKey).replace(/\\/g, '/');
  const newRel = areaKeyToRelativeDir(key).replace(/\\/g, '/');

  const { full: oldFull } = resolveUnderRoot(oldRel);
  const { full: newFull } = resolveUnderRoot(newRel);

  if (!(await pathExists(oldFull))) throw notFound('Pasta no disco não encontrada.');

  if (await pathExists(newFull)) throw badRequest('Já existe uma pasta no disco com este nome.');

  await fs.mkdir(path.dirname(newFull), { recursive: true });
  await fs.rename(oldFull, newFull);

  const { full: oldPrev } = resolveUnderRoot(path.posix.join('previews', oldRel));
  const { full: newPrev } = resolveUnderRoot(path.posix.join('previews', newRel));
  if (await pathExists(oldPrev)) {
    await fs.mkdir(path.dirname(newPrev), { recursive: true });
    await fs.rename(oldPrev, newPrev);
  }

  await pool.query('UPDATE hub_directories SET area_key = ? WHERE id = ?', [key, id]);
  return { id, oldAreaKey: oldKey, areaKey: key };
}

async function deleteDirectory(id) {
  if (!storageRootConfigured()) throw serviceUnavailable('BI_STORAGE_ROOT não configurado no servidor.');

  const [[row]] = await pool.query('SELECT id, area_key FROM hub_directories WHERE id = ? LIMIT 1', [id]);
  if (!row) throw notFound('Diretório não encontrado.');

  const areaKey = row.area_key;
  const rel = areaKeyToRelativeDir(areaKey).replace(/\\/g, '/');
  const { full } = resolveUnderRoot(rel);
  const { full: prevFull } = resolveUnderRoot(path.posix.join('previews', rel));

  if (await pathExists(full)) await fs.rm(full, { recursive: true, force: true });
  if (await pathExists(prevFull)) await fs.rm(prevFull, { recursive: true, force: true });

  await pool.query('DELETE FROM hub_directories WHERE id = ?', [id]);
  return { id, areaKey };
}

module.exports = {
  seedDirectories,
  listDirectories,
  syncDirectoriesWithFilesystem,
  createDirectory,
  renameDirectory,
  deleteDirectory,
};
