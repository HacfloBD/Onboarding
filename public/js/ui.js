// Small UI helpers shared by every module: toasts, modal, delegated actions, formatting.
import { escapeHtml } from './escape.js';

const $ = id => document.getElementById(id);

export function toast(m, t = 'info') {
  const c = $('tC'), d = document.createElement('div');
  d.className = `tst t${t}`;
  d.innerHTML = `<span>${t === 'ok' ? '✓' : t === 'err' ? '✕' : 'ℹ'}</span> ${m}`;
  c.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateX(20px)'; d.style.transition = '.3s'; setTimeout(() => d.remove(), 300); }, 3500);
}

// Shared modal. opts.wide widens it (880px) for the video player.
// Escape closes it, Tab stays inside it, and focus returns where it was.
let lastFocus = null;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

export function openModal(html, { wide = false, label = '' } = {}) {
  const m = $('mC');
  if ($('mW').classList.contains('hid')) lastFocus = document.activeElement;
  m.innerHTML = html;
  m.classList.toggle('wide', wide);
  const h = m.querySelector('h2');
  m.setAttribute('aria-label', label || (h ? h.textContent : 'Dialog'));
  $('mW').classList.remove('hid');
  const first = m.querySelector('[autofocus]') || m.querySelector(FOCUSABLE);
  (first || m).focus();
}

// Emptying the modal also removes any iframe, which stops video playback.
export function closeModal() {
  if ($('mW').classList.contains('hid')) return;
  $('mW').classList.add('hid');
  $('mC').innerHTML = '';
  $('mC').classList.remove('wide');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

function trapKeys(e) {
  if ($('mW').classList.contains('hid')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  if (e.key !== 'Tab') return;
  const items = [...$('mC').querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null || x.tagName === 'IFRAME');
  if (!items.length) { e.preventDefault(); $('mC').focus(); return; }
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !$('mC').contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !$('mC').contains(document.activeElement))) { e.preventDefault(); first.focus(); }
}

// One delegated click/change/input handler for every [data-action] element.
const registry = {};
export function registerActions(map) { Object.assign(registry, map); }

export function wireActions() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || ['SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName)) return;
    const fn = registry[el.dataset.action];
    if (fn) { fn(el, e); }
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    const fn = el && registry[el.dataset.change];
    if (fn) fn(el, e);
  });
  $('mW').addEventListener('click', e => { if (e.target === $('mW')) closeModal(); });
  document.addEventListener('keydown', trapKeys);
  // Keyboard: Enter or Space on a role="button" element runs its action.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('[data-action][role="button"]');
    if (!el || el !== e.target) return;
    const fn = registry[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  linkLabels(document.body);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) linkLabels(n); })))
    .observe(document.body, { childList: true, subtree: true });
  // Keys pressed inside a cross-origin iframe (the YouTube player) never reach
  // this page, so also pull focus back if it ever lands outside the dialog.
  document.addEventListener('focusin', e => {
    if ($('mW').classList.contains('hid') || $('mC').contains(e.target)) return;
    const first = $('mC').querySelector(FOCUSABLE);
    (first || $('mC')).focus();
  });
  registerActions({ 'close-modal': () => closeModal() });
}

// Every .fg has a <label> followed by its field. Link them (for/id) so screen
// readers announce the label; radio groups get role="radiogroup" instead.
let labelSeq = 0;
function linkLabels(root) {
  const groups = root.matches && root.matches('.fg') ? [root] : [...root.querySelectorAll('.fg')];
  for (const g of groups) {
    const label = g.querySelector(':scope > label');
    if (!label || label.htmlFor) continue;
    const rg = g.querySelector(':scope > .rg');
    if (rg) {
      label.id = label.id || `lbl-${++labelSeq}`;
      rg.setAttribute('role', 'radiogroup');
      rg.setAttribute('aria-labelledby', label.id);
      continue;
    }
    const field = g.querySelector(':scope > input, :scope > select, :scope > textarea, :scope > .uz input, :scope input:not([type=radio]), :scope select, :scope textarea');
    if (!field) continue;
    if (!field.id) field.id = `fld-${++labelSeq}`;
    label.htmlFor = field.id;
  }
}

export function fmtSize(b) {
  if (b === null || b === undefined) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function daysLeft(date) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(date + 'T00:00:00') - new Date()) / 864e5));
}

// Only http(s) links are ever rendered as hrefs.
export function safeUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
}

export const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export { escapeHtml };

// ---------------------------------------------------------------------------
// Errors: plain words for network and session problems.
// ---------------------------------------------------------------------------

export const NETWORK_MSG = "We couldn't reach the server. Check your connection and try again.";
export const EXPIRED_MSG = 'Your session expired, please sign in again';

export function errorKind(e) {
  if (!e) return 'other';
  const msg = String(e.message || e);
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg)) return 'network';
  if (e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || e.name === 'AuthSessionMissingError' ||
      /JWT expired|invalid JWT|JWSError|Session expired|refresh token/i.test(msg)) return 'session';
  return 'other';
}

let onExpired = () => {};
export function setSessionExpiredHandler(fn) { onExpired = fn; }

// Show an error. prefix is trusted text (already escaped by the caller).
export function reportError(e, prefix = '') {
  const kind = errorKind(e);
  if (kind === 'session') { onExpired(); return; }
  if (kind === 'network') { toast(NETWORK_MSG, 'err'); return; }
  toast((prefix ? prefix + ': ' : '') + escapeHtml(e && e.message ? e.message : e), 'err');
}
