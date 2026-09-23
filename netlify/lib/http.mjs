// Small helpers shared by Netlify Functions.
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function portalUrl(req) {
  const fromEnv = process.env.PORTAL_URL;
  return (fromEnv || new URL(req.url).origin).replace(/\/+$/, '');
}

export const escapeHtml = v =>
  v === null || v === undefined
    ? ''
    : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
