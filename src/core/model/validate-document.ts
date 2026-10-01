import { DomainError, documentIds, type ProjectDocument, type SketchFeature, type Constraint } from './document.ts';
import { topologicalOrder } from '../features/dependency-graph.ts';

type RecordValue=Record<string,unknown>;
function fail(message:string,path:string,code='SCHEMA_INVALID'):never {throw new DomainError(code,message,path);}
function record(value:unknown,path:string,keys:string[]):RecordValue {
  if(!value || typeof value!=='object' || Array.isArray(value)
      || ![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('需要普通对象',path);
  const item=value as RecordValue;
  for(const key of Reflect.ownKeys(item))if(typeof key!=='string'||!keys.includes(key))fail(`不支持字段 ${String(key)}`,path);
  return item;
}
function text(value:unknown,path:string,max=200):asserts value is string {
  if(typeof value!=='string'||!value.trim()||value.length>max)fail(`需要非空字符串，最多 ${max} 字符`,path);
}
function finite(value:unknown,path:string,min=-10000,max=10000):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`数值需有限且在 [${min},${max}]`,path);
}
function bool(value:unknown,path:string):asserts value is boolean {if(typeof value!=='boolean')fail('需要布尔值',path);}
function list(value:unknown,path:string,max=100000):unknown[] {
  if(!Array.isArray(value)||value.length>max)fail('数组缺失或超出容量',path);
  return value;
}
function vector(value:unknown,path:string,length:number):number[] {
  const array=list(value,path,length);if(array.length!==length)fail(`需要 ${length} 个坐标`,path);
  array.forEach((v,i)=>finite(v,`${path}[${i}]`));
  // forEach skips holes, so explicitly require dense finite vectors.
  for(let i=0;i<length;i++)finite(array[i],`${path}[${i}]`);
  return array as number[];
}
const magnitude=(v:number[])=>Math.hypot(...v);
const product=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i]!,0);
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]!));
function timestamp(value:unknown,path:string):void {
  text(value,path,30);const date=new Date(value);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==value)fail('时间需规范 ISO UTC 字符串',path);
}
function validateConstraint(item:RecordValue,path:string,sketch:SketchFeature):void {
  const kinds=['coincident','horizontal','vertical','parallel','perpendicular','distance','length','angle','radius','equal','tangent','fixed'];
  if(!kinds.includes(item.kind as string))fail('不支持的约束类型',`${path}.kind`);
  const refs=list(item.refs,`${path}.refs`,2);if(refs.length<1)fail('约束缺少引用',path);
  const entities=new Map(sketch.entities.map(e=>[e.id,e])),points=new Set(sketch.points.map(p=>p.id));
  if(refs.length===2&&new Set(refs.map(r=>{const ref=record(r,path,['pointId','entityId']);return ref.pointId??ref.entityId;})).size!==2)fail('二对象约束需两个不同对象',path,'REFERENCE_TYPE');
  const resolved=refs.map((ref,i)=>{
    const r=record(ref,`${path}.refs[${i}]`,['pointId','entityId']);
    if((r.pointId===undefined)===(r.entityId===undefined))fail('引用必须恰好包含 pointId 或 entityId',path);
    const id=r.pointId ?? r.entityId;text(id,path,100);
    if(r.pointId!==undefined){if(!points.has(id))fail('约束点不在当前草图',path,'REFERENCE_MISSING');return 'point';}
    const entity=entities.get(id);if(!entity)fail('约束实体不在当前草图',path,'REFERENCE_MISSING');return entity.kind;
  });
  const one=(kind:string)=>resolved.length===1&&resolved[0]===kind;
  const two=(kind:string)=>resolved.length===2&&resolved.every(v=>v===kind);
  const curve=(kind:string)=>kind==='circle'||kind==='arc';
  let valid=false;
  switch(item.kind as Constraint['kind']){
    case 'coincident': valid=two('point');break;
    case 'horizontal':case 'vertical':case 'length':valid=one('line');break;
    case 'parallel':case 'perpendicular':case 'angle':valid=two('line');break;
    case 'radius':valid=resolved.length===1&&curve(resolved[0]!);break;
    case 'fixed':valid=one('point');break;
    case 'distance':valid=two('point');break;
    case 'equal':valid=two('line')||(resolved.length===2&&resolved.every(curve));break;
    case 'tangent':valid=resolved.length===2&&resolved.some(curve)&&resolved.every(v=>v==='line'||curve(v));break;
  }
  if(!valid)fail('约束的引用类型或数量错误',path,'REFERENCE_TYPE');
  const dimensional=['distance','length','radius','angle'].includes(item.kind as string);
  if(dimensional){
    finite(item.value,`${path}.value`,0,item.kind==='angle'?Math.PI:10000);
    if(item.kind==='angle'&&(item.value===0||item.value===Math.PI))fail('角度必须在 (0, π) radians',path);
    if((item.kind==='length'||item.kind==='radius')&&item.value===0)fail('长度/半径必须大于零',path);
  }else if(item.value!==undefined)fail('该约束不接受 value',path);
  if(item.kind==='fixed')vector(item.fixedPosition,`${path}.fixedPosition`,2);
  else if(item.fixedPosition!==undefined)fail('只有 fixed 接受 fixedPosition',path);
}

export function validateDocument(value:unknown):ProjectDocument {
  const doc=record(value,'document',['schemaVersion','id','name','units','features','view','createdAt','updatedAt']);
  if(doc.schemaVersion!==1)fail('不支持的项目版本','schemaVersion','UNSUPPORTED_SCHEMA');
  text(doc.id,'id',100);text(doc.name,'name');if(doc.units!=='mm')fail('单位必须为 mm','units');
  timestamp(doc.createdAt,'createdAt');timestamp(doc.updatedAt,'updatedAt');
  const features=list(doc.features,'features',2500),byId=new Map<string,RecordValue>();
  for(let i=0;i<features.length;i++){
    const path=`features[${i}]`,feature=record(features[i],path,['id','name','visible','kind','plane','points','entities','constraints','sketchId','region','depth','operation','operandAId','operandBId']);
    text(feature.id,`${path}.id`,100);text(feature.name,`${path}.name`);bool(feature.visible,`${path}.visible`);
    byId.set(feature.id,feature);
    const base=['id','name','visible','kind'];
    if(feature.kind==='sketch'){
      record(feature,path,[...base,'plane','points','entities','constraints']);
      const plane=record(feature.plane,`${path}.plane`,['origin','u','v']);
      const origin=vector(plane.origin,`${path}.plane.origin`,3),u=vector(plane.u,`${path}.plane.u`,3),v=vector(plane.v,`${path}.plane.v`,3);
      if(Math.abs(magnitude(u)-1)>1e-8||Math.abs(magnitude(v)-1)>1e-8||Math.abs(product(u,v))>1e-8)fail('平面基向量需单位正交',path);
      const points=list(feature.points,`${path}.points`),pointMap=new Map<string,number[]>();
      for(let j=0;j<points.length;j++){
        const p=record(points[j],`${path}.points[${j}]`,['id','position']);text(p.id,path,100);
        const xy=vector(p.position,path,2);pointMap.set(p.id,xy);
        for(let axis=0;axis<3;axis++)finite(origin[axis]!+u[axis]!*xy[0]!+v[axis]!*xy[1]!,`${path}.worldPosition`);
      }
      const point=(id:unknown):number[]=>{text(id,path,100);const p=pointMap.get(id);if(!p)fail(`缺少本草图点 ${id}`,path,'REFERENCE_MISSING');return p;};
      const entities=list(feature.entities,`${path}.entities`);
      for(const unknownEntity of entities){
        const e=record(unknownEntity,path,['id','kind','startPointId','endPointId','centerPointId','radius','clockwise']);text(e.id,path,100);
        if(e.kind==='line'){
          record(e,path,['id','kind','startPointId','endPointId']);if(distance(point(e.startPointId),point(e.endPointId))<=1e-6)fail('零长线段',path);
        }else if(e.kind==='circle'){
          record(e,path,['id','kind','centerPointId','radius']);point(e.centerPointId);finite(e.radius,path,1e-6,10000);
        }else if(e.kind==='arc'){
          record(e,path,['id','kind','centerPointId','startPointId','endPointId','clockwise']);bool(e.clockwise,path);
          const c=point(e.centerPointId),a=point(e.startPointId),b=point(e.endPointId);
          if(Math.min(distance(c,a),distance(c,b),distance(a,b))<=1e-6)fail('退化圆弧',path);
          // Equal-radius residual belongs to solved-result validation, not draft structural parsing.
        }else fail('不支持的实体类型',path);
      }
      const constraints=list(feature.constraints,`${path}.constraints`);
      for(let j=0;j<constraints.length;j++){
        const c=record(constraints[j],`${path}.constraints[${j}]`,['id','kind','refs','value','fixedPosition']);text(c.id,path,100);
        validateConstraint(c,`${path}.constraints[${j}]`,feature as unknown as SketchFeature);
      }
    }else if(feature.kind==='extrude'){
      record(feature,path,[...base,'sketchId','region','depth']);text(feature.sketchId,path,100);
      finite(feature.depth,path);if(Math.abs(feature.depth as number)<0.01)fail('拉伸深度绝对值至少 0.01 mm',path);
      const region=record(feature.region,path,['outerEntityIds','holeEntityIds']);
      const outer=list(region.outerEntityIds,path),holes=list(region.holeEntityIds,path);
      if(!outer.length)fail('拉伸外轮廓为空',path);
      const ids=[...outer,...holes.flatMap((hole,j)=>{const loop=list(hole,`${path}.holes[${j}]`);if(!loop.length)fail('空孔洞轮廓',path);return loop;})];
      ids.forEach(id=>text(id,path,100));if(new Set(ids).size!==ids.length)fail('轮廓实体不能重复使用',path);
    }else if(feature.kind==='boolean'){
      record(feature,path,[...base,'operation','operandAId','operandBId']);
      if(!['union','subtract','intersect'].includes(feature.operation as string))fail('不支持的布尔操作',path);
      text(feature.operandAId,path,100);text(feature.operandBId,path,100);
      if(feature.operandAId===feature.operandBId)fail('布尔操作数需两个不同特征',path);
    }else fail('不支持的特征类型',path);
  }
  const typed=doc as unknown as ProjectDocument;
  const ids=documentIds(typed);if(ids.length>100000)fail('项目元素总数超过容量','features');
  if(new Set(ids).size!==ids.length)fail('项目内稳定 ID 必须唯一','id','DUPLICATE_ID');
  for(const feature of typed.features){
    if(feature.kind==='extrude'){
      const sketch=byId.get(feature.sketchId);if(!sketch)fail('缺少拉伸草图',feature.id,'REFERENCE_MISSING');
      if(sketch.kind!=='sketch')fail('拉伸必须引用草图',feature.id,'REFERENCE_TYPE');
      const entityIds=new Set((sketch as unknown as SketchFeature).entities.map(e=>e.id));
      for(const id of [...feature.region.outerEntityIds,...feature.region.holeEntityIds.flat()])if(!entityIds.has(id))fail('轮廓实体不属于拉伸草图',feature.id,'REFERENCE_MISSING');
    }else if(feature.kind==='boolean'){
      for(const id of [feature.operandAId,feature.operandBId]){
        const operand=byId.get(id);if(!operand)fail('缺少布尔操作数',feature.id,'REFERENCE_MISSING');
        if(operand.kind==='sketch')fail('布尔操作数必须为实体特征',feature.id,'REFERENCE_TYPE');
      }
    }
  }
  topologicalOrder(typed.features);
  const view=record(doc.view,'view',['position','target','up','projection','zoom']);
  const position=vector(view.position,'view.position',3),target=vector(view.target,'view.target',3),up=vector(view.up,'view.up',3);
  if(distance(position,target)<1e-6||Math.abs(magnitude(up)-1)>1e-8)fail('相机位置/目标/上向量非法','view');
  if(view.projection!=='orthographic')fail('相机必须正交投影','view.projection');
  finite(view.zoom,'view.zoom',1e-6,1e6);
  return structuredClone(typed);
}
export function parseProjectJson(textValue:string):ProjectDocument {
  if(new TextEncoder().encode(textValue).byteLength>10*1024*1024)throw new DomainError('FILE_TOO_LARGE','项目文件超过 10 MiB');
  let value:unknown;try{value=JSON.parse(textValue);}catch{throw new DomainError('INVALID_JSON','项目不是有效 JSON');}
  return validateDocument(value);
}
export function serializeProject(document:ProjectDocument):string {return JSON.stringify(validateDocument(document),null,2)+'\n';}
