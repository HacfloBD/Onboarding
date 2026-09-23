-- rls_checks.sql
-- Proves that a customer in project A cannot see or change project B.
--
-- How to run: paste the whole file into the Supabase SQL editor and click Run.
-- The last result is a table of checks. Every row should say PASS.
-- The script creates two throwaway projects (rls-test-a, rls-test-b), three
-- throwaway users (@rls-test.invalid) and deletes them again at the end.
-- It is safe to run more than once.

-- ---------------------------------------------------------------------------
-- Setup (runs as the SQL editor's postgres role)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', false);

delete from auth.users where email like '%@rls-test.invalid';
delete from public.projects where code in ('rls-test-a', 'rls-test-b');

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

delete from auth.users where email like '%@rls-test.invalid';
delete from public.projects where code in ('rls-test-a', 'rls-test-b');

select n as "#", check_name as "check", result from rls_results order by n;
