// Single shared Supabase client. Config comes from /config.js (window.FLO_CONFIG),
// written at build time by scripts/write-config.mjs. Only the anon key is ever here.
import { createClient } from '../vendor/supabase-js-2.117.1.js';

const cfg = window.FLO_CONFIG || {};

export const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const supabase = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
    })
  : null;

export function portalUrl() {
  return (cfg.PORTAL_URL || location.origin).replace(/\/+$/, '');
}
