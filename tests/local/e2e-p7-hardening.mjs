const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mock, mockRealtime, sql, log, control, USERS } from './harness.mjs';
const S=process.env.OUT||'/tmp', URL0='http://localhost:8787/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
async function newUser(name,vp={width:1400,height:1000}){const ctx=await b.newContext({viewport:vp});await mock(ctx);
 await ctx.route('**/.netlify/functions/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
 const pg=await ctx.newPage();await mockRealtime(pg,name);
 pg.on('pageerror',e=>errs.push(name+' pageerror '+e.message));pg.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/fonts|CERT|Failed to load resource|Password forms/.test(m.text()))errs.push(name+' '+m.type()+': '+m.text())});
 await pg.goto(URL0);await pg.waitForTimeout(400);return pg}
const ok=(label,v,extra='')=>console.log((v?'PASS ':'FAIL ')+label+(extra?'  ['+extra+']':''));
const otpLogin=async(pg,email)=>{await pg.fill('#lE',email);await pg.click('#fEmail button');await pg.waitForTimeout(300);await pg.fill('#otp input >> nth=0','123456');await pg.waitForTimeout(1500)};
// Accessible-name audit of visible form controls on the current screen.
const unlabeled=pg=>pg.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].filter(e=>e.offsetParent!==null&&e.type!=='hidden').filter(e=>!(e.labels&&e.labels.length)&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!(e.closest('[aria-labelledby]'))).map(e=>(e.id||e.name||e.dataset.f||e.className||e.type)));

const admin=await newUser('admin');
ok('login page: every field has a label', (await unlabeled(admin)).length===0, (await unlabeled(admin)).join(','));
await admin.click('#bModeSwitch');await admin.fill('#sE',USERS.admin.email);await admin.fill('#sP','pw12345678');await admin.click('#fStaff button');await admin.waitForTimeout(1200);
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','City of Springfield');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const pid=sql("select id from projects where code='city-of-springfield'");
sql(`insert into profiles (user_id,email,full_name,role,project_id) values ('${USERS.jane.id}','${USERS.jane.email}','Jane Smith','client_lead','${pid}'),('${USERS.bart.id}','${USERS.bart.email}','Bart Simpson','client_it','${pid}')`);
for (const sec of ['projects','setup','users','phases','activity','template','resources']) {
  await admin.click(`.ani[data-a="${sec}"]`);await admin.waitForTimeout(700);
  if (await admin.isVisible('#mW:not(.hid)')) await admin.click('[data-action="ed-leave"]').catch(()=>{});
  const u=await unlabeled(admin);ok(`admin ${sec}: every field has a label`, u.length===0, u.join(','));
}

// ---- Customer: keyboard, labels, contrast, errors, session expiry
const jane=await newUser('jane');
await otpLogin(jane,USERS.jane.email);
ok('journey: every field has a label', (await unlabeled(jane)).length===0, (await unlabeled(jane)).join(','));
const hiddenFocusable=await jane.evaluate(()=>{const pb=document.querySelector('.pc:not(.open) .pb input');return pb?getComputedStyle(pb).visibility:'none'});
ok('collapsed phase fields are out of the tab order', hiddenFocusable==='hidden', hiddenFocusable);
await jane.focus('.stp[data-label="1d"]').catch(()=>{});
await jane.focus('.pc:nth-child(2) .ph');await jane.keyboard.press('Enter');await jane.waitForTimeout(500);
ok('keyboard: Enter opens a phase', await jane.evaluate(()=>document.querySelector('.pc:nth-child(2)').classList.contains('open')) && (await jane.getAttribute('.pc:nth-child(2) .ph','aria-expanded'))==='true');
await jane.focus('.stp[data-label="1a"] .sc');
const ring=await jane.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);
ok('visible focus ring on step circle', ring==='solid', ring);
await jane.keyboard.press(' ');await jane.waitForTimeout(900);
ok('keyboard: Space ticks a step', sql(`select count(*) from project_steps where project_id='${pid}' and done`)==='1');
ok('step circle has an accessible name', (await jane.getAttribute('.stp[data-label="1a"] .sc','aria-label')).startsWith('Mark not done: step 1a'));
const colors=await jane.evaluate(()=>{const t={};for(const c of ['ty','tf','tb','td','tl']){const e=document.createElement('span');e.className='ptag '+c;document.body.appendChild(e);t[c]=getComputedStyle(e).color;e.remove()}return t});
ok('tag text colors are the darker AA shades', colors.ty==='rgb(146, 64, 14)' && colors.td==='rgb(22, 101, 52)' && colors.tf==='rgb(15, 118, 110)', JSON.stringify(colors));
// Network error
control.offline=true;
await jane.click('.stp[data-label="1b"] .sc');await jane.waitForTimeout(800);
ok('network error shows a friendly toast', (await jane.textContent('#tC')).includes("We couldn't reach the server. Check your connection and try again."));
control.offline=false;await jane.waitForTimeout(3600);
// Session expiry while typing
await jane.click('.stp[data-label="1a"] [data-action="view-submitted"]');await jane.waitForTimeout(300);
await jane.click('.stp[data-label="1a"] .sc');await jane.waitForTimeout(900); // reopen 1a so its form is editable
control.expired=true;
await jane.fill('.ifrm[data-type="form_org_details"] [data-f="orgName"]','Typed before expiry');
await jane.waitForTimeout(2500);
ok('expired session returns to sign-in', await jane.isVisible('#lp') && !(await jane.isVisible('#app.on')));
ok('expired message shown', (await jane.textContent('#lInfo')).includes('Your session expired, please sign in again'));
ok('email pre-filled after expiry', (await jane.inputValue('#lE'))===USERS.jane.email);
ok('unsaved input not saved yet', sql(`select count(*) from form_responses where project_id='${pid}'`)==='0');
await jane.screenshot({path:S+'/p7-expired.png'});
control.expired=false;
await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(2200);
ok('after signing back in, the kept input is saved', sql(`select data->>'orgName' from form_responses where project_id='${pid}'`)==='Typed before expiry');
ok('customer is told it was saved', (await jane.textContent('#tC')).includes('We saved the changes you made before your session expired.'));
ok('form shows the kept value', (await jane.inputValue('.ifrm[data-type="form_org_details"] [data-f="orgName"]'))==='Typed before expiry');
// Different person after expiry: drafts dropped
await jane.fill('.ifrm[data-type="form_org_details"] [data-f="serviceArea"]','Jane draft');
control.expired=true;await jane.waitForTimeout(2500);control.expired=false;
await jane.fill('#lE','');await otpLogin(jane,USERS.bart.email);
ok('another person signing in does not get the previous draft', sql(`select coalesce(data->>'serviceArea','') from form_responses where project_id='${pid}'`)==='' && !(await jane.textContent('#tC')).includes('We saved the changes'));
// Normal sign-out: no expiry message
await jane.click('.nav-u');await jane.waitForTimeout(500);
ok('normal sign-out shows no expiry message', !(await jane.isVisible('#lInfo.on')) && (await jane.inputValue('#lE'))==='');
// Two tabs (RUNBOOK section 10, step 9): signing out in tab 2 sends tab 1 to
// sign-in with the expiry message, and tab 1's typed input survives.
await otpLogin(jane,USERS.jane.email);
const tab2=await jane.context().newPage();await mockRealtime(tab2,'jane-tab2');
tab2.on('pageerror',e=>errs.push('jane-tab2 pageerror '+e.message));
await tab2.goto(URL0);await tab2.waitForTimeout(1500);
ok('second tab opens signed in', await tab2.isVisible('#app.on'));
// Sign out in tab 2 before tab 1's auto-save (about 1 s) fires.
await jane.fill('.ifrm[data-type="form_org_details"] [data-f="serviceArea"]','Typed in tab 1');
await tab2.click('.nav-u');await jane.waitForTimeout(2000);
ok('sign-out in another tab returns this tab to sign-in', await jane.isVisible('#lp') && !(await jane.isVisible('#app.on')));
ok('other-tab sign-out shows the expiry message', (await jane.textContent('#lInfo')).includes('Your session expired, please sign in again'));
await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(2200);
ok('tab 1 input is saved after signing back in', sql(`select data->>'serviceArea' from form_responses where project_id='${pid}'`)==='Typed in tab 1');
await tab2.close();await jane.click('.nav-u');await jane.waitForTimeout(500);
// ---- Mobile 375: no horizontal overflow on key screens
const mob=await newUser('mobile',{width:375,height:800});
const overflow=async()=>mob.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
ok('375px login: no horizontal scroll', !(await overflow()));
await otpLogin(mob,USERS.jane.email);
ok('375px journey: no horizontal scroll', !(await overflow()), await mob.evaluate(()=>document.documentElement.scrollWidth));
await mob.click('.tab[data-t="status"]');await mob.waitForTimeout(400);
ok('375px status: no horizontal scroll', !(await overflow()), await mob.evaluate(()=>document.documentElement.scrollWidth));
console.log('REST errors:', log.filter(l=>l.startsWith('REST')));
console.log('console errors:', errs);
await b.close();
