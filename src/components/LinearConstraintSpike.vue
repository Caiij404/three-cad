<script setup lang="ts">
import {onUnmounted,ref,shallowRef} from 'vue';
import {DocumentSolverClient} from '../adapters/solver/document-solver-client.ts';
import {runLinearConstraintFixtures,runAngleTransactionFixture} from '../experiments/linear-constraint-fixtures.ts';
const client=new DocumentSolverClient(),running=ref(false),error=ref(''),cases=shallowRef<Awaited<ReturnType<typeof runLinearConstraintFixtures>>>([]),transaction=shallowRef<Awaited<ReturnType<typeof runAngleTransactionFixture>>|null>(null);let mounted=true;
onUnmounted(()=>{mounted=false;client.dispose();});
async function run():Promise<void>{if(running.value)return;running.value=true;error.value='';cases.value=[];transaction.value=null;
  try{const result=await runLinearConstraintFixtures(input=>client.solve(input)),atomic=await runAngleTransactionFixture((input,revision)=>client.solve(input,revision));if(mounted){cases.value=result;transaction.value=atomic;}}
  catch(cause){if(mounted)error.value=cause instanceof Error?cause.message:String(cause);}
  finally{if(mounted)running.value=false;}}
</script>
<template>
  <section class="panel" aria-labelledby="linear-constraint-title"><h2 id="linear-constraint-title">T-201A · 方向、角度与相等</h2>
    <p>领域角度使用 radians，适配层转换成 native degrees；从求解后的方向向量独立检查残差。equal 分别验证线长与圆/圆弧半径。</p>
    <button type="button" :disabled="running" @click="run">{{running?'正在求解方向约束…':'运行方向与相等约束'}}</button>
    <p v-if="error" role="alert" class="error-message">{{error}}。可以重新运行。</p>
    <div v-if="cases.length"><p role="status">{{cases.length}} 项真实检查通过</p><ul><li v-for="item in cases" :key="item.id">{{item.id}} · {{item.result.status}} · DOF {{item.result.dof}}</li></ul><details><summary>查看方向、单位与残差</summary><pre data-testid="linear-constraint-evidence">{{JSON.stringify(cases,null,2)}}</pre></details><details v-if="transaction"><summary>查看60°→120°及冲突事务</summary><pre data-testid="angle-transaction-evidence">{{JSON.stringify(transaction,null,2)}}</pre></details></div>
    <p>相切组合见下方实验；完整约束面板与验收已交付，本实验专门展示方向与相等的原生语义。</p>
  </section>
</template>
