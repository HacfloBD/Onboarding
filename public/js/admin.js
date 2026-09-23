// Admin panels: Projects, Project Setup, Users, Phases. Admin only (RLS enforces it).
import { S, hooks } from './state.js';
import {
  listProjectOverview, createProject, updateProject, setProjectStatus, listProfiles,
  resetProjectProgress, logActivity, callFunction
} from './data.js';
import { portalUrl } from './supabase.js';
import { openTemplateEditor, openProjectEditor, wireEditor, guardUnsaved, closeEditor } from './phase-editor.js';
import { toast, openModal, closeModal, registerActions, escapeHtml, daysLeft, slug } from './ui.js';

const esc = escapeHtml;
const $ = id => document.getElementById(id);
const RL = { client_lead: 'Client Lead', client_it: 'IT Contact', admin: 'FLO Admin', utility_staff: 'Utility Staff' };
const loading = '<div style="padding:24px;color:var(--g4);font-size:.9rem">Loading...</div>';
const failed = e => `<div class="lerr on">Could not load: ${esc(e.message || e)}</div>`;

let section = 'projects';
let tok = 0;
let listRows = [];
let listQuery = '';
let showArchived = false;

export const currentSection = () => section;

let editorWired = false;

export async function adminGo(s = section) {
  if (s !== section && (section === 'template' || section === 'phases')) {
    guardUnsaved(() => { closeEditor(); section = s; adminGo(s); });
    return;
  }
  section = s;
  if (!editorWired) { wireEditor($('aC')); editorWired = true; }
  document.querySelectorAll('.ani').forEach(e => e.classList.toggle('on', e.dataset.a === s));
  const c = $('aC'), t = ++tok;
  const stale = () => t !== tok;
  try {
    if (s === 'projects') await renderProjects(c, stale);
    else if (s === 'setup') renderSetup(c);
    else if (s === 'users') await renderUsers(c, stale);
    else if (s === 'template') await openTemplateEditor(c);
    else if (s === 'phases') {
      if (S.project) await openProjectEditor(c);
      else c.innerHTML = '<div class="ash"><h2>Phases</h2></div><p style="font-size:.86rem;color:var(--g4)">Select a project first. To change the phases every new project starts with, use Phase Template.</p>';
    }
  } catch (e) {
    if (!stale()) c.innerHTML = failed(e);
  }
}

// ---------------------------------------------------------------------------
// Projects list
// ---------------------------------------------------------------------------

function ball(r) {
  const pct = r.total_steps ? Math.round(r.done_steps / r.total_steps * 100) : 0;
  if (r.client_open > r.flo_open) return '<span class="ptag ty">Customer</span>';
  if (r.flo_open > 0) return '<span class="ptag tf">FLO</span>';
  return pct === 100 ? '<span class="ptag td">Done</span>' : '<span class="ptag tl">Ready</span>';
}

function projectRows() {
  const q = listQuery.trim().toLowerCase();
  const rows = listRows.filter(r => !q || [r.name, r.code, r.csm_name].some(v => (v || '').toLowerCase().includes(q)));
  if (!rows.length) return `<tr><td colspan="8" style="text-align:center;color:var(--g4);padding:24px">${listRows.length ? 'No projects match your search.' : 'No projects yet. Click "New project" to create the first one.'}</td></tr>`;
  return rows.map(r => {
    const pct = r.total_steps ? Math.round(r.done_steps / r.total_steps * 100) : 0;
    const dl = daysLeft(r.target_go_live);
    const sel = S.project && S.project.id === r.id;
    const archived = r.status === 'archived';
    return `<tr${sel ? ' class="sel"' : ''}>
<td><button class="lnk" data-action="open-project" data-id="${r.id}" ${archived ? 'disabled' : ''}>${esc(r.name)}</button><div style="font-size:.74rem;color:var(--g4)">${esc(r.code)}${archived ? ' · archived' : ''}</div></td>
<td>${esc(r.csm_name || '')}</td>
<td><div class="pbar"><span style="width:${pct}%"></span></div><div style="font-size:.74rem;color:var(--g5)">${pct}%</div></td>
<td style="font-size:.82rem">${r.current_phase_position ? `Phase ${r.current_phase_position}: ${esc(r.current_phase_name)}` : (pct === 100 ? 'All complete' : '')}</td>
<td style="font-size:.82rem">${esc(r.target_go_live || '')}</td>
<td>${dl === null ? '' : dl}</td>
<td>${ball(r)}</td>
<td>${archived
      ? `<button class="btn btn-g btn-sm" style="color:var(--tl)" data-action="restore-project" data-id="${r.id}">Restore</button>`
      : `<button class="btn btn-g btn-sm" style="color:var(--e5)" data-action="archive-project" data-id="${r.id}">Archive</button>`}</td>
</tr>`;
  }).join('');
}

async function renderProjects(c, stale) {
  c.innerHTML = loading;
  const rows = await listProjectOverview({ includeArchived: showArchived });
  if (stale()) return;
  listRows = rows;
  c.innerHTML = `<div class="ash"><h2>Projects (${rows.filter(r => r.status === 'active').length})</h2><button class="btn btn-sm btn-a" data-action="new-project">+ New project</button></div>
<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
<div class="fg" style="margin:0;flex:1;min-width:220px"><input id="aQ" placeholder="Search by name, code or CSM" value="${esc(listQuery)}"></div>
<label style="font-size:.84rem;color:var(--g6);display:flex;gap:6px;align-items:center"><input type="checkbox" id="aArch" ${showArchived ? 'checked' : ''}> Show archived</label>
</div>
<div style="overflow-x:auto"><table class="at"><thead><tr><th>Project</th><th>CSM</th><th>Progress</th><th>Current phase</th><th>Go-live</th><th>Days left</th><th>Ball</th><th></th></tr></thead><tbody id="aRows">${projectRows()}</tbody></table></div>`;
  $('aQ').addEventListener('input', e => { listQuery = e.target.value; $('aRows').innerHTML = projectRows(); });
  $('aArch').addEventListener('change', e => { showArchived = e.target.checked; adminGo('projects'); });
}

// ---------------------------------------------------------------------------
// Project Setup
// ---------------------------------------------------------------------------

function renderSetup(c) {
  const isNew = S.adminNew || !S.project;
  const p = isNew ? { name: '', code: '', csm_name: '', target_go_live: '' } : S.project;
  c.innerHTML = `<div class="ash"><h2>${isNew ? 'New Project' : 'Project Setup'}</h2><div style="display:flex;gap:8px">${isNew
    ? (S.project ? '<button class="btn btn-sm btn-s" data-action="cancel-new">Cancel</button>' : '')
    : '<button class="btn btn-sm btn-s" data-action="new-project">+ New project</button><button class="btn btn-sm btn-s" style="color:var(--e6)" data-action="reset-project">🔄 Reset project progress</button>'}</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label>Organization Name *</label><input id="pNm" value="${esc(p.name)}" placeholder="City of Springfield"></div>
<div class="fg"><label>Project Code</label><input id="pCd" value="${esc(p.code)}" placeholder="city-of-springfield"><div class="hint">Filled in from the name. Customers never see or type it.</div></div>
<div class="fg"><label>CSM Name</label><input id="pCs" value="${esc(p.csm_name)}"></div>
<div class="fg"><label>Target Go-Live</label><input type="date" id="pGL" value="${esc(p.target_go_live)}"></div>
</div>
<h3 style="margin:20px 0 12px;font-size:.95rem">Create First Customer User</h3>
<p style="font-size:.84rem;color:var(--g5);margin-bottom:12px">This person will receive access to the portal. They sign in with their email and a one-time code, no password needed.</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label>Full Name</label><input id="cuNm" placeholder="Jane Smith"></div>
<div class="fg"><label>Email</label><input id="cuEm" type="email" placeholder="jsmith@springfield.gov"></div>
</div>
<div style="margin-top:14px;display:flex;gap:10px"><button class="btn btn-p" data-action="save-project">${isNew ? 'Create Project' : 'Save'} & Create User</button></div>`;
  const nm = $('pNm'), cd = $('pCd');
  let codeEdited = !isNew;
  nm.addEventListener('input', () => { if (!codeEdited) cd.value = slug(nm.value); });
  cd.addEventListener('input', () => { codeEdited = cd.value.trim() !== ''; });
}

async function saveProject(btn) {
  const isNew = S.adminNew || !S.project;
  const name = $('pNm').value.trim(), code = slug($('pCd').value || name);
  if (!name) { toast('Organization name is required', 'err'); return; }
  const un = $('cuNm').value.trim(), ue = $('cuEm').value.trim().toLowerCase();
  if ((un || ue) && !(un && ue)) { toast('Enter both a name and an email for the first user', 'err'); return; }
  const fields = { name, code, csm_name: $('pCs').value.trim(), target_go_live: $('pGL').value };
  btn.classList.add('busy');
  try {
    let saved;
    try {
      saved = isNew ? await createProject(fields) : await updateProject(S.project.id, fields);
    } catch (e) {
      toast(e.code === '23505' ? 'That project code is already in use. Pick another.' : 'Could not save the project: ' + esc(e.message), 'err');
      return;
    }
    S.adminNew = false;
    toast(isNew ? 'Project created' : 'Project saved', 'ok');
    await hooks.selectProject(saved.id, { refresh: true });
    if (un && ue) await createUser({ full_name: un, email: ue, role: 'client_lead', project_id: saved.id });
  } finally {
    btn.classList.remove('busy');
  }
  adminGo('setup');
}

function resetModal() {
  const p = S.project;
  if (!p) return;
  openModal(`<h2>Reset project progress</h2>
<p style="font-size:.9rem;color:var(--g6);line-height:1.6">This clears every checked step, form answer and uploaded file for <strong>${esc(p.name)}</strong>. Other projects are not affected. This can't be undone.</p>
<div class="fg" style="margin-top:14px"><label>Type the project code <strong>${esc(p.code)}</strong> to confirm</label><input id="rsC" autocomplete="off"></div>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-d" id="rsGo" data-action="confirm-reset" disabled>Reset progress</button></div>`);
  $('rsC').addEventListener('input', e => { $('rsGo').disabled = e.target.value.trim().toLowerCase() !== p.code; });
  $('rsC').focus();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function userTable(rows, emptyText) {
  if (!rows.length) return `<p style="font-size:.86rem;color:var(--g4);padding:10px 0">${emptyText}</p>`;
  return `<table class="at"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(u => `<tr>
<td><strong>${esc(u.full_name || '')}</strong></td><td style="color:var(--g5)">${esc(u.email)}</td><td>${esc(RL[u.role] || u.role)}</td>
<td><span class="pill-st ${u.active ? 'on' : 'off'}">${u.active ? 'Active' : 'Inactive'}</span></td>
<td>${u.user_id !== S.user.id ? `<button class="btn btn-g btn-sm" style="color:${u.active ? 'var(--e5)' : 'var(--tl)'}" data-action="user-active" data-on="${u.active ? '0' : '1'}" data-id="${esc(u.user_id)}">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

let usersCache = [];

async function renderUsers(c, stale) {
  c.innerHTML = loading;
  const all = await listProfiles();
  if (stale()) return;
  usersCache = all;
  const p = S.project;
  const mine = p ? all.filter(u => u.project_id === p.id) : [];
  const admins = all.filter(u => u.role === 'admin');
  c.innerHTML = `<div class="ash"><h2>Users</h2><button class="btn btn-sm btn-a" data-action="add-user">+ Add</button></div>
<h3 style="font-size:.95rem;margin-bottom:8px">${p ? `People at ${esc(p.name)} (${mine.length})` : 'Customer users'}</h3>
${p ? userTable(mine, 'No users yet for this project.') : '<p style="font-size:.86rem;color:var(--g4);padding:10px 0">Select a project to see its users.</p>'}
<h3 style="font-size:.95rem;margin:24px 0 8px">FLO admins (${admins.length})</h3>
${userTable(admins, 'No admins.')}`;
}

function addUserModal() {
  const p = S.project;
  openModal(`<h2>Add User</h2>
<div class="fg"><label>Name</label><input id="nuN"></div>
<div class="fg"><label>Email</label><input id="nuE" type="email"></div>
<div class="fg"><label>Role</label><select id="nuR"><option value="client_lead">Client Lead</option><option value="client_it">IT Contact</option><option value="utility_staff">Utility Staff</option><option value="admin">FLO Admin</option></select></div>
<p style="font-size:.84rem;color:var(--g5);margin-top:8px" id="nuH"></p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-p" data-action="confirm-add-user">Add</button></div>`);
  const sync = () => {
    const a = $('nuR').value === 'admin';
    $('nuH').innerHTML = a
      ? 'FLO admins get an invitation email and set their own password.'
      : p ? `Adds them to <strong>${esc(p.name)}</strong>. Customers sign in with their email and a one-time code. No password needed.`
        : 'Select a project first to add customer users.';
  };
  $('nuR').addEventListener('change', sync);
  sync();
  $('nuN').focus();
}

async function createUser(body) {
  try {
    const r = await callFunction('admin-create-user', body);
    if (r.invited) toast(`Invitation sent to ${esc(body.email)}. They will set a password from the email.`, 'ok');
    else if (r.emailSent) toast(`Welcome email sent to ${esc(body.email)}`, 'ok');
    else showPortalLink(body.email, r.emailConfigured);
    return true;
  } catch (e) {
    toast(esc(e.message), 'err');
    return false;
  }
}

function showPortalLink(email, configured) {
  openModal(`<h2>User created</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px">${configured ? 'The welcome email could not be sent' : 'Email not configured'}: share the portal link manually with <strong>${esc(email)}</strong>. They sign in with that email address and a one-time code.</p>
<div class="cplink"><input id="cpL" readonly value="${esc(portalUrl())}"><button class="btn btn-p btn-sm" data-action="copy-link">Copy portal link</button></div>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Done</button></div>`);
}

function activeModal(u, on) {
  openModal(`<h2>${on ? 'Reactivate' : 'Deactivate'} user</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px"><strong>${esc(u.full_name || u.email)}</strong> ${on ? 'will be able to sign in again.' : "will be signed out and won't be able to sign in until reactivated."}</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn ${on ? 'btn-p' : 'btn-d'}" data-action="confirm-user-active" data-id="${esc(u.user_id)}" data-on="${on ? '1' : '0'}">${on ? 'Reactivate' : 'Deactivate'}</button></div>`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

registerActions({
  'admin-nav': el => adminGo(el.dataset.a),
  'open-project': async el => { await hooks.selectProject(el.dataset.id); hooks.goTab('journey'); },
  'new-project': () => { S.adminNew = true; adminGo('setup'); },
  'cancel-new': () => { S.adminNew = false; adminGo('setup'); },
  'save-project': el => saveProject(el),
  'reset-project': () => resetModal(),
  'confirm-reset': async el => {
    const p = S.project, code = $('rsC').value.trim().toLowerCase();
    el.classList.add('busy');
    try {
      await resetProjectProgress(p.id, code);
      closeModal();
      toast('Project progress reset', 'ok');
      await hooks.reload(true);
    } catch (e) {
      toast('Could not reset: ' + esc(e.message), 'err');
    } finally {
      el.classList.remove('busy');
    }
  },
  'archive-project': el => {
    const r = listRows.find(x => x.id === el.dataset.id);
    if (!r) return;
    openModal(`<h2>Archive project</h2>
<p style="font-size:.9rem;color:var(--g6);line-height:1.6"><strong>${esc(r.name)}</strong> will leave the project list and the switcher. Its data stays and you can restore it from "Show archived".</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-d" data-action="confirm-archive" data-id="${r.id}">Archive</button></div>`);
  },
  'confirm-archive': async el => {
    const r = listRows.find(x => x.id === el.dataset.id);
    closeModal();
    try {
      await setProjectStatus(r.id, 'archived');
      await logActivity(r.id, 'project_archived', r.name);
      toast('Project archived', 'info');
      if (S.project && S.project.id === r.id) await hooks.selectProject(null, { refresh: true });
      else await hooks.selectProject(S.project && S.project.id, { refresh: true, keep: true });
    } catch (e) {
      toast('Could not archive: ' + esc(e.message), 'err');
    }
    adminGo('projects');
  },
  'restore-project': async el => {
    const r = listRows.find(x => x.id === el.dataset.id);
    try {
      await setProjectStatus(r.id, 'active');
      await logActivity(r.id, 'project_restored', r.name);
      toast('Project restored', 'ok');
      await hooks.selectProject(S.project && S.project.id, { refresh: true, keep: true });
    } catch (e) {
      toast('Could not restore: ' + esc(e.message), 'err');
    }
    adminGo('projects');
  },
  'add-user': () => addUserModal(),
  'confirm-add-user': async el => {
    const n = $('nuN').value.trim(), em = $('nuE').value.trim().toLowerCase(), role = $('nuR').value;
    if (!n || !em) { toast('Name and email are required', 'err'); return; }
    if (role !== 'admin' && !S.project) { toast('Select a project first', 'err'); return; }
    el.classList.add('busy');
    closeModal();
    const ok = await createUser({ full_name: n, email: em, role, project_id: role === 'admin' ? null : S.project.id });
    el.classList.remove('busy');
    if (ok) adminGo('users');
  },
  'copy-link': async () => {
    const i = $('cpL');
    try { await navigator.clipboard.writeText(i.value); } catch { i.select(); document.execCommand('copy'); }
    toast('Portal link copied', 'ok');
  },
  'user-active': el => {
    const u = usersCache.find(x => x.user_id === el.dataset.id);
    if (u) activeModal(u, el.dataset.on === '1');
  },
  'confirm-user-active': async el => {
    const on = el.dataset.on === '1';
    closeModal();
    try {
      await callFunction('admin-deactivate-user', { user_id: el.dataset.id, reactivate: on });
      toast(on ? 'User reactivated' : 'User deactivated', 'ok');
    } catch (e) {
      toast(esc(e.message), 'err');
    }
    adminGo('users');
  }
});
