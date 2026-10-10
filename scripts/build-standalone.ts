import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';

/** 我从同一次 Vite 产物生成离线单页，避免维护两套应用代码。 */
const output = resolve('dist');
let markup = await readFile(join(output, 'index.html'), 'utf8');
const notices = await Promise.all([
  readFile(resolve('docs/ORIGINAL_NOTICE.md'), 'utf8'),
  readFile(resolve('docs/THIRD_PARTY_NOTICES.md'), 'utf8'),
]);
// 单独分发 HTML 时仍附带原作和第三方许可说明；此节点不执行脚本。
markup = markup.replace('</head>', () => `<script type="text/plain" id="source-and-license-notices">${notices.join('\n\n').replace(/<\/script/gi, '<\\/script')}</script>\n</head>`);
const script = markup.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const stylesheet = markup.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
if (!script || !stylesheet) throw new Error('没有找到 Vite 主脚本或样式，无法生成单文件。');

let javascript = await readFile(join(output, script[1]), 'utf8');
const css = await readFile(join(output, stylesheet[1]), 'utf8');
for (const file of await readdir(join(output, 'help-images'))) {
  const image = await readFile(join(output, 'help-images', file));
  javascript = javascript.replaceAll(`./help-images/${file}`, `data:image/gif;base64,${image.toString('base64')}`);
}
javascript = javascript.replace(/\/\/# sourceMappingURL=.*$/gm, '').replace(/<\/script/gi, '<\\/script');
markup = markup.replace(script[0], () => `<script type="module">${javascript}</script>`);
markup = markup.replace(stylesheet[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
const favicon = (await readFile(join(output, 'favicon.svg'))).toString('base64');
markup = markup.replace(/href="\.\/favicon\.svg"/g, `href="data:image/svg+xml;base64,${favicon}"`);
// 我避免在 file:// 中请求外部资源；帮助插图已经随脚本内联。
if (/<script\b[^>]*\bsrc=/.test(markup) || /<link\b[^>]*\brel="stylesheet"/.test(markup)) {
  throw new Error('单文件仍存在外部脚本或样式引用。');
}
const filename = join(output, 'sxwnl-modern.html');
await writeFile(filename, markup, 'utf8');
// 我让下载版和 Pages 首页都来自同一次打包，避免旧 importmap 产物残留 CSS 导入。
await writeFile(resolve('sxwnl-modern.html'), markup, 'utf8');
await writeFile(resolve('docs/index.html'), markup.replace('<title>寿星天文历 · 观天知时</title>', '<title>PCalendar · 国际日历与天文计算</title>'), 'utf8');
console.log(`离线单文件：dist/${basename(filename)}（${(Buffer.byteLength(markup) / 1024).toFixed(0)} KiB）`);
