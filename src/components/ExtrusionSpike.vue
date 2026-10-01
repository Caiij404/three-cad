<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { runExtrusionFixtures } from '../experiments/extrusion-fixtures.ts';
const solver = new DocumentSolverClient(), solid = new SolidClient(), running = ref(false), error = ref('');
const evidence = shallowRef<Awaited<ReturnType<typeof runExtrusionFixtures>> | null>(null); let mounted = true;
onUnmounted(() => { mounted = false; solver.dispose(); solid.dispose(); });
async function run(): Promise<void> {
  if (running.value) return;
  running.value = true; error.value = ''; evidence.value = null;
  try {
    const result = await runExtrusionFixtures((input, revision) => solver.solve(input, revision), input => solid.run(input));
    if (mounted) evidence.value = result;
  } catch (cause) { if (mounted) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (mounted) running.value = false; }
}
</script>
<template>
  <section class="panel" aria-labelledby="extrusion-title">
    <h2 id="extrusion-title">T-202C1 · 一般轮廓与有符号拉伸</h2>
    <p>先在真实求解器中确定草图，再由几何 Worker 三角化盖面、连接孔侧壁。正负深度均检查闭合、外向法线、包围盒与体积。</p>
    <button type="button" :disabled="running" @click="run">{{ running ? '正在验证拉伸…' : '运行一般拉伸实验' }}</button>
    <p v-if="error" role="alert" class="error-message">{{ error }}。可以重新运行。</p>
    <div v-if="evidence">
      <p role="status">{{ evidence.cases.length }} 项真实拉伸、{{ evidence.invalid.length }} 项明确拒绝通过；错误后恢复成功。</p>
      <p>40×30×10：12000 mm³；包含10×10孔：11000 mm³。曲线夹具允许1%体积误差，同时满足边界细分精度。</p>
      <details><summary>查看输入、网格指标与拒绝错误</summary><pre data-testid="extrusion-evidence">{{ JSON.stringify(evidence, null, 2) }}</pre></details>
    </div>
    <p>工作区已支持区域选择、预览、取消和提交；本实验专门核对几何数值。</p>
  </section>
</template>
