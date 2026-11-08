import { readdir, readFile } from 'node:fs/promises';
async function check(dir) {
 for (const e of await readdir(dir, { withFileTypes: true })) {
  const path = `${dir}/${e.name}`;
  if (e.isDirectory()) await check(path);
  else if (/\.(js|html)$/.test(path) && /resetEverything|Clear cards|Reset everything|\?reset|["']reset["']|["']dev["']/.test(await readFile(path, 'utf8'))) throw new Error(`Development tools shipped: ${path}`);
 }
}
await check('dist');
console.log('No development reset tools shipped.');
