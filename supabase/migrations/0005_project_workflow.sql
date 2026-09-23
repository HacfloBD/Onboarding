-- 0005_project_workflow.sql
-- Multi-project workflow: create a project from the master template, reset
-- progress, automatic phase status, activity logging, upload deletion rules,
-- a per-project overview for the admin list, and realtime.

-- ---------------------------------------------------------------------------
-- create_project_from_template: atomic project + phases + steps copy.
-- Phase at the lowest position starts 'active', the rest 'pending'.
-- ---------------------------------------------------------------------------

create or replace function public.create_project_from_template(
  p_name text,
  p_code text default null,
  p_csm_name text default null,
  p_target_go_live date default null
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proj public.projects;
  tp record;
  new_phase_id uuid;
  first_pos int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create projects' using errcode = '42501';
  end if;

  insert into public.projects (name, code, csm_name, target_go_live, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_code, '')), ''), nullif(trim(coalesce(p_csm_name, '')), ''), p_target_go_live, auth.uid())
  returning * into proj;

  select min(position) into first_pos from public.template_phases;

  for tp in select * from public.template_phases order by position loop
    insert into public.project_phases (
      project_id, position, name, short, owner, duration, description,
      completion_message, status, source_template_phase_id
    ) values (
      proj.id, tp.position, tp.name, tp.short, tp.owner, tp.duration, tp.description,
      tp.completion_message, case when tp.position = first_pos then 'active' else 'pending' end, tp.id
    )
    returning id into new_phase_id;

    insert into public.project_steps (project_id, project_phase_id, position, text, owner, type, detail, config)
    select proj.id, new_phase_id, ts.position, ts.text, ts.owner, ts.type, ts.detail, ts.config
    from public.template_steps ts
    where ts.template_phase_id = tp.id
    order by ts.position;
  end loop;

  insert into public.activity_log (project_id, action, target, detail)
  values (proj.id, 'project_created', proj.name, jsonb_build_object('code', proj.code));

  return proj;
end;
$$;

revoke all on function public.create_project_from_template(text, text, text, date) from public, anon;
grant execute on function public.create_project_from_template(text, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Phase status follows its steps.
--   all steps done            -> phase 'complete', next pending phase -> 'active'
--   a step undone in a complete phase -> back to 'active'
--   a step touched in a pending phase -> 'active'
-- SECURITY DEFINER because clients may not update project_phases directly.
-- ---------------------------------------------------------------------------

create or replace function public.project_steps_sync_phase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ph public.project_phases;
  remaining int;
begin
  if current_setting('flo.bulk_reset', true) = 'on' then
    return null;
  end if;
  select * into ph from public.project_phases where id = new.project_phase_id;
  select count(*) into remaining from public.project_steps
    where project_phase_id = new.project_phase_id and not done;

  if remaining = 0 then
    if ph.status <> 'complete' then
      update public.project_phases set status = 'complete' where id = ph.id;
      update public.project_phases set status = 'active'
        where id = (
          select id from public.project_phases
          where project_id = ph.project_id and position > ph.position
          order by position limit 1
        ) and status = 'pending';
    end if;
  elsif ph.status <> 'active' then
    update public.project_phases set status = 'active' where id = ph.id;
  end if;

  return null;
end;
$$;

drop trigger if exists project_steps_sync_phase on public.project_steps;
create trigger project_steps_sync_phase
  after update of done on public.project_steps
  for each row when (old.done is distinct from new.done)
  execute function public.project_steps_sync_phase();

-- ---------------------------------------------------------------------------
-- Activity logging from the database, so it can't be skipped by a client.
-- ---------------------------------------------------------------------------

-- "1a", "2c": phase position + step letter.
create or replace function public.step_label(p_step_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ph.position::text || chr(96 + s.rn::int)
  from (
    select id, project_phase_id,
           row_number() over (partition by project_phase_id order by position, created_at) as rn
    from public.project_steps
    where project_phase_id = (select project_phase_id from public.project_steps where id = p_step_id)
  ) s
  join public.project_phases ph on ph.id = s.project_phase_id
  where s.id = p_step_id;
$$;

create or replace function public.log_step_toggle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('flo.bulk_reset', true) = 'on' then
    return null;
  end if;
  insert into public.activity_log (project_id, action, target, detail, on_behalf)
  values (
    new.project_id,
    case when new.done then 'step_done' else 'step_undone' end,
    public.step_label(new.id) || ' ' || new.text,
    jsonb_build_object('step_id', new.id),
    new.done and new.completed_on_behalf
  );
  return null;
end;
$$;

drop trigger if exists log_step_toggle on public.project_steps;
create trigger log_step_toggle
  after update of done on public.project_steps
  for each row when (old.done is distinct from new.done)
  execute function public.log_step_toggle();

create or replace function public.log_phase_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('flo.bulk_reset', true) = 'on' then
    return null;
  end if;
  insert into public.activity_log (project_id, action, target, detail)
  values (
    new.project_id,
    'phase_status',
    'Phase ' || new.position || ': ' || new.name,
    jsonb_build_object('phase_id', new.id, 'from', old.status, 'to', new.status)
  );
  return null;
end;
$$;

drop trigger if exists log_phase_status on public.project_phases;
create trigger log_phase_status
  after update of status on public.project_phases
  for each row when (old.status is distinct from new.status)
  execute function public.log_phase_status();

-- Form saves: at most one log entry per form per 10 minutes.
create or replace function public.log_form_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.activity_log
    where project_id = new.project_id
      and action = 'form_saved'
      and detail ->> 'step_id' = new.project_step_id::text
      and created_at > now() - interval '10 minutes'
  ) then
    insert into public.activity_log (project_id, action, target, detail, on_behalf)
    values (
      new.project_id, 'form_saved',
      public.step_label(new.project_step_id) || ' ' || new.form_type,
      jsonb_build_object('step_id', new.project_step_id),
      new.last_edit_on_behalf
    );
  end if;
  return null;
end;
$$;

drop trigger if exists log_form_save on public.form_responses;
create trigger log_form_save
  after insert or update on public.form_responses
  for each row execute function public.log_form_save();

create or replace function public.log_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('flo.bulk_reset', true) = 'on' then
    return null;
  end if;
  -- Deleting a whole project cascades here; there is nothing left to log against.
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return null;
  end if;
  insert into public.activity_log (project_id, action, target, detail, on_behalf)
  values (
    coalesce(new.project_id, old.project_id),
    case when tg_op = 'INSERT' then 'upload_added' else 'upload_deleted' end,
    coalesce(new.file_name, new.link_url, old.file_name, old.link_url),
    jsonb_build_object('upload_id', coalesce(new.id, old.id), 'kind', coalesce(new.kind, old.kind),
                       'step_id', coalesce(new.project_step_id, old.project_step_id)),
    case when tg_op = 'INSERT' then new.on_behalf else public.is_admin() end
  );
  return null;
end;
$$;

drop trigger if exists log_upload on public.uploads;
create trigger log_upload
  after insert or delete on public.uploads
  for each row execute function public.log_upload();

-- Trigger functions are not meant to be called directly.
revoke all on function public.project_steps_sync_phase() from public, anon, authenticated;
revoke all on function public.log_step_toggle() from public, anon, authenticated;
revoke all on function public.log_phase_status() from public, anon, authenticated;
revoke all on function public.log_form_save() from public, anon, authenticated;
revoke all on function public.log_upload() from public, anon, authenticated;
revoke all on function public.step_label(uuid) from public, anon;
grant execute on function public.step_label(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Uploads: clients delete their own uploads until the step is done.
-- ---------------------------------------------------------------------------

create or replace function public.client_can_delete_upload(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_step_id is null or exists (
    select 1 from public.project_steps s
    where s.id = p_step_id and not s.done and s.project_id = public.my_project_id()
  );
$$;

revoke all on function public.client_can_delete_upload(uuid) from public, anon;
grant execute on function public.client_can_delete_upload(uuid) to authenticated;

drop policy if exists "client delete own uploads" on public.uploads;
create policy "client delete own uploads" on public.uploads
  for delete to authenticated
  using (
    project_id = (select public.my_project_id())
    and uploaded_by = auth.uid()
    and public.client_can_delete_upload(project_step_id)
  );

-- Storage paths are {project_id}/{step_id}/{file}. Clients delete their own
-- objects while that step is not done.
drop policy if exists "flo customer-uploads client delete" on storage.objects;
create policy "flo customer-uploads client delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = (select public.my_project_id())::text
    and owner_id = auth.uid()::text
    and exists (
      select 1 from public.project_steps s
      where s.id::text = (storage.foldername(name))[2] and not s.done
    )
  );

-- ---------------------------------------------------------------------------
-- reset_project_progress: admin only, requires the project code as confirmation.
-- Storage objects are removed by the caller through the Storage API first
-- (Supabase does not allow deleting storage objects from SQL).
-- ---------------------------------------------------------------------------

create or replace function public.reset_project_progress(p_project_id uuid, p_confirm_code text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proj public.projects;
  first_pos int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset a project' using errcode = '42501';
  end if;

  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then
    raise exception 'Project not found';
  end if;
  if proj.code <> lower(trim(coalesce(p_confirm_code, ''))) then
    raise exception 'The project code does not match' using errcode = '22023';
  end if;

  -- One log entry for the whole reset instead of one per step and phase.
  -- The flag is transaction-local (third argument true).
  perform set_config('flo.bulk_reset', 'on', true);

  update public.project_steps set done = false where project_id = p_project_id and done;
  delete from public.form_responses where project_id = p_project_id;
  delete from public.uploads where project_id = p_project_id;

  select min(position) into first_pos from public.project_phases where project_id = p_project_id;
  update public.project_phases
    set status = case when position = first_pos then 'active' else 'pending' end
    where project_id = p_project_id;

  perform set_config('flo.bulk_reset', 'off', true);

  insert into public.activity_log (project_id, action, target, detail)
  values (p_project_id, 'project_reset', proj.name, jsonb_build_object('code', proj.code));
end;
$$;

revoke all on function public.reset_project_progress(uuid, text) from public, anon;
grant execute on function public.reset_project_progress(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- project_overview: one row per project for the admin list.
-- security_invoker so RLS applies (clients only ever see their own row).
-- ---------------------------------------------------------------------------

create or replace view public.project_overview
with (security_invoker = true)
as
select
  p.id, p.code, p.name, p.csm_name, p.target_go_live, p.status, p.created_at,
  coalesce(st.total_steps, 0)   as total_steps,
  coalesce(st.done_steps, 0)    as done_steps,
  coalesce(st.client_open, 0)   as client_open,
  coalesce(st.flo_open, 0)      as flo_open,
  cur.position                   as current_phase_position,
  cur.name                       as current_phase_name
from public.projects p
left join lateral (
  select
    count(*)                                                    as total_steps,
    count(*) filter (where s.done)                              as done_steps,
    count(*) filter (where not s.done and s.owner = 'client' and ph.status <> 'complete') as client_open,
    count(*) filter (where not s.done and s.owner = 'flo' and ph.status <> 'complete')    as flo_open
  from public.project_steps s
  join public.project_phases ph on ph.id = s.project_phase_id
  where s.project_id = p.id
) st on true
left join lateral (
  select ph.position, ph.name from public.project_phases ph
  where ph.project_id = p.id and ph.status = 'active'
  order by ph.position limit 1
) cur on true;

revoke all on public.project_overview from anon;
grant select on public.project_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: stream changes for the open project (RLS still applies).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['project_steps', 'project_phases', 'form_responses', 'uploads'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
