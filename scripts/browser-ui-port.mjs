import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const elementKey='element-6066-11e4-a52e-4f735466cecf';
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class BrowserUi {
  page;context;browser;driver;endpoint;session;version;directory;
  async command(method,path,body){const response=await fetch(`${this.endpoint}/session/${this.session}${path}`,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await response.json();if(!response.ok||data.value?.error)throw Error(`WebDriver ${data.value?.error}: ${data.value?.message}`);return data.value;}
  async evaluate(fn,arg){if(this.page)return this.page.evaluate(fn,arg);return this.command('POST','/execute/sync',{script:`return (${fn.toString()})(arguments[0]);`,args:[arg??null]});}
  async wait(fn,arg,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await this.evaluate(fn,arg))return;await pause(40);}throw Error(`UI condition timed out: ${fn.toString().slice(0,150)}`);}
  async navigate(url){if(this.page)await this.page.goto(url);else await this.command('POST','/url',{url});}
  async reload(){if(this.page)await this.page.reload();else await this.command('POST','/refresh',{});}
  async element(selector,text){return this.evaluate(({selector,text})=>[...document.querySelectorAll(selector)].find(el=>(text===undefined||el.textContent.trim()===text)&&el.getClientRects().length&&!el.disabled)||null,{selector,text});}
  async clickCss(selector,text){
    await this.wait(({selector,text})=>[...document.querySelectorAll(selector)].some(el=>(text===undefined||el.textContent.trim()===text)&&el.getClientRects().length&&!el.disabled),{selector,text});
    if(this.page){let locator=this.page.locator(selector);if(text!==undefined)locator=locator.filter({hasText:new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)});await locator.first().click();}
    else{const el=await this.element(selector,text);await this.command('POST',`/element/${el[elementKey]}/click`,{});}
  }
  click(name){return this.clickCss('button',name);}
  async label(label,root='body'){return this.evaluate(({label,root})=>{const host=document.querySelector(root);return host.querySelector(`[aria-label="${label}"]`)||[...host.querySelectorAll('label')].find(el=>el.textContent.trim()===label)?.control||null;},{label,root});}
  async fill(label,value,root='body'){
    if(this.page){await this.page.locator(root).getByLabel(label,{exact:true}).fill(String(value));return;}
    const el=await this.label(label,root);if(!el)throw Error(`Missing label: ${label}`);await this.command('POST',`/element/${el[elementKey]}/clear`,{});await this.command('POST',`/element/${el[elementKey]}/value`,{text:String(value)});
  }
  async choose(label,value){
    if(this.page){await this.page.getByLabel(label,{exact:true}).selectOption(value);return;}
    const el=await this.label(label),option=await this.command('POST','/execute/sync',{script:'return arguments[0].querySelector(`option[value="${arguments[1]}"]`);',args:[el,value]});await this.command('POST',`/element/${option[elementKey]}/click`,{});
  }
  async key(key){
    if(this.page){await this.page.keyboard.press(key);return;}
    const names={Control:'\uE009',Shift:'\uE008',Escape:'\uE00C',Enter:'\uE007'},keys=key.split('+').map(k=>names[k]??k);
    await this.command('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[...keys.map(value=>({type:'keyDown',value})),...keys.toReversed().map(value=>({type:'keyUp',value}))]}]});
  }
  async upload(path){if(this.page)await this.page.getByLabel('打开项目文件',{exact:true}).setInputFiles(path);else{const el=await this.evaluate(()=>document.querySelector('input[type="file"]'));await this.command('POST',`/element/${el[elementKey]}/value`,{text:resolve(path)});}}
  async focusCanvas(){if(this.page)await this.page.locator('canvas').focus();else{const el=await this.element('canvas');await this.command('POST',`/element/${el[elementKey]}/click`,{});}}
  async resize(width,height){if(this.page)await this.page.setViewportSize({width,height});else{const chrome=await this.evaluate(()=>({width:outerWidth-innerWidth,height:outerHeight-innerHeight}));await this.command('POST','/window/rect',{width:width+chrome.width,height:height+chrome.height});}}
  async download(action,extension){
    if(this.page){const pending=this.page.waitForEvent('download');await action();const file=await pending;return{path:await file.path(),name:file.suggestedFilename()};}
    const old=new Set(readdirSync(this.directory));await action();
    let lastName,lastSize=0,stable=0;
    for(let i=0;i<300;i++){
      const names=readdirSync(this.directory),found=names.find(name=>!old.has(name)&&name.endsWith(extension));
      const size=found?statSync(resolve(this.directory,found)).size:0;
      stable=found===lastName&&size>0&&size===lastSize&&!names.some(n=>n.endsWith('.part'))?stable+1:0;
      if(stable>=4)return{path:resolve(this.directory,found),name:found};
      lastName=found;lastSize=size;await pause(50);
    }throw Error('Firefox actual download timed out');
  }
  async screenshot(path){if(this.page)await this.page.screenshot({path,fullPage:true});else writeFileSync(path,Buffer.from(await this.command('GET','/screenshot'),'base64'));}
  async close(){if(this.page){await this.context.close();await this.browser.close();}else{try{if(this.session)await this.command('DELETE','');}finally{this.driver?.kill();}}}
}
export async function launchBrowserUi(kind){
  const ui=new BrowserUi();ui.directory=resolve(`.research/browser-downloads/${kind}-${crypto.randomUUID()}`);mkdirSync(ui.directory,{recursive:true});
  if(kind!=='firefox'){
    const executablePath=kind==='chrome'?resolve('.research/browsers/chrome-154/chrome-win64/chrome.exe'):resolve('.research/browsers/edge-154-browser/core/Chrome-bin/154.0.4258.53/msedge.exe');
    ui.browser=await chromium.launch({headless:true,executablePath});ui.version=ui.browser.version();ui.context=await ui.browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});ui.page=await ui.context.newPage();ui.page.on('dialog',d=>d.accept());return ui;
  }
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));ui.endpoint=`http://127.0.0.1:${port}`;
  ui.driver=spawn(resolve('.research/browsers/geckodriver-0.37.1/geckodriver.exe'),['--host','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:'ignore',env:{...process.env,MOZ_CRASHREPORTER_DISABLE:'1'}});
  let spawnError;ui.driver.on('error',cause=>{spawnError=cause;});
  try{
    for(let i=0;i<200;i++){if(spawnError)throw spawnError;try{if((await fetch(`${ui.endpoint}/status`)).ok)break;}catch{/* Wait for owned driver. */}await pause(50);}
    const response=await fetch(`${ui.endpoint}/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capabilities:{alwaysMatch:{browserName:'firefox',unhandledPromptBehavior:'accept','moz:firefoxOptions':{binary:resolve('.research/browsers/firefox-157/core/firefox.exe'),args:['-headless'],prefs:{'browser.download.folderList':2,'browser.download.dir':ui.directory,'browser.download.useDownloadDir':true,'browser.download.alwaysOpenPanel':false,'browser.helperApps.neverAsk.saveToDisk':'application/json,model/stl,application/octet-stream','app.update.auto':false,'datareporting.healthreport.uploadEnabled':false}}}}})});const value=(await response.json()).value;if(value.error)throw Error(`${value.error}: ${value.message}`);ui.session=value.sessionId;ui.version=value.capabilities.browserVersion;await ui.command('POST','/window/rect',{width:1280,height:900});return ui;
  }catch(cause){ui.driver.kill();throw cause;}
}
