/* =====================================================================
   公园雷达 · Agent 智能助手「小屿」
   本地 NLU 引擎：意图识别 + 条件抽取 + 公园检索 + 回复生成
   可选接入 OpenAI 兼容 LLM（localStorage['park-radar:llm']）
   ===================================================================== */
const AGENT_NAME = '小屿';

const LEX = {
    greet: ['你好', '您好', 'hi', 'hello', '嗨', '哈喽', '在吗', '在么', '早上好', '中午好', '晚上好', '下午好'],
    thanks: ['谢谢', '多谢', '感谢', '蟹蟹', '3q', 'thx', 'thanks'],
    help: ['你能做什么', '你会什么', '怎么用', '帮助', '你有什么功能', '介绍一下你', '你是谁', '你叫什么', '你能干嘛', '能干什么'],
    more: ['换一批', '还有吗', '还有别的', '还有其它', '其他的', '其它的', '再来', '换几个', '别的呢', '换一个', '换换'],
    favAsk: ['我的收藏', '我收藏', '收藏了哪些', '收藏列表', '收藏的公园'],
    likeAsk: ['我点赞', '点赞了哪些', '点赞过的'],
    histAsk: ['我的足迹', '浏览记录', '浏览历史', '我去过', '看过哪些', '历史记录'],
    near: ['附近', '最近', '周边', '旁边', '近一点', '近点', '不远', '近的'],
    ratingW: ['评分高', '好评', '口碑', '评价好', '高分', '评分最高', '评价最高'],
    crowdW: ['人少', '清净', '安静', '不挤', '冷门', '小众', '避开人群', '幽静', '静谧', '没多少人', '人不多'],
    popW: ['热闹', '人气', '热门', '好玩'],
    freeW: ['免费', '不要钱', '不收费', '免票', '不花钱', '0元', '不要门票'],
    recW: ['推荐', '去哪', '哪里玩', '哪儿玩', '玩什么', '逛什么', '无聊', '周末', '今天', '明天', '出游', '溜达'],
    weatherRain: ['下雨', '雨天', '暴雨'],
    cats: {
        family: ['遛娃', '带娃', '孩子', '儿童', '宝宝', '亲子', '小朋友', '滑梯', '游乐场', '幼儿', '婴儿', '母婴', '小孩'],
        flower: ['赏花', '樱花', '梅花', '荷花', '花海', '春花', '红叶', '枫叶', '银杏', '看花', '花开'],
        lake: ['湖', '湖边', '湖景', '划船', '游船', '湖畔', '水上'],
        forest: ['森林', '树林', '徒步', '爬山', '登山', '吸氧', '山林', '山野', '爬爬'],
        camp: ['露营', '帐篷', '过夜', '篝火', '野营', '扎营', '营地'],
        pet: ['宠物', '遛狗', '带狗', '狗', '猫', '毛孩子'],
        sport: ['运动', '跑步', '夜跑', '晨跑', '骑行', '打球', '篮球', '滑板', '健身', '锻炼', '球场'],
        culture: ['文化', '书屋', '看书', '读书', '展览', '书画', '昆曲', '喝茶', '茶室', '古风', '博物馆', '美术馆', '图书馆'],
        wetland: ['湿地', '观鸟', '看鸟', '白鹭', '水鸟', '生态', '候鸟'],
    },
    feats: {
        picnic: ['野餐', '草坪', '铺垫子'],
        photo: ['拍照', '出片', '摄影', '打卡', '拍娃'],
        parking: ['停车', '开车', '自驾'],
        night: ['夜景', '晚上', '夜里', '夜晚', '灯光', '萤火虫', '夜游', '夜间'],
        bird: ['观鸟', '看鸟', '白鹭', '候鸟'],
        boat: ['划船', '游船', '脚踏船'],
        waterplay: ['戏水', '玩水', '水上乐园', '泳池'],
        pick: ['采摘', '摘果', '摘梅子', '摘草莓'],
        star: ['观星', '星星', '银河', '看星空'],
        hike: ['爬山', '登山', '徒步'],
        cafe: ['咖啡', '下午茶', '喝茶'],
        bbq: ['烧烤', '篝火'],
    },
};

/* 特征 key → 公园谓词 */
const FEAT_CHECK = {
    picnic: p => join(p).match(/野餐|草坪/),
    photo: p => join(p).match(/拍照|出片|摄影|打卡|花海|灯光森林/),
    parking: p => join(p).match(/停车|自驾/) || p.facilities.some(f => f.icon === 'CarIcon'),
    night: p => /夜|灯光|萤火/.test(join(p)) || lateClose(p),
    bird: p => /观鸟|候鸟|白鹭/.test(join(p)),
    boat: p => /划船|游船|脚踏船/.test(join(p)),
    waterplay: p => /戏水|玩水|泳池/.test(join(p)),
    pick: p => /采摘|摘果/.test(join(p)),
    star: p => /观星|银河|星空/.test(join(p)),
    hike: p => /爬山|登山|徒步|登山道|步道/.test(join(p)) || p.cat === 'forest',
    cafe: p => /咖啡|茶座|茶室/.test(join(p)) || p.facilities.some(f => f.icon === 'CoffeeIcon'),
    bbq: p => /烧烤|篝火/.test(join(p)),
    free: p => p.ticket === 0,
    quiet: p => p.crowd <= 2,
    dog: p => /宠物|遛狗|带狗/.test(join(p)) || p.cat === 'pet',
    kid: p => p.cat === 'family' || /遛娃|亲子|儿童|宝宝|滑梯|母婴/.test(join(p)),
};
const join = p => `${p.name} ${p.features.join(' ')} ${p.tags.join(' ')} ${p.desc}`;
const lateClose = p => {
    if (p.open === '全天' || p.close === '开放') return true;
    const [h] = p.close.split(':').map(Number);
    return h >= 20;
};
/* 类别谓词（lake 兼容有水的湿地） */
const CAT_CHECK = {
    lake: p => p.cat === 'lake' || !!p.scene.water || /湖/.test(join(p)),
};
const catMatch = (k, p) => (CAT_CHECK[k] ? CAT_CHECK[k](p) : p.cat === k);

/* 公园别名（模糊指认） */
const ALIASES = PARKS.map(p => {
    const short = p.name.replace(/(湿地公园|森林公园|文化园|运动公园|儿童公园|露营基地|宠物乐园|公园|园|基地)$/g, '');
    return { p, keys: [p.name, short, short.slice(0, 2), short.slice(0, 3)].filter((v, i, a) => v && v.length >= 2 && a.indexOf(v) === i) };
});

function parseQuery(text, ctx) {
    const q = String(text || '').trim();
    const low = q.toLowerCase();
    const has = arr => arr.some(w => low.includes(w));
    const res = { q, intent: 'search', cats: [], feats: [], maxDist: null, sortBy: null, needFree: false, park: null, ordinal: null, text: q };

    if (!q) { res.intent = 'empty'; return res; }
    if (q.length <= 14 && has(LEX.greet)) { res.intent = 'greet'; return res; }
    if (has(LEX.help)) { res.intent = 'help'; return res; }
    if (q.length <= 12 && has(LEX.thanks)) { res.intent = 'thanks'; return res; }
    if (has(LEX.favAsk)) { res.intent = 'favs'; return res; }
    if (has(LEX.likeAsk)) { res.intent = 'likes'; return res; }
    if (has(LEX.histAsk)) { res.intent = 'history'; return res; }
    if (has(LEX.weatherRain)) { res.intent = 'rain'; return res; }

    /* 指认具体公园 */
    for (const a of ALIASES) {
        if (a.keys.some(k => q.includes(k))) { res.intent = 'park'; res.park = a.p; return res; }
    }
    /* 序数指代上一轮结果 */
    const om = q.match(/第\s*([一二三1-3])\s*[个家]?/);
    const bare = q.match(/^([一二三1-3])$/);
    if ((om || bare) && ctx && ctx.lastResults && ctx.lastResults.length) {
        const zh = { '一': 1, '二': 2, '三': 3, '1': 1, '2': 2, '3': 3 };
        const idx = zh[(om && om[1]) || (bare && bare[1])] - 1;
        const p = PARK_BY_ID[(ctx.lastResults[idx] || {}).id];
        if (p) { res.intent = 'park'; res.park = p; return res; }
    }
    /* 换一批 */
    if (has(LEX.more)) { res.intent = 'more'; return res; }

    /* 条件抽取 */
    for (const [k, words] of Object.entries(LEX.cats)) if (has(words)) res.cats.push(k);
    for (const [k, words] of Object.entries(LEX.feats)) if (has(words)) res.feats.push(k);
    if (has(LEX.freeW)) { res.needFree = true; res.feats.push('free'); }
    if (has(LEX.crowdW)) res.feats.push('quiet');
    if (/遛娃|带娃|孩子|儿童|宝宝|亲子|小朋友/.test(q)) res.feats.push('kid');
    if (/遛狗|带狗|宠物|毛孩子/.test(q)) res.feats.push('dog');

    const dm = q.match(/(\d+(?:\.\d+)?)\s*(公里|km|千米)/i);
    if (dm) res.maxDist = parseFloat(dm[1]);
    if (has(LEX.near) && !res.maxDist) res.sortBy = 'distance';
    if (has(LEX.ratingW)) res.sortBy = 'rating';
    if (has(LEX.crowdW)) res.sortBy = res.sortBy || 'quiet';
    if (has(LEX.popW) && !res.sortBy) res.sortBy = 'popular';

    const anyFilter = res.cats.length || res.feats.length || res.maxDist || res.sortBy;
    if (!anyFilter) {
        res.intent = has(LEX.recW) ? 'recommend' : 'fallback';
    }
    return res;
}

function searchParks(parsed, offset = 0) {
    const { cats, feats, maxDist, sortBy } = parsed;
    const scored = PARKS.map(p => {
        let score = 0; const matched = [];
        cats.forEach(k => { if (catMatch(k, p)) { score += 4; matched.push(catMeta(k).label); } });
        feats.forEach(k => { const fn = FEAT_CHECK[k]; if (fn && fn(p)) { score += 3; matched.push(FEAT_LABEL[k] || k); } });
        if (maxDist != null) { if (p.distance <= maxDist) score += 2; else score -= (p.distance - maxDist) * 1.2; }
        score += p.rating * 0.8 - p.crowd * 0.25 - p.distance * 0.08;
        return { p, score, matched: [...new Set(matched)] };
    });
    const anyHard = cats.length || feats.length || maxDist != null;
    let list = scored.filter(x => !anyHard || x.score > 1.2);
    if (!list.length) list = scored;
    if (sortBy === 'distance') list.sort((a, b) => a.p.distance - b.p.distance);
    else if (sortBy === 'rating') list.sort((a, b) => b.p.rating - a.p.rating);
    else if (sortBy === 'quiet') list.sort((a, b) => a.p.crowd - b.p.crowd || b.p.rating - a.p.rating);
    else if (sortBy === 'popular') list.sort((a, b) => b.p.reviews - a.p.reviews);
    else list.sort((a, b) => b.score - a.score);
    const strong = list.filter(x => x.matched.length || !anyHard);
    const finalList = (strong.length ? strong : list);
    const rotated = offset ? [...finalList.slice(offset % Math.max(finalList.length - 2, 1)), ...finalList.slice(0, offset % Math.max(finalList.length - 2, 1))] : finalList;
    return rotated.slice(0, 3).map(x => ({ ...x }));
}

const FEAT_LABEL = {
    picnic: '可野餐', photo: '适合拍照', parking: '好停车', night: '夜景/夜游', bird: '可观鸟',
    boat: '可划船', waterplay: '可戏水', pick: '可采摘', star: '可观星', hike: '可徒步',
    cafe: '有咖啡茶座', bbq: '烧烤篝火', free: '免费', quiet: '人少清净', dog: '宠物友好', kid: '适合遛娃',
};

/* ---------- 回复生成 ---------- */
function buildReply(parsed, st, ctx) {
    const name = st.user || '朋友';
    switch (parsed.intent) {
        case 'empty':
            return { text: '我在呢～说说你想去什么样的公园吧。', chips: DEFAULT_CHIPS };
        case 'greet': {
            const h = new Date().getHours();
            const gt = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
            return {
                text: `${gt}，${name}！我是${AGENT_NAME}，公园雷达的智能助手。\n告诉我你的想法，比如「想找个免费的湖边公园」，我马上为你扫描全城 ${PARKS.length} 座公园。`,
                chips: DEFAULT_CHIPS,
            };
        }
        case 'help':
            return {
                text: `我会做的事可不少：\n· 按需求找公园 —— 说一句「适合遛娃、免费、离家近」就行\n· 查公园详情 —— 直接问「翠湖湿地公园怎么样」\n· 个性化条件 —— 人少清净 / 评分最高 / 可以露营 / 能观星 / 有咖啡\n· 管理你的收藏 —— 问我「我的收藏」随时查看\n\n试试下面的快捷问题吧。`,
                chips: DEFAULT_CHIPS,
            };
        case 'thanks':
            return { text: '不客气！祝你在公园里玩得开心，有需要随时叫我。', chips: ['再看看别的公园', '我的收藏'] };
        case 'rain': {
            const picks = [PARK_BY_ID['p11'], PARK_BY_ID['p9']];
            return {
                text: '下雨天也有好去处——我帮你挑了两个有室内空间的公园：竹里馆的竹林书屋听雨最舒服，萤火森林的科普馆晚上还有夜行生物讲解。记得带伞。',
                cards: picks.map(p => ({ id: p.id, reason: '有室内空间，雨天友好' })),
                chips: ['晴天适合去哪', '换一批'],
            };
        }
        case 'favs': {
            const favs = st.favs.map(id => PARK_BY_ID[id]).filter(Boolean);
            if (!favs.length) return { text: '你还没有收藏任何公园哦。去发现页逛逛，点心形旁边的书签就能收藏。', chips: DEFAULT_CHIPS };
            return {
                text: `你收藏了 ${favs.length} 个公园，都帮你列出来了：`,
                cards: favs.slice(0, 4).map(p => ({ id: p.id, reason: '你的收藏' })),
                chips: ['换一批', '推荐相似的'],
            };
        }
        case 'likes': {
            const likes = st.likes.map(id => PARK_BY_ID[id]).filter(Boolean);
            if (!likes.length) return { text: '还没有点赞过公园。在列表或详情页点心形按钮，我就知道你偏爱哪里了。', chips: DEFAULT_CHIPS };
            return {
                text: `你点赞过的 ${likes.length} 个公园：`,
                cards: likes.slice(0, 4).map(p => ({ id: p.id, reason: '你点过赞' })),
                chips: ['我的收藏', '换一批'],
            };
        }
        case 'history': {
            const hist = st.history.map(x => PARK_BY_ID[x.id]).filter(Boolean);
            if (!hist.length) return { text: '还没有浏览足迹。去发现页看看，我会帮你记住足迹的。', chips: DEFAULT_CHIPS };
            return {
                text: `这是你最近看过的 ${Math.min(hist.length, 4)} 个公园：`,
                cards: hist.slice(0, 4).map(p => ({ id: p.id, reason: '最近浏览' })),
                chips: ['我的收藏', '换一批'],
            };
        }
        case 'park': {
            const p = parsed.park;
            const os = openState(p);
            return {
                text: `「${p.name}」${p.rating} 分，${os.open ? '现在正在营业' : '现在已闭园'}（${p.open}-${p.close}），门票${p.ticket === 0 ? '免费' : ` ¥${p.ticket}`}，距你 ${p.distance} 公里。\n${p.desc}\n小贴士：${p.tips}`,
                cards: [{ id: p.id, reason: p.tags.slice(0, 3).join(' · ') }],
                chips: ['有相似的公园吗', '今天人多吗', '打开详情页'],
                parkCtx: p.id,
            };
        }
        case 'more': {
            const base = ctx.lastParsed || { intent: 'search', cats: [], feats: [], maxDist: null, sortBy: null };
            const offset = (ctx.moreOffset || 0) + 3;
            const results = searchParks(base, offset);
            if (!results.length) return { text: '暂时没有找到更多了，换个条件试试？', chips: DEFAULT_CHIPS };
            return {
                text: `又帮你翻出一批，这 ${results.length} 个也不错：`,
                cards: results.map(x => ({ id: x.p.id, reason: x.matched.slice(0, 2).join(' · ') || `${x.p.rating} 分好评` })),
                chips: ['再换一批', '只看免费的', '人少一点的'],
                results, parsed: base, offset,
            };
        }
        case 'recommend': {
            const results = searchParks({ cats: [], feats: [], maxDist: null, sortBy: 'rating' }, Math.floor(Math.random() * 3));
            return {
                text: `收到！我按口碑和体验帮你精选了 3 个，闭眼冲不踩雷：`,
                cards: results.map(x => ({ id: x.p.id, reason: `${x.p.rating} 分 · ${x.p.tags[0]}` })),
                chips: ['要免费开放的', '要人少清净的', '适合遛娃的', '换一批'],
                results, parsed,
            };
        }
        case 'search': {
            const results = searchParks(parsed, 0);
            const conds = [];
            parsed.cats.forEach(k => conds.push(catMeta(k).label));
            parsed.feats.forEach(k => { const l = FEAT_LABEL[k]; if (l && !conds.includes(l)) conds.push(l); });
            if (parsed.maxDist) conds.push(`${parsed.maxDist} 公里内`);
            const condText = conds.length ? `「${conds.slice(0, 4).join(' + ')}」` : '';
            if (!results.length) {
                return { text: `咦，雷达扫了一圈，没有找到完全符合${condText}的公园。换个说法再试试？`, chips: DEFAULT_CHIPS, results: [], parsed };
            }
            const weak = results.every(x => !x.matched.length);
            const lead = weak
                ? `完全符合${condText}的公园暂时没有，这几个是最接近的：`
                : `雷达锁定！符合${condText}的公园有 ${results.length} 个推荐给你：`;
            return {
                text: lead,
                cards: results.map(x => ({
                    id: x.p.id,
                    reason: x.matched.length ? x.matched.slice(0, 3).join(' · ') : `${x.p.rating} 分 · ${x.p.distance}km`,
                })),
                chips: followChips(parsed),
                results, parsed,
            };
        }
        default:
            return {
                text: `这个我还真答不上来……我最擅长的是帮你找公园！\n可以告诉我：想做什么（遛娃/跑步/赏花/露营）、有什么要求（免费/人少/离得近），我来帮你扫描。`,
                chips: DEFAULT_CHIPS,
            };
    }
}

function followChips(parsed) {
    const chips = [];
    if (!parsed.feats.includes('free') && !parsed.needFree) chips.push('只看免费的');
    if (!parsed.feats.includes('quiet')) chips.push('人少一点的');
    if (parsed.sortBy !== 'distance') chips.push('离我更近的');
    chips.push('换一批');
    return chips.slice(0, 4);
}

const DEFAULT_CHIPS = ['附近人少的公园', '适合遛娃的', '免费又好玩', '可以带狗吗', '晚上哪里有夜景'];

/* 快捷 chip → 实际查询语句 */
const CHIP_Q = {
    '打开详情页': null, /* 特殊处理 */
    '今天人多吗': null,
    '有相似的公园吗': null,
};

/* 特殊 chip 处理（依赖上一轮上下文） */
function resolveChip(label, ctx) {
    if (label === '打开详情页') {
        const id = ctx.parkCtx || (ctx.lastResults && ctx.lastResults[0] && ctx.lastResults[0].id);
        return id ? { nav: `#/park/${id}` } : null;
    }
    if (label === '今天人多吗') {
        const p = PARK_BY_ID[ctx.parkCtx] || PARK_BY_ID[(ctx.lastResults && ctx.lastResults[0] && ctx.lastResults[0].id)];
        if (!p) return { q: '今天哪里人少' };
        const today = p.crowdWeek[todayIdx()];
        return {
            direct: {
                text: `${p.name}今天预计人流 ${today}/5（${crowdText(today)}）。${today >= 4 ? '建议早上 9 点前或傍晚 4 点后错峰前往。' : '现在过去正合适，不用挤。'}`,
                chips: ['打开详情页', '人少一点的公园'],
                parkCtx: p.id,
            },
        };
    }
    if (label === '有相似的公园吗') {
        const p = PARK_BY_ID[ctx.parkCtx] || PARK_BY_ID[(ctx.lastResults && ctx.lastResults[0] && ctx.lastResults[0].id)];
        if (!p) return { q: '推荐几个公园' };
        const sim = PARKS.filter(x => x.id !== p.id && (x.cat === p.cat || x.tags.some(t => p.tags.includes(t))))
            .sort((a, b) => b.rating - a.rating).slice(0, 3);
        return {
            direct: {
                text: sim.length ? `和「${p.name}」气质相近的有这几个，都是同类好去处：` : '暂时没有特别相似的，给你推荐几个高分公园吧。',
                cards: (sim.length ? sim : PARKS.slice(0, 3)).map(x => ({ id: x.id, reason: `与${p.name.slice(0, 2)}同类 · ${x.rating} 分` })),
                chips: ['换一批', '只看免费的'],
            },
        };
    }
    return { q: label };
}

/* ---------- Agent 主入口（含可选 LLM 桥接） ---------- */
async function agentAsk(text, st, ctx) {
    const llmCfg = LS.get('llm', null);
    if (llmCfg && llmCfg.baseUrl && llmCfg.apiKey) {
        try { return await llmAsk(text, st, ctx, llmCfg); } catch (e) { console.warn('[agent] LLM 调用失败，回退本地引擎:', e); }
    }
    await sleep(420 + Math.random() * 500);
    const parsed = parseQuery(text, ctx);
    const reply = buildReply(parsed, st, ctx);
    return normalizeReply(reply, parsed);
}

function normalizeReply(reply, parsed) {
    const results = reply.results || (reply.cards ? reply.cards.map(c => ({ p: PARK_BY_ID[c.id] })).filter(x => x.p) : []);
    return {
        text: reply.text,
        cards: reply.cards || [],
        chips: reply.chips || [],
        parkCtx: reply.parkCtx || null,
        meta: { lastResults: results.map(x => ({ id: x.p ? x.p.id : x.id })), lastParsed: reply.parsed || parsed, moreOffset: reply.offset || 0 },
    };
}

/* OpenAI 兼容接口桥接：返回 {text, cards, chips} */
async function llmAsk(text, st, ctx, cfg) {
    const parksBrief = PARKS.map(p => `${p.id}|${p.name}|${catMeta(p.cat).label}|${p.rating}分|${p.distance}km|门票${p.ticket === 0 ? '免费' : p.ticket + '元'}|人流${p.crowd}/5|${p.open}-${p.close}|特色:${p.features.join(',')}` ).join('\n');
    const sys = `你是「公园雷达」H5 应用里的智能助手小屿，帮用户在${CITY}找到合适的公园。公园数据（id|名称|类别|评分|距离|门票|人流|开放时间|特色）：\n${parksBrief}\n用户收藏:${st.favs.join(',') || '无'}。请只输出 JSON：{"text":"回复正文(简洁友好,可用\\n)","parkIds":["最多3个匹配的公园id"],"chips":["最多4个跟进问题"]}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.4 }),
        signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) throw new Error('no JSON in reply');
    const obj = JSON.parse(jm[0]);
    const ids = (obj.parkIds || []).filter(id => PARK_BY_ID[id]).slice(0, 3);
    return {
        text: obj.text || '嗯……我没想好怎么说，但这些公园也许合适：',
        cards: ids.map(id => ({ id, reason: 'AI 推荐' })),
        chips: (obj.chips || []).slice(0, 4),
        parkCtx: ids[0] || null,
        meta: { lastResults: ids.map(id => ({ id })), lastParsed: null, moreOffset: 0 },
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
