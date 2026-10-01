import type { BoxInput, SolidInput, TriangleMesh, Vec3 } from '../core/mesh-types.ts';
import { meshMetrics } from '../core/geometry/mesh-metrics.ts';

const box=(center:Vec3=[0,0,0]):BoxInput=>({center,size:[20,20,20]});
interface Fixture { id:string; input:SolidInput; expectedVolumeMm3:number; expectedBounds:{min:Vec3;max:Vec3}|null }
export const solidFixtures:Fixture[]=[
  {id:'overlap-union',input:{kind:'boolean',operation:'union',a:box(),b:box([10,0,0])},expectedVolumeMm3:12000,expectedBounds:{min:[-10,-10,-10],max:[20,10,10]}},
  {id:'overlap-A-minus-B',input:{kind:'boolean',operation:'subtract',a:box(),b:box([10,0,0])},expectedVolumeMm3:4000,expectedBounds:{min:[-10,-10,-10],max:[0,10,10]}},
  {id:'overlap-B-minus-A',input:{kind:'boolean',operation:'subtract',a:box([10,0,0]),b:box()},expectedVolumeMm3:4000,expectedBounds:{min:[10,-10,-10],max:[20,10,10]}},
  {id:'overlap-intersect',input:{kind:'boolean',operation:'intersect',a:box(),b:box([10,0,0])},expectedVolumeMm3:4000,expectedBounds:{min:[0,-10,-10],max:[10,10,10]}},
  ...(['union','subtract','intersect'] as const).map(operation=>({id:`disjoint-${operation}`,input:{kind:'boolean' as const,operation,a:box(),b:box([30,0,0])},expectedVolumeMm3:operation==='union'?16000:operation==='subtract'?8000:0,expectedBounds:operation==='intersect'?null:{min:[-10,-10,-10] as Vec3,max:[operation==='union'?40:10,10,10] as Vec3}})),
  ...(['union','subtract','intersect'] as const).map(operation=>({id:`face-touch-${operation}`,input:{kind:'boolean' as const,operation,a:box(),b:box([20,0,0])},expectedVolumeMm3:operation==='union'?16000:operation==='subtract'?8000:0,expectedBounds:operation==='intersect'?null:{min:[-10,-10,-10] as Vec3,max:[operation==='union'?30:10,10,10] as Vec3}})),
  ...(['union','subtract','intersect'] as const).map(operation=>({id:`identical-coplanar-${operation}`,input:{kind:'boolean' as const,operation,a:box(),b:box()},expectedVolumeMm3:operation==='subtract'?0:8000,expectedBounds:operation==='subtract'?null:{min:[-10,-10,-10] as Vec3,max:[10,10,10] as Vec3}})),
  ...(['XY','XZ','YZ'] as const).flatMap(plane=>[10,-10].map(depth=>({id:`hole-${plane}-${depth}`,input:{kind:'hole-extrusion' as const,plane,depth},expectedVolumeMm3:11000,expectedBounds:plane==='XY'?{min:[0,0,Math.min(0,depth)] as Vec3,max:[40,30,Math.max(0,depth)] as Vec3}:plane==='XZ'?{min:[0,Math.min(0,-depth),0] as Vec3,max:[40,Math.max(0,-depth),30] as Vec3}:{min:[Math.min(0,depth),0,0] as Vec3,max:[Math.max(0,depth),40,30] as Vec3}}))),
];
export interface SolidEvidence { id:string; input:SolidInput; expectedVolumeMm3:number; actual:ReturnType<typeof meshMetrics>; volumeRelativeError:number; boundsMaxErrorMm:number; passed:true }
export function checkSolid(fixture:Fixture,mesh:TriangleMesh):SolidEvidence {
  const actual=meshMetrics(mesh);
  const fail=(message:string):never=>{throw new Error(`${fixture.id}: ${message}; ${JSON.stringify(actual)}`);};
  if (fixture.expectedVolumeMm3===0) {
    if(mesh.positions.length!==0 || actual.signedVolume!==0 || actual.bounds!==null) fail('expected explicit empty result');
    return {...fixture,actual,volumeRelativeError:0,boundsMaxErrorMm:0,passed:true};
  }
  const volumeRelativeError=Math.abs(actual.signedVolume-fixture.expectedVolumeMm3)/fixture.expectedVolumeMm3;
  const boundsMaxErrorMm=Math.max(...(['min','max'] as const).flatMap(key=>[0,1,2].map(axis=>Math.abs(actual.bounds![key][axis]!-fixture.expectedBounds![key][axis]!))));
  if (!actual.closed || actual.signedVolume<=0 || volumeRelativeError>1e-4 || boundsMaxErrorMm>4e-4) fail('closed/outward/volume/bounds assertion');
  return {...fixture,actual,volumeRelativeError,boundsMaxErrorMm,passed:true};
}
export async function runSolidFixtures(run:(input:SolidInput)=>Promise<TriangleMesh>):Promise<SolidEvidence[]> {
  const results:SolidEvidence[]=[];
  for(const fixture of solidFixtures) results.push(checkSolid(fixture,await run(fixture.input)));
  return results;
}
