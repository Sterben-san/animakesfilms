import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password, salt = randomBytes(24).toString('hex')) {
  const hash = await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: hash.toString('hex') };
}
