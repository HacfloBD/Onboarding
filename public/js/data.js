// Database and Netlify Function access. RLS decides what each user can see.
import { supabase } from './supabase.js';

export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,project_id,active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('id,code,name,csm_name,target_go_live,status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id,code,name,csm_name,target_go_live,status')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveProject(p) {
  const row = {
    name: p.name,
    code: p.code || null,
    csm_name: p.csm_name || null,
    target_go_live: p.target_go_live || null
  };
  const q = p.id
    ? supabase.from('projects').update(row).eq('id', p.id)
    : supabase.from('projects').insert({ ...row, created_by: p.created_by });
  const { data, error } = await q.select('id,code,name,csm_name,target_go_live,status').single();
  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,email,full_name,role,project_id,active')
    .order('role')
    .order('full_name');
  if (error) throw error;
  return data;
}

// Calls a Netlify Function with the signed-in user's access token.
export async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session ? session.access_token : ''}`
    },
    body: JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
