const { readToken } = require('../lib/cookies');
const { verifyToken } = require('../lib/token');
const usersModel = require('../models/users');

async function attachUser(req, _res, next) {
  const tok = readToken(req);
  if (!tok) {
    req.authUser = null;
    return next();
  }
  try {
    const decoded = verifyToken(tok);
    const userId = Number(decoded.userId ?? decoded.sub);
    const role = decoded.role;
    if (!userId || !role) {
      req.authUser = null;
      return next();
    }
    const pub = await usersModel.findPublicById(userId);
    if (!pub || pub.role !== role) {
      req.authUser = null;
      return next();
    }
    if (pub.status !== 'approved') {
      req.authUser = null;
      return next();
    }
    req.authUser = {
      id: pub.id,
      username: pub.username,
      role: pub.role,
      mustChangePassword: !!pub.mustChangePassword,
    };

  } catch (_) {
    req.authUser = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.authUser) return res.status(401).json({ ok: false, error: 'Não autorizado.' });
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Permissões insuficientes.' });
  }
  return next();
}

function requirePasswordChanged(req, res, next) {
  if (req.authUser?.mustChangePassword) {
    return res.status(403).json({
      ok: false,
      error: 'Deve definir uma nova palavra-passe antes de continuar.',
      mustChangePassword: true,
    });
  }
  return next();
}

module.exports = { attachUser, requireAuth, requireAdmin, requirePasswordChanged };
