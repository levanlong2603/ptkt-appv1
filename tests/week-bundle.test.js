const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createSqliteStore}=require('../backend/lib/store');
const {saveWeekBundle}=require('../backend/lib/week-save');
const {stampProjectTasks,stampWeekEntries}=require('../backend/lib/task-updates');
const source=fs.readFileSync(require.resolve('../backend/server.js'),'utf8');
const hash=raw=>raw===null?null:createHash('sha256').update(raw).digest('hex');
const projectPath='projects/p1',weekPath='weeks/2026-10-19__an';
async function setup(t){
  const store=createSqliteStore(':memory:');await store.init();t.after(()=>store.close());
  const events=[];
  const c=vm.createContext({store,COLLECTIONS:new Set(['weeks','projects']),ID_RE:/^[a-z0-9_-]+$/,
    FULL_ROLES:new Set(['head']),stampProjectTasks,stampWeekEntries,
    canWrite:(u,coll,id,body)=>u.role==='head'||(coll==='weeks'&&body.person==='An'),
    peopleOf:(o,k)=>o[k]||[],projectRevision:hash,projectConflict:()=>({status:409,error:'Conflict'}),
    audit:()=>events.push('audit'),broadcast:coll=>events.push(coll),bot:{onSaved(){}},console});
  vm.runInContext(source.slice(source.indexOf('async function saveDoc('),source.indexOf('app.put("/api/doc/:coll/:id"')),c);
  await store.upsertDoc(projectPath,'projects','p1',JSON.stringify({name:'Project',tasks:[{id:'t1',deadline:'2026-11-01',init:{status:'Đang làm'}}]}),'head');
  const input=()=>({revision:null,document:{week:'2026-10-19',person:'An',entries:[{id:'e1',projectId:'p1',taskId:'t1',hours:2,status:'Đang làm'}]},
    deadlineUpdates:[{projectId:'p1',taskId:'t1',deadline:'2026-12-01',expectedDeadline:'2026-11-01'}]});
  return {store,events,input,save:(data,user={username:'head',role:'head'})=>saveWeekBundle(store,c.saveDoc,user,data)};
}
test('week and deadline commit together, then publish changes',async t=>{
  const x=await setup(t);assert.equal(await x.save(x.input()),null);
  assert.equal(JSON.parse(await x.store.getDoc(projectPath)).tasks[0].deadline,'2026-12-01');
  const entry=JSON.parse(await x.store.getDoc(weekPath)).entries[0];
  assert.equal(entry.hours,2);assert.equal(entry.updatedBy,'head');assert(entry.statusUpdatedAt>0);
  assert.deepEqual(x.events,['audit','weeks','audit','projects']);
});
test('denied deadline permission also prevents saving the week',async t=>{
  const x=await setup(t);assert.equal((await x.save(x.input(),{username:'An',role:'member'})).status,403);
  assert.equal(await x.store.getDoc(weekPath),null);
  assert.equal(JSON.parse(await x.store.getDoc(projectPath)).tasks[0].deadline,'2026-11-01');
  assert.equal(x.events.length,0);
});
test('invalid hours and capacity reject whole bundle before any writes',async t=>{
  const x=await setup(t),negative=x.input();negative.document.entries[0].hours=-1;
  assert.equal((await x.save(negative)).status,400);
  const over=x.input();over.document.entries[0].hours=32;
  await x.store.upsertDoc('projects/p2','projects','p2',JSON.stringify({tasks:[{id:'t2'}]}),'head');
  over.document.entries.push({id:'e2',projectId:'p2',taskId:'t2',hours:9,status:'Đang làm'});
  assert.equal((await x.save(over)).status,400);assert.equal(await x.store.getDoc(weekPath),null);
  assert.equal(JSON.parse(await x.store.getDoc(projectPath)).tasks[0].deadline,'2026-11-01');
});
test('a concurrent week edit rolls back a deadline already written inside transaction',async t=>{
  const x=await setup(t),commit=x.store.commitDocs.bind(x.store),other=JSON.stringify({week:'2026-10-19',person:'An',entries:[]});
  x.store.commitDocs=async(changes,user)=>{
    await x.store.upsertDoc(weekPath,'weeks','2026-10-19__an',other,'other');
    return commit(changes,user);
  };
  assert.equal((await x.save(x.input())).status,409);
  assert.equal(await x.store.getDoc(weekPath),other);
  assert.equal(JSON.parse(await x.store.getDoc(projectPath)).tasks[0].deadline,'2026-11-01');
  assert.equal(x.events.length,0);
});
test('database errors roll back earlier writes',async t=>{
  const x=await setup(t),old=await x.store.getDoc(projectPath);
  await assert.rejects(x.store.commitDocs([
    {path:projectPath,collection:'projects',id:'p1',expected:old,body:'{"name":"Changed"}'},
    {path:'weeks/broken',collection:'weeks',id:'broken',expected:null,body:null}
  ],'head'));
  assert.equal(await x.store.getDoc(projectPath),old);
});
test('stale week revision and stale deadline never overwrite current data',async t=>{
  const x=await setup(t);await x.save(x.input());
  assert.equal((await x.save(x.input())).status,409);
  const current=await x.store.getDoc(weekPath),retry=x.input();retry.revision=hash(current);
  assert.equal((await x.save(retry)).status,409);
  assert.equal(await x.store.getDoc(weekPath),current);
});
test('duplicate/missing tasks are rejected and draft copies with no hours are allowed',async t=>{
  const x=await setup(t),duplicate=x.input();duplicate.document.entries.push({...duplicate.document.entries[0],id:'e2'});
  assert.equal((await x.save(duplicate)).status,400);
  const missing=x.input();missing.document.entries[0].taskId='gone';assert.equal((await x.save(missing)).status,400);
  const draft=x.input();draft.deadlineUpdates=[];draft.document.entries[0].hours=null;draft.document.entries[0].status='';
  assert.equal(await x.save(draft),null);
});

test('web client sends week, revision and deadline in one request',async()=>{
  const calls=[],updates=[{projectId:'p1',taskId:'t1',deadline:null,expectedDeadline:'2026-11-01'}];
  const c=vm.createContext({S:{weeks:[{week:'2026-10-19',person:'An',_rev:'original'}],db:{
    api:async(method,url,body)=>calls.push({method,url,body}),doc(){assert.fail('Separate document write');}
  }},slug:()=> 'an',toast(){}});
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/core/data.js'),'utf8'),c);
  await c.saveWeek('2026-10-19','An',[{id:'e1',hours:2}],updates);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/weeks/save');
  assert.equal(calls[0].body.revision,'original');assert.equal(calls[0].body.deadlineUpdates,updates);
});
