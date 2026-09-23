// POST { full_name, email, role, project_id }
// Admin only. Customers get an auth user with no password (they sign in with an
// email code) plus a welcome email. New admins get a Supabase invite to set a password.
import { json, readJson, portalUrl } from '../lib/http.mjs';
import { requireAdmin, logActivity } from '../lib/supabase-admin.mjs';
import { sendMail } from '../lib/mailer.mjs';
import { welcomeEmail } from '../lib/emails.mjs';

const ROLES = ['admin', 'client_lead', 'client_it', 'utility_staff'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async req => {
  const { caller, sb, response } = await requireAdmin(req);
  if (response) return response;

  const body = (await readJson(req)) || {};
  const full_name = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '');
  const project_id = role === 'admin' ? null : body.project_id || null;

  if (!full_name) return json(400, { error: 'Name is required' });
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address' });
  if (!ROLES.includes(role)) return json(400, { error: 'Unknown role' });

  let project = null;
  if (role !== 'admin') {
    if (!project_id) return json(400, { error: 'Pick a project for this user' });
    const { data, error } = await sb.from('projects').select('id,name,status').eq('id', project_id).maybeSingle();
    if (error || !data) return json(400, { error: 'Project not found' });
    if (data.status !== 'active') return json(400, { error: 'That project is archived' });
    project = data;
  }

  const { data: existing } = await sb.from('profiles').select('user_id').eq('email', email).maybeSingle();
  if (existing) return json(409, { error: 'A user with this email already exists' });

  const base = portalUrl(req);
  let userId, invited = false;

  if (role === 'admin') {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${base}/`
    });
    if (error) return json(error.status === 422 ? 409 : 500, { error: authMessage(error) });
    userId = data.user.id;
    invited = true;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name }
    });
    if (error) return json(error.status === 422 ? 409 : 500, { error: authMessage(error) });
    userId = data.user.id;
  }

  const { error: profErr } = await sb.from('profiles').insert({ user_id: userId, email, full_name, role, project_id, active: true });
  if (profErr) {
    console.error('profile insert failed', profErr);
    await sb.auth.admin.deleteUser(userId);
    return json(500, { error: 'Could not create the user profile' });
  }

  let mail = { sent: invited, configured: true };
  if (!invited) {
    mail = await sendMail({ to: email, ...welcomeEmail({ fullName: full_name, orgName: project.name, portalUrl: base }) });
  }

  await logActivity(sb, {
    project_id,
    actor_id: caller.user_id,
    actor_role: 'admin',
    action: 'user_created',
    target: email,
    detail: { user_id: userId, role, full_name, email_sent: mail.sent, invited }
  });

  return json(200, {
    user_id: userId,
    invited,
    emailSent: mail.sent,
    emailConfigured: mail.configured,
    portalUrl: base
  });
};

function authMessage(error) {
  if (/already been registered|already exists/i.test(error.message)) return 'A user with this email already exists';
  console.error('auth admin error', error);
  return 'Could not create the user';
}
