<script setup lang="ts">
import { ref, version } from 'vue';
import SolverSpike from './SolverSpike.vue';
import SolidSpike from './SolidSpike.vue';
import GateSpike from './GateSpike.vue';

const count = ref<number>(0);
</script>

<template>
  <main class="validation-page">
    <header>
      <p class="eyebrow">THREE CAD VUE / M0</p>
      <h1>工程启动验证</h1>
      <p class="intro">从一个可运行、可复现的工程开始，逐步验证参数化建模所需的技术。</p>
    </header>

    <section class="panel" aria-labelledby="runtime-title">
      <div class="section-heading">
        <h2 id="runtime-title">Vue 已启动</h2>
        <span class="badge">Vue {{ version }}</span>
      </div>
      <p>这是 Vue 3 SFC + TypeScript 的最小验证页。完整草图编辑器将在 M0 通过后开发。</p>
      <div class="counter-experiment">
        <div>
          <p class="label">响应式实验</p>
          <p>点击按钮，观察状态如何更新页面。</p>
        </div>
        <output aria-label="实验计数" aria-live="polite">{{ count }}</output>
        <button type="button" @click="count += 1">计数 +1</button>
      </div>
    </section>

    <SolverSpike />
    <SolidSpike />
    <GateSpike />

    <section class="panel" aria-labelledby="next-title">
      <h2 id="next-title">下一步技术验证</h2>
      <ul class="validation-list">
        <li>
          <div>
            <h3>草图编辑</h3>
            <p id="sketch-reason">视口与绘制工具尚未实现。</p>
          </div>
          <button type="button" disabled aria-describedby="sketch-reason">绘制草图</button>
        </li>
      </ul>
    </section>

    <footer>当前为 M0 技术实验页，完整草图编辑、拉伸、布尔、保存与 STL 尚未实现。</footer>
  </main>
</template>
