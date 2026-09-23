// POST { kind: 'session_request', step_id } | { kind: 'upload', upload_ids: [...] }
//   Any signed-in user on the project (or an admin). Emails FLO admins: the
//   project's CSM when csm_name matches an admin's name, otherwise every active admin.
// POST { kind: 'step_completed_on_behalf', step_id }
//   Admins only. Emails the project's active Client Lead(s) that FLO completed a
//   step on their behalf. Sent from MAIL_FROM like every app email.
import { json, readJson, portalUrl } from '../lib/http.mjs';
import { requireUser } from '../lib/supabase-admin.mjs';
import { sendMail } from '../lib/mailer.mjs';
import { adminNoticeEmail } from '../lib/emails.mjs';

const MODES = { in_person: 'In-person (HAC Texas comes to you)', virtual: 'Virtual (Teams or Zoom)' };
const UUID = /^[0-9a-f-]{36}$/i;

export default async req => {
  const { caller, sb, response } = await requireUser(req);
  if (response) return response;

  const body = (await readJson(req)) || {};
  if (body.kind === 'session_request') return sessionRequest(req, sb, caller, body);
  if (body.kind === 'upload') return uploadNotice(req, sb, caller, body);
  if (body.kind === 'step_completed_on_behalf') return completedOnBehalf(req, sb, caller, body);
  return json(400, { error: 'Unknown notification' });
};

function allowed(caller, projectId) {
  return caller.role === 'admin' || caller.project_id === projectId;
}

async function recipients(sb, project) {
  const { data } = await sb.from('profiles').select('email,full_name').eq('role', 'admin').eq('active', true);
  const admins = data || [];
  const csm = (project.csm_name || '').trim().toLowerCase();
  const match = csm && admins.filter(a => (a.full_name || '').trim().toLowerCase() === csm);
  return (match && match.length ? match : admins).map(a => a.email);
}

async function sendAll(to, mail) {
  let sent = 0, configured = true;
  for (const addr of to) {
    const r = await sendMail({ to: addr, ...mail });
    configured = r.configured;
    if (r.sent) sent += 1;
    if (!r.configured) break;
  }
  return { sent, configured };
}

async function sessionRequest(req, sb, caller, body) {
  if (!UUID.test(String(body.step_id || ''))) return json(400, { error: 'Missing step_id' });

  const { data: step } = await sb.from('project_steps').select('id,project_id,type,text').eq('id', body.step_id).maybeSingle();
  if (!step || step.type !== 'form_schedule_session') return json(404, { error: 'Step not found' });
  if (!allowed(caller, step.project_id)) return json(403, { error: 'Not your project' });

  const [{ data: project }, { data: form }] = await Promise.all([
    sb.from('projects').select('id,name,csm_name').eq('id', step.project_id).single(),
    sb.from('form_responses').select('data').eq('project_step_id', step.id).maybeSingle()
  ]);
  const d = (form && form.data) || {};
  if (!d.preferredDate || !d.preferredTime) return json(400, { error: 'Pick a preferred date and time first' });

  const slot = [d.preferredDate, d.preferredTime, d.alternateDate || '', d.alternateTime || '', d.mode || ''].join('|');

  // Don't email the same slot twice.
  const { data: prior } = await sb.from('activity_log').select('id')
    .eq('project_id', step.project_id).eq('action', 'session_request_emailed')
    .eq('detail->>slot', slot).limit(1);
  if (prior && prior.length) return json(200, { emailSent: false, duplicate: true });

  const to = await recipients(sb, project);
  const mail = adminNoticeEmail({
    subject: `Session request: ${project.name}`,
    intro: `${caller.full_name || caller.email} asked to schedule the 6-Pillar assessment session.`,
    rows: [
      ['Project', project.name],
      ['Preferred', `${d.preferredDate} at ${d.preferredTime}`],
      ['Alternate', d.alternateDate ? `${d.alternateDate}${d.alternateTime ? ` at ${d.alternateTime}` : ''}` : 'None given'],
      ['Format', MODES[d.mode] || 'Not chosen yet'],
      ['Attendees', d.attendees || ''],
      ['Notes', d.notes || ''],
      ['Requested by', `${caller.full_name || ''} <${caller.email}>`]
    ],
    portalUrl: portalUrl(req)
  });
  const r = await sendAll(to, mail);

  await sb.from('activity_log').insert({
    project_id: step.project_id,
    actor_id: caller.user_id,
    actor_role: caller.role,
    action: 'session_request_emailed',
    target: `${d.preferredDate} ${d.preferredTime}`,
    detail: { slot, step_id: step.id, recipients: to.length, sent: r.sent }
  });

  return json(200, { emailSent: r.sent > 0, emailConfigured: r.configured });
}

async function uploadNotice(req, sb, caller, body) {
  const ids = Array.isArray(body.upload_ids) ? body.upload_ids.filter(x => UUID.test(String(x))).slice(0, 20) : [];
  if (!ids.length) return json(400, { error: 'Missing upload_ids' });

  // Only fresh uploads made by the caller can trigger an email.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: ups } = await sb.from('uploads')
    .select('id,project_id,kind,file_name,link_url,size_bytes,uploaded_by,created_at')
    .in('id', ids).eq('uploaded_by', caller.user_id).gte('created_at', since);
  const rows = (ups || []).filter(u => allowed(caller, u.project_id));
  if (!rows.length) return json(200, { emailSent: false });

  const projectId = rows[0].project_id;
  const { data: project } = await sb.from('projects').select('id,name,csm_name').eq('id', projectId).single();
  const to = await recipients(sb, project);
  const items = rows.filter(u => u.project_id === projectId).map(u =>
    u.kind === 'link' ? ['Link', u.link_url] : ['File', `${u.file_name} (${Math.max(1, Math.round((u.size_bytes || 0) / 1024))} KB)`]);

  const mail = adminNoticeEmail({
    subject: `New upload: ${project.name}`,
    intro: `${caller.full_name || caller.email} added ${items.length === 1 ? 'a file' : `${items.length} items`} to the onboarding portal.`,
    rows: [['Project', project.name], ...items, ['Uploaded by', `${caller.full_name || ''} <${caller.email}>`]],
    portalUrl: portalUrl(req)
  });
  const r = await sendAll(to, mail);
  return json(200, { emailSent: r.sent > 0, emailConfigured: r.configured });
}

async function completedOnBehalf(req, sb, caller, body) {
  if (caller.role !== 'admin') return json(403, { error: 'Admins only' });
  if (!UUID.test(String(body.step_id || ''))) return json(400, { error: 'Missing step_id' });

  const { data: step } = await sb.from('project_steps')
    .select('id,project_id,text,done,completed_on_behalf,completed_by,completed_at,archived_at')
    .eq('id', body.step_id).maybeSingle();
  if (!step || step.archived_at) return json(404, { error: 'Step not found' });
  if (!step.done || !step.completed_on_behalf || step.completed_by !== caller.user_id) {
    return json(400, { error: 'This step was not completed by you on behalf of the customer' });
  }

  const [{ data: project }, { data: leads }, { data: label }] = await Promise.all([
    sb.from('projects').select('id,name').eq('id', step.project_id).single(),
    sb.from('profiles').select('email,full_name').eq('project_id', step.project_id).eq('role', 'client_lead').eq('active', true),
    sb.rpc('step_label', { p_step_id: step.id })
  ]);
  const to = (leads || []).map(l => l.email);
  if (!to.length) return json(200, { emailSent: false, noRecipients: true });

  const first = (caller.full_name || '').trim().split(/\s+/)[0] || 'Your FLO team';
  const when = new Date(step.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const mail = adminNoticeEmail({
    subject: `FLO completed a step for you: ${step.text}`,
    intro: `${first} from FLO marked this onboarding step complete on behalf of your team. No action is needed. If something doesn't look right, reply to your CSM.`,
    rows: [['Project', project.name], ['Step', `${label || ''} ${step.text}`.trim()], ['Completed', `${when} by FLO (${first}) on behalf of your team`]],
    portalUrl: portalUrl(req)
  });
  const r = await sendAll(to, mail);

  await sb.from('activity_log').insert({
    project_id: step.project_id,
    actor_id: caller.user_id,
    actor_role: 'admin',
    action: 'customer_notified',
    target: step.text,
    on_behalf: true,
    detail: { step_id: step.id, recipients: to.length, sent: r.sent }
  });

  return json(200, { emailSent: r.sent > 0, emailConfigured: r.configured });
}
