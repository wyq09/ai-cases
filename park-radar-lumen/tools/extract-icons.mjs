/**
 * Extracts plain SVG markup from the `naive-icons` distribution so the browser
 * app can render the library's authentic iconography with no runtime
 * dependency and no network request.
 *
 * Input : _research/naive-icons-dist.js  (a local copy, if present)
 *         otherwise it is downloaded from the npm CDN
 * Output: src/icons.js  ->  window.PR_ICONS = { AirplaneIcon: "<path .../>", ... }
 *
 *   node tools/extract-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const LOCAL = path.resolve(root, '..', '_research', 'naive-icons-dist.js');
const OUT = path.join(root, 'src', 'icons.js');
const CDN = [
    'https://unpkg.com/naive-icons/dist/index.js',
    'https://cdn.jsdelivr.net/npm/naive-icons/dist/index.js',
];

async function loadBundle() {
    if (fs.existsSync(LOCAL)) {
        console.log(`source: ${path.relative(process.cwd(), LOCAL)}`);
        return fs.readFileSync(LOCAL, 'utf8');
    }
    for (const url of CDN) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const text = await res.text();
            if (!text.includes('forwardRef')) continue;
            console.log(`source: ${url} (downloaded)`);
            fs.mkdirSync(path.dirname(LOCAL), { recursive: true });
            fs.writeFileSync(LOCAL, text);
            return text;
        } catch (e) { /* try the next mirror */ }
    }
    console.error(
        'Could not find the naive-icons bundle.\n' +
        `  Looked for a local copy at: ${LOCAL}\n` +
        `  and tried: ${CDN.join(', ')}\n` +
        '  src/icons.js is already committed, so this step is only needed to regenerate it.'
    );
    process.exit(1);
}

const src = await loadBundle();

/** Find the index just past the bracket that closes the one opened at `open`. */
function matchBracket(text, open, o = '(', c = ')') {
    let depth = 0;
    let inStr = null;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (ch === '\\') { i++; continue; }
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === o) depth++;
        else if (ch === c) { depth--; if (depth === 0) return i + 1; }
    }
    throw new Error('unbalanced');
}

/** Split an attr object literal body into top-level `key: value` entries. */
function parseAttrs(body) {
    const out = {};
    let i = 0;
    while (i < body.length) {
        // key
        const k = /^\s*([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*:/.exec(body.slice(i));
        if (!k) { i++; continue; }
        const key = k[1].replace(/^["']|["']$/g, '');
        i += k[0].length;
        // value
        const rest = body.slice(i);
        const str = /^\s*"((?:[^"\\]|\\.)*)"/.exec(rest);
        const num = /^\s*(-?\d+(?:\.\d+)?)\s*(?=,|$)/.exec(rest);
        const bool = /^\s*(true|false|null)\s*(?=,|$)/.exec(rest);
        if (str) {
            out[key] = str[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
            i += str[0].length;
        } else if (bool) {
            if (bool[1] !== 'null') out[key] = bool[1] === 'true';
            i += bool[0].length;
        } else if (num) {
            out[key] = num[1];
            i += num[0].length;
        } else if (/^\s*\[/.test(rest)) {
            const open = i + rest.indexOf('[');
            const end = matchBracket(body, open, '[', ']');
            out[key] = { __raw: body.slice(open, end) };
            i = end;
        } else if (/^\s*\{/.test(rest)) {
            const open = i + rest.indexOf('{');
            const end = matchBracket(body, open, '{', '}');
            out[key] = { __raw: body.slice(open, end) };
            i = end;
        } else {
            // unknown expression (conditional, spread) — skip to next comma at depth 0
            let j = i, depth = 0;
            for (; j < body.length; j++) {
                const ch = body[j];
                if ('([{'.includes(ch)) depth++;
                else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
                else if (ch === ',' && depth === 0) break;
            }
            i = j + 1;
        }
        // consume trailing comma
        const cm = /^\s*,/.exec(body.slice(i));
        if (cm) i += cm[0].length;
    }
    return out;
}

const ATTR_MAP = {
    strokeWidth: 'stroke-width',
    strokeLinecap: 'stroke-linecap',
    strokeLinejoin: 'stroke-linejoin',
    strokeDasharray: 'stroke-dasharray',
    strokeDashoffset: 'stroke-dashoffset',
    fillRule: 'fill-rule',
    clipRule: 'clip-rule',
    strokeOpacity: 'stroke-opacity',
    fillOpacity: 'fill-opacity',
    xmlnsXlink: 'xmlns:xlink',
    className: 'class',
    'stroke-width': 'stroke-width',
};

const VOID = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'use', 'stop']);

/** Render the `children: [...]` raw array of a jsx element call into SVG markup. */
function renderChildren(raw) {
    let out = '';
    let i = 0;
    while (i < raw.length) {
        const call = /jsxRuntime\.jsxs?\(/.exec(raw.slice(i));
        if (!call) break;
        const start = i + call.index;
        const argsOpen = raw.indexOf('(', start);
        const argsEnd = matchBracket(raw, argsOpen);
        const args = raw.slice(argsOpen + 1, argsEnd - 1);
        const tagM = /^\s*"(\w+)"/.exec(args);
        if (tagM) {
            const tag = tagM[1];
            const objStart = args.indexOf('{', tagM[0].length);
            if (objStart > -1) {
                const objEnd = matchBracket(args, objStart, '{', '}');
                const attrs = parseAttrs(args.slice(objStart + 1, objEnd - 1));
                out += renderTag(tag, attrs);
            }
        }
        i = argsEnd;
    }
    return out;
}

function renderTag(tag, attrs) {
    const parts = [];
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'children' || k === 'ref' || k === 'key' || v === undefined || v === false) continue;
        const name = ATTR_MAP[k] || k;
        parts.push(`${name}="${String(v).replace(/"/g, '&quot;')}"`);
    }
    const inner = attrs.children && attrs.children.__raw ? renderChildren(attrs.children.__raw) : '';
    if (!inner && VOID.has(tag)) return `<${tag} ${parts.join(' ')}/>`;
    return `<${tag} ${parts.join(' ')}>${inner}</${tag}>`;
}

const icons = {};
const re = /\nvar (\w+Icon) = react\.forwardRef\(/g;
let m;
while ((m = re.exec(src))) {
    const name = m[1];
    const blockEnd = src.indexOf('\n});', m.index);
    const block = src.slice(m.index, blockEnd);
    const kidsAt = block.indexOf('children:');
    if (kidsAt === -1) { console.warn('no children for', name); continue; }
    const arrOpen = block.indexOf('[', kidsAt);
    const arrEnd = matchBracket(block, arrOpen, '[', ']');
    const body = block.slice(arrOpen + 1, arrEnd - 1);
    // viewBox lives on the outer svg call
    const vb = /viewBox:\s*"([^"]+)"/.exec(block);
    const svgAttrs = [];
    if (vb) svgAttrs.push(`viewBox="${vb[1]}"`);
    // the source emits `props.title ? jsx(...) : null`; drop the empty shell it leaves behind
    const rendered = renderChildren(body)
        .replace(/<title\s*><\/title>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    icons[name] = { viewBox: vb ? vb[1] : '0 0 48 48', body: rendered };
}

const names = Object.keys(icons).sort();
const payload = {};
for (const n of names) payload[n] = icons[n].body;

const banner = `/* naive-icons (MIT) — SVG glyphs extracted from the published dist bundle.\n   Regenerate with: node tools/extract-icons.mjs\n   ${names.length} icons. */\n`;
fs.writeFileSync(OUT, `${banner}window.PR_ICONS = ${JSON.stringify(payload)};\n`);

console.log(`extracted ${names.length} icons -> ${path.relative(process.cwd(), OUT)}`);
const empty = names.filter((n) => !icons[n].body);
if (empty.length) console.warn('EMPTY:', empty.join(', '));
console.log('sample viewBoxes:', [...new Set(names.map((n) => icons[n].viewBox))].join(' | '));
console.log(names.join(' '));
