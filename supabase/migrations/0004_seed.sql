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
