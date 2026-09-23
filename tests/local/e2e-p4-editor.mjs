const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mock, mockRealtime, sql, log, storage, USERS } from './harness.mjs';
const S=process.env.OUT || '/tmp', URL0='http://localhost:8787/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
async function newUser(name){const ctx=await b.newContext({viewport:{width:1400,height:1000}});await mock(ctx);const pg=await ctx.newPage();await mockRealtime(pg,name);
 pg.on('pageerror',e=>errs.push(name+' pageerror '+e.message));pg.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/fonts|CERT|Failed to load resource|Password forms|notify-admins/.test(m.text()))errs.push(name+' '+m.type()+': '+m.text())});
 await pg.goto(URL0);await pg.waitForTimeout(400);return pg}
const ok=(label,v,extra='')=>console.log((v?'PASS ':'FAIL ')+label+(extra?'  ['+extra+']':''));
const w=ms=>new Promise(r=>setTimeout(r,ms));

const admin=await newUser('admin');
await admin.click('#bModeSwitch');await admin.fill('#sE',USERS.admin.email);await admin.fill('#sP','pw12345678');await admin.click('#fStaff button');await admin.waitForTimeout(1200);
// Old project created from the 5-phase template
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','Old Town');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const oldId=sql("select id from projects where code='old-town'");
ok('Old Town has 5 phases', sql(`select count(*) from project_phases where project_id='${oldId}'`)==='5');

// ---- Template editor: add a 6th phase
await admin.click('.ani[data-a="template"]');await admin.waitForTimeout(800);
ok('template editor lists 5 phases', (await admin.$$('.edph')).length===5);
ok('version history shows v1 current', (await admin.textContent('#aC')).includes('v1'));
ok('preview renders first phase', (await admin.textContent('#edPrev')).includes('Phase 1: Pre-Onboarding'));
await admin.click('[data-action="ed-ph-add"]');await admin.fill('.edph:last-of-type .edname','Hypercare');
await admin.click('.edph:last-of-type [data-action="ed-st-add"]');await admin.fill('.edph:last-of-type .edtxt','Weekly check-in call');
await admin.waitForTimeout(300);
ok('unsaved indicator shows', await admin.isVisible('#edDirty'));
ok('preview shows new phase as Phase 6', (await admin.textContent('#edPrev')).includes('Phase 6: Hypercare') && (await admin.textContent('#edPrev')).includes('Weekly check-in call'));
await admin.fill('#edNote','Add hypercare phase');await admin.click('#edSave');await admin.waitForTimeout(1500);
ok('saved as version 2', sql("select max(version_number) from template_versions")==='2' && sql("select count(*) from template_phases")==='6');
ok('template save logged', sql("select count(*) from activity_log where action='template_saved'")==='1');
await admin.screenshot({path:S+'/p4-template.png',fullPage:true});

// ---- Frequency options + upload toggles in template (then discard)
const freqRow=admin.locator('.edst',{has:admin.locator('input.edtxt[value="Confirm your testing frequency model"]')});
await freqRow.locator('[data-action="ed-st-toggle"]').click();await admin.waitForTimeout(200);
await admin.click('[data-action="ed-opt-add"]');await admin.waitForTimeout(200);
const optInputs=admin.locator('.edopt tbody tr:last-child input');await optInputs.nth(0).fill('Every 6 months');await optInputs.nth(1).fill('semiannual');await optInputs.nth(2).fill('RP assemblies twice a year');
await admin.waitForTimeout(400);
ok('preview dropdown shows new option', (await admin.$$eval('#edPrev select option',o=>o.map(x=>x.textContent))).includes('Every 6 months'));
await admin.click('[data-action="ed-discard"]');await admin.waitForTimeout(800);
ok('discard restores saved template', !(await admin.isVisible('#edDirty')));

// ---- New project gets 6 phases, old stays 5
await admin.click('.ani[data-a="projects"]');await admin.waitForTimeout(500);
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','New City');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const newId=sql("select id from projects where code='new-city'");
ok('new project gets 6 phases', sql(`select count(*) from project_phases where project_id='${newId}'`)==='6');
ok('old project still 5 phases', sql(`select count(*) from project_phases where project_id='${oldId}' and archived_at is null`)==='5');

// ---- Customer on Old Town: upload + tick 2a
sql(`insert into profiles (user_id,email,full_name,role,project_id) values ('${USERS.jane.id}','${USERS.jane.email}','Jane Smith','client_lead','${oldId}')`);
const jane=await newUser('jane');
await jane.fill('#lE',USERS.jane.email);await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(1500);
ok('Jane next step is 1a text', (await jane.textContent('#jNx .nat'))==='Provide your organization details');
await jane.click('.pc:nth-child(2) .ph');await jane.waitForTimeout(200);
await jane.setInputFiles('.stp[data-label="2a"] .upc:first-child input[type=file]',{name:'assemblies.csv',mimeType:'text/csv',buffer:Buffer.from('x')});await jane.waitForTimeout(1200);
const s2a=await jane.getAttribute('.stp[data-label="2a"] .sc','data-step');
await jane.click('.stp[data-label="2a"] .sc');await jane.waitForTimeout(900);
ok('Jane uploaded and ticked 2a', sql(`select done from project_steps where id='${s2a}'`)==='t' && sql(`select count(*) from uploads where project_step_id='${s2a}'`)==='1');

// ---- Admin: reorder steps in Old Town
await admin.selectOption('#nPrSel',oldId);await admin.waitForTimeout(1000);
await admin.click('.tab[data-t="admin"]');await admin.click('.ani[data-a="phases"]');await admin.waitForTimeout(800);
ok('project editor shows statuses', (await admin.$$('.edstatus')).length===5);
const firstStep=async()=>admin.inputValue('.edph:first-of-type .edst:first-of-type .edtxt');
ok('1a before reorder', (await firstStep())==='Provide your organization details');
await admin.click('.edph:first-of-type .edst:first-of-type [data-action="ed-st-down"]');await admin.waitForTimeout(300);
ok('labels renumber in editor', (await firstStep())==='Schedule your 6-Pillar assessment session' && (await admin.textContent('.edph:first-of-type .edst:first-of-type .edlbl'))==='1a');
await admin.click('#edSave');await admin.waitForTimeout(1500);
ok('reorder saved + logged', sql(`select text from project_steps s join project_phases p on p.id=s.project_phase_id where s.project_id='${oldId}' and p.position=1 and s.position=1`)==='Schedule your 6-Pillar assessment session' && sql(`select count(*) from activity_log where project_id='${oldId}' and action='phases_edited'`)==='1');
await jane.waitForTimeout(300);await jane.reload();await jane.waitForTimeout(1500);
ok('customer next-step card updated', (await jane.textContent('#jNx .nat'))==='Schedule your 6-Pillar assessment session');
ok('customer label 1a = moved step', (await jane.textContent('.stp[data-label="1a"] .stitle')).startsWith('Schedule your 6-Pillar'));

// ---- Drag and drop phases in the project editor (then discard)
await admin.dragTo ? null : null;
await admin.locator('.edph:nth-of-type(2) .edph-h > .edh').dragTo(admin.locator('.edph:nth-of-type(1) .edph-h'),{targetPosition:{x:20,y:5}});await admin.waitForTimeout(300);
ok('drag and drop reorders phases', (await admin.inputValue('.edph:first-of-type .edname'))==='Data Collection & Migration', await admin.inputValue('.edph:first-of-type .edname'));
await admin.click('[data-action="ed-discard"]');await admin.waitForTimeout(500);

// ---- Type change warning on a step with data
const r2a=admin.locator(`.edst[data-st-row="${s2a}"]`);
await r2a.locator('[data-action="ed-st-toggle"]').click();await admin.waitForTimeout(200);
await r2a.locator('select[data-st-f="type"]').selectOption('none');await admin.waitForTimeout(300);
ok('type change warns when step has data', await admin.isVisible(`.edst[data-st-row="${s2a}"] .edwarn`));
await admin.click('[data-action="ed-discard"]');await admin.waitForTimeout(500);

// ---- Delete completed step with upload -> typed confirmation -> archived
await admin.click(`.edst[data-st-row="${s2a}"] [data-action="ed-st-del"]`);await admin.waitForTimeout(200);
ok('typed confirmation required', await admin.isDisabled('#edConfGo'));
await admin.fill('#edConf','archive');await admin.click('#edConfGo');await admin.waitForTimeout(200);
await admin.click('#edSave');await admin.waitForTimeout(1500);
ok('step archived, not deleted', sql(`select archived_at is not null from project_steps where id='${s2a}'`)==='t');
ok('upload archived', sql(`select count(*) from uploads where project_step_id='${s2a}' and archived_at is not null`)==='1' && storage.size===1);
await jane.reload();await jane.waitForTimeout(1500);
ok('customer no longer sees archived step', !(await jane.textContent('#jPh')).includes('Send us your data'));
await admin.click('[data-action="ed-archived"]');await admin.waitForTimeout(800);
ok('Archived items lists the upload', (await admin.textContent('#mC')).includes('assemblies.csv'));
await admin.click('[data-action="ed-arch-dl"]');await admin.waitForTimeout(700);
ok('admin downloads archived upload via signed URL', log.some(l=>l.startsWith('GETSIGNED')&&l.includes('assemblies.csv')));
await admin.screenshot({path:S+'/p4-archived.png'});
await admin.click('#mC [data-action="close-modal"]');

// ---- Apply latest template to Old Town
await admin.click('[data-action="ed-apply"]');await admin.waitForTimeout(1000);
const diffTxt=await admin.textContent('#mC');
ok('diff lists added Hypercare phase', diffTxt.includes('Phase: Hypercare') && diffTxt.includes('Weekly check-in call'));
ok('no false phase-order change', !diffTxt.includes('Phases go back'));
ok('diff notes step order change', diffTxt.includes('Steps in Pre-Onboarding Assessment & Kick-off go back to the template order'));
await admin.screenshot({path:S+'/p4-apply.png'});
await admin.click('[data-action="ed-apply-go"]');await admin.waitForTimeout(1800);
ok('Old Town now 6 phases, template v2', sql(`select count(*) from project_phases where project_id='${oldId}' and archived_at is null`)==='6' && sql(`select template_version from projects where id='${oldId}'`)==='2');
ok('completed/archived data untouched by apply', sql(`select archived_at is not null from project_steps where id='${s2a}'`)==='t');
ok('apply logged', sql(`select count(*) from activity_log where project_id='${oldId}' and action='template_applied'`)==='1');
ok('re-apply shows already up to date', await (async()=>{await admin.click('[data-action="ed-apply"]');await admin.waitForTimeout(900);const t=await admin.textContent('#mC');await admin.click('#mC [data-action="close-modal"]');return t.includes('already matches')})());

// ---- Status counters with 3, 5, 7 phases (edit New City)
await admin.selectOption('#nPrSel',newId);await admin.waitForTimeout(1000);
await admin.click('.ani[data-a="phases"]');await admin.waitForTimeout(800);
const statusFor=async()=>{await admin.click('.tab[data-t="status"]');await admin.waitForTimeout(500);const r=[await admin.textContent('#sPh'),await admin.textContent('#sF')];await admin.click('.tab[data-t="admin"]');await admin.waitForTimeout(300);return r};
const setPhases=async n=>{
  let c=(await admin.$$('.edph')).length;
  while(c>n){await admin.click('.edph:last-of-type [data-action="ed-ph-del"]');await admin.click('[data-action="ed-ph-del-go"]');await admin.waitForTimeout(150);c--;}
  while(c<n){await admin.click('[data-action="ed-ph-add"]');await admin.waitForTimeout(100);c++;await admin.click(`.edph:nth-of-type(${c}) [data-action="ed-st-add"]`);await admin.waitForTimeout(100);}
  await admin.click('#edSave');await admin.waitForTimeout(1500);
};
await setPhases(3);let st=await statusFor();const f3=sql(`select count(*) from project_steps where project_id='${newId}' and archived_at is null and type<>'none'`);
ok('3 phases: Phases 0/3, Forms 0/N', st[0]==='0/3' && st[1]==='0/'+f3, st.join(' '));
await setPhases(7);st=await statusFor();
ok('7 phases: Phases 0/7', st[0]==='0/7', st.join(' '));
// complete phase 1 of 7 by ticking every step as admin
await admin.click('.tab[data-t="journey"]');await admin.waitForTimeout(300);
for(let k=0;k<12;k++){const el=admin.locator('.pc:first-child .sc[data-action="toggle-step"]:not(.dn)').first();if(!(await el.count()))break;await el.click();await admin.waitForTimeout(300);if(await admin.isVisible('#obGo')){await admin.click('#obGo');}await admin.waitForTimeout(800);if(await admin.isVisible('#mW:not(.hid)'))break;}
await admin.waitForTimeout(500);if(await admin.isVisible('#mW:not(.hid)'))await admin.click('#mC [data-action="close-modal"]');
st=await statusFor();ok('after completing phase 1: Phases 1/7', st[0]==='1/7', st.join(' '));
await setPhases(5);st=await statusFor();ok('5 phases: Phases 1/5', st[0]==='1/5', st.join(' '));

// ---- Restore template version 1
await admin.click('.ani[data-a="template"]');await admin.waitForTimeout(800);
await admin.click('[data-action="ed-restore"][data-v="1"]');await admin.click('[data-action="ed-restore-go"]');await admin.waitForTimeout(1500);
ok('restore v1 -> 5 phases, saved as v3', sql("select count(*) from template_phases")==='5' && sql("select max(version_number) from template_versions")==='3');

// ---- Unsaved guard
await admin.click('[data-action="ed-ph-add"]');await admin.click('.ani[data-a="projects"]');await admin.waitForTimeout(300);
ok('leaving with unsaved edits asks first', (await admin.textContent('#mC')).includes('Discard unsaved changes'));
await admin.click('[data-action="ed-leave"]');await admin.waitForTimeout(600);
ok('discard then navigates', await admin.isVisible('.ani.on[data-a="projects"]'));

console.log('REST errors:', log.filter(l=>l.startsWith('REST')));
console.log('console errors:', errs);
await b.close();
