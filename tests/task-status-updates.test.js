const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {stampProjectTasks,stampWeekEntries,validateCompletionDates} = require('../backend/lib/task-updates');
const at = n=>new Date(2026,9,19+n,12).getTime();
const copy = x=>JSON.parse(JSON.stringify(x));

function model(project,weeks=[],catalog=[]){
  const c=vm.createContext({S:{staff:[],catalog,projects:[project],weeks}});
  for(const f of ['utils','constants','model']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/core',f+'.js'),'utf8'),c);
  return c.derive();
}
const project = ()=>({id:'p1',name:'Imported',type:'Triển khai',tasks:[{id:'t1',dv:'Task',deadline:'2026-12-01',owners:['An'],init:{status:'Hoàn thành',source:'excel'}}]});
const week = (status,time)=>({week:'2026-10-19',person:'An',entries:[{id:'e1',projectId:'p1',taskId:'t1',status,statusUpdatedAt:time,updatedAt:time}]});

test('Excel import records actual server save time and appears as latest update without weekly entries',()=>{
  const p=project();p.tasks[0].updatedAt=1;p.tasks[0].init.statusUpdatedAt=1;
  stampProjectTasks(p,null,'head',at(2));
  assert.equal(p.tasks[0].updatedAt,at(2));assert.equal(p.tasks[0].init.statusUpdatedAt,at(2));
  const t=model(p).tasks[0];
  assert.equal(t.status,'Hoàn thành');assert.equal(t.src,'Nhập Excel');
  assert.equal(t.updDate,'21/10/2026');assert.equal(t.done,'2026-10-19');
});

test('project/Excel update beats old weekly status, later weekly update takes over in same week',()=>{
  const p=project();stampProjectTasks(p,null,'head',at(2));
  assert.equal(model(copy(p),[week('Đang làm',at(1))]).tasks[0].status,'Hoàn thành');
  const later=model(copy(p),[week('Đang vướng',at(3))]).tasks[0];
  assert.equal(later.status,'Đang vướng');assert.equal(later.done,null);
});

test('explicit change back to original project status still gets a new timestamp',()=>{
  const previous=project();previous.tasks[0].init.status='Đang làm';stampProjectTasks(previous,null,'head',at(0));
  const edited=copy(previous);edited.tasks[0]._statusChanged=true;
  stampProjectTasks(edited,previous,'manager',at(3));
  assert.equal(edited.tasks[0].init.source,'project');
  assert.equal(edited.tasks[0].init.statusUpdatedAt,at(3));
  assert.equal(model(edited,[week('Hoàn thành',at(2))]).tasks[0].status,'Đang làm');
});

test('deadline-only edit does not reclaim status from a newer weekly report',()=>{
  const previous=project();stampProjectTasks(previous,null,'head',at(0));
  const edited=copy(previous);edited.tasks[0].deadline='2026-12-02';
  stampProjectTasks(edited,previous,'head',at(4));
  assert.equal(edited.tasks[0].init.statusUpdatedAt,at(0));
  assert.equal(model(edited,[week('Đang làm',at(2))]).tasks[0].status,'Đang làm');
});

test('hours-only changes preserve status timestamps and unchanged entries retain dates',()=>{
  const previous=week('Đang làm',at(0));previous.entries[0].hours=2;
  const edited=copy(previous);edited.entries[0].hours=3;edited.entries[0].statusUpdatedAt=at(9);
  stampWeekEntries(edited,previous,'An',at(2));
  assert.equal(edited.entries[0].statusUpdatedAt,at(0));assert.equal(edited.entries[0].updatedAt,at(2));
  const unchanged=copy(edited);stampWeekEntries(unchanged,edited,'An',at(3));
  assert.equal(unchanged.entries[0].updatedAt,at(2));
  const statusEdit=copy(edited);statusEdit.entries[0].status='Hoàn thành';
  stampWeekEntries(statusEdit,edited,'An',at(4));assert.equal(statusEdit.entries[0].statusUpdatedAt,at(4));
});

test('two people updating in same week are ordered by actual status update time',()=>{
  const p=project(),a=week('Đang làm',at(1)),b=week('Hoàn thành',at(2));b.person='Binh';
  assert.equal(model(copy(p),[b,a]).tasks[0].status,'Hoàn thành');
  assert.equal(model(copy(p),[a,b]).tasks[0].status,'Hoàn thành');
});

test('legacy data without timestamps keeps its prior weekly fallback',()=>{
  const w=week('Đang làm');delete w.entries[0].statusUpdatedAt;delete w.entries[0].updatedAt;
  assert.equal(model(project(),[w]).tasks[0].status,'Đang làm');
});

test('web project progress counts tasks equally despite legacy workload sizes',()=>{
  const p=project();p.tasks[0].qm=5;p.tasks[0].dv='1. Phase – First';
  p.tasks.push({id:'t2',dv:'1. Phase – Second',qm:null,init:{status:'Đang làm'}});
  p.tasks.push({id:'t3',dv:'1. Phase – Cancelled',qm:1,init:{status:'Hủy'}});
  const derived=model(p,[],[{type:p.type,name:'1. Phase – First'}]).projects[0];
  assert.equal(derived._prog,0.5);assert.equal(derived._allDone,false);
  assert.equal(derived._phases[0].v,0.5);
  const c=vm.createContext({ACTIONS:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/views/plan.js'),'utf8'),c);
  assert.equal(c.planStat(derived._tasks).v,0.5);
});

test('project form shows effective status and does not override it on unrelated edits',async()=>{
  let cfg,saved;
  const p=project();p.tasks[0].init.status='Đang làm';
  const current={...p.tasks[0],status:'Đang vướng'};
  const c=vm.createContext({S:{canEdit:true,catalog:[]},M:{staff:[]},openForm:x=>cfg=x,
    saveProject:async x=>saved=x,toast(){},stPill:x=>x,phasesFor:()=>[],planShortName:x=>x});
  for(const file of ['core/utils','core/constants','views/plan']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',file+'.js'),'utf8'),c);
  c.toast=()=>{};
  c.taskForm(p,current);
  const fields=cfg.fields;
  assert.equal(fields.findIndex(f=>f.key==='completedOn'),fields.findIndex(f=>f.key==='deadline')+1);
  assert.equal(fields.find(f=>f.key==='completedOn').half,true);
  assert.equal(fields.find(f=>f.key==='st0').type,'seg');
  assert.equal(fields.find(f=>f.key==='st0').half,undefined);
  assert(fields.findIndex(f=>f.key==='st0')>fields.findIndex(f=>f.key==='pt'));
  assert.equal(cfg.values.st0,'Đang vướng');
  await cfg.onSave({...cfg.values,detail:'Description changed'});
  assert.equal(saved.tasks[0]._statusChanged,false);
  assert.equal(saved.tasks[0].init.status,'Đang làm');
  await cfg.onSave({...cfg.values,st0:'Đang làm'});
  assert.equal(saved.tasks[0]._statusChanged,true);
  assert.equal(saved.tasks[0].init.status,'Đang làm');
});

test('late data entry is evaluated using actual completion date, not update date',()=>{
  const p=project();p.tasks[0].deadline='2026-10-20';
  const w=week('Hoàn thành',at(4));w.entries[0].completedOn='2026-10-18';
  stampWeekEntries(w,null,'An',at(4));
  const t=model(p,[w]).tasks[0];
  assert.equal(t.completedOn,'2026-10-18');assert.equal(t.completion.days,2);
  assert.equal(t.ontime,true);assert.equal(t.done,'2026-10-12');
  assert.equal(t.updDate,'23/10/2026');
});
test('early, on-date and late completions use calendar days',()=>{
  for(const [date,delta] of [['2026-10-18',2],['2026-10-20',0],['2026-10-22',-2]]){
    const p=project();p.tasks[0].deadline='2026-10-20';p.tasks[0].init.completedOn=date;
    stampProjectTasks(p,null,'head',at(4));
    const t=model(p).tasks[0];assert.equal(t.completion.days,delta);assert.equal(t.ontime,delta>=0);
  }
});
test('missing actual dates or deadlines do not assume an on-time completion',()=>{
  const p=project();stampProjectTasks(p,null,'head',at(4));
  assert.equal(model(p).tasks[0].ontime,null);
  p.tasks[0].init.completedOn='2026-10-18';p.tasks[0].deadline=null;
  assert.equal(model(p).tasks[0].ontime,null);
});
test('future/invalid completion dates are rejected; old real completion dates are allowed',()=>{
  const p=project();p.tasks[0].init.completedOn='2026-10-24';
  assert.equal(validateCompletionDates(p,'projects',at(4)).status,400);
  p.tasks[0].init.completedOn='2026-02-30';assert.equal(validateCompletionDates(p,'projects',at(4)).status,400);
  p.tasks[0].init.completedOn='2026-09-01';assert.equal(validateCompletionDates(p,'projects',at(4)),null);
});
test('reopening clears completion date and correcting a date updates status source time',()=>{
  const before=week('Hoàn thành',at(2));before.entries[0].completedOn='2026-10-20';
  const edited=copy(before);edited.entries[0].completedOn='2026-10-19';
  stampWeekEntries(edited,before,'An',at(4));assert.equal(edited.entries[0].statusUpdatedAt,at(4));
  edited.entries[0].status='Đang làm';
  assert.equal(validateCompletionDates(edited,'weeks',at(4)),null);
  assert.equal(edited.entries[0].completedOn,undefined);
  assert.equal(model(project(),[edited]).tasks[0].completedOn,null);
});

test('completion summaries count the actual completion week, not the reporting week',()=>{
  const p=project();p.tasks[0].deadline='2026-10-20';
  const w=week('Hoàn thành',at(4));w.entries[0].completedOn='2026-10-18';
  const tasks=model(p,[w]).tasks;
  const c=vm.createContext({});
  for(const file of ['utils','constants'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/core',file+'.js'),'utf8'),c);
  assert(c.completionSummaryHtml(tasks,['2026-10-12'],null).includes('Sớm 1'));
  assert(c.completionSummaryHtml(tasks,['2026-10-19'],null).includes('Sớm 0'));
});

test('new weekly completion defaults to server day in Bangkok but explicit actual dates are preserved',()=>{
  const now=Date.UTC(2026,9,23,18),w=week('Hoàn thành');
  stampWeekEntries(w,null,'An',now);assert.equal(w.entries[0].completedOn,'2026-10-24');
  const explicit=week('Hoàn thành');explicit.entries[0].completedOn='2026-10-20';
  stampWeekEntries(explicit,null,'An',now);assert.equal(explicit.entries[0].completedOn,'2026-10-20');
  const legacy=week('Hoàn thành'),edited=copy(legacy);edited.entries[0].hours=2;
  stampWeekEntries(edited,legacy,'An',now);assert.equal(edited.entries[0].completedOn,undefined);
});
