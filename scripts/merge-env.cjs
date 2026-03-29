/**
 * Loads City-Pulse/.env then merges mobile/.env (mobile fills gaps; root wins on duplicates).
 * Apply to process.env only for keys not already set (shell/env wins).
 * Used by mobile/app.config.js and mobile/metro.config.js so Expo CLI, Metro, and export share the same rules.
 */
const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) out[key] = val;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * @param {string} mobileDir - Absolute path to the `mobile/` folder (usually __dirname from app.config / metro).
 */
function mergeEnvIntoProcessEnv(mobileDir) {
  const rootEnvPath = path.join(mobileDir, '..', '.env');
  const mobileEnvPath = path.join(mobileDir, '.env');
  const fromMobile = parseEnvFile(mobileEnvPath);
  const fromRoot = parseEnvFile(rootEnvPath);
  const merged = { ...fromMobile, ...fromRoot };
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

module.exports = { mergeEnvIntoProcessEnv, parseEnvFile };
