import { ViewportRuntime, type PickResult } from '../../src/adapters/viewport/viewport-runtime.ts';
import { createEmptyProject, type SketchFeature } from '../../src/core/model/document.ts';
import { BASE_PLANES } from '../../src/core/geometry/plane.ts';
import { validateDocument } from '../../src/core/model/validate-document.ts';
import { runSolid } from '../../src/adapters/solid/solid-spike.ts';
import { requireSolid, meshMetrics } from '../../src/core/geometry/mesh-metrics.ts';
import { nearestSnap } from '../../src/core/geometry/drawing.ts';
import { toWorld } from '../../src/core/geometry/plane.ts';
const host=document.querySelector<HTMLElement>('#viewport')!;
const doc=createEmptyProject({id:'viewport-fixture-project'});
const sketch:SketchFeature={id:'fixture-sketch',kind:'sketch',name:'Fixture',visible:true,plane:BASE_PLANES.XY,
  points:[{id:'start',position:[-20,-10]},{id:'end',position:[20,-10]},{id:'center',position:[0,15]},
    {id:'arc-center',position:[-20,20]},{id:'arc-start',position:[-10,20]},{id:'arc-end',position:[-20,30]}],
  entities:[{id:'line',kind:'line',startPointId:'start',endPointId:'end'},
    {id:'circle',kind:'circle',centerPointId:'center',radius:5},
    {id:'arc',kind:'arc',centerPointId:'arc-center',startPointId:'arc-start',endPointId:'arc-end',clockwise:false}],constraints:[]};
doc.features=[sketch];validateDocument(doc);
const selections:Array<{pick:PickResult|null;additive:boolean}>=[],states:string[]=[],hovers:Array<PickResult|null>=[];
const runtime=new ViewportRuntime(host,doc,'fixture-session',{select:(pick,additive)=>selections.push({pick,additive}),state:state=>states.push(state),hover:pick=>hovers.push(pick)});
const contextExtension=runtime.renderer.getContext().getExtension('WEBGL_lose_context');
// Test-only page: controlled inputs inspect the actual adapter; no hooks enter the production app.
const harness={runtime,doc,selections,states,hovers,sketch,
  contextExtension,
  snapProbe(zoom:number,offset:number){
    runtime.camera.zoom=zoom;runtime.camera.updateProjectionMatrix();
    const point=sketch.points[0]!,screen=runtime.project(toWorld(sketch.plane,point.position));
    const sample=nearestSnap([screen.x+offset,screen.y],[{position:point.position,screen:[screen.x,screen.y],snap:{kind:'point',pointId:point.id}}]);
    return {zoom,offsetCssPx:offset,sample,roundTrip:runtime.screenToPlane(screen.x,screen.y,sketch.plane),unsnapped:runtime.screenToPlane(screen.x+offset,screen.y,sketch.plane)};
  },
  hidden(value:boolean){doc.features[0]!.visible=!value;runtime.updateDocument(doc,{},'fixture-session');},
  resize(width:number,height:number){host.style.width=`${width}px`;host.style.height=`${height}px`;runtime.resize();},
  newSession(index:number){const empty=createEmptyProject({id:`empty-${index}`});runtime.updateDocument(empty,{},`session-${index}`);},
  restoreFixture(){runtime.updateDocument(doc,{},'fixture-session');},
  incrementalProbe(){
    const make=(z:number)=>{const b={size:[20,20,z] as [number,number,number],center:[60,0,z/2] as [number,number,number]};return runSolid({kind:'boolean',operation:'union',a:b,b});};
    const owned=(depth:number)=>{const mesh=make(depth);Object.freeze(mesh.positions);return Object.freeze(mesh);};
    const a=owned(20),b=owned(30),model=structuredClone(doc);
    model.features.push({id:'probe-a',name:'A',kind:'extrude',visible:true,sketchId:sketch.id,region:{outerEntityIds:['line'],holeEntityIds:[]},depth:20},
      {id:'probe-b',name:'B',kind:'extrude',visible:true,sketchId:sketch.id,region:{outerEntityIds:['line'],holeEntityIds:[]},depth:30});
    const cache=Object.freeze({'probe-a':a,'probe-b':b});runtime.updateDocument(model,cache,'incremental-session');
    const find=(id:string)=>{let found:any;runtime.scene.traverse(object=>{if(object.userData.pick?.id===id)found=object;});return found;};
    const original=find('probe-a'),initialDisposed=runtime.diagnostics().disposedGeometries;
    model.features[1]!.name='rename only';runtime.updateDocument(model,cache,'incremental-session');
    const renamePreserved=find('probe-a')===original;
    model.features[2]!.visible=false;runtime.updateDocument(model,cache,'incremental-session');
    const hidePreserved=find('probe-a')===original,hiddenRemoved=!find('probe-b'),hideDisposed=runtime.diagnostics().disposedGeometries-initialDisposed;
    const mutable={'probe-a':make(20),'probe-b':make(30)};runtime.updateDocument(model,mutable,'incremental-session');
    const beforeMutable=find('probe-a');mutable['probe-a'].positions=mutable['probe-a'].positions.map((n,i)=>i%3===0?n+10:n);
    runtime.updateDocument(model,mutable,'incremental-session');const afterMutable=find('probe-a');
    const mutableUpdated=afterMutable!==beforeMutable&&afterMutable.geometry.attributes.position.getX(0)===mutable['probe-a'].positions[0];
    runtime.enterSketch(model.features[0] as SketchFeature);runtime.fit(false);
    const fitTarget=runtime.cameraView().target;runtime.exitSketch();
    harness.restoreFixture();return{renamePreserved,hidePreserved,hiddenRemoved,hideDisposed,mutableUpdated,fitTarget};
  },
  addSolid(){
    const solid=runSolid({kind:'boolean',operation:'union',a:{size:[20,20,20],center:[60,0,10]},b:{size:[20,20,20],center:[60,0,10]}});
    const solidDoc=structuredClone(doc);solidDoc.features.push({id:'solid',name:'Real CSG box',visible:true,kind:'extrude',sketchId:sketch.id,region:{outerEntityIds:['line'],holeEntityIds:[]},depth:20});
    runtime.updateDocument(solidDoc,{solid},'fixture-session');requireSolid(solid);return meshMetrics(solid);
  },
};
Object.assign(window,{__viewport:harness});
