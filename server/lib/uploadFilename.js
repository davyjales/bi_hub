/**
 * Corrige nomes de ficheiro vindos do multipart (Multer/Busboy costuma
 * interpretar UTF-8 como latin1 → "Análise" vira "AnÃ¡lise").
 */
function looksLikeUtf8Mojibake(s) {
  return /Ã.|Â.|â€|Ä.|ï¿½/.test(s);
}

function decodeUploadedFileName(name) {
  if (name == null) return '';
  let raw = String(name).trim();
  if (!raw) return raw;

  if (looksLikeUtf8Mojibake(raw)) {
    try {
      const fixed = Buffer.from(raw, 'latin1').toString('utf8').trim();
      if (fixed && !looksLikeUtf8Mojibake(fixed)) raw = fixed;
    } catch (_) {}
  }

  return raw.normalize('NFC');
}

module.exports = { decodeUploadedFileName, looksLikeUtf8Mojibake };
