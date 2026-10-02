<script setup lang="ts">
import { computed, inject, onUnmounted, ref, shallowRef } from 'vue';
import { projectSessionKey } from '../app/project-context.ts';
import type { ProjectDocument } from '../core/model/document.ts';
import { DomainError } from '../core/model/document.ts';
import type { SaveSnapshot } from '../core/commands/project-engine.ts';
import { parseProjectJson, serializeProject } from '../core/model/validate-document.ts';
import { downloadProject, readProjectFile } from '../adapters/files/project-file.ts';
const props=defineProps<{ready:boolean;busy:boolean;camera:()=>ProjectDocument['view']|undefined}>();
const session=inject(projectSessionKey)!;
const input=shallowRef<HTMLInputElement|null>(null),openDialog=shallowRef<HTMLDialogElement|null>(null),saveDialog=shallowRef<HTMLDialogElement|null>(null);
const state=ref<'ready'|'reading'|'opening'|'error'>('ready'),message=ref(''),error=ref(''),pendingName=ref('');
let epoch=0,alive=true,pendingText='',baseline:{session:string;revision:number}|null=null,saved:SaveSnapshot|null=null,afterSave:(()=>void)|undefined;
const unavailable=computed(()=>!props.ready||props.busy||state.value==='reading'||state.value==='opening');
function failure(cause:unknown):void {state.value='error';const e=cause as Error&{code?:string};error.value=`${e.code??'FILE_OPERATION_FAILED'}：${e.message??String(cause)}`;message.value='';}
function current():boolean {const snapshot=session.snapshot();return !!baseline&&snapshot.projectSessionId===baseline.session&&snapshot.revision===baseline.revision;}
function cancelOpen():void {epoch++;if(state.value==='opening')session.cancelPending();pendingText='';baseline=null;openDialog.value?.close();state.value='ready';error.value='';message.value='已取消打开，当前项目保留。';}
async function chosen(event:Event):Promise<void> {
  const field=event.target as HTMLInputElement,file=field.files?.[0];field.value='';if(!file||unavailable.value)return;
  const token=++epoch,snapshot=session.snapshot();baseline={session:snapshot.projectSessionId,revision:snapshot.revision};state.value='reading';message.value='正在读取项目文件…';error.value='';
  try{
    const text=await readProjectFile(file);if(!alive||token!==epoch)return;
    if(!current())throw new DomainError('FILE_STALE','读取期间项目已变化，请重新打开');
    parseProjectJson(text);pendingText=text;pendingName.value=file.name;state.value='ready';
    if(session.snapshot().dirty){message.value='';openDialog.value?.showModal();}else await open();
  }catch(cause){if(alive&&token===epoch)failure(cause);}
}
async function open():Promise<void> {
  const token=epoch;if(!current()||props.busy){openDialog.value?.close();failure(new DomainError('FILE_STALE','当前项目已变化，请重新打开'));return;}
  state.value='opening';message.value='正在求解并重建项目…';error.value='';openDialog.value?.close();
  try{await session.openJson(pendingText);if(alive&&token===epoch){state.value='ready';message.value=`已打开 ${pendingName.value}，可继续编辑。`;pendingText='';baseline=null;}}
  catch(cause){if(alive&&token===epoch)failure(cause);}
}
function save(next?:()=>void):void {
  if(unavailable.value)return;error.value='';afterSave=next;
  try{
    const view=props.camera();if(!view)throw new DomainError('VIEWPORT_UNAVAILABLE','视口不可用，请恢复视口后保存');
    session.setView(view);const snapshot=session.captureSave(),text=serializeProject(snapshot.document);downloadProject(text,snapshot.document.name);saved=snapshot;
    state.value='ready';message.value='已发起下载；请确认文件已保存。';saveDialog.value?.showModal();
  }catch(cause){saved=null;afterSave=undefined;failure(cause);}
}
function acknowledge():void {
  if(!saved)return;const snapshot=saved,continuation=afterSave;saved=null;afterSave=undefined;saveDialog.value?.close();
  if(!session.markSaved(snapshot)){failure(new DomainError('FILE_STALE','项目已经切换，本次保存不标记新项目'));return;}
  message.value='已确认此快照保存。';
  if(continuation){if(session.snapshot().dirty)message.value='保存期间项目又有修改，请再次保存后新建。';else continuation();}
}
function keepDirty():void {saved=null;afterSave=undefined;saveDialog.value?.close();message.value='下载尚未确认，继续保留未保存标记。';}
onUnmounted(()=>{alive=false;cancelOpen();saved=null;afterSave=undefined;saveDialog.value?.close();});
defineExpose({save,cancelOpen});
</script>
<template>
  <span class="project-file-controls">
    <button type="button" :disabled="unavailable" @click="input?.click()">打开</button>
    <button type="button" :disabled="unavailable" @click="save()">保存</button>
    <input ref="input" type="file" accept=".tcad.json,application/json" aria-label="打开项目文件" hidden @change="chosen" />
    <button v-if="state==='reading'||state==='opening'" type="button" @click="cancelOpen">取消打开</button>
  </span>
  <p v-if="message" role="status" class="project-file-message" :data-file-status="state">{{message}}</p>
  <p v-if="error" role="alert" class="error-message" data-file-status="error">{{error}}。当前项目仍可继续编辑或保存。</p>
  <dialog ref="openDialog" class="project-dialog" aria-labelledby="open-dialog-title" @cancel.prevent="cancelOpen">
    <h2 id="open-dialog-title">打开将替换未保存的项目</h2><p>已读取“{{pendingName}}”。你可以取消并保存当前项目，或明确丢弃修改后打开。</p>
    <div><button type="button" autofocus @click="cancelOpen">取消打开</button><button type="button" @click="open">丢弃修改并打开</button></div>
  </dialog>
  <dialog ref="saveDialog" class="project-dialog" aria-labelledby="save-dialog-title" @cancel.prevent="keepDirty">
    <h2 id="save-dialog-title">确认下载文件已保存</h2><p>浏览器已发起 .tcad.json 下载，但页面无法确认磁盘写入结果。查看下载记录后，确认文件已保存；否则继续保留未保存标记。</p>
    <div><button type="button" autofocus @click="keepDirty">继续保留修改</button><button type="button" @click="acknowledge">确认文件已保存</button></div>
  </dialog>
</template>
