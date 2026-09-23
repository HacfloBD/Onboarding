-- setup.sql
-- FLO Onboarding Portal: complete database setup. Paste into the Supabase SQL editor and click Run.
-- This is supabase/migrations/0001..0004 combined, in order. Safe to run more than once.
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

