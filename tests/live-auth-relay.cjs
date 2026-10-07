// Integration check of the deployed relay; no real accounts or finance data.
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const endpoint = 'https://jtxewfrdlaygwsxhxtwg.supabase.co/functions/v1/tiin-auth-handoff';
async function call(body, origin='https://tiin-app.vercel.app') {
  const raw = execFileSync('curl',['-sS','--max-time','20','-X','POST','-H','Origin: '+origin,'-H','Content-Type: application/json','--data-binary',JSON.stringify(body),'-w','\n%{http_code}',endpoint],{encoding:'utf8'});
  const split=raw.lastIndexOf('\n');
  return {status:Number(raw.slice(split+1)),data:JSON.parse(raw.slice(0,split))};
}
(async()=>{
  const id=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
  const claimHash=createHash('sha256').update(secret).digest('hex');
  try {
    assert.equal((await call({action:'create',id,claimHash})).status,201);
    assert.equal((await call({action:'claim',id,secret})).data.code,null);
    assert.equal((await call({action:'claim',id,secret:randomBytes(32).toString('hex')})).status,403);
    assert.equal((await call({action:'complete',id,code:'test-pkce-code-not-a-real-login'})).status,200);
    assert.equal((await call({action:'complete',id,code:'second-code-rejected'})).status,410);
    assert.equal((await call({action:'claim',id,secret})).data.code,'test-pkce-code-not-a-real-login');
    assert.equal((await call({action:'claim',id,secret},'https://attacker.invalid')).status,403);
    assert.equal((await call({action:'ack',id,secret})).status,200);
    assert.equal((await call({action:'claim',id,secret})).status,403);
    console.log('PASS: live relay creation, pending poll, secret isolation, callback, replay rejection, origin isolation, acknowledgement');
    const url=new URL('https://jtxewfrdlaygwsxhxtwg.supabase.co/auth/v1/authorize');
    const redirect='https://tiin-app.vercel.app/?tiin_auth_return='+id;
    url.searchParams.set('provider','google');url.searchParams.set('redirect_to',redirect);
    url.searchParams.set('code_challenge',claimHash);url.searchParams.set('code_challenge_method','s256');
    const auth=execFileSync('curl',['-sS','--max-time','20','-D','-',url.href],{encoding:'utf8'});
    const location=auth.match(/^location: (.+)$/im)?.[1].trim();
    assert.ok(location,'Google redirect present');
    const google=new URL(location);
    assert.equal(google.hostname,'accounts.google.com');
    assert.ok(google.searchParams.get('state'),'Supabase OAuth state present');
    console.log('PASS: Google provider enabled and OAuth initiation accepted');
  } finally { await call({action:'ack',id,secret}); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
