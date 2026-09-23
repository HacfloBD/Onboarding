-- 0002_rls.sql
-- Row-level security, helper functions and guard triggers.
--
-- Model:
--   admin (FLO staff, CSM included): full read/write on everything.
--   client roles (client_lead, client_it, utility_staff): their own project only.
--   anon: nothing.
-- Requests made with the service_role key (Netlify Functions) bypass RLS.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so they can read profiles without recursing into
-- profiles' own policies. Fixed empty search_path; every name is qualified.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin' and p.active
  );
$$;

create or replace function public.my_project_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.project_id from public.profiles p
  where p.user_id = auth.uid() and p.active and p.role <> 'admin';
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.active;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_project_id() from public, anon;
revoke all on function public.my_role() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.my_project_id() to authenticated, service_role;
grant execute on function public.my_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guard triggers. auth.uid() is null for service_role and SQL editor sessions,
-- which are trusted and skip these checks.
-- ---------------------------------------------------------------------------

-- Nobody changes their own role, project or active flag.
-- Non-admins can only change their own full_name.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;

  if new.user_id = auth.uid() and (
       new.role is distinct from old.role or
       new.project_id is distinct from old.project_id or
       new.active is distinct from old.active) then
    raise exception 'You cannot change your own role, project or active status' using errcode = '42501';
  end if;

  if not public.is_admin() and (
       new.email is distinct from old.email or
       new.role is distinct from old.role or
       new.project_id is distinct from old.project_id or
       new.active is distinct from old.active) then
    raise exception 'Only admins can change email, role, project or active status' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Clients may only flip "done". Completion stamps are always set server-side.
create or replace function public.project_steps_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  admin boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  admin := public.is_admin();

  if not admin and (
       new.project_id, new.project_phase_id, new.position, new.text, new.owner,
       new.type, new.detail, new.config
     ) is distinct from (
       old.project_id, old.project_phase_id, old.position, old.text, old.owner,
       old.type, old.detail, old.config
     ) then
    raise exception 'Only the done flag can be changed' using errcode = '42501';
  end if;

  if new.done is distinct from old.done then
    if new.done then
      new.completed_by := auth.uid();
      new.completed_at := now();
      new.completed_on_behalf := admin and new.owner <> 'flo';
    else
      new.completed_by := null;
      new.completed_at := null;
      new.completed_on_behalf := false;
    end if;
  elsif not admin then
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
    new.completed_on_behalf := old.completed_on_behalf;
  end if;

  return new;
end;
$$;

drop trigger if exists project_steps_guard on public.project_steps;
create trigger project_steps_guard
  before update on public.project_steps
  for each row execute function public.project_steps_guard();

-- Stamp who edited a form and whether it was an admin acting for the customer.
create or replace function public.form_responses_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and not public.is_admin() then
    new.project_id := old.project_id;
    new.project_step_id := old.project_step_id;
  end if;
  new.updated_by := auth.uid();
  new.last_edit_on_behalf := public.is_admin();
  return new;
end;
$$;

drop trigger if exists form_responses_stamp on public.form_responses;
create trigger form_responses_stamp
  before insert or update on public.form_responses
  for each row execute function public.form_responses_stamp();

create or replace function public.uploads_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.uploaded_by := auth.uid();
  new.on_behalf := public.is_admin();
  return new;
end;
$$;

drop trigger if exists uploads_stamp on public.uploads;
create trigger uploads_stamp
  before insert on public.uploads
  for each row execute function public.uploads_stamp();

-- Non-admins cannot spoof the actor of a log entry.
create or replace function public.activity_log_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then
    new.actor_id := coalesce(new.actor_id, auth.uid());
    new.actor_role := coalesce(new.actor_role, 'admin');
  else
    new.actor_id := auth.uid();
    new.actor_role := public.my_role();
    new.on_behalf := false;
  end if;
  return new;
end;
$$;

drop trigger if exists activity_log_stamp on public.activity_log;
create trigger activity_log_stamp
  before insert on public.activity_log
  for each row execute function public.activity_log_stamp();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere and shut out anon.
-- ---------------------------------------------------------------------------

alter table public.projects        enable row level security;
alter table public.profiles        enable row level security;
alter table public.template_phases enable row level security;
alter table public.template_steps  enable row level security;
alter table public.project_phases  enable row level security;
alter table public.project_steps   enable row level security;
alter table public.form_responses  enable row level security;
alter table public.uploads         enable row level security;
alter table public.activity_log    enable row level security;
alter table public.app_settings    enable row level security;

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Admin: full access on every table.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'profiles', 'template_phases', 'template_steps', 'project_phases',
    'project_steps', 'form_responses', 'uploads', 'activity_log', 'app_settings'
  ] loop
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format(
      'create policy "admin all" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client roles: own project only.
-- ---------------------------------------------------------------------------

-- projects
drop policy if exists "client read own project" on public.projects;
create policy "client read own project" on public.projects
  for select to authenticated
  using (id = (select public.my_project_id()));

-- profiles: yourself, plus people in your project
drop policy if exists "read self or same project" on public.profiles;
create policy "read self or same project" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or project_id = (select public.my_project_id()));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- project_phases
drop policy if exists "client read own phases" on public.project_phases;
create policy "client read own phases" on public.project_phases
  for select to authenticated
  using (project_id = (select public.my_project_id()));

-- project_steps
drop policy if exists "client read own steps" on public.project_steps;
create policy "client read own steps" on public.project_steps
  for select to authenticated
  using (project_id = (select public.my_project_id()));

drop policy if exists "client toggle own steps" on public.project_steps;
create policy "client toggle own steps" on public.project_steps
  for update to authenticated
  using (project_id = (select public.my_project_id()) and owner in ('client', 'both'))
  with check (project_id = (select public.my_project_id()) and owner in ('client', 'both'));

-- form_responses
drop policy if exists "client read own forms" on public.form_responses;
create policy "client read own forms" on public.form_responses
  for select to authenticated
  using (project_id = (select public.my_project_id()));

drop policy if exists "client insert own forms" on public.form_responses;
create policy "client insert own forms" on public.form_responses
  for insert to authenticated
  with check (
    project_id = (select public.my_project_id())
    and exists (
      select 1 from public.project_steps s
      where s.id = project_step_id and s.project_id = form_responses.project_id
    )
  );

drop policy if exists "client update own forms" on public.form_responses;
create policy "client update own forms" on public.form_responses
  for update to authenticated
  using (project_id = (select public.my_project_id()))
  with check (project_id = (select public.my_project_id()));

-- uploads
drop policy if exists "client read own uploads" on public.uploads;
create policy "client read own uploads" on public.uploads
  for select to authenticated
  using (project_id = (select public.my_project_id()));

drop policy if exists "client insert own uploads" on public.uploads;
create policy "client insert own uploads" on public.uploads
  for insert to authenticated
  with check (
    project_id = (select public.my_project_id())
    and (
      project_step_id is null or exists (
        select 1 from public.project_steps s
        where s.id = project_step_id and s.project_id = uploads.project_id
      )
    )
  );

-- activity_log: read own project, append only
drop policy if exists "client read own activity" on public.activity_log;
create policy "client read own activity" on public.activity_log
  for select to authenticated
  using (project_id = (select public.my_project_id()));

drop policy if exists "client append own activity" on public.activity_log;
create policy "client append own activity" on public.activity_log
  for insert to authenticated
  with check (project_id = (select public.my_project_id()));

-- app_settings: readable by any signed-in user with an active profile
drop policy if exists "signed-in read settings" on public.app_settings;
create policy "signed-in read settings" on public.app_settings
  for select to authenticated
  using ((select public.my_role()) is not null);

-- template_phases / template_steps: admin only (covered by "admin all").
