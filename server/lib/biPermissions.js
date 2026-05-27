const usersModel = require('../models/users');

/** admin / viewer_all: todas as áreas; owner_setor: áreas atribuídas; viewer_area: só visualização. */
function canManageBiFiles(role) {
  return role === 'admin' || role === 'viewer_all' || role === 'owner_setor';
}

async function getManageableAreaKeys(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'viewer_all') return null;
  if (user.role === 'owner_setor') {
    return usersModel.getAllowedAreaKeys(user.id, user.role);
  }
  return [];
}

async function assertCanManageArea(user, areaKey) {
  if (!canManageBiFiles(user.role)) {
    const err = new Error('Sem permissão para gerir relatórios.');
    err.statusCode = 403;
    throw err;
  }
  if (user.role === 'admin' || user.role === 'viewer_all') return;
  const allowed = await getManageableAreaKeys(user);

  // Importante: a área do relatório pode estar mais “funda” na árvore.
  // Se o utilizador tem acesso à pasta-mãe, deve poder gerir descendentes.
  const isAllowed = (allowedKey, candidateKey) => {
    if (!allowedKey || !candidateKey) return false;
    if (allowedKey === candidateKey) return true;

    // MPL root usa outro prefixo (MPL · ...)
    if (allowedKey === 'MPL') {
      return candidateKey === 'MPL' || candidateKey.startsWith('MPL · ');
    }

    // Descendentes gerais (ex.: Finance -> Finance/2024)
    return candidateKey.startsWith(allowedKey + '/');
  };

  if (!allowed || !allowed.some((k) => isAllowed(k, areaKey))) {
    const err = new Error('Sem permissão para esta área.');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  canManageBiFiles,
  getManageableAreaKeys,
  assertCanManageArea,
};
