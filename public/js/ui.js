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
  // Keys pressed inside a cross-origin iframe (the YouTube player) never reach
  // this page, so also pull focus back if it ever lands outside the dialog.
  document.addEventListener('focusin', e => {
    if ($('mW').classList.contains('hid') || $('mC').contains(e.target)) return;
    const first = $('mC').querySelector(FOCUSABLE);
    (first || $('mC')).focus();
  });
  registerActions({ 'close-modal': () => closeModal() });
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
