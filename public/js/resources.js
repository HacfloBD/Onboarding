// Resources shown at the top of the Journey: overview video and user manual.
// Settings live in app_settings; files in the public "resources" bucket.
import { S } from './state.js';
import { resourceUrl } from './data.js';
import { openModal, escapeHtml as esc, fmtSize, registerActions } from './ui.js';
import { fmtDay } from './attribution.js';

// A settings value may be a plain string or an object; return the text part.
export function settingText(key) {
  const v = S.settings[key];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.url || v.path || '';
  return '';
}

// { path, file_name, size_bytes, uploaded_at } or null. Accepts a bare path string too.
export function resourceFile(key) {
  const v = S.settings[key];
  if (!v) return null;
  if (typeof v === 'string') return { path: v, file_name: v.split('/').pop(), size_bytes: null, uploaded_at: null };
  return v.path ? v : null;
}

export function resourceDownloadUrl(key) {
  const f = resourceFile(key);
  return f ? resourceUrl(f.path, f.file_name || true) : '';
}

// Any YouTube URL (watch?v=, youtu.be/, embed/, shorts/, live/, nocookie) -> 11-char id, or ''.
export function youtubeId(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const ok = id => (/^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '');
  if (host === 'youtu.be') return ok(u.pathname.split('/')[1]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return ok(u.searchParams.get('v'));
    const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
    if (m) return ok(m[2]);
  }
  return '';
}

export const embedUrl = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;

export function openVideo(url, title = 'FLO onboarding overview') {
  const id = youtubeId(url);
  if (!id) return false;
  openModal(`<div class="vhead"><h2>${esc(title)}</h2><button class="btn btn-g btn-sm" data-action="close-modal" aria-label="Close video">✕ Close</button></div>
<div class="vwrap"><iframe src="${embedUrl(id)}" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`, { wide: true, label: title });
  return true;
}

export function resourcesRow() {
  const video = youtubeId(settingText('overview_video_url'));
  const manual = resourceFile('manual_file_path');
  if (!video && !manual) return '';
  const cards = [];
  if (video) {
    cards.push(`<button type="button" class="rcard" data-action="play-overview"><span class="rci" aria-hidden="true">▶</span><span class="rcb"><span class="rct">Watch the 3-minute overview</span><span class="rcs">How onboarding works, start to finish</span></span></button>`);
  }
  if (manual) {
    const when = manual.uploaded_at ? `Updated ${fmtDay(manual.uploaded_at)}` : 'PDF';
    cards.push(`<a class="rcard" href="${esc(resourceDownloadUrl('manual_file_path'))}" target="_blank" rel="noopener"><span class="rci" aria-hidden="true">⬇</span><span class="rcb"><span class="rct">Download the user manual (PDF)</span><span class="rcs">${esc(when)}${manual.size_bytes ? ' · ' + esc(fmtSize(manual.size_bytes)) : ''}</span></span></a>`);
  }
  return cards.join('');
}

registerActions({
  'play-overview': () => openVideo(settingText('overview_video_url'))
});
