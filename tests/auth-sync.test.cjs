const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
class Storage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i]; }
  getItem(k) { return this.values.get(k) ?? null; }
  setItem(k,v) { this.values.set(k, String(v)); }
  removeItem(k) { this.values.delete(k); }
}
function context(storage = new Storage()) {
  const elements = new Map(['app','modal','modalOverlay'].map(k => [k, { style: {}, classList: { add(){}, remove(){} }, innerHTML:'' }]));
  const ctx = vm.createContext({ console, crypto, Storage: class extends Storage {}, localStorage: storage, URL, URLSearchParams, TextEncoder, Uint8Array, AbortSignal, navigator: { onLine:true },
    location: { origin:'https://tiin-app.vercel.app', pathname:'/', search:'' }, history: { replaceState(){} },
    setTimeout: () => 1, clearTimeout(){}, setInterval(){}, requestAnimationFrame(){}, alert(message) { ctx.lastAlert = message; },
    document: { hidden:false, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(id) { return elements.get(id); }, head: { appendChild(){} } },
    addEventListener(){}, render(){}, closeModal(){}, fetch: global.fetch });
  ctx.window = ctx;
  return ctx;
}
function syncContext() {
  const ctx = context();
  ctx.localStorage = new ctx.Storage();
  const remote = new Map();
  const calls = [];
  const user = { id:'user-1', email:'test@example.invalid' };
  let locked = false;
  let hook = null;
  class Query {
    constructor(table) { this.table=table; this.filters=[]; this.mode='select'; this.fields='*'; }
    select(fields) { this.fields=fields; return this; }
    eq(k,v) { this.filters.push([k,v]); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { this.single=true; return this; }
    upsert(row) { this.mode='upsert'; this.row=row; return this; }
    update(row) { this.mode='update'; this.row=row; return this; }
    insert(row) { this.mode='insert'; this.row=row; return this; }
    then(resolve,reject) { return this.execute().then(resolve,reject); }
    async execute() {
      assert.equal(locked,false,'Supabase API invoked inside auth callback');
      calls.push(this);
      if (this.table==='profiles') return {data:[],error:null};
      let found = [...remote.values()].filter(row => this.filters.every(([k,v]) => row[k]===v));
      if (this.mode==='select') return { data: this.single ? found[0] || null : found, error:null };
      if (hook) { const run=hook; hook=null; await run(); }
      found = [...remote.values()].filter(row => this.filters.every(([k,v]) => row[k]===v));
      if (this.mode==='update') { found.forEach(row => remote.set(row.document_key,{...row,...this.row})); return {data:found,error:null}; }
      if (this.mode==='insert' && remote.has(this.row.document_key)) return {data:null,error:{code:'23505'}};
      remote.set(this.row.document_key,this.row); return {data:[this.row],error:null};
    }
  }
  let listener;
  const client = { from(table){return new Query(table);}, auth: {
    async getSession(){ assert.equal(locked,false); return {data:{session:{user}},error:null}; },
    onAuthStateChange(fn){listener=fn;return {};}, startAutoRefresh(){}, async signOut(){return {error:null};}
  }};
  ctx.supabase={ createClient(url,key,options){ctx.options=options;return client;} };
  ctx.TIINAuthHandoff = {callback(){return {};},pending(){return null;},async resume(){return {};} };
  const instrumented=source('tiin-sync.js').replace('window.TIINCloud = {', 'window.__test = { state, getClient, boot, flush, uploadDocuments, pullCloudDocuments, queueDocument, collectLocalDocuments, mergeWithBaseline, markMigrated, baseline, setBaseline, reconcileSession }; window.TIINCloud = {');
  vm.runInContext(instrumented,ctx);
  return {ctx, client, remote, calls, user, setHook(fn){hook=fn;}, fire(){locked=true;listener('SIGNED_IN',{user});locked=false;} };
}
test('PKCE relay hands code to original PWA, not Safari session; survives PWA restart',async()=>{
  const challenges=new Map();
  async function fetchRelay(url,options){const b=JSON.parse(options.body); let row=challenges.get(b.id);
    if(b.action==='create'){row={hash:b.claimHash,expiresAt:new Date(Date.now()+600000).toISOString()};challenges.set(b.id,row);}
    if(b.action==='complete') row.code=b.code;
    if(b.action==='ack')challenges.delete(b.id);
    return {ok:true,async json(){return b.action==='create'?{expiresAt:row.expiresAt}:b.action==='claim'?{code:row.code}:{ready:true};}};
  }
  const pwa=context(); pwa.fetch=fetchRelay;
  vm.runInContext(source('tiin-auth-handoff.js'),pwa);
  const redirect=await pwa.TIINAuthHandoff.prepare();
  pwa.localStorage.setItem('verifier','original-device');
  const safari=context();safari.fetch=fetchRelay;safari.location.search=new URL(redirect).search+'&code=one-use-code';
  vm.runInContext(source('tiin-auth-handoff.js'),safari);
  const callback=await safari.TIINAuthHandoff.handleCallback(()=>{throw new Error('Safari must not exchange tokens');});
  assert.equal(callback.external,true);
  assert.equal(safari.localStorage.length,0);
  const restarted=context(pwa.localStorage);restarted.fetch=fetchRelay;
  vm.runInContext(source('tiin-auth-handoff.js'),restarted);
  const result=await restarted.TIINAuthHandoff.resume({auth:{async exchangeCodeForSession(code){assert.equal(code,'one-use-code');assert.equal(restarted.localStorage.getItem('verifier'),'original-device');return {data:{session:{user:{id:'u'}}},error:null};}}});
  assert.ok(result.session);
  assert.equal(restarted.TIINAuthHandoff.pending(),null);
});
test('same browser callback exchanges directly',async()=>{
  const ctx=context();ctx.fetch=async()=>({ok:true,json:async()=>({expiresAt:new Date(Date.now()+600000).toISOString()})});
  vm.runInContext(source('tiin-auth-handoff.js'),ctx);
  const redirect=await ctx.TIINAuthHandoff.prepare();ctx.location.search=new URL(redirect).search+'&code=direct-code';
  const result=await ctx.TIINAuthHandoff.handleCallback(async()=>({auth:{exchangeCodeForSession:async()=>({error:null})}}));
  assert.equal(result.external,false);assert.equal(ctx.TIINAuthHandoff.pending(),null);
});
test('offline relay errors retain pending login',async()=>{
  const ctx=context();ctx.fetch=async()=>({ok:true,json:async()=>({expiresAt:new Date(Date.now()+600000).toISOString()})});vm.runInContext(source('tiin-auth-handoff.js'),ctx);
  await ctx.TIINAuthHandoff.prepare();ctx.fetch=async()=>{throw new Error('offline');};
  await assert.rejects(ctx.TIINAuthHandoff.resume({}),/offline/);assert.ok(ctx.TIINAuthHandoff.pending());
});
test('Safari never exchanges a cloned PWA verifier',async()=>{
  const pwa=context();pwa.navigator.standalone=true;pwa.fetch=async()=>({ok:true,json:async()=>({expiresAt:new Date(Date.now()+600000).toISOString()})});
  vm.runInContext(source('tiin-auth-handoff.js'),pwa);const redirect=await pwa.TIINAuthHandoff.prepare();
  const safari=context(pwa.localStorage);safari.fetch=pwa.fetch;safari.location.search=new URL(redirect).search+'&code=valid-pkce-code';
  vm.runInContext(source('tiin-auth-handoff.js'),safari);const result=await safari.TIINAuthHandoff.handleCallback(()=>{throw new Error('Do not consume a code in Safari');});assert.equal(result.external,true);assert.ok(pwa.TIINAuthHandoff.pending());
});
test('expired challenge is cleared without touching finance data',async()=>{
  const ctx=context();ctx.localStorage.setItem('tiin_auth_pending_pkce_v1','{"id":"expired","expiresAt":1}');ctx.localStorage.setItem('txns_2026_9','[{"id":1}]');vm.runInContext(source('tiin-auth-handoff.js'),ctx);const result=await ctx.TIINAuthHandoff.resume({});assert.equal(result.expired,true);assert.equal(ctx.localStorage.getItem('txns_2026_9'),'[{"id":1}]');
});
test('auth uses persisted localStorage PKCE session',async()=>{
  const {ctx}=syncContext();await ctx.__test.getClient();assert.equal(ctx.options.auth.persistSession,true);assert.equal(ctx.options.auth.autoRefreshToken,true);assert.equal(ctx.options.auth.flowType,'pkce');assert.equal(ctx.options.auth.storage,ctx.localStorage);
});
test('auth callback does not call Supabase under the auth lock',async()=>{const s=syncContext();await s.ctx.__test.boot();s.fire();});
test('empty cloud never removes local financial records',async()=>{
  const {ctx,user}=syncContext();const value='[{"id":1,"amount":123,"type":"income"}]';ctx.localStorage.setItem('txns_2026_9',value);ctx.__test.state.user=user;
  await ctx.TIINCloud.syncNow();assert.equal(ctx.localStorage.getItem('txns_2026_9'),value);assert.match(ctx.document.getElementById('modal').innerHTML,/Найдены локальные/);
});
test('download does not queue itself or overwrite unsent edits',async()=>{
  const {ctx,user,remote}=syncContext();ctx.__test.state.user=user;ctx.__test.markMigrated();remote.set('txns_2026_9',{user_id:user.id,document_key:'txns_2026_9',payload:{value:'[{"id":1}]'},version:1});
  await ctx.__test.pullCloudDocuments();assert.equal(ctx.localStorage.getItem('tiin_sync_queue_v1'),null);
  ctx.localStorage.setItem('txns_2026_9','[{"id":1},{"id":2}]');ctx.__test.queueDocument('txns_2026_9');await ctx.__test.pullCloudDocuments();assert.equal(JSON.parse(ctx.localStorage.getItem('txns_2026_9')).length,2);
});
test('two-device additions, edits and deletes merge using a baseline',()=>{
  const {ctx}=syncContext();const merge=(local,remote,old)=>JSON.parse(ctx.__test.mergeWithBaseline(JSON.stringify(local),JSON.stringify(remote),JSON.stringify(old)));
  assert.deepEqual(merge([{id:1,v:2},{id:3}], [{id:1,v:1},{id:2}], [{id:1,v:1}]),[{id:1,v:2},{id:2},{id:3}]);
  assert.deepEqual(merge([], [{id:1},{id:2}], [{id:1}]),[{id:2}]);
});
test('in-flight local edit remains queued after upload finishes',async()=>{
  const s=syncContext(),{ctx,user}=s;ctx.__test.state.user=user;ctx.__test.markMigrated();ctx.localStorage.setItem('txns_2026_9','[{"id":1}]');ctx.__test.queueDocument('txns_2026_9');
  s.setHook(()=>{ctx.localStorage.setItem('txns_2026_9','[{"id":1},{"id":2}]');ctx.__test.queueDocument('txns_2026_9');});await ctx.__test.flush();assert.equal(JSON.parse(ctx.localStorage.getItem('tiin_sync_queue_v1')).length,1);assert.equal(JSON.parse(ctx.localStorage.getItem('txns_2026_9')).length,2);
});
test('migration backup required, upload verified and old records preserved',async()=>{
  const {ctx,user,remote}=syncContext();ctx.__test.state.user=user;ctx.localStorage.setItem('txns_2026_8','[{"id":1}]');remote.set('txns_2026_8',{user_id:user.id,document_key:'txns_2026_8',payload:{value:'[{"id":2}]'},version:1});await ctx.TIINCloud.confirmMigration();
  assert.ok(ctx.localStorage.getItem('tiin_local_recovery_backup_v1'));assert.equal(JSON.parse(ctx.localStorage.getItem('txns_2026_8')).length,2);assert.equal(ctx.localStorage.getItem('tiin_cloud_migration_confirmed_v1:'+user.id),'1');assert.equal(ctx.lastAlert,undefined);
});
test('migration stops if recovery snapshot cannot be saved',async()=>{
  const {ctx,user,remote}=syncContext();ctx.__test.state.user=user;ctx.localStorage.setItem('txns_2026_8','[{"id":1}]');const original=ctx.localStorage.setItem.bind(ctx.localStorage);ctx.localStorage.setItem=(key,value)=>{if(key==='tiin_local_recovery_backup_v1')throw new Error('quota');original(key,value);};await ctx.TIINCloud.confirmMigration();assert.equal(remote.size,0);assert.match(ctx.lastAlert,/резервную копию/);assert.equal(ctx.localStorage.getItem('txns_2026_8'),'[{"id":1}]');
});
test('migration status is scoped to account, not shared with another user',async()=>{const {ctx}=syncContext();ctx.__test.state.user={id:'other'};ctx.localStorage.setItem('tiin_cloud_migration_confirmed_v1:user-1','1');ctx.localStorage.setItem('txns_2026_9','[{"id":1}]');ctx.__test.queueDocument('txns_2026_9');await ctx.__test.flush();assert.equal(ctx.localStorage.getItem('tiin_sync_queue_v1')!==null,true);});
test('balance carryover anchors are included in cloud documents',()=>{const {ctx}=syncContext();ctx.localStorage.setItem('tiin_balance_anchor_v2_all','{"year":2026,"month":8}');assert.equal(ctx.__test.collectLocalDocuments()[0].key,'tiin_balance_anchor_v2_all');});
