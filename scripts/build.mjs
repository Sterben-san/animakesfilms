import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createDefaultContent, migrateContent } from './content-model.js';
import { normalizeContent, publishedContent } from '../server/domain/portfolio.mjs';
import { renderPortfolio, renderProjectsPage, renderProjectPage } from './render.mjs';
import { pathToFileURL } from 'node:url';
export async function buildPortfolio(root = new URL('../', import.meta.url)) {
const dist = new URL('dist/', root);
let content;
try { content = JSON.parse(await readFile(new URL('.local/portfolio.json', root), 'utf8')).content; }
catch (error) { if (error.code !== 'ENOENT') throw error; content = createDefaultContent(); }
content = publishedContent(normalizeContent(migrateContent(content)));
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('scripts/', dist), { recursive: true });
await mkdir(new URL('projects/', dist), { recursive: true });
await writeFile(new URL('index.html', dist), renderPortfolio(content));
await writeFile(new URL('projects/index.html', dist), renderProjectsPage(content));
for (const project of content.projects.items) {
  const folder = new URL(`projects/${project.slug}/`, dist); await mkdir(folder, { recursive: true });
  await writeFile(new URL('index.html', folder), renderProjectPage(content, project.slug));
}
for (const path of ['styles/main.css', 'assets', 'scripts/main.js']) await cp(new URL(path, root), new URL(path, dist), { recursive: true });
const files = new Set();
function scan(value) {
  if (typeof value === 'string' && /^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif|pdf)$/.test(value)) files.add(value.slice(9));
  else if (value && typeof value === 'object') Object.values(value).forEach(scan);
}
scan(content); await mkdir(new URL('uploads/', dist), { recursive: true });
for (const file of files) await cp(new URL('.local/uploads/'+file, root), new URL('uploads/'+file, dist));
return dist;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await buildPortfolio();
  console.log('Published portfolio and project pages built in dist/. Drafts and admin files are excluded.');
}
