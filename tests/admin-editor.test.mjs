import test from 'node:test';
import assert from 'node:assert/strict';
import { adminDom, settle, deferred } from './helpers/browser-dom.mjs';
import { populatedPortfolio } from './helpers/fixture.mjs';
import { schema } from '../scripts/content-model.js';

test('all sidebar sections render their editable fields without losing pending edits',async t=>{
  for(const section of Object.keys(schema)) await t.test(section,async t=>{
    const app=await adminDom({content:populatedPortfolio(),route:section}); t.after(app.close);
    assert.equal(app.w.document.querySelector('#editor-title').textContent,schema[section].label);
    assert.ok(app.w.document.querySelector('#editor-form').children.length>0);
    assert.equal(app.w.document.querySelector('[data-path$=".id"]'),null);
    if(section!=='order') {
      const field=app.w.document.querySelector('[data-path]'), path=field.dataset.path;
      const value=field.type==='checkbox' ? !field.checked : field.type==='number' ? '60' : field.type==='color' ? '#123456' : field.tagName==='SELECT' ? field.options[0].value : 'Verification edit';
      app.input(path,value); app.click('[data-tab="overview"]'); await settle(()=>app.w.document.querySelector('.dashboard-panel'));
      app.click(`[data-tab="${section}"]`); const restored=app.w.document.querySelector(`[data-path="${path}"]`);
      assert.equal(field.type==='checkbox' ? restored.checked : restored.value,field.type==='checkbox' ? value : String(value));
    }
  });
});
test('add, duplicate, reorder and remove work for projects and nested lists',async t=>{
  const app=await adminDom({content:populatedPortfolio()}); t.after(app.close);
  app.click('[data-duplicate="projects.items"][data-index="0"]'); app.click('#save'); await settle(()=>app.record.revision===2);
  const duplicate=app.record.content.projects.items[1]; assert.equal(duplicate.id,''); assert.equal(duplicate.slug,''); assert.equal(duplicate.published,false); assert.equal(duplicate.gallery.length,1);
  app.click('[data-move="projects.items"][data-index="1"][data-delta="1"]'); app.click('#save'); await settle(()=>app.record.revision===3); assert.equal(app.record.content.projects.items[1].title,'Verification photo');
  app.click('[data-remove="projects.items"][data-index="2"]'); app.click('[data-add="projects.items.0.gallery"]'); app.input('projects.items.0.gallery.1.caption','Second frame');
  app.click('[data-tab="skills"]'); app.click('[data-add="skills.groups.0.items"]'); app.input('skills.groups.0.items.2.name','Color grading'); app.input('skills.groups.0.items.2.level',75);
  app.click('#save'); await settle(()=>app.record.revision===4); assert.equal(app.record.content.projects.items.length,3); assert.equal(app.record.content.projects.items[0].gallery[1].caption,'Second frame'); assert.equal(app.record.content.skills.groups[0].items[2].name,'Color grading');
});
test('quick creation for project, video and picture starts unsaved drafts',async t=>{
  for(const kind of ['project','video','picture']) await t.test(kind,async t=>{
    const app=await adminDom({route:'overview'}); t.after(app.close); app.click(`[data-quick="${kind}"]`); assert.equal(app.w.document.querySelector('[data-path$=".published"]').checked,false); assert.equal(app.w.document.querySelector('#discard').hidden,false);
  });
});
test('validation errors block requests, keep edits, and allow correction',async t=>{
  const app=await adminDom({content:populatedPortfolio(),route:'skills'}); t.after(app.close);
  app.input('skills.groups.0.items.0.level',101); app.click('#save'); await settle(); assert.match(app.w.document.querySelector('#editor-error').textContent,/between 0 and 100/); assert.equal(app.requests.filter(r=>r.options.method==='PUT').length,0);
  app.input('skills.groups.0.items.0.level',80); app.click('#save'); await settle(()=>app.record.revision===2); assert.equal(app.record.content.skills.groups[0].items[0].level,80);
});
test('server conflict keeps unsaved data and enables discard recovery',async t=>{
  const app=await adminDom({content:populatedPortfolio(),fetchHook:async({options})=>options.method==='PUT'?{ok:false,status:409,json:async()=>({error:'Content changed in another tab.'})}:null}); t.after(app.close);
  app.input('projects.items.0.title','Unsaved conflict'); app.click('#save'); await settle(()=>app.w.document.querySelector('#editor-error').textContent.includes('another tab'));
  assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').value,'Unsaved conflict'); assert.equal(app.w.document.querySelector('#save').disabled,false);
  app.click('#discard'); await settle(()=>app.w.document.querySelector('#discard').hidden); assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').value,'Verification film');
});
test('discard locks controls and sign-out requires resolving pending edits',async t=>{
  const gate=deferred(); let hold=false,requested=false;
  const app=await adminDom({content:populatedPortfolio(),fetchHook:async({path,options})=>{if(hold&&path==='/api/admin/content'&&!options.method){requested=true;await gate.promise;}}}); t.after(app.close);
  app.input('projects.items.0.title','Discard this'); app.click('#logout'); assert.match(app.w.document.querySelector('#editor-error').textContent,/Save or discard/);
  hold=true; app.click('#discard'); await settle(()=>requested); assert.equal(app.w.document.querySelector('[data-path="projects.items.0.title"]').disabled,true);
  gate.resolve(); await settle(()=>app.w.document.querySelector('#discard').hidden&&!app.w.document.querySelector('#logout').disabled); app.click('#logout'); await settle(()=>!app.w.document.querySelector('#login-screen').hidden);
  assert.equal(app.w.document.querySelector('#workspace').hidden,true);
});
test('identity auto-updates matching brand fields and preserves independently edited fields',async t=>{
  const app=await adminDom({route:'site'}); t.after(app.close); app.input('site.brand','Independent brand'); app.input('site.name','New Author'); app.click('#save'); await settle(()=>app.record.revision===2);
  assert.equal(app.record.content.site.brand,'Independent brand'); assert.equal(app.record.content.hero.title,'New Author'); assert.equal(app.record.content.footer.name,'New Author');
});
