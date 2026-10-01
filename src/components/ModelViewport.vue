<script setup lang="ts">
import { inject, markRaw, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ViewportRuntime, type PickResult, type ViewportState } from '../adapters/viewport/viewport-runtime.ts';
import type { ProjectDocument } from '../core/model/document.ts';
import type { BasePlane } from '../core/geometry/plane.ts';
import { projectSessionKey } from '../app/project-context.ts';
const props=defineProps<{document:ProjectDocument;sessionId:string;selectionIds:string[];activeSketchId:string|null;enabled:boolean}>();
const emit=defineEmits<{select:[pick:PickResult|null,additive:boolean];ready:[available:boolean]}>();
const session=inject(projectSessionKey)!;
const host=shallowRef<HTMLElement|null>(null),runtime=shallowRef<ViewportRuntime|null>(null);
const state=ref<ViewportState|'loading'>('loading'),message=ref('');
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
      state:(next,reason)=>{if(mounted){state.value=next;message.value=reason??'';emit('ready',next==='ready');}},
    }));apply();
  }catch(cause){state.value='error';message.value=cause instanceof Error?cause.message:String(cause);emit('ready',false);}
}
function standard(view:BasePlane|'iso'):void{runtime.value?.standardView(view);}
function fit():void{runtime.value?.fit();}
defineExpose({fit});
onMounted(()=>{mounted=true;start();});
watch(()=>[props.document,props.sessionId,props.activeSketchId],apply);
watch(()=>props.selectionIds,ids=>runtime.value?.setSelection(ids));
watch(()=>props.enabled,enabled=>runtime.value?.setInputEnabled(enabled));
onUnmounted(()=>{mounted=false;runtime.value?.dispose();runtime.value=null;});
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
    <div v-if="state==='error'||state==='lost'" class="viewport-error-overlay" role="alert"><h2>{{state==='lost'?'视口连接中断':'视口不可用'}}</h2><p>{{message}}</p><button type="button" @click="start">重试视口</button></div>
  </div>
</template>
