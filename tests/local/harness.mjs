// Test harness: real PostgREST behind the browser, fake auth/storage/realtime.
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
const SECRET = 'local-test-secret-local-test-secret-123456';
export const USERS = {
  admin: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'olivier@hacflo.com' },
  jane: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'jane@springfield.gov' },
  bart: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'bart@shelbyville.gov' }
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function jwt(u) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const session = u => ({ access_token: jwt(u), refresh_token: 'r-' + u.id, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' } });
const byEmail = e => Object.values(USERS).find(u => u.email === e);
const byId = id => Object.values(USERS).find(u => u.id === id);
const subOf = h => { try { return JSON.parse(Buffer.from((h.authorization || '').split('.')[1], 'base64url')).sub; } catch { return null; } };
export const sql = q => execSync(`psql -h /var/tmp/flopg -p 5433 -U postgres -d flo -Atc ${JSON.stringify(q)}`).toString().trim();

export const storage = new Map();   // path -> {bytes, owner}
export const resources = new Map(); // resources bucket
export const log = [];
export const channels = [];         // realtime sockets {ws, topic, ids}

export async function mock(ctx) {
  await ctx.route('https://www.youtube-nocookie.com/**', r => { log.push('YT ' + r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#000;color:#fff">video</body></html>' }); });
  await ctx.route('https://test.supabase.co/**', async route => {
    const q = route.request(), u = new URL(q.url()), h = q.headers();
    const f = (s, j) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(j) });
    const p = u.pathname;
    if (p.startsWith('/rest/v1/')) {
      const res = await route.fetch({ url: 'http://127.0.0.1:3001' + p.slice(8) + u.search });
      if (res.status() >= 400) log.push(`REST ${res.status()} ${q.method()} ${p}${u.search} ${(await res.text()).slice(0, 160)}`);
      return route.fulfill({ response: res });
    }
    const body = q.postData() ? (() => { try { return JSON.parse(q.postData()); } catch { return null; } })() : null;
    if (p === '/auth/v1/otp') return byEmail(body.email) ? f(200, {}) : f(422, { code: 422, msg: 'Signups not allowed for otp' });
    if (p === '/auth/v1/verify') return body.token === '123456' ? f(200, session(byEmail(body.email))) : f(403, { code: 403, msg: 'bad' });
    if (p === '/auth/v1/token') return u.searchParams.get('grant_type') === 'password'
      ? (body.password === 'pw12345678' ? f(200, session(byEmail(body.email))) : f(400, { code: 400, msg: 'Invalid login credentials' }))
      : f(200, session(byId(body.refresh_token.slice(2))));
    if (p === '/auth/v1/user') { const x = byId(subOf(h)); return x ? f(200, { ...x, aud: 'authenticated' }) : f(401, {}); }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    // Storage
    let m;
    if ((m = p.match(/^\/storage\/v1\/object\/customer-uploads\/(.+)$/)) && q.method() === 'POST') {
      const path = decodeURIComponent(m[1]);
      storage.set(path, { bytes: q.postDataBuffer(), owner: subOf(h) });
      log.push('STORE ' + path);
      return f(200, { Key: 'customer-uploads/' + path, Id: crypto.randomUUID() });
    }
    if ((m = p.match(/^\/storage\/v1\/object\/sign\/customer-uploads\/(.+)$/)) && q.method() === 'POST') {
      const path = decodeURIComponent(m[1]);
      log.push('SIGN ' + path + ' ' + q.postData());
      return f(200, { signedURL: `/object/sign/customer-uploads/${encodeURIComponent(path)}?token=t` });
    }
    if ((m = p.match(/^\/storage\/v1\/object\/resources\/(.+)$/)) && q.method() === 'POST') {
      const path = decodeURIComponent(m[1]);
      let ct = h['content-type'] || '';
      if (ct.startsWith('multipart/')) { const mm = q.postDataBuffer().toString('latin1').match(/Content-Type: ([^\r\n]+)/i); ct = mm ? mm[1] : ''; }
      if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(ct.split(';')[0])) return f(415, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
      resources.set(path, q.postDataBuffer());
      log.push('RES-STORE ' + path);
      return f(200, { Key: 'resources/' + path });
    }
    if (p === '/storage/v1/object/resources' && q.method() === 'DELETE') {
      const out = body.prefixes.filter(x => resources.delete(x)).map(name => ({ name }));
      log.push('RES-REMOVE ' + body.prefixes.join(','));
      return f(200, out);
    }
    if ((m = p.match(/^\/storage\/v1\/object\/public\/resources\/(.+)$/))) {
      const path = decodeURIComponent(m[1]);
      log.push('RES-GET ' + path + u.search);
      return resources.has(path) ? route.fulfill({ status: 200, contentType: 'application/pdf', body: resources.get(path) }) : f(404, { error: 'not found' });
    }
    if (p === '/storage/v1/object/sign/customer-uploads') return f(200, body.paths.map(x => ({ path: x, signedURL: `/object/sign/customer-uploads/${encodeURIComponent(x)}?token=t`, error: null })));
    if (p === '/storage/v1/object/customer-uploads' && q.method() === 'DELETE') {
      const out = body.prefixes.filter(x => storage.delete(x)).map(name => ({ name }));
      log.push('REMOVE ' + body.prefixes.join(','));
      return f(200, out);
    }
    if (p.startsWith('/storage/v1/object/sign/')) { log.push('GETSIGNED ' + u.search); return route.fulfill({ status: 204 }); }
    log.push('UNHANDLED ' + q.method() + ' ' + p);
    return f(404, {});
  });
}

// Minimal Phoenix/Supabase Realtime server: acknowledges joins, lets tests push changes.
export async function mockRealtime(page, name) {
  await page.routeWebSocket(/realtime\/v1\/websocket/, ws => {
    ws.onMessage(raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      const [joinRef, ref, topic, event, payload] = msg;
      if (event === 'phx_join') {
        const pc = (payload.config && payload.config.postgres_changes) || [];
        const withIds = pc.map((c, i) => ({ ...c, id: 1000 + i }));
        channels.push({ ws, topic, ids: withIds, name });
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: withIds } }]));
      } else if (event === 'heartbeat' || event === 'access_token' || event === 'phx_leave') {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
}
export function pushChange(name, table, record) {
  for (const c of channels.filter(c => c.name === name)) {
    const ids = c.ids.filter(x => x.table === table).map(x => x.id);
    if (!ids.length) continue;
    c.ws.send(JSON.stringify([null, null, c.topic, 'postgres_changes', { ids, data: { type: 'UPDATE', schema: 'public', table, commit_timestamp: new Date().toISOString(), columns: [], record, old_record: {}, errors: null } }]));
  }
}
