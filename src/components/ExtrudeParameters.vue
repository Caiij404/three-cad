<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { ExtrudeFeature, SketchFeature } from '../core/model/document.ts';
import { buildSketchRegions, type SketchRegionCatalog } from '../core/geometry/sketch-regions.ts';
const props = defineProps<{
  feature: ExtrudeFeature;
  source: SketchFeature;
  busy: boolean;
  commit: (feature: ExtrudeFeature) => Promise<void>;
}>();
const emit = defineEmits<{ cancel: [] }>();
const depth = ref(''), selected = ref(''), error = ref(''), running = ref(false);
const catalog = shallowRef<SketchRegionCatalog | null>(null);
let alive = true;
function sameIds(a: string[], b: string[]): boolean {
  const ordered = [...b].sort();
  return a.length === b.length && [...a].sort().every((id, i) => id === ordered[i]);
}
const region = computed(() => catalog.value?.regions.find(r => r.outer.id === selected.value));
const disabled = computed(() => props.busy || running.value);
function reset() {
  error.value = ''; depth.value = String(props.feature.depth);
  try {
    catalog.value = buildSketchRegions(props.source);
    selected.value = catalog.value.regions.find(r => sameIds(r.definition.outerEntityIds, props.feature.region.outerEntityIds))?.outer.id ?? '';
  }
  catch (cause) { catalog.value = null; selected.value = ''; error.value = cause instanceof Error ? cause.message : String(cause); }
}
watch(() => [props.feature, props.source], reset, { immediate: true });
onUnmounted(() => { alive = false; });
async function apply() {
  if (disabled.value || !region.value) return;
  error.value = ''; running.value = true;
  try {
    const value = depth.value.trim() ? Number(depth.value) : NaN;
    await props.commit({ ...structuredClone(props.feature), depth: value, region: structuredClone(region.value.definition) });
  } catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (alive) running.value = false; }
}
</script>
<template>
  <section class="extrusion-panel" aria-label="编辑拉伸参数" :data-extrude-edit-status="running ? 'submitting' : error ? 'error' : 'ready'">
    <h3>编辑现有拉伸</h3>
    <p>来源：{{ source.name }}。应用会保留当前特征ID并重算受影响后代。</p>
    <form @submit.prevent="apply">
      <label>区域
        <select v-model="selected" aria-label="现有拉伸区域" :disabled="disabled">
          <option value="">请选择区域</option>
          <option v-for="(r,index) in catalog?.regions ?? []" :key="r.outer.id" :value="r.outer.id">区域 {{ index+1 }} · {{ r.areaMm2.toFixed(3) }} mm² · {{ r.holes.length }} 孔</option>
        </select>
      </label>
      <label>有符号深度 (mm)
        <input v-model="depth" aria-label="现有拉伸深度 (mm)" inputmode="decimal" :disabled="disabled" />
      </label>
      <p v-if="running" role="status">正在重算；Esc或取消修改可放弃本次计算。</p>
      <p v-if="error" role="alert" class="error-message">{{ error }}。旧项目与历史保持不变。</p>
      <div class="feature-actions">
        <button type="submit" :disabled="disabled || !region">应用拉伸参数</button>
        <button type="button" @click="running ? emit('cancel') : reset()">取消修改</button>
      </div>
    </form>
  </section>
</template>
