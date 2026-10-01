<script setup lang="ts">
import { computed, inject, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { SketchFeature } from '../core/model/document.ts';
import type { SketchRegionCatalog } from '../core/geometry/sketch-regions.ts';
import { meshMetrics } from '../core/geometry/mesh-metrics.ts';
import { projectSessionKey } from '../app/project-context.ts';
import type { ExtrusionPreview, ExtrusionPreviewValue } from '../app/extrusion-preview.ts';
const props = defineProps<{ sketch: SketchFeature; catalog: SketchRegionCatalog }>();
const emit = defineEmits<{ preview: [value: ExtrusionPreviewValue | null]; cancel: []; committed: [id: string]; submitting: [value: boolean] }>();
const session = inject(projectSessionKey)!;
const selected = ref(props.catalog.regions.length === 1 ? props.catalog.regions[0]!.outer.id : ''), depth = ref('10');
const handle = shallowRef<ExtrusionPreview | null>(null), value = shallowRef<ExtrusionPreviewValue | null>(null);
const error = ref(''), status = ref<'choose' | 'pending' | 'ready' | 'error' | 'submitting'>('choose'); let epoch = 0, alive = true;
const region = computed(() => props.catalog.regions.find(r => r.outer.id === selected.value));
const metrics = computed(() => value.value ? meshMetrics(value.value.mesh) : null);
function stop(): void { epoch++; handle.value?.cancel(); handle.value = null; value.value = null; emit('preview', null); }
function begin(): void {
  stop(); error.value = ''; if (!region.value) { status.value = 'choose'; return; }
  const generation = epoch;
  try {
    handle.value = session.beginExtrusion(props.sketch.id, region.value.definition,
      next => { if (alive && generation === epoch) { value.value = next; status.value = next ? 'ready' : 'pending'; emit('preview', next); } },
      message => { if (alive && generation === epoch) { value.value = null; error.value = message; status.value = 'error'; emit('preview', null); } });
    update();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); status.value = 'error'; }
}
function update(): void {
  if (status.value === 'submitting') return;
  if (!handle.value) { begin(); return; }
  error.value = ''; status.value = 'pending'; handle.value.update(depth.value.trim() ? Number(depth.value) : NaN);
}
watch(selected, begin, { immediate: true }); watch(depth, update);
async function confirm(): Promise<void> {
  if (!handle.value || status.value !== 'ready') return;
  const generation = epoch; status.value = 'submitting'; emit('submitting', true);
  try {
    if (await handle.value.finish() && alive && generation === epoch) {
      const feature = session.snapshot().document.features.at(-1)!; emit('committed', feature.id);
    }
  } catch (cause) {
    if (alive && generation === epoch) { error.value = cause instanceof Error ? cause.message : String(cause); handle.value = null; status.value = 'error'; }
  } finally { if (alive && generation === epoch) emit('submitting', false); }
}
onUnmounted(() => { alive = false; stop(); });
</script>
<template>
  <section class="extrusion-panel" aria-label="拉伸预览" :data-extrusion-status="status">
    <h3>拉伸 · {{ sketch.name }}</h3>
    <p>沿草图法线拉伸，负数表示反方向。预览尚未写入项目。</p>
    <label>拉伸区域<select v-model="selected" aria-label="拉伸区域" :disabled="status === 'submitting'">
      <option value="" disabled>请选择一个区域</option>
      <option v-for="(r,index) in catalog.regions" :key="r.outer.id" :value="r.outer.id">区域 {{ index+1 }} · {{ r.areaMm2.toFixed(3) }} mm² · {{ r.holes.length }} 孔</option>
    </select></label>
    <label>深度 (mm)<input v-model="depth" aria-label="拉伸深度 (mm)" inputmode="decimal" :disabled="status === 'submitting'" /></label>
    <p v-if="status==='choose'">有多个材料区域，请先选择。</p>
    <p v-else-if="status==='pending'" role="status">正在生成临时网格…</p>
    <p v-else-if="status==='submitting'" role="status">正在提交 · Esc 可取消</p>
    <p v-if="metrics">体积 {{ metrics.signedVolume.toFixed(3) }} mm³ · {{ metrics.triangles }} 三角面</p>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div class="feature-actions"><button type="button" :disabled="!region || status==='submitting'" @click="begin">更新预览</button><button type="button" :disabled="status!=='ready'" @click="confirm">确认拉伸</button><button type="button" @click="emit('cancel')">取消拉伸</button></div>
    <details v-if="metrics"><summary>查看临时网格指标</summary><pre data-testid="extrusion-preview-metrics">{{ JSON.stringify({depth:value?.depth,...metrics},null,2) }}</pre></details>
  </section>
</template>
