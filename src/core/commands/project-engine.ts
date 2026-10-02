import { createEmptyProject, documentIds, DomainError, type Feature, type ProjectDocument } from '../model/document.ts';
import { validateDocument } from '../model/validate-document.ts';
import { descendants } from '../features/dependency-graph.ts';
import type { TriangleMesh } from '../mesh-types.ts';
import { requireSolid, trianglePoints } from '../geometry/mesh-metrics.ts';
import type { SketchDiagnostics } from '../sketch-solution.ts';

export type ProjectCommand =
  | { kind:'rename-project'; name:string }
  | { kind:'rename-feature'; id:string; name:string }
  | { kind:'visibility'; id:string; visible:boolean }
  | { kind:'add-feature'; feature:Feature }
  | { kind:'replace-feature'; feature:Feature }
  | { kind:'delete-feature'; id:string; cascade:boolean };
export type DerivedCache=Record<string,TriangleMesh>;
export type DiagnosticCache=Record<string,SketchDiagnostics>;
export interface TransactionContext {
  projectSessionId:string; baseRevision:number; requestId:number; isCancelled:()=>boolean;
  baseline?:Readonly<{document:ProjectDocument;cache:DerivedCache;diagnostics:DiagnosticCache}>;
}
export type Recompute=(candidate:ProjectDocument,context:TransactionContext)=>Promise<{document:ProjectDocument;cache:DerivedCache;diagnostics?:DiagnosticCache}>;
interface Snapshot { document:ProjectDocument;cache:DerivedCache;diagnostics:DiagnosticCache }
interface HistoryEntry { before:Snapshot;after:Snapshot;label:string }
export interface SaveSnapshot { document:ProjectDocument; projectSessionId:string;revision:number;fingerprint:string }

function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value && typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(document:ProjectDocument):string {return canonical({...document,updatedAt:''});}
function roles(feature:Feature):Map<string,string> {
  return new Map([[feature.id,`feature:${feature.kind}`],...(feature.kind==='sketch'?
    [...feature.points.map(p=>[p.id,'point'] as [string,string]),...feature.entities.map(e=>[e.id,`entity:${e.kind}`] as [string,string]),
      ...feature.constraints.map(c=>[c.id,'constraint'] as [string,string])]:[])]);
}
function definition(document:ProjectDocument):string {
  const clone=structuredClone(document);clone.updatedAt='';
  for(const feature of clone.features)if(feature.kind==='sketch'){
    for(const point of feature.points)point.position=[0,0];
    for(const entity of feature.entities)if(entity.kind==='circle')entity.radius=0;
  }
  return canonical(clone);
}
function freeze<T>(value:T):T {
  if(value && typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
function cacheChecked(document:ProjectDocument,cache:DerivedCache):DerivedCache {
  if(!cache || typeof cache!=='object'||Array.isArray(cache)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(cache)))throw new DomainError('INVALID_CACHE','派生缓存需普通对象');
  const solids=new Set(document.features.filter(f=>f.kind!=='sketch').map(f=>f.id));
  for(const [id,mesh] of Object.entries(cache)){
    if(!solids.has(id))throw new DomainError('INVALID_CACHE',`缓存不是当前实体 ${id}`);
    try{trianglePoints(mesh);if(mesh.positions.length)requireSolid(mesh);}
    catch(cause){throw new DomainError('INVALID_CACHE',cause instanceof Error?cause.message:String(cause),`cache.${id}`);}
  }
  for(const id of solids)if(!Object.hasOwn(cache,id))throw new DomainError('MISSING_DERIVED',`缺少实体缓存 ${id}`);
  return structuredClone(cache);
}

function diagnosticsChecked(document:ProjectDocument,diagnostics:DiagnosticCache):DiagnosticCache {
  const invalid=()=>new DomainError('INVALID_DIAGNOSTICS','求解诊断需对应当前草图的真实成功状态、DOF与残差');
  if(!diagnostics||typeof diagnostics!=='object'||Array.isArray(diagnostics)||![Object.prototype,null].includes(Object.getPrototypeOf(diagnostics)))throw invalid();
  for(const [id,d] of Object.entries(diagnostics)){
    const sketch=document.features.find(f=>f.id===id);
    if(sketch?.kind!=='sketch'||!d||!Number.isInteger(d.dof)||d.dof<0||!Number.isInteger(d.resultCode)
      ||d.status!==(d.dof===0?'fully-constrained':'under-constrained')||!Array.isArray(d.failedConstraintIds)||d.failedConstraintIds.length
      ||!Number.isFinite(d.toleranceMm)||d.toleranceMm<=0||d.toleranceMm>1e-5||!d.residuals||typeof d.residuals!=='object'||Array.isArray(d.residuals))throw invalid();
    const constraintIds=new Set(sketch.constraints.map(c=>c.id));
    if(d.redundantConstraintIds!==undefined&&(!Array.isArray(d.redundantConstraintIds)||d.redundantConstraintIds.some(id=>!constraintIds.has(id))))throw invalid();
    const expected=new Set([...sketch.constraints.map(c=>c.id),...sketch.entities.filter(e=>e.kind==='arc').map(e=>`arc:${e.id}`)]);
    if(Object.keys(d.residuals).length!==expected.size)throw invalid();
    for(const [key,value] of Object.entries(d.residuals))if(!expected.has(key)||!Number.isFinite(value)||value<0||value>d.toleranceMm)throw invalid();
  }
  return structuredClone(diagnostics);
}
export class ProjectEngine {
  private current:Snapshot;
  private entries:HistoryEntry[]=[];
  private cursor=0;
  private usedIds:Set<string>;
  private savedFingerprint:string;
  private requestId=0;
  private activeRequestId=0;
  private working=false;
  private revisionValue=0;
  private session:string;
  private options:{recompute?:Recompute;now:()=>string;id:()=>string};
  constructor(document=createEmptyProject(),options:{recompute?:Recompute;now?:()=>string;id?:()=>string;cache?:DerivedCache;diagnostics?:DiagnosticCache}={}) {
    const checked=validateDocument(document);
    this.options={recompute:options.recompute,now:options.now ?? (()=>new Date().toISOString()),id:options.id ?? (()=>crypto.randomUUID())};
    this.current={document:checked,cache:cacheChecked(checked,options.cache ?? {}),diagnostics:diagnosticsChecked(checked,options.diagnostics ?? {})};
    this.usedIds=new Set(documentIds(checked));this.savedFingerprint=fingerprint(checked);this.session=this.options.id();
  }
  get document():ProjectDocument{return structuredClone(this.current.document);}
  get cache():DerivedCache{return structuredClone(this.current.cache);}
  get diagnostics():DiagnosticCache{return structuredClone(this.current.diagnostics);}
  get revision():number{return this.revisionValue;}
  get projectSessionId():string{return this.session;}
  get busy():boolean{return this.working;}
  get canUndo():boolean{return !this.working && this.cursor>0;}
  get canRedo():boolean{return !this.working && this.cursor<this.entries.length;}
  get dirty():boolean{return fingerprint(this.current.document)!==this.savedFingerprint;}
  get historyLength():number{return this.entries.length;}
  private available():void{if(this.working)throw new DomainError('TRANSACTION_BUSY','正在计算，请稍后重试');}

  async execute(command:ProjectCommand):Promise<boolean> {
    this.available();
    const before=structuredClone(this.current),candidate=this.document;
    let geometry=false;
    const find=(id:string)=>{const feature=candidate.features.find(f=>f.id===id);if(!feature)throw new DomainError('REFERENCE_MISSING',`特征不存在 ${id}`);return feature;};
    switch(command.kind){
      case 'rename-project':candidate.name=command.name;break;
      case 'rename-feature':find(command.id).name=command.name;break;
      case 'visibility':find(command.id).visible=command.visible;break;
      case 'add-feature': {
        for(const id of documentIds({...candidate,features:[command.feature]}).slice(1))if(this.usedIds.has(id))throw new DomainError('ID_REUSED',`稳定 ID 已使用 ${id}`);
        candidate.features.push(structuredClone(command.feature));
        if(command.feature.kind==='boolean'){
          find(command.feature.operandAId).visible=false;find(command.feature.operandBId).visible=false;
        }
        geometry=true;break;
      }
      case 'replace-feature': {
        const existing=find(command.feature.id);
        if(existing.kind!==command.feature.kind)throw new DomainError('ID_ROLE_CHANGED','不能将同一特征 ID 改成另一类型');
        const oldIds=new Set(documentIds({...candidate,features:[existing]}).slice(1));
        const oldRoles=roles(existing);
        for(const [id,role] of roles(command.feature))if(oldRoles.has(id)&&oldRoles.get(id)!==role)throw new DomainError('ID_ROLE_CHANGED','不能将已存在 ID 分配给另一类对象');
        for(const id of documentIds({...candidate,features:[command.feature]}).slice(1))if(this.usedIds.has(id)&&!oldIds.has(id))throw new DomainError('ID_REUSED',`稳定 ID 已使用 ${id}`);
        candidate.features[candidate.features.findIndex(f=>f.id===command.feature.id)]=structuredClone(command.feature);geometry=true;break;
      }
      case 'delete-feature': {
        find(command.id);const children=descendants(candidate.features,command.id);
        if(children.length&&!command.cascade)throw new DomainError('DEPENDENTS_EXIST','存在后代，请明确选择级联删除');
        const ids=new Set([command.id,...children]);candidate.features=candidate.features.filter(f=>!ids.has(f.id));geometry=true;break;
      }
      default:throw new DomainError('UNKNOWN_COMMAND','不支持的命令');
    }
    let validated=validateDocument(candidate);
    if(fingerprint(validated)===fingerprint(before.document))return false;
    if(geometry&&!this.options.recompute)throw new DomainError('RECOMPUTE_REQUIRED','几何命令需要真实重算入口，当前不可用');
    const baseRevision=this.revision,session=this.session,requestId=++this.requestId;
    this.activeRequestId=requestId;this.working=true;
    const isCancelled=()=>session!==this.session||baseRevision!==this.revision||requestId!==this.activeRequestId;
    try{
      let cache=before.cache,diagnostics=before.diagnostics;
      if(geometry){
        const expectedIds=documentIds(validated).sort();
        const expectedDefinition=definition(validated);
        const result=await this.options.recompute!(freeze(structuredClone(validated)),{projectSessionId:session,baseRevision,requestId,isCancelled,baseline:freeze(before)});
        if(isCancelled())throw new DomainError('STALE_TRANSACTION','旧事务结果已丢弃');
        validated=validateDocument(result.document);
        if(canonical(documentIds(validated).sort())!==canonical(expectedIds))throw new DomainError('RECOMPUTE_ID_CHANGED','重算不能改变稳定 ID');
        if(definition(validated)!==expectedDefinition)throw new DomainError('RECOMPUTE_DEFINITION_CHANGED','重算不能改写约束、依赖或输入参数');
        cache=cacheChecked(validated,result.cache);
        diagnostics=diagnosticsChecked(validated,result.diagnostics ?? {});
      }
      if(isCancelled())throw new DomainError('STALE_TRANSACTION','旧事务结果已丢弃');
      validated.updatedAt=this.options.now();validated=validateDocument(validated);
      const after={document:validated,cache,diagnostics};
      this.entries=this.entries.slice(0,this.cursor);
      this.entries.push({before,after:structuredClone(after),label:command.kind});
      if(this.entries.length>100)this.entries.shift();
      this.cursor=this.entries.length;this.current=structuredClone(after);this.revisionValue++;
      documentIds(validated).forEach(id=>this.usedIds.add(id));return true;
    }finally{if(this.activeRequestId===requestId)this.working=false;}
  }
  undo():boolean {
    this.available();if(!this.canUndo)return false;
    this.current=structuredClone(this.entries[--this.cursor]!.before);this.revisionValue++;return true;
  }
  redo():boolean {
    this.available();if(!this.canRedo)return false;
    this.current=structuredClone(this.entries[this.cursor++]!.after);this.revisionValue++;return true;
  }
  cancelPending():boolean {
    if(!this.working)return false;
    this.activeRequestId=++this.requestId;this.working=false;return true;
  }
  resetEmpty(document:ProjectDocument):void {
    const checked=validateDocument(document);
    if(checked.features.length)throw new DomainError('RESET_NONEMPTY','空项目重置不能装载已有几何');
    if(checked.id===this.current.document.id)throw new DomainError('PROJECT_ID_REUSED','新项目需要新的项目 ID');
    this.session=this.options.id();this.activeRequestId=++this.requestId;this.working=false;
    this.current={document:checked,cache:{},diagnostics:{}};this.entries=[];this.cursor=0;this.revisionValue++;
    this.usedIds=new Set(documentIds(checked));this.savedFingerprint=fingerprint(checked);
  }
  captureSave():SaveSnapshot{return {document:this.document,projectSessionId:this.session,revision:this.revision,fingerprint:fingerprint(this.current.document)};}
  markSaved(snapshot:SaveSnapshot):boolean {
    if(snapshot.projectSessionId!==this.session||snapshot.document.id!==this.current.document.id)return false;
    if(fingerprint(validateDocument(snapshot.document))!==snapshot.fingerprint)throw new DomainError('INVALID_SAVE_TOKEN','保存快照不匹配');
    this.savedFingerprint=snapshot.fingerprint;return true;
  }
}
