import createModule from '../public/wasm/slvs.mjs';
import { ProjectEngine } from '../src/core/commands/project-engine.ts';
import { createEmptyProject, documentIds } from '../src/core/model/document.ts';
import { featureRecompute } from '../src/app/feature-recompute.ts';
import { solveDomainSketch } from '../src/adapters/solver/solve-domain-sketch.ts';
import { runSolid } from '../src/adapters/solid/solid-spike.ts';
import { domainRectangle } from '../src/experiments/domain-solver-fixtures.ts';
import { BASE_PLANES } from '../src/core/geometry/plane.ts';
import { buildSketchRegions, selectSketchRegion } from '../src/core/geometry/sketch-regions.ts';
const module=await createModule();
export const realRecompute=featureRecompute(async input=>solveDomainSketch(module,input),async input=>runSolid(input));
export async function fileFixture(plane='XY',allOperations=false) {
  const engine=new ProjectEngine(createEmptyProject(),{recompute:realRecompute});
  for(const [prefix,x] of [['a',0],['b',10]]) {
    const s=domainRectangle(20),ids=new Set(documentIds({...engine.document,features:[s]}).slice(1));
    const rename=v=>typeof v==='string'&&ids.has(v)?`${prefix}-${v}`:Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([key,value])=>[key,rename(value)])):v;
    const sketch=rename(s);sketch.id=prefix;sketch.plane=structuredClone(BASE_PLANES[plane]);sketch.constraints.find(c=>c.id===`${prefix}-height`).value=20;
    sketch.constraints.find(c=>c.id===`${prefix}-base-fixed`).fixedPosition=[x,0];for(const p of sketch.points)p.position[0]+=x;
    await engine.execute({kind:'add-feature',feature:sketch});const solved=engine.document.features.find(f=>f.id===prefix);
    await engine.execute({kind:'add-feature',feature:{id:`solid-${prefix}`,kind:'extrude',name:`实体 ${prefix}`,visible:true,sketchId:prefix,region:selectSketchRegion(buildSketchRegions(solved)).definition,depth:20}});
  }
  const operations=allOperations?[['union','union',false],['difference','subtract',false],['reverse','subtract',true],['join','intersect',false]]:[['join','intersect',false]];
  for(const [id,operation,reverse] of operations)await engine.execute({kind:'add-feature',feature:{id,kind:'boolean',name:id,visible:true,operation,operandAId:reverse?'solid-b':'solid-a',operandBId:reverse?'solid-a':'solid-b'}});
  return engine.document;
}
