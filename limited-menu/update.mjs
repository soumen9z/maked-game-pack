import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMenu } from './sources.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('./dist/', import.meta.url));
const menu = await loadMenu();
for (const chain of menu.chains) console.log(chain.id, chain.status, chain.items.length);
if (menu.chains.every(chain => chain.status === 'unavailable')) {
  throw new Error('公式情報を取得できなかったため、公開用の一覧は更新しません。');
}
await mkdir(output, { recursive: true });
if (resolve(source) !== resolve(output)) {
  await Promise.all(['index.html', 'style.css', 'app.js', 'availability.js'].map(file =>
    copyFile(new URL(file, import.meta.url), join(output, file))
  ));
}
const temporary = join(output, 'menu.json.tmp');
await writeFile(temporary, JSON.stringify(menu, null, 2) + '\n');
await rename(temporary, join(output, 'menu.json'));
