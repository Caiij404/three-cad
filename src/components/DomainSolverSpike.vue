<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue';
import { DocumentSolverClient } from '../adapters/solver/document-solver-client.ts';
import { runDomainSolverFixtures } from '../experiments/domain-solver-fixtures.ts';
import { runDomainTransactionFixture } from '../experiments/domain-transaction-fixture.ts';
const client=new DocumentSolverClient(),running=ref(false),error=ref('');
const cases=shallowRef<Awaited<ReturnType<typeof runDomainSolverFixtures>>>([]);
const transaction=shallowRef<Awaited<ReturnType<typeof runDomainTransactionFixture>>|null>(null);
let mounted=true;
onUnmounted(()=>{mounted=false;client.dispose();});
async function run():Promise<void>{
  if(running.value)return;running.value=true;error.value='';cases.value=[];transaction.value=null;
  try{
    const result=await runDomainSolverFixtures(input=>client.solve(input));
    const atomic=await runDomainTransactionFixture((input,revision)=>client.solve(input,revision));
    if(mounted){cases.value=result;transaction.value=atomic;}
  }
  catch(cause){if(mounted)error.value=cause instanceof Error?cause.message:String(cause);}
  finally{if(mounted)running.value=false;}
}
</script>
<template>
  <section class="panel" aria-labelledby="domain-solver-title">
    <h2 id="domain-solver-title">T-104A · 领域草图与真实求解</h2>
    <p>把稳定 ID 映射为临时 handle，求解圆、圆弧、矩形和显式重合关系，再独立检查返回坐标。</p>
    <button class="experiment-action" type="button" :disabled="running" @click="run">{{running?'正在求解领域草图…':'运行领域草图求解'}}</button>
    <p v-if="error" class="error-message" role="alert">{{error}}。可以重新运行。</p>
    <div v-if="cases.length" class="solver-results" aria-label="领域求解实验结果"><p role="status">{{cases.length}} 项领域草图检查通过</p>
      <ul><li v-for="item in cases" :key="item.id">{{item.id}} · {{item.result.status}} · 真实 DOF {{item.result.dof}}</li></ul>
      <details><summary>查看领域输入、输出与残差</summary><pre data-testid="domain-solver-evidence">{{JSON.stringify(cases,null,2)}}</pre></details>
      <details v-if="transaction"><summary>查看真实 Worker 事务与撤销</summary><pre data-testid="domain-transaction-evidence">{{JSON.stringify(transaction,null,2)}}</pre></details>
    </div>
    <p>绘制 UI 与完整 P0 约束仍待后续；未支持的约束明确拒绝。</p>
  </section>
</template>
