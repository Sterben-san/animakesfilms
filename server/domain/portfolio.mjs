import { randomUUID } from 'node:crypto';
import { validateContent } from '../../scripts/content-model.js';

export const collections = { projects: ['projects', 'items'], videos: ['showreel', 'videos'], pictures: ['gallery', 'pictures'], achievements: ['achievements', 'items'] };
export const slugify = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/g, '');
export function normalizeContent(input) {
  const content = validateContent(input);
  for (const [section, key] of Object.values(collections)) {
    const ids = new Set();
    for (const item of content[section][key]) {
      if (!/^[a-f0-9-]{36}$/.test(item.id) || ids.has(item.id)) item.id = randomUUID();
      ids.add(item.id);
    }
  }
  const used = new Set(content.projects.items.map(p => p.slug).filter(Boolean));
  if (used.size !== content.projects.items.filter(p => p.slug).length) throw new Error('Project page addresses must be unique.');
  for (const project of content.projects.items) {
    if (project.slug) continue;
    const base = slugify(project.title) || 'project';
    let slug = base, suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    project.slug = slug; used.add(slug);
  }
  return content;
}
export function publishedContent(input) {
  const content = structuredClone(input);
  for (const [section, key] of Object.values(collections)) content[section][key] = content[section][key].filter(item => item.published);
  return content;
}
export function assetReferences(content, url) {
  const paths = [];
  function visit(value, path) {
    if (value === url) paths.push(path);
    else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => visit(v, path ? `${path}.${k}` : k));
  }
  visit(content, ''); return paths;
}
export function summarizeContent(record, media) {
  const summary = { revision: record.revision, savedAt: record.savedAt || null, collections: {}, mediaCount: media.length, missingAlt: [] };
  for (const [label, [section, key]] of Object.entries(collections)) {
    const rows = record.content[section][key];
    summary.collections[label] = { total: rows.length, published: rows.filter(p => p.published).length, drafts: rows.filter(p => !p.published).length };
  }
  for (const file of media) if (file.type.startsWith('image/') && !file.alt?.trim()) summary.missingAlt.push(file.name);
  return summary;
}
