import { parentPort } from 'node:worker_threads';
// Execute the actual production solid Worker entry in a real Node worker; only bind its native port.
globalThis.postMessage=(value,transfer=[])=>{
  const buffer=value.output?.positions?.buffer,before=buffer?.byteLength;
  parentPort.postMessage(value,transfer);
  if(buffer)parentPort.postMessage({__transferDiagnostic:true,beforeBytes:before,afterBytes:buffer.byteLength});
};
await import('../../src/workers/solid.worker.ts');
parentPort.on('message',data=>globalThis.onmessage({data}));
