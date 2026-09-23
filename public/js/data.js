// The only module that reads or writes app data (tables, storage, RPCs,
// realtime, Netlify Functions). RLS decides what each user can see.
import { supabase } from './supabase.js';

const BUCKET = 'customer-uploads';
const PROJECT_COLS = 'id,code,name,csm_name,target_go_live,status,template_version';
const PROFILE_COLS = 'user_id,email,full_name,role,project_id,active';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// People and projects
// ---------------------------------------------------------------------------

export async function loadProfile(userId) {
  return check(await supabase.from('profiles').select(PROFILE_COLS).eq('user_id', userId).maybeSingle());
}

export async function listProfiles() {
  return check(await supabase.from('profiles').select(PROFILE_COLS).order('full_name'));
}

export async function loadProject(id) {
  return check(await supabase.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
}

// Admin list: one row per project with progress and ball-in-court counts.
export async function listProjectOverview({ includeArchived = false } = {}) {
  let q = supabase.from('project_overview').select('*').order('created_at', { ascending: false });
  if (!includeArchived) q = q.eq('status', 'active');
  return check(await q);
}

// Creates the project and copies the master template in one transaction.
export async function createProject({ name, code, csm_name, target_go_live }) {
  return check(await supabase.rpc('create_project_from_template', {
    p_name: name,
    p_code: code || null,
    p_csm_name: csm_name || null,
    p_target_go_live: target_go_live || null
  }));
}

export async function updateProject(id, { name, code, csm_name, target_go_live }) {
  return check(await supabase.from('projects')
    .update({ name, code, csm_name: csm_name || null, target_go_live: target_go_live || null })
    .eq('id', id).select(PROJECT_COLS).single());
}

export async function setProjectStatus(id, status) {
  check(await supabase.from('projects').update({ status }).eq('id', id));
}

// ---------------------------------------------------------------------------
// Journey data
// ---------------------------------------------------------------------------

export async function loadPhasesAndSteps(projectId) {
  const [phases, steps] = await Promise.all([
    supabase.from('project_phases').select('*').eq('project_id', projectId).is('archived_at', null).order('position').order('created_at'),
    supabase.from('project_steps').select('*').eq('project_id', projectId).is('archived_at', null).order('position').order('created_at')
  ]);
  const ph = check(phases), st = check(steps);
  return ph.map(p => ({ ...p, steps: st.filter(s => s.project_phase_id === p.id) }));
}

export async function loadForms(projectId) {
  const rows = check(await supabase.from('form_responses').select('*').eq('project_id', projectId).is('archived_at', null));
  return Object.fromEntries(rows.map(r => [r.project_step_id, r]));
}

export async function loadUploads(projectId) {
  return check(await supabase.from('uploads').select('*').eq('project_id', projectId).is('archived_at', null).order('created_at'));
}

// Admin: what was archived when steps were removed in the phase editor.
export async function loadArchived(projectId) {
  const [steps, forms, uploads] = await Promise.all([
    supabase.from('project_steps').select('id,text,type,done,archived_at,project_phase_id').eq('project_id', projectId).not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    supabase.from('form_responses').select('*').eq('project_id', projectId).not('archived_at', 'is', null),
    supabase.from('uploads').select('*').eq('project_id', projectId).not('archived_at', 'is', null).order('created_at')
  ]);
  return { steps: check(steps), forms: check(forms), uploads: check(uploads) };
}

// ---------------------------------------------------------------------------
// Phase template (master) and per-project phase editing
// ---------------------------------------------------------------------------

export async function loadTemplate() {
  const [phases, steps] = await Promise.all([
    supabase.from('template_phases').select('*').order('position').order('created_at'),
    supabase.from('template_steps').select('*').order('position').order('created_at')
  ]);
  const ph = check(phases), st = check(steps);
  return ph.map(p => ({ ...p, steps: st.filter(s => s.template_phase_id === p.id) }));
}

// Replaces the master template and records a new version. Returns the version number.
export async function saveTemplate(phases, note) {
  return check(await supabase.rpc('save_template', { p_phases: phases, p_note: note || null }));
}

export async function listTemplateVersions() {
  return check(await supabase.from('template_versions')
    .select('id,version_number,note,created_by,created_at').order('version_number', { ascending: false }));
}

export async function restoreTemplateVersion(version) {
  return check(await supabase.rpc('restore_template_version', { p_version: version }));
}

// Replaces one project's phases/steps. Removed steps with progress or data are archived.
export async function saveProjectPhases(projectId, phases, { note, action, templateVersion } = {}) {
  return check(await supabase.rpc('save_project_phases', {
    p_project_id: projectId,
    p_phases: phases,
    p_note: note || null,
    p_action: action || 'phases_edited',
    p_template_version: templateVersion ?? null
  }));
}

export async function loadSettings() {
  const rows = check(await supabase.from('app_settings').select('key,value'));
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function setStepDone(stepId, done) {
  check(await supabase.from('project_steps').update({ done }).eq('id', stepId).select('id').single());
}

export async function setPhaseStatus(phaseId, status) {
  check(await supabase.from('project_phases').update({ status }).eq('id', phaseId));
}

export async function saveForm(projectId, stepId, formType, data) {
  return check(await supabase.from('form_responses')
    .upsert({ project_id: projectId, project_step_id: stepId, form_type: formType, data }, { onConflict: 'project_step_id' })
    .select('*').single());
}

// ---------------------------------------------------------------------------
// Uploads (files go to customer-uploads/{project_id}/{step_id}/...)
// ---------------------------------------------------------------------------

export async function uploadFile(projectId, stepId, file) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
  const path = `${projectId}/${stepId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  check(await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  }));
  const res = await supabase.from('uploads').insert({
    project_id: projectId,
    project_step_id: stepId,
    kind: 'file',
    storage_path: path,
    file_name: file.name,
    size_bytes: file.size
  }).select('*').single();
  if (res.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw res.error;
  }
  return res.data;
}

export async function addLink(projectId, stepId, url) {
  return check(await supabase.from('uploads')
    .insert({ project_id: projectId, project_step_id: stepId, kind: 'link', link_url: url })
    .select('*').single());
}

export async function deleteUpload(upload) {
  if (upload.kind === 'file' && upload.storage_path) {
    const { data, error } = await supabase.storage.from(BUCKET).remove([upload.storage_path]);
    if (error) throw error;
    if (!data || !data.length) throw new Error('You can no longer delete this file.');
  }
  const rows = check(await supabase.from('uploads').delete().eq('id', upload.id).select('id'));
  if (!rows.length) throw new Error('You can no longer delete this file.');
}

// Signed URL valid for 10 minutes. With a file name it downloads instead of opening.
export async function signedUrl(path, downloadName) {
  const opts = downloadName ? { download: downloadName } : undefined;
  return check(await supabase.storage.from(BUCKET).createSignedUrl(path, 600, opts)).signedUrl;
}

export async function signedUrls(paths) {
  if (!paths.length) return {};
  const rows = check(await supabase.storage.from(BUCKET).createSignedUrls(paths, 600));
  return Object.fromEntries(rows.filter(r => r.signedUrl).map(r => [r.path, r.signedUrl]));
}

export function resourceUrl(path) {
  return supabase.storage.from('resources').getPublicUrl(path).data.publicUrl;
}

// Admin only. Removes the project's stored files, then clears progress in one RPC.
export async function resetProjectProgress(projectId, confirmCode) {
  const uploads = check(await supabase.from('uploads').select('storage_path').eq('project_id', projectId).eq('kind', 'file'));
  const paths = uploads.map(u => u.storage_path).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    check(await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
  }
  check(await supabase.rpc('reset_project_progress', { p_project_id: projectId, p_confirm_code: confirmCode }));
}

export async function logActivity(projectId, action, target, detail = {}) {
  const { error } = await supabase.from('activity_log').insert({ project_id: projectId, action, target, detail });
  if (error) console.warn('activity_log', error.message);
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export function subscribeProject(projectId, onChange) {
  const ch = supabase.channel(`project-${projectId}`);
  for (const table of ['project_steps', 'project_phases', 'form_responses', 'uploads']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `project_id=eq.${projectId}` }, onChange);
  }
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------------------------------------------------------------------------
// Netlify Functions (called with the signed-in user's access token)
// ---------------------------------------------------------------------------

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
