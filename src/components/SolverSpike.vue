<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { SolverClient } from '../adapters/solver/solver-client.ts';
import { runSolverFixtures, type SolverCaseEvidence } from '../experiments/solver-fixtures.ts';

let client: SolverClient | undefined;
const running = ref(false);
const error = ref('');
const cases = shallowRef<SolverCaseEvidence[]>([]);
onMounted(() => { client = new SolverClient(); });
onUnmounted(() => client?.dispose());
async function run(): Promise<void> {
  if (!client || running.value) return;
  running.value = true; error.value = ''; cases.value = [];
  try { cases.value = await runSolverFixtures(input => client!.solve(input)); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { running.value = false; }
}
</script>

<template>
  <section class="panel" aria-labelledby="solver-title">
    <h2 id="solver-title">T-003 · 真实 WASM 求解</h2>
    <p>将确定的几何夹具送入 Worker，再用输出坐标独立检查尺寸与相切残差。</p>
    <button class="experiment-action" type="button" :disabled="running" @click="run">
      {{ running ? '正在求解…' : '运行真实求解实验' }}
    </button>
    <p v-if="error" class="error-message" role="alert">{{ error }}。可重新运行实验。</p>
    <div v-if="cases.length" class="solver-results" aria-label="求解实验结果">
      <p role="status">{{ cases.length }} 项真实求解检查通过</p>
      <ul>
        <li v-for="item in cases" :key="item.id">
          <strong>{{ item.id }}</strong> · {{ item.result.status }} · DOF {{ item.result.dof }}
        </li>
      </ul>
      <details>
        <summary>查看输入预期、实际坐标与残差</summary>
        <pre data-testid="solver-evidence">{{ JSON.stringify(cases, null, 2) }}</pre>
      </details>
    </div>
  </section>
</template>
