import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { launchBrowserUi, pause } from './browser-ui-port.mjs';
import { BrowserBidi } from './browser-bidi-port.mjs';
import { change, documentData, feature, objects, open, ready, save } from './e2e-ui-steps.mjs';
import { performanceCsgFixture } from '../src/experiments/performance-fixtures.ts';
import { serializeProject } from '../src/core/model/validate-document.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),results=[];
async function labels(ui,stage){
  const controls=await ui.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].filter(el=>el.getClientRects().length||el.type==='file').map(el=>({tag:el.tagName,type:el.type,label:el.getAttribute('aria-label')||[...el.labels??[]].map(l=>l.textContent.trim()).join(' ')||document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim()||''})));
  assert(controls.length>0);assert(controls.every(c=>c.label.trim().length>0),JSON.stringify(controls.filter(c=>!c.label)));return{stage,controls};
}
async function nativePrompt(ui,bidi){
  const before=await documentData(ui);let prompt;
  if(ui.page){
    const opened=ui.page.waitForEvent('dialog',{timeout:5000});await ui.evaluate(()=>{setTimeout(()=>location.reload(),50);});
    const dialog=await opened;assert.equal(dialog.type(),'beforeunload');prompt={type:dialog.type(),message:dialog.message(),driver:'Playwright native dialog'};await dialog.dismiss();
  }else{
    await ui.evaluate(()=>{setTimeout(()=>location.reload(),50);});
    for(let i=0;i<100;i++){prompt=bidi.events.find(e=>e.method==='browsingContext.userPromptOpened'&&e.params.type==='beforeunload');if(prompt)break;await pause(50);}
    assert(prompt,'Missing real BiDi beforeunload prompt');await bidi.command('browsingContext.handleUserPrompt',{context:prompt.params.context,accept:false});
    prompt={type:prompt.params.type,message:prompt.params.message,handler:prompt.params.handler,driver:'Firefox native BiDi prompt'};
  }
  await pause(100);assert.deepEqual(await documentData(ui),before);return{...prompt,cancelPreservedExactDocument:true};
}
async function run(ui,bidi,url,network){
  await ui.navigate(url);await ready(ui);await ui.resize(1280,720);const stages=[await labels(ui,'empty')];
  await ui.focusCanvas();await ui.key('Tab');
  const focus=await ui.evaluate(()=>{const el=document.activeElement,style=getComputedStyle(el);return{tag:el.tagName,text:el.textContent,focusVisible:el.matches(':focus-visible'),outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};});
  assert.equal(focus.tag,'BUTTON');assert(focus.focusVisible&&focus.outlineStyle!=='none'&&parseFloat(focus.outlineWidth)>=2);
  const fixture=performanceCsgFixture(),path=resolve(ui.directory,'nfr.tcad.json');writeFileSync(path,serializeProject(fixture.document));await open(ui,path);
  await feature(ui,fixture.operands[0]);stages.push(await labels(ui,'existing-extrusion'));
  await feature(ui,'performance-lines');await ui.click('编辑草图');stages.push(await labels(ui,'constraints'));
  const beforeInvalid=await documentData(ui),row='[data-constraint-id="length-0"]';await ui.fill('约束数值 (mm)','invalid',row);await ui.clickCss(`${row} button`,'应用数值');
  await ui.wait(()=>[...document.querySelectorAll('[role="alert"]')].some(e=>e.textContent.trim().length>0));
  const error=await ui.evaluate(()=>[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent.trim()).filter(Boolean));assert(error.some(e=>/数值|有限|INVALID/.test(e)));assert.deepEqual(await documentData(ui),beforeInvalid);
  await ui.click('线段');stages.push(await labels(ui,'drawing'));await ui.key('Escape');
  await objects(ui);await ui.clickCss('[data-entity-id="line-8"]');await ui.click('约束');await ui.choose('约束类型','length');stages.push(await labels(ui,'new-constraint'));await ui.key('Escape');await ui.click('完成草图');
  await feature(ui,'performance-profile');await ui.click('拉伸');await ui.wait(()=>document.querySelector('[data-extrusion-status="ready"]'));stages.push(await labels(ui,'extrusion-preview'));await ui.key('Escape');
  await feature(ui,fixture.operands[0]);await ui.click('布尔');stages.push(await labels(ui,'boolean-preview'));await ui.key('Escape');
  await ui.fill('项目名称','NFR真实离页提示');await change(ui,()=>ui.click('应用名称'));const prompt=await nativePrompt(ui,bidi);
  const file=await save(ui);assert.deepEqual(file.document,await documentData(ui));
  if(bidi)network.push(...bidi.events.filter(e=>e.method==='network.beforeRequestSent').map(e=>e.params.request.url));
  const origin=new URL(url).origin,resources=[...new Set(network.filter(u=>/^https?:/.test(u)))];assert(resources.length>0);assert(resources.every(u=>new URL(u).origin===origin),JSON.stringify(resources));
  const wasm=resources.filter(u=>u.endsWith('.wasm'));assert(wasm.length>0);assert(resources.some(u=>/solid.worker/.test(u)));assert(resources.some(u=>/document-solver.worker/.test(u)));
  return{stages,focus,errorText:error,invalidInputPreservedDocument:true,prompt,actualSavedFile:file.name,resources,allRuntimeResourcesSameOrigin:true,wasm,passed:true};
}
let server;
try{
  const base=process.env.NFR_BASE??'/';await build({root,base,build:{outDir:'.research/dist-nfr-contracts',emptyOutDir:true}});server=await preview({root,base,build:{outDir:'.research/dist-nfr-contracts'},preview:{host:'127.0.0.1',port:0}});
  for(const kind of (process.env.E2E_BROWSER_KINDS??'chrome,edge,firefox').split(',')){
    const ui=await launchBrowserUi(kind,{manualDialogs:true,bidi:kind==='firefox',promptHandling:{default:'ignore',beforeUnload:'ignore'}}),network=[];let bidi;
    try{
      if(ui.page)ui.context.on('request',request=>network.push(request.url()));
      else{bidi=await new BrowserBidi().connect(ui.webSocketUrl);await bidi.command('session.subscribe',{events:['browsingContext.userPromptOpened','network.beforeRequestSent']});}
      const url=`http://127.0.0.1:${server.httpServer.address().port}${base}`,checks=await run(ui,bidi,url,network);results.push({kind,version:ui.version,base,...checks});console.log(`PASS ${kind} ${ui.version}: labels / native keyboard focus / textual error / real beforeunload / same-origin runtime`);
    }catch(error){console.error(await ui.evaluate(()=>({alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent),status:document.querySelector('.workspace-status')?.textContent})).catch(()=>null));throw error;}
    finally{await bidi?.close();await ui.close();}
  }
  writeFileSync(process.env.NFR_EVIDENCE_PATH??'docs/learning/evidence/T-403C2b2-nfr-contracts.json',JSON.stringify({task:'T-403C2b2',executedAt:new Date().toISOString(),command:'node scripts/check-nfr-contracts.mjs',environment:{node:process.version,platform:process.platform,headless:true},results,passed:true,protocolSource:'https://w3c.github.io/webdriver-bidi/',packageLockVersion:JSON.parse(readFileSync('package-lock.json','utf8')).lockfileVersion},null,2)+'\n');
}finally{if(server){server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}}
