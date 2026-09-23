const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mock, mockRealtime, sql, log, USERS } from './harness.mjs';
import fs from 'node:fs';
const S=process.env.OUT || '/tmp', URL0='http://localhost:8787/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[], fnCalls=[];
async function newUser(name){const ctx=await b.newContext({viewport:{width:1400,height:1000},acceptDownloads:true});await mock(ctx);
 await ctx.route('**/.netlify/functions/**',r=>{fnCalls.push({name,url:r.request().url(),body:r.request().postDataJSON()});r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({emailSent:true,emailConfigured:true})})});
 const pg=await ctx.newPage();await mockRealtime(pg,name);
 pg.on('pageerror',e=>errs.push(name+' pageerror '+e.message));pg.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/fonts|CERT|Failed to load resource|Password forms/.test(m.text()))errs.push(name+' '+m.type()+': '+m.text())});
 await pg.goto(URL0);await pg.waitForTimeout(400);return pg}
const ok=(label,v,extra='')=>console.log((v?'PASS ':'FAIL ')+label+(extra?'  ['+extra+']':''));
const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

const admin=await newUser('admin');
await admin.click('#bModeSwitch');await admin.fill('#sE',USERS.admin.email);await admin.fill('#sP','pw12345678');await admin.click('#fStaff button');await admin.waitForTimeout(1200);
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','City of Springfield');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const pid=sql("select id from projects where code='city-of-springfield'");
sql(`insert into profiles (user_id,email,full_name,role,project_id) values ('${USERS.jane.id}','${USERS.jane.email}','Jane Smith','client_lead','${pid}')`);
await admin.click('.tab[data-t="journey"]');await admin.waitForTimeout(400);
ok('admin banner shown with org name', (await admin.textContent('#obb')).includes('You are viewing City of Springfield as FLO Admin. Changes you make are recorded as on behalf of the customer.'));
await admin.screenshot({path:S+'/p5-banner.png'});
// Admin fills org details
await admin.fill('.ifrm[data-type="form_org_details"] [data-f="orgName"]','Springfield Water Dept');await admin.fill('.ifrm[data-type="form_org_details"] [data-f="state"]','IL');
await admin.waitForTimeout(1400);
ok('admin form save is on behalf in DB', sql(`select last_edit_on_behalf::text||'|'||updated_by from form_responses where project_id='${pid}'`)===`true|${USERS.admin.id}`);
// Admin ticks client step 1a -> modal
await admin.click('.stp[data-label="1a"] .sc');await admin.waitForTimeout(300);
ok('on-behalf confirm modal', (await admin.textContent('#mC')).includes('Mark complete on behalf of the customer?') && !(await admin.isChecked('#obMail')));
await admin.check('#obMail');await admin.click('#obGo');await admin.waitForTimeout(1200);
const s1a=await admin.getAttribute('.stp[data-label="1a"] .sc','data-step');
ok('1a completed on behalf in DB', sql(`select completed_on_behalf::text||'|'||completed_by from project_steps where id='${s1a}'`)===`true|${USERS.admin.id}`);
ok('Client Lead email requested', fnCalls.some(c=>c.body&&c.body.kind==='step_completed_on_behalf'&&c.body.step_id===s1a));
ok('admin sees on-behalf attribution', (await admin.textContent('.stp[data-label="1a"] .attr'))===`Completed by FLO (Olivier) on behalf of your team, ${today}`, await admin.textContent('.stp[data-label="1a"] .attr'));
// Cancel path
await admin.click('.stp[data-label="1c"] .sc');await admin.waitForTimeout(200);await admin.click('#mC [data-action="close-modal"]');await admin.waitForTimeout(300);
ok('cancel leaves step open', sql(`select count(*) from project_steps where project_id='${pid}' and done`)==='1');
// FLO-owned step: no modal, not on behalf
await admin.click('.stp[data-label="1d"] .sc');await admin.waitForTimeout(1000);
ok('FLO step: no modal, not on behalf', !(await admin.isVisible('#mW:not(.hid)')) && sql(`select completed_on_behalf from project_steps s join project_phases p on p.id=s.project_phase_id where p.project_id='${pid}' and p.position=1 and s.position=4`)==='f');
ok('FLO step attribution', (await admin.textContent('.stp[data-label="1d"] .attr'))===`Completed by FLO (Olivier), ${today}`);
// Admin uploads on 2a
await admin.click('.pc:nth-child(2) .ph');await admin.waitForTimeout(200);
await admin.setInputFiles('.stp[data-label="2a"] .upc:first-child input[type=file]',{name:'facilities.csv',mimeType:'text/csv',buffer:Buffer.from('a')});await admin.waitForTimeout(1200);
ok('admin upload on behalf', sql(`select on_behalf from uploads where project_id='${pid}'`)==='t' && (await admin.textContent('.stp[data-label="2a"] .upl')).includes('Uploaded by FLO on behalf of your team'));
ok('admin upload did not email admins', !fnCalls.some(c=>c.body&&c.body.kind==='upload'));

// ---- Customer view
const jane=await newUser('jane');
await jane.fill('#lE',USERS.jane.email);await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(1500);
ok('customer has no admin banner', !(await jane.isVisible('#obb')));
ok('customer sees on-behalf completion', (await jane.textContent('.stp[data-label="1a"] .attr'))===`Completed by FLO (Olivier) on behalf of your team, ${today}`);
await jane.click('.stp[data-label="1a"] [data-action="view-submitted"]');await jane.waitForTimeout(200);
ok('customer sees admin-entered data', (await jane.inputValue('.stp[data-label="1a"] .subv [data-f="orgName"]'))==='Springfield Water Dept');
ok('customer sees form on-behalf line', (await jane.textContent('.stp[data-label="1a"] .subv .attr')).startsWith('Last updated by FLO (Olivier) on behalf of your team'));
await jane.click('.pc:nth-child(2) .ph');await jane.waitForTimeout(200);
ok('customer sees upload on behalf', (await jane.textContent('.stp[data-label="2a"] .upl')).includes('Uploaded by FLO on behalf of your team'));
await jane.screenshot({path:S+'/p5-customer.png',fullPage:true});
// Jane completes 1b herself
await jane.click('.stp[data-label="1b"] .sc');await jane.waitForTimeout(1000);
ok('customer own completion attribution', (await jane.textContent('.stp[data-label="1b"] .attr'))===`Completed by Jane Smith, ${today}`);
// Spoof via the API with Jane's token
const s1c=await jane.getAttribute('.stp[data-label="1c"] .sc','data-step');
const status=await jane.evaluate(async ({s1c,adminId})=>{const k=Object.keys(localStorage).find(x=>x.includes('auth-token'));const t=JSON.parse(localStorage.getItem(k)).access_token;
 const r=await fetch('https://test.supabase.co/rest/v1/project_steps?id=eq.'+s1c,{method:'PATCH',headers:{apikey:'anon',Authorization:'Bearer '+t,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({done:true,completed_by:adminId,completed_on_behalf:true})});return r.status},{s1c,adminId:USERS.admin.id});
ok('API spoof of completed_by overwritten by trigger', sql(`select completed_by||'|'||completed_on_behalf from project_steps where id='${s1c}'`)===`${USERS.jane.id}|false`, 'HTTP '+status);

// ---- Activity timeline
await admin.click('.tab[data-t="admin"]');await admin.click('.ani[data-a="activity"]');await admin.waitForTimeout(1000);
const allN=+sql(`select count(*) from activity_log where project_id='${pid}'`), obN=+sql(`select count(*) from activity_log where project_id='${pid}' and on_behalf`);
ok('timeline names the customer', (await admin.textContent('#acT')).includes('Jane Smith') && !(await admin.textContent('#acT')).includes('Former user'));
ok('timeline lists all entries', (await admin.$$('#acT tbody tr')).length===allN, allN+' rows');
ok('timeline shows admin form save on behalf', (await admin.textContent('#acT')).includes('Saved a form') && (await admin.$$('#acT .pill-ob')).length===obN);
await admin.selectOption('#acK','ob');ok('on-behalf filter', (await admin.$$('#acT tbody tr')).length===obN && obN>=3, obN+' on-behalf');
await admin.selectOption('#acK','all');await admin.selectOption('#acU',USERS.jane.id);
const janeN=+sql(`select count(*) from activity_log where project_id='${pid}' and actor_id='${USERS.jane.id}'`);
ok('user filter', (await admin.$$('#acT tbody tr')).length===janeN && janeN>=2, janeN+' by Jane');
await admin.selectOption('#acU','');
const ph1=await admin.$eval('#acP option:nth-child(2)',o=>o.value);await admin.selectOption('#acP',ph1);
const ph2Rows=(await admin.$$eval('#acT tbody tr td:nth-child(4)',t=>t.map(x=>x.textContent)));
ok('phase filter keeps phase 1 only', ph2Rows.length>0 && ph2Rows.every(t=>/^1[a-d] |Phase 1/.test(t)), ph2Rows.join(' | ').slice(0,200));
await admin.selectOption('#acP','');
await admin.screenshot({path:S+'/p5-activity.png'});
const [dl]=await Promise.all([admin.waitForEvent('download'),admin.click('[data-action="act-csv"]')]);
const csv=fs.readFileSync(await dl.path(),'utf8');
ok('CSV export', csv.includes('"When (UTC)","Who","Role","Action"') && csv.trim().split('\r\n').length===allN+1 && csv.includes('"Saved a form"'), dl.suggestedFilename());
console.log('REST errors:', log.filter(l=>l.startsWith('REST')));
console.log('console errors:', errs);
await b.close();
