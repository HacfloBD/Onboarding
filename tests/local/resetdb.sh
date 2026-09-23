P="psql -h /var/tmp/flopg -p 5433 -U postgres -d flo -q"
psql -h /var/tmp/flopg -p 5433 -U postgres -d flo -q -c "update app_settings set value=null where key in ('overview_video_url','manual_file_path','master_template_path')"
$P -c "delete from template_versions; delete from activity_log; delete from profiles where role<>'admin'; delete from projects; delete from template_steps; delete from template_phases;" 
$P -f supabase/migrations/0004_seed.sql >/dev/null 2>&1
$P -c "insert into template_versions (version_number, snapshot, note) select 1, public.template_snapshot(), 'Initial template from the User Manual v2';"
psql -h /var/tmp/flopg -p 5433 -U postgres -d flo -q -c "update app_settings set value=to_jsonb('https://example.com/ccc-assessment'::text) where key='ccc_assessment_url'"
SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=anon PORTAL_URL=http://localhost:8787 node scripts/write-config.mjs >/dev/null
psql -h /var/tmp/flopg -p 5433 -U postgres -d flo -q -c "notify pgrst, 'reload schema'"; sleep 1
