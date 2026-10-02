import { DomainError } from '../../core/model/document.ts';
export interface RecoveryRecord {recoveryVersion:1;savedAt:string;text:string}
export interface RecoveryStore {read():Promise<unknown>;write(record:RecoveryRecord):Promise<void>;clear():Promise<void>}
const databaseName='three-cad-vue',storeName='recovery',key='last-project';
function storageError(cause:unknown):DomainError {
  if(cause instanceof DomainError)return cause;
  const name=(cause as {name?:string})?.name;
  return new DomainError(name==='QuotaExceededError'?'RECOVERY_QUOTA':'RECOVERY_STORAGE_FAILED',name==='QuotaExceededError'?'自动恢复空间不足':'自动恢复存储不可用');
}
/** Each operation closes its connection; success means transaction complete, not request success. */
export class IndexedDbRecoveryStore implements RecoveryStore {
  private connect():Promise<IDBDatabase> {
    return new Promise((resolve,reject)=>{
      let request:IDBOpenDBRequest,finished=false;
      const fail=(cause:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);reject(storageError(cause));};
      const timer=setTimeout(()=>fail(new DomainError('RECOVERY_STORAGE_TIMEOUT','自动恢复存储连接超时')),10000);
      try{request=indexedDB.open(databaseName,1);}catch(cause){fail(cause);return;}
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName);};
      request.onerror=()=>fail(request.error);
      request.onblocked=()=>fail(new DomainError('RECOVERY_STORAGE_BLOCKED','自动恢复存储被其他页面阻塞，请关闭其他项目页面后重试'));
      request.onsuccess=()=>{const db=request.result;if(finished){db.close();return;}finished=true;clearTimeout(timer);db.onversionchange=()=>db.close();resolve(db);};
    });
  }
  private async operation(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest):Promise<unknown> {
    const db=await this.connect();
    return new Promise((resolve,reject)=>{
      let transaction:IDBTransaction|undefined,request:IDBRequest|undefined,finished=false;
      const end=(cause?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);db.close();cause?reject(storageError(cause)):resolve(request?.result);};
      const timer=setTimeout(()=>{try{transaction?.abort();}catch{/* Already completed. */}end(new DomainError('RECOVERY_STORAGE_TIMEOUT','自动恢复存储事务超时'));},10000);
      try{
        transaction=db.transaction(storeName,mode,{durability:'strict'});
        transaction.oncomplete=()=>end();transaction.onabort=()=>end(transaction?.error??new DomainError('RECOVERY_STORAGE_ABORTED','自动恢复存储事务已中止'));
        request=action(transaction.objectStore(storeName));
      }catch(cause){try{transaction?.abort();}catch{/* No active transaction. */}end(cause);}
    });
  }
  read():Promise<unknown>{return this.operation('readonly',store=>store.get(key));}
  async write(record:RecoveryRecord):Promise<void>{await this.operation('readwrite',store=>store.put(record,key));}
  async clear():Promise<void>{await this.operation('readwrite',store=>store.delete(key));}
}
