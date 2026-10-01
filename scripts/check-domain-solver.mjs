import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { domainRectangle, runDomainSolverFixtures } from '../src/experiments/domain-solver-fixtures.ts';
import { createEmptyProject } from '../src/core/model/document.ts';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { sketchRecompute } from '../src/app/sketch-recompute.ts';
const errors=[],module=await createModule({printErr:message=>errors.push(message)});
const solve=async input=>solveDomainSketch(module,input);
const cases=await runDomainSolverFixtures(solve),invalid=[];
for(const [id,mutate] of [
  ['invalid-line-line-tangent',s=>s.constraints.push({id:'tangent',kind:'tangent',refs:[{entityId:'bottom'},{entityId:'right'}]})],
  ['radius-line',s=>s.constraints.push({id:'radius',kind:'radius',refs:[{entityId:'bottom'}],value:10})],
  ['missing-point',s=>s.entities[0].startPointId='missing'],
  ['non-finite',s=>s.points[1].position[0]=NaN],
]){const sketch=domainRectangle();mutate(sketch);assert.throws(()=>solveDomainSketch(module,{sketch}));invalid.push({id,rejected:true});}
const engine=new ProjectEngine(createEmptyProject({id:'real-transaction'}),{recompute:sketchRecompute(solve)});
await engine.execute({kind:'add-feature',feature:domainRectangle()});const committed=JSON.stringify(engine.document),history=engine.historyLength;
const conflict=domainRectangle();conflict.constraints.push({id:'conflict-width',kind:'length',refs:[{entityId:'bottom'}],value:50});
await assert.rejects(engine.execute({kind:'replace-feature',feature:conflict}),e=>e.code==='SOLVER_REJECTED');
assert.equal(JSON.stringify(engine.document),committed);assert.equal(engine.historyLength,history);
await engine.execute({kind:'replace-feature',feature:domainRectangle(60)});
const width=()=>Math.hypot(...engine.document.features[0].points[1].position);assert(Math.abs(width()-60)<=1e-5);
engine.undo();assert(Math.abs(width()-40)<=1e-5);engine.redo();assert(Math.abs(width()-60)<=1e-5);assert.equal(errors.length,0,errors.join('\n'));
writeFileSync(process.env.DOMAIN_SOLVER_EVIDENCE_PATH??'docs/learning/evidence/T-104A-domain-solver.json',JSON.stringify({task:process.env.DOMAIN_SOLVER_EVIDENCE_TASK??'T-104A',executedAt:new Date().toISOString(),command:'npm run check:domain-solver',environment:{node:process.version,platform:process.platform,solver:'SolveSpace 2879a02d / existing self-built WASM'},
  cases,invalid,transaction:{realSolver:true,conflictDocumentHistoryUnchanged:true,widths:[40,60,40,60],toleranceMm:1e-5},nativeErrors:errors,passed:true,
  limitations:['Subset for drawing plus existing length/radius/tangent; complete P0 constraint UI awaits T-201.','markDragged hint is not full pointer gesture/queue validation.','Sketch-only documents; generic solid recomputation awaits later tasks.']},null,2)+'\n');
console.log(`PASS: ${cases.length} real domain solver cases, ${invalid.length} rejections and real atomic conflict/undo/redo.`);
