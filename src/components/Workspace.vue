<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useWorkspaceStore } from '../stores/workspace.ts';
import { KernelBootstrap } from '../app/kernel-bootstrap.ts';
import { projectSessionKey } from '../app/project-context.ts';
import { useProjectStore } from '../stores/project.ts';
const ui=useWorkspaceStore();
const project=useProjectStore();
const session=inject(projectSessionKey)!;
const nameDraft=ref(''),projectError=ref('');
const newDialog=shallowRef<HTMLDialogElement|null>(null);
let unsubscribe:()=>void=()=>{};
const kernels=new KernelBootstrap();
let mounted=true;
async function load():Promise<void> {
  ui.dispatch({type:'load'});
  const generation=ui.state.generation;
  try{await kernels.probe();if(mounted)ui.dispatch({type:'loaded',generation});}
  catch(cause){if(mounted)ui.dispatch({type:'load-failed',generation,message:cause instanceof Error?cause.message:String(cause)});}
}
function keydown(event:KeyboardEvent):void {
  if(newDialog.value?.open)return;
  const target=event.target;
  if(target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))return;
  if(event.key==='Escape'){ui.dispatch({type:'cancel'});event.preventDefault();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z' && ui.ready){event.preventDefault();event.shiftKey?redo():undo();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y' && ui.ready){event.preventDefault();redo();}
}
onMounted(()=>{
  unsubscribe=session.subscribe(snapshot=>{project.publish(snapshot);nameDraft.value=snapshot.document.name;});
  void load();window.addEventListener('keydown',keydown);
});
onUnmounted(()=>{mounted=false;unsubscribe();kernels.dispose();window.removeEventListener('keydown',keydown);});
async function rename():Promise<void> {
  if(!ui.ready)return;projectError.value='';
  try{await session.execute({kind:'rename-project',name:nameDraft.value.trim()});}
  catch(cause){projectError.value=cause instanceof Error?cause.message:String(cause);}
}
function undo():void {if(!ui.ready||!project.snapshot?.canUndo)return;session.undo();projectError.value='';}
function redo():void {if(!ui.ready||!project.snapshot?.canRedo)return;session.redo();projectError.value='';}
function reset():void {session.newProject();ui.dispatch({type:'mode',mode:'model.select'});projectError.value='';newDialog.value?.close();}
function requestNew():void {if(!ui.ready||project.snapshot?.busy)return;if(project.snapshot?.dirty)newDialog.value?.showModal();else reset();}
const fileActions=['打开','保存','导出 STL'];
const tools=['线段','矩形','圆','圆弧','约束','完成草图','拉伸','布尔'];
</script>
<template>
  <main class="workspace" aria-label="CAD 工作区" :data-computation="ui.state.computation" :data-project-id="project.snapshot?.document.id">
    <header class="workspace-header">
      <div><h1>{{project.snapshot?.document.name ?? '未命名项目'}}</h1><p>单位 mm · Z 向上 · {{project.snapshot?.dirty?'未保存的修改':'未修改'}}</p></div>
      <div class="file-actions" aria-label="文件与历史">
        <button type="button" :disabled="!ui.ready||project.snapshot?.busy" @click="requestNew">新建</button>
        <button v-for="action in fileActions" :key="action" type="button" disabled :title="`${action}尚未实现`" aria-describedby="file-unavailable">{{action}}</button>
        <button type="button" :disabled="!ui.ready||!project.snapshot?.canUndo" @click="undo">撤销</button>
        <button type="button" :disabled="!ui.ready||!project.snapshot?.canRedo" @click="redo">重做</button>
      </div>
      <p id="file-unavailable" class="unavailable-note">打开、保存与 STL 导出尚未实现；当前修改保留在页面内。</p>
    </header>
    <div class="workspace-tools" role="toolbar" aria-label="建模工具">
      <button type="button" :disabled="!ui.ready" @click="ui.dispatch({type:'mode',mode:'model.select'})" aria-pressed="true">选择</button>
      <button v-for="tool in tools" :key="tool" type="button" disabled :title="`${tool}尚未实现`" aria-describedby="tools-unavailable">{{tool}}</button>
      <span id="tools-unavailable">绘制与特征编辑尚未实现。</span>
    </div>
    <div class="workspace-body" :class="{'tree-collapsed':ui.treeCollapsed,'properties-collapsed':ui.propertiesCollapsed}">
      <aside class="feature-panel" aria-label="特征树">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.treeCollapsed" @click="ui.treeCollapsed=!ui.treeCollapsed">{{ui.treeCollapsed?'展开特征树':'折叠特征树'}}</button>
        <div v-if="!ui.treeCollapsed"><h2>特征树</h2><p v-if="!project.snapshot?.document.features.length" class="empty-message">暂无特征</p><ul v-else><li v-for="feature in project.snapshot.document.features" :key="feature.id">{{feature.name}}</li></ul><p>创建草图后，特征会按依赖显示在这里。</p></div>
      </aside>
      <section class="viewport-placeholder" aria-label="建模视口">
        <div v-if="ui.state.computation==='loading'" class="workspace-overlay" role="status"><h2>正在加载几何内核</h2><p>正在检查真实求解器与实体运算。</p></div>
        <div v-else-if="ui.state.computation==='error'" class="workspace-overlay" role="alert"><h2>几何内核加载失败</h2><p>请检查资源加载情况后重试。</p><details><summary>查看具体原因</summary><pre>{{ui.state.error}}</pre></details><button type="button" @click="load">重试加载</button></div>
        <div v-else class="workspace-overlay"><h2>工作区已就绪</h2><p>真实几何内核已加载。视口与绘制工具开发中。</p><span class="badge">空工作区 · 暂无几何</span></div>
      </section>
      <aside class="property-panel" aria-label="属性面板">
        <button class="panel-toggle" type="button" :aria-expanded="!ui.propertiesCollapsed" @click="ui.propertiesCollapsed=!ui.propertiesCollapsed">{{ui.propertiesCollapsed?'展开属性':'折叠属性'}}</button>
        <div v-if="!ui.propertiesCollapsed"><h2>属性</h2>
          <form class="project-properties" @submit.prevent="rename">
            <label for="project-name">项目名称</label><input id="project-name" v-model="nameDraft" maxlength="200" :disabled="!ui.ready||project.snapshot?.busy" />
            <button type="submit" :disabled="!ui.ready||project.snapshot?.busy||nameDraft===project.snapshot?.document.name">应用名称</button>
          </form>
          <p v-if="projectError" role="alert" class="error-message">{{projectError}}</p>
          <p class="empty-message">未选择对象</p><p>选择草图或实体后显示参数与约束。</p>
        </div>
      </aside>
    </div>
    <footer class="workspace-status" role="status"><span>{{ui.state.computation==='ready'?'内核就绪':ui.state.computation==='error'?'加载失败':'正在加载'}} · 选择 · revision {{project.snapshot?.revision ?? 0}}</span><span>mm · {{ui.state.selectionIds.length}} 个对象选中</span></footer>
    <p class="narrow-layout-hint">当前为窄屏布局，完整建模面向桌面宽屏。</p>
    <dialog ref="newDialog" class="project-dialog" aria-labelledby="new-dialog-title">
      <h2 id="new-dialog-title">当前项目有未保存的修改</h2><p>新建会丢弃当前项目。你可以取消并继续编辑。</p>
      <p id="save-new-reason">保存功能尚未实现，暂不能保存后新建。</p>
      <div><button type="button" @click="newDialog?.close()">取消</button><button type="button" disabled aria-describedby="save-new-reason">保存后新建</button><button type="button" @click="reset">丢弃修改并新建</button></div>
    </dialog>
  </main>
</template>
