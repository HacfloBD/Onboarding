-- 0006_phase_editor.sql
-- Admin-editable phase content: template versions, per-project editing with
-- archiving instead of deleting customer data, and template-to-project matching.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.project_steps  add column if not exists source_template_step_id uuid;
alter table public.project_steps  add column if not exists archived_at timestamptz;
alter table public.project_phases add column if not exists archived_at timestamptz;
alter table public.form_responses add column if not exists archived_at timestamptz;
alter table public.uploads        add column if not exists archived_at timestamptz;
alter table public.projects       add column if not exists template_version int;

-- Source ids are plain references (no FK): when a template phase or step is
-- deleted, the project keeps the id so "Apply latest template" can report it as removed.
alter table public.project_phases drop constraint if exists project_phases_source_template_phase_id_fkey;

create index if not exists project_steps_source_idx on public.project_steps (source_template_step_id);
create index if not exists project_phases_source_idx on public.project_phases (source_template_phase_id);

-- Link existing project steps to their template step (same phase source, position and text).
update public.project_steps ps
set source_template_step_id = ts.id
from public.project_phases pp, public.template_steps ts
where ps.project_phase_id = pp.id
  and ts.template_phase_id = pp.source_template_phase_id
  and ts.position = ps.position
  and ts.text = ps.text
  and ps.source_template_step_id is null;

-- ---------------------------------------------------------------------------
-- Template versions
-- ---------------------------------------------------------------------------

create table if not exists public.template_versions (
  id              uuid primary key default gen_random_uuid(),
  version_number  int not null unique,
  snapshot        jsonb not null,
  note            text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.template_versions enable row level security;
revoke all on public.template_versions from anon;
drop policy if exists "admin all" on public.template_versions;
create policy "admin all" on public.template_versions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The current master template as one JSON document.
create or replace function public.template_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('phases', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id, 'position', p.position, 'name', p.name, 'short', p.short, 'owner', p.owner,
      'duration', p.duration, 'description', p.description, 'completion_message', p.completion_message,
      'steps', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'position', s.position, 'text', s.text, 'owner', s.owner,
          'type', s.type, 'detail', s.detail, 'config', s.config
        ) order by s.position, s.created_at), '[]'::jsonb)
        from public.template_steps s where s.template_phase_id = p.id
      )
    ) order by p.position), '[]'::jsonb))
  from public.template_phases p;
$$;

-- Version 1 = the template as seeded from the manual.
insert into public.template_versions (version_number, snapshot, note)
select 1, public.template_snapshot(), 'Initial template from the User Manual v2'
where not exists (select 1 from public.template_versions)
  and exists (select 1 from public.template_phases);

-- ---------------------------------------------------------------------------
-- save_template: replace the master template with p_phases (keeping ids so
-- projects can be matched later) and record a new version. Returns the version.
-- ---------------------------------------------------------------------------

create or replace function public.save_template(p_phases jsonb, p_note text default null)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ph jsonb;
  st jsonb;
  pi int := 0;
  si int;
  phase_ids uuid[] := '{}';
  step_ids uuid[] := '{}';
  v int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit the template' using errcode = '42501';
  end if;
  if jsonb_typeof(p_phases) is distinct from 'array' then
    raise exception 'Invalid template' using errcode = '22023';
  end if;

  for ph in select value from jsonb_array_elements(p_phases) loop
    phase_ids := phase_ids || (ph ->> 'id')::uuid;
    for st in select value from jsonb_array_elements(coalesce(ph -> 'steps', '[]'::jsonb)) loop
      step_ids := step_ids || (st ->> 'id')::uuid;
    end loop;
  end loop;

  delete from public.template_steps where not (id = any (step_ids));

  for ph in select value from jsonb_array_elements(p_phases) loop
    pi := pi + 1;
    insert into public.template_phases (id, position, name, short, owner, duration, description, completion_message)
    values ((ph ->> 'id')::uuid, pi, trim(ph ->> 'name'), nullif(trim(coalesce(ph ->> 'short', '')), ''), ph ->> 'owner',
            nullif(trim(coalesce(ph ->> 'duration', '')), ''), ph ->> 'description', ph ->> 'completion_message')
    on conflict (id) do update set
      position = excluded.position, name = excluded.name, short = excluded.short, owner = excluded.owner,
      duration = excluded.duration, description = excluded.description, completion_message = excluded.completion_message;

    si := 0;
    for st in select value from jsonb_array_elements(coalesce(ph -> 'steps', '[]'::jsonb)) loop
      si := si + 1;
      insert into public.template_steps (id, template_phase_id, position, text, owner, type, detail, config)
      values ((st ->> 'id')::uuid, (ph ->> 'id')::uuid, si, trim(st ->> 'text'), st ->> 'owner',
              coalesce(nullif(st ->> 'type', ''), 'none'), st ->> 'detail', coalesce(st -> 'config', '{}'::jsonb))
      on conflict (id) do update set
        template_phase_id = excluded.template_phase_id, position = excluded.position, text = excluded.text,
        owner = excluded.owner, type = excluded.type, detail = excluded.detail, config = excluded.config;
    end loop;
  end loop;

  delete from public.template_phases where not (id = any (phase_ids));

  select coalesce(max(version_number), 0) + 1 into v from public.template_versions;
  insert into public.template_versions (version_number, snapshot, note, created_by)
  values (v, public.template_snapshot(), nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  insert into public.activity_log (project_id, action, target, detail)
  values (null, 'template_saved', 'Template version ' || v,
          jsonb_build_object('version', v, 'note', p_note, 'phases', pi, 'steps', coalesce(array_length(step_ids, 1), 0)));
  return v;
end;
$$;

create or replace function public.restore_template_version(p_version int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snap jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit the template' using errcode = '42501';
  end if;
  select snapshot into snap from public.template_versions where version_number = p_version;
  if snap is null then
    raise exception 'Version % not found', p_version;
  end if;
  return public.save_template(snap -> 'phases', 'Restored version ' || p_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- save_project_phases: replace one project's phases/steps with p_phases.
--   * existing ids are updated (done flags and phase status are never touched here)
--   * new ids are inserted (new phases start 'pending')
--   * removed steps that are done or have form data/uploads are ARCHIVED with
--     their data; removed steps without data are deleted
--   * removed phases that still hold archived steps are archived, else deleted
-- ---------------------------------------------------------------------------

create or replace function public.save_project_phases(
  p_project_id uuid,
  p_phases jsonb,
  p_note text default null,
  p_action text default 'phases_edited',
  p_template_version int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ph jsonb;
  st jsonb;
  r record;
  pi int := 0;
  si int;
  phase_ids uuid[] := '{}';
  step_ids uuid[] := '{}';
  n_archived int := 0;
  n_deleted int := 0;
  n_phase_archived int := 0;
  summary jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit project phases' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;
  if jsonb_typeof(p_phases) is distinct from 'array' then
    raise exception 'Invalid phases' using errcode = '22023';
  end if;

  for ph in select value from jsonb_array_elements(p_phases) loop
    phase_ids := phase_ids || (ph ->> 'id')::uuid;
    for st in select value from jsonb_array_elements(coalesce(ph -> 'steps', '[]'::jsonb)) loop
      step_ids := step_ids || (st ->> 'id')::uuid;
    end loop;
  end loop;

  -- Ids that already exist must belong to this project.
  if exists (select 1 from public.project_steps where id = any (step_ids) and project_id <> p_project_id)
     or exists (select 1 from public.project_phases where id = any (phase_ids) and project_id <> p_project_id) then
    raise exception 'A phase or step belongs to another project' using errcode = '42501';
  end if;

  -- Removed steps: archive when they hold customer progress or data.
  for r in
    select s.id, s.done from public.project_steps s
    where s.project_id = p_project_id and s.archived_at is null and not (s.id = any (step_ids))
  loop
    if r.done
       or exists (select 1 from public.form_responses f where f.project_step_id = r.id and f.archived_at is null)
       or exists (select 1 from public.uploads u where u.project_step_id = r.id and u.archived_at is null) then
      update public.project_steps set archived_at = now() where id = r.id;
      update public.form_responses set archived_at = now() where project_step_id = r.id and archived_at is null;
      update public.uploads set archived_at = now() where project_step_id = r.id and archived_at is null;
      n_archived := n_archived + 1;
    else
      delete from public.project_steps where id = r.id;
      n_deleted := n_deleted + 1;
    end if;
  end loop;

  for ph in select value from jsonb_array_elements(p_phases) loop
    pi := pi + 1;
    insert into public.project_phases (
      id, project_id, position, name, short, owner, duration, description, completion_message,
      status, source_template_phase_id
    ) values (
      (ph ->> 'id')::uuid, p_project_id, pi, trim(ph ->> 'name'), nullif(trim(coalesce(ph ->> 'short', '')), ''),
      ph ->> 'owner', nullif(trim(coalesce(ph ->> 'duration', '')), ''), ph ->> 'description', ph ->> 'completion_message',
      coalesce(nullif(ph ->> 'status', ''), 'pending'), nullif(ph ->> 'source_template_phase_id', '')::uuid
    )
    on conflict (id) do update set
      position = excluded.position, name = excluded.name, short = excluded.short, owner = excluded.owner,
      duration = excluded.duration, description = excluded.description,
      completion_message = excluded.completion_message,
      source_template_phase_id = excluded.source_template_phase_id,
      archived_at = null;

    si := 0;
    for st in select value from jsonb_array_elements(coalesce(ph -> 'steps', '[]'::jsonb)) loop
      si := si + 1;
      insert into public.project_steps (
        id, project_id, project_phase_id, position, text, owner, type, detail, config, source_template_step_id
      ) values (
        (st ->> 'id')::uuid, p_project_id, (ph ->> 'id')::uuid, si, trim(st ->> 'text'), st ->> 'owner',
        coalesce(nullif(st ->> 'type', ''), 'none'), st ->> 'detail', coalesce(st -> 'config', '{}'::jsonb),
        nullif(st ->> 'source_template_step_id', '')::uuid
      )
      on conflict (id) do update set
        project_phase_id = excluded.project_phase_id, position = excluded.position, text = excluded.text,
        owner = excluded.owner, type = excluded.type, detail = excluded.detail, config = excluded.config,
        source_template_step_id = excluded.source_template_step_id;
    end loop;
  end loop;

  -- Removed phases.
  for r in
    select p.id from public.project_phases p
    where p.project_id = p_project_id and p.archived_at is null and not (p.id = any (phase_ids))
  loop
    if exists (select 1 from public.project_steps s where s.project_phase_id = r.id) then
      update public.project_phases set archived_at = now() where id = r.id;
      n_phase_archived := n_phase_archived + 1;
    else
      delete from public.project_phases where id = r.id;
    end if;
  end loop;

  if p_template_version is not null then
    update public.projects set template_version = p_template_version where id = p_project_id;
  end if;

  summary := jsonb_build_object(
    'phases', pi, 'steps', coalesce(array_length(step_ids, 1), 0),
    'steps_archived', n_archived, 'steps_deleted', n_deleted, 'phases_archived', n_phase_archived,
    'note', p_note, 'template_version', p_template_version
  );

  insert into public.activity_log (project_id, action, target, detail)
  values (p_project_id, coalesce(p_action, 'phases_edited'), coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Phases edited'), summary);

  return summary;
end;
$$;

revoke all on function public.template_snapshot() from public, anon;
revoke all on function public.save_template(jsonb, text) from public, anon;
revoke all on function public.restore_template_version(int) from public, anon;
revoke all on function public.save_project_phases(uuid, jsonb, text, text, int) from public, anon;
grant execute on function public.template_snapshot() to authenticated;
grant execute on function public.save_template(jsonb, text) to authenticated;
grant execute on function public.restore_template_version(int) to authenticated;
grant execute on function public.save_project_phases(uuid, jsonb, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- New projects record their template source ids and version.
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

  insert into public.projects (name, code, csm_name, target_go_live, created_by, template_version)
  values (trim(p_name), nullif(trim(coalesce(p_code, '')), ''), nullif(trim(coalesce(p_csm_name, '')), ''),
          p_target_go_live, auth.uid(), (select max(version_number) from public.template_versions))
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

    insert into public.project_steps (project_id, project_phase_id, position, text, owner, type, detail, config, source_template_step_id)
    select proj.id, new_phase_id, ts.position, ts.text, ts.owner, ts.type, ts.detail, ts.config, ts.id
    from public.template_steps ts
    where ts.template_phase_id = tp.id
    order by ts.position;
  end loop;

  insert into public.activity_log (project_id, action, target, detail)
  values (proj.id, 'project_created', proj.name, jsonb_build_object('code', proj.code, 'template_version', proj.template_version));

  return proj;
end;
$$;

-- ---------------------------------------------------------------------------
-- Archived rows are invisible to customers and ignored by progress logic.
-- ---------------------------------------------------------------------------

drop policy if exists "client read own phases" on public.project_phases;
create policy "client read own phases" on public.project_phases
  for select to authenticated
  using (project_id = (select public.my_project_id()) and archived_at is null);

drop policy if exists "client read own steps" on public.project_steps;
create policy "client read own steps" on public.project_steps
  for select to authenticated
  using (project_id = (select public.my_project_id()) and archived_at is null);

drop policy if exists "client toggle own steps" on public.project_steps;
create policy "client toggle own steps" on public.project_steps
  for update to authenticated
  using (project_id = (select public.my_project_id()) and owner in ('client', 'both') and archived_at is null)
  with check (project_id = (select public.my_project_id()) and owner in ('client', 'both') and archived_at is null);

drop policy if exists "client read own forms" on public.form_responses;
create policy "client read own forms" on public.form_responses
  for select to authenticated
  using (project_id = (select public.my_project_id()) and archived_at is null);

drop policy if exists "client update own forms" on public.form_responses;
create policy "client update own forms" on public.form_responses
  for update to authenticated
  using (project_id = (select public.my_project_id()) and archived_at is null)
  with check (project_id = (select public.my_project_id()) and archived_at is null);

drop policy if exists "client insert own forms" on public.form_responses;
create policy "client insert own forms" on public.form_responses
  for insert to authenticated
  with check (
    project_id = (select public.my_project_id())
    and archived_at is null
    and exists (
      select 1 from public.project_steps s
      where s.id = project_step_id and s.project_id = form_responses.project_id and s.archived_at is null
    )
  );

drop policy if exists "client read own uploads" on public.uploads;
create policy "client read own uploads" on public.uploads
  for select to authenticated
  using (project_id = (select public.my_project_id()) and archived_at is null);

drop policy if exists "client insert own uploads" on public.uploads;
create policy "client insert own uploads" on public.uploads
  for insert to authenticated
  with check (
    project_id = (select public.my_project_id())
    and archived_at is null
    and (
      project_step_id is null or exists (
        select 1 from public.project_steps s
        where s.id = project_step_id and s.project_id = uploads.project_id and s.archived_at is null
      )
    )
  );

create or replace function public.client_can_delete_upload(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_step_id is null or exists (
    select 1 from public.project_steps s
    where s.id = p_step_id and not s.done and s.archived_at is null and s.project_id = public.my_project_id()
  );
$$;

drop policy if exists "client delete own uploads" on public.uploads;
create policy "client delete own uploads" on public.uploads
  for delete to authenticated
  using (
    project_id = (select public.my_project_id())
    and uploaded_by = auth.uid()
    and archived_at is null
    and public.client_can_delete_upload(project_step_id)
  );

-- Phase completion ignores archived steps. A phase with no steps never
-- auto-completes; the admin sets its status by hand.
create or replace function public.project_steps_sync_phase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ph public.project_phases;
  total int;
  remaining int;
begin
  if current_setting('flo.bulk_reset', true) = 'on' then
    return null;
  end if;
  select * into ph from public.project_phases where id = new.project_phase_id;
  select count(*), count(*) filter (where not done) into total, remaining
    from public.project_steps
    where project_phase_id = new.project_phase_id and archived_at is null;

  if total = 0 then
    return null;
  end if;

  if remaining = 0 then
    if ph.status <> 'complete' then
      update public.project_phases set status = 'complete' where id = ph.id;
      update public.project_phases set status = 'active'
        where id = (
          select id from public.project_phases
          where project_id = ph.project_id and position > ph.position and archived_at is null
          order by position limit 1
        ) and status = 'pending';
    end if;
  elsif ph.status <> 'active' then
    update public.project_phases set status = 'active' where id = ph.id;
  end if;

  return null;
end;
$$;

-- Labels come from order, never stored: phase rank among live phases + step letter.
create or replace function public.step_label(p_step_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with st as (select project_id, project_phase_id from public.project_steps where id = p_step_id),
  phases as (
    select p.id, row_number() over (order by p.position, p.created_at) as n
    from public.project_phases p, st
    where p.project_id = st.project_id and (p.archived_at is null or p.id = st.project_phase_id)
  ),
  steps as (
    select s.id, row_number() over (order by s.position, s.created_at) as n
    from public.project_steps s, st
    where s.project_phase_id = st.project_phase_id and (s.archived_at is null or s.id = p_step_id)
  )
  select phases.n::text || chr(96 + steps.n::int)
  from phases, steps, st
  where phases.id = st.project_phase_id and steps.id = p_step_id;
$$;

-- Admin project list ignores archived rows.
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
  where s.project_id = p.id and s.archived_at is null and ph.archived_at is null
) st on true
left join lateral (
  select n.rank::int as position, n.name from (
    select ph.name, ph.status, row_number() over (order by ph.position, ph.created_at) as rank
    from public.project_phases ph
    where ph.project_id = p.id and ph.archived_at is null
  ) n
  where n.status = 'active'
  order by n.rank limit 1
) cur on true;

grant select on public.project_overview to authenticated;

-- Reset activates the first live (non-archived) phase.
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

  select min(position) into first_pos from public.project_phases where project_id = p_project_id and archived_at is null;
  update public.project_phases
    set status = case when position = first_pos then 'active' else 'pending' end
    where project_id = p_project_id and archived_at is null;

  perform set_config('flo.bulk_reset', 'off', true);

  insert into public.activity_log (project_id, action, target, detail)
  values (p_project_id, 'project_reset', proj.name, jsonb_build_object('code', proj.code));
end;
$$;

