import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, cp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPortfolioServer, hashPassword, atomicJson } from '../scripts/server.mjs';
import { createDefaultContent, validateContent, youtubeId, schema, defaultValue, migrateContent } from '../scripts/content-model.js';
import { renderPortfolio, renderProjectPage } from '../scripts/render.mjs';

test('local admin authentication, uploads, editing, and persistence', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'portfolio-admin-test-'));
  const credentials = { email: 'test@portfolio.local', password: 'LocalTestPassword123!' };
  await atomicJson(join(dir, 'admin.json'), { email: credentials.email, ...await hashPassword(credentials.password) });
  let server, origin;
  const start = async () => {
    server = await createPortfolioServer({ dataDir: dir });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  t.after(async () => { if (server.listening) await stop(); await rm(dir, { recursive: true, force: true }); });
  await start();
  const request = (path, options = {}) => fetch(origin + path, options);
  const json = (headers = {}) => ({ 'Content-Type': 'application/json', Origin: origin, ...headers });
  let response = await request('/api/session'); assert.equal(response.status, 401);
  response = await request('/api/content'); let record = await response.json();
  assert.equal(record.content.site.name, 'Your name');
  assert.equal(record.content.showreel.videos.length, 0);
  assert.equal(record.content.projects.items.length, 0);
  assert.equal(record.content.about.photo, '');
  response = await request('/api/content', { method: 'PUT', headers: json(), body: JSON.stringify(record) }); assert.equal(response.status, 401);
  response = await request('/api/login', { method: 'POST', headers: json(), body: JSON.stringify({ ...credentials, password: 'wrong' }) }); assert.equal(response.status, 401);
  response = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: JSON.stringify(credentials) }); assert.equal(response.status, 403);
  response = await request('/api/login', { method: 'POST', headers: json(), body: JSON.stringify(credentials) }); assert.equal(response.status, 200);
  const session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  const auth = { Cookie: cookie, 'X-CSRF-Token': session.csrf };
  response = await request('/api/content', { method: 'PUT', headers: json({ Cookie: cookie }), body: JSON.stringify(record) }); assert.equal(response.status, 403);
  response = await request('/.local/admin.json'); assert.equal(response.status, 404);
  response = await request('/scripts/server.mjs'); assert.equal(response.status, 404);
  response = await request('/api/uploads'); assert.equal(response.status, 401);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  response = await request('/api/uploads', { method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'image/png', 'X-File-Name': 'portrait.png' }, body: png }); assert.equal(response.status, 201);
  const media = await response.json();
  response = await request(media.url); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  response = await request('/api/uploads', { method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'image/png' }, body: '<script>not an image</script>' }); assert.equal(response.status, 415);
  record.content.site.name = 'Test Author'; record.content.hero.title = 'A new story';
  record.content.about.photo = media.url; record.content.about.biography = 'Saved author biography';
  record.content.showreel.videos = [{ ...defaultValue(schema.showreel.fields.videos.item), published: true, title: 'Test reel', category: 'Reel', youtubeUrl: 'https://youtu.be/aqz-KE-bpKQ', thumbnail: media.url }];
  record.content.projects.items = [{ ...defaultValue(schema.projects.fields.items.item), published: true, title: 'New film', category: 'Film', description: 'Work description', roles: 'Editor, Director', duration: '2026', url: 'https://example.com/work', image: media.url, featured: true }];
  record.content.gallery.pictures = [{ ...defaultValue(schema.gallery.fields.pictures.item), published: true, image: media.url, title: 'On set', caption: 'A photo', alt: 'On set photo' }];
  record.content.skills.groups = [{ title: 'Creative', items: [{ name: 'Direction', level: 88 }] }];
  record.content.experience.items = [{ title: 'Director', period: '2026', description: 'Timeline text' }];
  record.content.achievements.items = [{ ...defaultValue(schema.achievements.fields.items.item), published: true, title: 'Award', icon: '★', description: 'Award description', links: [{ label: 'Certificate', url: 'https://example.com/award' }] }];
  record.content.contact.items = [{ label: 'Email', value: 'hello@example.com', url: 'mailto:hello@example.com' }];
  record.content.footer.name = 'Test Author'; record.content.appearance.accent = '#33aaee';
  response = await request('/api/content', { method: 'PUT', headers: json(auth), body: JSON.stringify(record) }); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.revision, record.revision + 1);
  response = await request('/'); const html = await response.text();
  for (const text of ['Test Author', 'A new story', 'Saved author biography', 'Test reel', 'New film', 'On set', 'Direction', 'Award', '#33aaee']) assert.ok(html.includes(text), text);
  response = await request('/api/content', { method: 'PUT', headers: json(auth), body: JSON.stringify(record) }); assert.equal(response.status, 409);
  const bad = structuredClone(saved); bad.content.hero.buttons[0].url = 'javascript:alert(1)';
  response = await request('/api/content', { method: 'PUT', headers: json(auth), body: JSON.stringify(bad) }); assert.equal(response.status, 400);
  response = await request('/projects/new-film'); assert.equal(response.status,200); assert.match(await response.text(),/New film/);
  response = await request('/api/admin/summary',{headers:auth}); let summary = await response.json(); assert.equal(summary.collections.projects.published,1); assert.equal(summary.mediaCount,1);
  response = await request('/api/admin/media/'+media.url.split('/').pop()+'/archive',{method:'POST',headers:{...auth,Origin:origin}}); assert.equal(response.status,409);
  response = await request('/api/admin/media/'+media.url.split('/').pop(),{method:'PATCH',headers:json(auth),body:JSON.stringify({name:'Portrait',alt:'Portrait description'})}); assert.equal(response.status,200);
  const withDraft = structuredClone(saved); withDraft.content.projects.items.push({...defaultValue(schema.projects.fields.items.item),title:'Private draft',body:'Secret story'});
  response = await request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify(withDraft)}); assert.equal(response.status,200);
  const savedDraft = await response.json(); const draft = savedDraft.content.projects.items.at(-1); assert.equal(draft.published,false); assert.equal(draft.slug,'private-draft');
  response = await request('/api/content',{headers:auth}); assert.equal((await response.json()).content.projects.items.length,1);
  response = await request('/api/admin/content',{headers:auth}); assert.equal((await response.json()).content.projects.items.length,2);
  for (const path of ['/','/projects','/api/projects']) { response = await request(path); assert.ok(!(await response.text()).includes('Private draft')); }
  for (const path of ['/projects/private-draft','/api/projects/private-draft']) { response = await request(path); assert.equal(response.status,404); }
  const duplicate = structuredClone(savedDraft); duplicate.content.projects.items.at(-1).slug='new-film';
  response = await request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify(duplicate)}); assert.equal(response.status,400);
  const publishDraft = structuredClone(savedDraft); publishDraft.content.projects.items.at(-1).published=true;
  response = await request('/api/admin/content',{method:'PUT',headers:json(auth),body:JSON.stringify(publishDraft)}); assert.equal(response.status,400);
  response = await request('/api/admin/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':'image/png'},body:png}); const unused=await response.json(); assert.equal(response.status,201);
  const fileRoute = '/api/admin/media/'+unused.url.split('/').pop();
  response = await request(fileRoute+'/archive',{method:'POST',headers:{...auth,Origin:origin}}); assert.equal(response.status,200);
  response = await request(unused.url); assert.equal(response.status,404);
  response = await request('/api/admin/media?trash=1',{headers:auth}); assert.equal((await response.json()).length,1);
  response = await request(fileRoute+'/restore',{method:'POST',headers:{...auth,Origin:origin}}); assert.equal(response.status,200);
  response = await request(unused.url); assert.equal(response.status,200);
  await stop(); await start();
  response = await request('/api/content'); const restarted = await response.json(); assert.deepEqual(restarted.content,saved.content); assert.equal(restarted.revision,savedDraft.revision);
  response = await request(media.url); assert.equal(response.status, 200);
  response = await request('/api/session', { headers: { Cookie: cookie } }); assert.equal(response.status, 401);
  const disk = await readFile(join(dir, 'admin.json'), 'utf8'); assert.ok(!disk.includes(credentials.password));
  response = await request('/api/login', { method: 'POST', headers: json(), body: JSON.stringify(credentials) });
  const secondSession = await response.json(), secondCookie = response.headers.get('set-cookie').split(';')[0];
  response = await request('/api/logout', { method: 'POST', headers: { Origin: origin, Cookie: secondCookie, 'X-CSRF-Token': secondSession.csrf } }); assert.equal(response.status, 200);
  response = await request('/api/session', { headers: { Cookie: secondCookie } }); assert.equal(response.status, 401);
  for (let attempt = 0; attempt < 6; attempt++) {
    response = await request('/api/login', { method: 'POST', headers: json(), body: JSON.stringify({ ...credentials, password: 'wrong' }) });
    assert.equal(response.status, attempt === 5 ? 429 : 401);
  }
});

test('content rendering escapes text and validates video URLs, order, and skills', () => {
  const content = createDefaultContent(); content.hero.title = '<script>alert("x")</script>';
  assert.ok(renderPortfolio(validateContent(content)).includes('&lt;script&gt;'));
  assert.equal(youtubeId('https://youtu.be/aqz-KE-bpKQ'), 'aqz-KE-bpKQ');
  assert.equal(youtubeId('https://www.youtube.com/shorts/aqz-KE-bpKQ'), 'aqz-KE-bpKQ');
  assert.equal(youtubeId('https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ'), '');
  content.order = ['about']; assert.throws(() => validateContent(content), /section order/);
  content.order = createDefaultContent().order;
  content.skills.groups = [{ title: 'Skills', items: [{ name: 'Editing', level: 101 }] }];
  assert.throws(() => validateContent(content), /between 0 and 100/);
});

test('migration preserves existing entries and stable project URLs, drafts stay out of rendered pages', async () => {
  const { normalizeContent, publishedContent } = await import('../server/domain/portfolio.mjs');
  const c=createDefaultContent();
  c.projects.items = [{title:'Old work',category:'Film',description:'Existing description',roles:'Editor',duration:'2025',url:'',image:'',featured:false}];
  const migrated=normalizeContent(migrateContent(c)); assert.equal(migrated.projects.items[0].published,true); assert.equal(migrated.projects.items[0].slug,'old-work');
  migrated.projects.items[0].title='Renamed'; assert.equal(normalizeContent(migrated).projects.items[0].slug,'old-work');
  migrated.projects.items.push({...defaultValue(schema.projects.fields.items.item),title:'Draft test',body:'Secret draft'});
  const normalized=normalizeContent(migrated); assert.equal(publishedContent(normalized).projects.items.length,1); assert.ok(!renderPortfolio(normalized).includes('Secret draft'));
  assert.throws(()=>renderProjectPage(normalized,'draft-test'),/not found/);
});

test('static export includes published project pages and excludes drafts, private media and admin files', async t => {
  const { buildPortfolio } = await import('../scripts/build.mjs');
  const { pathToFileURL } = await import('node:url');
  const { normalizeContent } = await import('../server/domain/portfolio.mjs');
  const root = await mkdtemp(join(tmpdir(),'portfolio-export-test-')); t.after(()=>rm(root,{recursive:true,force:true}));
  for (const path of ['styles/main.css','assets','scripts/main.js']) { await mkdir(join(root,path.split('/').slice(0,-1).join('/')),{recursive:true}); await cp(new URL('../'+path,import.meta.url),join(root,path),{recursive:true}); }
  await mkdir(join(root,'.local','uploads'),{recursive:true});
  const publicFile='11111111-1111-1111-1111-111111111111.png', draftFile='22222222-2222-2222-2222-222222222222.png';
  for (const file of [publicFile,draftFile]) await writeFile(join(root,'.local','uploads',file),'test image');
  const c=createDefaultContent(); c.projects.items=[{...defaultValue(schema.projects.fields.items.item),published:true,title:'Public work',description:'Published description',image:'/uploads/'+publicFile},{...defaultValue(schema.projects.fields.items.item),title:'Private work',body:'Secret unpublished story',image:'/uploads/'+draftFile}];
  await writeFile(join(root,'.local','portfolio.json'),JSON.stringify({revision:1,content:normalizeContent(c)}));
  await buildPortfolio(pathToFileURL(root+'/'));
  const html=await readFile(join(root,'dist','index.html'),'utf8'); assert.match(html,/Public work/); assert.ok(!html.includes('Private work'));
  const detail=await readFile(join(root,'dist','projects','public-work','index.html'),'utf8'); assert.match(detail,/Published description/);
  assert.deepEqual((await readdir(join(root,'dist','projects'))).sort(),['index.html','public-work']);
  assert.deepEqual(await readdir(join(root,'dist','uploads')),[publicFile]);
  assert.deepEqual(await readdir(join(root,'dist','scripts')),['main.js']);
});
