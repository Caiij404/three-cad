<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useWorkspaceStore } from '../stores/workspace.ts';
import { KernelBootstrap } from '../app/kernel-bootstrap.ts';
import { projectSessionKey } from '../app/project-context.ts';
import { useProjectStore } from '../stores/project.ts';
import ModelViewport from './ModelViewport.vue';
import ConstraintPanel from './ConstraintPanel.vue';
import { BASE_PLANES, type BasePlane } from '../core/geometry/plane.ts';
import { DomainError, type SketchFeature, type Entity } from '../core/model/document.ts';
import type { PickResult } from '../adapters/viewport/viewport-runtime.ts';
import { deleteSketchEntities } from '../core/geometry/sketch-edit.ts';
const ui=useWorkspaceStore();
const project=useProjectStore();
const session=inject(projectSessionKey)!;
const nameDraft=ref(''),projectError=ref('');
const newDialog=shallowRef<HTMLDialogElement|null>(null);
const viewport=shallowRef<InstanceType<typeof ModelViewport>|null>(null);
const viewportReady=ref(false);
const featureName=ref('');
const selectedFeature=computed(()=>project.snapshot?.document.features.find(f=>ui.state.selectionIds.includes(f.id)));
const activeSketch=computed(()=>{const feature=project.snapshot?.document.features.find(f=>f.id===ui.state.activeSketchId);return feature?.kind==='sketch'?feature:null;});
const selectedPoint=computed(()=>ui.state.selectionIds.length===1?activeSketch.value?.points.find(p=>p.id===ui.state.selectionIds[0]):undefined);
const selectedEntityIds=computed(()=>activeSketch.value?.entities.filter(e=>ui.state.selectionIds.includes(e.id)).map(e=>e.id)??[]);
function measurement(entity:Entity):string {
  const points=activeSketch.value!.points,point=(id:string)=>points.find(p=>p.id===id)!.position;
  const distance=(a:string,b:string)=>{const p=point(a),q=point(b);return Math.hypot(p[0]-q[0],p[1]-q[1]);};
  return entity.kind==='line'?`线长 ${distance(entity.startPointId,entity.endPointId).toFixed(6)} mm`:entity.kind==='circle'?`圆半径 ${entity.radius.toFixed(6)} mm`:`圆弧半径 ${distance(entity.centerPointId,entity.startPointId).toFixed(6)} mm · ${entity.clockwise?'顺时针':'逆时针'}`;
}
const selectedPlane=computed(()=>ui.state.selectionIds.length===1&&ui.state.selectionIds[0]?.startsWith('plane:')?ui.state.selectionIds[0].slice(6) as BasePlane:null);
watch(()=>selectedFeature.value?.name,name=>{featureName.value=name??'';});
let unsubscribe:()=>void=()=>{};
const kernels=new KernelBootstrap();
let mounted=true;
async function load():Promise<void> {
  ui.dispatch({type:'load'});
  const generation=ui.state.generation;
  try{await kernels.probe();if(mounted)ui.dispatch({type:'loaded',generation});}
  catch(cause){if(mounted)ui.dispatch({type:'load-failed',generation,message:cause instanceof Error?cause.message:String(cause)});}
}
function keydown(event:KeyboardEvent):void {
  if(newDialog.value?.open)return;
  if(event.key==='Escape'){viewport.value?.cancel();session.cancelPending();ui.dispatch({type:'cancel'});event.preventDefault();return;}
  const target=event.target;
  if(target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z' && ui.ready){event.preventDefault();event.shiftKey?redo():undo();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y' && ui.ready){event.preventDefault();redo();}
  if(event.key.toLowerCase()==='f'&&!event.ctrlKey&&!event.metaKey&&ui.ready){event.preventDefault();viewport.value?.fit();}
  if(event.key==='Delete'&&ui.ready&&!project.snapshot?.busy){
    if(selectedEntityIds.value.length){event.preventDefault();void deleteEntities();}
    else if(selectedFeature.value){event.preventDefault();void deleteFeature();}
    else if(selectedPoint.value){event.preventDefault();projectError.value='请选线、圆或圆弧删除；点随其拥有实体清理。';}
  }
}
onMounted(()=>{
  unsubscribe=session.subscribe(snapshot=>{
    project.publish(snapshot);nameDraft.value=snapshot.document.name;
    const ids=new Set(snapshot.document.features.flatMap(f=>[f.id,...(f.kind==='sketch'?[...f.points,...f.entities].map(o=>o.id):[])]));
    if(ui.ready){
      if(ui.state.activeSketchId&&!ids.has(ui.state.activeSketchId))ui.dispatch({type:'mode',mode:'model.select'});
      ui.dispatch({type:'select',ids:ui.state.selectionIds.filter(id=>id.startsWith('plane:')||ids.has(id))});
    }
  });
  void load();window.addEventListener('keydown',keydown);
});
onUnmounted(()=>{mounted=false;unsubscribe();kernels.dispose();window.removeEventListener('keydown',keydown);});
async function rename():Promise<void> {
  if(!ui.ready)return;projectError.value='';
  try{await session.execute({kind:'rename-project',name:nameDraft.value.trim()});}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
function undo():void {if(!ui.ready||!project.snapshot?.canUndo)return;session.undo();projectError.value='';}
function redo():void {if(!ui.ready||!project.snapshot?.canRedo)return;session.redo();projectError.value='';}
function reset():void {session.newProject();ui.dispatch({type:'mode',mode:'model.select'});projectError.value='';newDialog.value?.close();}
function requestNew():void {if(!ui.ready||project.snapshot?.busy)return;viewport.value?.cancel();if(project.snapshot?.dirty)newDialog.value?.showModal();else reset();}
const fileActions=['打开','保存','导出 STL'];
const tools=['拉伸','布尔'];
function constrain():void {
  if(!ui.ready||!activeSketch.value||project.snapshot?.busy)return;
  viewport.value?.cancel();const ids=[...ui.state.selectionIds];ui.propertiesCollapsed=false;
  ui.dispatch({type:'mode',mode:'sketch.constrain'});ui.dispatch({type:'select',ids});
}
const drawingTools=[{label:'线段',mode:'sketch.drawLine'},{label:'矩形',mode:'sketch.drawRectangle'},{label:'圆',mode:'sketch.drawCircle'},{label:'圆弧',mode:'sketch.drawArc'}] as const;
function draw(mode:typeof drawingTools[number]['mode']):void {if(ui.ready&&viewportReady.value&&ui.state.activeSketchId&&!project.snapshot?.busy)ui.dispatch({type:'mode',mode});}
function cancelDrawing():void {viewport.value?.cancel();session.cancelPending();ui.dispatch({type:'cancel'});}
async function commitDraw(feature:SketchFeature):Promise<SketchFeature> {
  if(!ui.ready||!viewportReady.value||ui.state.activeSketchId!==feature.id)throw new DomainError('DRAWING_CONTEXT_CHANGED','绘制上下文已改变');
  await session.execute({kind:'replace-feature',feature});
  const committed=session.snapshot().document.features.find(f=>f.id===feature.id);
  if(committed?.kind!=='sketch')throw new DomainError('DRAWING_CONTEXT_CHANGED','草图已不存在');return committed;
}
function selectId(id:string,additive=false):void {
  if(!ui.ready)return;
  const active=project.snapshot?.document.features.find(f=>f.id===ui.state.activeSketchId);
  const inActive=id===ui.state.activeSketchId||(active?.kind==='sketch'&&[...active.points,...active.entities].some(object=>object.id===id));
  if(ui.state.activeSketchId&&!inActive){projectError.value='请先完成当前草图，再选择其他对象。';return;}
  const ids=additive?(ui.state.selectionIds.includes(id)?ui.state.selectionIds.filter(i=>i!==id):[...ui.state.selectionIds,id]):[id];
  ui.dispatch({type:'select',ids});featureName.value=selectedFeature.value?.name??'';projectError.value='';
}
function pick(picked:PickResult|null,additive:boolean):void {if(picked)selectId(picked.id,additive);else if(!additive)ui.dispatch({type:'select',ids:[]});}
async function createSketch():Promise<void> {
  if(!ui.ready||!viewportReady.value||!selectedPlane.value||ui.state.activeSketchId)return;
  const plane=selectedPlane.value,name=`草图 ${project.snapshot!.document.features.filter(f=>f.kind==='sketch').length+1}`;
  const feature:SketchFeature={id:crypto.randomUUID(),name,kind:'sketch',visible:true,plane:structuredClone(BASE_PLANES[plane]),points:[],entities:[],constraints:[]};
  try{await session.execute({kind:'add-feature',feature});ui.dispatch({type:'mode',mode:'sketch.select',sketchId:feature.id});ui.dispatch({type:'select',ids:[feature.id]});featureName.value=name;projectError.value='';}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
function editSketch():void {if(ui.ready&&viewportReady.value&&selectedFeature.value?.kind==='sketch'&&selectedFeature.value.visible){ui.dispatch({type:'mode',mode:'sketch.select',sketchId:selectedFeature.value.id});projectError.value='';}}
function finishSketch():void {if(ui.ready&&!project.snapshot?.busy){viewport.value?.cancel();ui.dispatch({type:'mode',mode:'model.select'});}}
async function deleteEntities():Promise<void> {
  const sketch=activeSketch.value;if(!sketch||!selectedEntityIds.value.length)return;viewport.value?.cancel();
  try{await session.execute({kind:'replace-feature',feature:deleteSketchEntities(sketch,selectedEntityIds.value)});projectError.value='';}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
async function deleteFeature():Promise<void> {
  const feature=selectedFeature.value;if(!feature||!ui.ready)return;
  try{await session.execute({kind:'delete-feature',id:feature.id,cascade:false});projectError.value='';}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
async function renameFeature():Promise<void> {
  const feature=selectedFeature.value;if(!feature)return;
  try{await session.execute({kind:'rename-feature',id:feature.id,name:featureName.value.trim()});projectError.value='';}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
async function visibility():Promise<void> {
  const feature=selectedFeature.value;if(!feature||ui.state.activeSketchId)return;
  try{await session.execute({kind:'visibility',id:feature.id,visible:!feature.visible});projectError.value='';}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
</script>
<template>
  <main class="workspace" aria-label="CAD 工作区" :data-computation="ui.state.computation" :data-project-id="project.snapshot?.document.id">
    <header class="workspace-header">
      <div><h1>{{project.snapshot?.document.name ?? '未命名项目'}}</h1><p>单位 mm · Z 向上 · {{project.snapshot?.dirty?'未保存的修改':'未修改'}}</p></div>
      <div class="file-actions" aria-label="文件与历史">
        <button type="button" :disabled="!ui.ready||project.snapshot?.busy" @click="requestNew">新建</button>
        <button v-for="action in fileActions" :key="action" type="button" disabled :title="`${action}尚未实现`" aria-describedby="file-unavailable">{{action}}</button>
        <button type="button" :disabled="!ui.ready||!project.snapshot?.canUndo" @click="undo">撤销</button>
        <button type="button" :disabled="!ui.ready||!project.snapshot?.canRedo" @click="redo">重做</button>
      </div>
      <p id="file-unavailable" class="unavailable-note">打开、保存与 STL 导出尚未实现；当前修改保留在页面内。</p>
    </header>
    <div class="workspace-tools" role="toolbar" aria-label="建模工具">
      <button type="button" :disabled="!ui.ready" @click="cancelDrawing" :aria-pressed="ui.state.mode==='model.select'||ui.state.mode==='sketch.select'">选择</button>
      <button type="button" :disabled="!ui.ready||!viewportReady||!selectedPlane||!!ui.state.activeSketchId||project.snapshot?.busy" @click="createSketch" title="视口就绪后，先选择 XY/XZ/YZ 平面">新建草图</button>
      <button v-for="tool in drawingTools" :key="tool.mode" type="button" :disabled="!ui.ready||!viewportReady||!ui.state.activeSketchId||project.snapshot?.busy" :aria-pressed="ui.state.mode===tool.mode" @click="draw(tool.mode)">{{tool.label}}</button>
      <button type="button" :disabled="!ui.ready||!viewportReady||!activeSketch||project.snapshot?.busy" :aria-pressed="ui.state.mode==='sketch.constrain'" @click="constrain">约束</button>
      <button v-for="tool in tools" :key="tool" type="button" disabled :title="`${tool}尚未实现`" aria-describedby="tools-unavailable">{{tool}}</button>
      <button type="button" :disabled="!ui.ready||!ui.state.activeSketchId||project.snapshot?.busy" @click="finishSketch">完成草图</button>
      <span id="tools-unavailable">拉伸与布尔实体特征尚未实现。</span>
    </div>
    <div class="workspace-body" :class="{'tree-collapsed':ui.treeCollapsed,'properties-collapsed':ui.propertiesCollapsed}">
      <aside class="feature-panel" aria-label="特征树">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.treeCollapsed" @click="ui.treeCollapsed=!ui.treeCollapsed">{{ui.treeCollapsed?'展开特征树':'折叠特征树'}}</button>
        <div v-if="!ui.treeCollapsed"><h2>特征树</h2>
          <ul class="feature-tree"><li v-for="plane in (['XY','XZ','YZ'] as const)" :key="plane"><button type="button" :disabled="!ui.ready||!!ui.state.activeSketchId" :aria-pressed="ui.state.selectionIds.includes(`plane:${plane}`)" @click="selectId(`plane:${plane}`,$event.ctrlKey||$event.metaKey)">{{plane}} 平面</button></li></ul>
          <p v-if="!project.snapshot?.document.features.length" class="empty-message">暂无特征</p>
          <ul v-else class="feature-tree"><li v-for="feature in project.snapshot.document.features" :key="feature.id"><button type="button" :data-feature-id="feature.id" :aria-pressed="ui.state.selectionIds.includes(feature.id)" :disabled="!ui.ready||(!!ui.state.activeSketchId&&ui.state.activeSketchId!==feature.id)" @click="selectId(feature.id,$event.ctrlKey||$event.metaKey)">{{feature.name}} <span v-if="!feature.visible">（隐藏）</span></button></li></ul>
          <p>选择平面可创建草图；草图与视口使用相同 ID。</p>
        </div>
      </aside>
      <section class="viewport-placeholder" aria-label="建模视口">
        <ModelViewport v-if="project.snapshot" ref="viewport" :document="project.snapshot.document" :session-id="project.snapshot.projectSessionId" :selection-ids="ui.state.selectionIds" :active-sketch-id="ui.state.activeSketchId" :mode="ui.state.mode" :commit="commitDraw" :enabled="ui.ready&&!project.snapshot.busy" @select="pick" @ready="viewportReady=$event" />
        <div v-if="ui.state.computation==='loading'" class="workspace-overlay" role="status"><h2>正在加载几何内核</h2><p>正在检查真实求解器与实体运算。</p></div>
        <div v-else-if="ui.state.computation==='error'" class="workspace-overlay" role="alert"><h2>几何内核加载失败</h2><p>请检查资源加载情况后重试。</p><details><summary>查看具体原因</summary><pre>{{ui.state.error}}</pre></details><button type="button" @click="load">重试加载</button></div>
      </section>
      <aside class="property-panel" aria-label="属性面板">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.propertiesCollapsed" @click="ui.propertiesCollapsed=!ui.propertiesCollapsed">{{ui.propertiesCollapsed?'展开属性':'折叠属性'}}</button>
        <div v-if="!ui.propertiesCollapsed"><h2>属性</h2>
          <form class="project-properties" @submit.prevent="rename">
            <label for="project-name">项目名称</label><input id="project-name" v-model="nameDraft" maxlength="200" :disabled="!ui.ready||project.snapshot?.busy" />
            <button type="submit" :disabled="!ui.ready||project.snapshot?.busy||nameDraft===project.snapshot?.document.name">应用名称</button>
          </form>
          <p v-if="projectError" role="alert" class="error-message">{{projectError}}</p>
          <template v-if="selectedPlane"><p class="empty-message">{{selectedPlane}} 平面已选中</p><p>点击“新建草图”进入此平面。</p></template>
          <template v-else-if="selectedFeature"><p class="empty-message">{{selectedFeature.kind==='sketch'?'草图':'特征'}} · {{selectedFeature.visible?'可见':'隐藏'}}</p>
            <form class="project-properties" @submit.prevent="renameFeature"><label for="feature-name">特征名称</label><input id="feature-name" v-model="featureName" maxlength="200" :disabled="project.snapshot?.busy" /><button type="submit" :disabled="project.snapshot?.busy">应用特征名称</button></form>
            <div class="feature-actions"><button type="button" :disabled="!viewportReady||!selectedFeature.visible||selectedFeature.kind!=='sketch'||!!ui.state.activeSketchId||project.snapshot?.busy" title="先显示草图，再编辑" @click="editSketch">编辑草图</button><button type="button" :disabled="!!ui.state.activeSketchId||project.snapshot?.busy" @click="visibility">{{selectedFeature.visible?'隐藏特征':'显示特征'}}</button><button type="button" :disabled="project.snapshot?.busy" @click="deleteFeature">删除特征</button></div>
          </template>
          <template v-else-if="selectedPoint"><p>草图点 · 可用左键拖动</p><p :data-point-id="selectedPoint.id">X {{selectedPoint.position[0].toFixed(6)}} mm · Y {{selectedPoint.position[1].toFixed(6)}} mm</p></template>
          <template v-else-if="selectedEntityIds.length"><p>已选 {{selectedEntityIds.length}} 个草图实体</p><p v-for="entity in activeSketch?.entities.filter(e=>selectedEntityIds.includes(e.id))" :key="entity.id" :data-entity-measurement-id="entity.id">{{measurement(entity)}}</p><button type="button" :disabled="project.snapshot?.busy" @click="deleteEntities">删除选中实体</button></template>
          <template v-else><p class="empty-message">未选择对象</p><p>选择基准面、草图或草图对象查看属性。</p></template>
          <details v-if="activeSketch" class="sketch-objects"><summary>草图对象</summary><p>选择工具下可拖点；Ctrl 多选实体，Delete 删除。</p><div v-for="(entity,index) in activeSketch.entities" :key="entity.id"><button type="button" :data-entity-id="entity.id" :aria-pressed="ui.state.selectionIds.includes(entity.id)" @click="selectId(entity.id,$event.ctrlKey||$event.metaKey)">{{entity.kind==='line'?'线段':entity.kind==='circle'?'圆':'圆弧'}} {{index+1}}</button></div><div v-for="(point,index) in activeSketch.points" :key="point.id"><button type="button" :data-point-select-id="point.id" :aria-pressed="ui.state.selectionIds.includes(point.id)" @click="selectId(point.id,$event.ctrlKey||$event.metaKey)">点 {{index+1}} · ({{point.position[0].toFixed(3)}}, {{point.position[1].toFixed(3)}})</button></div></details>
          <ConstraintPanel v-if="activeSketch" :key="activeSketch.id" :sketch="activeSketch" :diagnostics="project.snapshot?.diagnostics[activeSketch.id]" :selection-ids="ui.state.selectionIds" :revision="project.snapshot?.revision ?? 0" :busy="!ui.ready || !!project.snapshot?.busy" :creating="ui.state.mode==='sketch.constrain'" :commit="commitDraw" @select="ui.dispatch({type:'select',ids:$event})" />
          <details v-if="ui.state.activeSketchId" class="sketch-definition"><summary>查看当前草图数据</summary><pre data-testid="active-sketch-data">{{JSON.stringify(project.snapshot?.document.features.find(f=>f.id===ui.state.activeSketchId),null,2)}}</pre></details>
        </div>
      </aside>
    </div>
    <footer class="workspace-status" role="status"><span>{{ui.state.computation==='ready'?'内核就绪':ui.state.computation==='error'?'加载失败':'正在加载'}} · {{ui.state.activeSketchId?'草图选择':'模型选择'}} · revision {{project.snapshot?.revision ?? 0}}</span><span>mm · {{ui.state.selectionIds.length}} 个对象选中</span></footer>
    <p class="narrow-layout-hint">当前为窄屏布局，完整建模面向桌面宽屏。</p>
    <dialog ref="newDialog" class="project-dialog" aria-labelledby="new-dialog-title">
      <h2 id="new-dialog-title">当前项目有未保存的修改</h2><p>新建会丢弃当前项目。你可以取消并继续编辑。</p>
      <p id="save-new-reason">保存功能尚未实现，暂不能保存后新建。</p>
      <div><button type="button" @click="newDialog?.close()">取消</button><button type="button" disabled aria-describedby="save-new-reason">保存后新建</button><button type="button" @click="reset">丢弃修改并新建</button></div>
    </dialog>
  </main>
</template>
