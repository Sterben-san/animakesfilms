import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { renderPortfolio, renderProjectsPage, renderProjectPage } from '../scripts/render.mjs';
import { populatedPortfolio } from './helpers/fixture.mjs';
async function page(content=populatedPortfolio(),render=renderPortfolio) {
  const dom=new JSDOM(render(content),{url:'http://localhost:3000/?debug=1',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,logs=[];
  w.HTMLElement.prototype.getClientRects = () => [{width:100,height:20}];
  w.matchMedia=()=>({matches:true}); w.console.debug=(label,value)=>logs.push(JSON.parse(value));
  w.eval(await readFile(new URL('../scripts/main.js',import.meta.url),'utf8'));
  return {dom,w,d:w.document,logs,close:()=>w.close()};
}
test('public navigation supports menu, Escape, backdrop, anchors and keyboard focus',async t=>{
  const p=await page(); t.after(p.close); const menu=p.d.querySelector('#menuBtn');
  menu.focus(); menu.click(); assert.equal(menu.getAttribute('aria-expanded'),'true'); assert.equal(p.d.activeElement.id,'drawerClose');
  const admin=p.d.querySelector('.drawer__admin'); assert.equal(admin.getAttribute('href'),'/admin/dashboard'); assert.equal(admin,p.d.querySelector('.drawer__links').lastElementChild);
  admin.focus(); p.w.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})); assert.equal(p.d.activeElement.id,'drawerClose');
  p.w.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape'})); assert.equal(menu.getAttribute('aria-expanded'),'false'); assert.equal(p.d.activeElement,menu);
  menu.click(); p.d.querySelector('#drawerBackdrop').click(); assert.equal(p.d.querySelector('#drawer').inert,true);
  menu.click(); p.d.querySelector('.drawer__links a').click(); assert.equal(menu.getAttribute('aria-expanded'),'false');
  assert.ok(p.logs.some(l=>l.event==='public.ready'&&l.videos===1));
});
test('video player opens privacy embed, closes and restores focus',async t=>{
  const p=await page(); t.after(p.close); const button=p.d.querySelector('[data-video-id]'); button.click();
  assert.equal(p.d.querySelector('#videoModal').getAttribute('aria-hidden'),'false'); assert.match(p.d.querySelector('#videoFrame').src,/youtube-nocookie\.com\/embed\/aqz-KE-bpKQ/);
  p.d.querySelector('#modalClose').click(); assert.equal(p.d.querySelector('#videoFrame').getAttribute('src'),null); assert.equal(p.d.activeElement,button);
  button.click(); p.d.querySelector('#modalBackdrop').click(); assert.equal(p.d.querySelector('#videoModal').inert,true);
  button.click(); p.w.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape'})); assert.equal(p.d.querySelector('#videoFrame').getAttribute('src'),null);
});
test('project search combines category and case-insensitive text with an empty state',async t=>{
  const p=await page(); t.after(p.close); const search=p.d.querySelector('[data-project-search]'),select=p.d.querySelector('[data-project-category]');
  select.value='Photography'; select.dispatchEvent(new p.w.Event('change')); assert.equal([...p.d.querySelectorAll('[data-project-card]')].filter(c=>!c.hidden).length,1);
  search.value='FILM'; search.dispatchEvent(new p.w.Event('input')); assert.equal(p.d.querySelector('[data-project-empty]').hidden,false);
  select.value=''; select.dispatchEvent(new p.w.Event('change')); assert.equal(p.d.querySelector('[data-project-empty]').hidden,true);
  assert.equal([...p.d.querySelectorAll('[data-project-card]')].find(c=>!c.hidden).querySelector('h3').textContent,'Verification film');
});
test('every public section, metadata, theme, resume and certificate renders while drafts stay private',async t=>{
  const p=await page(); t.after(p.close);
  for(const id of ['about','showreel','projects','gallery','skills','experience','achievements','contact']) assert.ok(p.d.querySelector('#'+id));
  for(const text of ['Author biography','Creative skills','Director role','Verification award','Picture caption']) assert.ok(p.d.body.textContent.includes(text));
  assert.equal(p.d.title,'Verification portfolio'); assert.equal(p.d.querySelector('meta[name=description]').content,'A test of every section'); assert.equal(p.d.querySelector('.hero__image').src,'https://example.com/portrait.png');
  assert.ok(p.d.querySelector('a[download]')); assert.ok([...p.d.querySelectorAll('a')].some(a=>a.textContent==='View certificate'));
  assert.ok(!p.d.body.textContent.includes('PRIVATE')); assert.equal(p.d.querySelector('.skillBar__fill').style.width,'85%');
});
test('section visibility/order, disabled motion, empty sections and secondary-page links',async t=>{
  const c=populatedPortfolio(); c.about.settings.enabled=false; c.order.reverse(); c.appearance.motion=false; c.projects.items=[];
  const p=await page(c); t.after(p.close); assert.equal(p.d.querySelector('#about'),null); assert.equal(p.d.querySelector('main>.section').id,'contact'); assert.equal(p.d.querySelector('#intro'),null); assert.ok(p.d.body.classList.contains('no-motion')); assert.ok(p.d.querySelector('#projects .empty-work'));
  const d=new JSDOM(renderProjectPage(populatedPortfolio(),'verification-film')).window.document;
  assert.equal(d.querySelector('h1').textContent,'Verification film'); assert.equal(d.querySelector('.project-body').children.length,2); assert.equal(d.querySelector('.gallery-grid img').alt,'Gallery frame'); assert.equal(d.querySelector('.nav__brand').getAttribute('href'),'/#top');
  assert.match(renderProjectsPage(populatedPortfolio()),/data-project-search/);
});
