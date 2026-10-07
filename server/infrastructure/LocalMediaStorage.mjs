import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from './json-files.mjs';
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
export const mediaFile = /^[a-f0-9-]{36}\.(png|jpg|webp|gif|pdf)$/;
export function detectFileType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return '.jpg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return '.gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return '.webp';
  if (bytes.subarray(0, 5).toString() === '%PDF-') return '.pdf';
  return '';
}
export class LocalMediaStorage {
  constructor(dataDir) { this.directory = resolve(dataDir, 'uploads'); this.trash = resolve(dataDir, 'trash', 'uploads'); }
  async initialize() { await Promise.all([this.directory, this.trash].map(path => mkdir(path, { recursive: true, mode: 0o700 }))); return this; }
  async list(archived = false) {
    const folder = archived ? this.trash : this.directory;
    const files = (await readdir(folder)).filter(name => name.endsWith('.json') && mediaFile.test(name.slice(0, -5)));
    const rows = await Promise.all(files.map(async name => JSON.parse(await readFile(resolve(folder, name), 'utf8'))));
    return rows.sort((a, b) => b.created.localeCompare(a.created));
  }
  async info(file, archived = false) {
    if (!mediaFile.test(file)) throw Object.assign(new Error('File not found.'), { status: 404 });
    try { return JSON.parse(await readFile(resolve(archived ? this.trash : this.directory, file + '.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw Object.assign(new Error('File not found.'), { status: 404 }); throw error; }
  }
  async upload(bytes, declaredType, name, dimensions = {}) {
    const ext = detectFileType(bytes);
    if (!ext || bytes.length < 16 || declaredType !== types[ext]) throw Object.assign(new Error('Upload a verified JPG, PNG, WebP, GIF, or PDF file.'), { status: 415 });
    const file = randomUUID() + ext;
    await writeFile(resolve(this.directory, file), bytes, { mode: 0o600, flag: 'wx' });
    const dimension = n => Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) <= 30000 ? Number(n) : null;
    const metadata = { url: `/uploads/${file}`, name: String(name).slice(0, 180), alt: '', type: types[ext], size: bytes.length, width: dimension(dimensions.width), height: dimension(dimensions.height), created: new Date().toISOString() };
    await atomicJson(resolve(this.directory, file + '.json'), metadata); return metadata;
  }
  async update(file, input) {
    const row = await this.info(file);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 180 || typeof input.alt !== 'string' || input.alt.length > 1200) throw Object.assign(new Error('Enter a file name and a description of at most 1200 characters.'), { status: 400 });
    row.name = input.name.trim(); row.alt = input.alt.trim(); await atomicJson(resolve(this.directory, file + '.json'), row); return row;
  }
  async move(file, restore = false) {
    await this.info(file, restore);
    const from = restore ? this.trash : this.directory, to = restore ? this.directory : this.trash;
    await rename(resolve(from, file), resolve(to, file));
    try { await rename(resolve(from, file + '.json'), resolve(to, file + '.json')); }
    catch (error) { await rename(resolve(to, file), resolve(from, file)); throw error; }
    return { ok: true };
  }
}
