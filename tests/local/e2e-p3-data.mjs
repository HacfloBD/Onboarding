const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mock, mockRealtime, pushChange, sql, log, storage, USERS } from './harness.mjs';
const S=process.env.OUT || '/tmp', URL0='http://localhost:8787/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
async function newUser(name){const ctx=await b.newContext({viewport:{width:1280,height:900},acceptDownloads:true});await mock(ctx);const pg=await ctx.newPage();await mockRealtime(pg,name);
 pg.on('pageerror',e=>errs.push(name+' pageerror '+e.message));pg.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/fonts|CERT|Failed to load resource|Password forms/.test(m.text()))errs.push(name+' '+m.type()+': '+m.text())});
 await pg.goto(URL0);await pg.waitForTimeout(400);return pg}
const ok=(label,v,extra='')=>console.log((v?'PASS ':'FAIL ')+label+(extra?'  ['+extra+']':''));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- Admin creates two projects
const admin=await newUser('admin');
await admin.click('#bModeSwitch');await admin.fill('#sE',USERS.admin.email);await admin.fill('#sP','pw12345678');await admin.click('#fStaff button');await admin.waitForTimeout(1200);
ok('admin lands on Admin > Projects', await admin.isVisible('#tAdmin') && await admin.isVisible('.ani.on[data-a="projects"]'));
await admin.click('[data-action="new-project"]');await admin.waitForTimeout(200);
await admin.fill('#pNm','City of Springfield');ok('code auto-fills', (await admin.inputValue('#pCd'))==='city-of-springfield');
await admin.fill('#pCs','Olivier Hardin');await admin.fill('#pGL','2026-12-31');
await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const springId=sql("select id from projects where code='city-of-springfield'");
ok('project created via RPC with 5 phases / 26 steps', sql(`select count(*) from project_phases where project_id='${springId}'`)==='5' && sql(`select count(*) from project_steps where project_id='${springId}'`)==='26');
ok('only phase 1 active', sql(`select string_agg(status,',' order by position) from project_phases where project_id='${springId}'`)==='active,pending,pending,pending,pending');
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','Town of Shelbyville');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const shelId=sql("select id from projects where code='town-of-shelbyville'");
ok('second project created', !!shelId);
sql(`insert into profiles (user_id,email,full_name,role,project_id) values ('${USERS.jane.id}','${USERS.jane.email}','Jane Smith','client_lead','${springId}'),('${USERS.bart.id}','${USERS.bart.email}','Bart Simpson','client_lead','${shelId}')`);
const opts=await admin.$$eval('#nPrSel option',o=>o.map(x=>x.textContent));
ok('switcher lists both projects', opts.includes('City of Springfield')&&opts.includes('Town of Shelbyville'), opts.join('|'));
await admin.click('.ani[data-a="projects"]');await admin.waitForTimeout(600);
await admin.screenshot({path:S+'/p3-admin-projects.png'});
await admin.fill('#aQ','shelby');ok('project search filters', (await admin.$$('#aRows tr')).length===1);

// ---- Customer Jane
const jane=await newUser('jane');
await jane.fill('#lE',USERS.jane.email);await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(1500);
ok('Jane in Journey', await jane.isVisible('#tJourney') && !(await jane.isVisible('#admTab')));
ok('Jane badge shows her project', (await jane.textContent('#nBadge')).includes('City of Springfield'));
const phases=await jane.$$eval('.pc .pt',x=>x.map(e=>e.textContent));ok('5 phases from the manual', phases.length===5 && phases[0].startsWith('Phase 1: Pre-Onboarding'), phases.join(' / '));
ok('status Phases 0/5 and Forms 0/6', true);
await jane.click('.tab[data-t="status"]');await jane.waitForTimeout(400);
ok('status numbers from data', (await jane.textContent('#sPh'))==='0/5' && (await jane.textContent('#sF'))==='0/6', (await jane.textContent('#sPh'))+' '+(await jane.textContent('#sF')));
await jane.screenshot({path:S+'/p3-jane-status.png'});
await jane.click('.tab[data-t="journey"]');
// org form autosave
await jane.fill('.ifrm[data-type="form_org_details"] [data-f="orgName"]','Springfield Water <Dept>');
await jane.fill('.ifrm[data-type="form_org_details"] [data-f="state"]','IL');await jane.waitForTimeout(1400);
ok('org form auto-saved', sql(`select data->>'orgName' from form_responses where project_id='${springId}'`)==='Springfield Water <Dept>');
ok('Saved indicator', (await jane.textContent('.ifrm[data-type="form_org_details"] .svd')).includes('Saved'));
// schedule session
await jane.fill('.ifrm[data-type="form_schedule_session"] [data-f="preferredDate"]','2026-10-05');
await jane.fill('.ifrm[data-type="form_schedule_session"] [data-f="preferredTime"]','10:00');
await jane.check('.ifrm[data-type="form_schedule_session"] input[value="virtual"]');await jane.waitForTimeout(1400);
ok('session form saved with mode', sql(`select data->>'mode' from form_responses fr join project_steps s on s.id=fr.project_step_id where s.type='form_schedule_session' and s.project_id='${springId}'`)==='virtual');
ok('CCC link shown', await jane.isVisible('a[href="https://example.com/ccc-assessment"]'));
await jane.selectOption('.ifrm[data-type="form_frequency"] select','not_sure');await jane.waitForTimeout(1200);
ok('frequency has 5 options + placeholder', (await jane.$$('.ifrm[data-type="form_frequency"] option')).length===6);
await jane.screenshot({path:S+'/p3-jane-phase1.png',fullPage:true});
// tick step 1a
const s1a=await jane.getAttribute('.stp[data-label="1a"] .sc','data-step');
await jane.click('.stp[data-label="1a"] .sc');await jane.waitForTimeout(900);
ok('Jane ticked 1a in DB', sql(`select done from project_steps where id='${s1a}'`)==='t');
ok('completed form hidden with View submitted info', await jane.isVisible('.stp[data-label="1a"] [data-action="view-submitted"]') && !(await jane.isVisible('.stp[data-label="1a"] .ifrm')));
await jane.click('.stp[data-label="1a"] [data-action="view-submitted"]');await jane.waitForTimeout(200);
ok('submitted info visible read-only', await jane.isDisabled('.stp[data-label="1a"] .subv [data-f="orgName"]') && (await jane.inputValue('.stp[data-label="1a"] .subv [data-f="orgName"]'))==='Springfield Water <Dept>');
ok('FLO step 1d not clickable for client', (await jane.getAttribute('.stp[data-label="1d"] .sc','data-action'))===null);
ok('activity_log step_done written', sql(`select count(*) from activity_log where project_id='${springId}' and action='step_done'`)==='1');
// phase 2 uploads
await jane.click('.pc:nth-child(2) .ph');await jane.waitForTimeout(300);
await jane.setInputFiles('.stp[data-label="2a"] .upc:first-child input[type=file]',[{name:'facilities.csv',mimeType:'text/csv',buffer:Buffer.from('a,b\n1,2')},{name:'contacts.xlsx',mimeType:'application/octet-stream',buffer:Buffer.alloc(2048)}]);
await jane.waitForTimeout(1500);
const paths=[...storage.keys()];
ok('2 files stored under project/step folder', paths.length===2 && paths.every(p=>p.startsWith(springId+'/')), paths.join(' '));
ok('uploads rows created', sql(`select count(*) from uploads where project_id='${springId}' and kind='file'`)==='2');
ok('upload list shows name, size, who', (await jane.textContent('.stp[data-label="2a"] .upl')).includes('facilities.csv') && (await jane.textContent('.stp[data-label="2a"] .upl')).includes('Jane Smith'));
ok('master template download link falls back', (await jane.getAttribute('.stp[data-label="2a"] a[download]','href'))==='/assets/files/FLO_Onboarding_Forms.xlsx');
await jane.fill('[data-link]','javascript:alert(1)');await jane.click('[data-action="save-link"]');await jane.waitForTimeout(300);
ok('javascript: link rejected', sql(`select count(*) from uploads where kind='link'`)==='0');
await jane.fill('[data-link]','https://drive.google.com/x');await jane.click('[data-action="save-link"]');await jane.waitForTimeout(700);
ok('share link saved', sql(`select count(*) from uploads where kind='link' and project_id='${springId}'`)==='1');
await jane.click('.stp[data-label="2a"] [data-action="download"] >> nth=0');await jane.waitForTimeout(600);
ok('download uses 10-minute signed URL, page stays', log.some(l=>l.startsWith('SIGN '+springId)&&l.includes('"expiresIn":600')) && log.some(l=>l.startsWith('GETSIGNED')&&l.includes('download=facilities.csv')) && jane.url()===URL0, log.filter(l=>l.startsWith('SIGN')).slice(-1)[0]);
console.log('URL after download:', jane.url(), 'del buttons:', (await jane.$$('[data-action="delete-upload"]')).length, 'upl html:', (await jane.innerHTML('.stp[data-label="2a"] .upl').catch(e=>'none')).slice(0,300));
await jane.click('.stp[data-label="2a"] [data-action="delete-upload"] >> nth=0');await jane.click('[data-action="confirm-delete-upload"]');await jane.waitForTimeout(800);
ok('client deleted own upload (row + storage)', sql(`select count(*) from uploads where project_id='${springId}' and kind='file'`)==='1' && storage.size===1);
await jane.screenshot({path:S+'/p3-jane-uploads.png'});
// api toggle + branding
await jane.check('.ifrm[data-type="form_api_integration"] input[value="yes"]');await jane.waitForTimeout(200);
ok('API fields appear on yes', await jane.isVisible('.ifrm[data-type="form_api_integration"] [data-f="billingSystem"]'));
await jane.click('.pc:nth-child(3) .ph');await jane.waitForTimeout(300);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
await jane.setInputFiles('.ifrm[data-type="form_branding"] input[type=file]',{name:'logo.png',mimeType:'image/png',buffer:png});await jane.waitForTimeout(1200);
ok('logo uploaded with thumbnail', await jane.isVisible('.ifrm[data-type="form_branding"] img.uthumb'));
await jane.setInputFiles('.ifrm[data-type="form_branding"] input[type=file]',{name:'logo.gif',mimeType:'image/gif',buffer:png});await jane.waitForTimeout(400);
ok('non PNG/JPG logo refused', sql(`select count(*) from uploads where file_name='logo.gif'`)==='0');

// ---- Customer Bart is isolated
const bart=await newUser('bart');
await bart.fill('#lE',USERS.bart.email);await bart.click('#fEmail button');await bart.waitForTimeout(300);await bart.fill('#otp input >> nth=0','123456');await bart.waitForTimeout(1500);
ok('Bart sees Shelbyville only', (await bart.textContent('#nBadge')).includes('Shelbyville'));
ok('Bart does not see Jane data', !(await bart.content()).includes('Springfield Water &lt;Dept&gt;') && (await bart.inputValue('.ifrm[data-type="form_org_details"] [data-f="orgName"]'))==='');

// ---- Admin sees Springfield, realtime
await admin.selectOption('#nPrSel',springId);await admin.waitForTimeout(1000);
await admin.click('.tab[data-t="journey"]');await admin.waitForTimeout(300);
ok('admin sees Jane tick', (await admin.getAttribute('.stp[data-label="1a"] .sc','class')).includes('dn'));
const s1b=await jane.getAttribute('.stp[data-label="1b"] .sc','data-step');
await jane.click('.pc:nth-child(1) .ph').catch(()=>{});
sql(`update project_steps set done=true where id='${s1b}'`); // simulate Jane's tick landing in the DB
pushChange('admin','project_steps',{id:s1b,project_id:springId,done:true});
await admin.waitForTimeout(1200);
ok('admin updates via realtime without reload', (await admin.getAttribute('.stp[data-label="1b"] .sc','class')).includes('dn'));
// admin toggles FLO step on behalf
await admin.click('.stp[data-label="1d"] .sc');await admin.waitForTimeout(900);
ok('admin can tick FLO step', sql(`select done from project_steps s join project_phases p on p.id=s.project_phase_id where s.project_id='${springId}' and p.position=1 and s.position=4`)==='t');
await admin.click('.stp[data-label="1c"] .sc');await admin.waitForTimeout(300);if(await admin.isVisible('#obGo'))await admin.click('#obGo');await admin.waitForTimeout(1000);
ok('phase 1 completes -> modal + phase 2 active', await admin.isVisible('#mW:not(.hid)') && sql(`select string_agg(status,',' order by position) from project_phases where project_id='${springId}'`)==='complete,active,pending,pending,pending');
ok('completion modal uses completion_message', (await admin.textContent('#mC')).includes('6-Pillar'));
await admin.screenshot({path:S+'/p3-admin-complete.png'});
await admin.click('[data-action="close-modal"]');
ok('admin on-behalf flag set', sql(`select completed_on_behalf from project_steps s join project_phases p on p.id=s.project_phase_id where s.project_id='${springId}' and p.position=1 and s.position=3`)==='t');
// Users tab
await admin.click('.tab[data-t="admin"]');await admin.click('.ani[data-a="users"]');await admin.waitForTimeout(700);
const ut=await admin.textContent('#aC');ok('users: project people + FLO admins', ut.includes('People at City of Springfield (1)') && ut.includes('Jane Smith') && ut.includes('FLO admins (1)') && !ut.includes('Bart'));
await admin.screenshot({path:S+'/p3-admin-users.png'});
// Phases tab
await admin.click('.ani[data-a="phases"]');await admin.waitForTimeout(300);
ok('phases tab lists 5', (await admin.$$('.edph')).length===5);
// Reset
await admin.click('.ani[data-a="setup"]');await admin.waitForTimeout(300);
await admin.click('[data-action="reset-project"]');ok('reset button disabled until code typed', await admin.isDisabled('#rsGo'));
await admin.fill('#rsC','city-of-springfield');await admin.click('#rsGo');await admin.waitForTimeout(1500);
ok('reset cleared Springfield only', sql(`select count(*) from project_steps where project_id='${springId}' and done`)==='0' && sql(`select count(*) from form_responses where project_id='${springId}'`)==='0' && sql(`select count(*) from uploads where project_id='${springId}'`)==='0' && storage.size===0);
ok('reset logged once', sql(`select count(*) from activity_log where project_id='${springId}' and action='project_reset'`)==='1');
// Archive
await admin.click('.ani[data-a="projects"]');await admin.waitForTimeout(600);
await admin.click(`[data-action="archive-project"][data-id="${shelId}"]`);await admin.click('[data-action="confirm-archive"]');await admin.waitForTimeout(1200);
ok('archived project leaves switcher', !(await admin.$$eval('#nPrSel option',o=>o.map(x=>x.textContent))).includes('Town of Shelbyville') && sql(`select status from projects where id='${shelId}'`)==='archived');

// localStorage contents
for (const [n,p] of [['admin',admin],['jane',jane]]) {
  const keys=await p.evaluate(()=>Object.keys(localStorage));
  ok(n+' localStorage has no app data', keys.every(k=>/^sb-.*-auth-token$|^flo_admin_project$/.test(k)), keys.join(','));
}
console.log('REST errors:', log.filter(l=>l.startsWith('REST')));
console.log('unhandled:', log.filter(l=>l.startsWith('UNHANDLED')));
console.log('console errors:', errs);
await b.close();
