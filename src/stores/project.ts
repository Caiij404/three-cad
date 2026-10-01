import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { ProjectSnapshot } from '../app/project-session.ts';
export const useProjectStore=defineStore('project',()=>{
  const snapshot=shallowRef<ProjectSnapshot>();
  function publish(value:ProjectSnapshot):void {snapshot.value=value;}
  return {snapshot,publish};
});
