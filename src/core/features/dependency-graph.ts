import { DomainError, type Feature } from '../model/document.ts';

export function dependencies(feature:Feature):string[] {
  return feature.kind==='sketch'?[]:feature.kind==='extrude'?[feature.sketchId]:[feature.operandAId,feature.operandBId];
}
export function topologicalOrder(features:Feature[]):string[] {
  const byId=new Map(features.map(feature=>[feature.id,feature]));
  if(byId.size!==features.length)throw new DomainError('DUPLICATE_ID','特征 ID 重复');
  const incoming=new Map<string,number>(),children=new Map<string,string[]>();
  for(const feature of features){
    const refs=[...new Set(dependencies(feature))];incoming.set(feature.id,refs.length);
    for(const ref of refs){
      if(!byId.has(ref))throw new DomainError('REFERENCE_MISSING',`缺少前置特征 ${ref}`,feature.id);
      children.set(ref,[...(children.get(ref) ?? []),feature.id]);
    }
  }
  const ready=features.filter(feature=>incoming.get(feature.id)===0).map(feature=>feature.id),order:string[]=[];
  while(ready.length){
    const id=ready.shift()!;order.push(id);
    for(const child of children.get(id) ?? []){
      const count=incoming.get(child)!-1;incoming.set(child,count);if(count===0)ready.push(child);
    }
  }
  if(order.length!==features.length)throw new DomainError('FEATURE_CYCLE','特征依赖存在循环');
  return order;
}
export function descendants(features:Feature[],root:string):string[] {
  topologicalOrder(features);
  if(!features.some(feature=>feature.id===root))throw new DomainError('REFERENCE_MISSING',`特征不存在 ${root}`);
  const found=new Set<string>(),queue=[root];
  while(queue.length){const parent=queue.shift()!;for(const feature of features){
    if(dependencies(feature).includes(parent)&&!found.has(feature.id)){found.add(feature.id);queue.push(feature.id);}
  }}
  return topologicalOrder(features).filter(id=>found.has(id));
}
