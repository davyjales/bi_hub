const path = require('path');

/** Converte area_key do hub para pasta relativa dentro da raiz Power BI. */
function areaKeyToRelativeDir(areaKey) {
  const key = String(areaKey || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!key) return null;
  if (key === 'MPL') return 'MPL';
  if (key.startsWith('MPL · ')) {
    // Suporta MPL · CS e MPL · CS/Deep
    const rest = key.slice('MPL · '.length).replace(/\\/g, '/');
    return path.posix.join('MPL', rest);
  }
  return key;
}

/** Deduz area_key a partir do caminho relativo (ex.: MPL/CS/foo.pbix → MPL · CS). */
function relativePathToAreaKey(relativePath) {
  const norm = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!norm) return null;

  // `relativePath` vem como caminho até o .pbix; área é o diretório pai.
  const dir = path.posix.dirname(norm);
  if (!dir || dir === '.') return null;

  if (dir === 'MPL') return 'MPL';

  const parts = dir.split('/').filter(Boolean);
  if (!parts.length) return null;

  if (parts[0] === 'MPL') {
    if (parts.length === 1) return 'MPL';
    // MPL/<sub>/... -> MPL · <sub>/...
    return `MPL · ${parts.slice(1).join('/')}`;
  }

  // Finance/2024/Q1/foo.pbix -> Finance/2024/Q1
  return dir;
}

function listAreaKeysUnderRelative(relativeDir) {
  const norm = String(relativeDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!norm) return [];
  if (norm === 'MPL' || norm.startsWith('MPL/')) {
    const sub = norm === 'MPL' ? null : norm.slice('MPL/'.length).split('/')[0];
    if (sub) return [`MPL · ${sub}`];
    return [
      'MPL · PCP',
      'MPL · RFU',
      'MPL · WH',
      'MPL · CS',
      'MPL · Cycle Count',
      'MPL · Inventário',
    ];
  }
  return [norm.split('/')[0]];
}

module.exports = {
  areaKeyToRelativeDir,
  relativePathToAreaKey,
  listAreaKeysUnderRelative,
};
