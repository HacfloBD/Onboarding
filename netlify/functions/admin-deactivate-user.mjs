// POST { user_id, reactivate? }
// Admin only. Deactivates a user (profile inactive + auth ban, so existing
// sessions stop refreshing). Pass reactivate: true to undo.
import { json, readJson } from '../lib/http.mjs';
import { requireAdmin, logActivity } from '../lib/supabase-admin.mjs';

const BAN_FOREVER = '876000h'; // about 100 years; lifted with 'none'

export default async req => {
  const { caller, sb, response } = await requireAdmin(req);
  if (response) return response;

  const body = (await readJson(req)) || {};
  const userId = String(body.user_id || '');
  const reactivate = body.reactivate === true;

  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(400, { error: 'Missing user_id' });
  if (userId === caller.user_id) return json(400, { error: 'You cannot deactivate your own account' });

  const { data: target, error: findErr } = await sb
    .from('profiles')
    .select('user_id,email,project_id,role,active')
    .eq('user_id', userId)
    .maybeSingle();
  if (findErr) return json(500, { error: 'Could not load the user' });
  if (!target) return json(404, { error: 'User not found' });

  const { error: banErr } = await sb.auth.admin.updateUserById(userId, { ban_duration: reactivate ? 'none' : BAN_FOREVER });
  if (banErr) {
    console.error('ban update failed', banErr);
    return json(500, { error: 'Could not update the sign-in status' });
  }

  const { error: updErr } = await sb.from('profiles').update({ active: reactivate }).eq('user_id', userId);
  if (updErr) {
    console.error('profile update failed', updErr);
    return json(500, { error: 'Could not update the user' });
  }

  await logActivity(sb, {
    project_id: target.project_id,
    actor_id: caller.user_id,
    actor_role: 'admin',
    action: reactivate ? 'user_reactivated' : 'user_deactivated',
    target: target.email,
    detail: { user_id: userId, role: target.role }
  });

  return json(200, { user_id: userId, active: reactivate });
};
