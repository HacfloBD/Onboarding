// Service-role Supabase client and the admin guard used by every admin function.
// SUPABASE_SERVICE_ROLE_KEY is read from Netlify env vars and never leaves the server.
import { createClient } from '@supabase/supabase-js';
import { json } from './http.mjs';

let client = null;

export function adminClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// Verifies the caller's Supabase JWT and that they have an active profile.
// Returns { caller, sb } on success or { response } to return immediately.
export async function requireUser(req) {
  if (req.method !== 'POST') return { response: json(405, { error: 'Method not allowed' }) };

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { response: json(401, { error: 'Not signed in' }) };

  let sb;
  try {
    sb = adminClient();
  } catch (e) {
    console.error(e.message);
    return { response: json(500, { error: 'Server is not configured' }) };
  }

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return { response: json(401, { error: 'Session expired. Sign in again.' }) };

  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('user_id,email,full_name,role,project_id,active')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (profErr) {
    console.error(profErr);
    return { response: json(500, { error: 'Could not verify your account' }) };
  }
  if (!profile || !profile.active) return { response: json(403, { error: 'Your account is not active' }) };

  return { caller: profile, sb };
}

// Same as requireUser, plus the caller must be an admin.
export async function requireAdmin(req) {
  const r = await requireUser(req);
  if (r.response) return r;
  if (r.caller.role !== 'admin') return { response: json(403, { error: 'Admins only' }) };
  return r;
}

export async function logActivity(sb, entry) {
  const { error } = await sb.from('activity_log').insert({ on_behalf: false, detail: {}, ...entry });
  if (error) console.error('activity_log insert failed', error);
}
