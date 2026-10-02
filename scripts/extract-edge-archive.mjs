// Read package resources and decompress them; no Edge installer is executed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
const directory=resolve('.research/browsers'), bytes=readFileSync(resolve(directory,'edge-installer.exe'));
const nt=bytes.readUInt32LE(0x3c),optional=nt+24,count=bytes.readUInt16LE(nt+6),sections=optional+bytes.readUInt16LE(nt+20);
const data=optional+(bytes.readUInt16LE(optional)===0x20b?112:96);
function raw(rva) {
  for(let i=0;i<count;i++) {
    const at=sections+i*40,start=bytes.readUInt32LE(at+12),size=Math.max(bytes.readUInt32LE(at+8),bytes.readUInt32LE(at+16));
    if(rva>=start&&rva<start+size)return rva-start+bytes.readUInt32LE(at+20);
  }
  throw Error('Edge PE resource address invalid');
}
const resources=raw(bytes.readUInt32LE(data+16));let payload;
function walk(offset,path=[]) {
  const count=bytes.readUInt16LE(offset+12)+bytes.readUInt16LE(offset+14);
  for(let i=0;i<count;i++) {
    const nameValue=bytes.readUInt32LE(offset+16+i*8),child=bytes.readUInt32LE(offset+20+i*8);
    let name=nameValue;
    if(nameValue&0x80000000) { const at=resources+(nameValue&0x7fffffff);name=bytes.subarray(at+2,at+2+2*bytes.readUInt16LE(at)).toString('utf16le'); }
    if(child&0x80000000)walk(resources+(child&0x7fffffff),[...path,name]);
    else if(path[0]==='B'&&path[1]===102) {
      const at=resources+child,start=raw(bytes.readUInt32LE(at)),size=bytes.readUInt32LE(at+4);
      if(start+size>bytes.length)throw Error('Edge resource truncated');
      payload=bytes.subarray(start,start+size);
    }
  }
}
walk(resources);if(!payload)throw Error('Edge compressed resource missing');
const rawDirectory=resolve(directory,'edge-raw'),browserDirectory=resolve(directory,'edge-154-browser');
mkdirSync(rawDirectory,{recursive:true});mkdirSync(browserDirectory,{recursive:true});
writeFileSync(resolve(directory,'edge-lzma.bin'),payload);
function command(executable,args) {
  const result=spawnSync(executable,args,{windowsHide:true,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error(`${executable}: ${result.error??result.stderr??result.stdout}`);
}
const seven=resolve(directory,'7zr.exe');
command(seven,['x',resolve(directory,'edge-lzma.bin'),`-o${rawDirectory}`,'-y']);
command(process.execPath,[resolve(directory,'bcj2-decoder.cjs'),resolve(rawDirectory,'edge-lzma'),resolve(directory,'edge-bundle.bin')]);
const bundle=readFileSync(resolve(directory,'edge-bundle.bin')),magic=Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c]);
const at=bundle.indexOf(magic);if(at<0)throw Error('Edge 7z payload missing');
const size=32+Number(bundle.readBigUInt64LE(at+12)+bundle.readBigUInt64LE(at+20));
if(size<32||at+size>bundle.length||crc32(bundle.subarray(at+12,at+32))!==bundle.readUInt32LE(at+8))throw Error('Edge 7z header invalid');
writeFileSync(resolve(directory,'edge-browser-decoded.7z'),bundle.subarray(at,at+size));
command(seven,['x',resolve(directory,'edge-browser-decoded.7z'),`-o${browserDirectory}`,'-y']);
command(seven,['x',resolve(browserDirectory,'MSEDGE.7z'),`-o${resolve(browserDirectory,'core')}`,'-y']);
console.log('Extracted official Edge browser payload without executing its installer.');
