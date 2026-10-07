import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const code=(await readFile(new URL('../scripts/admin/media-tools.js',import.meta.url),'utf8')).replace(/export /g,'');
async function uploader(status,body,event='load') {
  const dom=new JSDOM('',{url:'http://localhost:3000/?debug=1',runScripts:'outside-only'}),w=dom.window,logs=[];
  const request={}; w.console.debug=(label,data)=>logs.push(JSON.parse(data));
  w.XMLHttpRequest=class {constructor(){this.upload={};this.headers={};request.xhr=this;} open(method,path){this.method=method;this.path=path;} setRequestHeader(k,v){this.headers[k]=v;} send(file){this.status=status;this.responseText=body;this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10});queueMicrotask(()=>this['on'+event]?.());}};
  w.eval(code+'\nwindow.uploadTest = uploadWithProgress;');
  return {w,request,logs,close:()=>w.close()};
}
test('upload sends authenticated raw bytes, encoded file name and progress',async t=>{
  const u=await uploader(201,JSON.stringify({url:'/uploads/test.png'})); t.after(u.close); const progress=[];
  const result=await u.w.uploadTest(new u.w.File(['abc'],'a picture.png',{type:'image/png'}),'test-token',p=>progress.push(p));
  assert.equal(result.url,'/uploads/test.png'); assert.equal(u.request.xhr.path,'/api/admin/media'); assert.equal(u.request.xhr.headers['X-CSRF-Token'],'test-token'); assert.equal(u.request.xhr.headers['X-File-Name'],'a%20picture.png'); assert.deepEqual(progress,[50]);
  assert.ok(!JSON.stringify(u.logs).includes('test-token'));
});
test('upload rejection preserves status for session recovery and rejects network failures',async t=>{
  for(const [status,body,event,message] of [[401,'{"error":"Please sign in."}','load','Please sign in.'],[415,'{"error":"Invalid file"}','load','Invalid file'],[500,'not json','load','Unexpected'],[0,'','error','interrupted'],[0,'','abort','cancelled'],[0,'','timeout','timed out']]) await t.test(status+' '+event,async t=>{
    const u=await uploader(status,body,event); t.after(u.close); await assert.rejects(u.w.uploadTest(new u.w.File(['abc'],'f.pdf',{type:'application/pdf'}),'token',()=>{}),err=>err.status===status&&err.message.includes(message));
  });
});
test('image crop supports frame ratios, rotation, zoom, original and cancel without leaking object URLs',async t=>{
  const dom=new JSDOM('',{url:'http://localhost:3000/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window; t.after(()=>w.close());
  let revoked=0,rotation,scale;
  w.URL.createObjectURL=()=> 'blob:test'; w.URL.revokeObjectURL=()=>revoked++;
  w.Image=class {constructor(){this.width=400;this.height=200;} set src(value){queueMicrotask(()=>this.onload());}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},save(){},translate(){},rotate(v){rotation=v;},scale(v){scale=v;},drawImage(){},restore(){}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['test'],{type:'image/png'}));};
  w.eval(code+'\nwindow.cropTest=cropImage;'); const file=new w.File(['image'],'original.jpg',{type:'image/jpeg'});
  const wait=async()=>{for(let i=0;i<20;i++){await new Promise(r=>setImmediate(r));if(w.document.querySelector('dialog')) return;}throw new Error('Crop dialog absent');};
  let task=w.cropTest(file);await wait(); const canvas=w.document.querySelector('canvas'); assert.equal(canvas.height,350);
  const shape=w.document.querySelector('[data-shape]'); shape.value='0.8'; shape.dispatchEvent(new w.Event('input')); assert.equal(canvas.height,875);
  const rotate=w.document.querySelector('[data-rotate]');rotate.value='90';rotate.dispatchEvent(new w.Event('input'));assert.equal(rotation,Math.PI/2);
  const zoom=w.document.querySelector('[data-zoom]');zoom.value='2';zoom.dispatchEvent(new w.Event('input'));assert.equal(scale,7);
  w.document.querySelector('[data-crop]').click(); const result=await task;assert.equal(result.type,'image/png');assert.equal(result.name,'original-crop.png');assert.equal(revoked,1);
  task=w.cropTest(file);await wait();w.document.querySelector('[data-original]').click();assert.equal(await task,file);
  task=w.cropTest(file);await wait();w.document.querySelector('[data-close]').click();assert.equal(await task,null);assert.equal(revoked,3);
  const gif=new w.File(['gif'],'animation.gif',{type:'image/gif'});assert.equal(await w.cropTest(gif),gif);assert.equal(w.document.querySelector('dialog'),null);
});
