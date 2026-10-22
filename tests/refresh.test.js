const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(){
  const c=vm.createContext({S:{},ACTIONS:{}, document:{getElementById:()=>({addEventListener(){}}),addEventListener(){}},
    EventSource:class {addEventListener(){} close(){}}, setTimeout, clearTimeout,
    render(){},toast(){}});
  for(const file of ['server','events']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/core',file+'.js'),'utf8'),c);
  return c;
}

test('refresh fetches all subscribed collections again with filters and without cache',async()=>{
  const c=setup(),calls=[];
  let value=1, snapshot;
  c.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>[{id:'a',data:{value}}]};};
  const db=c.makeServerDb();
  const unsubscribe=db.collection('weeks').where('week','>=','2026-10-19').onSnapshot(s=>{snapshot=s.docs[0].data();});
  db.collection('projects').onSnapshot(()=>{});
  await db.refresh();
  calls.length=0; value=2;
  await db.refresh();
  assert.equal(snapshot.value,2);
  assert.equal(calls.length,2);
  assert.ok(calls.some(r=>r.url==='/api/collection/weeks?field=week&gte=2026-10-19'));
  assert.ok(calls.every(r=>r.opts.cache==='no-store'));
  unsubscribe(); calls.length=0;
  await db.refresh();
  assert.equal(calls.length,1);
});

test('manual refresh reports request errors',async()=>{
  const c=setup();
  c.fetch=async()=>{throw new Error('offline');};
  const db=c.makeServerDb();
  db.collection('projects').onSnapshot(()=>{},()=>{});
  await assert.rejects(db.refresh(),e=>e.code==='unavailable');
});

test('button waits for refresh, prevents duplicate requests and reports failures',async()=>{
  const c=setup(),messages=[];
  let resolve,requests=0,renders=0;
  c.toast=s=>messages.push(s);c.render=()=>renders++;
  c.S.db={refresh:()=>{requests++;return new Promise(r=>{resolve=r;});}};
  const button={disabled:false,setAttribute(){},removeAttribute(){}};
  const pending=c.refreshViewData(button);
  assert.equal(button.disabled,true);
  assert.equal(messages.length,0);
  await c.refreshViewData(button);
  assert.equal(requests,1);
  resolve();await pending;
  assert.equal(renders,1);
  assert.equal(button.disabled,false);
  c.S.db.refresh=async()=>{throw new Error('Mất kết nối');};
  await c.refreshViewData(button);
  assert.equal(messages.at(-1),'Mất kết nối');
  assert.equal(renders,1);
  assert.equal(c.S.refreshing,false);
});
