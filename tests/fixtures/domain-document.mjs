import { createEmptyProject } from '../../src/core/model/document.ts';
export const empty=()=>createEmptyProject({id:'project-1',now:'2026-10-02T00:00:00.000Z'});
export function sketch(id='sketch-1',offset=0){
  return {id,kind:'sketch',name:id,visible:true,plane:{origin:[0,0,0],u:[1,0,0],v:[0,1,0]},
    points:[[0,0],[20,0],[20,20],[0,20]].map((position,i)=>({id:`${id}-p${i}`,position:[position[0]+offset,position[1]]})),
    entities:[0,1,2,3].map(i=>({id:`${id}-line${i}`,kind:'line',startPointId:`${id}-p${i}`,endPointId:`${id}-p${(i+1)%4}`})),
    constraints:[{id:`${id}-fixed`,kind:'fixed',refs:[{pointId:`${id}-p0`}],fixedPosition:[offset,0]}]};
}
export const extrusion=(id='extrude-1',sketchId='sketch-1')=>({id,kind:'extrude',name:id,visible:true,sketchId,
  region:{outerEntityIds:[0,1,2,3].map(i=>`${sketchId}-line${i}`),holeEntityIds:[]},depth:20});
export function model(){
  const document=empty();document.features=[sketch(),extrusion(),sketch('sketch-2',10),extrusion('extrude-2','sketch-2'),
    {id:'boolean-1',kind:'boolean',name:'Union',visible:true,operation:'union',operandAId:'extrude-1',operandBId:'extrude-2'}];
  return document;
}
