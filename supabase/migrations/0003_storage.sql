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
