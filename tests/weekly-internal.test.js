const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(){
  const p = {id:'common', name:'Việc chung của phòng', type:'Nội bộ', tasks:[], _tasks:[], _phases:[]};
  let seq = 0, cfg;
  const doc = {entries:[]};
  const c = vm.createContext({
    S:{me:'An', week:'2026-10-19', canEdit:false, rp:{wkStaff:'An', wkType:'', wkView:'input'}},
    M:{projects:[p], pById:new Map([[p.id,p]]), taskMap:new Map(), staff:[{name:'An',cap:40}], entries:[]},
    ACTIONS:{}, VIEW_RENDER:{}, ICONS:{}, VIEWS:[], TYPES:['Nội bộ'], ST_WEEK:[], CAUSES:[],
    main:{addEventListener(){}}, document:{addEventListener(){}},
    uid:prefix=>prefix+(++seq), weekDoc:()=>doc,
    saveWeek:async(w,person,entries)=>{doc.entries=entries;},
    openForm:config=>{cfg=config;}, planIsDone:()=>false,
    isoWeek:()=>43, dm:x=>x, dmy:x=>x, addDays:x=>x, fmt1:String,
    toast(){}, phaseOf:()=>'', planShortName:x=>x, slug:x=>x,
    esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'), stPill:x=>x,
    loadFor:()=>({es:[],wl:0}), ratioOf:()=>({ratio:0}), pct:String
  });
  for(const file of ['frontend/js/views/weekly-input.js','frontend/js/modules/reports.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
  }
  return {c,doc,p,form:()=>cfg};
}

test('member can add, rename and copy independent common tasks without a catalog',async()=>{
  const {c,doc,form} = setup();
  c.entryForm(null,null,true);
  assert.equal(form().values.projectId,'common');
  assert.equal(form().fields.find(f=>f.key==='taskIds').showIf(form().values),false);
  assert.equal(form().fields.find(f=>f.key==='taskName').showIf(form().values),true);
  await assert.rejects(form().onSave({...form().values,hours:2,taskName:'  '}));
  await form().onSave({...form().values,hours:20,taskName:'PoC Storage',note:'',status:'Đang làm'});
  c.entryForm(null,null,true);
  await form().onSave({...form().values,hours:4.5,taskName:'Tư vấn lab',note:'Chờ hãng',status:'Đang vướng'});
  assert.equal(doc.entries.length,2);
  assert.notEqual(doc.entries[0].taskId,doc.entries[1].taskId);
  const tid = doc.entries[0].taskId;
  c.entryForm(doc.entries[0]);
  await form().onSave({...form().values,taskName:'PoC Storage scale'});
  assert.equal(doc.entries[0].taskId,tid);
  assert.equal(doc.entries[0].taskName,'PoC Storage scale');
  const prev = doc.entries;
  c.weekDoc = w=>w==='2026-10-12'?{entries:prev}:doc;
  c.addDays = ()=> '2026-10-12';
  doc.entries=[];
  await c.copyPrev();
  assert.equal(doc.entries.length,2);
  assert.equal(doc.entries[0].taskId,tid);
  assert.equal(doc.entries[0].taskName,'PoC Storage scale');
});

test('weekly preview and Excel rows keep legacy common issues on their own entry',()=>{
  const {c,p} = setup();
  const base={projectId:p.id,taskId:'legacy-shared',person:'An',week:c.S.week,type:p.type,
    ref:{p,t:{dv:'N1. Khác – Việc khác',note:'Shared note'}},status:'Đang làm'};
  c.M.entries=[{...base,id:'a',work:'PoC Storage',note:''},
    {...base,id:'b',work:'Tư vấn lab',status:'Đang vướng',note:'Chờ hãng'}];
  const report=c.rpBuildWeek();
  assert.equal(report.rows[0].name,'PoC Storage');
  assert.equal(report.rows[0].issue,'');
  assert.equal(report.rows[1].issue,'Chờ hãng');
  assert.equal(report.rows[0].solution,'');
  assert.equal(report.sheets[0].rows[0]['Vướng mắc'],'');
  assert.equal(report.sheets[0].rows[1]['Vướng mắc'],'Chờ hãng');
  const html=c.rpWeekRowsHtml(report);
  assert.match(html,/2 đầu việc/);
  assert.doesNotMatch(html,/Deadline theo HĐ/);
  assert.equal(html.split('Chờ hãng').length-1,1);
  assert.equal(report.sheets[2].name,'Việc chung của phòng');
  assert.equal(report.sheets[2].rows[0]['Đầu việc'],'PoC Storage');
});

test('tender/project issues still carry over by planned task',()=>{
  const {c,p}=setup();
  p.type='Thầu';
  c.M.entries=[{projectId:p.id,taskId:'t1',week:'2026-10-12',note:'Đang chờ',status:'Đang vướng'},
    {projectId:p.id,taskId:'t1',week:'2026-10-19',person:'An',type:p.type,note:'',status:'Đang làm',ref:{p,t:{dv:'Lập hồ sơ'}}}];
  const report=c.rpBuildWeek();
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].issue,'Đang chờ');
  assert.equal(report.rows[0].common,false);
});

test('management report uses sidebar as the sole staff filter',()=>{
  const {c}=setup();
  c.S.canEdit=true;
  c.rpInit();
  assert.equal(c.S.rp.wkStaff,'An');
  c.S.rp.wkStaff='__all__';
  c.rpInit();
  assert.equal(c.S.rp.wkStaff,'An');
  assert.doesNotMatch(c.rpWeekFilterHtml(),/data-act="rpstaff"/);
  assert.match(c.rpWeekFilterHtml(),/data-act="rpwktype"/);
  c.S.me='Bình';
  c.rpInit();
  assert.equal(c.S.rp.wkStaff,'Bình');
  c.S.me='__all__';
  c.rpInit();
  assert.equal(c.S.rp.wkStaff,'__all__');
  c.S.canEdit=false;
  assert.match(c.rpWeekFilterHtml(),/data-act="rpstaff"/);
});

test('overview includes completed projects in completed/all filters and Excel',()=>{
  const {c}=setup();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/core/constants.js'),'utf8'),c);
  c.periodInfo=()=>({weeks:['2026-10-19'],label:'Tuần 43'});
  const task={id:'t1',status:'Hoàn thành',done:'2026-10-19'};
  const done={id:'done',name:'Dự án đã xong',type:'Triển khai',tasks:[task],_tasks:[task],_allDone:true,_prog:1,_late:0,_soon:0,_stuck:0,_maxms:0};
  c.M.projects=[done,{...done,id:'open',name:'Dự án đang làm',_allDone:false,_prog:0.5,_tasks:[{...task,status:'Đang làm',done:null,warns:[]}]}];
  c.S.rp.ovPtype='Hoàn thành';
  let report=c.rpBuildOverview();
  assert.equal(report.projRows.length,1);
  assert.equal(report.projRows[0].name,done.name);
  assert.equal(report.stats[0].v,1);
  assert.equal(report.stats[1].v,'1');
  assert.equal(report.stats[4].v,1);
  assert.equal(c.rpBuildOverviewExport().sheets[1].rows[0]['Tên dự án'],done.name);
  c.S.rp.ovPtype='Tất cả';
  assert.equal(c.rpBuildOverview().projRows.length,2);
  c.S.rp.ovPtype='Đang triển khai';
  report=c.rpBuildOverview();
  assert.equal(report.projRows.length,1);
  assert.equal(report.projRows[0].name,'Dự án đang làm');
});
