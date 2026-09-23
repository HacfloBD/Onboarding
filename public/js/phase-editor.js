// Phase editor used for both the master template (Admin > Phase Template) and
// one customer's phases (Admin > Phases). Edits happen on an in-memory draft;
// Save sends the whole draft to one RPC so every save is atomic.
import { S, hooks } from './state.js';
import {
  loadTemplate, saveTemplate, listTemplateVersions, restoreTemplateVersion,
  saveProjectPhases, setPhaseStatus, loadArchived, signedUrl
} from './data.js';
import { phaseCard, stepLabel } from './render.js';
import { toast, openModal, closeModal, registerActions, escapeHtml as esc, fmtDate, fmtSize } from './ui.js';

export const STEP_TYPES = [
  ['none', 'Text only', 'Instructions to read. No form.'],
  ['form_org_details', 'Organization details', 'Kick-off form: organization, contacts, counts and current system.'],
  ['form_schedule_session', 'Schedule a session', 'Preferred and alternate date and time, format, attendees. Emails the CSM.'],
  ['form_frequency', 'Testing frequency', 'Customer picks one of the options you list below.'],
  ['upload_files', 'File upload', 'Upload files, download the master template, or share a link.'],
  ['form_api_integration', 'API integration', 'Yes or no, then billing system and technical contact.'],
  ['form_branding', 'Branding', 'Sender name, reply-to email and logo upload.']
];
const OWNERS = [['client', 'Client'], ['flo', 'FLO'], ['both', 'Joint']];
const STATUSES = ['pending', 'active', 'complete'];

const DEFAULT_CONFIG = {
  form_schedule_session: { self_service_link_setting: 'ccc_assessment_url', self_service_link_label: 'Open the CCC Compliance Assessment tool' },
  form_frequency: { options: [{ value: 'calendar_year', label: 'Calendar Year', help: '' }, { value: 'not_sure', label: 'Not sure', help: 'Pick this if you want your CSM to help you decide.' }] },
  upload_files: { accept: '*', max_files: 10, show_master_template_download: true, allow_share_link: true }
};

const $ = id => document.getElementById(id);
const uuid = () => crypto.randomUUID();

// ed: { mode, container, phases, original, sel, openPh:Set, openSt:Set, versions, latestVersion, typeWarn:Set }
let ed = null;

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

function normalize(phases) {
  return phases.map(p => ({
    id: p.id, name: p.name || '', short: p.short || '', owner: p.owner || 'both', duration: p.duration || '',
    description: p.description || '', completion_message: p.completion_message || '',
    status: p.status || 'pending', source_template_phase_id: p.source_template_phase_id || null,
    steps: (p.steps || []).map(s => ({
      id: s.id, text: s.text || '', owner: s.owner || 'client', type: s.type || 'none', detail: s.detail || '',
      config: s.config || {}, done: !!s.done, source_template_step_id: s.source_template_step_id || null
    }))
  }));
}

function payload(phases = ed.phases) {
  return phases.map(p => ({
    id: p.id, name: p.name.trim(), short: p.short, owner: p.owner, duration: p.duration,
    description: p.description, completion_message: p.completion_message,
    source_template_phase_id: p.source_template_phase_id,
    steps: p.steps.map(s => ({
      id: s.id, text: s.text.trim(), owner: s.owner, type: s.type, detail: s.detail, config: s.config,
      source_template_step_id: s.source_template_step_id
    }))
  }));
}

const isDirty = () => !!ed && JSON.stringify(payload()) !== ed.original;
export const editorDirty = () => isDirty();

function findPhase(id) { return ed.phases.find(p => p.id === id); }
function findStep(id) {
  for (const p of ed.phases) {
    const i = p.steps.findIndex(s => s.id === id);
    if (i >= 0) return { p, s: p.steps[i], i };
  }
  return null;
}

// Project mode: does this step hold customer progress or data?
function stepData(stepId) {
  if (!ed || ed.mode !== 'project') return null;
  const saved = S.phases.flatMap(p => p.steps).find(s => s.id === stepId);
  const form = S.forms[stepId];
  const ups = S.uploads.filter(u => u.project_step_id === stepId).length;
  const parts = [];
  if (saved && saved.done) parts.push('it is marked done');
  if (form && form.data && Object.values(form.data).some(v => v !== '' && v !== null && v !== undefined)) parts.push('it has form answers');
  if (ups) parts.push(`it has ${ups} upload${ups > 1 ? 's' : ''}`);
  return parts.length ? parts : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

function configEditor(s) {
  if (s.type === 'form_frequency') {
    const opts = (s.config.options || []);
    return `<div class="edcfg"><div class="edcfg-t">Options</div>
<table class="edopt"><thead><tr><th>Label</th><th>Value</th><th>Help text</th><th></th></tr></thead><tbody>
${opts.map((o, i) => `<tr><td><input data-opt-f="label" data-opt-i="${i}" data-st="${s.id}" value="${esc(o.label)}"></td><td><input data-opt-f="value" data-opt-i="${i}" data-st="${s.id}" value="${esc(o.value)}"></td><td><input data-opt-f="help" data-opt-i="${i}" data-st="${s.id}" value="${esc(o.help)}"></td><td><button class="btn btn-g btn-sm" data-action="ed-opt-del" data-st="${s.id}" data-i="${i}" title="Remove option" aria-label="Remove option">✕</button></td></tr>`).join('')}
</tbody></table><button class="btn btn-g btn-sm" data-action="ed-opt-add" data-st="${s.id}">+ Add option</button></div>`;
  }
  if (s.type === 'upload_files') {
    const c = s.config;
    return `<div class="edcfg"><div class="edcfg-t">Upload options</div>
<label class="edchk"><input type="checkbox" data-cfg="show_master_template_download" data-st="${s.id}" ${c.show_master_template_download !== false ? 'checked' : ''}> Show "Option B: Use our master template" download</label>
<label class="edchk"><input type="checkbox" data-cfg="allow_share_link" data-st="${s.id}" ${c.allow_share_link !== false ? 'checked' : ''}> Allow "Or share a link"</label></div>`;
  }
  return '';
}

function stepRow(p, pNo, s, i) {
  const open = ed.openSt.has(s.id);
  const t = STEP_TYPES.find(x => x[0] === s.type) || STEP_TYPES[0];
  const moveOpts = ed.phases.map((q, qi) => opt(q.id, `Phase ${qi + 1}: ${q.name || 'Untitled'}`, p.id)).join('');
  const data = stepData(s.id);
  return `<div class="edst${open ? ' open' : ''}" data-st-row="${s.id}" data-drop="step">
<div class="edst-h">
<span class="edh" draggable="true" data-drag="step" data-id="${s.id}" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
<span class="edlbl">${stepLabel(pNo, i)}</span>
<input class="edtxt" data-st-f="text" data-st="${s.id}" value="${esc(s.text)}" placeholder="Step text" aria-label="Step ${stepLabel(pNo, i)} text">
${s.done ? '<span class="ptag td">Done</span>' : ''}
<button class="edbtn" data-action="ed-st-up" data-id="${s.id}" title="Move up" aria-label="Move step up" ${i === 0 ? 'disabled' : ''}>▲</button>
<button class="edbtn" data-action="ed-st-down" data-id="${s.id}" title="Move down" aria-label="Move step down" ${i === p.steps.length - 1 ? 'disabled' : ''}>▼</button>
<button class="edbtn" data-action="ed-st-toggle" data-id="${s.id}" aria-expanded="${open}" title="Edit details">${open ? 'Close' : 'Edit'}</button>
<button class="edbtn edx" data-action="ed-st-del" data-id="${s.id}" title="Delete step" aria-label="Delete step">✕</button>
</div>
${open ? `<div class="edst-b">
<div class="edrow3">
<div class="fg"><label>Owner</label><select data-st-f="owner" data-st="${s.id}">${OWNERS.map(([v, l]) => opt(v, l, s.owner)).join('')}</select></div>
<div class="fg"><label>Type</label><select data-st-f="type" data-st="${s.id}">${STEP_TYPES.map(([v, l]) => opt(v, l, s.type)).join('')}</select></div>
<div class="fg"><label>Move to</label><select data-st-move="${s.id}">${moveOpts}</select></div>
</div>
<div class="edhint">${esc(t[2])}</div>
${ed.typeWarn.has(s.id) && data ? `<div class="edwarn">This step already has customer data (${esc(data.join(', '))}). It is kept, but answers saved under the old type may not show under the new one.</div>` : ''}
<div class="fg"><label>Detail</label><textarea data-st-f="detail" data-st="${s.id}" placeholder="What the customer should do">${esc(s.detail)}</textarea></div>
${configEditor(s)}
</div>` : ''}
</div>`;
}

function phaseBlock(p, pi) {
  const open = ed.openPh.has(p.id);
  const pNo = pi + 1;
  const isNew = ed.mode === 'project' && !S.phases.find(x => x.id === p.id);
  return `<div class="edph${ed.sel === p.id ? ' sel' : ''}" data-ph-row="${p.id}" data-drop="phase">
<div class="edph-h" data-action="ed-select" data-id="${p.id}">
<span class="edh" draggable="true" data-drag="phase" data-id="${p.id}" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
<span class="edno">Phase ${pNo}</span>
<input class="edname" data-ph-f="name" data-ph="${p.id}" value="${esc(p.name)}" placeholder="Phase name" aria-label="Phase ${pNo} name">
${ed.mode === 'project' ? `<select class="edstatus" data-ph-status="${p.id}" aria-label="Phase ${pNo} status" ${isNew ? 'disabled title="Save first"' : ''}>${STATUSES.map(v => opt(v, v, p.status)).join('')}</select>` : ''}
<button class="edbtn" data-action="ed-ph-up" data-id="${p.id}" title="Move up" aria-label="Move phase up" ${pi === 0 ? 'disabled' : ''}>▲</button>
<button class="edbtn" data-action="ed-ph-down" data-id="${p.id}" title="Move down" aria-label="Move phase down" ${pi === ed.phases.length - 1 ? 'disabled' : ''}>▼</button>
<button class="edbtn" data-action="ed-ph-toggle" data-id="${p.id}" aria-expanded="${open}">${open ? 'Close' : 'Edit'}</button>
<button class="edbtn edx" data-action="ed-ph-del" data-id="${p.id}" title="Delete phase" aria-label="Delete phase">✕</button>
</div>
${open ? `<div class="edph-b">
<div class="edrow3">
<div class="fg"><label>Short name</label><input data-ph-f="short" data-ph="${p.id}" value="${esc(p.short)}"></div>
<div class="fg"><label>Owner</label><select data-ph-f="owner" data-ph="${p.id}">${OWNERS.map(([v, l]) => opt(v, l, p.owner)).join('')}</select></div>
<div class="fg"><label>Duration</label><input data-ph-f="duration" data-ph="${p.id}" value="${esc(p.duration)}" placeholder="e.g. 1-2 Weeks"></div>
</div>
<div class="fg"><label>Description</label><textarea data-ph-f="description" data-ph="${p.id}">${esc(p.description)}</textarea></div>
<div class="fg"><label>Completion message</label><textarea data-ph-f="completion_message" data-ph="${p.id}" placeholder="Shown in the celebration when this phase is complete">${esc(p.completion_message)}</textarea></div>
</div>` : ''}
<div class="edsteps">
${p.steps.map((s, i) => stepRow(p, pNo, s, i)).join('')}
<div class="eddrop-end" data-drop="end" data-ph="${p.id}">${p.steps.length ? '' : 'No steps yet. This phase will not complete on its own; set its status by hand. '}Drop a step here</div>
<button class="btn btn-g btn-sm" data-action="ed-st-add" data-ph="${p.id}">+ Add step</button>
</div>
</div>`;
}

function previewHtml() {
  const i = ed.phases.findIndex(p => p.id === ed.sel);
  if (i < 0) return '<p class="edhint">Select a phase to preview it.</p>';
  const p = ed.phases[i];
  const shown = ed.mode === 'template' ? { ...p, status: 'active' } : p;
  return phaseCard(shown, i, { open: true, asClient: true });
}

function refreshPreview() {
  const el = $('edPrev');
  if (el) el.innerHTML = previewHtml();
}
let previewTimer = null;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, 150); }

function refreshDirty() {
  const d = isDirty();
  const el = $('edDirty');
  if (el) el.classList.toggle('hid', !d);
  const sv = $('edSave');
  if (sv) sv.disabled = !d;
  const ds = $('edDiscard');
  if (ds) ds.disabled = !d;
}

function versionsHtml() {
  if (ed.mode !== 'template') return '';
  const who = id => { const p = S.people[id]; return p ? (p.full_name || p.email) : ''; };
  return `<h3 class="edsec">Version history</h3>
<table class="at"><thead><tr><th>Version</th><th>Note</th><th>Saved</th><th>By</th><th></th></tr></thead><tbody>
${ed.versions.map((v, i) => `<tr><td><strong>v${v.version_number}</strong>${i === 0 ? ' <span class="ptag td">Current</span>' : ''}</td><td>${esc(v.note || '')}</td><td style="font-size:.8rem">${esc(fmtDate(v.created_at))}</td><td style="font-size:.8rem">${esc(who(v.created_by))}</td>
<td>${i === 0 ? '' : `<button class="btn btn-g btn-sm" data-action="ed-restore" data-v="${v.version_number}">Restore this version</button>`}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--g4)">No versions yet.</td></tr>'}
</tbody></table>`;
}

export function renderEditor() {
  if (!ed) return;
  const c = ed.container;
  const title = ed.mode === 'template' ? 'Phase Template' : `Phases: ${esc(S.project.name)}`;
  const sub = ed.mode === 'template'
    ? `The master used for <strong>new</strong> projects. Existing projects change only when you use "Apply latest template" on them. Current version: v${ed.latestVersion || 1}.`
    : `Changes apply to this customer only. Based on template ${S.project.template_version ? 'v' + S.project.template_version : '(unknown version)'}; latest is v${ed.latestVersion || '?'}.`;
  c.innerHTML = `<div class="ash"><h2>${title}</h2><div class="edbar"><span id="edDirty" class="eddirty hid">Unsaved changes</span>
${ed.mode === 'template' ? '<input id="edNote" class="ednote" placeholder="What changed? (optional)" aria-label="Version note">' : ''}
<button class="btn btn-sm btn-s" id="edDiscard" data-action="ed-discard" disabled>Discard</button><button class="btn btn-sm btn-p" id="edSave" data-action="ed-save" disabled>Save${ed.mode === 'template' ? ' as new version' : ''}</button></div></div>
<p class="edsub">${sub}</p>
${ed.mode === 'project' ? '<div class="edtools"><button class="btn btn-sm btn-s" data-action="ed-apply">Apply latest template</button><button class="btn btn-sm btn-s" data-action="ed-archived">Archived items</button></div>' : ''}
<div class="edgrid">
<div class="edlist" id="edList">${ed.phases.map(phaseBlock).join('')}
<button class="btn btn-s btn-sm" data-action="ed-ph-add">+ Add phase</button></div>
<div class="edprev"><div class="edprev-h">Live preview: what the customer sees</div><div id="edPrev" inert>${previewHtml()}</div></div>
</div>
${versionsHtml()}`;
  refreshDirty();
}

// ---------------------------------------------------------------------------
// Open / reload
// ---------------------------------------------------------------------------

async function latestVersion() {
  try {
    const v = await listTemplateVersions();
    return { versions: v, latest: v.length ? v[0].version_number : null };
  } catch {
    return { versions: [], latest: null };
  }
}

function start(mode, container, phases, extra = {}) {
  const prev = ed && ed.mode === mode ? ed : null;
  ed = {
    mode, container, phases: normalize(phases),
    sel: prev && phases.find(p => p.id === prev.sel) ? prev.sel : (phases[0] && phases[0].id) || null,
    openPh: prev ? prev.openPh : new Set(), openSt: prev ? prev.openSt : new Set(), typeWarn: new Set(),
    versions: [], latestVersion: null, ...extra
  };
  ed.original = JSON.stringify(payload());
  renderEditor();
}

export async function openTemplateEditor(container) {
  container.innerHTML = '<div style="padding:24px;color:var(--g4);font-size:.9rem">Loading...</div>';
  const [phases, v] = await Promise.all([loadTemplate(), latestVersion()]);
  start('template', container, phases, { versions: v.versions, latestVersion: v.latest });
}

export async function openProjectEditor(container) {
  const v = await latestVersion();
  start('project', container, S.phases, { latestVersion: v.latest });
}

// Realtime/status changes: rebuild from fresh data unless the admin has unsaved edits.
export function refreshProjectEditorIfClean() {
  if (!ed || ed.mode !== 'project' || !document.body.contains(ed.container) || isDirty()) return;
  start('project', ed.container, S.phases, { latestVersion: ed.latestVersion });
}

export function closeEditor() { ed = null; }

// Ask before throwing away unsaved edits. Calls proceed() when it's OK to leave.
export function guardUnsaved(proceed) {
  if (!isDirty()) { proceed(); return; }
  pendingLeave = proceed;
  openModal(`<h2>Discard unsaved changes?</h2>
<p style="font-size:.9rem;color:var(--g6)">You have unsaved changes to the phases. Leave without saving?</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Keep editing</button><button class="btn btn-d" data-action="ed-leave">Discard changes</button></div>`);
}
let pendingLeave = null;

// ---------------------------------------------------------------------------
// Apply latest template (project mode): diff by source template ids
// ---------------------------------------------------------------------------

const PH_FIELDS = ['name', 'short', 'owner', 'duration', 'description', 'completion_message'];
const ST_FIELDS = ['text', 'owner', 'type', 'detail', 'config'];
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const pick = (o, f) => Object.fromEntries(f.map(k => [k, o[k] ?? (k === 'config' ? {} : '')]));

export function computeApply(tpl, proj, hasData) {
  const diff = { added: [], removed: [], changed: [] };
  const pByT = new Map(proj.filter(p => p.source_template_phase_id).map(p => [p.source_template_phase_id, p]));
  const projSteps = proj.flatMap(p => p.steps.map(s => ({ s, p })));
  const sByT = new Map(projSteps.filter(x => x.s.source_template_step_id).map(x => [x.s.source_template_step_id, x]));
  const tPhaseIds = new Set(tpl.map(t => t.id));
  const tStepIds = new Set(tpl.flatMap(t => t.steps.map(s => s.id)));
  const used = new Set();
  const out = [];

  for (const t of tpl) {
    const m = pByT.get(t.id);
    const ph = m ? { ...m } : { id: uuid(), status: 'pending' };
    Object.assign(ph, pick(t, PH_FIELDS), { source_template_phase_id: t.id, steps: [] });
    if (!m) diff.added.push({ kind: 'Phase', text: t.name });
    else {
      const ch = PH_FIELDS.filter(f => !same(m[f] || '', t[f] || ''));
      if (ch.length) diff.changed.push({ kind: 'Phase', text: t.name, note: ch.join(', ') });
    }
    for (const ts of t.steps) {
      const ms = sByT.get(ts.id);
      const st = ms ? { ...ms.s } : { id: uuid(), done: false };
      Object.assign(st, pick(ts, ST_FIELDS), { source_template_step_id: ts.id });
      if (!ms) diff.added.push({ kind: 'Step', text: ts.text, note: `in ${t.name}` });
      else {
        const ch = ST_FIELDS.filter(f => !same(f === 'config' ? ms.s[f] || {} : ms.s[f] || '', f === 'config' ? ts[f] || {} : ts[f] || ''));
        if (ms.p.source_template_phase_id !== t.id) ch.push('moved to ' + t.name);
        if (ch.length) diff.changed.push({ kind: 'Step', text: ts.text, note: ch.join(', ') });
        used.add(ms.s.id);
      }
      ph.steps.push(st);
    }
    out.push(ph);
  }

  // Steps the template no longer has.
  const keepInPhase = new Map(); // project phase id -> steps kept there
  for (const { s, p } of projSteps) {
    if (used.has(s.id)) continue;
    if (!s.source_template_step_id) { // project-only step: always kept where it is
      if (!keepInPhase.has(p.id)) keepInPhase.set(p.id, []);
      keepInPhase.get(p.id).push(s);
      continue;
    }
    if (tStepIds.has(s.source_template_step_id)) continue;
    if (s.done) {
      if (!keepInPhase.has(p.id)) keepInPhase.set(p.id, []);
      keepInPhase.get(p.id).push({ ...s, source_template_step_id: null });
      diff.removed.push({ kind: 'Step', text: s.text, note: 'kept because it is completed' });
    } else {
      diff.removed.push({ kind: 'Step', text: s.text, note: hasData(s.id) ? 'archived with its data' : 'deleted' });
    }
  }

  for (const ph of out) {
    const k = keepInPhase.get(ph.id);
    if (k) { ph.steps.push(...k); keepInPhase.delete(ph.id); }
  }

  // Project phases that are project-only or no longer in the template.
  proj.forEach((p, k) => {
    if (p.source_template_phase_id && tPhaseIds.has(p.source_template_phase_id)) return;
    const kept = keepInPhase.get(p.id) || [];
    if (!p.source_template_phase_id || kept.length) {
      if (p.source_template_phase_id) diff.removed.push({ kind: 'Phase', text: p.name, note: 'kept as a project-only phase because it has completed or custom steps' });
      const anchor = proj.slice(0, k).reverse().find(q => out.find(o => o.id === q.id));
      const at = anchor ? out.findIndex(o => o.id === anchor.id) + 1 : 0;
      out.splice(at, 0, { ...p, source_template_phase_id: p.source_template_phase_id && tPhaseIds.has(p.source_template_phase_id) ? p.source_template_phase_id : null, steps: kept });
    } else {
      const any = p.steps.some(s => hasData(s.id));
      diff.removed.push({ kind: 'Phase', text: p.name, note: any ? 'archived with its data' : 'deleted' });
    }
  });

  // Order changes: report them, since applying resets template phases/steps to template order.
  const both = new Set(proj.map(p => p.source_template_phase_id).filter(id => id && tPhaseIds.has(id)));
  const order = a => a.map(p => p.source_template_phase_id).filter(id => both.has(id)).join();
  if (order(proj) !== order(out)) diff.changed.push({ kind: 'Order', text: 'Phases go back to the template order', note: '' });
  for (const t of tpl) {
    const m = pByT.get(t.id);
    if (!m) continue;
    const seq = m.steps.map(s => s.source_template_step_id).filter(id => id && tStepIds.has(id) && t.steps.some(x => x.id === id)).join();
    const want = t.steps.map(s => s.id).filter(id => m.steps.some(x => x.source_template_step_id === id)).join();
    if (seq !== want) diff.changed.push({ kind: 'Order', text: `Steps in ${t.name} go back to the template order`, note: '' });
  }

  return { diff, phases: out };
}

async function applyTemplate() {
  if (isDirty()) { toast('Save or discard your changes first', 'err'); return; }
  let tpl, v;
  try { [tpl, v] = await Promise.all([loadTemplate(), latestVersion()]); } catch (e) { toast('Could not load the template: ' + esc(e.message), 'err'); return; }
  const { diff, phases } = computeApply(tpl, ed.phases, id => !!stepData(id));
  ed.pendingApply = { phases, version: v.latest };
  const list = (title, rows, cls) => rows.length ? `<h3 class="edsec">${title} (${rows.length})</h3><ul class="eddiff ${cls}">${rows.map(r => `<li><strong>${esc(r.kind)}:</strong> ${esc(r.text)}${r.note ? ` <span>(${esc(r.note)})</span>` : ''}</li>`).join('')}</ul>` : '';
  const none = !diff.added.length && !diff.removed.length && !diff.changed.length;
  openModal(`<h2>Apply latest template${v.latest ? ` (v${v.latest})` : ''}</h2>
${none ? '<p style="font-size:.9rem;color:var(--g6)">This project already matches the latest template.</p>'
    : `<p style="font-size:.86rem;color:var(--g6);line-height:1.5">Completed steps are always kept. Steps with customer data are archived, not deleted. Project-only phases and steps stay.</p>
${list('Added', diff.added, 'add')}${list('Removed', diff.removed, 'rem')}${list('Changed', diff.changed, 'chg')}`}
<div class="ma"><button class="btn btn-s" data-action="close-modal">${none ? 'Close' : 'Cancel'}</button>${none ? '' : '<button class="btn btn-p" data-action="ed-apply-go">Apply to this project</button>'}</div>`);
}

async function showArchived() {
  let a;
  try { a = await loadArchived(S.project.id); } catch (e) { toast('Could not load archived items: ' + esc(e.message), 'err'); return; }
  ed.archived = a;
  const byStep = id => ({ form: a.forms.find(f => f.project_step_id === id), ups: a.uploads.filter(u => u.project_step_id === id) });
  const orphanUps = a.uploads.filter(u => !a.steps.find(s => s.id === u.project_step_id));
  const upRow = u => `<div class="uf"><span>${u.kind === 'link' ? '🔗' : '📄'}</span><div class="ufn">${esc(u.file_name || u.link_url)}<div class="ufm">${esc([u.kind === 'file' ? fmtSize(u.size_bytes) : 'Shared link', 'archived ' + fmtDate(u.archived_at)].join(' · '))}</div></div>${u.kind === 'file' ? `<button class="btn btn-g btn-sm" data-action="ed-arch-dl" data-id="${u.id}">Download</button>` : ''}</div>`;
  const formRows = f => f ? `<table class="edkv">${Object.entries(f.data || {}).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}</table>` : '';
  openModal(`<h2>Archived items</h2>
<p style="font-size:.84rem;color:var(--g6)">Steps removed in the phase editor while they held customer data. Customers no longer see these.</p>
${a.steps.length || orphanUps.length ? a.steps.map(s => { const d = byStep(s.id); return `<div class="edarch"><div class="edarch-h">${esc(s.text)} ${s.done ? '<span class="ptag td">Was done</span>' : ''}<span class="ufm">Archived ${esc(fmtDate(s.archived_at))}</span></div>${formRows(d.form)}${d.ups.map(upRow).join('')}</div>`; }).join('') + orphanUps.map(upRow).join('')
    : '<p style="font-size:.86rem;color:var(--g4);padding:10px 0">Nothing archived for this project.</p>'}
<div class="ma"><button class="btn btn-s" data-action="close-modal">Close</button></div>`);
}

// ---------------------------------------------------------------------------
// Editing actions
// ---------------------------------------------------------------------------

function move(arr, from, to) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

function removeStep(id) {
  const f = findStep(id);
  if (!f) return;
  f.p.steps.splice(f.i, 1);
  ed.openSt.delete(id);
  renderEditor();
}

function removePhase(id) {
  const i = ed.phases.findIndex(p => p.id === id);
  if (i < 0) return;
  ed.phases.splice(i, 1);
  if (ed.sel === id) ed.sel = ed.phases[Math.max(0, i - 1)] ? ed.phases[Math.max(0, i - 1)].id : null;
  renderEditor();
}

function typedConfirm(title, body, action, id) {
  openModal(`<h2>${title}</h2>
<p style="font-size:.9rem;color:var(--g6);line-height:1.6">${body}</p>
<div class="fg" style="margin-top:14px"><label>Type <strong>ARCHIVE</strong> to confirm</label><input id="edConf" autocomplete="off"></div>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-d" id="edConfGo" data-action="${action}" data-id="${id}" disabled>Remove and archive</button></div>`);
  $('edConf').addEventListener('input', e => { $('edConfGo').disabled = e.target.value.trim().toUpperCase() !== 'ARCHIVE'; });
  $('edConf').focus();
}

function validate() {
  for (const [i, p] of ed.phases.entries()) {
    if (!p.name.trim()) return `Phase ${i + 1} needs a name.`;
    for (const [j, s] of p.steps.entries()) if (!s.text.trim()) return `Step ${stepLabel(i + 1, j)} needs text.`;
    for (const s of p.steps) {
      if (s.type === 'form_frequency') {
        const o = s.config.options || [];
        if (!o.length) return `"${s.text}" needs at least one frequency option.`;
        if (o.some(x => !String(x.label || '').trim() || !String(x.value || '').trim())) return `Every frequency option in "${s.text}" needs a label and a value.`;
        if (new Set(o.map(x => x.value)).size !== o.length) return `Frequency option values in "${s.text}" must be unique.`;
      }
    }
  }
  return null;
}

async function save(btn) {
  const err = validate();
  if (err) { toast(esc(err), 'err'); return; }
  btn.classList.add('busy');
  try {
    if (ed.mode === 'template') {
      const note = ($('edNote') && $('edNote').value) || '';
      const v = await saveTemplate(payload(), note);
      toast(`Template saved as version ${v}`, 'ok');
      await openTemplateEditor(ed.container);
    } else {
      const r = await saveProjectPhases(S.project.id, payload(), { note: 'Phases edited' });
      toast(r.steps_archived ? `Phases saved. ${r.steps_archived} step${r.steps_archived > 1 ? 's' : ''} archived with their data.` : 'Phases saved', 'ok');
      ed.original = JSON.stringify(payload());
      await hooks.reload(true);
      start('project', ed.container, S.phases, { latestVersion: ed.latestVersion });
    }
  } catch (e) {
    toast('Could not save: ' + esc(e.message), 'err');
  } finally {
    btn.classList.remove('busy');
  }
}

registerActions({
  'ed-select': (el, e) => {
    if (e.target.closest('input,select,button,textarea,.edh')) return;
    ed.sel = el.dataset.id;
    document.querySelectorAll('.edph').forEach(x => x.classList.toggle('sel', x.dataset.phRow === ed.sel));
    refreshPreview();
  },
  'ed-ph-add': () => {
    const p = { id: uuid(), name: 'New phase', short: '', owner: 'both', duration: '', description: '', completion_message: '', status: 'pending', source_template_phase_id: null, steps: [] };
    ed.phases.push(p); ed.sel = p.id; ed.openPh.add(p.id);
    renderEditor();
    const inp = document.querySelector(`[data-ph-f="name"][data-ph="${p.id}"]`);
    if (inp) { inp.focus(); inp.select(); }
  },
  'ed-ph-up': el => { const i = ed.phases.findIndex(p => p.id === el.dataset.id); move(ed.phases, i, i - 1); renderEditor(); },
  'ed-ph-down': el => { const i = ed.phases.findIndex(p => p.id === el.dataset.id); move(ed.phases, i, i + 1); renderEditor(); },
  'ed-ph-toggle': el => { const id = el.dataset.id; if (ed.openPh.has(id)) ed.openPh.delete(id); else ed.openPh.add(id); ed.sel = id; renderEditor(); },
  'ed-ph-del': el => {
    const i = ed.phases.findIndex(p => p.id === el.dataset.id), p = ed.phases[i];
    const withData = p.steps.filter(s => stepData(s.id));
    if (withData.length) {
      typedConfirm(`Delete Phase ${i + 1}?`, `<strong>${esc(p.name)}</strong> has ${withData.length} step${withData.length > 1 ? 's' : ''} with customer progress or data. Those steps and their answers and files are archived, not deleted: customers won't see them, and admins can still open them under "Archived items".`, 'ed-ph-del-go', p.id);
    } else {
      openModal(`<h2>Delete Phase ${i + 1}?</h2><p style="font-size:.9rem;color:var(--g6)"><strong>${esc(p.name)}</strong> and its ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} will be removed when you save.</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-d" data-action="ed-ph-del-go" data-id="${p.id}">Delete phase</button></div>`);
    }
  },
  'ed-ph-del-go': el => { closeModal(); removePhase(el.dataset.id); },
  'ed-st-add': el => {
    const p = findPhase(el.dataset.ph);
    const s = { id: uuid(), text: 'New step', owner: 'client', type: 'none', detail: '', config: {}, done: false, source_template_step_id: null };
    p.steps.push(s); ed.openSt.add(s.id); ed.sel = p.id;
    renderEditor();
    const inp = document.querySelector(`[data-st-f="text"][data-st="${s.id}"]`);
    if (inp) { inp.focus(); inp.select(); }
  },
  'ed-st-up': el => { const f = findStep(el.dataset.id); move(f.p.steps, f.i, f.i - 1); ed.sel = f.p.id; renderEditor(); },
  'ed-st-down': el => { const f = findStep(el.dataset.id); move(f.p.steps, f.i, f.i + 1); ed.sel = f.p.id; renderEditor(); },
  'ed-st-toggle': el => { const id = el.dataset.id; if (ed.openSt.has(id)) ed.openSt.delete(id); else ed.openSt.add(id); ed.sel = findStep(id).p.id; renderEditor(); },
  'ed-st-del': el => {
    const f = findStep(el.dataset.id);
    const data = stepData(f.s.id);
    if (data) {
      typedConfirm('Remove this step?', `<strong>${esc(f.s.text)}</strong>: ${esc(data.join(', '))}. Removing it archives the step with its answers and files. Customers won't see it; admins can still open it under "Archived items".`, 'ed-st-del-go', f.s.id);
    } else removeStep(f.s.id);
  },
  'ed-st-del-go': el => { closeModal(); removeStep(el.dataset.id); },
  'ed-opt-add': el => { const f = findStep(el.dataset.st); f.s.config = { ...f.s.config, options: [...(f.s.config.options || []), { value: '', label: '', help: '' }] }; renderEditor(); },
  'ed-opt-del': el => { const f = findStep(el.dataset.st); const o = [...(f.s.config.options || [])]; o.splice(+el.dataset.i, 1); f.s.config = { ...f.s.config, options: o }; renderEditor(); },
  'ed-discard': () => {
    if (ed.mode === 'template') openTemplateEditor(ed.container);
    else start('project', ed.container, S.phases, { latestVersion: ed.latestVersion });
  },
  'ed-save': el => save(el),
  'ed-leave': () => { closeModal(); const go = pendingLeave; pendingLeave = null; ed = null; if (go) go(); },
  'ed-restore': el => {
    if (isDirty()) { toast('Save or discard your changes first', 'err'); return; }
    const v = el.dataset.v;
    openModal(`<h2>Restore version ${esc(v)}?</h2><p style="font-size:.9rem;color:var(--g6);line-height:1.6">The template goes back to how it was in version ${esc(v)}. This is saved as a new version, so nothing in the history is lost. Existing projects are not changed.</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-p" data-action="ed-restore-go" data-v="${esc(v)}">Restore</button></div>`);
  },
  'ed-restore-go': async el => {
    closeModal();
    try {
      const nv = await restoreTemplateVersion(+el.dataset.v);
      toast(`Restored. Saved as version ${nv}.`, 'ok');
      await openTemplateEditor(ed.container);
    } catch (e) { toast('Could not restore: ' + esc(e.message), 'err'); }
  },
  'ed-apply': () => applyTemplate(),
  'ed-apply-go': async el => {
    const pa = ed.pendingApply;
    if (!pa) return;
    el.classList.add('busy');
    try {
      const r = await saveProjectPhases(S.project.id, payload(normalize(pa.phases)), {
        note: `Applied template${pa.version ? ' v' + pa.version : ''}`, action: 'template_applied', templateVersion: pa.version
      });
      closeModal();
      toast(`Template applied${r.steps_archived ? `. ${r.steps_archived} step${r.steps_archived > 1 ? 's' : ''} archived with their data` : ''}.`, 'ok');
      if (pa.version) S.project = { ...S.project, template_version: pa.version };
      await hooks.reload(true);
      start('project', ed.container, S.phases, { latestVersion: ed.latestVersion });
    } catch (e) {
      toast('Could not apply the template: ' + esc(e.message), 'err');
    } finally {
      el.classList.remove('busy');
    }
  },
  'ed-archived': () => showArchived(),
  'ed-arch-dl': async el => {
    const u = ed.archived && ed.archived.uploads.find(x => x.id === el.dataset.id);
    if (!u) return;
    try { location.href = await signedUrl(u.storage_path, u.file_name || true); } catch (e) { toast('Could not create a download link: ' + esc(e.message), 'err'); }
  }
});

// ---------------------------------------------------------------------------
// Field edits and drag-and-drop (delegated on the admin panel)
// ---------------------------------------------------------------------------

function onField(e) {
  if (!ed) return;
  const t = e.target;
  if (t.dataset.phF) {
    const p = findPhase(t.dataset.ph);
    p[t.dataset.phF] = t.value;
    ed.sel = p.id;
  } else if (t.dataset.stF) {
    const f = findStep(t.dataset.st);
    if (t.dataset.stF === 'type') {
      if (e.type !== 'change') return;
      const prevType = f.s.type;
      f.s.type = t.value;
      f.s.config = { ...(DEFAULT_CONFIG[t.value] || {}), ...(prevType === t.value ? f.s.config : {}) };
      if (stepData(f.s.id)) { ed.typeWarn.add(f.s.id); toast('This step already has customer data. It is kept, but may not show under the new type.', 'info'); }
      renderEditor();
      refreshDirty();
      return;
    }
    f.s[t.dataset.stF] = t.value;
    ed.sel = f.p.id;
  } else if (t.dataset.optF) {
    const f = findStep(t.dataset.st);
    const o = [...(f.s.config.options || [])];
    o[+t.dataset.optI] = { ...o[+t.dataset.optI], [t.dataset.optF]: t.value };
    f.s.config = { ...f.s.config, options: o };
  } else if (t.dataset.cfg) {
    const f = findStep(t.dataset.st);
    f.s.config = { ...f.s.config, [t.dataset.cfg]: t.checked };
  } else if (t.dataset.stMove && e.type === 'change') {
    const f = findStep(t.dataset.stMove);
    const to = findPhase(t.value);
    if (to && to !== f.p) {
      f.p.steps.splice(f.i, 1);
      to.steps.push(f.s);
      ed.sel = to.id;
      renderEditor();
    }
    return;
  } else if (t.dataset.phStatus && e.type === 'change') {
    const id = t.dataset.phStatus, p = findPhase(id);
    setPhaseStatus(id, t.value)
      .then(() => { p.status = t.value; toast('Phase status updated', 'ok'); refreshPreview(); return hooks.reload(true); })
      .catch(err => toast('Could not update the phase: ' + esc(err.message), 'err'));
    return;
  } else return;
  refreshDirty();
  schedulePreview();
}

let dragging = null;

function dropTarget(e) {
  if (!dragging) return null;
  if (dragging.kind === 'phase') return e.target.closest('[data-drop="phase"]');
  return e.target.closest('[data-drop="step"],[data-drop="end"]');
}

export function wireEditor(container) {
  container.addEventListener('input', onField);
  container.addEventListener('change', onField);
  container.addEventListener('dragstart', e => {
    const h = e.target.closest && e.target.closest('[data-drag]');
    if (!h || !ed) return;
    dragging = { kind: h.dataset.drag, id: h.dataset.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', h.dataset.id);
  });
  container.addEventListener('dragover', e => {
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    container.querySelectorAll('.dragover').forEach(x => x !== t && x.classList.remove('dragover'));
    t.classList.add('dragover');
  });
  container.addEventListener('dragleave', e => { const t = dropTarget(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('dragover'); });
  container.addEventListener('dragend', () => { dragging = null; container.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover')); });
  container.addEventListener('drop', e => {
    const t = dropTarget(e);
    if (!t || !ed) return;
    e.preventDefault();
    const d = dragging;
    dragging = null;
    if (d.kind === 'phase') {
      const from = ed.phases.findIndex(p => p.id === d.id);
      let to = ed.phases.findIndex(p => p.id === t.dataset.phRow);
      if (from < 0 || to < 0 || from === to) { renderEditor(); return; }
      const r = t.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2 && to < from) to += 1;
      if (e.clientY < r.top + r.height / 2 && to > from) to -= 1;
      move(ed.phases, from, to);
    } else {
      const f = findStep(d.id);
      if (!f) return;
      f.p.steps.splice(f.i, 1);
      if (t.dataset.drop === 'end') {
        const to = findPhase(t.dataset.ph);
        to.steps.push(f.s);
        ed.sel = to.id;
      } else {
        const g = findStep(t.dataset.stRow);
        if (!g) { f.p.steps.splice(f.i, 0, f.s); renderEditor(); return; }
        const r = t.getBoundingClientRect();
        g.p.steps.splice(e.clientY > r.top + r.height / 2 ? g.i + 1 : g.i, 0, f.s);
        ed.sel = g.p.id;
      }
    }
    renderEditor();
  });
}
