/**
 * Headless test suite for the local agent + dataset.
 *   node tools/agent-test.mjs
 *
 * Verifies the two things that matter most: the parser turns a sentence into
 * the right slots, and every park it returns actually satisfies those slots.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

// minimal browser-ish sandbox
const sandbox = { console, setTimeout, clearTimeout, Math, Date, JSON, Object, Array, String, Number, parseFloat, parseInt, isNaN, Promise, fetch: globalThis.fetch, AbortController: globalThis.AbortController, RegExp, Error };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['data.js', 'agent.js']) vm.runInContext(src(f), sandbox, { filename: f });

const { PR_DATA: D, PR_AGENT: A } = sandbox;

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { pass++; return; }
    fails.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function eq(name, actual, expected) {
    ok(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const names = (r) => r.results.map((x) => x.park.name);

/* ---------------------------------------------------------- dataset sanity */
ok('dataset has parks', D.PARKS.length >= 50, `${D.PARKS.length}`);
ok('every park has a distinct id', new Set(D.PARKS.map((p) => p.id)).size === D.PARKS.length);
ok('every park has coordinates in range', D.PARKS.every((p) => p.lat > 29 && p.lat < 31.5 && p.lng > 118.5 && p.lng < 121.5));
ok('every park has a distance', D.PARKS.every((p) => typeof p.distance === 'number' && p.distance > 0));
ok('every park has at least 2 highlights', D.PARKS.every((p) => p.hi.length >= 2), D.PARKS.filter((p) => p.hi.length < 2).map((p) => p.name).join(','));
ok('every park has an intro', D.PARKS.every((p) => p.intro && p.intro.length > 20));
ok('opening hours are well formed', D.PARKS.every((p) => p.open.length === 2 && /^\d\d:\d\d$/.test(p.open[0]) && /^\d\d:\d\d$/.test(p.open[1])));
// every lexicon surface form must resolve to something in the dataset
{
    const bad = [];
    for (const [tag, forms] of Object.entries(D.LEXICON.tags)) {
        if (!forms.length) continue;
        if (!D.PARKS.some((p) => p.tags.includes(tag))) bad.push('tag:' + tag);
    }
    for (const t of Object.keys(D.LEXICON.types)) if (!D.PARKS.some((p) => p.type === t)) bad.push('type:' + t);
    for (const f of Object.keys(D.LEXICON.facilities)) if (!D.PARKS.some((p) => p.fac.includes(f))) bad.push('facility:' + f);
    for (const d of D.LEXICON.districts) if (!D.PARKS.some((p) => p.district === d)) bad.push('district:' + d);
    ok('vocabulary maps onto real data', bad.length === 0, bad.join(', '));
}

/* ------------------------------------------------------------- parse tests */
function parse(text) { return A.parseLocal(text, A.freshContext()); }

eq('问候 intent', parse('你好').intent, '打招呼');
eq('帮助 intent', parse('你能做什么').intent, '帮助');
eq('感谢 intent', parse('谢谢').intent, '感谢');
eq('清空 intent', parse('清空条件').intent, '清空');
eq('继续 intent', parse('还有吗').intent, '继续');

eq('免费 -> free', parse('免费的公园').filters.free, true);
eq('收费 -> free=false', parse('收费的也行').filters.free, false);
ok('50元以内 -> maxTicket', parse('50元以内的').filters.maxTicket === 50, JSON.stringify(parse('50元以内的').filters));
ok('3公里内 -> maxDistance', parse('3公里内的公园').filters.maxDistance === 3);
ok('附近 -> maxDistance + distance sort', parse('附近的公园').filters.maxDistance === 6 && parse('附近的公园').sort === 'distance');
ok('4.5分以上 -> minRating', parse('4.5分以上的').filters.minRating === 4.5);
ok('带娃 -> 亲子 tag', parse('带娃去哪玩').filters.tags?.includes('亲子'));
ok('露营 flag', parse('能露营的').filters.camping === true);
ok('遛狗 -> pets flag', parse('能遛狗的公园').filters.pets === true);
ok('有湖 -> 湖景 tag', parse('有湖的公园').filters.tags?.includes('湖景'), JSON.stringify(parse('有湖的公园').filters));
ok('有湖能跑步 -> 湖景 + run', (() => { const f = parse('有湖能跑步的').filters; return f.tags?.includes('湖景') && f.run === true; })());
ok('人少 -> crowdMax', parse('人少一点的').filters.crowdMax === 2);
ok('安静 -> quietMin', parse('安静点的').filters.quietMin === 4);
ok('避暑 -> shadeMin', parse('夏天避暑的').filters.shadeMin === 4);
ok('湿地 -> type', parse('湿地公园').filters.types?.includes('湿地公园'));
ok('西湖区 -> district', parse('西湖区的公园').filters.districts?.includes('西湖区'));
ok('母婴室 -> facility', parse('有母婴室的').filters.facilities?.includes('母婴室'));
ok('樱花 -> tag', parse('看樱花').filters.tags?.includes('樱花'));
ok('春天 -> season', parse('春天适合去哪').filters.season === '春');
ok('推荐3个 -> count', parse('推荐3个人少的').count === 3);
ok('最近 -> distance sort', parse('离我最近的').sort === 'distance', JSON.stringify(parse('离我最近的').sort));
ok('评分最高 -> rating sort', parse('评分最高的').sort === 'rating');
ok('不要樱花 -> excluded', (() => { const p = parse('不要有樱花的公园'); return p.exclude['樱花'] === true; })());
ok('现在开着 -> openNow', parse('现在开着的公园').filters.openNow === true);
ok('植物园 -> type vegetal', parse('植物园').filters.types?.includes('植物园'));
ok('named park is found', parse('太子湾公园怎么样').mentioned[0]?.park.id === 'taiziwan');

/* -------------------------------------------------------------- run tests */
function ctxFor(text) {
    const p = parse(text);
    const m = (function () { const c = A.freshContext(); return A.respond; })();
    return p;
}
async function ask(text, ctx) {
    return A.respond(text, ctx || A.freshContext(), {});
}

// contract: when nothing was relaxed every result must satisfy every stated
// slot; when something WAS relaxed the reply has to say so.
function honest(name, r, predicate) {
    if (r.relaxed.length === 0) {
        const bad = r.results.filter((x) => !predicate(x.park)).map((x) => x.park.name);
        ok(`${name} (strict)`, bad.length === 0, bad.join(','));
    } else {
        ok(`${name} (relaxation disclosed)`, /放宽/.test(r.text), r.text);
        ok(`${name} (relaxation is real)`, r.results.length > 0);
    }
}

// the generic noun 公园 must not be read as a park *type*
{
    const p = parse('评分4.8以上的公园');
    ok('bare 公园 is not a type filter', !(p.filters.types || []).includes('综合公园'), JSON.stringify(p.filters.types));
}

{
    const r = await ask('免费能露营的公园，推荐5个');
    ok('free+camping returns results', r.results.length > 0);
    honest('免费+露营', r, (p) => p.free && p.camping);
    ok('chip shown for 露营', r.parse.chips.some((c) => c.label.includes('露营')));
    ok('chips are unique', new Set(r.parse.chips.map((c) => c.label)).size === r.parse.chips.length, JSON.stringify(r.parse.chips));
}
{
    const r = await ask('3公里内免费的公园');
    honest('3km+免费', r, (p) => p.distance <= 3 && p.free);
}
{
    const r = await ask('评分4.7以上的公园');
    ok('rating query has plenty of strict matches', r.strictCount >= 3, String(r.strictCount));
    honest('评分4.7+', r, (p) => p.rating >= 4.7);
}
{
    const r = await ask('有湖能跑步的公园');
    ok('湖景+跑步 has strict matches', r.strictCount >= 3, String(r.strictCount));
    honest('湖景+跑步', r, (p) => p.tags.includes('湖景') && p.run);
}
{
    const r = await ask('人少又安静的公园');
    honest('人少+安静', r, (p) => p.crowd <= 2 && p.quiet >= 4);
}
{
    const r = await ask('现在开着的公园');
    honest('此刻开放', r, (p) => A.isOpenNow(p));
}
{
    const r = await ask('离我最近的5个公园');
    const ds = r.results.map((x) => x.park.distance);
    ok('distance sort is ascending', ds.every((d, i) => i === 0 || ds[i - 1] <= d), ds.join(','));
}
{
    const r = await ask('湿地公园');
    honest('湿地公园', r, (p) => p.type === '湿地公园');
}
{
    const r = await ask('西湖区的公园');
    honest('西湖区', r, (p) => p.district === '西湖区');
}
{
    const r = await ask('不要有樱花的公园，人少一点');
    ok('excluded tag never appears', r.results.every((x) => !x.park.tags.includes('樱花')));
    ok('negative chip rendered', r.parse.chips.some((c) => c.neg));
}
{
    const r = await ask('推荐3个公园');
    ok('count honoured', r.results.length <= 3, String(r.results.length));
}
{
    const r = await ask('有母婴室和停车场的公园');
    honest('母婴室+停车场', r, (p) => p.fac.includes('母婴室') && p.fac.includes('停车场'));
}
{
    // "放宽" is the user explicitly asking to trade constraints away
    const first = await ask('2公里内免费能露营的公园');
    const wider = await A.respond('放宽一点', first.ctx, {});
    ok('放宽 relaxes or already had plenty', wider.results.length >= first.results.length, `${first.results.length} -> ${wider.results.length}`);
    ok('放宽 reports what it traded away', wider.relaxed.length === 0 || /放宽/.test(wider.text), wider.text);
}

/* --------------------------------------------------------- conversation */
{
    let ctx = A.freshContext();
    const r1 = await A.respond('免费的公园', ctx, {});
    ctx = r1.ctx;
    const r2 = await A.respond('还有吗', ctx, {});
    ctx = r2.ctx;
    const ids1 = r1.results.map((x) => x.park.id);
    const ids2 = r2.results.map((x) => x.park.id);
    ok('follow-up keeps the frame', r2.ctx.filters.free === true);
    ok('follow-up surfaces new parks', ids2.some((id) => !ids1.includes(id)), `first=${ids1} second=${ids2}`);
    const r3 = await A.respond('再加上能露营的', ctx, {});
    ok('refinement narrows to free+camping', r3.results.every((x) => x.park.free && x.park.camping));
    const r4 = await A.respond('清空', r3.ctx, {});
    ok('reset produces an empty frame', Object.keys(r4.ctx.filters).length === 0);
}
{
    const r = await ask('太子湾公园怎么样');
    ok('detail mode', r.mode === 'detail');
    ok('detail names the park', r.text.includes('太子湾公园'));
    ok('detail mentions opening hours', r.text.includes('开放'));
}
{
    const r = await ask('太子湾和花港观鱼哪个好');
    ok('compare mode', r.mode === 'compare');
    ok('compare mentions both', r.text.includes('太子湾') && r.text.includes('花港观鱼'));
}
{
    const r = await ask('你能做什么');
    ok('help mode', r.mode === 'help');
    ok('help lists capabilities', r.text.includes('露营') && r.text.includes('樱花'));
}
{
    const r = await ask('我想找个能带狗去、能野餐、有大草坪、最好还免费的公园');
    ok('stacked conditions return something', r.results.length > 0, JSON.stringify(r.parse.chips));
    ok('stacked conditions all hold', r.results.every((x) =>
        x.park.pets && x.park.tags.includes('草坪') && x.park.free));
}
{
    // deliberately impossible -> must degrade honestly, never crash, never lie
    const r = await ask('0.1公里内免费有温泉还能滑雪的公园');
    ok('impossible query still answers', typeof r.text === 'string' && r.text.length > 0);
    ok('impossible query reports relaxation', r.relaxed.length > 0 || r.results.length === 0, JSON.stringify({ relaxed: r.relaxed, n: r.results.length }));
    if (r.relaxed.length) ok('relaxation is disclosed in the reply', /放宽/.test(r.text), r.text);
}
{
    const r = await ask('asdfghjkl');
    ok('gibberish does not crash', typeof r.text === 'string' && r.text.length > 0);
    ok('gibberish offers a way forward', r.suggests === undefined || r.suggests.length > 0 || r.mode !== 'results');
}

/* ------------------------------------------------- every named park works */
{
    let bad = [];
    for (const p of D.PARKS) {
        const r = await A.respond(`把 ${p.name} 的详情给我`, A.freshContext(), {});
        if (r.mode !== 'detail' || !r.text.includes(p.name.split(' · ')[0])) bad.push(p.name);
    }
    ok('every park resolves by name', bad.length === 0, bad.join(', '));
}

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exitCode = 1;
} else {
    console.log('all agent + dataset checks OK');
}
