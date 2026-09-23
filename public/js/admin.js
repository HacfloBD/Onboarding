// Admin panels: Projects, Project Setup, Users, Phases. Admin only (RLS enforces it).
import { S, hooks } from './state.js';
import {
  listProjectOverview, createProject, updateProject, setProjectStatus, listProfiles,
  resetProjectProgress, logActivity, callFunction, loadActivity,
  uploadResource, removeResource, saveSetting, loadSettingRows, loadResourceLog, resourceUrl
} from './data.js';
import { youtubeId, openVideo } from './resources.js';
import { portalUrl } from './supabase.js';
import { openTemplateEditor, openProjectEditor, wireEditor, guardUnsaved, closeEditor } from './phase-editor.js';
import { toast, openModal, closeModal, registerActions, escapeHtml, daysLeft, slug, fmtDate, fmtSize, safeUrl, reportError, errorKind, NETWORK_MSG } from './ui.js';

const esc = escapeHtml;
const $ = id => document.getElementById(id);
const RL = { client_lead: 'Client Lead', client_it: 'IT Contact', admin: 'FLO Admin', utility_staff: 'Utility Staff' };
const loading = '<div style="padding:24px;color:var(--g4);font-size:.9rem">Loading...</div>';
const failed = e => `<div class="lerr on">${errorKind(e) === 'network' ? NETWORK_MSG : `Could not load: ${esc(e.message || e)}`}</div>`;

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
    else if (s === 'activity') await renderActivity(c, stale);
    else if (s === 'resources') await renderResources(c, stale);
    else if (s === 'phases') {
      if (S.project) await openProjectEditor(c);
      else c.innerHTML = '<div class="ash"><h2>Phases</h2></div><p style="font-size:.86rem;color:var(--g4)">Select a project first. To change the phases every new project starts with, use Phase Template.</p>';
    }
  } catch (e) {
    if (errorKind(e) === 'session') { reportError(e); return; }
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
<div class="fg" style="margin:0;flex:1;min-width:220px"><input id="aQ" aria-label="Search projects" placeholder="Search by name, code or CSM" value="${esc(listQuery)}"></div>
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
      if (e.code === '23505') toast('That project code is already in use. Pick another.', 'err'); else reportError(e, 'Could not save the project');
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
    reportError(e);
    return false;
  }
}

function showPortalLink(email, configured) {
  openModal(`<h2>User created</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px">${configured ? 'The welcome email could not be sent' : 'Email not configured'}: share the portal link manually with <strong>${esc(email)}</strong>. They sign in with that email address and a one-time code.</p>
<div class="cplink"><input id="cpL" aria-label="Portal link" readonly value="${esc(portalUrl())}"><button class="btn btn-p btn-sm" data-action="copy-link">Copy portal link</button></div>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Done</button></div>`);
}

function activeModal(u, on) {
  openModal(`<h2>${on ? 'Reactivate' : 'Deactivate'} user</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px"><strong>${esc(u.full_name || u.email)}</strong> ${on ? 'will be able to sign in again.' : "will be signed out and won't be able to sign in until reactivated."}</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn ${on ? 'btn-p' : 'btn-d'}" data-action="confirm-user-active" data-id="${esc(u.user_id)}" data-on="${on ? '1' : '0'}">${on ? 'Reactivate' : 'Deactivate'}</button></div>`);
}

// ---------------------------------------------------------------------------
// Activity timeline (selected project)
// ---------------------------------------------------------------------------

const ACTIONS = {
  step_done: 'Completed a step', step_undone: 'Reopened a step', form_saved: 'Saved a form',
  upload_added: 'Added an upload', upload_deleted: 'Removed an upload', phase_status: 'Changed phase status',
  project_created: 'Created the project', project_reset: 'Reset project progress', project_archived: 'Archived the project',
  project_restored: 'Restored the project', phases_edited: 'Edited phases', template_applied: 'Applied the template',
  user_created: 'Added a user', user_deactivated: 'Deactivated a user', user_reactivated: 'Reactivated a user',
  session_request_emailed: 'Session request emailed to FLO', customer_notified: 'Emailed the Client Lead',
  upload_emailed: 'Upload emailed to FLO'
};
let actRows = [];
const actF = { kind: 'all', user: '', phase: '' };

function actPhase(r) {
  const d = r.detail || {};
  if (d.phase_id) return d.phase_id;
  if (d.step_id) {
    const p = S.phases.find(ph => ph.steps.some(x => x.id === d.step_id));
    return p ? p.id : 'other';
  }
  return 'project';
}
function actWho(r) {
  if (!r.actor_id) return 'System';
  const p = S.people[r.actor_id];
  const name = p ? (p.full_name || p.email) : (S.directory[r.actor_id] || {}).name || 'Former user';
  return (r.actor_role === 'admin' ? 'FLO: ' : '') + name;
}
function actFiltered() {
  return actRows.filter(r =>
    (actF.kind === 'all' || r.on_behalf) &&
    (!actF.user || r.actor_id === actF.user) &&
    (!actF.phase || actPhase(r) === actF.phase));
}
function actTable() {
  const rows = actFiltered();
  if (!rows.length) return '<p style="font-size:.86rem;color:var(--g4);padding:14px 0">No activity matches these filters.</p>';
  return `<table class="at"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
<td style="font-size:.78rem;white-space:nowrap">${esc(fmtDate(r.created_at))}</td>
<td style="font-size:.82rem">${esc(actWho(r))}</td>
<td style="font-size:.82rem">${esc(ACTIONS[r.action] || r.action)}</td>
<td style="font-size:.8rem;color:var(--g6)">${esc(r.target || '')}${r.action === 'phase_status' && r.detail ? esc(` (${r.detail.from} to ${r.detail.to})`) : ''}</td>
<td>${r.on_behalf ? '<span class="pill-ob">On behalf</span>' : ''}</td></tr>`).join('')}</tbody></table>`;
}
function phaseLabel(id) {
  const i = S.phases.findIndex(p => p.id === id);
  return i >= 0 ? `Phase ${i + 1}: ${S.phases[i].name}` : id === 'project' ? 'Project-level' : 'Removed steps';
}

async function renderActivity(c, stale) {
  if (!S.project) { c.innerHTML = '<div class="ash"><h2>Activity</h2></div><p style="font-size:.86rem;color:var(--g4)">Select a project first.</p>'; return; }
  c.innerHTML = loading;
  const [rows] = await Promise.all([loadActivity(S.project.id), hooks.refreshPeople()]);
  if (stale()) return;
  actRows = rows;
  const users = [...new Set(rows.map(r => r.actor_id).filter(Boolean))];
  const phases = [...S.phases.map(p => p.id), 'project', 'other'];
  c.innerHTML = `<div class="ash"><h2>Activity: ${esc(S.project.name)}</h2><div style="display:flex;gap:8px"><button class="btn btn-sm btn-s" data-action="act-refresh">Refresh</button><button class="btn btn-sm btn-p" data-action="act-csv">Export CSV</button></div></div>
<div class="acf">
<div class="fg"><label>Show</label><select id="acK"><option value="all">All activity</option><option value="ob" ${actF.kind === 'ob' ? 'selected' : ''}>On behalf of the customer only</option></select></div>
<div class="fg"><label>By</label><select id="acU"><option value="">Anyone</option>${users.map(u => `<option value="${u}" ${actF.user === u ? 'selected' : ''}>${esc(actWho({ actor_id: u, actor_role: (rows.find(r => r.actor_id === u) || {}).actor_role }))}</option>`).join('')}</select></div>
<div class="fg"><label>Phase</label><select id="acP"><option value="">All phases</option>${phases.map(p => `<option value="${p}" ${actF.phase === p ? 'selected' : ''}>${esc(phaseLabel(p))}</option>`).join('')}</select></div>
<span id="acN" style="font-size:.8rem;color:var(--g5);padding-bottom:8px"></span>
</div>
<div id="acT" style="overflow-x:auto"></div>`;
  const draw = () => { $('acT').innerHTML = actTable(); $('acN').textContent = `${actFiltered().length} of ${actRows.length} entries`; };
  $('acK').addEventListener('change', e => { actF.kind = e.target.value; draw(); });
  $('acU').addEventListener('change', e => { actF.user = e.target.value; draw(); });
  $('acP').addEventListener('change', e => { actF.phase = e.target.value; draw(); });
  draw();
}

function csvCell(v) {
  const t = v === null || v === undefined ? '' : String(v);
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = actFiltered();
  const head = ['When (UTC)', 'Who', 'Role', 'Action', 'Details', 'On behalf', 'Phase', 'Raw detail'];
  const lines = [head.map(csvCell).join(',')].concat(rows.map(r => [
    r.created_at, actWho(r), r.actor_role || '', ACTIONS[r.action] || r.action, r.target || '',
    r.on_behalf ? 'yes' : 'no', phaseLabel(actPhase(r)), JSON.stringify(r.detail || {})
  ].map(csvCell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `activity-${S.project.code}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------
// Resources (app-wide): overview video, user manual, master template, CCC tool
// ---------------------------------------------------------------------------

const FILES = {
  manual: {
    key: 'manual_file_path', folder: 'manual', title: 'User manual', accept: '.pdf,application/pdf',
    type: 'application/pdf', ext: /\.pdf$/i, hint: 'PDF, up to 20 MB. Shown on everyone\'s Journey as "Download the user manual (PDF)".'
  },
  template: {
    key: 'master_template_path', folder: 'templates', title: 'Master data template', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: /\.xlsx$/i,
    hint: 'Excel .xlsx, up to 20 MB. Offered in "Option B: Use our master template" on upload steps. Until you upload one, the bundled FLO_Onboarding_Forms.xlsx is used.'
  }
};
const MAX_RESOURCE = 20 * 1048576;
const RES_LABELS = { overview_video_url: 'Overview video', manual_file_path: 'User manual', master_template_path: 'Master data template', ccc_assessment_url: 'CCC Compliance Assessment tool' };
let resRows = {};

function fileBlock(kind) {
  const f = FILES[kind];
  const v = (resRows[f.key] || {}).value;
  const cur = v && typeof v === 'object' && v.path ? v : typeof v === 'string' && v ? { path: v, file_name: v.split('/').pop() } : null;
  return `<div class="rsec"><h3>${f.title}</h3><p class="rhint">${esc(f.hint)}</p>
${cur ? `<div class="uf"><span>📄</span><div class="ufn">${esc(cur.file_name)}<div class="ufm">${esc([cur.size_bytes ? fmtSize(cur.size_bytes) : '', cur.uploaded_at ? 'Uploaded ' + fmtDate(cur.uploaded_at) : ''].filter(Boolean).join(' · '))}</div></div><a class="btn btn-g btn-sm" href="${esc(resourceUrl(cur.path, cur.file_name || true))}">Download current</a></div>` : '<p class="rnone">No file uploaded yet.</p>'}
<div class="rrow"><input type="file" id="rf-${kind}" accept="${f.accept}" aria-label="Choose a new ${f.title.toLowerCase()} file"><button class="btn btn-p btn-sm" data-action="res-upload" data-kind="${kind}">${cur ? 'Replace' : 'Upload'}</button></div>
<div class="uprog" id="rp-${kind}"></div></div>`;
}

async function renderResources(c, stale) {
  c.innerHTML = loading;
  const [rows, log] = await Promise.all([loadSettingRows(), loadResourceLog().catch(() => [])]);
  if (stale()) return;
  resRows = Object.fromEntries(rows.map(r => [r.key, r]));
  const txt = k => { const v = (resRows[k] || {}).value; return typeof v === 'string' ? v : ''; };
  const who = id => { const p = S.people[id]; return p ? (p.full_name || p.email) : 'someone'; };
  c.innerHTML = `<div class="ash"><h2>Resources</h2></div>
<p class="edsub">Shared with every customer. Changes show up on their Journey right away.</p>
<div class="rsec"><h3>Overview video</h3><p class="rhint">Any YouTube link (watch, youtu.be, shorts or embed). Unlisted videos work. Leave empty to hide the video card.</p>
<div class="rrow"><div class="fg" style="margin:0;flex:1"><input id="rVid" value="${esc(txt('overview_video_url'))}" placeholder="https://youtu.be/..." aria-label="Overview video URL"></div>
<button class="btn btn-s btn-sm" data-action="res-video-preview">Preview</button><button class="btn btn-p btn-sm" data-action="res-video-save">Save</button></div>
<div class="rerr" id="rVidErr"></div></div>
${fileBlock('manual')}
${fileBlock('template')}
<div class="rsec"><h3>CCC Compliance Assessment tool</h3><p class="rhint">Link shown on the "Schedule your 6-Pillar assessment session" step. Leave empty to hide it.</p>
<div class="rrow"><div class="fg" style="margin:0;flex:1"><input id="rCcc" value="${esc(txt('ccc_assessment_url'))}" placeholder="https://..." aria-label="CCC Compliance Assessment tool URL"></div>
<button class="btn btn-p btn-sm" data-action="res-ccc-save">Save</button></div>
<div class="rerr" id="rCccErr"></div></div>
<h3 class="edsec">Recent changes</h3>
${log.length ? `<table class="at"><tbody>${log.map(r => `<tr><td style="font-size:.78rem;white-space:nowrap">${esc(fmtDate(r.created_at))}</td><td style="font-size:.82rem">${esc(who(r.actor_id))}</td><td style="font-size:.82rem">${esc(RES_LABELS[r.target] || r.target)} ${r.detail && r.detail.to === null ? 'cleared' : 'updated'}</td></tr>`).join('')}</tbody></table>` : '<p class="rnone">No changes yet.</p>'}`;
}

async function saveResourceSetting(key, value, okMsg) {
  try {
    await saveSetting(key, value);
    toast(okMsg, 'ok');
    hooks.reloadSettings();
    adminGo('resources');
  } catch (e) {
    reportError(e, 'Could not save');
  }
}

async function uploadResourceFile(kind, btn) {
  const f = FILES[kind];
  const inp = $('rf-' + kind);
  const file = inp && inp.files[0];
  if (!file) { toast('Choose a file first', 'err'); return; }
  if (!f.ext.test(file.name)) { toast(`That doesn't look like a ${kind === 'manual' ? 'PDF' : '.xlsx'} file.`, 'err'); return; }
  if (file.size > MAX_RESOURCE) { toast('The file is larger than 20 MB.', 'err'); return; }
  const old = (resRows[f.key] || {}).value;
  const oldPath = old && typeof old === 'object' ? old.path : typeof old === 'string' ? old : null;
  btn.classList.add('busy');
  $('rp-' + kind).textContent = `Uploading ${file.name}...`;
  try {
    const meta = await uploadResource(f.folder, file, f.type);
    await saveSetting(f.key, meta);
    if (oldPath && oldPath !== meta.path) await removeResource(oldPath);
    toast(`${f.title} updated`, 'ok');
    hooks.reloadSettings();
    adminGo('resources');
  } catch (e) {
    $('rp-' + kind).textContent = '';
    reportError(e, 'Could not upload');
  } finally {
    btn.classList.remove('busy');
  }
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
      reportError(e, 'Could not reset');
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
      reportError(e, 'Could not archive');
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
      reportError(e, 'Could not restore');
    }
    adminGo('projects');
  },
  'res-video-preview': () => {
    const v = $('rVid').value.trim();
    $('rVidErr').textContent = '';
    if (!openVideo(v, 'Preview: overview video')) $('rVidErr').textContent = 'That is not a YouTube video link.';
  },
  'res-video-save': () => {
    const v = $('rVid').value.trim();
    $('rVidErr').textContent = '';
    if (v && !youtubeId(v)) { $('rVidErr').textContent = 'That is not a YouTube video link. Paste the link from YouTube\'s Share button.'; return; }
    saveResourceSetting('overview_video_url', v || null, v ? 'Overview video saved' : 'Overview video removed');
  },
  'res-ccc-save': () => {
    const v = $('rCcc').value.trim();
    $('rCccErr').textContent = '';
    if (v && !safeUrl(v)) { $('rCccErr').textContent = 'Enter a full link starting with https://'; return; }
    saveResourceSetting('ccc_assessment_url', v ? safeUrl(v) : null, v ? 'Assessment tool link saved' : 'Assessment tool link removed');
  },
  'res-upload': el => uploadResourceFile(el.dataset.kind, el),
  'act-refresh': () => adminGo('activity'),
  'act-csv': () => exportCsv(),
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
      reportError(e);
    }
    adminGo('users');
  }
});
