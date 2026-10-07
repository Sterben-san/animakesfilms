import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { schema, defaultValue, validateContent, safeUrl, createDefaultContent } from '../../scripts/content-model.js';
const response = (data, status = 200) => ({ok:status < 400,status,json:async()=>structuredClone(data)});
export const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
export async function settle(check = () => true) {
  for (let i=0;i<100;i++) { await new Promise(r=>setImmediate(r)); if (check()) return; }
  throw new Error('UI did not reach the expected state.');
}
export async function adminDom({content=createDefaultContent(), route='projects', fetchHook, cropHook, uploadHook}={}) {
  const logs=[],requests=[];
  let record={content:structuredClone(content),revision:1};
  const html=await readFile(new URL('../../admin.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:`http://localhost:3000/admin/dashboard/${route}?debug=1`,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  Object.assign(w,{schema,defaultValue,validateContent,safeUrl,structuredClone,dialog:async()=>null,confirmAction:async()=>true,cropImage:cropHook || (async file=>file),uploadWithProgress:uploadHook || (async()=>({url:'/uploads/11111111-1111-1111-1111-111111111111.png'}))});
  w.console.debug=(label,value)=>logs.push(JSON.parse(value)); w.scrollTo=()=>{};
  w.fetch=async(path,options={})=> {
    const request={path,options}; requests.push(request);
    const custom=await fetchHook?.(request); if(custom) return custom;
    if(path==='/api/session'||path==='/api/login') return response({email:'test@portfolio.local',csrf:'test-only-token'});
    if(path==='/api/logout') return response({ok:true});
    if(path==='/api/admin/content') {
      if(options.method==='PUT') { const input=JSON.parse(options.body); record={revision:record.revision+1,content:input.content}; }
      return response(record);
    }
    if(path==='/api/admin/summary') return response({revision:record.revision,savedAt:null,collections:{projects:{total:record.content.projects.items.length,published:0,drafts:1}},mediaCount:0,missingAlt:[]});
    if(path.startsWith('/api/admin/media')) return response([]);
    throw new Error('Unmocked request: '+path);
  };
  const code=(await readFile(new URL('../../scripts/admin.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  await w.eval(`(async()=>{${code}\n})()`);
  const click=selector=>{ const el=w.document.querySelector(selector); if(!el) throw new Error('Missing '+selector); el.click(); return el; };
  const input=(path,value)=>{ const el=w.document.querySelector(`[data-path="${path}"]`); if(!el) throw new Error('Missing field '+path); if(el.type==='checkbox') el.checked=value; else el.value=value; el.dispatchEvent(new w.Event('input',{bubbles:true})); return el; };
  return {w,dom,logs,requests,click,input,response,get record(){return structuredClone(record);},close:()=>dom.window.close()};
}
