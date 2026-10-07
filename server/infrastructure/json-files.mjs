import { writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export async function atomicJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, path);
}
