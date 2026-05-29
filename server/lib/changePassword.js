function validateNewPasswordPair(newPassword, confirmPassword) {
  const pass = String(newPassword || '');
  const confirm = String(confirmPassword || '');
  if (pass.length < 8) return 'A palavra-passe deve ter pelo menos 8 caracteres.';
  if (pass !== confirm) return 'A confirmação não coincide com a nova palavra-passe.';
  return null;
}

module.exports = { validateNewPasswordPair };
