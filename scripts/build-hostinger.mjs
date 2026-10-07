import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['app.js', 'admin.html', 'assets', 'styles', 'server', 'scripts', 'package-lock.json']) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true, filter: path => !path.includes('/vendor') });
}
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
// The deployed artifact contains runtime code and no development dependencies.
delete pkg.devDependencies;
pkg.scripts = { start: 'node app.js' };
await writeFile(new URL('package.json', output), JSON.stringify(pkg, null, 2) + '\n');
const install = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: fileURLToPath(output), stdio: 'inherit' });
if (install.error) throw install.error;
if (install.status !== 0) throw new Error('Production dependency installation failed.');
console.log('Hostinger Node application built in dist/; entry file app.js. Credentials and local data excluded.');
