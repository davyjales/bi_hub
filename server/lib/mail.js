const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function isMailConfigured() {
  return Boolean(config.mail?.host && config.mail?.from);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth:
        config.mail.user && config.mail.pass
          ? { user: config.mail.user, pass: config.mail.pass }
          : undefined,
    });
  }
  return transporter;
}

async function sendPasswordResetEmail({ to, username, password }) {
  const transport = getTransporter();
  if (!transport) {
    const err = new Error('Envio de e-mail não configurado no servidor.');
    err.statusCode = 503;
    throw err;
  }

  const appName = config.mail.appName || 'Visteon BI Hub';
  const loginUrl = config.mail.loginUrl || '';

  const text =
    `Olá ${username},\n\n` +
    `Foi gerada uma nova palavra-passe para a sua conta no ${appName}:\n\n` +
    `${password}\n\n` +
    `Recomendamos alterá-la após entrar no sistema.\n` +
    (loginUrl ? `\nEntrada: ${loginUrl}\n` : '\n') +
    `\n— ${appName}`;

  const html = `
    <p>Olá <strong>${escapeHtml(username)}</strong>,</p>
    <p>Foi gerada uma nova palavra-passe para a sua conta no <strong>${escapeHtml(appName)}</strong>:</p>
    <p style="font-family:monospace;font-size:16px;padding:12px;background:#f1f5f9;border-radius:8px;">${escapeHtml(password)}</p>
    <p>Recomendamos alterá-la após entrar no sistema.</p>
    ${loginUrl ? `<p><a href="${escapeHtml(loginUrl)}">Ir para a página de entrada</a></p>` : ''}
    <p style="color:#64748b;font-size:12px;">— ${escapeHtml(appName)}</p>`;

  await transport.sendMail({
    from: config.mail.from,
    to,
    subject: `${appName} — nova palavra-passe`,
    text,
    html,
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { isMailConfigured, sendPasswordResetEmail };
