import { schema, defaultValue, validateContent, safeUrl } from './content-model.js';
import { dialog, confirmAction, cropImage, uploadWithProgress } from './admin/media-tools.js';
const diagnostics = new URLSearchParams(location.search).has('debug');
const trace = (event, details = {}) => { if (diagnostics) console.debug('[portfolio-admin]', JSON.stringify({ event, ...details })); };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let content, saved, revision, csrf = '', dirty = false, busy = false, active = location.pathname.split('/')[3] || 'overview', trash = false, mediaRequest = 0, overviewRequest = 0;
if (!schema[active] && !['overview','media'].includes(active)) active = 'overview';
const descriptions = { overview: 'Manage your work, publish new stories and keep your media organized.', site: 'Your name, branding, résumé and search information.', hero: 'The first impression: headline, roles, availability and buttons.', appearance: 'Set the colors, typography and motion.', order: 'Choose the order of the sections on your main page.', about: 'Introduce the author with a biography, portrait and key details.', showreel: 'Add YouTube videos. Paste a video URL to use its thumbnail automatically.', projects: 'Share the author’s work, responsibilities and project images.', gallery: 'Upload pictures and tell the story behind each one.', skills: 'Create skill groups and set each proficiency level.', experience: 'Add roles, milestones and dates to your timeline.', achievements: 'Share awards, recognition and certificate links.', contact: 'Add public contact details and social profiles.', footer: 'Edit the closing information and links.', media: 'Uploaded images and PDFs stay saved in your local workspace.' };
async function api(path, options = {}) {
  const started = performance.now();
  const headers = { ...options.headers };
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  trace('api.response', { path, method: options.method || 'GET', status: response.status, milliseconds: Math.round(performance.now() - started) });
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') { showLogin(); $('login-error').textContent = 'Sign in to continue. Your unsaved changes are retained in this tab.'; }
    throw new Error(data.error || 'Could not complete the request.');
  }
  return data;
}
function get(path) { return path.split('.').reduce((v, k) => v[k], content); }
function set(path, value) { const parts = path.split('.'), key = parts.pop(); parts.reduce((v, k) => v[k], content)[key] = value; }
function changed() { dirty = JSON.stringify(content) !== JSON.stringify(saved); $('save-status').textContent = dirty ? 'Unsaved changes' : 'All changes saved'; $('save-status').classList.toggle('dirty', dirty); $('discard').hidden = !dirty; }
function status(message) { $('save-status').textContent = message; }
function error(message = '') { $('editor-error').textContent = message; }
function showLogin() { $('workspace').hidden = true; $('login-screen').hidden = false; csrf = ''; }
const controlStates = new WeakMap();
function syncControls() {
  $('editor-form').setAttribute('aria-busy', String(busy));
  document.querySelectorAll('#editor-form input, #editor-form textarea, #editor-form select, #editor-form button, #editor-nav button, #save, #discard, #logout, #quick-post').forEach(control => {
    if (busy) { if (!controlStates.has(control)) controlStates.set(control, control.disabled); control.disabled = true; }
    else if (controlStates.has(control)) { control.disabled = controlStates.get(control); controlStates.delete(control); }
  });
}
function setBusy(value) { busy = value; syncControls(); }
function filterList(section) {
  const search = section.querySelector('[data-list-search]'), publication = section.querySelector('[data-list-status]');
  if (!search || !publication) return;
  const path = search.dataset.listSearch, rows = [...section.querySelectorAll('details[data-list]')].filter(row => row.dataset.list === path);
  rows.forEach((row,index) => {
    const item = get(path)[index];
    row.dataset.listTitle = JSON.stringify(item).toLowerCase(); row.dataset.published = String(item.published);
    trace('list.filter', { path, index, indexedPublished: row.dataset.published, modelPublished: item.published, staleIndex: false });
    row.hidden = !row.dataset.listTitle.includes(search.value.toLowerCase()) || (publication.value !== 'all' && item.published !== (publication.value === 'published'));
  });
}
function refreshEntry(path) {
  const parts = path.split('.');
  for (let index=parts.length-1;index>=1;index--) {
    if (!/^\d+$/.test(parts[index])) continue;
    const listPath = parts.slice(0,index).join('.'), rowIndex = Number(parts[index]), item = get(listPath)[rowIndex];
    const row = [...document.querySelectorAll('details[data-list]')].filter(row => row.dataset.list === listPath)[rowIndex];
    if (!row) continue;
    const field = fieldFor(listPath);
    row.querySelector('summary').innerHTML = `${'published' in item ? `<span class="record-badge ${item.published ? 'live' : ''}">${item.published ? 'Published' : 'Draft'}</span>` : ''} ${esc(item.title || item.name || item.label || item.value || `${field.label} ${rowIndex+1}`)}`;
    filterList(row.closest('.list-group'));
  }
}
function fieldFor(path) {
  const parts = path.split('.'); let field = schema[parts.shift()];
  for (const key of parts) field = field.type === 'list' ? field.item : field.fields[key];
  return field;
}
function fieldHtml(field, path, value) {
  if (field.hidden) return '';
  const id = `f-${path}`, label = esc(field.label);
  if (field.type === 'group') return `<fieldset class="form-group"><legend>${label}</legend>${Object.entries(field.fields).map(([k, f]) => fieldHtml(f, `${path}.${k}`, value[k])).join('')}</fieldset>`;
  if (field.type === 'list') return `<section class="list-group"><div class="list-header"><h2>${label}</h2><button type="button" class="secondary" data-add="${path}">Add ${label.toLowerCase()}</button></div>${field.item.fields.published ? `<div class="list-filters"><label>Search ${label.toLowerCase()}<input type="search" data-list-search="${path}"></label><label>Publication status<select data-list-status="${path}"><option value="all">All entries</option><option value="published">Published</option><option value="draft">Drafts</option></select></label></div>` : ''}${value.length ? value.map((item, i) => `<details class="entry" data-list="${path}" data-list-title="${esc(JSON.stringify(item).toLowerCase())}" data-published="${item.published}" open><summary>${'published' in item ? `<span class="record-badge ${item.published ? 'live' : ''}">${item.published ? 'Published' : 'Draft'}</span>` : ''} ${esc(item.title || item.name || item.label || item.value || `${field.label} ${i + 1}`)}</summary><div class="entry-body">${Object.entries(field.item.fields).map(([k, f]) => fieldHtml(f, `${path}.${i}.${k}`, item[k])).join('')}<div class="entry-actions"><button type="button" data-move="${path}" data-index="${i}" data-delta="-1" ${i === 0 ? 'disabled' : ''}>Move up</button><button type="button" data-move="${path}" data-index="${i}" data-delta="1" ${i === value.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" data-duplicate="${path}" data-index="${i}">Duplicate</button><button type="button" class="remove" data-remove="${path}" data-index="${i}">Remove entry</button></div></div></details>`).join('') : '<div class="empty-list">No entries yet. Add your first one above.</div>'}</section>`;
  if (field.type === 'order') return `<div class="order-list">${value.map((key, i) => `<div class="order-row"><span>${esc(schema[key].label)}${content[key].settings.enabled ? '' : ' · hidden'}</span><div><button type="button" data-move="order" data-index="${i}" data-delta="-1" aria-label="Move ${key} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="order" data-index="${i}" data-delta="1" aria-label="Move ${key} down" ${i === value.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('')}</div>`;
  if (field.type === 'boolean') return `<div class="field check"><input id="${id}" type="checkbox" data-path="${path}" ${value ? 'checked' : ''}><label for="${id}">${label}</label></div>`;
  const common = `id="${id}" data-path="${path}" ${field.required ? 'required' : ''}`;
  let input;
  if (field.type === 'textarea') input = `<textarea ${common}>${esc(value)}</textarea>`;
  else if (field.type === 'select') input = `<select ${common}>${field.options.map(option => `<option ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  else input = `<input ${common} type="${field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'}" value="${esc(value)}" ${field.type === 'number' ? `min="${field.min}" max="${field.max}"` : ''} ${field.type === 'video' ? 'placeholder="https://www.youtube.com/watch?v=…"' : ''}>`;
  if (field.type === 'asset') input += `<button type="button" class="secondary" data-pick="${path}">Choose existing file</button><div class="asset-file"><label for="upload-${path}">Upload ${label.toLowerCase()}</label><input id="upload-${path}" type="file" data-upload="${path}" accept="${field.accept === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/gif'}"></div>${value && safeUrl(value, true) ? field.accept === 'pdf' ? `<a class="back-link" href="${esc(value)}" target="_blank" rel="noopener">Open current PDF</a>` : `<img class="asset-preview" src="${esc(value)}" alt="Current ${label.toLowerCase()}">` : ''}<p class="hint">${field.accept === 'pdf' ? 'PDF' : 'JPG, PNG, WebP or GIF'} · up to 10 MB. You can also paste a file URL.</p>`;
  return `<div class="field ${['textarea', 'asset'].includes(field.type) ? 'wide' : ''}"><label for="${id}">${label}</label>${input}</div>`;
}
function nav() {
  $('editor-nav').innerHTML = [['overview', { label: 'Dashboard' }], ...Object.entries(schema), ['media', { label: 'Media library' }]].map(([k, f]) => `<button type="button" data-tab="${k}" class="${active === k ? 'active' : ''}" ${active === k ? 'aria-current="page"' : ''}>${esc(f.label)}</button>`).join('');
}
async function render() {
  trace('editor.render', { active, busy, dirty, revision });
  nav(); error(); $('editor-title').textContent = schema[active]?.label || (active === 'overview' ? 'Dashboard' : 'Media library'); $('editor-description').textContent = descriptions[active];
  if (active === 'overview') await renderOverview();
  else if (active === 'media') await renderMedia();
  else {
    const field = schema[active];
    $('editor-form').innerHTML = field.type === 'group' ? Object.entries(field.fields).map(([k, f]) => fieldHtml(f, `${active}.${k}`, content[active][k])).join('') : fieldHtml(field, active, content[active]);
  }
  syncControls();
}
const contentLists = { project: ['projects','items'], video: ['showreel','videos'], picture: ['gallery','pictures'] };
function go(tab) { active = schema[tab] || ['overview','media'].includes(tab) ? tab : 'overview'; history.pushState({}, '', '/admin/dashboard/' + active); render(); }
function quick(kind) { const [section,key] = contentLists[kind]; content[section][key].push(defaultValue(schema[section].fields[key].item)); changed(); go(section); }
async function renderOverview() {
  const request = ++overviewRequest;
  $('editor-form').innerHTML = '<p>Loading your dashboard…</p>';
  try {
    const summary = await api('/api/admin/summary'); if (active !== 'overview' || request !== overviewRequest) return;
    $('editor-form').innerHTML = `<div class="dashboard-grid">${Object.entries(summary.collections).map(([key,v]) => `<button class="dashboard-card" type="button" data-tab="${key === 'videos' ? 'showreel' : key === 'pictures' ? 'gallery' : key}"><span>${esc(key)}</span><strong>${v.total}</strong><small>${v.published} published · ${v.drafts} drafts</small></button>`).join('')}<button type="button" class="dashboard-card" data-tab="media"><span>Media library</span><strong>${summary.mediaCount}</strong><small>${summary.missingAlt.length} without descriptions</small></button></div><section class="dashboard-panel"><h2>Create something new</h2><p>New entries start as drafts. Check “Publish on portfolio” and save when ready.</p><div class="quick-actions"><button type="button" data-quick="project">New project</button><button type="button" data-quick="video">YouTube video</button><button type="button" data-quick="picture">Picture post</button></div></section><section class="dashboard-panel"><h2>Publishing</h2><p>Saved revision ${summary.revision}. ${summary.savedAt ? 'Last saved ' + esc(new Date(summary.savedAt).toLocaleString()) : 'Your studio is ready.'}</p><p>Dashboard counts describe your saved content. Drafts stay inside the admin studio.</p><a class="back-link" href="/projects" target="_blank" rel="noopener">Open project explorer</a></section>`;
  } catch (err) { error(err.message); }
}
function uses(value, url) { return typeof value === 'string' ? value === url : value && typeof value === 'object' ? Object.values(value).some(v => uses(v,url)) : false; }
async function renderMedia() {
  const request = ++mediaRequest;
  $('editor-form').innerHTML = `<div class="media-library"><div class="quick-actions"><button type="button" data-trash="0" ${!trash ? 'disabled' : ''}>Current files</button><button type="button" data-trash="1" ${trash ? 'disabled' : ''}>Archive</button></div>${trash ? '' : '<label for="library-upload">Upload images or PDF files</label><input id="library-upload" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf">'}<label for="media-search">Search files</label><input id="media-search" type="search" placeholder="File name or description"><div id="media-grid" class="media-grid"></div></div>`;
  try {
    const requestedTrash = trash;
    const media = await api('/api/admin/media' + (trash ? '?trash=1' : ''));
    trace('media.response', { requestedTrash, currentTrash: trash, active, count: media.length });
    const grid = $('media-grid'); if (!grid || active !== 'media' || request !== mediaRequest || requestedTrash !== trash) { trace('media.response.ignored', { request, currentRequest: mediaRequest }); return; }
    grid.innerHTML = media.length ? media.map(m => `<article class="media-card" data-media-search="${esc((m.name+' '+m.alt+' '+m.type).toLowerCase())}">${trash ? '<div class="pdf-tile">Archived</div>' : m.type === 'application/pdf' ? '<div class="pdf-tile">PDF</div>' : `<img src="${esc(m.url)}" alt="${esc(m.alt || m.name)}">`}<p>${esc(m.name)} · ${Math.round(m.size/1024)} KB${m.width && m.height ? ` · ${m.width} × ${m.height}` : ''}</p><p class="hint">${m.references.length} saved uses${m.alt ? '' : ' · no description'}</p>${trash ? `<button type="button" data-restore="${esc(m.url)}">Restore file</button>` : `<button type="button" data-copy="${esc(m.url)}">Copy file URL</button><button type="button" data-metadata="${esc(m.url)}">Edit details</button><button type="button" data-archive="${esc(m.url)}" ${uses(content,m.url) ? 'disabled title="Remove this file from content and save first"' : ''}>Archive file</button>`}</article>`).join('') : '<p class="empty-list">No files here yet.</p>';
    $('media-search').oninput = event => grid.querySelectorAll('[data-media-search]').forEach(card => { card.hidden = !card.dataset.mediaSearch.includes(event.target.value.toLowerCase()); });
  } catch (err) { error(err.message); }
}
async function upload(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
  if (!['image/png','image/jpeg','image/webp','image/gif','application/pdf'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, GIF, or PDF file.');
  return uploadWithProgress(file, csrf, percent => status(`Uploading ${percent}%…`));
}
async function pickAsset(path) {
  const field = fieldFor(path), rows = (await api('/api/admin/media')).filter(m => field.accept === 'pdf' ? m.type === 'application/pdf' : m.type.startsWith('image/'));
  const picked = await dialog('Choose an existing file', `<label>Search files<input type="search" data-search></label><div class="media-grid">${rows.map(m => `<button type="button" class="media-card" data-file="${esc(m.url)}" data-name="${esc((m.name+' '+m.alt).toLowerCase())}">${m.type === 'application/pdf' ? '<div class="pdf-tile">PDF</div>' : `<img src="${esc(m.url)}" alt="${esc(m.alt || m.name)}">`}<span>${esc(m.name)}</span></button>`).join('') || '<p>No matching files. Upload one first.</p>'}</div>`, (d,done) => {
    d.querySelector('[data-search]').oninput = ev => d.querySelectorAll('[data-file]').forEach(b => b.hidden = !b.dataset.name.includes(ev.target.value.toLowerCase()));
    d.querySelectorAll('[data-file]').forEach(b => b.onclick = () => done(rows.find(m => m.url === b.dataset.file)));
  });
  if (picked) { set(path,picked.url); const parts = path.split('.'); parts.pop(); const parent = get(parts.join('.')); if ('alt' in parent && !parent.alt) parent.alt = picked.alt; changed(); render(); }
}
async function editMetadata(url) {
  const item = (await api('/api/admin/media')).find(m => m.url === url);
  const next = await dialog('File details', `<label>File name<input data-name value="${esc(item.name)}"></label><label>Image description<textarea data-alt>${esc(item.alt)}</textarea></label><p class="hint">This description is offered when you reuse the file. Each page also has its own editable description.</p><button type="button" class="primary" data-submit>Save file details</button>`, (d,done) => d.querySelector('[data-submit]').onclick = () => done({ name:d.querySelector('[data-name]').value,alt:d.querySelector('[data-alt]').value }));
  if (next) { await api('/api/admin/media/'+url.split('/').pop(), { method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(next) }); await renderMedia(); status('File details saved'); }
}
async function loadEditor(session) {
  csrf = session.csrf; $('account-email').textContent = session.email;
  const record = await api('/api/admin/content');
  const restoreDraft = dirty && content;
  if (!restoreDraft) { content = record.content; saved = structuredClone(content); revision = record.revision; }
  $('login-screen').hidden = true; $('workspace').hidden = false; changed(); await render();
  if (restoreDraft && revision !== record.revision) error('The portfolio changed while you were signed out. Discard unsaved changes to load the latest version before editing again.');
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').textContent = ''; $('login-button').disabled = true;
  try { await loadEditor(await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) })); $('password').value = ''; }
  catch (err) { $('login-error').textContent = err.message; }
  finally { $('login-button').disabled = false; }
});
$('editor-nav').addEventListener('click', event => { const tab = event.target.closest('[data-tab]'); if (tab && !busy) { go(tab.dataset.tab); window.scrollTo(0, 0); } });
$('editor-form').addEventListener('submit', event => event.preventDefault());
$('editor-form').addEventListener('input', event => {
  if (busy) { trace('editor.input.blocked', { active }); return; }
  if (event.target.dataset.listSearch || event.target.dataset.listStatus) { filterList(event.target.closest('.list-group')); return; }
  const path = event.target.dataset.path; if (!path) return;
  trace('editor.input', { path, busy, active });
  if (path === 'site.name') {
    const previous = content.site.name;
    for (const related of ['site.brand', 'hero.title', 'footer.name', 'footer.copyright']) if (get(related) === previous) set(related, event.target.value);
  }
  set(path, event.target.type === 'checkbox' ? event.target.checked : event.target.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value); changed(); refreshEntry(path); error();
});
$('editor-form').addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.dataset.tab) go(button.dataset.tab);
  if (button.dataset.quick) quick(button.dataset.quick);
  if (button.dataset.trash) { trash = button.dataset.trash === '1'; renderMedia(); }
  if (button.dataset.duplicate) { const list = get(button.dataset.duplicate), copy = structuredClone(list[Number(button.dataset.index)]); if ('id' in copy) copy.id = ''; if ('slug' in copy) copy.slug = ''; if ('published' in copy) copy.published = false; list.splice(Number(button.dataset.index)+1,0,copy); changed(); render(); }
  if (button.dataset.pick || button.dataset.metadata || button.dataset.archive || button.dataset.restore) {
    setBusy(true);
    try {
      if (button.dataset.pick) await pickAsset(button.dataset.pick);
      if (button.dataset.metadata) await editMetadata(button.dataset.metadata);
      const url = button.dataset.archive || button.dataset.restore;
      if (url && (button.dataset.restore || await confirmAction('Archive file?', 'This unused file will move to the archive. You can restore it later.'))) { await api('/api/admin/media/'+url.split('/').pop()+'/'+(button.dataset.restore ? 'restore' : 'archive'),{method:'POST'}); renderMedia(); status(button.dataset.restore ? 'File restored' : 'File archived'); }
    } catch(err) { error(err.message); }
    finally { setBusy(false); }
  }
  if (button.dataset.add) { const path = button.dataset.add; get(path).push(defaultValue(fieldFor(path).item)); changed(); render(); }
  if (button.dataset.remove) { get(button.dataset.remove).splice(Number(button.dataset.index), 1); changed(); render(); }
  if (button.dataset.move) { const list = get(button.dataset.move), index = Number(button.dataset.index), target = index + Number(button.dataset.delta); [list[index], list[target]] = [list[target], list[index]]; changed(); render(); }
  if (button.dataset.copy) {
    try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; }
    catch { error(`File URL: ${button.dataset.copy}`); }
  }
});
$('editor-form').addEventListener('change', async event => {
  if (event.target.type !== 'file' || !event.target.files.length) return;
  const path = event.target.dataset.upload, files = [...event.target.files]; if (busy) return; setBusy(true); error();
  try {
    status('Uploading…');
    for (const file of files) { const prepared = path ? await cropImage(file) : file; if (!prepared) continue; const media = await upload(prepared); if (path) set(path, media.url); }
    changed(); if (!path) status('Files uploaded'); await render();
  } catch (err) { if (err.status === 401) { showLogin(); $('login-error').textContent = 'Sign in to continue. Your unsaved changes are retained in this tab.'; } trace('upload.failed', { status: err.status || null, loginVisible: !$('login-screen').hidden }); error(err.message); status('Upload failed'); }
  finally { event.target.value = ''; setBusy(false); }
});
$('save').addEventListener('click', async () => {
  if (busy) return;
  try {
    const next = validateContent(content); trace('save.start', { revision, active }); setBusy(true); status('Saving…'); error();
    const result = await api('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, content: next }) });
    trace('save.response', { revision: result.revision, changedDuringRequest: JSON.stringify(content) !== JSON.stringify(next) });
    content = result.content; saved = structuredClone(content); revision = result.revision; changed(); status('Saved · published entries are live'); await render();
    localStorage.setItem('portfolio-updated', String(Date.now()));
  } catch (err) { error(err.message); status('Changes have not been saved'); }
  finally { setBusy(false); }
});
$('discard').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { const record = await api('/api/admin/content'); content = record.content; saved = structuredClone(content); revision = record.revision; changed(); await render(); }
  catch (err) { error(err.message); }
  finally { setBusy(false); }
});
$('logout').addEventListener('click', async () => { if (busy) return; if (dirty) { error('Save or discard your changes before signing out.'); return; } setBusy(true); try { await api('/api/logout', { method: 'POST' }); showLogin(); } catch (err) { error(err.message); } finally { setBusy(false); } });
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
try { await loadEditor(await api('/api/session')); } catch { showLogin(); }

window.addEventListener('popstate', () => { if (busy) { history.pushState({}, '', '/admin/dashboard/' + active); trace('navigation.blocked', { active }); return; } active = location.pathname.split('/')[3] || 'overview'; if (!schema[active] && !['overview','media'].includes(active)) active = 'overview'; if (content) render(); });
$('quick-post').addEventListener('click', async () => { if (busy) return; const kind = await dialog('Quick post', '<p>Choose the type of draft to create.</p><div class="quick-actions"><button type="button" data-kind="project">Project</button><button type="button" data-kind="video">YouTube video</button><button type="button" data-kind="picture">Picture</button></div>', (d,done) => d.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => done(b.dataset.kind))); if (kind) quick(kind); });

trace('editor.ready', { active });
