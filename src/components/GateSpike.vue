<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { runGate } from '../experiments/gate-runner.ts';
const running=ref(false),error=ref(''),result=shallowRef<Awaited<ReturnType<typeof runGate>>>();
async function run():Promise<void>{
  if(running.value)return;running.value=true;error.value='';result.value=undefined;
  try{result.value=await runGate();}catch(cause){error.value=cause instanceof Error?cause.message:String(cause);}
  finally{running.value=false;}
}
</script>
<template>
  <section class="panel" aria-labelledby="gate-title">
    <h2 id="gate-title">T-005 · 内核兼容与恢复</h2>
    <p>同时运行两内核，采样小夹具，并故意等待一次真实 10 秒超时后重建 Worker。</p>
    <button class="experiment-action" type="button" :disabled="running" @click="run">{{running?'正在验证，含 10 秒超时…':'运行兼容与恢复实验'}}</button>
    <p v-if="error" role="alert" class="error-message">{{error}}</p>
    <div v-if="result">
      <p role="status">两内核并行与超时恢复通过。小夹具采样不代表完整 CAD 性能验收。</p>
      <details><summary>查看兼容与恢复证据</summary><pre data-testid="gate-evidence">{{JSON.stringify(result,null,2)}}</pre></details>
    </div>
  </section>
</template>
