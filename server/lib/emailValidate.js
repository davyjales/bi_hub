const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 255) return false;
  return EMAIL_RE.test(email);
}

module.exports = { normalizeEmail, isValidEmail };
