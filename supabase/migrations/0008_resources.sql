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
