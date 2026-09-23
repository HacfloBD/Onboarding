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
