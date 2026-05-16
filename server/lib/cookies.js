const cookieParser = require('cookie-parser');

const TOKEN_COOKIE = 'bi_hub_token';

function readToken(req) {
  const c = req.cookies && req.cookies[TOKEN_COOKIE];
  if (c) return c;
  const h = req.headers.authorization;
  if (h && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  return null;
}

function attachCookieMiddleware() {
  return cookieParser();
}

function setTokenCookie(res, token) {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    path: '/',
  });
}

function clearTokenCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
}

module.exports = {
  TOKEN_COOKIE,
  readToken,
  attachCookieMiddleware,
  setTokenCookie,
  clearTokenCookie,
};
