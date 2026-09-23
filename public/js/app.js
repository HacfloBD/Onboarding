import './network-canvas.js';
import { escapeHtml } from './escape.js';
import { initAuth, signOut } from './auth.js';
import { listProjects, saveProject, listProfiles, callFunction } from './data.js';
import { portalUrl } from './supabase.js';

const E={
project:{id:'',name:'',clientName:'',csmName:'',startDate:'',targetGoLive:'',state:'',testerCompanies:0,facilities:0,legacySystem:'',testingFrequency:'',testingFrequencyNotes:''},
kickoff:{orgName:'',serviceArea:'',state:'',projectLead:'',projectLeadTitle:'',projectLeadEmail:'',projectLeadPhone:'',itContact:'',itContactEmail:'',numTesters:'',numFacilities:'',legacySystem:'',testingFrequency:'',testingFrequencyNotes:'',jurisdictionalNotes:'',roles:''},
phases:[
{id:1,name:'Kick-off & Discovery',short:'Kick-off',owner:'both',status:'active',dur:'Week 1',desc:'Let\'s get aligned. Fill in your organization details, confirm key contacts, and tell us about your current setup. This information helps us configure everything correctly.',
steps:[
{id:'1a',text:'Fill in your organization details',owner:'client',done:false,type:'form_kickoff',detail:'Enter your organization name, service area, key contacts, and current system info below.'},
{id:'1b',text:'Select your testing frequency model',owner:'client',done:false,type:'form_frequency',detail:'How does your jurisdiction determine when backflow assemblies are due for testing? Select from the options below.'},
{id:'1c',text:'Download the master data spreadsheet',owner:'client',done:false,type:'download_master',detail:'This single Excel file has 8 tabs (A through H) for all the data we need: facilities, contacts, assemblies, testers, test history, and more. Start filling it in now and upload it in Phase 2.'},
{id:'1d',text:'FLO reviews your kick-off information and prepares the platform',owner:'flo',done:false,detail:'We will review everything you submitted and prepare the migration environment. We may reach out if we have questions.'}
]},
{id:2,name:'Data Collection & Intake',short:'Data Collection',owner:'client',status:'pending',dur:'1-2 Weeks',desc:'Fill in the master spreadsheet you downloaded in Phase 1 and upload it here when ready. The spreadsheet has 8 tabs covering facilities, contacts, assemblies, tester companies, tester users, test kits, test history, and survey history. Take your time and work at your own pace.',
steps:[
{id:'2a',text:'Complete and upload the master data spreadsheet',owner:'client',done:false,type:'upload_master',detail:'Fill in all 8 tabs of the FLO_Onboarding_Forms.xlsx file. Required fields are highlighted in yellow. When ready, upload it here or share a Google Drive / SharePoint link.'},
{id:'2b',text:'FLO validates your data and flags any issues',owner:'flo',done:false,detail:'We check for completeness, duplicates, and formatting issues. If anything needs fixing, we will let you know exactly what and where.'}
]},
{id:3,name:'Data Migration & Cleanup',short:'Migration',owner:'flo',status:'pending',dur:'1-2 Weeks',desc:'The FLO team takes your submitted data, cleans it up, removes duplicates, and imports it into a staging environment. You don\'t need to do anything here except be available if we have clarifying questions.',
steps:[
{id:'3a',text:'FLO deduplicates and cleans your data',owner:'flo',done:false,detail:'We match facilities by address, assemblies by serial number, and link all records together.'},
{id:'3b',text:'FLO imports data into staging environment',owner:'flo',done:false,detail:'Your data goes into a test version of the platform so we can verify everything before going live.'},
{id:'3c',text:'Review your data in the staging environment',owner:'client',done:false,detail:'We will walk you through the imported data on a call. Check that facilities, assemblies, and contacts look correct.'},
{id:'3d',text:'Confirm your migrated data is accurate',owner:'client',done:false,detail:'Sign off that the data in staging matches your records. This is the green light to proceed with configuration.'}
]},
{id:4,name:'Notice & Notification Setup',short:'Notices',owner:'both',status:'pending',dur:'2-3 Days',desc:'The platform sends automated notices to property owners and tester companies (test due reminders, overdue alerts, certification expiry warnings, etc.). We provide default templates that you can review, duplicate, and customize to match your jurisdiction\'s tone and requirements.',
steps:[
{id:'4a',text:'Review the default notice templates',owner:'client',done:false,detail:'We provide ready-made templates for: test due reminders (60/30/7 day), overdue notices, non-compliance notices, tester certification expiry, and gauge calibration expiry. Review each one.'},
{id:'4b',text:'Customize notice templates for your jurisdiction',owner:'client',done:false,detail:'Duplicate any template and edit the wording, add your logo, regulatory references, or legal language required by your state/local rules.'},
{id:'4c',text:'Provide your preferred sender name and reply-to email',owner:'client',done:false,type:'form_email',detail:'What name and email should notices come from? For example: "Springfield Water - Backflow Compliance" / backflow@springfield.gov'},
{id:'4d',text:'FLO configures notice templates in the platform',owner:'flo',done:false,detail:'We load your approved templates and configure the sending schedule.'}
]},
{id:5,name:'Platform Configuration',short:'Config',owner:'flo',status:'pending',dur:'3-5 Days',desc:'FLO configures the platform based on everything you provided: your testing frequency model, jurisdiction rules, notice templates, and compliance thresholds. No action needed from you here.',
steps:[
{id:'5a',text:'FLO configures compliance rules and testing frequency',owner:'flo',done:false,detail:'Based on your Phase 1 answers, we set up your compliance calendar, due date calculations, and grace periods.'},
{id:'5b',text:'FLO configures notice automation and schedules',owner:'flo',done:false,detail:'Your approved notice templates are connected to the compliance engine with the correct triggers and timing.'},
{id:'5c',text:'FLO sends you a configuration summary for review',owner:'flo',done:false,detail:'We provide a document showing all settings so you can verify before training begins.'},
{id:'5d',text:'Confirm the configuration looks correct',owner:'client',done:false,detail:'Review the configuration summary. If anything needs adjusting, let us know.'}
]},
{id:6,name:'Training',short:'Training',owner:'flo',status:'pending',dur:'1 Week',desc:'Learn how to use the platform. Training covers managing users (you can add your own team members in self-service), running reports, submitting tests, and managing compliance workflows.',
steps:[
{id:'6a',text:'Schedule training sessions with your FLO CSM',owner:'both',done:false,detail:'We will arrange live sessions for your admin team (2 hrs) and staff (1.5 hrs). Tester companies get their own session or self-serve LMS access.'},
{id:'6b',text:'Attend Utility Admin Training',owner:'client',done:false,detail:'Covers: full platform walkthrough, adding/managing users, running reports, managing notices, and compliance dashboards.'},
{id:'6c',text:'Attend Utility Staff Training',owner:'client',done:false,detail:'Covers: searching facilities, viewing assemblies, reviewing test results, and generating compliance reports.'},
{id:'6d',text:'FLO provides LMS access for all users',owner:'flo',done:false,detail:'Self-paced video modules for ongoing reference, including tester company onboarding, field tester orientation, and advanced reporting.'},
{id:'6e',text:'Add your team members to the platform (self-service)',owner:'client',done:false,detail:'Now that you know how, add your staff and tester companies directly in the platform. No need to go through FLO for this.'}
]},
{id:7,name:'UAT & Go-Live',short:'Go-Live',owner:'both',status:'pending',dur:'3-5 Days',desc:'The final check. You test the platform in production with real data, verify everything works, and give us the thumbs up to go live.',
steps:[
{id:'7a',text:'Log in as Utility Admin and verify your dashboard',owner:'client',done:false,detail:'Make sure you can see all facilities, assemblies, and contacts.'},
{id:'7b',text:'Search for 3+ facilities and verify data accuracy',owner:'client',done:false,detail:'Spot-check that addresses, account numbers, and assembly details match your records.'},
{id:'7c',text:'Submit a test report in test mode',owner:'both',done:false,detail:'Walk through the test submission flow as a field tester to make sure reports appear correctly.'},
{id:'7d',text:'Trigger a notice send in test mode',owner:'both',done:false,detail:'Send a test notice to yourself and verify the email arrives with correct content and formatting.'},
{id:'7e',text:'Verify due dates are calculating correctly',owner:'client',done:false,detail:'Check 3+ assemblies to confirm their next test due dates match your testing frequency model.'},
{id:'7f',text:'Run a compliance status report',owner:'client',done:false,detail:'Generate a report and verify the numbers make sense: total assemblies, compliant, overdue, etc.'},
{id:'7g',text:'Sign off on UAT',owner:'client',done:false,detail:'Confirm everything looks good. This is your formal approval to go live.'},
{id:'7h',text:'Go-live date confirmed and platform is LIVE!',owner:'both',done:false,detail:'We flip the switch. Your platform is live and your compliance engine starts running.'}
]}
],
forms:{uploaded:false,fileName:null,fileUrl:null},
notices:{senderName:'',replyTo:''}
};

let U=null,D=null,P=null;
// Phase and step progress still lives in localStorage until Prompt 3. Users and projects are in Supabase.
function init(){const s=localStorage.getItem('flo_v3');D=s?JSON.parse(s):JSON.parse(JSON.stringify(E));delete D.users;save()}
function save(){localStorage.setItem('flo_v3',JSON.stringify(D))}
function reset(){localStorage.removeItem('flo_v3');init();if(P)useProject(P);toast('Reset','info');if(U)render()}

function enter(u,project){U=u;if(project)useProject(project);document.getElementById('lp').style.display='none';document.getElementById('app').classList.add('on');render()}
function leaveApp(){U=null;P=null;document.getElementById('lp').style.display='';document.getElementById('app').classList.remove('on');cMo()}
function logout(){signOut()}

// The selected Supabase project drives the name, CSM and go-live shown in the journey and status views.
function useProject(p){P=p;D.project.id=p.code;D.project.name=p.name;D.project.csmName=p.csm_name||'';D.project.targetGoLive=p.target_go_live||'';save()}
const slug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const ADMIN_PROJECT_KEY='flo_admin_project';
function prefGet(){try{return localStorage.getItem(ADMIN_PROJECT_KEY)}catch{return null}}
function prefSet(id){try{id?localStorage.setItem(ADMIN_PROJECT_KEY,id):localStorage.removeItem(ADMIN_PROJECT_KEY)}catch{}}

const RL={client_lead:'Client Lead',client_it:'IT Contact',admin:'FLO Admin',utility_staff:'Utility Staff'};
function render(){
const ia=U.role==='admin',fn=U.name.split(' ')[0],ini=U.name.split(' ').map(n=>n[0]).join('');
const h=new Date().getHours(),g=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
document.getElementById('nPr').textContent=D.project.name||'Setup required';
document.getElementById('nAv').textContent=ini;document.getElementById('nNm').textContent=U.name;document.getElementById('nRl').textContent=RL[U.role]||U.role;
document.getElementById('admTab').classList.toggle('hid',!ia);document.getElementById('jG').textContent=`${g}, ${fn}! 👋`;
rJ();rSt();if(ia)aGo('project');goTab(ia?'admin':'journey');
}

function rJ(){
const ph=D.phases;
const nx=findNext();
document.getElementById('jNx').innerHTML=nx?`<div class="na" onclick="jump(${nx.pid},'${nx.sid}')"><div class="nai">▶</div><div class="nab"><div class="nal">Next Step</div><div class="nat">${nx.text}</div><div class="nad">Phase ${nx.pid}: ${nx.pname}</div></div><div class="nag">→</div></div>`:'';

document.getElementById('jPh').innerHTML=ph.map(p=>{
const dn=p.status==='complete',ac=p.status==='active';
const cls=[dn?'done':ac?'act':'',ac?'open':''].filter(Boolean).join(' ');
const tag=dn?'<span class="ptag td">Complete</span>':ac?(p.owner==='client'?'<span class="ptag ty">Your Turn</span>':p.owner==='flo'?'<span class="ptag tf">FLO Working</span>':'<span class="ptag tb">Joint</span>'):'<span class="ptag tl">Upcoming</span>';
const dot=dn?'✓':p.id;

const stepsH=p.steps.map(s=>{
const isFlo=s.owner==='flo';
const ck=s.done?'dn':isFlo?'fl':'';
let extra='';
if(s.type==='form_kickoff'&&!s.done) extra=renderKickoffForm();
if(s.type==='form_frequency'&&!s.done) extra=renderFreqForm();
if(s.type==='download_master'&&!s.done) extra=`<div class="sact"><a href="/assets/files/FLO_Onboarding_Forms.xlsx" download class="btn btn-p btn-sm">⬇ Download Master Spreadsheet</a></div><div style="font-size:.78rem;color:var(--g5);margin-top:6px">Single Excel file with 8 tabs: Facilities, Contacts, Assemblies, Tester Companies, Tester Users, Test Kits, Test History, Survey History. Start filling it in now.</div>`;
if(s.type==='upload_master') extra=renderUploadArea();
if(s.type==='form_email'&&!s.done) extra=renderEmailForm();
const fb=isFlo?'<span class="fbadge">FLO</span>':'';
return`<div class="stp" id="s-${s.id}"><div class="sc ${ck}" onclick="event.stopPropagation();tgl(${p.id},'${s.id}')">${s.done?'✓':isFlo?'⏳':''}</div><div class="sb"><div class="stitle">${s.text}${fb}</div>${s.detail?`<div class="sdet">${s.detail}</div>`:''}${extra}</div></div>`;
}).join('');

const compH=dn?`<div class="comp"><div class="ce">🎉</div><h3>Phase ${p.id} Complete!</h3><p>${compMsg(p.id)}</p></div>`:'';
return`<div class="pc ${cls}" id="p-${p.id}"><div class="ph" onclick="tP(${p.id})"><div class="pn">${dot}</div><div class="pi"><div class="pt">Phase ${p.id}: ${p.name}</div><div class="pm"><span>${p.dur}</span><span>${p.owner==='client'?'You lead':p.owner==='flo'?'FLO leads':'Joint effort'}</span></div></div>${tag}<div class="pa">▼</div></div><div class="pb"><div class="px"><p class="pdesc">${p.desc}</p>${stepsH}${compH}</div></div></div>`;
}).join('');
}

function renderKickoffForm(){
const k=D.kickoff;
return`<div class="ifrm">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
<div class="fg"><label>Organization / Utility Name *</label><input value="${escapeHtml(k.orgName)}" onchange="D.kickoff.orgName=this.value;save()" placeholder="City of Springfield Water Dept"></div>
<div class="fg"><label>Primary Service Area *</label><input value="${escapeHtml(k.serviceArea)}" onchange="D.kickoff.serviceArea=this.value;save()" placeholder="City / County / District"></div>
<div class="fg"><label>State *</label><input value="${escapeHtml(k.state)}" onchange="D.kickoff.state=this.value;save()" placeholder="2-letter code" maxlength="2"></div>
<div class="fg"><label>Your Name (Project Lead) *</label><input value="${escapeHtml(k.projectLead)}" onchange="D.kickoff.projectLead=this.value;save()" placeholder="Full name"></div>
<div class="fg"><label>Your Title *</label><input value="${escapeHtml(k.projectLeadTitle)}" onchange="D.kickoff.projectLeadTitle=this.value;save()"></div>
<div class="fg"><label>Your Email *</label><input value="${escapeHtml(k.projectLeadEmail)}" onchange="D.kickoff.projectLeadEmail=this.value;save()"></div>
<div class="fg"><label>Your Phone *</label><input value="${escapeHtml(k.projectLeadPhone)}" onchange="D.kickoff.projectLeadPhone=this.value;save()" placeholder="10-digit"></div>
<div class="fg"><label>IT Contact Name *</label><input value="${escapeHtml(k.itContact)}" onchange="D.kickoff.itContact=this.value;save()" placeholder="For technical setup"></div>
<div class="fg"><label>IT Contact Email *</label><input value="${escapeHtml(k.itContactEmail)}" onchange="D.kickoff.itContactEmail=this.value;save()"></div>
<div class="fg"><label>Approx. Tester Companies</label><input type="number" value="${escapeHtml(k.numTesters)}" onchange="D.kickoff.numTesters=this.value;save()"></div>
<div class="fg"><label>Approx. Facilities / Locations</label><input type="number" value="${escapeHtml(k.numFacilities)}" onchange="D.kickoff.numFacilities=this.value;save()"></div>
<div class="fg"><label>Current System *</label><input value="${escapeHtml(k.legacySystem)}" onchange="D.kickoff.legacySystem=this.value;save()" placeholder="Excel, Google Sheets, paper, other software"></div>
</div>
<div class="fg" style="margin-top:12px"><label>Team roles and responsibilities</label><textarea onchange="D.kickoff.roles=this.value;save()" placeholder="List who on your team will be involved and their role (e.g. 'Jane Smith - will manage tester company approvals, Tom Chen - IT admin for email setup')">${escapeHtml(k.roles)}</textarea><div class="hint">This helps us know who to loop in at each phase.</div></div>
<div class="fg"><label>Jurisdictional compliance notes</label><textarea onchange="D.kickoff.jurisdictionalNotes=this.value;save()" placeholder="Any state or local rules we should know about? Special requirements, exemptions, or regulatory references.">${escapeHtml(k.jurisdictionalNotes)}</textarea></div>
</div>`;
}

function renderFreqForm(){
const k=D.kickoff;
return`<div class="ifrm">
<div class="fg"><label>Testing Frequency Model *</label>
<select onchange="D.kickoff.testingFrequency=this.value;save()" style="padding:10px 14px">
<option value="" ${!k.testingFrequency?'selected':''}>-- Select a model --</option>
<option value="calendar_year" ${k.testingFrequency==='calendar_year'?'selected':''}>Calendar Year</option>
<option value="rolling_12" ${k.testingFrequency==='rolling_12'?'selected':''}>Rolling 12 Months</option>
<option value="fixed_anniversary" ${k.testingFrequency==='fixed_anniversary'?'selected':''}>Fixed Anniversary Date</option>
<option value="custom" ${k.testingFrequency==='custom'?'selected':''}>Custom / Hybrid</option>
</select></div>
<div style="background:var(--cy0);border:1px solid rgba(45,212,191,.2);border-radius:var(--r);padding:14px;margin-bottom:12px;font-size:.82rem;color:var(--g7);line-height:1.6">
<strong style="color:var(--tl)">What do these mean?</strong><br>
<strong>Calendar Year:</strong> All assemblies due by Dec 31. Clock resets Jan 1. Creates year-end workload concentration.<br>
<strong>Rolling 12 Months:</strong> Each assembly due 12 months from its last passing test. Spreads workload evenly throughout the year.<br>
<strong>Fixed Anniversary:</strong> Each assembly due on the same date each year, based on installation or first test date.<br>
<strong>Custom / Hybrid:</strong> Different frequencies for different assembly types or hazard levels (e.g. RP every 6 months, DC annually).
</div>
<div class="fg"><label>Notes or regulatory references</label><textarea onchange="D.kickoff.testingFrequencyNotes=this.value;save()" placeholder="e.g. 'State code section 64.xxx mandates calendar year' or 'We chose rolling 12 months because it distributes workload better for our tester companies'">${escapeHtml(k.testingFrequencyNotes)}</textarea></div>
</div>`;
}

function renderUploadArea(){
const f=D.forms;
return`<div style="margin-top:8px">${f.uploaded?`<div class="uf">📄 <span class="ufn">${escapeHtml(f.fileName||'Uploaded')}</span> ✓</div>${f.fileUrl?`<div style="font-size:.78rem;color:var(--g5);margin-top:4px">Link: ${escapeHtml(f.fileUrl)}</div>`:''}`:`
<div class="sact" style="margin-bottom:8px"><a href="/assets/files/FLO_Onboarding_Forms.xlsx" download class="btn btn-s btn-sm">⬇ Need the template again?</a></div>
<div class="uz"><input type="file" accept=".xlsx,.xls,.csv" onchange="doUpload(this)"><div class="uzt">📎 <strong>Click to upload</strong> your completed spreadsheet<br><span style="font-size:.76rem;color:var(--g4)">.xlsx, .xls, or .csv</span></div></div>
<div style="margin-top:10px"><div class="fg" style="margin-bottom:0"><label>Or paste a sharing link (Google Drive, SharePoint, etc.)</label><input id="ulnk" placeholder="https://drive.google.com/..." onchange="D.forms.fileUrl=this.value;save()"><div class="hint">Make sure the link has view access for your FLO CSM</div></div>
<button class="btn btn-p btn-sm" style="margin-top:8px" onclick="saveLink()">Save Link</button></div>`}</div>`;
}

function renderEmailForm(){
return`<div class="ifrm">
<div class="fg"><label>Sender Display Name *</label><input value="${escapeHtml(D.notices.senderName)}" onchange="D.notices.senderName=this.value;save()" placeholder="e.g. Springfield Water - Backflow Compliance"></div>
<div class="fg"><label>Reply-to Email Address *</label><input value="${escapeHtml(D.notices.replyTo)}" onchange="D.notices.replyTo=this.value;save()" placeholder="e.g. backflow@springfieldwater.gov"><div class="hint">Where replies from property owners and testers will go</div></div>
</div>`;
}

function doUpload(inp){if(inp.files.length){D.forms.uploaded=true;D.forms.fileName=inp.files[0].name;save();rJ();toast('File uploaded: '+escapeHtml(inp.files[0].name),'ok')}}
function saveLink(){const v=document.getElementById('ulnk')?.value?.trim();if(v){D.forms.uploaded=true;D.forms.fileUrl=v;if(!D.forms.fileName)D.forms.fileName='Shared link';save();rJ();toast('Link saved','ok')}}

function findNext(){for(const p of D.phases){if(p.status==='complete')continue;for(const s of p.steps){if(!s.done&&s.owner!=='flo')return{pid:p.id,sid:s.id,text:s.text,pname:p.name}}
for(const s of p.steps){if(!s.done)return{pid:p.id,sid:s.id,text:s.text,pname:p.name}}return null}return null}

function jump(pid,sid){goTab('journey');const el=document.getElementById('p-'+pid);if(el&&!el.classList.contains('open'))el.classList.add('open');
setTimeout(()=>{const s=document.getElementById('s-'+sid);if(s)s.scrollIntoView({behavior:'smooth',block:'center'})},300)}

function tP(pid){document.getElementById('p-'+pid).classList.toggle('open')}

function tgl(pid,sid){
const p=D.phases.find(x=>x.id===pid),s=p.steps.find(x=>x.id===sid);
if(s.owner==='flo'&&U.role!=='admin')return;
s.done=!s.done;
if(p.steps.every(x=>x.done)){p.status='complete';const nx=D.phases.find(x=>x.id===pid+1);if(nx&&nx.status==='pending')nx.status='active';save();render();showComp(pid);return}
if(p.status==='pending'){p.status='active'}
save();rJ();rSt();
}

function showComp(pid){
document.getElementById('mC').innerHTML=`<div style="text-align:center;padding:16px 0"><div style="font-size:3.5rem;margin-bottom:14px">🎉</div><h2 style="font-size:1.3rem;margin-bottom:10px">Phase ${pid} Complete!</h2><p style="color:var(--g6);font-size:.92rem;max-width:380px;margin:0 auto;line-height:1.6">${compMsg(pid)}</p><div class="ma" style="justify-content:center"><button class="btn btn-p btn-lg" onclick="cMo()">Continue →</button></div></div>`;
document.getElementById('mW').classList.remove('hid');
}

function compMsg(pid){return{
1:'Great start! Your kick-off info is submitted. Next: fill in the master data spreadsheet and upload it in Phase 2. You can start right away.',
2:'All data submitted! The FLO team will now clean and migrate it. We may reach out with clarifying questions. Typical turnaround: 1-2 weeks.',
3:'Your data is migrated and verified! Next: notice and notification setup. We will provide default templates for you to review and customize.',
4:'Notices configured! Next: FLO will configure the full platform based on everything you have provided.',
5:'Platform configured! Next: training. You will learn how to use the platform and add your own team members.',
6:'Training complete! You now know how to manage the platform. Final step: UAT and go-live testing.',
7:'🚀 Congratulations! Your BPA Compliance Platform is LIVE! Your CSM will be available for 2-4 weeks of hypercare support.'}[pid]||'Phase complete!'}

function rSt(){
const ph=D.phases,done=ph.filter(p=>p.status==='complete').length;
const ts=ph.reduce((s,p)=>s+p.steps.length,0),ds=ph.reduce((s,p)=>s+p.steps.filter(x=>x.done).length,0);
const pct=ts?Math.round(ds/ts*100):0;
const circ=2*Math.PI*48,off=circ-(pct/100)*circ;
document.getElementById('rP').textContent=pct+'%';
const r=document.getElementById('rF');r.style.strokeDasharray=circ;setTimeout(()=>r.style.strokeDashoffset=off,100);
const ap=ph.find(p=>p.status==='active');
document.getElementById('sS').textContent=ap?`Phase ${ap.id}: ${ap.name}`:'All phases complete!';
const fa=D.forms.uploaded?1:0;document.getElementById('sF').textContent=`${fa}/1`;
if(D.project.targetGoLive){const dl=Math.max(0,Math.ceil((new Date(D.project.targetGoLive)-new Date())/864e5));document.getElementById('sD').textContent=dl}
document.getElementById('sPh').textContent=`${done}/7`;

const cs=ph.reduce((s,p)=>p.status!=='complete'?s+p.steps.filter(x=>!x.done&&x.owner==='client').length:s,0);
const fs=ph.reduce((s,p)=>p.status!=='complete'?s+p.steps.filter(x=>!x.done&&x.owner==='flo').length:s,0);
const bb=document.getElementById('bB');
if(cs>fs){document.getElementById('bL').textContent='Your Turn';document.getElementById('bS').textContent=cs+' items';bb.style.background='rgba(251,191,36,.12)';bb.style.borderColor='rgba(251,191,36,.2)'}
else if(fs>0){document.getElementById('bL').textContent="FLO's Turn";document.getElementById('bS').textContent=fs+' items';bb.style.background='rgba(45,212,191,.1)';bb.style.borderColor='rgba(45,212,191,.2)'}
else{document.getElementById('bL').textContent=pct===100?'Done! 🎉':'Ready';document.getElementById('bS').textContent=pct===100?'All complete':'';bb.style.background='rgba(74,222,128,.1)';bb.style.borderColor='rgba(74,222,128,.2)'}

const nx=findNext();
document.getElementById('jNx2').innerHTML=nx?`<div class="na" onclick="jump(${nx.pid},'${nx.sid}')"><div class="nai">▶</div><div class="nab"><div class="nal">Next Step</div><div class="nat">${nx.text}</div><div class="nad">Phase ${nx.pid}: ${nx.pname}</div></div><div class="nag">→</div></div>`:'';

const yi=[],fi=[];
D.phases.forEach(p=>{if(p.status==='complete')return;p.steps.forEach(s=>{if(s.done)return;(s.owner==='flo'?fi:yi).push({...s,phase:p.name,pid:p.id})})});
document.getElementById('sCols').innerHTML=`
<div class="card"><div class="ch"><h3>🎯 Your Items</h3><span class="btn btn-g btn-sm">${yi.length}</span></div><div class="cb">${yi.length?yi.map(i=>`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--g1);cursor:pointer" onclick="jump(${i.pid},'${i.id}')"><div style="width:24px;height:24px;border-radius:50%;background:var(--w1);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;margin-top:2px">🏐</div><div><div style="font-size:.85rem;font-weight:600;color:var(--g8)">${i.text}</div><div style="font-size:.76rem;color:var(--g5);margin-top:1px">Phase ${i.pid}</div></div></div>`).join(''):'<div style="text-align:center;padding:24px;color:var(--g4)"><div style="font-size:2rem;margin-bottom:6px">🎉</div><p style="font-size:.86rem">Nothing waiting on you!</p></div>'}</div></div>
<div class="card"><div class="ch"><h3>⏳ Waiting on FLO</h3><span class="btn btn-g btn-sm">${fi.length}</span></div><div class="cb">${fi.length?fi.map(i=>`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--g1)"><div style="width:24px;height:24px;border-radius:50%;background:var(--cy0);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0;margin-top:2px">🔄</div><div><div style="font-size:.85rem;font-weight:600;color:var(--g8)">${i.text}</div><div style="font-size:.76rem;color:var(--g5);margin-top:1px">Phase ${i.pid}</div></div></div>`).join(''):'<div style="text-align:center;padding:24px;color:var(--g4)"><div style="font-size:2rem;margin-bottom:6px">⚡</div><p style="font-size:.86rem">FLO has no pending items.</p></div>'}</div></div>`;
}

function goTab(t){document.querySelectorAll('.tabC').forEach(e=>e.classList.add('hid'));document.querySelectorAll('.tab').forEach(e=>e.classList.remove('on'));
document.getElementById('t'+t[0].toUpperCase()+t.slice(1)).classList.remove('hid');const tb=document.querySelector(`.tab[data-t="${t}"]`);if(tb)tb.classList.add('on')}

let aTok=0;
const aLoading='<div style="padding:24px;color:var(--g4);font-size:.9rem">Loading...</div>';
const aErr=e=>`<div class="lerr on">Could not load: ${escapeHtml(e.message||e)}</div>`;
async function aGo(s){document.querySelectorAll('.ani').forEach(e=>e.classList.remove('on'));document.querySelector(`.ani[data-a="${s}"]`)?.classList.add('on');
const c=document.getElementById('aC'),tk=++aTok;
if(s==='project'){c.innerHTML=aLoading;let list;try{list=await listProjects()}catch(e){if(tk===aTok)c.innerHTML=aErr(e);return}if(tk!==aTok)return;
if(!P){const pr=list.find(x=>x.id===prefGet());if(pr){useProject(pr);document.getElementById('nPr').textContent=pr.name;rJ();rSt()}}
else if(!list.find(x=>x.id===P.id))P=null;
const p=P||{name:'',code:'',csm_name:'',target_go_live:''};
c.innerHTML=`<div class="ash"><h2>Project Setup</h2><button class="btn btn-sm btn-s" onclick="reset()">🔄 Reset</button></div>
<div class="fg"><label>Project</label><select id="pSel"><option value="">+ New project</option>${list.map(x=>`<option value="${x.id}" ${P&&P.id===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label>Organization Name *</label><input id="pNm" value="${escapeHtml(p.name)}" placeholder="City of Springfield"></div>
<div class="fg"><label>Project Code</label><input id="pCd" value="${escapeHtml(p.code)}" placeholder="city-of-springfield"><div class="hint">Filled in from the name. Customers never see or type it.</div></div>
<div class="fg"><label>CSM Name</label><input id="pCs" value="${escapeHtml(p.csm_name)}"></div>
<div class="fg"><label>Target Go-Live</label><input type="date" id="pGL" value="${escapeHtml(p.target_go_live)}"></div>
</div>
<h3 style="margin:20px 0 12px;font-size:.95rem">Create First Customer User</h3>
<p style="font-size:.84rem;color:var(--g5);margin-bottom:12px">This person will receive access to the portal. They sign in with their email and a one-time code, no password needed.</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label>Full Name</label><input id="cuNm" placeholder="Jane Smith"></div>
<div class="fg"><label>Email</label><input id="cuEm" type="email" placeholder="jsmith@springfield.gov"></div>
</div>
<div style="margin-top:14px;display:flex;gap:10px"><button class="btn btn-p" id="pSave">Save & Create User</button></div>`;
const nm=document.getElementById('pNm'),cd=document.getElementById('pCd');let codeEdited=!!p.code;
nm.addEventListener('input',()=>{if(!codeEdited)cd.value=slug(nm.value)});
cd.addEventListener('input',()=>{codeEdited=cd.value.trim()!==''});
document.getElementById('pSel').addEventListener('change',e=>{const pr=list.find(x=>x.id===e.target.value);prefSet(pr?pr.id:null);if(pr){useProject(pr);document.getElementById('nPr').textContent=pr.name;rJ();rSt()}else P=null;aGo('project')});
document.getElementById('pSave').addEventListener('click',e=>savePrj(e.currentTarget))}
else if(s==='users'){c.innerHTML=aLoading;let us,ps;try{[us,ps]=await Promise.all([listProfiles(),listProjects()])}catch(e){if(tk===aTok)c.innerHTML=aErr(e);return}if(tk!==aTok)return;
const pn=id=>{const x=ps.find(y=>y.id===id);return x?x.name:id?'(archived project)':'FLO'};
c.innerHTML=`<div class="ash"><h2>Users (${us.length})</h2><button class="btn btn-sm btn-a" id="uAdd">+ Add</button></div>
<table class="at"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Project</th><th>Status</th><th></th></tr></thead><tbody>${us.map(u=>`<tr><td><strong>${escapeHtml(u.full_name||'')}</strong></td><td style="color:var(--g5)">${escapeHtml(u.email)}</td><td>${escapeHtml(RL[u.role]||u.role)}</td><td style="color:var(--g5);font-size:.84rem">${escapeHtml(pn(u.project_id))}</td><td><span class="pill-st ${u.active?'on':'off'}">${u.active?'Active':'Inactive'}</span></td><td>${u.user_id!==U.id?`<button class="btn btn-g btn-sm" style="color:${u.active?'var(--e5)':'var(--tl)'}" data-act="${u.active?'off':'on'}" data-id="${escapeHtml(u.user_id)}">${u.active?'Deactivate':'Reactivate'}</button>`:''}</td></tr>`).join('')}</tbody></table>`;
document.getElementById('uAdd').addEventListener('click',()=>addUsr(ps));
c.querySelectorAll('button[data-act]').forEach(b=>b.addEventListener('click',()=>setActive(us.find(u=>u.user_id===b.dataset.id),b.dataset.act==='on')))}
else if(s==='phases'){const sts=['pending','active','complete'];c.innerHTML=`<div class="ash"><h2>Phases</h2></div>
<table class="at"><thead><tr><th>#</th><th>Phase</th><th>Status</th></tr></thead><tbody>${D.phases.map(p=>`<tr><td>${p.id}</td><td>${p.name}</td>
<td><select onchange="D.phases.find(x=>x.id===${p.id}).status=this.value;save();rJ();rSt()" style="padding:4px 8px;border:1px solid var(--g3);border-radius:var(--rf);font-size:.82rem">
${sts.map(x=>`<option value="${x}" ${p.status===x?'selected':''}>${x}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`}
}

async function savePrj(btn){
const nm=document.getElementById('pNm').value.trim(),code=slug(document.getElementById('pCd').value||nm);
if(!nm){toast('Organization name is required','err');return}
const un=document.getElementById('cuNm').value.trim(),ue=document.getElementById('cuEm').value.trim().toLowerCase();
if((un||ue)&&!(un&&ue)){toast('Enter both a name and an email for the first user','err');return}
btn.classList.add('busy');
try{
let saved;try{saved=await saveProject({id:P&&P.id,name:nm,code,csm_name:document.getElementById('pCs').value.trim(),target_go_live:document.getElementById('pGL').value,created_by:U.id})}
catch(e){toast(e.code==='23505'?'That project code is already in use. Pick another.':'Could not save the project: '+escapeHtml(e.message),'err');return}
prefSet(saved.id);useProject(saved);document.getElementById('nPr').textContent=saved.name;rSt();toast('Project saved','ok');
if(un&&ue)await createUser({full_name:un,email:ue,role:'client_lead',project_id:saved.id});
}finally{btn.classList.remove('busy')}
aGo('project');
}

async function createUser(body){
try{const r=await callFunction('admin-create-user',body);
if(r.invited)toast(`Invitation sent to ${escapeHtml(body.email)}. They will set a password from the email.`,'ok');
else if(r.emailSent)toast(`Welcome email sent to ${escapeHtml(body.email)}`,'ok');
else showPortalLink(body.email,r.emailConfigured);
return true}
catch(e){toast(escapeHtml(e.message),'err');return false}
}

function showPortalLink(email,configured){
const link=portalUrl();
document.getElementById('mC').innerHTML=`<h2>User created</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px">${configured?'The welcome email could not be sent':'Email not configured'}: share the portal link manually with <strong>${escapeHtml(email)}</strong>. They sign in with that email address and a one-time code.</p>
<div class="cplink"><input id="cpL" readonly value="${escapeHtml(link)}"><button class="btn btn-p btn-sm" id="cpB">Copy portal link</button></div>
<div class="ma"><button class="btn btn-s" onclick="cMo()">Done</button></div>`;
document.getElementById('cpB').addEventListener('click',async()=>{const i=document.getElementById('cpL');try{await navigator.clipboard.writeText(i.value)}catch{i.select();document.execCommand('copy')}toast('Portal link copied','ok')});
document.getElementById('mW').classList.remove('hid');
}

function addUsr(projects){
const cur=P&&P.id;
document.getElementById('mC').innerHTML=`<h2>Add User</h2>
<div class="fg"><label>Name</label><input id="nuN"></div>
<div class="fg"><label>Email</label><input id="nuE" type="email"></div>
<div class="fg"><label>Role</label><select id="nuR"><option value="client_lead">Client Lead</option><option value="client_it">IT Contact</option><option value="utility_staff">Utility Staff</option><option value="admin">FLO Admin</option></select></div>
<div class="fg" id="nuPg"><label>Project</label><select id="nuP">${projects.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select>${projects.length?'':'<div class="hint">Create a project in Project Setup first.</div>'}</div>
<p style="font-size:.84rem;color:var(--g5);margin-top:8px" id="nuH">Customers sign in with their email and a one-time code. No password needed.</p>
<div class="ma"><button class="btn btn-s" onclick="cMo()">Cancel</button><button class="btn btn-p" id="nuAdd">Add</button></div>`;
const r=document.getElementById('nuR'),sync=()=>{const a=r.value==='admin';document.getElementById('nuPg').classList.toggle('hid',a);document.getElementById('nuH').textContent=a?'FLO admins get an invitation email and set their own password.':'Customers sign in with their email and a one-time code. No password needed.'};
r.addEventListener('change',sync);
document.getElementById('nuAdd').addEventListener('click',async e=>{const n=document.getElementById('nuN').value.trim(),em=document.getElementById('nuE').value.trim().toLowerCase(),role=r.value,pid=role==='admin'?null:document.getElementById('nuP').value;
if(!n||!em){toast('Name and email are required','err');return}if(role!=='admin'&&!pid){toast('Pick a project','err');return}
const b=e.currentTarget;b.classList.add('busy');cMo();const ok=await createUser({full_name:n,email:em,role,project_id:pid});b.classList.remove('busy');if(ok)aGo('users')});
document.getElementById('mW').classList.remove('hid');
}

function setActive(u,on){
if(!u)return;
document.getElementById('mC').innerHTML=`<h2>${on?'Reactivate':'Deactivate'} user</h2>
<p style="font-size:.9rem;color:var(--g6);margin-top:8px">${on?`<strong>${escapeHtml(u.full_name||u.email)}</strong> will be able to sign in again.`:`<strong>${escapeHtml(u.full_name||u.email)}</strong> will be signed out and won't be able to sign in until reactivated.`}</p>
<div class="ma"><button class="btn btn-s" onclick="cMo()">Cancel</button><button class="btn ${on?'btn-p':'btn-d'}" id="daGo">${on?'Reactivate':'Deactivate'}</button></div>`;
document.getElementById('daGo').addEventListener('click',async()=>{cMo();try{await callFunction('admin-deactivate-user',{user_id:u.user_id,reactivate:on});toast(on?'User reactivated':'User deactivated','ok')}catch(e){toast(escapeHtml(e.message),'err')}aGo('users')});
document.getElementById('mW').classList.remove('hid');
}

function cMo(e){if(e&&e.target!==document.getElementById('mW'))return;document.getElementById('mW').classList.add('hid')}
function toast(m,t='info'){const c=document.getElementById('tC'),d=document.createElement('div');d.className=`tst t${t}`;d.innerHTML=`<span>${t==='ok'?'✓':t==='err'?'✕':'ℹ'}</span> ${m}`;c.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transform='translateX(20px)';d.style.transition='.3s';setTimeout(()=>d.remove(),300)},3500)}

document.addEventListener('DOMContentLoaded',()=>{init();initAuth({onSignedIn:enter,onSignedOut:leaveApp})});

// Inline onclick/onchange handlers in the markup and in rendered templates
// resolve names on window, so expose them explicitly from this module.
Object.assign(window,{logout,goTab,aGo,cMo,jump,tgl,tP,save,rJ,rSt,doUpload,saveLink,reset,toast});
Object.defineProperty(window,'D',{get:()=>D,set:v=>{D=v},configurable:true});
