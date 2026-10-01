<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { runTangentFixtures, runTangentTransaction } from '../experiments/tangent-fixtures.ts';
const client = new DocumentSolverClient(), running = ref(false), error = ref('');
const fixtures = shallowRef<Awaited<ReturnType<typeof runTangentFixtures>> | null>(null);
const transaction = shallowRef<Awaited<ReturnType<typeof runTangentTransaction>> | null>(null);
let mounted = true;
onUnmounted(() => { mounted = false; client.dispose(); });
async function run() {
  if (running.value) return;
  running.value = true; error.value = ''; fixtures.value = null; transaction.value = null;
  try {
    const result = await runTangentFixtures(input => client.solve(input));
    const atomic = await runTangentTransaction((input, revision) => client.solve(input, revision));
    if (mounted) { fixtures.value = result; transaction.value = atomic; }
  } catch (cause) { if (mounted) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (mounted) running.value = false; }
}
</script>
<template>
  <section class="panel" aria-labelledby="tangent-title">
    <h2 id="tangent-title">T-201B2 · 有限几何相切</h2>
    <p>线、圆和圆弧先求共同接触，再用返回坐标检查线段和弧范围。接触辅助点只存在于真实求解适配层。</p>
    <button type="button" :disabled="running" @click="run">{{ running ? '正在验证相切…' : '运行全组合相切' }}</button>
    <p v-if="error" role="alert" class="error-message">{{ error }}。可以重新运行。</p>
    <div v-if="fixtures">
      <p role="status">{{ fixtures.cases.length }} 项真实相切通过；{{ fixtures.refused.length }} 项范围候选被拒绝</p>
      <details><summary>查看各组合的输入、DOF和接触位置</summary><pre data-testid="tangent-evidence">{{ JSON.stringify(fixtures, null, 2) }}</pre></details>
      <details v-if="transaction"><summary>查看半径修改、撤销与失败回滚</summary><pre data-testid="tangent-transaction-evidence">{{ JSON.stringify(transaction, null, 2) }}</pre></details>
    </div>
    <p>共心初值需要先移动圆心。完整约束面板与 REQ-005 回归继续 T-201C。</p>
  </section>
</template>
