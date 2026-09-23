-- 0009_hardening.sql
-- Final security pass before customers.
-- Trigger functions run as triggers only; nobody needs to call them directly.
-- (Postgres does not check EXECUTE when a trigger fires, so revoking is safe.)

do $$
declare
  f text;
begin
  foreach f in array array[
    'set_updated_at()', 'projects_default_code()', 'profiles_guard()', 'project_steps_guard()',
    'form_responses_stamp()', 'uploads_stamp()', 'uploads_update_guard()', 'activity_log_stamp()',
    'app_settings_stamp()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- slugify is a pure helper; keep it callable by signed-in users only.
revoke all on function public.slugify(text) from public, anon;
grant execute on function public.slugify(text) to authenticated;

-- Speeds up the per-project email rate limit in notify-admins.
create index if not exists activity_log_project_action_idx
  on public.activity_log (project_id, action, created_at desc);
