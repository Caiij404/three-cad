<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { BooleanOperation } from '../core/mesh-types.ts';
const props = defineProps<{ solids: Array<{ id: string; name: string; visible: boolean }>; initialIds: string[]; commit: (operation: BooleanOperation, a: string, b: string) => Promise<void> }>();
const emit = defineEmits<{ cancel: []; select: [ids: string[]]; submitting: [value: boolean] }>();
const a = ref(props.initialIds[0] ?? ''), b = ref(props.initialIds[1] ?? ''), operation = ref<BooleanOperation>('union'), running = ref(false), error = ref(''); let alive = true;
const valid = computed(() => a.value !== b.value && props.solids.some(s => s.id === a.value) && props.solids.some(s => s.id === b.value));
watch([a, b], () => { error.value = ''; emit('select', [a.value, b.value].filter(Boolean)); }, { immediate: true });
onUnmounted(() => { alive = false; });
function swap() { [a.value, b.value] = [b.value, a.value]; }
async function confirm() {
  if (!valid.value || running.value) return; running.value = true; error.value = ''; emit('submitting', true);
  try { await props.commit(operation.value, a.value, b.value); }
  catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (alive) { running.value = false; emit('submitting', false); } }
}
</script>
<template>
  <section class="boolean-panel" aria-label="布尔运算" :data-boolean-status="running ? 'submitting' : error ? 'error' : 'choosing'">
    <h3>布尔运算</h3>
    <p>选择两个非空有效实体。差集为 A − B；成功后隐藏输入，来源仍保留。</p>
    <form @submit.prevent="confirm">
      <label>主体 A<select v-model="a" aria-label="布尔主体 A" :disabled="running"><option value="">请选择主体</option><option v-for="s in solids" :key="s.id" :value="s.id">{{ s.name }}{{ s.visible ? '' : '（隐藏）' }}</option></select></label>
      <label>工具 B<select v-model="b" aria-label="布尔工具 B" :disabled="running"><option value="">请选择工具</option><option v-for="s in solids" :key="s.id" :value="s.id">{{ s.name }}{{ s.visible ? '' : '（隐藏）' }}</option></select></label>
      <button type="button" :disabled="running" @click="swap">交换 A/B</button>
      <label>操作<select v-model="operation" aria-label="布尔操作" :disabled="running"><option value="union">并集 · A ∪ B</option><option value="subtract">差集 · A − B</option><option value="intersect">交集 · A ∩ B</option></select></label>
      <p v-if="!valid">请选择两个不同的非空实体。</p>
      <p v-if="running" role="status">正在计算布尔；可以取消。</p>
      <p v-if="error" role="alert" class="error-message">{{ error }}。当前项目与输入可见性保持不变，可以修改操作后重试。</p>
      <div class="feature-actions"><button type="submit" :disabled="running || !valid">确认布尔</button><button type="button" @click="emit('cancel')">取消布尔</button></div>
    </form>
  </section>
</template>
