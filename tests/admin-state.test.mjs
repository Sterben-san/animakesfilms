import test from 'node:test';
import assert from 'node:assert/strict';
import { adminDom, deferred, settle } from './helpers/browser-dom.mjs';
import { createDefaultContent, schema, defaultValue } from '../scripts/content-model.js';
function projectContent() {const c=createDefaultContent(); c.projects.items=[{...defaultValue(schema.projects.fields.items.item),title:'Original project',description:'Project description'}]; return c;}

test('publication and search filters follow current edits immediately', async t=>{
  const app=await adminDom({content:projectContent()}); t.after(app.close);
  app.input('projects.items.0.title','Renamed project'); app.input('projects.items.0.published',true);
  const select=app.w.document.querySelector('[data-list-status]'); select.value='published'; select.dispatchEvent(new app.w.Event('input',{bubbles:true}));
  const log=app.logs.filter(l=>l.event==='list.filter').at(-1); console.log('FILTER EVIDENCE',JSON.stringify(log));
  assert.equal(app.w.document.querySelector('details[data-list="projects.items"]').hidden,false);
  const search=app.w.document.querySelector('[data-list-search]'); search.value='Renamed project'; search.dispatchEvent(new app.w.Event('input',{bubbles:true}));
  assert.equal(app.w.document.querySelector('details[data-list="projects.items"]').hidden,false);
  assert.match(app.w.document.querySelector('summary').textContent,/Renamed project/);
});

test('save locks editable controls until its response arrives', async t=>{
  const gate=deferred(); let submitted;
  const app=await adminDom({content:projectContent(),fetchHook:async({path,options})=>{
    if(path==='/api/admin/content'&&options.method==='PUT') {submitted=JSON.parse(options.body); await gate.promise; return {ok:true,status:200,json:async()=>({revision:2,content:submitted.content})};}
  }}); t.after(app.close);
  app.input('projects.items.0.title','Submitted title'); app.click('#save'); await settle(()=>Boolean(submitted));
  const locked=app.w.document.querySelector('[data-path="projects.items.0.title"]').disabled;
  if(!locked) app.input('projects.items.0.title','Edit while saving');
  gate.resolve(); await settle(()=>app.logs.some(l=>l.event==='save.response'));
  console.log('SAVE EVIDENCE',JSON.stringify({locked,...app.logs.find(l=>l.event==='save.response')}));
  assert.equal(locked,true,'Controls must prevent edits that the pending response would overwrite.');
  assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').value,'Submitted title');
  assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').disabled,false);
});

test('out-of-order media responses cannot replace the selected archive view',async t=>{
  const gate=deferred(); let pending=false;
  const current=[{url:'/uploads/11111111-1111-1111-1111-111111111111.png',name:'Current image',alt:'Image',type:'image/png',size:100,references:[]}];
  const app=await adminDom({content:projectContent(),fetchHook:async({path})=>{
    if(path==='/api/admin/media'){pending=true; await gate.promise; return {ok:true,status:200,json:async()=>current};}
    if(path==='/api/admin/media?trash=1') return {ok:true,status:200,json:async()=>[]};
  }}); t.after(app.close);
  app.click('[data-tab="media"]'); await settle(()=>pending); app.click('[data-trash="1"]'); await settle(()=>app.w.document.querySelector('#media-grid').textContent.includes('No files'));
  gate.resolve(); await settle(()=>app.logs.some(l=>l.event==='media.response'&&l.requestedTrash===false));
  console.log('MEDIA EVIDENCE',JSON.stringify(app.logs.filter(l=>l.event==='media.response')));
  assert.ok(!app.w.document.querySelector('#media-grid').textContent.includes('Current image'));
});

test('expired upload sessions return to login and retain unsaved fields', async t=>{
  const app=await adminDom({content:projectContent(),uploadHook:async()=>{throw Object.assign(new Error('Please sign in.'),{status:401});}}); t.after(app.close);
  app.input('projects.items.0.title','Unsaved title');
  const file=app.w.document.querySelector('[data-upload="projects.items.0.image"]');
  Object.defineProperty(file,'files',{value:[new app.w.File(['image'],'test.png',{type:'image/png'})]});
  file.dispatchEvent(new app.w.Event('change',{bubbles:true})); await settle(()=>app.logs.some(l=>l.event==='upload.failed'));
  console.log('SESSION EVIDENCE',JSON.stringify(app.logs.find(l=>l.event==='upload.failed')));
  assert.equal(app.w.document.querySelector('#login-screen').hidden,false);
  app.w.document.querySelector('#email').value='test@portfolio.local'; app.w.document.querySelector('#password').value='test-password';
  app.w.document.querySelector('#login-form').dispatchEvent(new app.w.Event('submit',{bubbles:true,cancelable:true})); await settle(()=>!app.w.document.querySelector('#workspace').hidden);
  assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').value,'Unsaved title');
});
