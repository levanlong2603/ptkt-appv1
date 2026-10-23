const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const {randomUUID} = require('node:crypto');
const {createSqliteStore} = require('../backend/lib/store');

const source = fs.readFileSync(require.resolve('../backend/server.js'),'utf8');
const secret = 'session-test-secret-at-least-32-characters';
const idle = 30*60*1000;

async function setup(t){
  const store = createSqliteStore(':memory:');
  await store.init();
  t.after(()=>store.close());
  let now = Date.now(), user = {id:1, active:1, token_version:0};
  store.getUserById = async()=>user;
  const routes = new Map();
  const context = vm.createContext({
    store, jwt, randomUUID, COOKIE:'session', JWT_SECRET:secret, SESSION_DAYS:30,
    COOKIE_SECURE:false, FULL_ROLES:new Set(), A:f=>f,
    Date:class extends Date {static now(){return now;}},
    app:{post:(path,...handlers)=>routes.set(path,handlers),get(){}},
  });
  vm.runInContext(source.slice(source.indexOf('const IDLE_TIMEOUT_MIN ='),source.indexOf('/* --- dữ liệu --- */')),context);
  const response = ()=>({code:200, status(n){this.code=n;return this;},json(body){this.body=body;return this;},
    cookie(k,v){this.token=v;},clearCookie(){this.cleared=true;},end(){return this;}});
  const login = async()=>{const res=response();await context.setSession(res,user);return res.token;};
  const auth = async token=>{
    const req={cookies:{session:token}},res=response();let passed=false;
    await vm.runInContext('auth',context)(req,res,()=>passed=true);
    return {req,res,passed};
  };
  return {store,context,routes,response,login,auth,advance:ms=>now+=ms,now:()=>now,user};
}

test('idle timeout rejects the same token repeatedly, including after server recreation',async t=>{
  const x=await setup(t),token=await x.login();
  x.advance(idle);
  assert.equal((await x.auth(token)).res.code,401);
  assert.equal((await x.auth(token)).res.code,401);
  const recreated=vm.runInContext(`(()=>{${source.slice(source.indexOf('const auth = A('),source.indexOf('const adminOnly'))}; return auth;})()`,x.context);
  const res=x.response();
  await recreated({cookies:{session:token}},res,()=>assert.fail('Expired session accepted'));
  assert.equal(res.code,401);
});

test('activity renews only its own session; expired activity cannot revive it',async t=>{
  const x=await setup(t),a=await x.login(),b=await x.login();
  assert.notEqual(jwt.decode(a).sid,jwt.decode(b).sid);
  x.advance(20*60*1000);
  const active=await x.auth(a);
  await x.routes.get('/api/activity')[1](active.req,active.res);
  assert.equal(active.res.code,204);
  x.advance(11*60*1000);
  assert.equal((await x.auth(a)).passed,true);
  assert.equal((await x.auth(b)).res.code,401);
  const sid=jwt.decode(b).sid;
  assert.equal(await x.store.touchSession(sid,1,x.now(),x.now()-idle),false);
  assert.equal((await x.auth(b)).res.code,401);
});

test('ordinary API requests do not extend idle deadline',async t=>{
  const x=await setup(t),token=await x.login();
  x.advance(idle-1);
  assert.equal((await x.auth(token)).passed,true);
  x.advance(1);
  assert.equal((await x.auth(token)).res.code,401);
});

test('logout revokes only the current session and captured token cannot be replayed',async t=>{
  const x=await setup(t),a=await x.login(),b=await x.login(),res=x.response();
  await x.routes.get('/api/logout')[0]({cookies:{session:a}},res);
  assert.equal(res.code,204);
  assert.equal(res.cleared,true);
  assert.equal((await x.auth(a)).res.code,401);
  assert.equal((await x.auth(b)).passed,true);
});

test('legacy tokens and invalidated account versions require a new login',async t=>{
  const x=await setup(t);
  const old=jwt.sign({uid:1,tv:0},secret);
  assert.equal((await x.auth(old)).res.code,401);
  const token=await x.login();
  x.user.token_version++;
  assert.equal((await x.auth(token)).res.code,401);
});

test('deleted and pruned sessions cannot be recreated by activity',async t=>{
  const x=await setup(t),token=await x.login(),sid=jwt.decode(token).sid;
  x.advance(idle);
  await x.store.pruneSessions(x.now(),x.now()-idle);
  assert.equal(await x.store.getSession(sid),null);
  assert.equal(await x.store.touchSession(sid,1,x.now(),x.now()-idle),false);
  assert.equal((await x.auth(token)).res.code,401);
});
