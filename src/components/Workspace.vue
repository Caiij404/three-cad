<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useWorkspaceStore } from '../stores/workspace.ts';
import { KernelBootstrap } from '../app/kernel-bootstrap.ts';
const ui=useWorkspaceStore();
const kernels=new KernelBootstrap();
let mounted=true;
async function load():Promise<void> {
  ui.dispatch({type:'load'});
  const generation=ui.state.generation;
  try{await kernels.probe();if(mounted)ui.dispatch({type:'loaded',generation});}
  catch(cause){if(mounted)ui.dispatch({type:'load-failed',generation,message:cause instanceof Error?cause.message:String(cause)});}
}
function keydown(event:KeyboardEvent):void {
  const target=event.target;
  if(target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))return;
  if(event.key==='Escape'){ui.dispatch({type:'cancel'});event.preventDefault();}
}
onMounted(()=>{void load();window.addEventListener('keydown',keydown);});
onUnmounted(()=>{mounted=false;kernels.dispose();window.removeEventListener('keydown',keydown);});
const fileActions=['新建','打开','保存','撤销','重做','导出 STL'];
const tools=['线段','矩形','圆','圆弧','约束','完成草图','拉伸','布尔'];
</script>
<template>
  <main class="workspace" aria-label="CAD 工作区" :data-computation="ui.state.computation">
    <header class="workspace-header">
      <div><h1>未命名项目</h1><p>单位 mm · Z 向上</p></div>
      <div class="file-actions" aria-label="文件与历史">
        <button v-for="action in fileActions" :key="action" type="button" disabled :title="`${action}尚未实现`" aria-describedby="file-unavailable">{{action}}</button>
      </div>
      <p id="file-unavailable" class="unavailable-note">文件与历史操作尚未实现，暂不可用。</p>
    </header>
    <div class="workspace-tools" role="toolbar" aria-label="建模工具">
      <button type="button" :disabled="!ui.ready" @click="ui.dispatch({type:'mode',mode:'model.select'})" aria-pressed="true">选择</button>
      <button v-for="tool in tools" :key="tool" type="button" disabled :title="`${tool}尚未实现`" aria-describedby="tools-unavailable">{{tool}}</button>
      <span id="tools-unavailable">绘制与特征编辑尚未实现。</span>
    </div>
    <div class="workspace-body" :class="{'tree-collapsed':ui.treeCollapsed,'properties-collapsed':ui.propertiesCollapsed}">
      <aside class="feature-panel" aria-label="特征树">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.treeCollapsed" @click="ui.treeCollapsed=!ui.treeCollapsed">{{ui.treeCollapsed?'展开特征树':'折叠特征树'}}</button>
        <div v-if="!ui.treeCollapsed"><h2>特征树</h2><p class="empty-message">暂无特征</p><p>创建草图后，特征会按依赖显示在这里。</p></div>
      </aside>
      <section class="viewport-placeholder" aria-label="建模视口">
        <div v-if="ui.state.computation==='loading'" class="workspace-overlay" role="status"><h2>正在加载几何内核</h2><p>正在检查真实求解器与实体运算。</p></div>
        <div v-else-if="ui.state.computation==='error'" class="workspace-overlay" role="alert"><h2>几何内核加载失败</h2><p>请检查资源加载情况后重试。</p><details><summary>查看具体原因</summary><pre>{{ui.state.error}}</pre></details><button type="button" @click="load">重试加载</button></div>
        <div v-else class="workspace-overlay"><h2>工作区已就绪</h2><p>真实几何内核已加载。视口与绘制工具开发中。</p><span class="badge">空工作区 · 暂无几何</span></div>
      </section>
      <aside class="property-panel" aria-label="属性面板">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.propertiesCollapsed" @click="ui.propertiesCollapsed=!ui.propertiesCollapsed">{{ui.propertiesCollapsed?'展开属性':'折叠属性'}}</button>
        <div v-if="!ui.propertiesCollapsed"><h2>属性</h2><p class="empty-message">未选择对象</p><p>选择草图或实体后显示参数与约束。</p></div>
      </aside>
    </div>
    <footer class="workspace-status" role="status"><span>{{ui.state.computation==='ready'?'内核就绪':ui.state.computation==='error'?'加载失败':'正在加载'}} · 选择</span><span>mm · {{ui.state.selectionIds.length}} 个对象选中</span></footer>
    <p class="narrow-layout-hint">当前为窄屏布局，完整建模面向桌面宽屏。</p>
  </main>
</template>
