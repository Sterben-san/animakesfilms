import { publishedContent, summarizeContent, assetReferences } from '../domain/portfolio.mjs';
export class PortfolioService {
  constructor(repository, media) { this.repository = repository; this.media = media; this.writes = Promise.resolve(); }
  adminContent() { return this.repository.read(); }
  publicContent() { const record = this.repository.read(); record.content = publishedContent(record.content); return record; }
  project(slug) { return this.publicContent().content.projects.items.find(p => p.slug === slug) || null; }
  mutate(task) { const next = this.writes.then(task); this.writes = next.catch(() => {}); return next; }
  save(content, revision) {
    return this.mutate(async () => {
      const files = new Set();
      function scan(value) {
        if (typeof value === 'string' && value.startsWith('/uploads/')) files.add(value.slice(9));
        else if (Array.isArray(value)) value.forEach(scan);
        else if (value && typeof value === 'object') Object.values(value).forEach(scan);
      }
      scan(content);
      for (const file of files) await this.media.info(file);
      return this.repository.save(content, revision);
    });
  }
  async summary() { return summarizeContent(this.adminContent(), await this.media.list()); }
  references(url) { return assetReferences(this.adminContent().content, url); }
  archive(file) {
    return this.mutate(async () => {
      if (this.references(`/uploads/${file}`).length) throw Object.assign(new Error('This file is used in saved content. Remove its references and save before archiving it.'), { status: 409 });
      return this.media.move(file);
    });
  }
  restore(file) { return this.mutate(() => this.media.move(file, true)); }
}
