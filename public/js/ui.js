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

export function openModal(html) {
  $('mC').innerHTML = html;
  $('mW').classList.remove('hid');
}

export function closeModal() {
  $('mW').classList.add('hid');
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
