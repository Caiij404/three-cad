import {
  AxesHelper, Box3, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, GridHelper, Group,
  Line, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, Object3D, OrthographicCamera,
  Points, PointsMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, MOUSE, type Material,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BASE_PLANES, cross, toPlane, toWorld, type BasePlane } from '../../core/geometry/plane.ts';
import type { SketchPreview } from '../../core/geometry/drawing.ts';
import type { PlaneFrame, ProjectDocument, SketchFeature, Vec3 } from '../../core/model/document.ts';
import type { DerivedCache } from '../../core/commands/project-engine.ts';

export interface PickResult { id:string; featureId?:string; kind:'plane'|'sketch'|'entity'|'point'|'solid' }
export type ViewportState='ready'|'lost'|'error'|'disposed';
export interface ViewportCallbacks { select:(pick:PickResult|null,additive:boolean)=>void; hover?:(pick:PickResult|null)=>void; pointer?:(kind:'move'|'click',x:number,y:number)=>boolean;
  drag?:{start:(pick:PickResult,x:number,y:number)=>boolean;move:(x:number,y:number)=>void;finish:(x:number,y:number)=>void;cancel:()=>void};
  state:(state:ViewportState,message?:string)=>void }
type CameraView=ProjectDocument['view'];
const colors:Record<BasePlane,number>={XY:0x588bc5,XZ:0xc27a48,YZ:0x58a083};
const vec=(point:Vec3)=>new Vector3(...point);
const tuple=(point:Vector3):Vec3=>point.toArray() as Vec3;
function resources(group:Object3D):{geometries:Set<BufferGeometry>;materials:Set<Material>} {
  const geometries=new Set<BufferGeometry>(),materials=new Set<Material>();
  group.traverse(object=>{
    const item=object as Mesh;
    if(item.geometry)geometries.add(item.geometry);
    if(item.material)(Array.isArray(item.material)?item.material:[item.material]).forEach(m=>materials.add(m));
  });return {geometries,materials};
}
function geometry(points:Vec3[]):BufferGeometry {return new BufferGeometry().setAttribute('position',new Float32BufferAttribute(points.flat(),3));}

/** Owns the canvas, GPU resources and listeners. Inputs/outputs are domain data, never Three UUIDs. */
export class ViewportRuntime {
  readonly renderer:WebGLRenderer;
  readonly camera=new OrthographicCamera(-80,80,60,-60,0.01,100000);
  readonly scene=new Scene();
  private controls:OrbitControls;
  private bases=new Group();
  private model=new Group();
  private preview=new Group();
  private document:ProjectDocument;
  private cache:DerivedCache={};
  private observer:ResizeObserver;
  private raycaster=new Raycaster();
  private selected=new Set<string>();
  private hoverId:string|null=null;
  private activeSketchId:string|null=null;
  private modelView:CameraView|null=null;
  private stateValue:ViewportState='ready';
  private frame=0;
  private inputEnabled=true;
  private pointerStart:{x:number;y:number;id:number}|null=null;
  private dragging=false;
  private dragMoved=false;
  private pickables:Object3D[]=[];
  private modelKey='';
  private sessionId:string;
  private selectionEvents=0;
  private renders=0;
  private disposedGeometries=0;
  private disposedMaterials=0;

  constructor(private host:HTMLElement,document:ProjectDocument,sessionId:string,private callbacks:ViewportCallbacks){
    this.document=structuredClone(document);this.sessionId=sessionId;
    const canvas=documentCanvas();
    const context=canvas.getContext('webgl2',{antialias:true,alpha:false});
    if(!context)throw new Error('WEBGL_UNAVAILABLE: 无法创建 WebGL 2，请检查浏览器硬件加速后重试。');
    this.renderer=new WebGLRenderer({canvas,context,antialias:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    canvas.setAttribute('aria-label','Three.js 建模画布');canvas.tabIndex=0;
    canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';this.host.appendChild(canvas);
    this.scene.background=new Color(0xf4f7f4);this.scene.add(this.bases,this.model,this.preview);
    this.camera.up.set(0,0,1);this.controls=this.createControls();this.restoreView(document.view);
    this.buildBases();this.updateDocument(document,{},sessionId);
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointerup',this.pointerUp);
    canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerleave',this.pointerLeave);
    canvas.addEventListener('pointercancel',this.pointerCancel);
    canvas.addEventListener('webglcontextlost',this.contextLost);canvas.addEventListener('webglcontextrestored',this.contextRestored);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();callbacks.state('ready');
  }
  private createControls():OrbitControls {
    const controls=new OrbitControls(this.camera,this.renderer.domElement);
    controls.mouseButtons={LEFT:undefined,MIDDLE:MOUSE.PAN,RIGHT:MOUSE.ROTATE};
    controls.enableDamping=false;controls.minZoom=0.01;controls.maxZoom=10000;controls.enableRotate=!this.activeSketchId;
    controls.enabled=this.inputEnabled&&this.stateValue==='ready';
    controls.addEventListener('change',this.changed);return controls;
  }
  private changed=()=>{this.requestRender();};
  get state():ViewportState{return this.stateValue;}
  private disposeGroup(group:Group):void {
    const owned=resources(group);
    for(const item of owned.geometries){item.dispose();this.disposedGeometries++;}
    for(const item of owned.materials){item.dispose();this.disposedMaterials++;}
    group.clear();
  }
  private tag(object:Object3D,pick:PickResult,color:number):void {object.userData={pick,color};this.pickables.push(object);}
  private planeObjects(frame:PlaneFrame,id:string,kind:'plane'|'sketch',color:number,extent=35):void {
    const corners=[[-extent,-extent],[extent,-extent],[extent,extent],[-extent,extent]].map(p=>toWorld(frame,p as [number,number]));
    const fill=new Mesh(geometry([corners[0]!,corners[1]!,corners[2]!,corners[0]!,corners[2]!,corners[3]!]),
      new MeshBasicMaterial({color,side:DoubleSide,transparent:true,opacity:kind==='plane'?0.045:0.08,depthWrite:false}));
    const outline=new LineLoop(geometry(corners),new LineBasicMaterial({color,transparent:true,opacity:kind==='plane'?0.3:0.65}));
    const pick:PickResult={id,kind,...(kind==='sketch'?{featureId:id}:{})};this.tag(fill,pick,color);this.tag(outline,pick,color);
    fill.userData.planeNormal=cross(frame.u,frame.v);
    (kind==='plane'?this.bases:this.model).add(fill,outline);
  }
  private buildBases():void {
    for(const name of ['XY','XZ','YZ'] as BasePlane[])this.planeObjects(BASE_PLANES[name],`plane:${name}`,'plane',colors[name]);
    const grid=new GridHelper(160,16,0xb9c9be,0xdce5dd);grid.rotateX(Math.PI/2);this.bases.add(grid);
    this.bases.add(new AxesHelper(50));
  }
  private buildSketch(sketch:SketchFeature):void {
    this.planeObjects(sketch.plane,sketch.id,'sketch',0x498473);
    const points=new Map(sketch.points.map(point=>[point.id,point.position]));
    const world=(id:string)=>toWorld(sketch.plane,points.get(id)!);
    for(const entity of sketch.entities){
      let vertices:Vec3[];
      if(entity.kind==='line')vertices=[world(entity.startPointId),world(entity.endPointId)];
      else {
        const center=points.get(entity.centerPointId)!;
        let start=0,sweep=2*Math.PI,radius:number;
        if(entity.kind==='circle')radius=entity.radius;
        else{
          const a=points.get(entity.startPointId)!,b=points.get(entity.endPointId)!;
          radius=Math.hypot(a[0]-center[0],a[1]-center[1]);start=Math.atan2(a[1]-center[1],a[0]-center[0]);
          const end=Math.atan2(b[1]-center[1],b[0]-center[0]);sweep=((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
          if(entity.clockwise)sweep-=2*Math.PI;
        }
        const count=Math.max(12,Math.ceil(Math.abs(sweep)/(Math.PI/64)));
        vertices=Array.from({length:count+1},(_,i)=>{const angle=start+sweep*i/count;return toWorld(sketch.plane,[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)]);});
      }
      const line=new Line(geometry(vertices),new LineBasicMaterial({color:0x246955,depthTest:false}));line.renderOrder=2;
      this.tag(line,{id:entity.id,featureId:sketch.id,kind:'entity'},0x246955);this.model.add(line);
    }
    for(const point of sketch.points){
      const object=new Points(geometry([world(point.id)]),new PointsMaterial({color:0x163e34,size:6,sizeAttenuation:false,depthTest:false}));object.renderOrder=3;
      this.tag(object,{id:point.id,featureId:sketch.id,kind:'point'},0x163e34);this.model.add(object);
    }
  }
  updateDocument(document:ProjectDocument,cache:DerivedCache,sessionId:string):void {
    if(this.stateValue==='disposed')return;
    this.document=structuredClone(document);this.cache=structuredClone(cache);
    if(sessionId!==this.sessionId){this.sessionId=sessionId;this.activeSketchId=null;this.modelView=null;this.clearPreview();this.restoreView(document.view);this.selected.clear();this.hoverId=null;}
    const key=JSON.stringify([document.features.map(({name:_name,...definition})=>definition),cache]);
    if(key!==this.modelKey){
      this.disposeGroup(this.model);this.pickables=this.pickables.filter(o=>o.parent===this.bases);this.modelKey=key;
      for(const feature of document.features)if(feature.visible){
        if(feature.kind==='sketch')this.buildSketch(feature);
        else{
          const mesh=cache[feature.id];if(!mesh?.positions.length)continue;
          const object=new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute(mesh.positions,3)),new MeshBasicMaterial({color:0x7a9a8b,side:DoubleSide}));
          this.tag(object,{id:feature.id,featureId:feature.id,kind:'solid'},0x7a9a8b);this.model.add(object);
        }
      }
    }
    this.applyHighlights();this.requestRender();
  }
  setInputEnabled(enabled:boolean):void {this.inputEnabled=enabled;this.controls.enabled=enabled&&this.stateValue==='ready';}
  setSelection(ids:string[]):void {this.selected=new Set(ids);this.applyHighlights();this.requestRender();}
  private applyHighlights():void {
    for(const object of this.pickables){
      const pick=object.userData.pick as PickResult,material=(object as Mesh).material as MeshBasicMaterial;
      const selected=this.selected.has(pick.id)||(pick.featureId!==undefined&&this.selected.has(pick.featureId));
      const hover=this.hoverId===pick.id;
      material.color.setHex(selected?0xdb9646:hover?0x46af92:object.userData.color as number);
      if(object instanceof Mesh && pick.kind!=='solid')material.opacity=selected?0.2:hover?0.13:pick.kind==='plane'?0.045:0.08;
    }
  }
  resize():void {
    if(this.stateValue==='disposed')return;
    const rect=this.host.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height;
    this.camera.left=-60*aspect;this.camera.right=60*aspect;this.camera.top=60;this.camera.bottom=-60;this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height,false);this.requestRender();
  }
  project(world:Vec3):{x:number;y:number;visible:boolean} {
    this.camera.updateMatrixWorld();const ndc=vec(world).project(this.camera),rect=this.renderer.domElement.getBoundingClientRect();
    return {x:rect.left+(ndc.x+1)*rect.width/2,y:rect.top+(1-ndc.y)*rect.height/2,visible:Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&Math.abs(ndc.z)<=1};
  }
  screenToPlane(clientX:number,clientY:number,frame:PlaneFrame):[number,number]|null {
    const rect=this.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    this.camera.updateMatrixWorld();this.raycaster.setFromCamera(new Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),this.camera);
    const normal=vec(cross(frame.u,frame.v)),denominator=this.raycaster.ray.direction.dot(normal);
    if(Math.abs(denominator)<1e-10)return null;
    const t=vec(frame.origin).sub(this.raycaster.ray.origin).dot(normal)/denominator;if(t<0)return null;
    const world=this.raycaster.ray.at(t,new Vector3());return toPlane(frame,tuple(world));
  }
  setPreview(frame:PlaneFrame,data:SketchPreview):void {
    this.disposeGroup(this.preview);
    for(const line of data.lines){const object=new Line(geometry(line.map(p=>toWorld(frame,p))),new LineBasicMaterial({color:0xd28b36,depthTest:false}));object.renderOrder=10;this.preview.add(object);}
    if(data.points.length){const object=new Points(geometry(data.points.map(p=>toWorld(frame,p))),new PointsMaterial({color:0xd28b36,size:7,sizeAttenuation:false,depthTest:false}));object.renderOrder=11;this.preview.add(object);}
    this.requestRender();
  }
  clearPreview():void{this.disposeGroup(this.preview);this.requestRender();}
  pick(clientX:number,clientY:number):PickResult|null {
    if(this.stateValue!=='ready'||!this.inputEnabled)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);
    const ndc=new Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(ndc,this.camera);
    const mmPerPixel=(this.camera.top-this.camera.bottom)/(this.camera.zoom*rect.height);
    this.raycaster.params.Line={threshold:mmPerPixel*6};this.raycaster.params.Points={threshold:mmPerPixel*8};
    const candidates=this.pickables.filter(object=>{
      if(this.activeSketchId&&(object.userData.pick as PickResult).featureId!==this.activeSketchId)return false;
      // Near-parallel rays can numerically intersect a plane seen edge-on; its outline remains pickable.
      const normal=object.userData.planeNormal as Vec3|undefined;
      return !normal||Math.abs(vec(normal).dot(this.raycaster.ray.direction))>1e-8;
    });
    const hits=this.raycaster.intersectObjects(candidates,false);
    const rank=(object:Object3D)=>({point:0,entity:1,solid:2,sketch:3,plane:4}[(object.userData.pick as PickResult).kind]);
    hits.sort((a,b)=>rank(a.object)-rank(b.object)||a.distance-b.distance);
    return hits.length?structuredClone(hits[0]!.object.userData.pick as PickResult):null;
  }
  private pointerDown=(event:PointerEvent)=>{
    if(event.button!==0||!this.inputEnabled)return;
    this.pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};
    const pick=this.pick(event.clientX,event.clientY);
    if(!event.ctrlKey&&!event.metaKey&&pick?.kind==='point'&&this.callbacks.drag?.start(pick,event.clientX,event.clientY)){
      this.dragging=true;this.dragMoved=false;this.renderer.domElement.setPointerCapture(event.pointerId);event.preventDefault();
    }
  };
  private pointerUp=(event:PointerEvent)=>{
    const start=this.pointerStart;this.pointerStart=null;
    if(this.dragging&&start?.id===event.pointerId){
      const moved=this.dragMoved;this.dragging=false;this.dragMoved=false;
      if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);
      if(moved)this.callbacks.drag?.finish(event.clientX,event.clientY);
      else{this.callbacks.drag?.cancel();this.selectionEvents++;this.callbacks.select(this.pick(event.clientX,event.clientY),false);}return;
    }
    if(this.stateValue==='ready'&&this.inputEnabled&&event.button===0&&start?.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<=4){
      if(this.callbacks.pointer?.('click',event.clientX,event.clientY))return;
      this.selectionEvents++;this.callbacks.select(this.pick(event.clientX,event.clientY),event.ctrlKey||event.metaKey);
    }
  };
  private pointerMove=(event:PointerEvent)=>{
    if(this.dragging&&this.pointerStart?.id===event.pointerId){
      if(this.dragMoved||Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>4){this.dragMoved=true;this.callbacks.drag?.move(event.clientX,event.clientY);}return;
    }
    if(event.buttons||!this.inputEnabled)return;
    if(this.callbacks.pointer?.('move',event.clientX,event.clientY))return;
    const pick=this.pick(event.clientX,event.clientY);
    if(this.hoverId!==pick?.id){this.hoverId=pick?.id??null;this.callbacks.hover?.(pick);this.applyHighlights();this.requestRender();}
  };
  private pointerLeave=()=>{if(this.dragging)return;this.pointerStart=null;this.hoverId=null;this.callbacks.hover?.(null);this.applyHighlights();this.requestRender();};
  cancelGesture():void {
    const id=this.pointerStart?.id;this.pointerStart=null;
    if(this.dragging){this.dragging=false;this.dragMoved=false;this.callbacks.drag?.cancel();}
    if(id!==undefined&&this.renderer.domElement.hasPointerCapture(id))this.renderer.domElement.releasePointerCapture(id);
  }
  private pointerCancel=()=>{this.cancelGesture();};
  cameraView():CameraView{return {position:tuple(this.camera.position),target:tuple(this.controls.target),up:tuple(this.camera.up),projection:'orthographic',zoom:this.camera.zoom};}
  private restoreView(view:CameraView):void {
    this.controls?.dispose();this.camera.position.copy(vec(view.position));this.camera.up.copy(vec(view.up));this.camera.zoom=view.zoom;
    this.controls=this.createControls();this.controls.target.copy(vec(view.target));this.controls.update();this.camera.updateProjectionMatrix();this.requestRender();
  }
  enterSketch(sketch:SketchFeature):void {
    if(this.activeSketchId===sketch.id)return;
    if(!this.activeSketchId)this.modelView=this.cameraView();
    this.activeSketchId=sketch.id;const normal=cross(sketch.plane.u,sketch.plane.v);
    const target=sketch.plane.origin,position=target.map((v,i)=>v+normal[i]!*200) as Vec3;
    this.restoreView({position,target:[...target],up:[...sketch.plane.v],projection:'orthographic',zoom:1});this.fit();
  }
  exitSketch():void {
    if(!this.activeSketchId)return;this.activeSketchId=null;this.clearPreview();
    const previous=this.modelView;this.modelView=null;if(previous)this.restoreView(previous);else this.standardView('iso');
  }
  standardView(view:BasePlane|'iso'):void {
    if(this.activeSketchId)return;
    const target=tuple(this.controls.target),offset:Vec3=view==='iso'?[150,-150,150]:cross(BASE_PLANES[view].u,BASE_PLANES[view].v).map(v=>v*200) as Vec3;
    this.restoreView({position:target.map((v,i)=>v+offset[i]!) as Vec3,target,up:view==='XY'?[0,1,0]:[0,0,1],projection:'orthographic',zoom:this.camera.zoom});
  }
  fit():void {
    const candidates=this.model.children.filter(o=>!this.activeSketchId||(o.userData.pick as PickResult|undefined)?.featureId===this.activeSketchId);
    let bounds=new Box3();for(const object of candidates)bounds.union(new Box3().setFromObject(object));
    if(bounds.isEmpty())bounds=new Box3(new Vector3(-40,-40,-40),new Vector3(40,40,40));
    const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()),direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(center).addScaledVector(direction,Math.max(200,size.length()*2));this.controls.target.copy(center);
    // A bounding sphere gives a conservative fit in every view and both panel aspect ratios.
    const radius=Math.max(size.length()/2,5),half=Math.min(this.camera.right-this.camera.left,this.camera.top-this.camera.bottom)/2;
    this.camera.zoom=Math.min(10000,Math.max(0.01,half/(radius*1.2)));this.controls.update();this.camera.updateProjectionMatrix();this.requestRender();
  }
  private requestRender():void {if(this.frame||this.stateValue!=='ready')return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.renderNow();});}
  renderNow():void {
    if(this.stateValue!=='ready')return;
    try{this.renderer.render(this.scene,this.camera);this.renders++;}
    catch(cause){this.stateValue='error';this.controls.enabled=false;this.callbacks.state('error',cause instanceof Error?cause.message:String(cause));}
  }
  private contextLost=(event:Event)=>{
    event.preventDefault();if(this.stateValue==='disposed')return;this.cancelGesture();this.stateValue='lost';this.controls.enabled=false;
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}this.callbacks.state('lost','WebGL 上下文已丢失，项目数据仍保留。恢复后重建画面，也可以重试。');
  };
  private contextRestored=()=>{
    if(this.stateValue==='disposed')return;
    try{
      this.disposeGroup(this.bases);this.disposeGroup(this.model);this.clearPreview();this.pickables=[];this.modelKey='';this.buildBases();
      this.stateValue='ready';this.controls.enabled=this.inputEnabled;this.updateDocument(this.document,this.cache,this.sessionId);this.resize();this.renderNow();
      if(this.stateValue==='ready')this.callbacks.state('ready');
    }catch(cause){this.stateValue='error';this.callbacks.state('error',cause instanceof Error?cause.message:String(cause));}
  };
  diagnostics(){
    const owned=resources(this.scene);return {state:this.stateValue,renders:this.renders,selectionEvents:this.selectionEvents,
      ownedGeometries:owned.geometries.size,ownedMaterials:owned.materials.size,disposedGeometries:this.disposedGeometries,disposedMaterials:this.disposedMaterials,
      gpuGeometries:this.renderer.info.memory.geometries,gpuTextures:this.renderer.info.memory.textures,canvasCount:this.host.querySelectorAll('canvas').length,
      pickableCount:this.pickables.length,camera:this.cameraView(),activeSketchId:this.activeSketchId};
  }
  dispose():void {
    if(this.stateValue==='disposed')return;this.cancelGesture();this.stateValue='disposed';if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;
    this.observer.disconnect();this.controls.dispose();const canvas=this.renderer.domElement;
    canvas.removeEventListener('pointerdown',this.pointerDown);canvas.removeEventListener('pointerup',this.pointerUp);canvas.removeEventListener('pointermove',this.pointerMove);
    canvas.removeEventListener('pointerleave',this.pointerLeave);canvas.removeEventListener('pointercancel',this.pointerCancel);
    canvas.removeEventListener('webglcontextlost',this.contextLost);canvas.removeEventListener('webglcontextrestored',this.contextRestored);
    this.disposeGroup(this.model);this.disposeGroup(this.bases);this.disposeGroup(this.preview);this.pickables=[];this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();canvas.remove();this.callbacks.state('disposed');
  }
}
function documentCanvas():HTMLCanvasElement{return window.document.createElement('canvas');}
