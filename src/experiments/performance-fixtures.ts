import { createEmptyProject, type SketchFeature } from '../core/model/document.ts';
import { BASE_PLANES } from '../core/geometry/plane.ts';
import { buildSketchRegions, selectSketchRegion } from '../core/geometry/sketch-regions.ts';
import { contourFixture } from './region-fixtures.ts';

/** Serializable inputs only. All meshes/diagnostics must come from the actual kernels. */
export function performanceFixture() {
  const document=createEmptyProject({id:'performance-project'});
  const holes=[];
  for(const x of [-1800,0,1800])for(const y of [-1800,0,1800])holes.push({kind:'circle' as const,id:`hole-${holes.length}`,center:[x,y] as [number,number],radius:500});
  const profile=contourFixture('performance-profile',[{kind:'circle',id:'outer',center:[0,0],radius:4000},...holes]);
  // Preserve unconstrained circle initial values through the native solver; exactly 100 constraints belong to the line fixture.
  profile.constraints=[];
  const lines:SketchFeature={id:'performance-lines',kind:'sketch',name:'100 lines / 100 length constraints',visible:true,plane:{...structuredClone(BASE_PLANES.XY),origin:[0,5000,0]},points:[],entities:[],constraints:[]};
  for(let i=0;i<100;i++) {
    const x=(i%10)*20-100,y=Math.floor(i/10)*20-100,a=`line-${i}-a`,b=`line-${i}-b`,id=`line-${i}`;
    lines.points.push({id:a,position:[x,y]},{id:b,position:[x+10,y]});
    lines.entities.push({id,kind:'line',startPointId:a,endPointId:b});
    lines.constraints.push({id:`length-${i}`,kind:'length',refs:[{entityId:id}],value:10});
  }
  const region=selectSketchRegion(buildSketchRegions(profile)).definition;
  document.features=[profile,lines];
  for(let i=0;i<10;i++)document.features.push({id:`performance-solid-${i}`,name:`Actual perforated extrusion ${i+1}`,kind:'extrude',visible:true,sketchId:profile.id,region:structuredClone(region),depth:100+i*20});
  return{document,profile,lines,region,analyticAreaMm2:Math.PI*(4000**2-9*500**2)};
}

/** Full-size CSG scene: 92 independent lines + two four-edge profiles, 100 constraints,
 * eight denser genuine solids + two small operands. No derived meshes are fabricated. */
export function performanceCsgFixture() {
  const fixture=performanceFixture();
  for(const point of fixture.profile.points)point.position=point.position.map(n=>n*1.5) as [number,number];
  for(const entity of fixture.profile.entities)if(entity.kind==='circle')entity.radius*=1.5;
  fixture.lines.points=fixture.lines.points.slice(0,184);fixture.lines.entities=fixture.lines.entities.slice(0,92);fixture.lines.constraints=fixture.lines.constraints.slice(0,92);
  fixture.document.features=fixture.document.features.slice(0,10);
  const operands=[];
  for(const [suffix,x]of [['a',0],['b',10]] as const) {
    const id=`performance-simple-${suffix}`,sketch:SketchFeature={id:`${id}-sketch`,name:`Simple operand ${suffix}`,kind:'sketch',visible:true,plane:{...structuredClone(BASE_PLANES.XY),origin:[0,7000,0]},points:[],entities:[],constraints:[]};
    for(const [i,p]of [[x,0],[x+20,0],[x+20,20],[x,20]].entries())sketch.points.push({id:`${id}-p${i}`,position:p as [number,number]});
    for(let i=0;i<4;i++){
      const entityId=`${id}-line${i}`;sketch.entities.push({id:entityId,kind:'line',startPointId:`${id}-p${i}`,endPointId:`${id}-p${(i+1)%4}`});
      sketch.constraints.push({id:`${id}-length${i}`,kind:'length',refs:[{entityId}],value:20});
    }
    const region=selectSketchRegion(buildSketchRegions(sketch)).definition;
    const solid={id:`${id}-solid`,name:`Simple solid ${suffix}`,kind:'extrude' as const,visible:true,sketchId:sketch.id,region,depth:20};
    fixture.document.features.push(sketch,solid);operands.push(solid.id);
  }
  return{document:fixture.document,operands};
}
