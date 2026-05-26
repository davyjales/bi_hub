const path = require('path');

/** Converte area_key do hub para pasta relativa dentro da raiz Power BI. */
function areaKeyToRelativeDir(areaKey) {
  const key = String(areaKey || '').trim();
  if (!key) return null;
  if (key.startsWith('MPL · ')) {
    return path.join('MPL', key.slice('MPL · '.length));
  }
  return key;
}

/** Deduz area_key a partir do caminho relativo (ex.: MPL/CS/foo.pbix → MPL · CS). */
function relativePathToAreaKey(relativePath) {
  const norm = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const parts = norm.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'MPL' && parts.length >= 2) {
    return `MPL · ${parts[1]}`;
  }
  return parts[0];
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
