const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {createSqliteStore} = require('../backend/lib/store');
const {stampProjectTasks,stampWeekEntries,validateCompletionDates} = require('../backend/lib/task-updates');
const source = fs.readFileSync(require.resolve('../backend/server.js'),'utf8');
const revision = raw=>raw===null?null:createHash('sha256').update(raw).digest('hex');

async function setup(t){
  const store=createSqliteStore(':memory:'); await store.init(); t.after(()=>store.close());
  const changes=[];
  const context=vm.createContext({store, COLLECTIONS:new Set(['projects']), ID_RE:/^[a-z0-9-]+$/,
    stampProjectTasks,stampWeekEntries,validateCompletionDates,
    canWrite:u=>u.allowed!==false, FULL_ROLES:new Set(['head']),
    peopleOf:(x,plural,single)=>x[plural]|| (x[single]?[x[single]]:[]),
    projectRevision:revision, projectConflict:()=>({status:409,error:'Conflict'}),
    audit:()=>changes.push('audit'),broadcast:()=>changes.push('broadcast'),
    bot:{onSaved(){}},console,
  });
  vm.runInContext(source.slice(source.indexOf('async function saveDoc('),source.indexOf('app.put("/api/doc/:coll/:id"')),context);
  const initial={name:'Original',owners:['An'],ses:[],tasks:[{id:'t1',detail:'First',owners:['An'],collabs:[]},{id:'t2',detail:'Second',owners:[],collabs:[]}]};
  await store.upsertDoc('projects/p1','projects','p1',JSON.stringify(initial),'head');
  const read=()=>store.getDoc('projects/p1');
  const user={username:'head',role:'head'};
  return {store,context,changes,read,user,save:context.saveDoc};
}

test('second editor cannot overwrite changes saved by first editor',async t=>{
  const x=await setup(t),raw=await x.read(),a=JSON.parse(raw),b=JSON.parse(raw);
  a.tasks[0].detail='Editor A';b.tasks[1].detail='Editor B';
  assert.equal(await x.save(x.user,'projects','p1',a,revision(raw)),null);
  const count=x.changes.length;
  assert.equal((await x.save(x.user,'projects','p1',b,revision(raw))).status,409);
  assert.equal(x.changes.length,count);
  assert.equal(JSON.parse(await x.read()).tasks[0].detail,'Editor A');
  assert.equal(JSON.parse(await x.read()).tasks[1].detail,'Second');
  const current=await x.read(),fresh=JSON.parse(current);fresh.tasks[1].detail='Editor B';
  assert.equal(await x.save(x.user,'projects','p1',fresh,revision(current)),null);
});

test('atomic comparison rejects write arriving between read and update',async t=>{
  const x=await setup(t),raw=await x.read(),body=JSON.parse(raw);
  const cas=x.store.compareAndSwapDoc.bind(x.store);
  x.store.compareAndSwapDoc=async(...args)=>{
    const newer=JSON.parse(raw);newer.tasks[1].detail='Concurrent update';
    await x.store.upsertDoc('projects/p1','projects','p1',JSON.stringify(newer),'other');
    return cas(...args);
  };
  body.tasks[0].detail='Stale';
  assert.equal((await x.save(x.user,'projects','p1',body,revision(raw))).status,409);
  assert.equal(JSON.parse(await x.read()).tasks[1].detail,'Concurrent update');
  assert.equal(x.changes.length,0);
});

test('simultaneous creations never overwrite existing project',async t=>{
  const x=await setup(t);
  const results=await Promise.all(['A','B'].map(name=>x.save(x.user,'projects','new',{name,tasks:[]},null)));
  assert.equal(results.filter(r=>r===null).length,1);
  assert.equal(results.filter(r=>r?.status===409).length,1);
});

test('missing version and lost permission are rejected; metadata is not stored',async t=>{
  const x=await setup(t),raw=await x.read();
  assert.equal((await x.save(x.user,'projects','p1',JSON.parse(raw),null)).status,409);
  assert.equal((await x.save({...x.user,allowed:false},'projects','p1',JSON.parse(raw),revision(raw))).status,403);
  const body={...JSON.parse(raw),_rev:revision(raw)};
  assert.equal(await x.save(x.user,'projects','p1',body,body._rev),null);
  assert.equal('_rev' in JSON.parse(await x.read()),false);
});

test('database comparison detects case-only edits and cannot resurrect deleted project',async t=>{
  const x=await setup(t),raw=await x.read();
  await x.store.upsertDoc('projects/p1','projects','p1',raw.replace('Original','ORIGINAL'),'other');
  assert.equal(await x.store.compareAndSwapDoc('projects/p1','projects','p1',raw,raw,'head'),false);
  await x.store.deleteDoc('projects/p1');
  assert.equal(await x.store.compareAndSwapDoc('projects/p1','projects','p1',raw,raw,'head'),false);
});

test('task-complexity patch preserves concurrent project edits',async t=>{
  const x=await setup(t),raw=await x.read();
  vm.runInContext(source.slice(source.indexOf('async function setTaskPt('),source.indexOf('/* Deadline dùng chung')),x.context);
  const original=x.store.compareAndSwapDoc.bind(x.store);
  x.store.compareAndSwapDoc=async(...args)=>{
    const newer=JSON.parse(raw);newer.name='Latest name';
    await x.store.upsertDoc('projects/p1','projects','p1',JSON.stringify(newer),'other');
    return original(...args);
  };
  assert.equal((await x.context.setTaskPt(x.user,'p1','t1',3)).status,409);
  assert.equal(JSON.parse(await x.read()).name,'Latest name');
});

test('deadline patch rejects project change between loading and saving',async t=>{
  const x=await setup(t);
  let handler;
  x.context.app={patch:(path,auth,fn)=>handler=fn};x.context.auth=()=>{};x.context.A=fn=>fn;
  const start=source.indexOf('app.patch("/api/doc/projects/:id/task-deadline"');
  const end=source.indexOf('app.patch("/api/doc/projects/:id/task-pt"',start);
  vm.runInContext(source.slice(start,end),x.context);
  let reads=0;
  const get=x.store.getDoc.bind(x.store);
  x.store.getDoc=async path=>{
    if(++reads===2){
      const newer=JSON.parse(await get(path));newer.name='Changed during deadline edit';
      await x.store.upsertDoc(path,'projects','p1',JSON.stringify(newer),'other');
    }
    return get(path);
  };
  const res={code:200,status(n){this.code=n;return this;},json(){return this;},end(){return this;}};
  await handler({params:{id:'p1'},body:{taskId:'t1',deadline:'2026-12-01'},user:x.user},res);
  assert.equal(res.code,409);
  const current=JSON.parse(await get('projects/p1'));
  assert.equal(current.name,'Changed during deadline edit');assert.equal(current.tasks[0].deadline,undefined);
});

test('client preserves original project revision despite removing derived fields',()=>{
  const context=vm.createContext({pOwners:p=>p.owners||[],pSes:p=>p.ses||[],tOwners:t=>t.owners||[],tCollabs:t=>t.collabs||[]});
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/core/data.js'),'utf8'),context);
  const result=context.normalizeProjectPeople({_rev:'original',_prog:0.5,name:'Test'},[]);
  assert.equal(result._rev,'original');assert.equal('_prog' in result,false);
  assert.equal(context.normalizeProjectPeople({name:'New'},[])._rev,null);
});
