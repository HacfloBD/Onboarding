// Local stand-in for a Supabase project, for running supabase/tests/rest_isolation.mjs
// against the local database. REST goes to PostgREST (real RLS). Storage uploads
// are inserted into storage.objects AS the calling user, so storage RLS is real too.
// Auth is minimal: admin create/delete user and password sign-in with signed JWTs.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SECRET = 'local-test-secret-local-test-secret-123456';
const PG = ['-h', '/var/tmp/flopg', '-p', '5433', '-U', 'postgres', '-d', 'flo', '-Atq', '-v', 'ON_ERROR_STOP=1'];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = claims => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims }); return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`; };
const claimsOf = auth => { try { const [h, p, s] = (auth || '').replace(/^Bearer /, '').split('.'); if (crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null; return JSON.parse(Buffer.from(p, 'base64url')); } catch { return null; } };
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const psql = sql => execFileSync('psql', [...PG, '-c', sql]).toString().trim();

export const SERVICE_KEY = sign({ role: 'service_role', exp: 4102444800 });
export const ANON_KEY = sign({ role: 'anon', exp: 4102444800 });
const passwords = new Map();

export function start(port = 54340) {
  const srv = http.createServer(async (q, r) => {
    let body = ''; for await (const c of q) body += c;
    const u = new URL(q.url, 'http://x'), p = u.pathname;
    const send = (s, j) => { r.writeHead(s, { 'content-type': 'application/json' }); r.end(JSON.stringify(j)); };
    const c = claimsOf(q.headers.authorization);
    try {
      if (p === '/auth/v1/admin/users' && q.method === 'POST') {
        if (!c || c.role !== 'service_role') return send(401, { msg: 'service role required' });
        const b = JSON.parse(body), id = crypto.randomUUID();
        psql(`insert into auth.users (id,email,aud,role) values (${lit(id)},${lit(b.email)},'authenticated','authenticated')`);
        passwords.set(b.email, { id, password: b.password });
        return send(200, { id, email: b.email, aud: 'authenticated', role: 'authenticated' });
      }
      let m;
      if ((m = p.match(/^\/auth\/v1\/admin\/users\/(.+)$/)) && q.method === 'DELETE') {
        psql(`delete from auth.users where id=${lit(m[1])}`);
        return send(200, {});
      }
      if (p === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
        const b = JSON.parse(body), rec = passwords.get(b.email);
        if (!rec || rec.password !== b.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        const tok = sign({ sub: rec.id, email: b.email, role: 'authenticated', aud: 'authenticated' });
        return send(200, { access_token: tok, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: rec.id, email: b.email, aud: 'authenticated', role: 'authenticated' } });
      }
      if (p.startsWith('/rest/v1/')) {
        const headers = Object.fromEntries(Object.entries(q.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k)));
        const res = await fetch('http://127.0.0.1:3001' + p.slice(8) + u.search, { method: q.method, headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : body });
        const out = { 'content-type': res.headers.get('content-type') || 'application/json' };
        if (res.headers.get('content-range')) out['content-range'] = res.headers.get('content-range');
        r.writeHead(res.status, out); return r.end(await res.text());
      }
      if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && q.method === 'POST') {
        const bucket = m[1], name = decodeURIComponent(m[2]);
        const ins = `insert into storage.objects (bucket_id, name, owner_id) values (${lit(bucket)}, ${lit(name)}, ${lit(c && c.sub || '')})`;
        try {
          if (c && c.role === 'service_role') psql(ins);
          else psql(`set role authenticated; select set_config('request.jwt.claims', ${lit(JSON.stringify(c || {}))}, false); ${ins};`);
        } catch (e) {
          return send(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        }
        return send(200, { Key: `${bucket}/${name}` });
      }
      if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)$/)) && q.method === 'DELETE') {
        const b = JSON.parse(body);
        for (const n of b.prefixes) psql(`delete from storage.objects where bucket_id=${lit(m[1])} and name=${lit(n)}`);
        return send(200, b.prefixes.map(name => ({ name })));
      }
      send(404, { error: 'not handled ' + p });
    } catch (e) {
      send(500, { error: e.message });
    }
  });
  return new Promise(res => srv.listen(port, () => res(srv)));
}

if (process.argv[1] && process.argv[1].endsWith('supabase-proxy.mjs')) {
  await start();
  console.log(`SUPABASE_URL=http://127.0.0.1:54340\nSUPABASE_ANON_KEY=${ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`);
}
