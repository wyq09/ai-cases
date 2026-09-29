/**
 * Bundles src/* into one self-contained index.html.
 * No bundler, no dependencies — just concatenation, in dependency order.
 *
 *   node tools/build.mjs            # write index.html
 *   node tools/build.mjs --check    # build to memory and sanity-check only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'src', f);
const read = (f) => fs.readFileSync(src(f), 'utf8');

const JS_ORDER = ['icons.js', 'data.js', 'core.js', 'art.js', 'agent.js', 'ui.js', 'pages.js'];
const CSS_ORDER = ['base.css', 'app.css'];

const check = process.argv.includes('--check');

const css = CSS_ORDER.map((f) => `/* ===== ${f} ===== */\n${read(f)}`).join('\n');
const js = JS_ORDER.map((f) => `/* ===== ${f} ===== */\n${read(f)}`).join('\n;\n');

const title = '公园雷达 · Lumen — 公园查询 H5';
const desc =
    '公园雷达 · Lumen：单文件离线 H5。58 座公园的列表 / 详情 / 我的（收藏·点赞·足迹）+ 会说人话的小岛智能助手。';

const favicon =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E" +
    "%3Ccircle cx='24' cy='24' r='22' fill='%2319c8b9'/%3E" +
    "%3Ccircle cx='24' cy='24' r='14' fill='none' stroke='%23fffdf3' stroke-width='2' opacity='.55'/%3E" +
    "%3Cpath d='M24 24 L24 6' stroke='%23fffdf3' stroke-width='3' stroke-linecap='round'/%3E" +
    "%3Ccircle cx='32' cy='17' r='3' fill='%23ffdf8a'/%3E%3C/svg%3E";

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#19c8b9">
<meta name="color-scheme" content="light">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="公园雷达">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="icon" href="${favicon}">
<link rel="apple-touch-icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="boot">
  <div class="boot-card">
    <div class="boot-radar"><span></span></div>
    <div class="boot-title">公园雷达</div>
    <div class="boot-sub">LUMEN · 正在扫描城市公园…</div>
  </div>
</div>
<noscript>
  <div style="padding:40px 24px;font-family:system-ui,sans-serif;color:#794f27;background:#f8f8f0;min-height:100vh">
    <h1 style="font-size:20px">需要开启 JavaScript</h1>
    <p style="margin-top:10px;line-height:1.7">公园雷达是一个单文件 H5 应用，页面结构、公园数据与所有插画都在浏览器里实时生成。请开启 JavaScript 后重新打开。</p>
  </div>
</noscript>
<script>
${js}
</script>
<script>
(function () {
  function start() {
    try {
      window.PR_BOOT();
      var b = document.getElementById('boot');
      if (b) { b.style.transition = 'opacity .4s ease'; b.style.opacity = '0'; setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 420); }
    } catch (err) {
      var b = document.getElementById('boot');
      if (b) b.innerHTML = '<div style="padding:28px;font-family:system-ui;color:#794f27;text-align:center">'
        + '<div style="font-size:18px;font-weight:800">启动失败</div>'
        + '<div style="margin-top:8px;font-size:13px;line-height:1.7">' + String(err && err.message || err) + '</div></div>';
      throw err;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>
</body>
</html>
`;

// ---- sanity checks -------------------------------------------------------
const problems = [];
if (/\bundefined\b/.test(css)) problems.push('CSS contains the literal word "undefined"');
for (const f of JS_ORDER) {
    const body = read(f);
    if (!body.trim()) problems.push(`${f} is empty`);
}
for (const need of ['PR_ICONS', 'PR_DATA', 'PR_ART', 'PR_AGENT', 'PR_UI', 'PR_BOOT', 'animal-modal-clip', 'gooFilter', 'rareui.com']) {
    if (!html.includes(need)) problems.push(`bundle is missing "${need}"`);
}
// the icon map must be complete
{
    const m = js.match(/window\.PR_ICONS = (\{[\s\S]*?\});/);
    if (!m) problems.push('could not locate PR_ICONS payload');
    else {
        const n = (m[1].match(/Icon":/g) || []).length;
        if (n < 120) problems.push(`only ${n} icons in payload`);
    }
}
const parks = (js.match(/^\s+id: '/gm) || []).length;

console.log(`css   ${(css.length / 1024).toFixed(1)} KB  (${CSS_ORDER.join(' + ')})`);
console.log(`js    ${(js.length / 1024).toFixed(1)} KB  (${JS_ORDER.join(' + ')})`);
console.log(`html  ${(html.length / 1024).toFixed(1)} KB`);
console.log(`parks ${parks}`);
if (problems.length) {
    console.error('\nPROBLEMS:');
    problems.forEach((p) => console.error('  - ' + p));
    process.exitCode = 1;
} else {
    console.log('checks OK');
}

if (!check) {
    const out = path.join(root, 'index.html');
    fs.writeFileSync(out, html);
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
}
