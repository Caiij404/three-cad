<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { runSolidFixtures, type SolidEvidence } from '../experiments/solid-fixtures.ts';
let client:SolidClient|undefined;
const running=ref(false),error=ref(''),cases=shallowRef<SolidEvidence[]>([]);
onUnmounted(()=>client?.dispose());
async function run():Promise<void> {
  if(running.value)return;
  running.value=true;error.value='';cases.value=[];
  try { client ??= new SolidClient();cases.value=await runSolidFixtures(input=>client!.run(input)); }
  catch(cause){error.value=cause instanceof Error?cause.message:String(cause);}
  finally{running.value=false;}
}
</script>
<template>
  <section class="panel" aria-labelledby="solid-title">
    <h2 id="solid-title">T-004 · 真实 CSG 与孔洞网格</h2>
    <p>在 Worker 计算固定方块和孔洞夹具，以体积、包围盒、边与顶点邻接验证结果。</p>
    <button class="experiment-action" type="button" :disabled="running" @click="run">
      {{running ? '正在计算…' : '运行真实几何实验'}}
    </button>
    <p v-if="error" class="error-message" role="alert">{{error}}。可重试实验。</p>
    <div v-if="cases.length" class="solver-results">
      <p role="status">{{cases.length}} 项真实几何检查通过</p>
      <ul><li v-for="item in cases" :key="item.id"><strong>{{item.id}}</strong> · {{item.actual.signedVolume}} mm³ · {{item.actual.triangles}} 三角形</li></ul>
      <details><summary>查看输入、独立体积与闭合性</summary><pre data-testid="solid-evidence">{{JSON.stringify(cases,null,2)}}</pre></details>
    </div>
  </section>
</template>
