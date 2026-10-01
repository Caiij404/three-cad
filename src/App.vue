<script setup lang="ts">
import { inject, onUnmounted, ref } from 'vue';
import { projectSessionKey } from './app/project-context.ts';
import M0Experiments from './components/M0Experiments.vue';
import Workspace from './components/Workspace.vue';
const view=ref(new URLSearchParams(window.location.search).get('view')==='experiments'?'experiments':'workspace');
const session=inject(projectSessionKey)!;
onUnmounted(()=>session.dispose());
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
