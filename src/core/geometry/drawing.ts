import { DomainError, type SketchFeature, type Vec2, type Entity } from '../model/document.ts';
export type DrawTool='line'|'rectangle'|'circle'|'arc';
export type SnapTarget={kind:'point';pointId:string}|{kind:'origin'};
export interface DrawSample {position:Vec2;snap?:SnapTarget}
export interface SnapCandidate extends DrawSample {screen:Vec2}
export interface SketchPreview {lines:Vec2[][];points:Vec2[]}
const distance=(a:Vec2,b:Vec2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function nearestSnap(pointer:Vec2,candidates:SnapCandidate[],radiusPx=8):DrawSample|null {
  if(!Number.isFinite(radiusPx)||radiusPx<0||pointer.some(n=>!Number.isFinite(n)))throw new DomainError('INVALID_SCREEN_INPUT','捕捉输入需有限');
  let nearest:SnapCandidate|undefined,best=radiusPx;
  for(const candidate of candidates){const d=distance(pointer,candidate.screen);if(Number.isFinite(d)&&d<=best){best=d;nearest=candidate;}}
  return nearest?structuredClone({position:nearest.position,...(nearest.snap?{snap:nearest.snap}:{})}):null;
}
export function arcThrough(a:Vec2,middle:Vec2,b:Vec2):{center:Vec2;radius:number;clockwise:boolean} {
  if([...a,...middle,...b].some(n=>!Number.isFinite(n)))throw new DomainError('INVALID_POINT','圆弧点必须有限');
  const u:Vec2=[middle[0]-a[0],middle[1]-a[1]],v:Vec2=[b[0]-a[0],b[1]-a[1]],det=u[0]*v[1]-u[1]*v[0];
  if(Math.min(distance(a,middle),distance(a,b),distance(middle,b))<=1e-6||Math.abs(det)<=1e-10*Math.max(1,distance(a,middle)*distance(a,b)))throw new DomainError('DEGENERATE_ARC','圆弧需要三个不同且非共线的点');
  const ul=u[0]**2+u[1]**2,vl=v[0]**2+v[1]**2;
  const center:Vec2=[a[0]+(ul*v[1]-vl*u[1])/(2*det),a[1]+(u[0]*vl-v[0]*ul)/(2*det)];
  const radius=distance(a,center);if(!Number.isFinite(radius)||radius<=1e-6||radius>10000)throw new DomainError('INVALID_RADIUS','圆弧半径需在 (0.000001,10000] mm');
  return {center,radius,clockwise:det<0};
}
export function drawingFeature(sketch:SketchFeature,tool:DrawTool,samples:DrawSample[],id:()=>string=()=>crypto.randomUUID()):{feature:SketchFeature;endPointId?:string} {
  if(samples.length!==(tool==='arc'?3:2))throw new DomainError('DRAWING_INPUT_COUNT','绘制点数不正确');
  const feature=structuredClone(sketch),originalPoints=new Map(sketch.points.map(p=>[p.id,p.position]));
  const point=(sample:DrawSample):string=>{
    const pointId=id();let position:Vec2=[...sample.position];
    if(sample.snap?.kind==='point'){
      const target=originalPoints.get(sample.snap.pointId);if(!target)throw new DomainError('REFERENCE_MISSING','捕捉点不属于当前草图');position=[...target];
      feature.constraints.push({id:id(),kind:'coincident',refs:[{pointId},{pointId:sample.snap.pointId}]});
    }else if(sample.snap?.kind==='origin'){
      position=[0,0];feature.constraints.push({id:id(),kind:'fixed',refs:[{pointId}],fixedPosition:[0,0]});
    }
    feature.points.push({id:pointId,position});return pointId;
  };
  const normalized=samples.map(s=>{
    if(s.snap?.kind==='point'){const target=originalPoints.get(s.snap.pointId);if(!target)throw new DomainError('REFERENCE_MISSING','捕捉引用已失效');return {...s,position:[...target] as Vec2};}
    return s.snap?.kind==='origin'?{...s,position:[0,0] as Vec2}:structuredClone(s);
  });
  if(normalized.some(s=>s.position.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)))throw new DomainError('INVALID_POINT','绘制点需有限且在工作范围');
  const line=(a:string,b:string):string=>{const lineId=id();feature.entities.push({id:lineId,kind:'line',startPointId:a,endPointId:b});return lineId;};
  let endPointId:string|undefined;
  if(tool==='line'){
    if(distance(normalized[0]!.position,normalized[1]!.position)<=1e-6)throw new DomainError('ZERO_LENGTH','线段两个端点必须不同');
    const a=point(normalized[0]!),b=point(normalized[1]!);line(a,b);endPointId=b;
  }else if(tool==='rectangle'){
    const a=normalized[0]!.position,b=normalized[1]!.position;
    if(Math.min(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))<=1e-6)throw new DomainError('DEGENERATE_RECTANGLE','矩形宽和高必须大于零');
    const corners:Vec2[]=[[...a],[b[0],a[1]],[...b],[a[0],b[1]]],pairs:Array<[string,string]>=[];
    for(let i=0;i<4;i++){
      const from=point({position:corners[i]!,...(i===0&&normalized[0]!.snap?{snap:normalized[0]!.snap}:i===2&&normalized[1]!.snap?{snap:normalized[1]!.snap}:{})});
      const to=point({position:corners[(i+1)%4]!});pairs.push([from,to]);
      feature.constraints.push({id:id(),kind:i%2===0?'horizontal':'vertical',refs:[{entityId:line(from,to)}]});
    }
    for(let i=0;i<4;i++)feature.constraints.push({id:id(),kind:'coincident',refs:[{pointId:pairs[i]![1]},{pointId:pairs[(i+1)%4]![0]}]});
  }else if(tool==='circle'){
    if(normalized[1]!.snap)throw new DomainError('SNAP_UNAVAILABLE','圆半径点不建立点重合，仅中心可捕捉');
    const radius=distance(normalized[0]!.position,normalized[1]!.position);if(radius<=1e-6||radius>10000)throw new DomainError('INVALID_RADIUS','圆半径需大于0.000001且不超过10000 mm');
    feature.entities.push({id:id(),kind:'circle',centerPointId:point(normalized[0]!),radius});
  }else{
    if(normalized[1]!.snap)throw new DomainError('SNAP_UNAVAILABLE','圆弧过点用于构造，只有起点与终点可捕捉');
    const arc=arcThrough(normalized[0]!.position,normalized[1]!.position,normalized[2]!.position);
    feature.entities.push({id:id(),kind:'arc',centerPointId:point({position:arc.center}),startPointId:point(normalized[0]!),endPointId:point(normalized[2]!),clockwise:arc.clockwise});
  }
  return {feature,...(endPointId?{endPointId}:{})};
}
export function previewDrawing(tool:DrawTool,samples:DrawSample[]):SketchPreview {
  const points=samples.map(s=>s.position);if(points.length<2)return {lines:[],points};
  const a=points[0]!,b=points.at(-1)!;
  if(tool==='rectangle')return {lines:[[a,[b[0],a[1]],b,[a[0],b[1]],a]],points};
  if(tool==='line'||tool==='arc'&&points.length<3)return {lines:[points],points};
  let center:Vec2,radius:number,start=0,sweep=2*Math.PI;
  if(tool==='circle'){center=a;radius=distance(a,b);}
  else{
    const arc=arcThrough(a,points[1]!,b);center=arc.center;radius=arc.radius;
    start=Math.atan2(a[1]-center[1],a[0]-center[0]);const end=Math.atan2(b[1]-center[1],b[0]-center[0]);sweep=((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);if(arc.clockwise)sweep-=2*Math.PI;
  }
  // This is a visual preview; numerical geometry is created by drawingFeature and real solve.
  const count=Math.max(24,Math.ceil(Math.abs(sweep)/(Math.PI/64)));
  return {lines:[Array.from({length:count+1},(_,i)=>{const angle=start+sweep*i/count;return [center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)] as Vec2;})],points};
}
export function entityPointIds(entity:Entity):string[]{return entity.kind==='line'?[entity.startPointId,entity.endPointId]:entity.kind==='arc'?[entity.centerPointId,entity.startPointId,entity.endPointId]:[entity.centerPointId];}
