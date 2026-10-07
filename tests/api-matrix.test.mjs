import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPortfolioServer, hashPassword, atomicJson } from '../scripts/server.mjs';
import { populatedPortfolio } from './helpers/fixture.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
test('full API matrix: all content, protected routes, concurrency, media and error recovery',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'portfolio-matrix-')),logs=[];
  const credentials={email:'matrix@portfolio.local',password:'TestMatrix123!'};
  await atomicJson(join(dir,'admin.json'),{email:credentials.email,...await hashPassword(credentials.password)});
  const server=await createPortfolioServer({dataDir:dir,logger:entry=>logs.push(entry)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const request=(path,options={})=>fetch(origin+path,options), json=(extra={})=>({'Content-Type':'application/json',Origin:origin,...extra});
  const login=await request('/api/login',{method:'POST',headers:json(),body:JSON.stringify(credentials)});
  const session=await login.json(),auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
  let saved;
  await t.test('all public/admin assets and nested routes are available; private files are blocked',async()=>{
    for(const path of ['/','/projects','/admin','/admin/login','/admin/dashboard','/admin/dashboard/projects','/scripts/admin.js','/scripts/admin/media-tools.js','/scripts/content-model.js','/scripts/main.js','/styles/main.css','/styles/admin.css','/assets/fonts/fonts.css','/assets/fonts/poppins-400.ttf','/assets/favicon.svg']) assert.equal((await request(path)).status,200,path);
    for(const path of ['/api/admin/content','/api/admin/summary','/api/admin/media','/api/admin/media?trash=1']) assert.equal((await request(path)).status,401,path);
    for(const path of ['/.local/portfolio.json','/.local/admin.json','/server/domain/portfolio.mjs','/scripts/server.mjs','/package.json','/assets/../package.json']) assert.equal((await request(path)).status,404,path);
  });
  await t.test('image and PDF uploads populate every section, certificates and resume',async()=>{
    let res=await request('/api/admin/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':'image/png','X-File-Name':'Verification%20image.png','X-Image-Width':'1','X-Image-Height':'1'},body:png}); assert.equal(res.status,201); const image=await res.json(); assert.equal(image.width,1);
    res=await request('/api/admin/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':'application/pdf','X-File-Name':'certificate.pdf'},body:Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')}); assert.equal(res.status,201); const pdf=await res.json();
    res=await request(pdf.url); assert.equal(res.headers.get('content-type'),'application/pdf'); assert.match(res.headers.get('content-disposition'),/attachment/);
    const record=await (await request('/api/admin/content',{headers:auth})).json(); const content=populatedPortfolio(image.url,pdf.url);
    res=await request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify({...record,content})}); assert.equal(res.status,200); saved=await res.json();
    const html=await (await request('/')).text(); for(const text of ['Verification Author','Author biography','Verification reel','Verification film','Verification picture','Creative skills','Director role','Verification award','hello@example.com']) assert.ok(html.includes(text),text);
    assert.ok(!html.includes('PRIVATE')); assert.equal((await (await request('/api/content',{headers:auth})).json()).content.projects.items.length,2);
    const disk=JSON.parse(await readFile(join(dir,'portfolio.json'),'utf8')); assert.deepEqual(disk,saved);
    assert.equal((await request('/projects/verification-film')).status,200); assert.equal((await request('/projects/private-project')).status,404);
    const media=await (await request('/api/admin/media',{headers:auth})).json(); assert.ok(media.every(m=>m.references.length>0));
  });
  await t.test('concurrent writes allow one winner and reject an outdated revision',async()=>{
    const results=await Promise.all([1,2].map(i=>request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify({...saved,content:{...saved.content,hero:{...saved.content.hero,kicker:'Concurrent '+i}}})})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); saved=await results.find(r=>r.status===200).json();
    const record=await (await request('/api/admin/content',{headers:auth})).json(); assert.equal(record.revision,saved.revision);
  });
  await t.test('invalid content, unsafe URLs, missing media and malformed bodies are rejected without writes',async()=>{
    const cases=[c=>c.site.name='',c=>c.hero.buttons[0].url='javascript:alert(1)',c=>c.projects.items[1].slug=c.projects.items[0].slug,c=>c.showreel.videos[0].youtubeUrl='https://evil.example/video',c=>c.skills.groups[0].items[0].level=-1,c=>c.order=['about'],c=>c.gallery.pictures[0].image='/uploads/11111111-1111-1111-1111-111111111111.png'];
    for(const mutate of cases){const c=structuredClone(saved.content);mutate(c);const res=await request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify({...saved,content:c})}); assert.ok([400,404].includes(res.status),await res.text());}
    for(const body of ['{','null','[]']) assert.equal((await request('/api/admin/content',{method:'PUT',headers:json(auth),body})).status,400);
    assert.equal((await request('/api/admin/content',{method:'PUT',headers:{...auth,Origin:origin,'Content-Type':'text/plain'},body:'abc'})).status,415);
    assert.equal((await (await request('/api/admin/content',{headers:auth})).json()).revision,saved.revision);
  });
  await t.test('forbidden origins/tokens and oversized or mismatched uploads fail safely',async()=>{
    for(const headers of [{Cookie:auth.Cookie},{...auth,'X-CSRF-Token':'wrong'}]) assert.equal((await request('/api/admin/content',{method:'PUT',headers:json(headers),body:JSON.stringify(saved)})).status,403);
    assert.equal((await request('/api/admin/content',{method:'PUT',headers:json({...auth,Origin:'https://outside.example'}),body:JSON.stringify(saved)})).status,403);
    assert.equal((await request('/api/admin/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':'application/pdf'},body:png})).status,415);
    assert.equal((await request('/api/admin/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':'image/png'},body:Buffer.alloc(10*1024*1024+1)})).status,413);
    assert.ok(logs.some(l=>l.status===409)); assert.ok(logs.some(l=>l.status===413)); assert.ok(!JSON.stringify(logs).includes(credentials.password)); assert.ok(!JSON.stringify(logs).includes(session.csrf)); assert.ok(!JSON.stringify(logs).includes(auth.Cookie));
  });
});
