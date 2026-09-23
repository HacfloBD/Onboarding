-- rls_checks.sql
-- Proves that a customer in project A cannot see or change project B.
--
-- How to run: paste the whole file into the Supabase SQL editor and click Run.
-- The last result is a table of checks. Every row should say PASS.
-- The script creates throwaway projects (rls-test-a to rls-test-d), three
-- throwaway users (@rls-test.invalid) and two template versions (it adds a
-- phase, then restores the previous version) and removes all of it at the end.
-- It is safe to run more than once.

-- ---------------------------------------------------------------------------
-- Setup (runs as the SQL editor's postgres role)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', false);

delete from public.template_versions where created_by in (select id from auth.users where email like '%@rls-test.invalid');
delete from public.activity_log where actor_id in (select id from auth.users where email like '%@rls-test.invalid');
delete from auth.users where email like '%@rls-test.invalid';
delete from public.projects where code in ('rls-test-a', 'rls-test-b', 'rls-test-c', 'rls-test-d');

drop table if exists pg_temp.rls_results;
create temp table rls_results (n serial, check_name text, result text);
grant all on rls_results to authenticated, anon;
grant usage on sequence rls_results_n_seq to authenticated, anon;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'client-a@rls-test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'client-b@rls-test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@rls-test.invalid',    'authenticated', 'authenticated');

insert into public.projects (id, name, code) values
  ('00000000-0000-4000-9000-00000000000a', 'RLS Test A', 'rls-test-a'),
  ('00000000-0000-4000-9000-00000000000b', 'RLS Test B', 'rls-test-b');

insert into public.profiles (user_id, email, full_name, role, project_id) values
  ('00000000-0000-4000-8000-00000000000a', 'client-a@rls-test.invalid', 'Client A', 'client_lead', '00000000-0000-4000-9000-00000000000a'),
  ('00000000-0000-4000-8000-00000000000b', 'client-b@rls-test.invalid', 'Client B', 'client_lead', '00000000-0000-4000-9000-00000000000b'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@rls-test.invalid',    'Test Admin', 'admin', null);

insert into public.project_phases (id, project_id, position, name, owner, status) values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-9000-00000000000a', 1, 'Phase A', 'both', 'active'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-9000-00000000000b', 1, 'Phase B', 'both', 'active');

insert into public.project_steps (id, project_id, project_phase_id, position, text, owner) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-00000000000a', 1, 'A client step', 'client'),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-00000000000a', 2, 'A FLO step',    'flo'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-a000-00000000000b', 1, 'B client step', 'client');

insert into public.form_responses (project_id, project_step_id, form_type, data) values
  ('00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-b000-0000000000b1', 'form_org_details', '{"orgName":"Secret B"}');

insert into public.uploads (project_id, project_step_id, kind, link_url) values
  ('00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-b000-0000000000b1', 'link', 'https://example.com/b');

insert into public.activity_log (project_id, action, target) values
  ('00000000-0000-4000-9000-00000000000b', 'test', 'B only');

-- ---------------------------------------------------------------------------
-- Act as client A
-- ---------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', false);

do $$
declare
  n int;
  err text;
  a_project constant uuid := '00000000-0000-4000-9000-00000000000a';
  b_project constant uuid := '00000000-0000-4000-9000-00000000000b';
begin
  -- Reads
  select count(*) into n from public.projects where code like 'rls-test-%';
  insert into rls_results (check_name, result) values
    ('A sees only its own test project', case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end);

  select count(*) into n from public.projects where id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read project B', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.project_phases where project_id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read B phases', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.project_steps where project_id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read B steps', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.form_responses where project_id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read B form responses', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.uploads where project_id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read B uploads', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.activity_log where project_id = b_project;
  insert into rls_results (check_name, result) values
    ('A cannot read B activity log', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.profiles where project_id = b_project or role = 'admin';
  insert into rls_results (check_name, result) values
    ('A cannot read B users or admin profiles', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.template_phases;
  insert into rls_results (check_name, result) values
    ('A cannot read template phases', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.template_steps;
  insert into rls_results (check_name, result) values
    ('A cannot read template steps', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.app_settings;
  insert into rls_results (check_name, result) values
    ('A can read app_settings', case when n > 0 then 'PASS' else 'FAIL' end);

  -- Writes to project B
  update public.project_steps set done = true where project_id = b_project;
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A cannot tick B steps', case when n = 0 then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into public.form_responses (project_id, project_step_id, form_type, data)
    values (b_project, '00000000-0000-4000-b000-0000000000b1', 'x', '{}');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot write B form responses', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into public.form_responses (project_id, project_step_id, form_type, data)
    values (a_project, '00000000-0000-4000-b000-0000000000b1', 'x', '{}');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot attach a form to a B step', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into public.uploads (project_id, kind, link_url) values (b_project, 'link', 'https://x');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot add uploads to B', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into public.activity_log (project_id, action) values (b_project, 'x');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot write B activity log', case when err is not null then 'PASS' else 'FAIL' end);

  -- Storage: an insert that succeeds is undone by raising 'UNDO'.
  err := null;
  begin
    insert into storage.objects (bucket_id, name) values ('customer-uploads', b_project || '/x.txt');
    raise exception 'UNDO';
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot upload into B storage folder', case when err <> 'UNDO' then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into storage.objects (bucket_id, name) values ('customer-uploads', a_project || '/x.txt');
    raise exception 'UNDO';
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A can upload into its own storage folder', case when err = 'UNDO' then 'PASS' else 'FAIL (' || err || ')' end);

  err := null;
  begin
    insert into storage.objects (bucket_id, name) values ('resources', 'manual.pdf');
    raise exception 'UNDO';
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot write to resources bucket', case when err <> 'UNDO' then 'PASS' else 'FAIL' end);

  -- Own project rules
  update public.project_steps set done = true where id = '00000000-0000-4000-b000-0000000000a2';
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A cannot tick a FLO-owned step', case when n = 0 then 'PASS' else 'FAIL' end);

  update public.project_steps set done = true where id = '00000000-0000-4000-b000-0000000000a1';
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A can tick its own client step', case when n = 1 then 'PASS' else 'FAIL' end);

  err := null;
  begin
    update public.project_steps set text = 'hacked' where id = '00000000-0000-4000-b000-0000000000a1';
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot edit step text', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    update public.profiles set role = 'admin' where user_id = auth.uid();
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot change own role', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    update public.profiles set project_id = b_project where user_id = auth.uid();
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot change own project', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    insert into public.projects (name) values ('Sneaky');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot create projects', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    perform public.create_project_from_template('Sneaky 2');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot call create_project_from_template', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    perform public.reset_project_progress(a_project, 'rls-test-a');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot reset project progress', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    perform public.save_template('[]'::jsonb, 'wipe');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot save the template', case when err is not null then 'PASS' else 'FAIL' end);

  err := null;
  begin
    perform public.save_project_phases(a_project, '[]'::jsonb);
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('A cannot edit project phases', case when err is not null then 'PASS' else 'FAIL' end);

  update public.project_phases set status = 'complete' where project_id = a_project;
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A cannot change phase status directly', case when n = 0 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.activity_log where project_id = a_project and action = 'step_done';
  insert into rls_results (check_name, result) values
    ('Ticking a step writes activity_log', case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end);

  select count(*) into n from public.project_overview;
  insert into rls_results (check_name, result) values
    ('A sees only its own project_overview row', case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end);

  insert into public.uploads (project_id, project_step_id, kind, link_url)
  values (a_project, '00000000-0000-4000-b000-0000000000a1', 'link', 'https://example.com/a');
  -- Step a1 is done at this point, so A can no longer delete this upload.
  delete from public.uploads where project_id = a_project;
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A cannot delete uploads once the step is done', case when n = 0 then 'PASS' else 'FAIL' end);

  update public.project_steps set done = false where id = '00000000-0000-4000-b000-0000000000a1';
  delete from public.uploads where project_id = a_project;
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A can delete its own upload while the step is open', case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end);

  delete from public.uploads where project_id = b_project;
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('A cannot delete B uploads', case when n = 0 then 'PASS' else 'FAIL' end);

  -- Spoofing: whatever the request sends, stamps come from auth.uid().
  update public.project_steps
    set done = true, completed_by = '00000000-0000-4000-8000-00000000000b', completed_on_behalf = true
    where id = '00000000-0000-4000-b000-0000000000a1';
  select count(*) into n from public.project_steps
    where id = '00000000-0000-4000-b000-0000000000a1'
      and completed_by = '00000000-0000-4000-8000-00000000000a' and not completed_on_behalf;
  insert into rls_results (check_name, result) values
    ('Client cannot spoof completed_by or on_behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  insert into public.form_responses (project_id, project_step_id, form_type, data, updated_by, last_edit_on_behalf)
  values (a_project, '00000000-0000-4000-b000-0000000000a1', 'form_org_details', '{"orgName":"A"}',
          '00000000-0000-4000-8000-00000000000b', true);
  select count(*) into n from public.form_responses
    where project_step_id = '00000000-0000-4000-b000-0000000000a1'
      and updated_by = '00000000-0000-4000-8000-00000000000a' and not last_edit_on_behalf;
  insert into rls_results (check_name, result) values
    ('Client cannot spoof form updated_by or on_behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  insert into public.uploads (project_id, project_step_id, kind, link_url, uploaded_by, on_behalf)
  values (a_project, '00000000-0000-4000-b000-0000000000a1', 'link', 'https://example.com/spoof',
          '00000000-0000-4000-8000-00000000000b', true);
  select count(*) into n from public.uploads
    where link_url = 'https://example.com/spoof'
      and uploaded_by = '00000000-0000-4000-8000-00000000000a' and not on_behalf;
  insert into rls_results (check_name, result) values
    ('Client cannot spoof uploaded_by or on_behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  insert into public.activity_log (project_id, action, actor_id, actor_role, on_behalf)
  values (a_project, 'spoof', '00000000-0000-4000-8000-0000000000ad', 'admin', true);
  select count(*) into n from public.activity_log
    where action = 'spoof' and actor_id = '00000000-0000-4000-8000-00000000000a'
      and actor_role = 'client_lead' and not on_behalf;
  insert into rls_results (check_name, result) values
    ('Client cannot spoof activity actor or on_behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.people_directory() where display_name = 'Test';
  insert into rls_results (check_name, result) values
    ('Client sees admin first names only', case when n = 1 and not exists (select 1 from public.people_directory() where display_name like '%Admin%') then 'PASS' else 'FAIL' end);
  select count(*) into n from public.people_directory() where user_id = '00000000-0000-4000-8000-00000000000b';
  insert into rls_results (check_name, result) values
    ('Client cannot look up other projects'' people', case when n = 0 then 'PASS' else 'FAIL' end);

  update public.app_settings set value = to_jsonb('https://evil.example'::text) where key = 'ccc_assessment_url';
  get diagnostics n = row_count;
  insert into rls_results (check_name, result) values
    ('Client cannot change resources settings', case when n = 0 then 'PASS' else 'FAIL' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Act as the admin
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated"}', false);

do $$
declare
  n int;
  err text;
begin
  select count(*) into n from public.projects where code like 'rls-test-%';
  insert into rls_results (check_name, result) values
    ('Admin sees both test projects', case when n = 2 then 'PASS' else 'FAIL (' || n || ')' end);

  select count(*) into n from public.template_phases;
  insert into rls_results (check_name, result) values
    ('Admin can read template', case when n > 0 then 'PASS' else 'FAIL' end);

  err := null;
  begin
    update public.profiles set role = 'client_lead', project_id = '00000000-0000-4000-9000-00000000000a'
    where user_id = auth.uid();
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('Admin cannot change own role', case when err is not null then 'PASS' else 'FAIL' end);

  -- Completing every step of a phase completes it (A client step + A FLO step).
  update public.project_steps set done = true where project_id = '00000000-0000-4000-9000-00000000000a';
  select count(*) into n from public.project_phases
    where id = '00000000-0000-4000-a000-00000000000a' and status = 'complete';
  insert into rls_results (check_name, result) values
    ('Phase completes when all its steps are done', case when n = 1 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.project_steps
    where id = '00000000-0000-4000-b000-0000000000a2' and done and not completed_on_behalf
      and completed_by = '00000000-0000-4000-8000-0000000000ad';
  insert into rls_results (check_name, result) values
    ('Admin completing a FLO step is not on behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  update public.form_responses set data = '{"orgName":"Filled by FLO"}'
    where project_step_id = '00000000-0000-4000-b000-0000000000a1';
  select count(*) into n from public.form_responses
    where project_step_id = '00000000-0000-4000-b000-0000000000a1' and last_edit_on_behalf
      and updated_by = '00000000-0000-4000-8000-0000000000ad';
  insert into rls_results (check_name, result) values
    ('Admin form edit on a client step is on behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  insert into public.uploads (project_id, project_step_id, kind, link_url)
  values ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-b000-0000000000a1', 'link', 'https://example.com/by-flo');
  select count(*) into n from public.uploads where link_url = 'https://example.com/by-flo' and on_behalf;
  insert into rls_results (check_name, result) values
    ('Admin upload on a client step is on behalf', case when n = 1 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.activity_log
    where project_id = '00000000-0000-4000-9000-00000000000a' and action = 'form_saved' and on_behalf;
  insert into rls_results (check_name, result) values
    ('On-behalf form save is logged as on behalf', case when n >= 1 then 'PASS' else 'FAIL' end);

  -- Resources: an admin setting change is logged with project_id null, then put back.
  declare
    old_v jsonb := (select value from public.app_settings where key = 'overview_video_url');
  begin
    update public.app_settings set value = to_jsonb('https://youtu.be/rlsTest0001'::text) where key = 'overview_video_url';
    select count(*) into n from public.activity_log
      where project_id is null and action = 'resource_updated' and target = 'overview_video_url'
        and actor_id = '00000000-0000-4000-8000-0000000000ad';
    insert into rls_results (check_name, result) values
      ('Admin resource change is logged', case when n = 1 then 'PASS' else 'FAIL' end);
    select count(*) into n from public.app_settings
      where key = 'overview_video_url' and updated_by = '00000000-0000-4000-8000-0000000000ad';
    insert into rls_results (check_name, result) values
      ('Resource change records who made it', case when n = 1 then 'PASS' else 'FAIL' end);
    update public.app_settings set value = old_v where key = 'overview_video_url';
  end;

  -- Template copy
  declare
    c public.projects;
  begin
    c := public.create_project_from_template('RLS Test C', 'rls-test-c', 'CSM', null);
    select count(*) into n from public.project_phases where project_id = c.id;
    insert into rls_results (check_name, result) values
      ('Template copy creates every phase', case when n = (select count(*) from public.template_phases) and n > 0 then 'PASS' else 'FAIL (' || n || ')' end);
    select count(*) into n from public.project_steps where project_id = c.id;
    insert into rls_results (check_name, result) values
      ('Template copy creates every step', case when n = (select count(*) from public.template_steps) and n > 0 then 'PASS' else 'FAIL (' || n || ')' end);
    select count(*) into n from public.project_phases where project_id = c.id and status = 'active';
    insert into rls_results (check_name, result) values
      ('Only the first phase starts active', case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end);
  end;

  err := null;
  begin
    perform public.reset_project_progress('00000000-0000-4000-9000-00000000000a', 'wrong-code');
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('Reset refuses a wrong project code', case when err is not null then 'PASS' else 'FAIL' end);

  perform public.reset_project_progress('00000000-0000-4000-9000-00000000000a', 'rls-test-a');
  select count(*) into n from public.project_steps where project_id = '00000000-0000-4000-9000-00000000000a' and done;
  insert into rls_results (check_name, result) values
    ('Reset clears done flags', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.project_steps where project_id = '00000000-0000-4000-9000-00000000000b' and done;
  insert into rls_results (check_name, result) values
    ('Reset leaves other projects alone', case when n = 0 and exists (select 1 from public.form_responses where project_id = '00000000-0000-4000-9000-00000000000b') then 'PASS' else 'FAIL' end);

  -- Phase editor: archive instead of delete when a removed step holds data.
  update public.project_steps set done = true where id = '00000000-0000-4000-b000-0000000000a1';
  insert into public.uploads (project_id, project_step_id, kind, link_url)
  values ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-b000-0000000000a1', 'link', 'https://example.com/keep');
  perform public.save_project_phases('00000000-0000-4000-9000-00000000000a',
    '[{"id":"00000000-0000-4000-a000-00000000000a","name":"Phase A","owner":"both",
       "steps":[{"id":"00000000-0000-4000-b000-0000000000a2","text":"A FLO step","owner":"flo","type":"none"},
                {"id":"00000000-0000-4000-b000-0000000000a3","text":"New step","owner":"client","type":"none"}]}]'::jsonb,
    'test edit');
  select count(*) into n from public.project_steps where id = '00000000-0000-4000-b000-0000000000a1' and archived_at is not null;
  insert into rls_results (check_name, result) values
    ('Removing a done step archives it', case when n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.uploads where project_step_id = '00000000-0000-4000-b000-0000000000a1' and archived_at is not null;
  insert into rls_results (check_name, result) values
    ('Its uploads are archived, not deleted', case when n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.project_steps where id = '00000000-0000-4000-b000-0000000000a3' and position = 2;
  insert into rls_results (check_name, result) values
    ('New project step inserted in order', case when n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.activity_log where project_id = '00000000-0000-4000-9000-00000000000a' and action = 'phases_edited';
  insert into rls_results (check_name, result) values
    ('Project phase edit is logged', case when n = 1 then 'PASS' else 'FAIL' end);

  err := null;
  begin
    perform public.save_project_phases('00000000-0000-4000-9000-00000000000a',
      '[{"id":"00000000-0000-4000-a000-00000000000b","name":"Stolen","owner":"both","steps":[]}]'::jsonb);
  exception when others then err := sqlerrm;
  end;
  insert into rls_results (check_name, result) values
    ('Project edit cannot grab another project''s phase', case when err is not null then 'PASS' else 'FAIL' end);

  -- Template versions: add a 6th phase, new projects get it, old ones don't.
  declare
    v int;
    before_c int;
    c public.projects;
    snap jsonb := public.template_snapshot();
  begin
    select count(*) into before_c from public.project_phases where project_id = (select id from public.projects where code = 'rls-test-c');
    v := public.save_template(
      (snap -> 'phases') || jsonb_build_array(jsonb_build_object(
        'id', '00000000-0000-4000-c000-000000000006', 'name', 'Hypercare', 'owner', 'flo',
        'steps', jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-c000-0000000000f1', 'text', 'Check-in call', 'owner', 'both', 'type', 'none')))),
      'Add hypercare');
    c := public.create_project_from_template('RLS Test D', 'rls-test-d');
    select count(*) into n from public.project_phases where project_id = c.id;
    insert into rls_results (check_name, result) values
      ('New project gets the added phase', case when n = jsonb_array_length(snap -> 'phases') + 1 then 'PASS' else 'FAIL (' || n || ')' end);
    select count(*) into n from public.project_phases where project_id = (select id from public.projects where code = 'rls-test-c');
    insert into rls_results (check_name, result) values
      ('Existing project unchanged by template save', case when n = before_c then 'PASS' else 'FAIL' end);
    perform public.restore_template_version(v - 1);
    select count(*) into n from public.template_phases;
    insert into rls_results (check_name, result) values
      ('Restoring the previous version removes the phase', case when n = jsonb_array_length(snap -> 'phases') then 'PASS' else 'FAIL (' || n || ')' end);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client A again: archived rows are invisible
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', false);

do $$
declare
  n int;
begin
  select count(*) into n from public.project_steps where id = '00000000-0000-4000-b000-0000000000a1';
  insert into rls_results (check_name, result) values
    ('Client cannot see archived steps', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.uploads where link_url = 'https://example.com/keep';
  insert into rls_results (check_name, result) values
    ('Client cannot see archived uploads', case when n = 0 then 'PASS' else 'FAIL' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Act as anonymous (not signed in)
-- ---------------------------------------------------------------------------

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);

do $$
declare
  n int;
  err text;
begin
  begin
    select count(*) into n from public.projects;
  exception when others then err := sqlerrm; n := 0;
  end;
  insert into rls_results (check_name, result) values
    ('Anonymous sees no projects', case when n = 0 then 'PASS' else 'FAIL' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Clean up and report
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', false);

delete from public.template_versions where created_by in (select id from auth.users where email like '%@rls-test.invalid');
delete from public.activity_log where actor_id in (select id from auth.users where email like '%@rls-test.invalid');
delete from auth.users where email like '%@rls-test.invalid';
delete from public.projects where code in ('rls-test-a', 'rls-test-b', 'rls-test-c', 'rls-test-d');

select n as "#", check_name as "check", result from rls_results order by n;
