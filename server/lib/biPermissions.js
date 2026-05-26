const usersModel = require('../models/users');

/** Apenas admin e utilizadores por área (viewer_area) podem inserir/apagar BI's. */
function canManageBiFiles(role) {
  return role === 'admin' || role === 'viewer_area';
}

async function getManageableAreaKeys(user) {
  if (!user) return [];
  if (user.role === 'admin') return null;
  if (user.role === 'viewer_area') {
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
  if (user.role === 'admin') return;
  const allowed = await getManageableAreaKeys(user);
  if (!allowed || !allowed.includes(areaKey)) {
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
