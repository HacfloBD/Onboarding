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
