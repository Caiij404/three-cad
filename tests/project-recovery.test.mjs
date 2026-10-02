import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { writeFileSync } from 'node:fs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject, DomainError } from '../src/core/model/document.ts';
import { parseProjectJson, serializeProject } from '../src/core/model/validate-document.ts';
import { meshMetrics } from '../src/core/geometry/mesh-metrics.ts';
import { ProjectRecovery } from '../src/app/project-recovery.ts';
import { fileFixture, realRecompute } from '../scripts/project-file-fixtures.mjs';
const fixture=await fileFixture(),evidence=[];
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await tick();}assert.fail('condition timed out');}
const record=document=>({recoveryVersion:1,savedAt:new Date().toISOString(),text:serializeProject(document)});
class SessionPort {
  engine=new ProjectEngine(createEmptyProject(),{recompute:realRecompute});listeners=new Set();
  snapshot(){const e=this.engine;return{document:e.document,revision:e.revision,projectSessionId:e.projectSessionId,dirty:e.dirty,canUndo:e.canUndo,canRedo:e.canRedo,busy:e.busy,diagnostics:e.diagnostics};}
  subscribe(fn){this.listeners.add(fn);fn(this.snapshot());return()=>this.listeners.delete(fn);}
  publish(){for(const fn of this.listeners)fn(this.snapshot());}
  async execute(command){const pending=this.engine.execute(command);this.publish();try{await pending;}finally{this.publish();}}
  async openJson(text,options={}){const pending=this.engine.openDocument(parseProjectJson(text),{markAsSaved:!options.recovered});this.publish();try{await pending;}finally{this.publish();}}
  cancelPending(){this.engine.cancelPending();this.publish();}
}
function store(value){return{value,writes:[],clears:0,async read(){return this.value;},async write(value){this.writes.push(structuredClone(value));this.value=value;},async clear(){this.clears++;this.value=undefined;}};}
test('debounce writes only the latest committed document; serial writes converge after a project switch',async()=>{
  const session=new SessionPort();await session.openJson(serializeProject(fixture));const storage=store(),recovery=new ProjectRecovery(session,storage,20);
  try{
    await until(()=>recovery.snapshot().phase==='idle');for(let i=0;i<6;i++)await session.execute({kind:'rename-project',name:`step-${i}`});
    assert.equal(storage.writes.length,0);await until(()=>storage.writes.length===1);assert.equal(parseProjectJson(storage.value.text).name,'step-5');assert(session.engine.dirty);
    const original=storage.write.bind(storage);let release;storage.write=async value=>{await new Promise(resolve=>{release=resolve;});await original(value);};
    await session.execute({kind:'rename-project',name:'held'});await until(()=>!!release);
    const next=structuredClone(fixture);next.id='new-file';next.name='new project';await session.openJson(serializeProject(next));await tick();
    storage.write=original;release();await until(()=>parseProjectJson(storage.value.text).id==='new-file');assert(!session.engine.dirty);
    evidence.push({id:'debounce-and-serial-switch',rapidChanges:6,firstWrites:1,latestName:'step-5',heldOldWriteConvergesToNewProject:true,autoWriteDoesNotMarkManuallySaved:true,passed:true});
  }finally{recovery.dispose();}
});
test('a delayed initial read cannot offer or overwrite a manually opened project',async()=>{
  const session=new SessionPort(),storage=store(record(fixture));let release;storage.read=()=>new Promise(resolve=>{release=resolve;});const recovery=new ProjectRecovery(session,storage,5);
  try{
    const manual=structuredClone(fixture);manual.id='manual';manual.name='manual open';await session.openJson(serializeProject(manual));release(record(fixture));
    await until(()=>storage.writes.length===1);assert.equal(recovery.snapshot().candidate,null);assert.equal(session.engine.document.id,'manual');assert.equal(parseProjectJson(storage.value.text).id,'manual');
    evidence.push({id:'delayed-read-manual-open',manualProjectPreserved:true,oldCandidateNeverOffered:true,passed:true});
  }finally{recovery.dispose();}
});
test('explicit recovery performs real cold rebuild and remains dirty until manual save; discard preserves current authority',async()=>{
  const session=new SessionPort(),storage=store(record(fixture)),recovery=new ProjectRecovery(session,storage,5);
  try{
    await until(()=>recovery.snapshot().candidate);const initial=session.snapshot();assert.equal(initial.document.features.length,0);await tick();assert.equal(storage.writes.length,0);
    await recovery.restore();assert.deepEqual(session.engine.document,fixture);assert.equal(meshMetrics(session.engine.cache.join).signedVolume,4000);assert(session.engine.dirty);assert(!session.engine.canUndo);
    await until(()=>recovery.snapshot().phase==='saved');assert(session.engine.dirty);session.engine.markSaved(session.engine.captureSave());assert(!session.engine.dirty);
    const before=session.snapshot();await recovery.discard();assert.deepEqual(session.snapshot(),before);assert.equal(storage.value,undefined);
    evidence.push({id:'real-recovery-and-discard',actualIntersectionMm3:4000,emptyHistory:true,restoredProjectDirtyUntilManualConfirmation:true,discardPreservesAuthority:true,passed:true});
  }finally{recovery.dispose();}
});
test('quota failures preserve manual file serialization; retry and disposal respect the recovery lifecycle',async()=>{
  const session=new SessionPort(),storage=store(),write=storage.write.bind(storage),recovery=new ProjectRecovery(session,storage,5);
  try{
    await until(()=>recovery.snapshot().phase==='idle');storage.write=async()=>{throw new DomainError('RECOVERY_QUOTA','quota');};await session.openJson(serializeProject(fixture));await session.execute({kind:'rename-project',name:'not lost'});
    await until(()=>recovery.snapshot().phase==='error');assert.match(recovery.snapshot().error,/RECOVERY_QUOTA/);const before=session.snapshot(),download=serializeProject(before.document);assert.deepEqual(parseProjectJson(download),before.document);assert(session.engine.dirty);
    storage.write=write;recovery.retry();await until(()=>recovery.snapshot().phase==='saved');assert.deepEqual(session.snapshot(),before);assert.equal(parseProjectJson(storage.value.text).name,'not lost');
    await session.execute({kind:'rename-project',name:'disposed'});const writes=storage.writes.length;recovery.dispose();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(storage.writes.length,writes);
    evidence.push({id:'quota-retry-and-dispose',errorCode:'RECOVERY_QUOTA',manualJsonExact:true,retryNeverChangesAuthorityOrDirty:true,disposedTimerNeverWrites:true,passed:true});
  }finally{recovery.dispose();}
});
test('corrupt recovery data never replaces current authority and can be explicitly discarded',async()=>{
  const session=new SessionPort(),before=session.snapshot(),storage=store({recoveryVersion:1,savedAt:new Date().toISOString(),text:'{'}),recovery=new ProjectRecovery(session,storage,5);
  try{
    await until(()=>recovery.snapshot().phase==='error');assert.match(recovery.snapshot().error,/INVALID_JSON/);assert.deepEqual(session.snapshot(),before);await recovery.discard();assert.equal(storage.value,undefined);assert.deepEqual(session.snapshot(),before);
    evidence.push({id:'corrupt-record',corruptReadNeverChangesAuthority:true,explicitDiscard:true,passed:true});
  }finally{recovery.dispose();}
});
test('cancelled recovery completion cannot clear the state of a newer real recovery',async()=>{
  const session=new SessionPort(),gates=[];session.engine=new ProjectEngine(createEmptyProject(),{recompute:async(document,context)=>{const result=await realRecompute(document,context);await new Promise(resolve=>gates.push({resolve,result}));return result;}});
  const storage=store(record(fixture)),recovery=new ProjectRecovery(session,storage,5),before=session.snapshot();
  try{
    await until(()=>recovery.snapshot().candidate);const old=recovery.restore();await until(()=>gates.length===1);assert.equal(meshMetrics(gates[0].result.cache.join).signedVolume,4000);
    recovery.cancelRestore();assert.deepEqual(session.snapshot(),before);const next=recovery.restore();await until(()=>gates.length===2);gates[0].resolve();await old;assert.equal(recovery.snapshot().phase,'restoring');assert(session.engine.busy);
    gates[1].resolve();await next;assert.deepEqual(session.engine.document,fixture);assert(session.engine.dirty);assert.equal(meshMetrics(session.engine.cache.join).signedVolume,4000);
    evidence.push({id:'cancelled-and-newer-recovery',lateRealIntersectionMm3:4000,oldFinallyDoesNotClearNewRestoring:true,exactOldAuthorityAfterCancel:true,newRecoverySucceeds:true,passed:true});
  }finally{recovery.dispose();}
});
after(()=>writeFileSync('docs/learning/evidence/T-401C-project-recovery-node.json',JSON.stringify({task:'T-401C',executedAt:new Date().toISOString(),command:'node --test tests/project-recovery.test.mjs',environment:{node:process.version,platform:process.platform},evidence,passed:evidence.length===6,limitations:['Node uses controlled storage promises for scheduler races; browser suite must verify actual IndexedDB transactions.','Geometry is actual pinned WASM/extrusion/CSG.']},null,2)+'\n'));
