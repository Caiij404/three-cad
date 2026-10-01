import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { initialWorkspaceState, transitionWorkspace, type WorkspaceEvent } from '../app/workspace-state.ts';

export const useWorkspaceStore=defineStore('workspace',()=>{
  const state=ref(initialWorkspaceState());
  const treeCollapsed=ref(false),propertiesCollapsed=ref(false);
  const ready=computed(()=>state.value.computation==='ready');
  function dispatch(event:WorkspaceEvent):void { state.value=transitionWorkspace(state.value,event); }
  return {state,treeCollapsed,propertiesCollapsed,ready,dispatch};
});
