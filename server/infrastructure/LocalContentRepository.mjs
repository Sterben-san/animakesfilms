import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultContent, migrateContent } from '../../scripts/content-model.js';
import { normalizeContent } from '../domain/portfolio.mjs';
import { atomicJson } from './json-files.mjs';

export class LocalContentRepository {
  constructor(dataDir) { this.path = resolve(dataDir, 'portfolio.json'); this.writes = Promise.resolve(); }
  async initialize() {
    let existing;
    try { existing = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const content = normalizeContent(existing ? migrateContent(existing.content) : createDefaultContent());
    this.record = { revision: existing?.revision || 1, content, savedAt: existing?.savedAt || null };
    if (!existing || JSON.stringify(content) !== JSON.stringify(existing.content)) await atomicJson(this.path, this.record);
    return this;
  }
  read() { return structuredClone(this.record); }
  async save(content, revision) {
    const next = this.writes.then(async () => {
      if (revision !== this.record.revision) throw Object.assign(new Error('Content changed in another tab. Discard unsaved changes to load the latest version.'), { status: 409 });
      const record = { revision: this.record.revision + 1, savedAt: new Date().toISOString(), content: normalizeContent(content) };
      await atomicJson(this.path, record); this.record = record; return this.read();
    });
    this.writes = next.catch(() => {}); return next;
  }
}
