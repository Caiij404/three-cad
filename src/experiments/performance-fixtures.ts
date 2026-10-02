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
