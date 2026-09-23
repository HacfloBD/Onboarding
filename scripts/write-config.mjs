// Writes public/config.js from environment variables at build time.
// Only browser-safe values belong here. Never add service_role or Resend keys.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PORTAL_URL'];

const config = {};
const missing = [];
for (const key of KEYS) {
  config[key] = process.env[key] || '';
  if (!config[key]) missing.push(key);
}

const out = fileURLToPath(new URL('../public/config.js', import.meta.url));
writeFileSync(out, `window.FLO_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

console.log(`Wrote public/config.js`);
if (missing.length) console.warn(`Warning: missing env vars (left empty): ${missing.join(', ')}`);
