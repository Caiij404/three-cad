<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { runMeshBooleanFixtures } from '../experiments/mesh-boolean-fixtures.ts';
const solver = new DocumentSolverClient(), solid = new SolidClient(), running = ref(false), error = ref('');
const evidence = shallowRef<Awaited<ReturnType<typeof runMeshBooleanFixtures>> | null>(null); let mounted = true;
onUnmounted(() => { mounted = false; solver.dispose(); solid.dispose(); });
async function run() {
  if (running.value) return; running.value = true; error.value = ''; evidence.value = null;
  try { const actual = await runMeshBooleanFixtures((input, revision) => solver.solve(input, revision), input => solid.run(input)); if (mounted) evidence.value = actual; }
  catch (cause) { if (mounted) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (mounted) running.value = false; }
}
</script>
<template>
  <section class="panel" aria-labelledby="mesh-boolean-title">
    <h2 id="mesh-boolean-title">T-301A · 两个真实实体网格的布尔</h2>
    <p>真实草图求解与拉伸提供输入；布尔直接裁剪世界坐标三角网格。检查三平面、A/B顺序、贯穿孔、empty和非流形拒绝。</p>
    <button type="button" :disabled="running" @click="run">{{ running ? '正在验证网格布尔…' : '运行真实网格布尔实验' }}</button>
    <p v-if="error" role="alert" class="error-message">{{ error }}。可以重新运行。</p>
    <div v-if="evidence"><p role="status">{{ evidence.cases.length }} 项布尔与 {{ evidence.invalid.length }} 项拒绝通过，错误后恢复成功。</p><details><summary>查看真实输入指标与结果</summary><pre data-testid="mesh-boolean-evidence">{{ JSON.stringify(evidence, null, 2) }}</pre></details></div>
    <p>工作区的A/B选择继续T-301B；空结果是明确的零三角形，不能作为下一次布尔的有效输入。</p>
  </section>
</template>
