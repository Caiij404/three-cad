import { DomainError } from '../../core/model/document.ts';

export async function readProjectFile(file:File):Promise<string> {
  if(file.size>10*1024*1024)throw new DomainError('FILE_TOO_LARGE','项目文件超过10 MiB');
  try{return await file.text();}catch{throw new DomainError('FILE_READ_FAILED','无法读取项目文件，请重选文件后重试');}
}
export function projectFilename(name:string,extension:'tcad.json'|'stl'='tcad.json'):string {
  const base=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,120)||'project';
  return `${base}.${extension}`;
}
/** A browser download handoff has no filesystem completion acknowledgement. */
export function downloadProject(text:string,name:string):void {
  downloadBlob(text,projectFilename(name),'application/json;charset=utf-8','FILE_DOWNLOAD_FAILED');
}
export function downloadBlob(data:BlobPart,name:string,mime:string,code='FILE_DOWNLOAD_FAILED'):void {
  let url:string|undefined;const anchor=document.createElement('a');
  try{
    url=URL.createObjectURL(new Blob([data],{type:mime}));anchor.href=url;anchor.download=name;
    anchor.hidden=true;document.body.append(anchor);anchor.click();
  }catch{throw new DomainError(code,'无法发起下载，请检查浏览器下载设置后重试');}
  finally{anchor.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url!),1000);}
}
