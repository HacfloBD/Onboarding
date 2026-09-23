// Step widgets rendered by project_steps.type. Every form auto-saves to
// form_responses (debounced), uploads go to Storage + the uploads table.
import { S, isAdmin, hooks } from './state.js';
import { saveForm, uploadFile, addLink, deleteUpload, signedUrl, signedUrls, resourceUrl, callFunction } from './data.js';
import { toast, openModal, closeModal, registerActions, escapeHtml, fmtSize, fmtDate, safeUrl } from './ui.js';

const esc = escapeHtml;
const MB = 1048576;
const FALLBACK_TEMPLATE = '/assets/files/FLO_Onboarding_Forms.xlsx';
const SAVE_DELAY = 800;

// ---------------------------------------------------------------------------
// Field definitions per form type
// ---------------------------------------------------------------------------

const ORG_GRID = [
  { f: 'orgName', label: 'Organization / Utility Name *', ph: 'City of Springfield Water Dept' },
  { f: 'serviceArea', label: 'Primary Service Area *', ph: 'City / County / District' },
  { f: 'state', label: 'State *', ph: '2-letter code', attrs: 'maxlength="2"' },
  { f: 'projectLead', label: 'Your Name (Project Lead) *', ph: 'Full name' },
  { f: 'projectLeadTitle', label: 'Your Title *' },
  { f: 'projectLeadEmail', label: 'Your Email *', type: 'email' },
  { f: 'projectLeadPhone', label: 'Your Phone *', type: 'tel', ph: '10-digit' },
  { f: 'itContact', label: 'IT Contact Name *', ph: 'For technical setup' },
  { f: 'itContactEmail', label: 'IT Contact Email *', type: 'email' },
  { f: 'numTesters', label: 'Approx. Tester Companies', type: 'number' },
  { f: 'numFacilities', label: 'Approx. Facilities / Locations', type: 'number' },
  { f: 'legacySystem', label: 'Current System *', ph: 'Excel, Google Sheets, paper, other software' }
];

const SESSION_MODES = [
  { value: 'in_person', label: 'In-person: HAC Texas comes to you' },
  { value: 'virtual', label: 'Virtual: Teams or Zoom' }
];

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function input(d, { f, label, type = 'text', ph = '', attrs = '', hint = '' }, ro) {
  return `<div class="fg"><label>${label}</label><input data-f="${f}" type="${type}" value="${esc(d[f])}" placeholder="${esc(ph)}" ${attrs} ${ro ? 'disabled' : ''}>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function textarea(d, { f, label, ph = '', hint = '', style = '' }, ro) {
  return `<div class="fg"${style ? ` style="${style}"` : ''}><label>${label}</label><textarea data-f="${f}" placeholder="${esc(ph)}" ${ro ? 'disabled' : ''}>${esc(d[f])}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

let radioGroup = 0;
function radios(d, f, label, options, ro) {
  const name = `${f}-${++radioGroup}`;
  return `<div class="fg"><label>${label}</label><div class="rg">${options.map(o =>
    `<label><input type="radio" name="${name}" data-f="${f}" value="${esc(o.value)}" ${d[f] === o.value ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${esc(o.label)}</label>`).join('')}</div></div>`;
}

const grid2 = inner => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${inner}</div>`;

function frm(step, inner, ro) {
  return `<div class="ifrm" data-step="${step.id}" data-type="${step.type}"${ro ? ' data-ro="1"' : ''}>${ro ? '' : `<div class="svd" data-svd="${step.id}"></div>`}${inner}</div>`;
}

const formData = step => (S.forms[step.id] && S.forms[step.id].data) || {};

function settingValue(key) {
  const v = S.settings[key];
  return typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.url === 'string' ? v.url : '';
}

function masterTemplateUrl() {
  const p = settingValue('master_template_path');
  return p ? resourceUrl(p) : FALLBACK_TEMPLATE;
}

function whoName(u) {
  const p = S.people[u.uploaded_by];
  if (p && p.role !== 'admin') return p.full_name || p.email;
  return 'FLO team';
}

function canDelete(u, step) {
  if (isAdmin()) return true;
  return u.uploaded_by === S.user.id && !step.done;
}

function uploadList(step, { thumbs = false } = {}) {
  const ups = S.uploads.filter(u => u.project_step_id === step.id);
  if (!ups.length) return '';
  return `<div class="upl">${ups.map(u => {
    const link = u.kind === 'link' ? safeUrl(u.link_url) : '';
    const name = u.kind === 'link' ? (u.link_url || 'Link') : (u.file_name || 'File');
    const meta = [u.kind === 'file' ? fmtSize(u.size_bytes) : 'Shared link', whoName(u), fmtDate(u.created_at)].filter(Boolean).join(' · ');
    const open = u.kind === 'link'
      ? (link ? `<a class="btn btn-g btn-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open</a>` : '')
      : `<button class="btn btn-g btn-sm" data-action="download" data-upload="${u.id}">Download</button>`;
    const del = canDelete(u, step) ? `<button class="btn btn-g btn-sm" style="color:var(--e5)" data-action="delete-upload" data-upload="${u.id}">Delete</button>` : '';
    const thumb = thumbs && u.kind === 'file' ? `<img class="uthumb" data-thumb="${esc(u.storage_path)}" alt="">` : `<span>${u.kind === 'link' ? '🔗' : '📄'}</span>`;
    return `<div class="uf">${thumb}<div class="ufn">${esc(name)}<div class="ufm">${esc(meta)}</div></div>${open}${del}</div>`;
  }).join('')}</div>`;
}

function dropZone(step, { accept = '', multiple = true, kind = 'files', note = 'Any file type' } = {}) {
  return `<div class="uz"><input type="file" ${multiple ? 'multiple' : ''} ${accept ? `accept="${esc(accept)}"` : ''} data-change="upload" data-upload="${step.id}" data-kind="${kind}"><div class="uzt">📎 <strong>Click to upload</strong> or drop files here<br><span style="font-size:.76rem;color:var(--g4)">${note}</span></div></div>`;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

const W = {
  form_org_details(step, ro) {
    const d = formData(step);
    return frm(step, grid2(ORG_GRID.map(x => input(d, x, ro)).join('')) +
      textarea(d, { f: 'roles', label: 'Team roles and responsibilities', style: 'margin-top:12px',
        ph: "List who on your team will be involved and their role (e.g. 'Jane Smith - will manage tester company approvals, Tom Chen - IT admin for email setup')",
        hint: 'This helps us know who to loop in at each phase.' }, ro) +
      textarea(d, { f: 'jurisdictionalNotes', label: 'Jurisdictional compliance notes',
        ph: 'Any state or local rules we should know about? Special requirements, exemptions, or regulatory references.' }, ro), ro);
  },

  form_schedule_session(step, ro) {
    const d = formData(step);
    const cfg = step.config || {};
    const url = safeUrl(settingValue(cfg.self_service_link_setting || 'ccc_assessment_url'));
    const link = url && !ro
      ? `<div class="sact"><a class="btn btn-s btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(cfg.self_service_link_label || 'Open the CCC Compliance Assessment tool')} ↗</a></div>`
      : '';
    return link + frm(step, grid2(
      input(d, { f: 'preferredDate', label: 'Preferred date *', type: 'date' }, ro) +
      input(d, { f: 'preferredTime', label: 'Preferred time *', type: 'time' }, ro) +
      input(d, { f: 'alternateDate', label: 'Alternate date', type: 'date' }, ro) +
      input(d, { f: 'alternateTime', label: 'Alternate time', type: 'time' }, ro)) +
      `<div style="margin-top:12px">${radios(d, 'mode', 'Session format *', SESSION_MODES, ro)}</div>` +
      textarea(d, { f: 'attendees', label: 'Who will attend?', ph: 'Names and roles of the people joining' }, ro) +
      textarea(d, { f: 'notes', label: 'Notes', ph: 'Anything we should know before the session' }, ro), ro);
  },

  form_frequency(step, ro) {
    const d = formData(step);
    const opts = (step.config && step.config.options) || [];
    return frm(step,
      `<div class="fg"><label>Testing Frequency Model *</label><select data-f="model" style="padding:10px 14px" ${ro ? 'disabled' : ''}>
<option value="" ${!d.model ? 'selected' : ''}>-- Select a model --</option>
${opts.map(o => `<option value="${esc(o.value)}" ${d.model === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
</select></div>` +
      (opts.length ? `<div style="background:var(--cy0);border:1px solid rgba(45,212,191,.2);border-radius:var(--r);padding:14px;margin-bottom:12px;font-size:.82rem;color:var(--g7);line-height:1.6">
<strong style="color:var(--tl)">What do these mean?</strong><br>
${opts.map(o => `<strong>${esc(o.label)}:</strong> ${esc(o.help)}`).join('<br>')}
</div>` : '') +
      textarea(d, { f: 'notes', label: 'Notes or regulatory references',
        ph: "e.g. 'State code section 64.xxx mandates calendar year' or 'We chose rolling 12 months because it distributes workload better for our tester companies'" }, ro), ro);
  },

  upload_files(step, ro) {
    const cfg = step.config || {};
    const max = cfg.max_files || 10;
    const accept = cfg.accept && cfg.accept !== '*' ? cfg.accept : '';
    if (ro) return uploadList(step);
    const optB = cfg.show_master_template_download === false ? '' : `
<div class="upc"><div class="upt">Option B: Use our master template</div>
<p>Fill in the 8-tab master spreadsheet (Facilities, Contacts, Assemblies, Tester Companies, Tester Users, Test Kits, Test History, Survey History), then upload it.</p>
<div class="sact"><a href="${esc(masterTemplateUrl())}" download class="btn btn-p btn-sm">⬇ Download Master Spreadsheet</a></div>
${dropZone(step, { accept, note: 'Upload the completed spreadsheet' })}</div>`;
    const link = cfg.allow_share_link === false ? '' : `
<div style="margin-top:12px"><div class="fg" style="margin-bottom:0"><label>Or share a link (Google Drive, SharePoint, etc.)</label><input data-link="${step.id}" placeholder="https://drive.google.com/..."><div class="hint">Make sure the link has view access for your FLO CSM</div></div>
<button class="btn btn-p btn-sm" style="margin-top:8px" data-action="save-link" data-step="${step.id}">Save Link</button></div>`;
    return `<div class="upg${optB ? '' : ' one'}">
<div class="upc"><div class="upt">Option A: Send what you have</div>
<p>Upload exports, spreadsheets, PDFs or anything else you already have. Up to ${max} files, 50 MB each.</p>
${dropZone(step, { accept })}</div>${optB}</div>
<div class="uprog" data-prog="${step.id}"></div>${link}${uploadList(step)}`;
  },

  form_api_integration(step, ro) {
    const d = formData(step);
    return frm(step,
      radios(d, 'wantsApi', 'Do you want FLO to connect to your billing system?', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], ro) +
      `<div data-show-if="wantsApi=yes" class="${d.wantsApi === 'yes' ? '' : 'hid'}">` +
      input(d, { f: 'billingSystem', label: 'Billing system name', ph: 'e.g. Tyler Incode, Springbrook, Caselle' }, ro) +
      grid2(input(d, { f: 'techContactName', label: 'Technical contact name' }, ro) +
        input(d, { f: 'techContactEmail', label: 'Technical contact email', type: 'email' }, ro)) +
      '</div>', ro);
  },

  form_branding(step, ro) {
    const d = formData(step);
    return frm(step,
      input(d, { f: 'senderName', label: 'Sender Display Name *', ph: 'e.g. Springfield Water - Backflow Compliance' }, ro) +
      input(d, { f: 'replyTo', label: 'Reply-to Email Address *', type: 'email', ph: 'e.g. backflow@springfieldwater.gov', hint: 'Where replies from property owners and testers will go' }, ro) +
      `<div class="fg"><label>Logo</label>${ro ? '' : dropZone(step, { accept: '.png,.jpg,.jpeg,image/png,image/jpeg', multiple: false, kind: 'logo', note: 'PNG or JPG, up to 5 MB' })}${uploadList(step, { thumbs: true })}</div>`, ro);
  }
};

// Extra HTML under a step's title and detail.
// opts.asClient renders what a customer would see (used by the admin preview).
export function renderStepExtra(step, { asClient = false } = {}) {
  const w = W[step.type];
  if (!w) return '';
  const admin = isAdmin() && !asClient;
  const editable = admin || (step.owner !== 'flo' && !step.done);
  if (!step.done) return w(step, !editable);
  // Completed: hide the form, keep the data one click away.
  const open = S.viewOpen.has(step.id);
  return `<div class="sact"><button class="btn btn-g btn-sm" data-action="view-submitted" data-step="${step.id}">${open ? 'Hide submitted info ▴' : 'View submitted info ▾'}</button></div>${open ? `<div class="subv">${w(step, !admin)}</div>` : ''}`;
}

// Loads signed thumbnail URLs for logo previews after a render.
export async function fillThumbs(root) {
  const imgs = [...root.querySelectorAll('img[data-thumb]')];
  if (!imgs.length) return;
  try {
    const urls = await signedUrls([...new Set(imgs.map(i => i.dataset.thumb))]);
    imgs.forEach(i => { if (urls[i.dataset.thumb]) i.src = urls[i.dataset.thumb]; });
  } catch (e) {
    console.warn('thumbnails', e.message);
  }
}

// ---------------------------------------------------------------------------
// Auto-save
// ---------------------------------------------------------------------------

const drafts = {};    // step id -> latest unsaved data
const timers = {};
const lastSlot = {};  // step id -> last session slot we notified admins about

export const hasPendingEdits = () => Object.keys(timers).length > 0;

// Keep unsaved typing when fresh data arrives from the server.
export function applyDrafts(forms) {
  for (const [id, data] of Object.entries(drafts)) {
    forms[id] = { ...(forms[id] || { project_step_id: id }), data };
  }
  return forms;
}

function findStep(id) {
  for (const p of S.phases) {
    const s = p.steps.find(x => x.id === id);
    if (s) return s;
  }
  return null;
}

function collect(frmEl) {
  const id = frmEl.dataset.step;
  const d = { ...formData({ id }) };
  frmEl.querySelectorAll('[data-f]').forEach(el => {
    if (el.type === 'radio') { if (el.checked) d[el.dataset.f] = el.value; } else d[el.dataset.f] = el.value;
  });
  return d;
}

function setSaved(id, text) {
  document.querySelectorAll(`[data-svd="${id}"]`).forEach(e => { e.textContent = text; });
}

// Admins are emailed once the request is complete (date, time and format) and again only if it changes.
const slotOf = d => d.preferredDate && d.preferredTime && d.mode
  ? [d.preferredDate, d.preferredTime, d.alternateDate || '', d.alternateTime || '', d.mode].join('|')
  : '';

function onFieldEdit(frmEl) {
  if (frmEl.dataset.ro) return;
  const id = frmEl.dataset.step, type = frmEl.dataset.type;
  if (type === 'form_schedule_session' && !(id in lastSlot)) lastSlot[id] = slotOf(formData({ id }));
  const data = collect(frmEl);
  drafts[id] = data;
  S.forms[id] = { ...(S.forms[id] || { project_step_id: id }), data };
  frmEl.querySelectorAll('[data-show-if]').forEach(el => {
    const [k, v] = el.dataset.showIf.split('=');
    el.classList.toggle('hid', data[k] !== v);
  });
  setSaved(id, 'Saving...');
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => flush(id, type), SAVE_DELAY);
}

async function flush(id, type) {
  clearTimeout(timers[id]);
  delete timers[id];
  const payload = drafts[id];
  if (!payload || !S.project) return;
  try {
    const row = await saveForm(S.project.id, id, type, payload);
    if (drafts[id] === payload) delete drafts[id];
    S.forms[id] = { ...row, data: drafts[id] || row.data };
    setSaved(id, 'Saved ✓');
    if (type === 'form_schedule_session' && !isAdmin()) {
      const slot = slotOf(payload);
      if (slot && slot !== lastSlot[id]) {
        lastSlot[id] = slot;
        callFunction('notify-admins', { kind: 'session_request', step_id: id }).catch(e => console.warn('notify-admins', e.message));
      }
    }
  } catch (e) {
    setSaved(id, 'Not saved');
    toast('Could not save: ' + esc(e.message), 'err');
  }
}

export async function flushAll() {
  await Promise.all(Object.keys(timers).map(id => {
    const el = document.querySelector(`.ifrm[data-step="${id}"]`);
    return flush(id, el ? el.dataset.type : (findStep(id) || {}).type);
  }));
}

// ---------------------------------------------------------------------------
// Uploads and links
// ---------------------------------------------------------------------------

async function handleUpload(inp) {
  const id = inp.dataset.upload, kind = inp.dataset.kind;
  const step = findStep(id);
  const files = [...inp.files];
  inp.value = '';
  if (!step || !files.length || !S.project) return;

  const logo = kind === 'logo';
  const max = logo ? 1 : ((step.config && step.config.max_files) || 10);
  const limit = logo ? 5 * MB : 50 * MB;
  const existing = S.uploads.filter(u => u.project_step_id === id && u.kind === 'file').length;

  if (!logo && existing + files.length > max) {
    toast(`Up to ${max} files for this step. Remove one or upload fewer.`, 'err');
    return;
  }
  if (logo && files.some(f => !/^image\/(png|jpeg)$/.test(f.type) && !/\.(png|jpe?g)$/i.test(f.name))) {
    toast('The logo must be a PNG or JPG file.', 'err');
    return;
  }
  const big = files.find(f => f.size > limit);
  if (big) {
    toast(`${esc(big.name)} is larger than ${limit / MB} MB.`, 'err');
    return;
  }

  const prog = document.querySelector(`[data-prog="${id}"]`);
  const added = [];
  for (let i = 0; i < files.length; i++) {
    if (prog) prog.textContent = files.length > 1 ? `Uploading ${i + 1} of ${files.length}...` : `Uploading ${files[i].name}...`;
    try {
      const row = await uploadFile(S.project.id, id, files[i]);
      S.uploads.push(row);
      added.push(row);
    } catch (e) {
      toast(`Could not upload ${esc(files[i].name)}: ${esc(e.message)}`, 'err');
    }
  }
  if (prog) prog.textContent = '';
  if (added.length) {
    toast(added.length === 1 ? `File uploaded: ${esc(added[0].file_name)}` : `${added.length} files uploaded`, 'ok');
    notifyUpload(added);
  }
  hooks.render();
}

function notifyUpload(rows) {
  if (isAdmin()) return;
  callFunction('notify-admins', { kind: 'upload', upload_ids: rows.map(r => r.id) })
    .catch(e => console.warn('notify-admins', e.message));
}

registerActions({
  upload: el => handleUpload(el),

  'save-link': async el => {
    const id = el.dataset.step;
    const inp = document.querySelector(`[data-link="${id}"]`);
    const url = safeUrl(inp && inp.value);
    if (!url) { toast('Enter a full link starting with https://', 'err'); return; }
    el.classList.add('busy');
    try {
      const row = await addLink(S.project.id, id, url);
      S.uploads.push(row);
      toast('Link saved', 'ok');
      notifyUpload([row]);
      hooks.render();
    } catch (e) {
      toast('Could not save the link: ' + esc(e.message), 'err');
    } finally {
      el.classList.remove('busy');
    }
  },

  download: async el => {
    const u = S.uploads.find(x => x.id === el.dataset.upload);
    if (!u) return;
    try {
      location.href = await signedUrl(u.storage_path, u.file_name || true);
    } catch (e) {
      toast('Could not create a download link: ' + esc(e.message), 'err');
    }
  },

  'delete-upload': el => {
    const u = S.uploads.find(x => x.id === el.dataset.upload);
    if (!u) return;
    openModal(`<h2>Delete ${u.kind === 'link' ? 'link' : 'file'}?</h2>
<p style="font-size:.9rem;color:var(--g6)"><strong>${esc(u.file_name || u.link_url)}</strong> will be removed for everyone on this project.</p>
<div class="ma"><button class="btn btn-s" data-action="close-modal">Cancel</button><button class="btn btn-d" data-action="confirm-delete-upload" data-upload="${u.id}">Delete</button></div>`);
  },

  'confirm-delete-upload': async el => {
    const u = S.uploads.find(x => x.id === el.dataset.upload);
    closeModal();
    if (!u) return;
    try {
      await deleteUpload(u);
      S.uploads = S.uploads.filter(x => x.id !== u.id);
      toast('Removed', 'info');
      hooks.render();
    } catch (e) {
      toast(esc(e.message), 'err');
    }
  },

  'view-submitted': el => {
    const id = el.dataset.step;
    if (S.viewOpen.has(id)) S.viewOpen.delete(id); else S.viewOpen.add(id);
    hooks.render();
  }
});

// Delegated listeners for every form inside the journey.
export function wireWidgets(root) {
  const handler = e => {
    const f = e.target.closest('[data-f]');
    const frmEl = f && f.closest('.ifrm[data-step]');
    if (frmEl) onFieldEdit(frmEl);
  };
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
  window.addEventListener('beforeunload', e => {
    if (hasPendingEdits()) { flushAll(); e.preventDefault(); e.returnValue = ''; }
  });
}
