-- setup.sql
-- FLO Onboarding Portal: complete database setup. Paste into the Supabase SQL editor and click Run.
-- This is supabase/migrations/0001..0008 combined, in order. Safe to run more than once.
-- Do not edit by hand: edit the migrations and re-combine them.

-- ===========================================================================
-- 0001_schema.sql
-- ===========================================================================

-- 0001_schema.sql
-- FLO Onboarding Portal: core tables, constraints and triggers.
-- Run in the Supabase SQL editor (or use supabase/setup.sql, which combines all migrations).

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "City of Springfield" -> "city-of-springfield"
create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique
                  check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null check (length(trim(name)) > 0),
  csm_name        text,
  target_go_live  date,
  status          text not null default 'active' check (status in ('active', 'archived')),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Default the code to a unique slug of the corporate name when none is given.
create or replace function public.projects_default_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if new.code is null or trim(new.code) = '' then
    base := public.slugify(new.name);
    if base = '' then
      base := 'project';
    end if;
    candidate := base;
    while exists (select 1 from public.projects p where p.code = candidate and p.id <> new.id) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.code := candidate;
  else
    new.code := public.slugify(new.code);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_default_code on public.projects;
create trigger projects_default_code
  before insert or update of code, name on public.projects
  for each row execute function public.projects_default_code();

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles (one row per auth user)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique check (email = lower(email)),
  full_name   text not null default '',
  role        text not null check (role in ('admin', 'client_lead', 'client_it', 'utility_staff')),
  project_id  uuid references public.projects (id) on delete restrict,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Admins belong to no project; every client role belongs to exactly one.
  constraint profiles_role_project check (
    (role = 'admin' and project_id is null) or
    (role <> 'admin' and project_id is not null)
  )
);

create index if not exists profiles_project_id_idx on public.profiles (project_id);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Master phase template
-- ---------------------------------------------------------------------------

create table if not exists public.template_phases (
  id                  uuid primary key default gen_random_uuid(),
  position            int not null,
  name                text not null,
  short               text,
  owner               text not null check (owner in ('client', 'flo', 'both')),
  duration            text,
  description         text,
  completion_message  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists template_phases_updated_at on public.template_phases;
create trigger template_phases_updated_at
  before update on public.template_phases
  for each row execute function public.set_updated_at();

create table if not exists public.template_steps (
  id                 uuid primary key default gen_random_uuid(),
  template_phase_id  uuid not null references public.template_phases (id) on delete cascade,
  position           int not null,
  text               text not null,
  owner              text not null check (owner in ('client', 'flo', 'both')),
  type               text not null default 'none' check (type in (
                       'none', 'form_org_details', 'form_schedule_session', 'form_frequency',
                       'upload_files', 'form_api_integration', 'form_branding')),
  detail             text,
  config             jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists template_steps_phase_idx on public.template_steps (template_phase_id);

drop trigger if exists template_steps_updated_at on public.template_steps;
create trigger template_steps_updated_at
  before update on public.template_steps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-project copies of the template
-- ---------------------------------------------------------------------------

create table if not exists public.project_phases (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects (id) on delete cascade,
  position                  int not null,
  name                      text not null,
  short                     text,
  owner                     text not null check (owner in ('client', 'flo', 'both')),
  duration                  text,
  description               text,
  completion_message        text,
  status                    text not null default 'pending' check (status in ('pending', 'active', 'complete')),
  source_template_phase_id  uuid references public.template_phases (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists project_phases_project_idx on public.project_phases (project_id);

drop trigger if exists project_phases_updated_at on public.project_phases;
create trigger project_phases_updated_at
  before update on public.project_phases
  for each row execute function public.set_updated_at();

create table if not exists public.project_steps (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  project_phase_id     uuid not null references public.project_phases (id) on delete cascade,
  position             int not null,
  text                 text not null,
  owner                text not null check (owner in ('client', 'flo', 'both')),
  type                 text not null default 'none' check (type in (
                         'none', 'form_org_details', 'form_schedule_session', 'form_frequency',
                         'upload_files', 'form_api_integration', 'form_branding')),
  detail               text,
  config               jsonb not null default '{}'::jsonb,
  done                 boolean not null default false,
  completed_by         uuid references auth.users (id) on delete set null,
  completed_at         timestamptz,
  completed_on_behalf  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists project_steps_project_idx on public.project_steps (project_id);
create index if not exists project_steps_phase_idx on public.project_steps (project_phase_id);

drop trigger if exists project_steps_updated_at on public.project_steps;
create trigger project_steps_updated_at
  before update on public.project_steps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Customer submissions
-- ---------------------------------------------------------------------------

create table if not exists public.form_responses (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  project_step_id      uuid not null unique references public.project_steps (id) on delete cascade,
  form_type            text not null,
  data                 jsonb not null default '{}'::jsonb,
  updated_by           uuid references auth.users (id) on delete set null,
  last_edit_on_behalf  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists form_responses_project_idx on public.form_responses (project_id);

drop trigger if exists form_responses_updated_at on public.form_responses;
create trigger form_responses_updated_at
  before update on public.form_responses
  for each row execute function public.set_updated_at();

create table if not exists public.uploads (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  project_step_id  uuid references public.project_steps (id) on delete set null,
  kind             text not null check (kind in ('file', 'link')),
  storage_path     text,
  file_name        text,
  size_bytes       bigint,
  link_url         text,
  uploaded_by      uuid references auth.users (id) on delete set null,
  on_behalf        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uploads_kind_fields check (
    (kind = 'file' and storage_path is not null) or
    (kind = 'link' and link_url is not null)
  ),
  -- Files must live in the project's own storage folder.
  constraint uploads_storage_path_project check (
    storage_path is null or storage_path like project_id::text || '/%'
  )
);

create index if not exists uploads_project_idx on public.uploads (project_id);

drop trigger if exists uploads_updated_at on public.uploads;
create trigger uploads_updated_at
  before update on public.uploads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log (append-only for non-admins, enforced by RLS in 0002)
-- ---------------------------------------------------------------------------

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_role  text,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}'::jsonb,
  on_behalf   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists activity_log_project_idx on public.activity_log (project_id, created_at desc);

drop trigger if exists activity_log_updated_at on public.activity_log;
create trigger activity_log_updated_at
  before update on public.activity_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- App-wide settings (key/value)
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 0002_rls.sql
-- ===========================================================================

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

-- ===========================================================================
-- 0003_storage.sql
-- ===========================================================================

-- 0003_storage.sql
-- Storage buckets and policies.
--   customer-uploads (private): files live under {project_id}/...
--     clients read and upload in their own project folder; admins everything.
--   resources (public read): manual PDF, master template. Admin write only.

insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-uploads', 'customer-uploads', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public)
values ('resources', 'resources', true)
on conflict (id) do update set public = true;

drop policy if exists "flo customer-uploads client read" on storage.objects;
create policy "flo customer-uploads client read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = (select public.my_project_id())::text
  );

drop policy if exists "flo customer-uploads client insert" on storage.objects;
create policy "flo customer-uploads client insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = (select public.my_project_id())::text
  );

drop policy if exists "flo admin all" on storage.objects;
create policy "flo admin all" on storage.objects
  for all to authenticated
  using (bucket_id in ('customer-uploads', 'resources') and (select public.is_admin()))
  with check (bucket_id in ('customer-uploads', 'resources') and (select public.is_admin()));

drop policy if exists "flo resources public read" on storage.objects;
create policy "flo resources public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'resources');

-- ===========================================================================
-- 0004_seed.sql
-- ===========================================================================

-- 0004_seed.sql
-- Master phase template (5 phases from the FLO Onboarding User Manual v2)
-- generated from supabase/seed/phase-template.json, plus default app_settings.
-- Seeds the template only when it is empty, so re-running is safe.

do $seed$
begin
  if exists (select 1 from public.template_phases) then
    raise notice 'template_phases already seeded, skipping';
    return;
  end if;

  -- Phase 1: Pre-Onboarding Assessment & Kick-off
  with ph as (
    insert into public.template_phases (position, name, short, owner, duration, description, completion_message)
    values (1, 'Pre-Onboarding Assessment & Kick-off', 'Kick-off', 'both', 'Week 1',
            'Phase 1 sets the foundation. Instead of asking you to fill out reams of paperwork, FLO comes to you. We walk through the 6 Pillars of Cross-Connection Control compliance together (Legal Foundation, Discovery, Protection, Testing, Remediation, Inspection Continuity), document where your program stands, and use that picture to configure FLO around your reality. This phase is conversational. No data uploads are required.',
            'Great start! Your kick-off information is in and your 6-Pillar assessment is documented. Next: send us your data in Phase 2, in whatever format you have.')
    returning id
  )
  insert into public.template_steps (template_phase_id, position, text, owner, type, detail, config)
  select ph.id, v.position, v.text, v.owner, v.type, v.detail, v.config::jsonb
  from ph, (values
    (1, 'Provide your organization details', 'client', 'form_org_details',
     'Capture the basics: organization name, service area, state, project lead contact info, IT contact, approximate counts of facilities and tester companies, current legacy system, and team roles. Auto-saves as you type. Takes about 5 minutes.',
     '{}'),
    (2, 'Schedule your 6-Pillar assessment session', 'client', 'form_schedule_session',
     'Pick a preferred date and time, and choose in-person (HAC Texas comes to you) or virtual (Teams or Zoom). The session is 1 to 2 hours and walks through each pillar with your CSM and an HAC Texas expert. Prefer to look first on your own? Use the CCC Compliance Assessment tool linked below; it covers the same 6 pillars and produces a score with recommendations. Bring the results to your CSM session.',
     '{"self_service_link_setting": "ccc_assessment_url", "self_service_link_label": "Open the CCC Compliance Assessment tool"}'),
    (3, 'Confirm your testing frequency model', 'client', 'form_frequency',
     'How does your jurisdiction determine when backflow assemblies are due for testing? Select a model and cite the state or local code that drives your choice.',
     '{"options": [{"value": "calendar_year", "label": "Calendar Year", "help": "All assemblies due by December 31. Compliance clock resets January 1. Creates year-end workload concentration."}, {"value": "rolling_12", "label": "Rolling 12 Months", "help": "Each assembly due 12 months from its last passing test. Spreads workload evenly throughout the year."}, {"value": "fixed_anniversary", "label": "Fixed Anniversary", "help": "Each assembly due on the same date each year, anchored to installation or first test date."}, {"value": "custom", "label": "Custom / Hybrid", "help": "Different frequencies for different assembly types or hazard levels (e.g., RP every 6 months, DC annually)."}, {"value": "not_sure", "label": "Not sure", "help": "Pick this if you want your CSM to help you decide based on your jurisdiction and ordinance."}]}'),
    (4, 'FLO documents the assessment and prepares the migration plan', 'flo', 'none',
     'Your CSM compiles the assessment notes, identifies data gaps, and prepares a migration plan tailored to what you have.',
     '{}')
  ) as v(position, text, owner, type, detail, config);

  -- Phase 2: Data Collection & Migration
  with ph as (
    insert into public.template_phases (position, name, short, owner, duration, description, completion_message)
    values (2, 'Data Collection & Migration', 'Data', 'both', '1-3 Weeks',
            'This is where your data moves into FLO. You do not need to format your data into our template unless you want to. FLO does the cleanup, normalization, and migration regardless of how the data arrives.',
            'Your data is migrated and signed off! Next: a half-day joint setup session to configure branding, notices, and compliance rules.')
    returning id
  )
  insert into public.template_steps (template_phase_id, position, text, owner, type, detail, config)
  select ph.id, v.position, v.text, v.owner, v.type, v.detail, v.config::jsonb
  from ph, (values
    (1, 'Send us your data', 'client', 'upload_files',
     'Option A: send what you have. Drop any files into the upload area: Excel, CSV, exports from your old system, scanned documents, anything. Option B: use our master template (8 tabs covering facilities, contacts, assemblies, testers, test history, surveys), fill it in offline, and upload it back. Or paste a Google Drive, SharePoint, or Dropbox link that gives view access to your CSM. Most customers find Option A faster.',
     '{"show_master_template_download": true, "allow_share_link": true, "accept": "*", "max_files": 10}'),
    (2, 'Optional: API integration with your billing system', 'client', 'form_api_integration',
     'Want FLO to integrate with your utility billing system for automatic customer updates (addresses, ownership changes, account status)? Tell us here. Most customers skip this at launch and revisit it later.',
     '{}'),
    (3, 'FLO cleans, deduplicates, and migrates your data', 'flo', 'none',
     'We parse your files, normalize formats (addresses, phone numbers, dates), match facilities by address, link assemblies to facilities, and import everything into a staging environment. If we have questions, your CSM will reach out.',
     '{}'),
    (4, 'Review your data in staging', 'both', 'none',
     'Your CSM walks you through the imported data on a call. Spot-check facilities, assemblies, contacts, and test history. Flag anything that looks wrong.',
     '{}'),
    (5, 'Sign off on migrated data', 'client', 'none',
     'Confirm the data in staging is accurate. This is the green light to proceed with platform setup.',
     '{}')
  ) as v(position, text, owner, type, detail, config);

  -- Phase 3: Setup & Configuration
  with ph as (
    insert into public.template_phases (position, name, short, owner, duration, description, completion_message)
    values (3, 'Setup & Configuration', 'Setup', 'both', 'Half Day (Joint Session)',
            'A single half-day working session where FLO and your team configure the platform together. Notice templates, branding, compliance rules, and notification automation all happen in one sitting. The goal is for you to learn how to make changes yourself, so you are not dependent on FLO for routine adjustments later.',
            'Setup complete! Next: training for your admins and staff.')
    returning id
  )
  insert into public.template_steps (template_phase_id, position, text, owner, type, detail, config)
  select ph.id, v.position, v.text, v.owner, v.type, v.detail, v.config::jsonb
  from ph, (values
    (1, 'Provide your branding', 'client', 'form_branding',
     'Sender display name (e.g., Springfield Water - Backflow Compliance), reply-to email address (where property owners and testers will reach you), and your logo (PNG or JPG, transparent background preferred).',
     '{}'),
    (2, 'Joint setup session: notice templates', 'both', 'none',
     'FLO provides default notice templates for 60/30/7-day test due reminders, overdue notices, non-compliance escalation, tester certification expiry warnings, and gauge calibration expiry. Together we review each template; duplicate any you want to customize and edit wording, regulatory references, or legal language to match your jurisdiction.',
     '{}'),
    (3, 'Joint setup session: compliance rules and testing frequency', 'both', 'none',
     'Based on your Phase 1 answers, FLO configures the compliance calendar, due date calculations, grace periods, and notification triggers. You watch the configuration happen in real time so you can adjust later if needed.',
     '{}'),
    (4, 'Confirm setup looks correct', 'client', 'none',
     'Review the configuration summary together. Make any final tweaks before training begins.',
     '{}')
  ) as v(position, text, owner, type, detail, config);

  -- Phase 4: Training
  with ph as (
    insert into public.template_phases (position, name, short, owner, duration, description, completion_message)
    values (4, 'Training', 'Training', 'flo', '1 Week',
            'Your team learns how to use the platform. Training combines live sessions, self-service video content, and an in-platform AI assistant called Ask Flo for ongoing reference.',
            'Training complete! Final step: UAT and go-live.')
    returning id
  )
  insert into public.template_steps (template_phase_id, position, text, owner, type, detail, config)
  select ph.id, v.position, v.text, v.owner, v.type, v.detail, v.config::jsonb
  from ph, (values
    (1, 'Schedule training sessions', 'both', 'none',
     'Live sessions are scheduled with your CSM. Two sessions cover utility users; tester companies are handled separately via a self-service landing page.',
     '{}'),
    (2, 'Attend Utility Admin Training (2 hours, live)', 'client', 'none',
     'Full platform walkthrough: dashboard navigation, managing users, running compliance reports, customizing notice templates, the Resolution Center for failed tests, and configuration toggles.',
     '{}'),
    (3, 'Attend Utility Staff Training (1.5 hours, live)', 'client', 'none',
     'Day-to-day usage: searching facilities, viewing assemblies, reviewing test results, generating reports, and using Ask Flo for self-service help.',
     '{}'),
    (4, 'FLO publishes the Tester Self-Service Landing Page', 'flo', 'none',
     'Tester companies and field testers get their own login URL with video tutorials, an Ask Flo chatbot, and an 800-number fallback for users who prefer to call.',
     '{}'),
    (5, 'Add your team members to the platform', 'client', 'none',
     'Now that your admins know how, add utility staff directly. User management is fully self-service from this point forward.',
     '{}')
  ) as v(position, text, owner, type, detail, config);

  -- Phase 5: UAT & Go-Live
  with ph as (
    insert into public.template_phases (position, name, short, owner, duration, description, completion_message)
    values (5, 'UAT & Go-Live', 'Go-Live', 'both', '3-5 Days',
            'The final phase. Your team tests the platform in production with real data, verifies everything works, and signs off. Then FLO flips the switch and your platform goes live. Your CSM provides 2 to 4 weeks of hypercare support after go-live.',
            'Congratulations! Your BPA Compliance Platform is LIVE. Your CSM will provide 2 to 4 weeks of hypercare support.')
    returning id
  )
  insert into public.template_steps (template_phase_id, position, text, owner, type, detail, config)
  select ph.id, v.position, v.text, v.owner, v.type, v.detail, v.config::jsonb
  from ph, (values
    (1, 'Log in as Utility Admin and verify your dashboard', 'client', 'none',
     'Make sure you can see all facilities, assemblies, and contacts.',
     '{}'),
    (2, 'Search 3 or more facilities and verify data accuracy', 'client', 'none',
     'Spot-check addresses, account numbers, and assembly details against your source records.',
     '{}'),
    (3, 'Submit a test report in test mode', 'both', 'none',
     'Walk through the tester flow to make sure reports appear correctly.',
     '{}'),
    (4, 'Trigger a notice send in test mode', 'both', 'none',
     'Verify the email arrives with correct content and branding.',
     '{}'),
    (5, 'Verify due dates are calculating correctly', 'client', 'none',
     'Check 3 or more assemblies against your testing frequency model.',
     '{}'),
    (6, 'Run a compliance status report', 'client', 'none',
     'Confirm the numbers make sense: total assemblies, compliant, overdue.',
     '{}'),
    (7, 'Sign off on UAT', 'client', 'none',
     'Your formal approval to go live.',
     '{}'),
    (8, 'Go-live confirmed. Platform is LIVE!', 'both', 'none',
     'We flip the switch. Your compliance engine starts running.',
     '{}')
  ) as v(position, text, owner, type, detail, config);

end;
$seed$;

insert into public.app_settings (key, value) values
  ('overview_video_url', null),
  ('manual_file_path', null),
  ('master_template_path', null),
  ('ccc_assessment_url', null)
on conflict (key) do nothing;

-- ===========================================================================
-- 0005_project_workflow.sql
-- ===========================================================================

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

-- ===========================================================================
-- 0006_phase_editor.sql
-- ===========================================================================

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


-- ===========================================================================
-- 0007_on_behalf.sql
-- ===========================================================================

-- 0007_on_behalf.sql
-- Admins acting for a customer: every write is stamped server-side.
--   on_behalf = the actor is an admin AND the step is client- or joint-owned.
--   FLO-owned steps completed by an admin are normal work, not "on behalf".
-- Clients can never set completed_by, updated_by, uploaded_by, actor_id or
-- any on_behalf flag: triggers overwrite whatever the request sends.

-- Is this step one the customer owns (fully or jointly)?
create or replace function public.step_is_customer_owned(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select owner in ('client', 'both') from public.project_steps where id = p_step_id), false);
$$;

revoke all on function public.step_is_customer_owned(uuid) from public, anon;
grant execute on function public.step_is_customer_owned(uuid) to authenticated;

-- Steps: completion stamps always come from auth.uid(). (Replaces 0002 version.)
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
       new.type, new.detail, new.config, new.archived_at, new.source_template_step_id
     ) is distinct from (
       old.project_id, old.project_phase_id, old.position, old.text, old.owner,
       old.type, old.detail, old.config, old.archived_at, old.source_template_step_id
     ) then
    raise exception 'Only the done flag can be changed' using errcode = '42501';
  end if;

  if new.done is distinct from old.done then
    if new.done then
      new.completed_by := auth.uid();
      new.completed_at := now();
      new.completed_on_behalf := admin and new.owner in ('client', 'both');
    else
      new.completed_by := null;
      new.completed_at := null;
      new.completed_on_behalf := false;
    end if;
  else
    -- Nobody edits completion stamps directly, admins included.
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
    new.completed_on_behalf := old.completed_on_behalf;
  end if;

  return new;
end;
$$;

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
    new.archived_at := old.archived_at;
  end if;
  new.updated_by := auth.uid();
  new.last_edit_on_behalf := public.is_admin() and public.step_is_customer_owned(new.project_step_id);
  return new;
end;
$$;

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
  new.on_behalf := public.is_admin()
    and (new.project_step_id is null or public.step_is_customer_owned(new.project_step_id));
  return new;
end;
$$;

-- Uploads never change after insert, except archiving by an admin.
create or replace function public.uploads_update_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if auth.uid() is not null then
      new.uploaded_by := old.uploaded_by;
      new.on_behalf := old.on_behalf;
    end if;
    return new;
  end if;
  raise exception 'Uploads cannot be edited' using errcode = '42501';
end;
$$;

drop trigger if exists uploads_update_guard on public.uploads;
create trigger uploads_update_guard
  before update on public.uploads
  for each row execute function public.uploads_update_guard();

-- Activity log: clients get their own id/role and on_behalf = false; admins
-- may pass on_behalf but never another actor.
create or replace function public.activity_log_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.actor_id := auth.uid();
  if public.is_admin() then
    new.actor_role := 'admin';
  else
    new.actor_role := public.my_role();
    new.on_behalf := false;
  end if;
  return new;
end;
$$;

-- Names for attribution lines. Customers can't read admin profiles, so this
-- returns only what the UI prints: admins' first names, plus full names of
-- people in the caller's own project (admins get everyone).
create or replace function public.people_directory()
returns table (user_id uuid, display_name text, is_staff boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id,
         case when p.role = 'admin'
              then coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'FLO')
              else coalesce(nullif(trim(p.full_name), ''), p.email) end,
         p.role = 'admin'
  from public.profiles p
  where auth.uid() is not null
    and (
      p.role = 'admin'
      or public.is_admin()
      or p.project_id = public.my_project_id()
    );
$$;

revoke all on function public.people_directory() from public, anon;
grant execute on function public.people_directory() to authenticated;

-- Form save log: throttle per form AND per person, so an admin's on-behalf
-- edit is always recorded even right after the customer saved the same form.
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
      and actor_id is not distinct from auth.uid()
      and on_behalf = new.last_edit_on_behalf
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

revoke all on function public.log_form_save() from public, anon, authenticated;

-- notify-admins (service role) prints step labels in emails.
grant execute on function public.step_label(uuid) to service_role;

-- ===========================================================================
-- 0008_resources.sql
-- ===========================================================================

-- 0008_resources.sql
-- Admin-managed resources: overview video, user manual, master template, CCC tool URL.
-- Values live in app_settings; files live in the public "resources" bucket.
--   overview_video_url   text   (any YouTube URL; the browser converts it to an embed)
--   ccc_assessment_url   text
--   manual_file_path     object { path, file_name, size_bytes, uploaded_at }
--   master_template_path object { path, file_name, size_bytes, uploaded_at }
-- Every change is logged to activity_log with project_id null.

create or replace function public.app_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_stamp on public.app_settings;
create trigger app_settings_stamp
  before insert or update on public.app_settings
  for each row execute function public.app_settings_stamp();

create or replace function public.log_app_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.value is not distinct from new.value then
    return null;
  end if;
  insert into public.activity_log (project_id, action, target, detail)
  values (
    null, 'resource_updated', new.key,
    jsonb_build_object('key', new.key,
                       'from', case when tg_op = 'UPDATE' then old.value else null end,
                       'to', new.value)
  );
  return null;
end;
$$;

revoke all on function public.log_app_setting() from public, anon, authenticated;

drop trigger if exists log_app_setting on public.app_settings;
create trigger log_app_setting
  after insert or update on public.app_settings
  for each row execute function public.log_app_setting();

-- Resources bucket: 20 MB, PDF and Excel only.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'resources';

-- Customers pick up a replaced manual or new video without reloading.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
     ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end;
$$;

