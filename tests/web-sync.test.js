const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createSqliteStore}=require('../backend/lib/store');
const {createRevisionFeed,WEB_COLLECTIONS}=require('../backend/lib/revision-feed');

test('two connections see remote updates, deletion and restore; paused collections are excluded',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ptkt-web-sync-')),file=path.join(dir,'test.db');
  const a=createSqliteStore(file),b=createSqliteStore(file);
  t.after(async()=>{await a.close();await b.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});
  await a.init();await b.init();let now=1;
  const feedA=createRevisionFeed(a,()=>now),feedB=createRevisionFeed(b,()=>now);
  const initial=await feedA();assert.equal(initial.projects,(await feedB()).projects);
  await b.upsertDoc('projects/p1','projects','p1','{"v":1}','b');now+=5001;
  const created=await feedA();assert.notEqual(created.projects,initial.projects);
  await b.upsertDoc('projects/p1','projects','p1','{"v":2}','b');now+=5001;
  const updated=await feedA();assert.notEqual(updated.projects,created.projects);
  assert.equal(updated.projects,(await feedB()).projects);
  await b.deleteDoc('projects/p1');now+=5001;assert.equal((await feedA()).projects,initial.projects);
  await b.replaceAllDocs([{path:'weeks/w1',collection:'weeks',doc_id:'w1',body:'{}'}],'b');now+=5001;
  assert.notEqual((await feedA()).weeks,initial.weeks);
  assert.equal('kpiReview' in await feedA(),false);assert.equal(WEB_COLLECTIONS.has('telegramLink'),false);
});

function client(){
  let timer,version='v1',rows=0,snapshot,closed=false;
  const events=new Map(),calls=[],document={hidden:false,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const c=vm.createContext({S:{conn:'on'},document,setConn(){},showLogin(){},
    setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},
    EventSource:class{addEventListener(){}close(){closed=true;}},
    fetch:async url=>{
      calls.push(url);
      const data=url.startsWith('/api/versions')?{projects:version}:url.includes('/projects')?(rows++,[{id:'p1',data:{version}}]):[];
      return {ok:true,status:200,json:async()=>data};
    }});
  const source=fs.readFileSync(require.resolve('../frontend/js/core/server.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('function makeServerDb('),source.indexOf('async function connectServer(')),c);
  const db=c.makeServerDb();
  db.collection('projects').onSnapshot(s=>snapshot=s.docs[0].data());
  return {db,calls,document,events,setVersion:v=>version=v,rows:()=>rows,snapshot:()=>snapshot,closed:()=>closed,timer:()=>timer,
    async tick(){assert(timer);await timer();await new Promise(setImmediate);}};
}
test('client discovers changes from another node without SSE and skips unchanged collections',async()=>{
  const x=client();await x.db.refresh();await x.tick();const initialRows=x.rows();
  await x.tick();assert.equal(x.rows(),initialRows);
  x.setVersion('v2');await x.tick();assert.equal(x.rows(),initialRows+1);assert.equal(x.snapshot().version,'v2');
  x.db.close();assert.equal(x.timer(),null);assert.equal(x.closed(),true);
});
test('polling pauses on hidden tabs, catches up on return and ignores KPI/Telegram',async()=>{
  const x=client();x.db.collection('kpiReview').onSnapshot(()=>{});x.db.collection('telegramLink').onSnapshot(()=>{});
  await x.db.refresh();await x.tick();
  const count=x.calls.length;x.document.hidden=true;await x.tick();assert.equal(x.calls.length,count);
  x.setVersion('v3');x.document.hidden=false;x.events.get('visibilitychange')();await new Promise(setImmediate);
  assert.equal(x.snapshot().version,'v3');
  const urls=x.calls.filter(url=>url.startsWith('/api/versions'));
  assert(urls.every(url=>!url.includes('kpiReview')&&!url.includes('telegramLink')));
  x.db.close();
});
