const usersModel = require('../models/users');
const { hashPassword } = require('./password');
const { normalizeEmail, isValidEmail } = require('./emailValidate');
const { generateRandomPassword } = require('./generatePassword');
const { isMailConfigured, sendPasswordResetEmail } = require('./mail');

const RESET_COOLDOWN_MS = 2 * 60 * 1000;
const resetLastByEmail = new Map();

const FORGOT_GENERIC_MSG =
  'Se o e-mail estiver registado e a conta estiver activa, receberá uma nova palavra-passe em breve.';

/**
 * Gera palavra-passe aleatória, actualiza a conta (aprovada) e envia por e-mail.
 * Resposta sempre genérica em sucesso para não revelar se o e-mail existe.
 */
async function requestPasswordReset(rawEmail) {
  const email = normalizeEmail(rawEmail);

  if (!isValidEmail(email)) {
    return { ok: false, error: 'Indique um e-mail válido.' };
  }

  if (!isMailConfigured()) {
    return {
      ok: false,
      error: 'Recuperação por e-mail não está configurada no servidor. Contacte o administrador.',
    };
  }

  const now = Date.now();
  const last = resetLastByEmail.get(email) || 0;
  if (now - last < RESET_COOLDOWN_MS) {
    return { ok: true, message: FORGOT_GENERIC_MSG, rateLimited: true };
  }
  resetLastByEmail.set(email, now);

  const u = await usersModel.findByEmail(email);
  if (u && u.status === 'approved') {
    try {
      const plain = generateRandomPassword(12);
      await sendPasswordResetEmail({ to: email, username: u.username, password: plain });
      await usersModel.updateUserFields(u.id, {
        passwordHash: await hashPassword(plain),
        mustChangePassword: true,
      });
    } catch (mailErr) {
      console.error('[password-reset]', mailErr);
      return {
        ok: false,
        error: 'Não foi possível enviar o e-mail. Tente mais tarde ou contacte o administrador.',
      };
    }
  }

  return { ok: true, message: FORGOT_GENERIC_MSG };
}

module.exports = { requestPasswordReset, FORGOT_GENERIC_MSG, isMailConfigured };
