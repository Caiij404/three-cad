import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { WorkerRpc } from '../src/workers/worker-rpc.ts';

class Port {
  onmessage=null;onerror=null;onmessageerror=null;messages=[];terminated=false;
  postMessage(value){this.messages.push(value);}
  terminate(){this.terminated=true;}
  reply(request,patch={}){this.onmessage?.({data:{...request,ok:true,output:request.input,...patch}});}
}
const evidence=[];
function setup(timeoutMs=1000){const ports=[];let sessions=0;const rpc=new WorkerRpc({
  createWorker:()=>{const port=new Port();ports.push(port);return port;},timeoutMs,createSession:()=>`session-${++sessions}`});
return {rpc,ports};}
test('out-of-order replies correlate to their own request/revision',async()=>{
  const {rpc,ports}=setup();const a=rpc.request('a',2),b=rpc.request('b',3);const port=ports[0];
  port.reply(port.messages[1]);port.reply(port.messages[0]);
  assert.deepEqual(await Promise.all([a,b]),['a','b']);rpc.dispose();evidence.push('out-of-order matched independently');
});
test('wrong session, request ID and revision cannot complete a pending call',async()=>{
  const {rpc,ports}=setup();let settled=false;const promise=rpc.request('accepted',7).then(v=>{settled=true;return v;});
  const port=ports[0],request=port.messages[0];
  port.reply(request,{sessionId:'old'});port.reply(request,{requestId:999});port.reply(request,{revision:6});
  await Promise.resolve();assert.equal(settled,false);port.reply(request);assert.equal(await promise,'accepted');
  port.reply(request,{output:'duplicate'});rpc.dispose();evidence.push('wrong/duplicate metadata ignored');
});
test('timeout terminates all pending work; retry gets new worker/session; old errors are ignored',async()=>{
  const {rpc,ports}=setup(20);const outcomes=Promise.allSettled([rpc.request('a'),rpc.request('b')]);
  const first=ports[0];const results=await outcomes;
  assert(results.every(r=>r.status==='rejected' && /TIMEOUT/.test(r.reason.message)));assert(first.terminated);
  const retry=rpc.request('recovered');const second=ports[1];
  assert.notEqual(first.messages[0].sessionId,second.messages[0].sessionId);
  first.reply(first.messages[0]);first.onerror?.({message:'late old failure'});
  assert.equal(second.terminated,false);second.reply(second.messages[0]);assert.equal(await retry,'recovered');
  rpc.dispose();evidence.push('20 ms controlled deadline and old-worker isolation');
});
test('worker failure rejects queue and explicit retry recovers',async()=>{
  const {rpc,ports}=setup();const pending=rpc.request('a');const rejection=assert.rejects(pending,/WORKER_ERROR/);
  ports[0].onerror({message:'intentional crash'});await rejection;
  const retry=rpc.request('b');ports[1].reply(ports[1].messages[0]);assert.equal(await retry,'b');rpc.dispose();
  evidence.push('error rejects and retry succeeds');
});
test('message decode error terminates worker',async()=>{
  const {rpc,ports}=setup();const pending=rpc.request('a'),rejection=assert.rejects(pending,/MESSAGE_ERROR/);
  ports[0].onmessageerror({});await rejection;assert(ports[0].terminated);rpc.dispose();evidence.push('message decode error');
});
test('creation and clone failures reject without retaining a pending deadline',async()=>{
  const unavailable=new WorkerRpc({createWorker:()=>{throw new Error('unavailable');}});
  await assert.rejects(unavailable.request('a'),/unavailable/);unavailable.dispose();
  const port=new Port();port.postMessage=()=>{throw new Error('cannot clone');};
  const rpc=new WorkerRpc({createWorker:()=>port,timeoutMs:20});await assert.rejects(rpc.request('a'),/cannot clone/);
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(port.terminated,false);rpc.dispose();
  evidence.push('creation/clone failures clean timers');
});
test('dispose rejects pending work; repeated dispose and requests cannot resurrect a worker',async()=>{
  const {rpc,ports}=setup();const pending=rpc.request('a'),rejection=assert.rejects(pending,/DISPOSED/);
  rpc.dispose();rpc.dispose();await rejection;await assert.rejects(rpc.request('b'),/DISPOSED/);
  assert.equal(ports.length,1);assert(ports[0].terminated);evidence.push('dispose prevents resurrection');
});
test('invalid revisions are rejected before Worker creation',async()=>{
  const {rpc,ports}=setup();for(const revision of [-1,NaN,0.5])await assert.rejects(rpc.request('a',revision),/INVALID_REVISION/);
  assert.equal(ports.length,0);rpc.dispose();evidence.push('invalid revision boundary');
});
after(()=>writeFileSync(new URL(process.env.WORKER_EVIDENCE_PATH ?? '../docs/learning/evidence/T-005-worker-rpc.json',import.meta.url),JSON.stringify({
  task:process.env.WORKER_EVIDENCE_TASK ?? 'T-005',executedAt:new Date().toISOString(),command:'npm run check:worker',environment:{node:process.version,platform:process.platform},
  method:'Controlled transport ports test protocol and lifecycle; these are not geometry-solver mocks presented as numerical evidence.',
  checks:evidence,passed:evidence.length===8},null,2)+'\n'));
