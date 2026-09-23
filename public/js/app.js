import './network-canvas.js';
import { S, isAdmin, hooks } from './state.js';
import { initAuth, signOut } from './auth.js';
import {
  loadProject, listProjectOverview, listProfiles, loadPhasesAndSteps, loadForms, loadUploads,
  loadSettings, setStepDone, subscribeProject, loadDirectory, callFunction
} from './data.js';
import { toast, openModal, closeModal, registerActions, wireActions, escapeHtml, daysLeft } from './ui.js';
import { wireWidgets, fillThumbs, applyDrafts, flushAll } from './widgets.js';
import { phaseCard, stepLabel } from './render.js';
import { adminGo, currentSection } from './admin.js';
import { refreshProjectEditorIfClean, guardUnsaved, closeEditor } from './phase-editor.js';

const $ = id => document.getElementById(id);
const esc = escapeHtml;
const RL = { client_lead: 'Client Lead', client_it: 'IT Contact', admin: 'FLO Admin', utility_staff: 'Utility Staff' };
// UI preference only (which project the admin last had open). No app data lives in the browser.
const ADMIN_PROJECT_KEY = 'flo_admin_project';

function prefGet() { try { return localStorage.getItem(ADMIN_PROJECT_KEY); } catch { return null; } }
function prefSet(id) { try { if (id) localStorage.setItem(ADMIN_PROJECT_KEY, id); else localStorage.removeItem(ADMIN_PROJECT_KEY); } catch { /* ignore */ } }

// ---------------------------------------------------------------------------
// Loading the open project + realtime
// ---------------------------------------------------------------------------

let unsubscribe = null;
let loadSeq = 0;
let lastKey = '';
let refreshTimer = null;
let renderDeferred = false;

async function fetchProjectData(projectId) {
  const [phases, forms, uploads] = await Promise.all([
    loadPhasesAndSteps(projectId), loadForms(projectId), loadUploads(projectId)
  ]);
  return { phases, forms, uploads };
}

async function openProject(project) {
  await flushAll();
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const seq = ++loadSeq;
  S.project = project;
  S.open = new Set();
  S.viewOpen = new Set();
  S.phases = []; S.forms = {}; S.uploads = [];
  lastKey = '';
  if (project) {
    const [d] = await Promise.all([fetchProjectData(project.id), isAdmin() ? refreshPeople() : null]);
    if (seq !== loadSeq) return;
    S.phases = d.phases; S.forms = applyDrafts(d.forms); S.uploads = d.uploads;
    lastKey = JSON.stringify(d);
    const act = S.phases.find(p => p.status === 'active');
    if (act) S.open.add(act.id);
    unsubscribe = subscribeProject(project.id, scheduleRefresh);
  }
  renderAll();
}

// Re-fetch the open project. Skips the re-render when nothing changed, and
// waits while someone is typing in a form so their cursor isn't lost.
async function reload(force = false) {
  if (!S.project) return;
  const seq = loadSeq, id = S.project.id;
  let d;
  try { d = await fetchProjectData(id); } catch (e) { console.warn('refresh', e.message); return; }
  if (seq !== loadSeq || !S.project || S.project.id !== id) return;
  const key = JSON.stringify(d);
  if (!force && key === lastKey) return;
  lastKey = key;
  const wasActive = new Set(S.phases.filter(p => p.status === 'active').map(p => p.id));
  S.phases = d.phases; S.forms = applyDrafts(d.forms); S.uploads = d.uploads;
  S.phases.forEach(p => { if (p.status === 'active' && !wasActive.has(p.id)) S.open.add(p.id); });
  if (isEditing()) { renderDeferred = true; return; }
  renderAll();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => reload(), 250);
}

function isEditing() {
  const a = document.activeElement;
  return !!(a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) && a.closest('#jPh .ifrm'));
}

document.addEventListener('focusout', () => setTimeout(() => {
  if (renderDeferred && !isEditing()) { renderDeferred = false; renderAll(); }
}, 0));

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

// Phase number = order among live phases (1..N); step label = number + letter.
const phaseNo = p => S.phases.indexOf(p) + 1;
const FORM_TYPES = new Set(['form_org_details', 'form_schedule_session', 'form_frequency', 'upload_files', 'form_api_integration', 'form_branding']);

function findNext() {
  for (const p of S.phases) {
    if (p.status === 'complete') continue;
    for (const s of p.steps) if (!s.done && s.owner !== 'flo') return { p, s };
    for (const s of p.steps) if (!s.done) return { p, s };
    return null;
  }
  return null;
}

function findStep(id) {
  for (const p of S.phases) {
    const i = p.steps.findIndex(x => x.id === id);
    if (i >= 0) return { p, s: p.steps[i], label: stepLabel(phaseNo(p), i) };
  }
  return null;
}

const canToggle = s => isAdmin() || s.owner !== 'flo';

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function nextCard(nx) {
  return nx ? `<div class="na" data-action="jump" data-step="${nx.s.id}"><div class="nai">▶</div><div class="nab"><div class="nal">Next Step</div><div class="nat">${esc(nx.s.text)}</div><div class="nad">Phase ${phaseNo(nx.p)}: ${esc(nx.p.name)}</div></div><div class="nag">→</div></div>` : '';
}

function emptyJourney() {
  return `<div class="card"><div class="cb" style="text-align:center;padding:40px 20px;color:var(--g5)"><div style="font-size:2rem;margin-bottom:8px">🗂️</div><p style="font-size:.9rem">${isAdmin()
    ? 'No project selected. Pick one in the project switcher or create one in Admin > Projects.'
    : 'Your project is being set up. Check back soon.'}</p></div></div>`;
}

function rJ() {
  if (!S.project) { $('jNx').innerHTML = ''; $('jPh').innerHTML = emptyJourney(); return; }
  $('jNx').innerHTML = nextCard(findNext());
  $('jPh').innerHTML = S.phases.map((p, i) => phaseCard(p, i, { open: S.open.has(p.id) })).join('');
  fillThumbs($('jPh'));
}

function rSt() {
  const ph = S.phases;
  const steps = ph.flatMap(p => p.steps);
  const done = ph.filter(p => p.status === 'complete').length;
  const ts = steps.length, ds = steps.filter(x => x.done).length;
  const pct = ts ? Math.round(ds / ts * 100) : 0;
  const circ = 2 * Math.PI * 48, off = circ - (pct / 100) * circ;
  $('rP').textContent = pct + '%';
  const r = $('rF'); r.style.strokeDasharray = circ; setTimeout(() => { r.style.strokeDashoffset = off; }, 100);
  const ap = ph.find(p => p.status === 'active');
  $('sS').textContent = !S.project ? 'No project selected' : ap ? `Phase ${phaseNo(ap)}: ${ap.name}` : ph.length ? 'All phases complete!' : 'Getting started';
  const forms = steps.filter(s => FORM_TYPES.has(s.type));
  $('sF').textContent = S.project ? `${forms.filter(s => s.done).length}/${forms.length}` : '--';
  const dl = S.project ? daysLeft(S.project.target_go_live) : null;
  $('sD').textContent = dl === null ? '--' : dl;
  $('sPh').textContent = S.project ? `${done}/${ph.length}` : '--';

  const open = ph.filter(p => p.status !== 'complete').flatMap(p => p.steps.filter(x => !x.done));
  const cs = open.filter(x => x.owner === 'client').length, fs = open.filter(x => x.owner === 'flo').length;
  const bb = $('bB');
  if (cs > fs) { $('bL').textContent = 'Your Turn'; $('bS').textContent = cs + ' items'; bb.style.background = 'rgba(251,191,36,.12)'; bb.style.borderColor = 'rgba(251,191,36,.2)'; }
  else if (fs > 0) { $('bL').textContent = "FLO's Turn"; $('bS').textContent = fs + ' items'; bb.style.background = 'rgba(45,212,191,.1)'; bb.style.borderColor = 'rgba(45,212,191,.2)'; }
  else { $('bL').textContent = pct === 100 ? 'Done! 🎉' : 'Ready'; $('bS').textContent = pct === 100 ? 'All complete' : ''; bb.style.background = 'rgba(74,222,128,.1)'; bb.style.borderColor = 'rgba(74,222,128,.2)'; }

  $('jNx2').innerHTML = S.project ? nextCard(findNext()) : '';

  const yi = [], fi = [];
  ph.forEach(p => { if (p.status === 'complete') return; p.steps.forEach((s, i) => { if (s.done) return; (s.owner === 'flo' ? fi : yi).push({ s, p, label: stepLabel(phaseNo(p), i) }); }); });
  const sub = i => `Phase ${phaseNo(i.p)} · Step ${i.label}`;
  $('sCols').innerHTML = `
<div class="card"><div class="ch"><h3>🎯 Your Items</h3><span class="btn btn-g btn-sm">${yi.length}</span></div><div class="cb">${yi.length ? yi.map(i => `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--g1);cursor:pointer" data-action="jump" data-step="${i.s.id}"><div style="width:24px;height:24px;border-radius:50%;background:var(--w1);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;margin-top:2px">🏐</div><div><div style="font-size:.85rem;font-weight:600;color:var(--g8)">${esc(i.s.text)}</div><div style="font-size:.76rem;color:var(--g5);margin-top:1px">${sub(i)}</div></div></div>`).join('') : '<div style="text-align:center;padding:24px;color:var(--g4)"><div style="font-size:2rem;margin-bottom:6px">🎉</div><p style="font-size:.86rem">Nothing waiting on you!</p></div>'}</div></div>
<div class="card"><div class="ch"><h3>⏳ Waiting on FLO</h3><span class="btn btn-g btn-sm">${fi.length}</span></div><div class="cb">${fi.length ? fi.map(i => `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--g1)"><div style="width:24px;height:24px;border-radius:50%;background:var(--cy0);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;margin-top:2px">🔄</div><div><div style="font-size:.85rem;font-weight:600;color:var(--g8)">${esc(i.s.text)}</div><div style="font-size:.76rem;color:var(--g5);margin-top:1px">${sub(i)}</div></div></div>`).join('') : '<div style="text-align:center;padding:24px;color:var(--g4)"><div style="font-size:2rem;margin-bottom:6px">⚡</div><p style="font-size:.86rem">FLO has no pending items.</p></div>'}</div></div>`;
}

function renderNav() {
  const u = S.user;
  const fn = u.name.split(' ')[0], ini = u.name.split(' ').map(n => n[0]).join('').slice(0, 3);
  const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('nAv').textContent = ini; $('nNm').textContent = u.name; $('nRl').textContent = RL[u.role] || u.role;
  $('admTab').classList.toggle('hid', !isAdmin());
  $('jG').textContent = `${g}, ${fn}! 👋`;
  if (isAdmin()) {
    const cur = S.project && S.project.id;
    $('nBadge').innerHTML = `📌 <select id="nPrSel" class="nav-sel" data-change="switch-project" aria-label="Project"><option value="">${S.projects.length ? 'Select a project' : 'No projects yet'}</option>${S.projects.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  } else {
    $('nBadge').innerHTML = `📌 <span id="nPr">${esc(S.project ? S.project.name : 'Project')}</span>`;
  }
}

// Admins see whose project they are in, and that their edits count as on behalf of the customer.
function renderBanner() {
  const b = $('obb');
  const show = isAdmin() && !!S.project;
  b.classList.toggle('hid', !show);
  if (show) b.innerHTML = `<span aria-hidden="true">👤</span><span>You are viewing <strong>${esc(S.project.name)}</strong> as FLO Admin. Changes you make are recorded as on behalf of the customer.</span>`;
}

function renderAll() {
  if (!S.user) return;
  renderNav();
  renderBanner();
  rJ();
  rSt();
  // The project phase editor mirrors S.phases, but never overwrites unsaved edits.
  if (isAdmin() && currentSection() === 'phases') refreshProjectEditorIfClean();
}

function goTab(t) {
  document.querySelectorAll('.tabC').forEach(e => e.classList.add('hid'));
  document.querySelectorAll('.tab').forEach(e => e.classList.remove('on'));
  $('t' + t[0].toUpperCase() + t.slice(1)).classList.remove('hid');
  const tb = document.querySelector(`.tab[data-t="${t}"]`);
  if (tb) tb.classList.add('on');
}

function jump(stepId) {
  const f = findStep(stepId);
  if (!f) return;
  goTab('journey');
  if (!S.open.has(f.p.id)) { S.open.add(f.p.id); $('p-' + f.p.id)?.classList.add('open'); }
  setTimeout(() => { const s = $('s-' + stepId); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
}

function showComp(p) {
  openModal(`<div style="text-align:center;padding:16px 0"><div style="font-size:3.5rem;margin-bottom:14px">🎉</div><h2 style="font-size:1.3rem;margin-bottom:10px">Phase ${phaseNo(p)} Complete!</h2><p style="color:var(--g6);font-size:.92rem;max-width:380px;margin:0 auto;line-height:1.6">${esc(p.completion_message || 'Phase complete!')}</p><div class="ma" style="justify-content:center"><button class="btn btn-p btn-lg" data-action="close-modal">Continue →</button></div></div>`);
}

// Admin ticking a customer-owned step: confirm, and optionally tell the Client Lead.
function confirmOnBehalf(f, el) {
  openModal(`<h2>Mark complete on behalf of the customer?</h2>
<p style="font-size:.9rem;color:var(--g6);line-height:1.6"><strong>${esc(f.s.text)}</strong> will show as "Completed by FLO on behalf of your team" to ${esc(S.project.name)}.</p>
<label class="edchk" style="margin-top:12px"><input type="checkbox" id="obMail"> Email the customer's Client Lead a note that FLO completed this step</label>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-p" id="obGo">Mark complete</button></div>`);
  $('obGo').addEventListener('click', () => {
    const mail = $('obMail').checked;
    closeModal();
    toggleStep(el, { confirmed: true, mail });
  });
}

async function toggleStep(el, { confirmed = false, mail = false } = {}) {
  const f = findStep(el.dataset.step);
  if (!f || !canToggle(f.s) || el.classList.contains('busy')) return;
  if (isAdmin() && !f.s.done && f.s.owner !== 'flo' && !confirmed) { confirmOnBehalf(f, el); return; }
  const wasComplete = f.p.status === 'complete';
  el.classList.add('busy');
  try {
    await setStepDone(f.s.id, !f.s.done);
  } catch (e) {
    el.classList.remove('busy');
    toast('Could not update this step: ' + esc(e.message), 'err');
    return;
  }
  if (mail) {
    callFunction('notify-admins', { kind: 'step_completed_on_behalf', step_id: f.s.id })
      .then(r => toast(r.emailSent ? "Client Lead notified" : r.emailConfigured === false ? 'Email not configured: no note sent' : 'No active Client Lead to notify', r.emailSent ? 'ok' : 'info'))
      .catch(e => toast('Could not send the note: ' + esc(e.message), 'err'));
  }
  await reload(true);
  const now = S.phases.find(p => p.id === f.p.id);
  if (!wasComplete && now && now.status === 'complete') showComp(now);
}

// ---------------------------------------------------------------------------
// Project context (admin switcher)
// ---------------------------------------------------------------------------

async function refreshProjectList() {
  S.projects = await listProjectOverview();
}

// id: project to open (null to clear). opts.refresh re-reads the project list,
// opts.keep keeps the current project data when the id is unchanged.
async function selectProject(id, opts = {}) {
  if (opts.refresh) await refreshProjectList();
  if (id && !S.projects.find(p => p.id === id)) id = null;
  if (!id && isAdmin() && opts.refresh && !opts.keep) id = S.projects[0] ? S.projects[0].id : null;
  prefSet(id);
  if (opts.keep && S.project && S.project.id === id) {
    S.project = await loadProject(id);
    renderAll();
    return;
  }
  await openProject(id ? await loadProject(id) : null);
}

// ---------------------------------------------------------------------------
// Sign-in / sign-out
// ---------------------------------------------------------------------------

// Names for attribution lines and the admin's user lists. Re-read when a
// project opens so people added during this session show by name.
async function refreshPeople() {
  const [people, directory] = await Promise.allSettled([listProfiles(), loadDirectory()]);
  if (people.status === 'fulfilled') S.people = Object.fromEntries(people.value.map(p => [p.user_id, p])); else console.warn('people', people.reason.message);
  if (directory.status === 'fulfilled') S.directory = directory.value; else console.warn('directory', directory.reason.message);
}

async function enter(user, project) {
  S.user = user;
  $('lp').style.display = 'none';
  $('app').classList.add('on');
  // Independent loads: one failing must not blank the others.
  const [settings] = await Promise.allSettled([loadSettings(), refreshPeople()]);
  if (settings.status === 'fulfilled') S.settings = settings.value; else console.warn('settings', settings.reason.message);
  if (isAdmin()) {
    await refreshProjectList();
    const pref = prefGet();
    const pick = S.projects.find(p => p.id === pref) || S.projects[0] || null;
    await selectProject(pick ? pick.id : null);
    goTab('admin');
    adminGo('projects');
  } else {
    await openProject(project);
    goTab('journey');
  }
}

function leaveApp() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  loadSeq++;
  Object.assign(S, { user: null, project: null, projects: [], phases: [], forms: {}, uploads: [], people: {}, directory: {}, settings: {}, adminNew: false });
  S.open = new Set(); S.viewOpen = new Set();
  $('lp').style.display = '';
  $('app').classList.remove('on');
  $('mW').classList.add('hid');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

Object.assign(hooks, {
  render: renderAll,
  refreshPeople,
  reload,
  selectProject,
  goTab,
  adminGo
});

registerActions({
  tab: el => { goTab(el.dataset.t); if (el.dataset.t === 'admin') adminGo(); },
  logout: async () => { await flushAll(); signOut(); },
  jump: el => jump(el.dataset.step),
  'toggle-phase': el => {
    const id = el.dataset.phase;
    if (S.open.has(id)) S.open.delete(id); else S.open.add(id);
    $('p-' + id).classList.toggle('open', S.open.has(id));
  },
  'toggle-step': el => toggleStep(el),
  'switch-project': el => {
    const target = el.value || null;
    el.value = S.project ? S.project.id : '';
    const go = async () => {
      if (currentSection() === 'phases') closeEditor();
      S.adminNew = false;
      await selectProject(target);
      if (!$('tAdmin').classList.contains('hid')) adminGo();
    };
    if (currentSection() === 'phases') guardUnsaved(go); else go();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Earlier versions kept all app data in localStorage. Remove it.
  try { localStorage.removeItem('flo_v3'); } catch { /* ignore */ }
  wireActions();
  wireWidgets($('jPh'));
  initAuth({ onSignedIn: enter, onSignedOut: leaveApp });
});
