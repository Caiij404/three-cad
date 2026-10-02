<script setup lang="ts">
import { inject, onMounted, onUnmounted, shallowRef } from 'vue';
import { projectRecoveryKey, projectSessionKey } from '../app/project-context.ts';
const props=defineProps<{ready:boolean;busy:boolean}>();
const recovery=inject(projectRecoveryKey)!,session=inject(projectSessionKey)!;
const state=shallowRef(recovery.snapshot()),dialog=shallowRef<HTMLDialogElement|null>(null);
let unsubscribe=()=>{};
function restore():void {if(!props.ready||props.busy)return;if(session.snapshot().dirty)dialog.value?.showModal();else void recovery.restore();}
function confirm():void {dialog.value?.close();if(props.ready&&!props.busy)void recovery.restore();}
onMounted(()=>{unsubscribe=recovery.subscribe(value=>{state.value=value;if(!value.candidate)dialog.value?.close();});});
onUnmounted(()=>{unsubscribe();dialog.value?.close();});
</script>
<template>
  <section class="project-recovery" aria-label="自动恢复" :data-recovery-state="state.phase">
    <p v-if="state.error" role="alert" class="error-message">{{state.error}}。自动恢复失败，当前项目仍可手动下载保存。</p>
    <p v-else role="status">{{state.message}}</p>
    <p v-if="state.candidate">恢复副本：{{state.candidate.name}} · {{state.candidate.savedAt}}</p>
    <div v-if="state.candidate&&state.phase!=='restoring'&&state.phase!=='discarding'">
      <button type="button" :disabled="!ready||busy" @click="restore">恢复项目</button>
      <button type="button" :disabled="busy" @click="recovery.discard()">放弃恢复副本</button>
    </div>
    <button v-if="state.phase==='restoring'" type="button" @click="recovery.cancelRestore()">取消恢复</button>
    <div v-if="state.phase==='error'&&!state.candidate">
      <button type="button" @click="recovery.retry()">重试自动恢复</button>
      <button type="button" @click="recovery.discard()">放弃恢复副本</button>
    </div>
  </section>
  <dialog ref="dialog" class="project-dialog" aria-labelledby="recovery-dialog-title">
    <h2 id="recovery-dialog-title">恢复将替换未保存的项目</h2><p>可以取消并保存当前项目，或明确丢弃修改后恢复副本。</p>
    <div><button type="button" autofocus @click="dialog?.close()">取消恢复</button><button type="button" @click="confirm">丢弃修改并恢复</button></div>
  </dialog>
</template>
