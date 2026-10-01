<script setup lang="ts">
import { computed, inject, markRaw, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ViewportRuntime, type PickResult, type ViewportState } from '../adapters/viewport/viewport-runtime.ts';
import type { ProjectDocument, SketchFeature, Vec2 } from '../core/model/document.ts';
import type { InteractionMode } from '../app/workspace-state.ts';
import { drawingFeature, nearestSnap, previewDrawing, type DrawSample, type DrawTool, type SnapCandidate } from '../core/geometry/drawing.ts';
import { toWorld } from '../core/geometry/plane.ts';
import { sketchPreview } from '../core/geometry/sketch-edit.ts';
import type { SketchDrag } from '../app/sketch-drag.ts';
import type { BasePlane } from '../core/geometry/plane.ts';
import { projectSessionKey } from '../app/project-context.ts';
const props=defineProps<{document:ProjectDocument;sessionId:string;selectionIds:string[];activeSketchId:string|null;mode:InteractionMode;enabled:boolean;commit:(feature:SketchFeature)=>Promise<SketchFeature>}>();
const emit=defineEmits<{select:[pick:PickResult|null,additive:boolean];ready:[available:boolean]}>();
const session=inject(projectSessionKey)!;
const host=shallowRef<HTMLElement|null>(null),runtime=shallowRef<ViewportRuntime|null>(null);
const state=ref<ViewportState|'loading'>('loading'),message=ref('');
const draft=shallowRef<DrawSample[]>([]),cursor=shallowRef<DrawSample|null>(null),drawingError=ref(''),submitting=ref(false);
const xInput=ref('0'),yInput=ref('0');
let draftEpoch=0;
let gesture:SketchDrag|null=null,gestureEpoch=0;
const dragStatus=ref(''),dragFinishing=ref(false);
const tool=computed<DrawTool|null>(()=>({ 'sketch.drawLine':'line','sketch.drawRectangle':'rectangle','sketch.drawCircle':'circle','sketch.drawArc':'arc' } as Partial<Record<InteractionMode,DrawTool>>)[props.mode]??null);
const active=computed(()=>{const f=props.document.features.find(f=>f.id===props.activeSketchId);return f?.kind==='sketch'?f:null;});
const toolLabels:Record<DrawTool,string>={line:'线段：起点 → 终点，连续绘制后 Esc 停止',rectangle:'矩形：两个对角点',circle:'圆：中心 → 半径点',arc:'圆弧：起点 → 过点 → 终点'};
function cancelDraft():void {draftEpoch++;draft.value=[];cursor.value=null;drawingError.value='';submitting.value=false;runtime.value?.clearPreview();}
function cancelDrag():void {gestureEpoch++;session.cancelDrag();gesture=null;dragStatus.value='';dragFinishing.value=false;runtime.value?.clearPreview();}
function cancel():void {runtime.value?.cancelGesture();cancelDrag();cancelDraft();}
function startDrag(pick:PickResult):boolean {
  if(props.mode!=='sketch.select'||!props.enabled||!active.value||pick.featureId!==active.value.id||pick.kind!=='point')return false;
  cancelDrag();drawingError.value='';const epoch=gestureEpoch;
  try{gesture=session.beginDrag(active.value.id,pick.id,
    sketch=>{if(epoch===gestureEpoch){runtime.value?.setPreview(sketch.plane,sketchPreview(sketch));dragStatus.value='拖动预览 · 未提交 · 松开提交，Esc 取消';}},
    message=>{if(epoch===gestureEpoch){drawingError.value=message;dragStatus.value='拖动失败 · 现有草图不变';}});}
  catch(cause){drawingError.value=cause instanceof Error?cause.message:String(cause);return false;}
  emit('select',pick,false);return true;
}
function moveDrag(x:number,y:number):void {
  if(!gesture||!active.value)return;const position=runtime.value?.screenToPlane(x,y,active.value.plane);if(!position)return;
  dragStatus.value='正在求解拖动预览 · 未提交';drawingError.value='';gesture.update(position);
}
async function finishDrag(x:number,y:number):Promise<void> {
  const current=gesture;if(!current)return;moveDrag(x,y);const epoch=gestureEpoch;dragFinishing.value=true;dragStatus.value='正在求解并提交拖动 · Esc 可取消';
  try{await current.finish();}
  catch(cause){if(epoch===gestureEpoch)drawingError.value=cause instanceof Error?cause.message:String(cause);}
  finally{if(epoch===gestureEpoch){gesture=null;session.cancelDrag();dragFinishing.value=false;dragStatus.value='';runtime.value?.clearPreview();}}
}
function updatePreview():void {
  if(!tool.value||!active.value)return;
  const samples=cursor.value?[...draft.value,cursor.value]:draft.value;
  try{runtime.value?.setPreview(active.value.plane,previewDrawing(tool.value,samples));}
  catch{runtime.value?.setPreview(active.value.plane,{lines:[samples.map(s=>s.position)],points:samples.map(s=>s.position)});}
}
function snapAllowed():boolean {
  if(tool.value==='circle')return draft.value.length===0;
  if(tool.value==='arc')return draft.value.length!==1;
  return true;
}
function sampleAt(x:number,y:number):DrawSample|null {
  const viewport=runtime.value,sketch=active.value;if(!viewport||!sketch)return null;
  const position=viewport.screenToPlane(x,y,sketch.plane);if(!position)return null;
  if(!snapAllowed())return {position};
  const origin=viewport.project(toWorld(sketch.plane,[0,0])),candidates:SnapCandidate[]=[{position:[0,0],screen:[origin.x,origin.y],snap:{kind:'origin'}}];
  for(const p of sketch.points){const screen=viewport.project(toWorld(sketch.plane,p.position));if(screen.visible)candidates.push({position:p.position,screen:[screen.x,screen.y],snap:{kind:'point',pointId:p.id}});}
  return nearestSnap([x,y],candidates)??{position};
}
async function addSample(sample:DrawSample):Promise<void> {
  const sketch=active.value,currentTool=tool.value;if(!props.enabled||submitting.value||!sketch||!currentTool)return;
  drawingError.value='';const samples=[...draft.value,structuredClone(sample)],count=currentTool==='arc'?3:2;
  if(samples.length<count){draft.value=samples;cursor.value=null;updatePreview();return;}
  let result:ReturnType<typeof drawingFeature>;
  try{result=drawingFeature(sketch,currentTool,samples);}catch(cause){drawingError.value=cause instanceof Error?cause.message:String(cause);return;}
  const epoch=draftEpoch;submitting.value=true;cursor.value=sample;updatePreview();
  try{
    const committed=await props.commit(result.feature);if(epoch!==draftEpoch)return;
    if(currentTool==='line'&&result.endPointId){const endpoint=committed.points.find(p=>p.id===result.endPointId)!;draft.value=[{position:[...endpoint.position],snap:{kind:'point',pointId:endpoint.id}}];}
    else draft.value=[];
    cursor.value=null;runtime.value?.clearPreview();updatePreview();
  }catch(cause){if(epoch===draftEpoch)drawingError.value=cause instanceof Error?cause.message:String(cause);}
  finally{if(epoch===draftEpoch)submitting.value=false;}
}
function pointer(kind:'move'|'click',x:number,y:number):boolean {
  if(!tool.value||!active.value)return false;
  const sample=sampleAt(x,y);if(!sample)return true;
  cursor.value=sample;updatePreview();if(kind==='click')void addSample(sample);return true;
}
function coordinateInput():void {
  if(!xInput.value.trim()||!yInput.value.trim()){drawingError.value='请填写两个有限坐标。';return;}
  const position:Vec2=[Number(xInput.value),Number(yInput.value)];if(position.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)){drawingError.value='坐标需有限且在 ±10000 mm 内。';return;}
  const viewport=runtime.value,sketch=active.value;if(!viewport||!sketch)return;
  const screen=viewport.project(toWorld(sketch.plane,position));
  void addSample(snapAllowed()?sampleAt(screen.x,screen.y)??{position}:{position});
}
let mounted=false;
function apply():void {
  const viewport=runtime.value;if(!viewport)return;
  viewport.updateDocument(props.document,session.derivedCache,props.sessionId);
  viewport.setSelection(props.selectionIds);viewport.setInputEnabled(props.enabled);
  const active=props.document.features.find(f=>f.id===props.activeSketchId);
  if(active?.kind==='sketch')viewport.enterSketch(active);else viewport.exitSketch();
}
function start():void {
  runtime.value?.dispose();runtime.value=null;state.value='loading';message.value='';
  if(!host.value||!mounted)return;
  try{
    runtime.value=markRaw(new ViewportRuntime(host.value,props.document,props.sessionId,{
      select:(pick,additive)=>{if(props.enabled)emit('select',pick,additive);},
      pointer,
      drag:{start:startDrag,move:moveDrag,finish:(x,y)=>{void finishDrag(x,y);},cancel:cancelDrag},
      state:(next,reason)=>{if(mounted){state.value=next;message.value=reason??'';emit('ready',next==='ready');if(next==='lost'||next==='error')cancel();}},
    }));apply();
  }catch(cause){state.value='error';message.value=cause instanceof Error?cause.message:String(cause);emit('ready',false);}
}
function standard(view:BasePlane|'iso'):void{runtime.value?.standardView(view);}
function fit():void{runtime.value?.fit();}
defineExpose({fit,cancel});
onMounted(()=>{mounted=true;start();});
watch(()=>[props.document,props.sessionId,props.activeSketchId],apply);
// External undo/redo invalidates a pending anchor; our own commit keeps the continuous-line endpoint.
watch(()=>props.document,()=>{if(!submitting.value&&!dragFinishing.value)cancel();});
watch(()=>props.selectionIds,ids=>runtime.value?.setSelection(ids));
watch(()=>props.enabled,enabled=>runtime.value?.setInputEnabled(enabled));
watch(()=>[props.mode,props.activeSketchId,props.sessionId],cancel);
onUnmounted(()=>{mounted=false;cancel();runtime.value?.dispose();runtime.value=null;});
</script>
<template>
  <div class="model-viewport" :data-viewport-state="state">
    <div ref="host" class="viewport-canvas-host"></div>
    <div class="viewport-view-tools" aria-label="标准视图">
      <button type="button" :disabled="state!=='ready'||!enabled||!!activeSketchId" @click="standard('iso')">等轴测</button>
      <button v-for="plane in (['XY','XZ','YZ'] as const)" :key="plane" type="button" :disabled="state!=='ready'||!enabled||!!activeSketchId" @click="standard(plane)">{{plane}} 视图</button>
      <button type="button" :disabled="state!=='ready'||!enabled" @click="fit">适应视图</button>
    </div>
    <p class="viewport-instructions">{{activeSketchId?'草图平面视图 · 中键平移 · 滚轮缩放':'左键选择 · Ctrl 多选 · 中键平移 · 右键旋转 · 滚轮缩放'}} · mm</p>
    <div v-if="tool" class="sketch-input-panel" role="region" aria-label="草图输入" :data-draft-count="draft.length">
      <p>{{toolLabels[tool]}}</p><p class="draft-status">{{submitting?'正在求解候选 · 未提交':`预览 · 未提交 · 下一点 ${draft.length+1}`}}</p>
      <p v-if="cursor?.snap" class="snap-hint">{{cursor.snap.kind==='origin'?'捕捉原点':'捕捉已有点'}} · 8 CSS px</p>
      <form @submit.prevent="coordinateInput"><label>下一点 X (mm)<input v-model="xInput" type="text" inputmode="decimal" :disabled="!enabled||submitting" /></label><label>下一点 Y (mm)<input v-model="yInput" type="text" inputmode="decimal" :disabled="!enabled||submitting" /></label><button type="submit" :disabled="!enabled||submitting">输入此点</button></form>
      <p v-if="drawingError" class="error-message" role="alert">{{drawingError}}</p>
    </div>
    <div v-if="state==='error'||state==='lost'" class="viewport-error-overlay" role="alert"><h2>{{state==='lost'?'视口连接中断':'视口不可用'}}</h2><p>{{message}}</p><button type="button" @click="start">重试视口</button></div>
    <div v-if="!tool&&(dragStatus||drawingError)" class="sketch-input-panel" role="region" aria-label="拖动状态"><p>{{dragStatus}}</p><p v-if="drawingError" class="error-message" role="alert">{{drawingError}}</p></div>
  </div>
</template>
