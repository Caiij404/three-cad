<script setup lang="ts">
import { inject, ref } from 'vue';
import { projectSessionKey } from '../app/project-context.ts';
import { projectStl } from '../app/project-stl.ts';
import { downloadBlob } from '../adapters/files/project-file.ts';
defineProps<{ready:boolean;busy:boolean;selectionIds:string[]}>();
const session=inject(projectSessionKey)!,message=ref(''),error=ref('');
function exportSelected(ids:string[]):void {
  error.value='';message.value='';
  try{const file=projectStl(session.snapshot(),session.derivedCache,ids);downloadBlob(file.buffer,file.name,'model/stl','STL_DOWNLOAD_FAILED');message.value=`已发起 ${file.name} 下载。`;}
  catch(cause){const e=cause as Error&{code?:string};error.value=`${e.code??'STL_EXPORT_FAILED'}：${e.message??String(cause)}`;}
}
</script>
<template>
  <button type="button" :disabled="!ready||busy" title="选择单个非空实体；计算期间请等待或取消" aria-describedby="stl-unit" @click="exportSelected(selectionIds)">导出 STL</button>
  <p v-if="message" role="status" class="project-file-message" data-stl-status="ready">{{message}}</p>
  <p v-if="error" role="alert" class="error-message" data-stl-status="error">{{error}}。项目数据保留，可调整选择后重试。</p>
</template>
