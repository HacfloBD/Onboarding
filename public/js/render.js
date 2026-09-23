// Phase card markup shared by the Journey and the admin editor's live preview,
// so the preview is exactly what the customer sees. Numbering comes from order
// (Phase 1..N, steps 1a, 1b...), never from stored ids or positions.
import { isAdmin } from './state.js';
import { escapeHtml as esc } from './ui.js';
import { renderStepExtra } from './widgets.js';
import { completedLine } from './attribution.js';

export const stepLetter = i => String.fromCharCode(97 + i);
export const stepLabel = (phaseNo, i) => `${phaseNo}${stepLetter(i)}`;

// opts.open: expanded; opts.asClient: render as a customer would see it (preview).
export function phaseCard(p, index, { open = false, asClient = false } = {}) {
  const no = index + 1;
  const dn = p.status === 'complete', ac = p.status === 'active';
  const cls = [dn ? 'done' : ac ? 'act' : '', open ? 'open' : ''].filter(Boolean).join(' ');
  const tag = dn ? '<span class="ptag td">Complete</span>' : ac ? (p.owner === 'client' ? '<span class="ptag ty">Your Turn</span>' : p.owner === 'flo' ? '<span class="ptag tf">FLO Working</span>' : '<span class="ptag tb">Joint</span>') : '<span class="ptag tl">Upcoming</span>';
  const dot = dn ? '✓' : no;
  const admin = isAdmin() && !asClient;
  const stepsH = (p.steps || []).map((s, i) => {
    const isFlo = s.owner === 'flo';
    const ck = s.done ? 'dn' : isFlo ? 'fl' : '';
    const fb = isFlo ? '<span class="fbadge">FLO</span>' : '';
    const clickable = !asClient && (admin || !isFlo);
    return `<div class="stp" id="s-${s.id}" data-label="${stepLabel(no, i)}"><div class="sc ${ck}"${clickable ? ` data-action="toggle-step" data-step="${s.id}"` : ''}${clickable && isFlo ? ' style="cursor:pointer"' : ''}>${s.done ? '✓' : isFlo ? '⏳' : ''}</div><div class="sb"><div class="stitle">${esc(s.text)}${fb}</div>${s.detail ? `<div class="sdet">${esc(s.detail)}</div>` : ''}${s.done && s.completed_by ? `<div class="attr${s.completed_on_behalf ? ' ob' : ''}">${esc(completedLine(s))}</div>` : ''}${renderStepExtra(s, { asClient })}</div></div>`;
  }).join('');
  const compH = dn ? `<div class="comp"><div class="ce">🎉</div><h3>Phase ${no} Complete!</h3><p>${esc(p.completion_message || 'Phase complete!')}</p></div>` : '';
  const owner = p.owner === 'client' ? 'You lead' : p.owner === 'flo' ? 'FLO leads' : 'Joint effort';
  return `<div class="pc ${cls}" id="p-${p.id}"><div class="ph"${asClient ? '' : ` data-action="toggle-phase" data-phase="${p.id}"`}><div class="pn">${dot}</div><div class="pi"><div class="pt">Phase ${no}: ${esc(p.name)}</div><div class="pm"><span>${esc(p.duration || '')}</span><span>${owner}</span></div></div>${tag}<div class="pa">▼</div></div><div class="pb"><div class="px"><p class="pdesc">${esc(p.description || '')}</p>${stepsH}${compH}</div></div></div>`;
}
