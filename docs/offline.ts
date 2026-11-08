import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const publicFiles = ['favicon.svg', 'FORMAT.md', 'theme-init.js', 'manifest.webmanifest', 'you-icon.svg'];
export function offlineShell(): Plugin {
  return {
    name: 'offline-shell', apply: 'build', enforce: 'post',
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      const paths = [...Object.keys(bundle).filter(p => p === 'index.html' || /^assets\/[^?#]+\.(js|css|wasm)$/.test(p)), ...publicFiles].sort();
      const hash = createHash('sha256');
      for (const path of paths) {
        hash.update(path);
        const item = bundle[path];
        hash.update(item ? item.type === 'chunk' ? item.code : item.source : readFileSync(new URL('../public/' + path, import.meta.url)));
      }
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__PRECACHE__', JSON.stringify(paths)).replace('__VERSION__', hash.digest('hex').slice(0, 24)) });
    },
  };
}

