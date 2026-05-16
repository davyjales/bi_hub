const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(payload) {
  return jwt.sign(
    { userId: payload.userId, role: payload.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
