import { once } from 'node:events';
export class BrowserBidi {
  pending=new Map();events=[];nextId=0;
  async connect(url){this.socket=new WebSocket(url);this.socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data),pending=this.pending.get(data.id);
    if(pending){clearTimeout(pending.timer);this.pending.delete(data.id);if(data.type==='error')pending.reject(Error(`${data.error}: ${data.message}`));else pending.resolve(data.result);}
    else if(data.type==='event')this.events.push(data);
  });await once(this.socket,'open');return this;}
  command(method,params={}){return new Promise((resolve,reject)=>{const id=++this.nextId,timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`BiDi timeout: ${method}`));},10000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('BiDi closed'));}this.pending.clear();if(this.socket){this.socket.close();await once(this.socket,'close');}}
}
