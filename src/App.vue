<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { projectSessionKey, projectRecoveryKey } from './app/project-context.ts';
import M0Experiments from './components/M0Experiments.vue';
import Workspace from './components/Workspace.vue';
const view=ref(new URLSearchParams(window.location.search).get('view')==='experiments'?'experiments':'workspace');
const session=inject(projectSessionKey)!;
const recovery=inject(projectRecoveryKey)!;
function beforeUnload(event:BeforeUnloadEvent):void {if(session.snapshot().dirty){event.preventDefault();event.returnValue='';}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
onUnmounted(()=>{window.removeEventListener('beforeunload',beforeUnload);recovery.dispose();session.dispose();});
</script>
<template>
  <nav class="app-navigation" aria-label="项目入口">
    <span class="app-brand">THREE CAD <span>学习项目</span></span>
    <button type="button" :aria-pressed="view==='workspace'" @click="view='workspace'">工作区</button>
    <button type="button" :aria-pressed="view==='experiments'" @click="view='experiments'">技术实验</button>
  </nav>
  <Workspace v-if="view==='workspace'" />
  <M0Experiments v-else />
</template>
