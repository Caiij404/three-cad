<script setup lang="ts">
import { ref, version } from 'vue';

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

    <section class="panel" aria-labelledby="next-title">
      <h2 id="next-title">下一步技术验证</h2>
      <ul class="validation-list">
        <li>
          <div>
            <h3>T-003 · 真实约束求解</h3>
            <p id="solver-reason">SolveSpace WASM 尚未构建或接入。</p>
          </div>
          <button type="button" disabled aria-describedby="solver-reason">运行求解</button>
        </li>
        <li>
          <div>
            <h3>T-004 · 网格 CSG</h3>
            <p id="csg-reason">实体适配器与几何夹具尚未接入。</p>
          </div>
          <button type="button" disabled aria-describedby="csg-reason">运行 CSG</button>
        </li>
      </ul>
    </section>

    <footer>当前只验证工程运行链，求解、拉伸、布尔、保存与 STL 尚未实现。</footer>
  </main>
</template>
