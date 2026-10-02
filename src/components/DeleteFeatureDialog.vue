<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
const props = defineProps<{
  name: string;
  affected: Array<{ id: string; name: string; kind: string }>;
  commit: () => Promise<void>;
}>();
const emit = defineEmits<{ cancel: [] }>();
const dialog = shallowRef<HTMLDialogElement | null>(null);
const running = ref(false), error = ref('');
let alive = true;
onMounted(() => dialog.value?.showModal());
onUnmounted(() => { alive = false; dialog.value?.close(); });
async function confirm() {
  if (running.value) return;
  running.value = true; error.value = '';
  try { await props.commit(); }
  catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (alive) running.value = false; }
}
</script>
<template>
  <dialog ref="dialog" class="project-dialog delete-feature-dialog" aria-labelledby="delete-feature-title" @cancel.prevent="emit('cancel')">
    <h2 id="delete-feature-title">删除来源会影响后代</h2>
    <p>“{{ name }}”仍被引用，当前尚未删除。只有明确选择级联删除，才会同时删除以下 {{ affected.length }} 个后代。</p>
    <ul>
      <li v-for="f in affected" :key="f.id" :data-delete-affected-id="f.id">{{ f.name }} · {{ f.kind === 'extrude' ? '拉伸' : f.kind === 'boolean' ? '布尔' : '草图' }}</li>
    </ul>
    <p>级联删除是一次操作，可以撤销。</p>
    <p v-if="error" role="alert" class="error-message">{{ error }}</p>
    <div>
      <button type="button" autofocus @click="emit('cancel')">取消删除</button>
      <button type="button" :disabled="running" @click="confirm">{{ running ? '正在删除…' : '级联删除来源及后代' }}</button>
    </div>
  </dialog>
</template>
