// rest_isolation.mjs
// Proves customer isolation through the public REST, RPC and Storage APIs,
// using real client sessions (JWTs), exactly as a browser would.
//
// It creates two throwaway projects, each with one customer, signs both in,
// runs the checks, prints a PASS/FAIL table and deletes everything it created.
// Exit code is 1 if any check fails.
//
// Run from the repo root (needs `npm install` once):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon key> \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
//   node supabase/tests/rest_isolation.mjs
// Optional: FUNCTIONS_URL=https://<site>/.netlify/functions also checks that a
// customer gets 403 from the admin functions.
//
// The service role key is used only to set up and clean up test data. Keep it
// in your shell for this one command; never commit it or put it in public/.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, FUNCTIONS_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts);
const tag = crypto.randomBytes(3).toString('hex');
const results = [];
const created = { users: [], projects: [], objects: [] };

function check(name, pass, note = '') {
  results.push({ check: name, result: pass ? 'PASS' : 'FAIL', note });
}

async function must(p, what) {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function makeCustomer(letter) {
  const email = `rest-iso-${letter}-${tag}@example.invalid`;
  const password = crypto.randomBytes(18).toString('base64url');
  const u = await must(svc.auth.admin.createUser({ email, password, email_confirm: true }), `create user ${letter}`);
  created.users.push(u.user.id);
  const project = await must(svc.from('projects').insert({ name: `REST isolation ${letter.toUpperCase()} ${tag}` }).select().single(), `project ${letter}`);
  created.projects.push(project.id);
  await must(svc.from('profiles').insert({ user_id: u.user.id, email, full_name: `Test ${letter}`, role: 'client_lead', project_id: project.id }), `profile ${letter}`);
  const phase = await must(svc.from('project_phases').insert({ project_id: project.id, position: 1, name: 'Phase', owner: 'both', status: 'active' }).select().single(), `phase ${letter}`);
  const steps = await must(svc.from('project_steps').insert([
    { project_id: project.id, project_phase_id: phase.id, position: 1, text: 'Client step', owner: 'client', type: 'form_org_details' },
    { project_id: project.id, project_phase_id: phase.id, position: 2, text: 'FLO step', owner: 'flo', type: 'none' }
  ]).select(), `steps ${letter}`);
  await must(svc.from('form_responses').insert({ project_id: project.id, project_step_id: steps[0].id, form_type: 'form_org_details', data: { orgName: `Secret ${letter}` } }), `form ${letter}`);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts);
  const s = await must(client.auth.signInWithPassword({ email, password }), `sign in ${letter}`);
  return { id: u.user.id, email, project, clientStep: steps.find(x => x.owner === 'client'), floStep: steps.find(x => x.owner === 'flo'), client, token: s.session.access_token };
}

async function run() {
  const A = await makeCustomer('a');
  const B = await makeCustomer('b');
  const a = A.client;

  // Reads
  let r = await a.from('projects').select('id');
  check('A sees only its own project', !r.error && r.data.length === 1 && r.data[0].id === A.project.id, r.error ? r.error.message : `${r.data.length} row(s)`);
  for (const t of ['project_phases', 'project_steps', 'form_responses', 'uploads', 'activity_log']) {
    r = await a.from(t).select('id').eq('project_id', B.project.id);
    check(`A cannot read B ${t}`, !r.error && r.data.length === 0, r.error ? r.error.message : `${r.data.length} row(s)`);
  }
  r = await a.from('profiles').select('user_id').eq('user_id', B.id);
  check('A cannot read B profile', !r.error && r.data.length === 0);
  r = await a.from('template_phases').select('id');
  check('A cannot read the template', !r.error && r.data.length === 0);
  r = await a.from('project_overview').select('id');
  check('A project_overview shows only A', !r.error && r.data.length === 1 && r.data[0].id === A.project.id);

  // Writes against B
  r = await a.from('project_steps').update({ done: true }).eq('project_id', B.project.id).select('id');
  check('A cannot tick B steps', !r.error && r.data.length === 0, r.error ? r.error.message : '');
  r = await a.from('form_responses').insert({ project_id: B.project.id, project_step_id: B.clientStep.id, form_type: 'x', data: {} });
  check('A cannot write B form data', !!r.error, r.error ? r.error.code : 'insert succeeded');
  r = await a.from('uploads').insert({ project_id: B.project.id, kind: 'link', link_url: 'https://example.com' });
  check('A cannot add uploads to B', !!r.error, r.error ? r.error.code : 'insert succeeded');
  r = await a.from('activity_log').insert({ project_id: B.project.id, action: 'x' });
  check('A cannot write B activity', !!r.error, r.error ? r.error.code : 'insert succeeded');

  // Own project rules
  r = await a.from('project_steps').update({ done: true }).eq('id', A.floStep.id).select('id');
  check('A cannot tick a FLO-owned step', !r.error && r.data.length === 0);
  r = await a.from('project_steps').update({ done: true, completed_by: B.id, completed_on_behalf: true }).eq('id', A.clientStep.id).select('completed_by,completed_on_behalf').single();
  check('Spoofed completed_by is overwritten', !r.error && r.data.completed_by === A.id && r.data.completed_on_behalf === false, r.error ? r.error.message : JSON.stringify(r.data));
  r = await a.from('project_steps').update({ text: 'hacked' }).eq('id', A.clientStep.id);
  check('A cannot edit step text', !!r.error, r.error ? r.error.code : 'update succeeded');
  r = await a.from('profiles').update({ role: 'admin' }).eq('user_id', A.id);
  check('A cannot make itself admin', !!r.error, r.error ? r.error.code : 'update succeeded');
  r = await a.from('app_settings').update({ value: 'x' }).eq('key', 'ccc_assessment_url').select('key');
  check('A cannot change app settings', !r.error && r.data.length === 0);

  // RPCs
  r = await a.rpc('create_project_from_template', { p_name: 'Sneaky' });
  check('A cannot create projects', !!r.error, r.error ? r.error.code : 'rpc succeeded');
  r = await a.rpc('reset_project_progress', { p_project_id: A.project.id, p_confirm_code: A.project.code });
  check('A cannot reset progress', !!r.error, r.error ? r.error.code : 'rpc succeeded');
  r = await a.rpc('save_template', { p_phases: [], p_note: 'wipe' });
  check('A cannot edit the template', !!r.error, r.error ? r.error.code : 'rpc succeeded');

  // Storage
  const blob = new Blob(['isolation test'], { type: 'text/plain' });
  r = await a.storage.from('customer-uploads').upload(`${B.project.id}/${B.clientStep.id}/x-${tag}.txt`, blob);
  check('A cannot upload into B folder', !!r.error, r.error ? r.error.message : 'upload succeeded');
  if (!r.error) created.objects.push(r.data.path);
  const own = `${A.project.id}/${A.clientStep.id}/x-${tag}.txt`;
  r = await a.storage.from('customer-uploads').upload(own, blob);
  check('A can upload into its own folder', !r.error, r.error ? r.error.message : '');
  if (!r.error) created.objects.push(own);
  r = await a.storage.from('resources').upload(`manual/x-${tag}.pdf`, new Blob(['%PDF'], { type: 'application/pdf' }));
  check('A cannot write to resources', !!r.error, r.error ? r.error.message : 'upload succeeded');

  // Anonymous
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts);
  r = await anon.from('projects').select('id');
  check('Anonymous sees no projects', !!r.error || r.data.length === 0);

  // Netlify Functions (optional)
  if (FUNCTIONS_URL) {
    const res = await fetch(`${FUNCTIONS_URL.replace(/\/$/, '')}/admin-create-user`, {
      method: 'POST', headers: { Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    check('Customer gets 403 from admin-create-user', res.status === 403, `HTTP ${res.status}`);
  }
}

async function cleanup() {
  if (created.objects.length) await svc.storage.from('customer-uploads').remove(created.objects);
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  if (created.projects.length) await svc.from('projects').delete().in('id', created.projects);
}

try {
  await run();
} catch (e) {
  check('Setup', false, e.message);
} finally {
  await cleanup().catch(e => console.error('Cleanup problem:', e.message));
}

console.table(results);
const failed = results.filter(r => r.result !== 'PASS').length;
console.log(failed ? `${failed} check(s) FAILED` : `All ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
