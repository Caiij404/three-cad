import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
import {solveDomainSketch} from '../src/adapters/solver/solve-domain-sketch.ts';
import {linePair,runLinearConstraintFixtures,runAngleTransactionFixture} from '../src/experiments/linear-constraint-fixtures.ts';
const errors=[],module=await createModule({printErr:s=>errors.push(s)}),solve=async input=>solveDomainSketch(module,input),cases=await runLinearConstraintFixtures(solve),invalid=[];
for(const [id,mutate] of [
  ...['parallel','perpendicular','angle','equal'].map(kind=>[`${kind}-line-circle`,s=>{s.entities.push({id:'circle',kind:'circle',centerPointId:'a',radius:5});const relation=s.constraints.find(c=>c.id==='relation');relation.kind=kind;relation.refs[1]={entityId:'circle'};if(kind==='angle')relation.value=Math.PI/3;else delete relation.value;}]),
  ['angle-degrees-as-radians',s=>s.constraints.find(c=>c.id==='relation').value=60],
  ['angle-zero',s=>s.constraints.find(c=>c.id==='relation').value=0],
  ['angle-pi',s=>s.constraints.find(c=>c.id==='relation').value=Math.PI],
  ['same-object',s=>s.constraints.find(c=>c.id==='relation').refs[1]={entityId:'line-a'}],
]){const sketch=linePair('angle');mutate(sketch);assert.throws(()=>solveDomainSketch(module,{sketch}));invalid.push({id,rejectedBeforeNative:true});}
const transaction=await runAngleTransactionFixture(solve);assert(transaction.passed);assert.equal(errors.length,0,errors.join('\n'));
writeFileSync('docs/learning/evidence/T-201A-linear-native.json',JSON.stringify({task:'T-201A',executedAt:new Date().toISOString(),command:'npm run check:linear-constraints',environment:{node:process.version,platform:process.platform,solver:'unchanged fixed SolveSpace 2879a02d WASM'},cases,invalid,transaction,nativeErrors:errors,passed:true,limitations:['Full tangent combinations await T-201B; constraint panel and full REQ-005 await T-201C.']},null,2)+'\n');console.log(`PASS: ${cases.length} actual native direction/angle/equal cases, ${invalid.length} pre-native refusals, angle history/conflict transaction.`);
