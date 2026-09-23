const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mock, mockRealtime, pushChange, sql, log, resources, USERS } from './harness.mjs';
const S=process.env.OUT || '/tmp', URL0='http://localhost:8787/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
async function newUser(name,vp={width:1400,height:1000}){const ctx=await b.newContext({viewport:vp});await mock(ctx);
 await ctx.route('**/.netlify/functions/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
 const pg=await ctx.newPage();await mockRealtime(pg,name);
 pg.on('pageerror',e=>errs.push(name+' pageerror '+e.message));pg.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/fonts|CERT|Failed to load resource|Password forms/.test(m.text()))errs.push(name+' '+m.type()+': '+m.text())});
 await pg.goto(URL0);await pg.waitForTimeout(400);return pg}
const ok=(label,v,extra='')=>console.log((v?'PASS ':'FAIL ')+label+(extra?'  ['+extra+']':''));
const mimeOf=()=>0;
const pdf=(t)=>Buffer.from('%PDF-1.4\n% '+t+'\n%%EOF');
const setting=k=>sql(`select coalesce(value::text,'') from app_settings where key='${k}'`);

const admin=await newUser('admin');
await admin.click('#bModeSwitch');await admin.fill('#sE',USERS.admin.email);await admin.fill('#sP','pw12345678');await admin.click('#fStaff button');await admin.waitForTimeout(1200);
await admin.click('[data-action="new-project"]');await admin.fill('#pNm','City of Springfield');await admin.click('[data-action="save-project"]');await admin.waitForTimeout(1500);
const pid=sql("select id from projects where code='city-of-springfield'");
sql(`insert into profiles (user_id,email,full_name,role,project_id) values ('${USERS.jane.id}','${USERS.jane.email}','Jane Smith','client_lead','${pid}')`);
await admin.click('.tab[data-t="journey"]');await admin.waitForTimeout(300);
ok('no resources set: strip hidden', !(await admin.isVisible('#jRes')) && (await admin.innerHTML('#jRes'))==='');
await admin.click('.tab[data-t="admin"]');await admin.click('.ani[data-a="resources"]');await admin.waitForTimeout(800);
// video validation
await admin.fill('#rVid','https://vimeo.com/12345');await admin.click('[data-action="res-video-save"]');await admin.waitForTimeout(300);
ok('non-YouTube URL rejected', (await admin.textContent('#rVidErr')).includes('not a YouTube') && setting('overview_video_url')==='');
await admin.fill('#rVid','https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');await admin.click('[data-action="res-video-preview"]');await admin.waitForTimeout(500);
ok('preview opens wide modal with nocookie embed', (await admin.getAttribute('#mC iframe','src'))==='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1' && (await admin.getAttribute('#mC','class')).includes('wide'));
await admin.keyboard.press('Escape');await admin.waitForTimeout(200);
ok('Escape closes and removes the iframe', !(await admin.isVisible('#mW')) && (await admin.$$('iframe')).length===0);
await admin.click('[data-action="res-video-save"]');await admin.waitForTimeout(1000);
ok('video URL saved and logged', setting('overview_video_url')==='"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"' && sql("select count(*) from activity_log where project_id is null and action='resource_updated' and target='overview_video_url'")==='1');
// manual upload
await admin.setInputFiles('#rf-manual',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('x')});await admin.click('[data-action="res-upload"][data-kind="manual"]');await admin.waitForTimeout(400);
ok('non-PDF refused', !setting('manual_file_path').includes('path'));
await admin.setInputFiles('#rf-manual',{name:'big.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(21*1048576)});await admin.click('[data-action="res-upload"][data-kind="manual"]');await admin.waitForTimeout(400);
ok('over 20 MB refused', !setting('manual_file_path').includes('path'));
await admin.setInputFiles('#rf-manual',{name:'FLO_Onboarding_User_Manual_v2.pdf',mimeType:'application/pdf',buffer:pdf('v2')});await admin.click('[data-action="res-upload"][data-kind="manual"]');await admin.waitForTimeout(1500);
const m1=JSON.parse(setting('manual_file_path'));
ok('manual stored under manual/ with metadata', m1.path.startsWith('manual/') && m1.file_name==='FLO_Onboarding_User_Manual_v2.pdf' && m1.size_bytes>0 && resources.has(m1.path));
ok('admin sees current file + Download current', (await admin.textContent('#aC')).includes('FLO_Onboarding_User_Manual_v2.pdf') && await admin.isVisible('text=Download current'));
// template upload
await admin.setInputFiles('#rf-template',{name:'FLO_Onboarding_Forms.xlsx',mimeType:'',buffer:Buffer.from('PK')});await admin.click('[data-action="res-upload"][data-kind="template"]');await admin.waitForTimeout(1500);
const t1=JSON.parse(setting('master_template_path'));
ok('template stored under templates/ (even with an empty browser file type)', t1.path.startsWith('templates/') && resources.has(t1.path));
// CCC
await admin.fill('#rCcc','javascript:alert(1)');await admin.click('[data-action="res-ccc-save"]');await admin.waitForTimeout(300);
ok('bad CCC link rejected', (await admin.textContent('#rCccErr')).length>0);
await admin.fill('#rCcc','https://example.com/ccc');await admin.click('[data-action="res-ccc-save"]');await admin.waitForTimeout(900);
ok('CCC link saved', setting('ccc_assessment_url')==='"https://example.com/ccc"');
ok('recent changes list', (await admin.textContent('#aC')).includes('User manual updated'));
await admin.screenshot({path:S+'/p6-admin-resources.png',fullPage:true});

// ---- Customer
const jane=await newUser('jane');
await jane.fill('#lE',USERS.jane.email);await jane.click('#fEmail button');await jane.waitForTimeout(300);await jane.fill('#otp input >> nth=0','123456');await jane.waitForTimeout(1500);
const cards=await jane.$$eval('#jRes .rct',x=>x.map(e=>e.textContent));
ok('customer sees both cards', cards.join('|')==='Watch the 3-minute overview|Download the user manual (PDF)');
ok('strip sits between greeting and next-step card', await jane.evaluate(()=>{const g=document.getElementById('jG').getBoundingClientRect(),r=document.getElementById('jRes').getBoundingClientRect(),n=document.getElementById('jNx').getBoundingClientRect();return g.bottom<=r.top && r.bottom<=n.top}));
ok('manual shows updated date', (await jane.textContent('#jRes')).includes('Updated '));
await jane.screenshot({path:S+'/p6-journey.png'});
await jane.click('[data-action="play-overview"]');await jane.waitForTimeout(800);
ok('customer video plays in popup (iframe loaded)', (await jane.getAttribute('#mC iframe','src')).startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') && log.some(l=>l.startsWith('YT ')));
const mw=await jane.$eval('#mC',e=>Math.round(e.getBoundingClientRect().width));const ar=await jane.$eval('#mC iframe',e=>{const r=e.getBoundingClientRect();return (r.width/r.height).toFixed(2)});
ok('modal 880px wide, 16:9', mw===880 && ar==='1.78', mw+'px '+ar);
await jane.screenshot({path:S+'/p6-video.png'});
for(let k=0;k<6;k++) await jane.keyboard.press('Tab');
ok('focus trapped in modal', await jane.evaluate(()=>document.getElementById('mC').contains(document.activeElement)));
await jane.keyboard.press('Shift+Tab');await jane.keyboard.press('Shift+Tab');await jane.keyboard.press('Shift+Tab');
ok('focus trapped (shift+tab)', await jane.evaluate(()=>document.getElementById('mC').contains(document.activeElement)));
await jane.evaluate(()=>document.getElementById('jG').setAttribute('tabindex','-1'));await jane.focus('#jG');
ok('focus pulled back if it escapes the dialog', await jane.evaluate(()=>document.getElementById('mC').contains(document.activeElement)));
await jane.focus('#mC [data-action="close-modal"]');await jane.keyboard.press('Escape');await jane.waitForTimeout(200);
ok('Escape stops playback (iframe removed), focus returns', (await jane.$$('iframe')).length===0 && await jane.evaluate(()=>document.activeElement.dataset.action==='play-overview'));
await jane.click('[data-action="play-overview"]');await jane.waitForTimeout(300);await jane.click('#mC [data-action="close-modal"]');await jane.waitForTimeout(200);
ok('Close button also removes iframe', (await jane.$$('iframe')).length===0);
const href=await jane.getAttribute('#jRes a.rcard','href');
const st=await jane.evaluate(async h=>{const r=await fetch(h);const t=await r.text();return r.status+' '+(t.includes('%PDF-1.4')?'pdf':'?')+(t.includes('% v2')?' v2':'')},href);
ok('manual downloads', href.includes('/object/public/resources/'+m1.path.replace(/ /g,'%20')) && href.includes('download=') && st==='200 pdf v2', st);
// template in upload widget
await jane.click('.pc:nth-child(2) .ph');await jane.waitForTimeout(200);
ok('Option B uses uploaded template', (await jane.getAttribute('.stp[data-label="2a"] a[download]','href')).includes(t1.path));
ok('CCC link on schedule step', await jane.isVisible('a[href="https://example.com/ccc"]'));

// ---- Admin replaces manual -> customer gets new file right away
await admin.setInputFiles('#rf-manual',{name:'FLO_Onboarding_User_Manual_v3.pdf',mimeType:'application/pdf',buffer:pdf('v3')});await admin.click('[data-action="res-upload"][data-kind="manual"]');await admin.waitForTimeout(1500);
const m2=JSON.parse(setting('manual_file_path'));
ok('old manual file deleted, new one stored', !resources.has(m1.path) && resources.has(m2.path));
pushChange('jane','app_settings',{key:'manual_file_path'});await jane.waitForTimeout(900);
const href2=await jane.getAttribute('#jRes a.rcard','href');
const st2=await jane.evaluate(async h=>{const r=await fetch(h);const t=await r.text();return t.includes('% v3')?'v3':t.includes('% v2')?'v2':'?'},href2);
ok('customer gets the new manual without reloading', href2.includes(m2.path.split('/')[1].replace(/ /g,'%20')) && st2==='v3', st2);
// ---- Clear video -> card hidden
await admin.fill('#rVid','');await admin.click('[data-action="res-video-save"]');await admin.waitForTimeout(900);
pushChange('jane','app_settings',{key:'overview_video_url'});await jane.waitForTimeout(900);
ok('no video URL: video card hidden', !(await jane.isVisible('[data-action="play-overview"]')) && await jane.isVisible('#jRes a.rcard'));
// ---- YouTube URL formats
const ids=await jane.evaluate(async()=>{const m=await import('/js/resources.js');return ['https://youtu.be/dQw4w9WgXcQ?si=abc','https://www.youtube.com/embed/dQw4w9WgXcQ','https://youtube.com/shorts/dQw4w9WgXcQ','https://m.youtube.com/watch?v=dQw4w9WgXcQ','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0','https://www.youtube.com/live/dQw4w9WgXcQ','https://evil.com/watch?v=dQw4w9WgXcQ','javascript:alert(1)','https://youtu.be/short'].map(m.youtubeId)});
ok('URL formats parsed, bad ones rejected', ids.slice(0,6).every(x=>x==='dQw4w9WgXcQ') && ids.slice(6).every(x=>x===''), ids.join(','));
// ---- Mobile stacking
const mob=await newUser('jane-mobile',{width:375,height:800});
await mob.fill('#lE',USERS.jane.email);await mob.click('#fEmail button');await mob.waitForTimeout(300);await mob.fill('#otp input >> nth=0','123456');await mob.waitForTimeout(1500);
await admin.fill('#rVid','https://youtu.be/dQw4w9WgXcQ');await admin.click('[data-action="res-video-save"]');await admin.waitForTimeout(900);
pushChange('jane-mobile','app_settings',{key:'overview_video_url'});await mob.waitForTimeout(900);
const boxes=await mob.$$eval('#jRes .rcard',x=>x.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]}));
ok('mobile: cards stacked', boxes.length===2 && boxes[0][0]===boxes[1][0] && boxes[1][1]>boxes[0][1], JSON.stringify(boxes));
await mob.screenshot({path:S+'/p6-mobile.png'});
console.log('REST errors:', log.filter(l=>l.startsWith('REST')));
console.log('console errors (incl. CSP):', errs);
await b.close();
