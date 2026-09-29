/* Park Radar · Lumen — the island guide (agent)
 *
 * Two-tier design, and it is honest about which tier answered:
 *   1. a deterministic local NLU that turns a sentence into a slot filter over
 *      the park dataset, then ranks and explains — always available, offline;
 *   2. an optional LLM bridge: if the user configures an OpenAI-compatible
 *      endpoint in 我的 → 设置, the sentence is first sent there to be parsed
 *      into the same slot schema (JSON), and any failure falls straight back
 *      to tier 1.
 * Every answer carries the parsed slots so the user can see why they got it.
 */
(function (global) {
    'use strict';

    var D = global.PR_DATA;
    var PARKS = D.PARKS;
    var LEX = D.LEXICON;

    /* ------------------------------------------------------------- helpers */
    var CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

    function norm(text) {
        return String(text || '')
            .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
            .replace(/\s+/g, ' ')
            .trim();
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /** Which vocabulary entries appear in the text (longest surface form wins). */
    function scanVocab(text, vocab, opts) {
        opts = opts || {};
        var hits = [];
        Object.keys(vocab).forEach(function (key) {
            var surfaces = vocab[key];
            if (!surfaces || !surfaces.length) return;
            for (var i = 0; i < surfaces.length; i++) {
                var s = surfaces[i];
                if (!s) continue;
                var idx = text.indexOf(s);
                if (idx === -1) continue;
                // negation window: "不要/别/除了/不想要" within 4 chars before the hit
                var before = text.slice(Math.max(0, idx - 5), idx);
                var neg = /(不要|不想|别|除了|避开|不收|没有|不带)/.test(before);
                hits.push({ key: key, surface: s, at: idx, neg: neg, len: s.length });
                break;
            }
        });
        return hits;
    }

    function detectIntent(text) {
        var best = { intent: 'search', score: 0 };
        Object.keys(LEX.intents).forEach(function (intent) {
            var surfaces = LEX.intents[intent];
            var score = 0;
            surfaces.forEach(function (s) {
                if (s && text.indexOf(s) !== -1) score = Math.max(score, s.length);
            });
            if (score > best.score) best = { intent: intent, score: score };
        });
        return best.intent;
    }

    /** Approximate "is this park open right now" in Asia/Shanghai terms. */
    function isOpenNow(park, date) {
        if (park.is24h) return true;
        var d = date || new Date();
        var mins = d.getHours() * 60 + d.getMinutes();
        function toMin(s) { var a = s.split(':'); return parseInt(a[0], 10) * 60 + parseInt(a[1], 10); }
        return mins >= toMin(park.open[0]) && mins <= toMin(park.open[1]);
    }

    function seasonNow(date) {
        var m = (date || new Date()).getMonth() + 1;
        if (m >= 3 && m <= 5) return '春';
        if (m >= 6 && m <= 8) return '夏';
        if (m >= 9 && m <= 11) return '秋';
        return '冬';
    }

    /** Find park names mentioned in a sentence (longest match first). */
    function findParks(text) {
        var found = [];
        PARKS.forEach(function (p) {
            var names = [p.name];
            if (p.name.indexOf(' · ') !== -1) names.push(p.name.split(' · ')[0]);
            if (p.name.length > 4) names.push(p.name.replace(/(公园|景区|湿地公园)$/, ''));
            names.forEach(function (n) {
                if (n && n.length >= 2 && text.indexOf(n) !== -1 && !found.some(function (f) { return f.park.id === p.id; })) {
                    found.push({ park: p, name: n, at: text.indexOf(n) });
                }
            });
        });
        return found.sort(function (a, b) { return a.at - b.at; });
    }

    /* --------------------------------------------------------------- context */
    function freshContext() {
        return {
            filters: {},
            exclude: {},
            lastIds: [],
            seen: {},
            sort: null,
            count: 5,
            lastArea: null,
            turn: 0,
            relaxed: [],
        };
    }

    var TAG_LABEL = {
        亲子: '适合遛娃', 露营: '可以露营', 野餐: '能野餐', 跑步: '有跑步道', 骑行: '能骑行',
        拍照: '好拍照', 樱花: '有樱花', 梅花: '有梅花', 荷花: '有荷花', 桂花: '有桂花', 桃花: '有桃花',
        郁金香: '有郁金香', 秋色: '秋色好', 夜景: '夜景好看', 湖景: '有湖景', 江景: '有江景',
        草坪: '有大草坪', 沙滩: '有沙滩', 湿地: '是湿地', 观鸟: '能观鸟', 溪流: '有溪流',
        竹林: '有竹林', 茶园: '有茶园', 古迹: '有古迹', 登高: '能登高', 人少: '人少', 免费: '免费',
        遛狗: '能遛狗', 运动: '能运动', 游乐设施: '有游乐设施', 科普: '能涨知识', 避暑: '凉快',
        日落: '适合看日落', 喷泉: '有喷泉', 文创: '有文创', 美食: '有吃的', 划船: '能划船',
        晨练: '适合晨练', 洗肺: '空气好', 野趣: '有野趣', 安静: '安静', 临水: '临水',
        慢生活: '适合慢下来', 城市客厅: '城市客厅', 世界遗产: '世界遗产', 稻田: '有稻田',
        田园: '田园风光', 大草原: '有大草原', 鹿: '有鹿', 研学: '适合研学', 农事: '能体验农事',
        传统: '有传统味', 音乐喷泉: '有音乐喷泉', 商圈: '挨着商圈', 咖啡: '有咖啡',
        小吃: '有小吃', 夜市: '有夜市', 地标: '是地标', 灯光秀: '有灯光秀', 森林: '有森林',
        徒步: '能徒步', 观景: '能观景', 古寺: '有古寺', 泉水: '有泉水', 茶: '能喝茶',
    };
    function tagLabel(t) { return TAG_LABEL[t] || t; }

    function slotChips(ctx) {
        var f = ctx.filters;
        var chips = [];
        (f.tags || []).forEach(function (t) { chips.push({ label: tagLabel(t), neg: false }); });
        (f.types || []).forEach(function (t) { chips.push({ label: t, neg: false }); });
        (f.districts || []).forEach(function (d) { chips.push({ label: d, neg: false }); });
        (f.facilities || []).forEach(function (d) { chips.push({ label: '有' + d, neg: false }); });
        if (f.free === true) chips.push({ label: '免费', neg: false });
        if (f.free === false) chips.push({ label: '接受收费', neg: false });
        if (f.maxTicket != null) chips.push({ label: '票价 ≤ ' + f.maxTicket + ' 元', neg: false });
        if (f.maxDistance != null) chips.push({ label: f.maxDistance + 'km 以内', neg: false });
        if (f.minRating != null) chips.push({ label: '评分 ≥ ' + f.minRating, neg: false });
        if (f.openNow) chips.push({ label: '此刻开放', neg: false });
        if (f.season) chips.push({ label: f.season + '天合适', neg: false });
        if (f.quietMin != null) chips.push({ label: '安静', neg: false });
        if (f.crowdMax != null) chips.push({ label: '人不多', neg: false });
        if (f.shadeMin != null) chips.push({ label: '有树荫', neg: false });
        if (f.pets) chips.push({ label: '宠物友好', neg: false });
        if (f.camping) chips.push({ label: tagLabel('露营'), neg: false });
        if (f.run) chips.push({ label: '有跑步道', neg: false });
        if (f.playground) chips.push({ label: '有儿童区', neg: false });
        Object.keys(ctx.exclude).forEach(function (k) { chips.push({ label: '不要' + tagLabel(k), neg: true }); });
        if (ctx.sort) chips.push({ label: SORT_LABEL[ctx.sort] || ctx.sort, neg: false });
        // the same idea can be reached through several slots — show it once
        var seen = {};
        return chips.filter(function (c) {
            var k = (c.neg ? '!' : '') + c.label;
            if (seen[k]) return false;
            seen[k] = 1;
            return true;
        });
    }

    var SORT_LABEL = {
        distance: '按距离最近', rating: '按评分最高', heat: '按人气最旺',
        ticket: '按票价最低', quiet: '按最安静', size: '按面积最大',
    };

    /* --------------------------------------------------------------- parsing */
    /** Local deterministic parse: sentence -> {intent, filters, exclude, sort, count, notes}. */
    function parseLocal(rawText, ctx) {
        ctx = ctx || freshContext();
        var text = norm(rawText);
        var intent = detectIntent(text);
        var mentioned = findParks(text);

        var tagHits = scanVocab(text, LEX.tags);
        var typeHits = scanVocab(text, LEX.types);
        var facHits = scanVocab(text, LEX.facilities);
        var districtHits = LEX.districts.filter(function (d) { return text.indexOf(d) !== -1; });
        var sort = null;
        Object.keys(LEX.sorts).forEach(function (k) {
            LEX.sorts[k].forEach(function (s) { if (text.indexOf(s) !== -1) sort = SORT_MAP[k] || sort; });
        });

        var filters = {};
        var exclude = {};
        var notes = [];

        var tags = [], exTags = [];
        tagHits.forEach(function (h) { (h.neg ? exTags : tags).push(h.key); });
        // 免费/收费 are price predicates, not really tags
        if (tags.indexOf('免费') !== -1) { filters.free = true; tags = tags.filter(function (t) { return t !== '免费'; }); }
        if (tags.indexOf('人少') !== -1) { filters.crowdMax = 2; tags = tags.filter(function (t) { return t !== '人少'; }); }
        if (tags.indexOf('安静') !== -1) { filters.quietMin = 4; tags = tags.filter(function (t) { return t !== '安静'; }); }
        if (tags.indexOf('避暑') !== -1) { filters.shadeMin = 4; tags = tags.filter(function (t) { return t !== '避暑'; }); }
        if (tags.indexOf('遛狗') !== -1) { filters.pets = true; tags = tags.filter(function (t) { return t !== '遛狗'; }); }
        if (tags.indexOf('露营') !== -1) { filters.camping = true; }
        if (tags.indexOf('跑步') !== -1 || tags.indexOf('慢跑') !== -1) { filters.run = true; }
        if (tags.indexOf('运动') !== -1 || tags.indexOf('球场') !== -1) { filters.run = filters.run || false; }
        if (tags.indexOf('游乐设施') !== -1) { filters.playground = true; }
        if (tagHits.some(function (h) { return h.key === '免费' && h.neg; })) { filters.free = false; }
        filters.tags = tags;
        exTags.forEach(function (t) { exclude[t] = true; });

        var types = typeHits.filter(function (h) { return !h.neg; }).map(function (h) { return h.key; });
        if (types.indexOf('综合公园') !== -1 && types.length > 1) types = types.filter(function (t) { return t !== '综合公园'; });
        filters.types = types;
        typeHits.filter(function (h) { return h.neg; }).forEach(function (h) { exclude[h.key] = true; });
        filters.districts = districtHits;
        filters.facilities = facHits.filter(function (h) { return !h.neg; }).map(function (h) { return h.key; });

        // price
        var budget = /(\d+(?:\.\d+)?)\s*(?:元|块|rmb)?\s*(?:以内|以下|之内|左右|封顶)/.exec(text);
        if (budget) filters.maxTicket = parseFloat(budget[1]);
        if (/(免费|不要钱|不花钱|零花费|不收费|白嫖)/.test(text) && !/不免费/.test(text)) filters.free = true;
        if (/(收费|要门票|买票|门票多少)/.test(text) && !/不收费/.test(text)) filters.free = false;

        // distance
        var km = /(\d+(?:\.\d+)?)\s*(?:公里|千米|km|KM)/.exec(text);
        if (km) filters.maxDistance = parseFloat(km[1]);
        else if (/(附近|周边|离我近|最近|就近|走路|步行|不远)/.test(text)) {
            filters.maxDistance = 6;
            if (!sort) sort = 'distance';
        }

        // rating
        var rt = /(\d(?:\.\d)?)\s*(?:分|星)?\s*(?:以上|往上|\+)/.exec(text);
        if (rt && parseFloat(rt[1]) >= 3 && parseFloat(rt[1]) <= 5) filters.minRating = parseFloat(rt[1]);
        if (/(评分高|好评|口碑好|评价好|最值得|最好的)/.test(text)) filters.minRating = filters.minRating || 4.5;

        // open now
        if (/(现在|此刻|这会儿|马上|今天).{0,6}(开|营业|能进|可以进)/.test(text) || /(现在开着|还开着吗|现在能去)/.test(text)) filters.openNow = true;
        if (/(全天|24小时|通宵)/.test(text)) { filters.open24 = true; }

        // season
        var season = null;
        Object.keys(LEX.seasons).forEach(function (s) {
            LEX.seasons[s].forEach(function (w) { if (text.indexOf(w) !== -1) season = s; });
        });
        if (season) filters.season = season;
        if (/(今天|现在).{0,4}(适合|去哪|推荐)/.test(text) && !season) filters.season = seasonNow();

        // crowd / quiet / shade words
        if (/(人少|清静|清净|不挤|没什么人|冷门|小众|安静)/.test(text)) { filters.crowdMax = Math.min(filters.crowdMax || 5, 2); filters.quietMin = filters.quietMin || 4; }
        if (/(热闹|人气|人多|氛围好)/.test(text)) filters.crowdMin = 3;
        if (/(阴凉|树荫|遮阴|凉快|避暑|不晒)/.test(text)) filters.shadeMin = filters.shadeMin || 4;
        if (/(宠物|带狗|遛狗|狗狗)/.test(text)) filters.pets = true;
        if (/(帐篷|露营|扎营|天幕)/.test(text)) filters.camping = true;
        if (/(跑道|跑步|慢跑|夜跑)/.test(text)) filters.run = true;
        if (/(滑梯|儿童|小朋友玩|游乐)/.test(text)) filters.playground = true;

        // count
        var count = null;
        var cm = /(?:推荐|来|给我|找|列)?\s*([0-9一二两三四五六七八九十]+)\s*(?:个|家|处|座)/.exec(text);
        if (cm) {
            var raw = cm[1];
            count = /^\d+$/.test(raw) ? parseInt(raw, 10) : CN_NUM[raw] || null;
        }
        if (/(全部|所有|都列|列一下|都有哪些|有哪些)/.test(text)) count = 9;
        if (/(推荐|来几)/.test(text) && !count) count = 4;

        // area
        if (filters.districts.length) ctx.lastArea = filters.districts[0];

        return {
            intent: intent,
            filters: filters,
            exclude: exclude,
            sort: sort,
            count: count,
            mentioned: mentioned,
            raw: text,
            notes: notes,
        };
    }

    var SORT_MAP = {
        距离最近: 'distance', 评分最高: 'rating', 最热门: 'heat',
        最便宜: 'ticket', 最安静: 'quiet', 面积最大: 'size',
    };

    /* --------------------------------------------------------------- merging */
    /** Merge a parse into the running session context. */
    function merge(ctx, parsed) {
        var intent = parsed.intent;
        var f = parsed.filters || {};

        if (intent === '清空') {
            return { ctx: freshContext(), merged: freshContext().filters, isNew: true };
        }
        var isNew = intent !== '继续' && intent !== '放宽' && !/^(再|还|另外|换|那)/.test(parsed.raw);
        // "还有吗 / 换个条件" keeps the previous frame
        var carry = (intent === '继续' || intent === '放宽');

        if (!carry) {
            if (isNew) ctx = Object.assign(freshContext(), { seen: ctx.seen, lastIds: ctx.lastIds });
            var nf = ctx.filters;
            ['tags', 'types', 'districts', 'facilities'].forEach(function (k) {
                if (f[k] && f[k].length) {
                    var set = {};
                    (nf[k] || []).forEach(function (v) { set[v] = 1; });
                    f[k].forEach(function (v) { set[v] = 1; });
                    nf[k] = Object.keys(set);
                }
            });
            ['free', 'maxTicket', 'maxDistance', 'minRating', 'openNow', 'open24', 'season', 'crowdMax', 'crowdMin', 'quietMin', 'shadeMin', 'pets', 'camping', 'run', 'playground'].forEach(function (k) {
                if (f[k] != null) nf[k] = f[k];
            });
            Object.keys(parsed.exclude || {}).forEach(function (k) { ctx.exclude[k] = 1; });
            if (parsed.sort) ctx.sort = parsed.sort;
            if (parsed.count) ctx.count = clamp(parsed.count, 1, 9);
        } else {
            if (parsed.sort) ctx.sort = parsed.sort;
            if (parsed.count) ctx.count = clamp(parsed.count, 1, 9);
        }
        ctx.turn += 1;
        return { ctx: ctx, isNew: isNew, carry: carry };
    }

    /* -------------------------------------------------------------- searching */
    /** Does `park` satisfy this exact filter set? */
    function matchesWith(park, f, exclude) {
        if (f.free != null && park.free !== f.free) return false;
        if (f.maxTicket != null && park.ticket > f.maxTicket) return false;
        if (f.maxDistance != null && park.distance > f.maxDistance) return false;
        if (f.minRating != null && park.rating < f.minRating) return false;
        if (f.openNow && !isOpenNow(park)) return false;
        if (f.open24 && !park.is24h) return false;
        if (f.crowdMax != null && park.crowd > f.crowdMax) return false;
        if (f.crowdMin != null && park.crowd < f.crowdMin) return false;
        if (f.quietMin != null && park.quiet < f.quietMin) return false;
        if (f.shadeMin != null && park.shade < f.shadeMin) return false;
        if (f.pets && !park.pets) return false;
        if (f.camping && !park.camping) return false;
        if (f.run && !park.run) return false;
        if (f.playground && !park.playground) return false;
        if (f.season && park.best.indexOf(f.season) === -1) return false;

        if ((f.types || []).length && f.types.indexOf(park.type) === -1) return false;
        if ((f.districts || []).length && f.districts.indexOf(park.district) === -1) return false;
        if ((f.facilities || []).length) {
            for (var i = 0; i < f.facilities.length; i++) if (park.fac.indexOf(f.facilities[i]) === -1) return false;
        }
        // every requested tag must be present (AND) — that is what people mean
        var tags = f.tags || [];
        for (var t = 0; t < tags.length; t++) {
            if (park.tags.indexOf(tags[t]) === -1) {
                if (tags[t] === '草坪' && park.type === '综合公园') continue;
                if (tags[t] === '登高' && park.type === '山地公园') continue;
                return false;
            }
        }
        var ex = Object.keys(exclude || {});
        for (var e = 0; e < ex.length; e++) {
            if (park.tags.indexOf(ex[e]) !== -1) return false;
            if (park.type === ex[e]) return false;
        }
        return true;
    }
    function matches(park, ctx) { return matchesWith(park, ctx.filters, ctx.exclude); }

    /** Constraints in the order we are willing to give them up. */
    var RELAX_STEPS = [
        { label: '距离限制', active: function (f) { return f.maxDistance != null; }, apply: function (f) { f.maxDistance = null; } },
        { label: '票价上限', active: function (f) { return f.maxTicket != null; }, apply: function (f) { f.maxTicket = null; } },
        { label: '评分门槛', active: function (f) { return f.minRating != null; }, apply: function (f) { f.minRating = null; } },
        { label: '季节偏好', active: function (f) { return f.season != null; }, apply: function (f) { f.season = null; } },
        { label: '开放时间', active: function (f) { return !!f.openNow; }, apply: function (f) { f.openNow = null; } },
        { label: '人流偏好', active: function (f) { return f.crowdMax != null || f.quietMin != null || f.shadeMin != null; }, apply: function (f) { f.crowdMax = null; f.quietMin = null; f.shadeMin = null; } },
        { label: '公园类型', active: function (f) { return (f.types || []).length > 0; }, apply: function (f) { f.types = []; } },
        { label: '区域限制', active: function (f) { return (f.districts || []).length > 0; }, apply: function (f) { f.districts = []; } },
        { label: '设施要求', active: function (f) { return (f.facilities || []).length > 0; }, apply: function (f) { f.facilities = []; } },
        { label: '特色标签', active: function (f) { return (f.tags || []).length > 0; }, apply: function (f) { f.tags = []; } },
        { label: '宠物/露营/跑步要求', active: function (f) { return !!(f.pets || f.camping || f.run || f.playground); }, apply: function (f) { f.pets = null; f.camping = null; f.run = null; f.playground = null; } },
        { label: '价格限制', active: function (f) { return f.free != null; }, apply: function (f) { f.free = null; } },
    ];

    function cloneFilters(ctx) {
        var f = {};
        for (var k in ctx.filters) {
            var v = ctx.filters[k];
            f[k] = Array.isArray(v) ? v.slice() : v;
        }
        return f;
    }

    function score(park, ctx) {
        var f = ctx.filters;
        var s = park.rating * 8 + Math.log(1 + park.reviews) * 3.2;
        s -= park.distance * 1.15;
        if (f.maxDistance != null) s += Math.max(0, 6 - park.distance) * 1.4;
        (f.tags || []).forEach(function (t) { if (park.tags.indexOf(t) !== -1) s += 10; });
        if (ctx.sort === 'distance') s = -park.distance * 10 + park.rating;
        else if (ctx.sort === 'rating') s = park.rating * 20 + Math.log(1 + park.reviews);
        else if (ctx.sort === 'heat') s = park.heat;
        else if (ctx.sort === 'ticket') s = -park.ticket * 4 + park.rating;
        else if (ctx.sort === 'quiet') s = park.quiet * 10 + park.rating - park.crowd * 3;
        else if (ctx.sort === 'size') s = parseFloat(park.size) || 0;
        if (f.season && park.best.indexOf(f.season) === 0) s += 9;
        return s;
    }

    /** Why this park was picked — short, concrete, and only true statements. */
    function reasons(park, ctx) {
        var f = ctx.filters;
        var out = [];
        (f.tags || []).forEach(function (t) { if (park.tags.indexOf(t) !== -1) out.push(tagLabel(t)); });
        if (f.free === true && park.free) out.push('免费');
        if (f.camping && park.camping) out.push('可露营');
        if (f.run && park.run) out.push('有跑步道');
        if (f.playground && park.playground) out.push('有儿童区');
        if (f.pets && park.pets) out.push('宠物友好');
        if (f.quietMin != null && park.quiet >= f.quietMin) out.push(park.quietLabel);
        if (f.shadeMin != null && park.shade >= f.shadeMin) out.push(park.shadeLabel);
        if (f.openNow) out.push('此刻开放');
        if (f.season && park.best.indexOf(f.season) !== -1) out.push(f.season + '季正合适');
        if (park.free) out.push('免费');
        if (park.rating >= 4.6) out.push('评分 ' + park.rating);
        out.push(park.distance + 'km');
        var seen = {};
        return out.filter(function (x) { return seen[x] ? false : (seen[x] = 1); }).slice(0, 5);
    }

    /**
     * Rank the dataset against the session filters.
     * Strict results always win: relaxation happens only when nothing matches
     * at all, or when the user explicitly asks for it — and it is reported.
     * The session filters are never mutated by relaxation.
     */
    function runQuery(ctx, opts) {
        opts = opts || {};
        var strictPool = PARKS.filter(function (p) { return matches(p, ctx); });
        var pool = strictPool;
        var relaxed = [];
        var f = cloneFilters(ctx);
        if (opts.forceRelax || strictPool.length === 0) {
            var target = opts.forceRelax ? Math.min(ctx.count, 6) : Math.min(3, ctx.count);
            for (var i = 0; i < RELAX_STEPS.length && pool.length < target; i++) {
                var step = RELAX_STEPS[i];
                if (!step.active(f)) continue;
                step.apply(f);
                relaxed.push(step.label);
                pool = PARKS.filter(function (p) { return matchesWith(p, f, ctx.exclude); });
            }
        }

        var list = pool.slice().sort(function (a, b) { return score(b, ctx) - score(a, ctx); });
        // "还有吗" should surface something new
        if (opts.avoidSeen) {
            var fresh = list.filter(function (p) { return !ctx.seen[p.id]; });
            if (fresh.length >= 2) list = fresh;
        }
        var results = list.map(function (p) {
            return { park: p, why: reasons(p, ctx), score: Math.round(score(p, ctx) * 10) / 10 };
        });
        return { strictCount: strictPool.length, pool: pool.length, results: results, relaxed: relaxed };
    }

    /* ------------------------------------------------------------- phrasing */
    var REPLY = {
        greeting: [
            '嗨，我是小岛，这座城市的公园向导。告诉我你想怎么玩就行——比如「带娃去哪」「附近能露营的」「有湖能跑步的」。',
            '你好呀。想找什么样的公园？说人话就行，我来翻译成条件。',
        ],
        help: [
            '我能听懂这些：\n· 玩法 — 遛娃 / 露营 / 野餐 / 跑步 / 骑行 / 拍照 / 观鸟 / 划船\n· 花卉 — 樱花 / 梅花 / 荷花 / 桂花 / 郁金香\n· 条件 — 免费 / 50 元以内 / 3 公里内 / 人少 / 安静 / 有树荫 / 宠物友好\n· 时间 — 现在开着的 / 24 小时 / 春天适合的\n· 区域 — 西湖区 / 滨江区 / 余杭区…\n· 也能直接问某个公园：太子湾公园怎么样？\n· 还能对比：太子湾和花港观鱼哪个好？',
        ],
        thanks: ['不客气，随时喊我。', '能帮上就好 🙂 还想找什么？'],
        bye: ['回见，去公园走走吧。', '好嘞，出门记得看天气。'],
        fallback: [
            '这句我没完全听懂。我先按「{echo}」帮你找了一批，你看对不对味——不对的话换个说法，比如「免费的、能露营、3 公里内」。',
            '没太抓到重点，我按字面理解试了试。可以直接说：「人少的」「适合遛娃的」「西湖区的免费公园」。',
        ],
    };
    function pickReply(arr, seed) {
        return arr[Math.abs(seed || 0) % arr.length];
    }

    /* ------------------------------------------------------- LLM bridge */
    /**
     * Optional: parse with an OpenAI-compatible chat endpoint.
     * Returns a parse object in the same shape as parseLocal, or null.
     */
    async function llmParse(text, cfg) {
        if (!cfg || !cfg.baseUrl || !cfg.apiKey || !cfg.model) return null;
        var sys = 'You convert a Chinese park-search request into JSON slots. ' +
            'Respond with ONLY minified JSON, keys: ' +
            'intent (search|refine|detail|compare|greeting|help), ' +
            'tags (array, from: ' + Object.keys(LEX.tags).join(',') + '), ' +
            'types (array, from: ' + Object.keys(LEX.types).join(',') + '), ' +
            'districts (array, from: ' + LEX.districts.join(',') + '), ' +
            'facilities (array, from: ' + Object.keys(LEX.facilities).join(',') + '), ' +
            'free (true|false|null), maxTicket (number|null), maxDistance (number|null), ' +
            'minRating (number|null), openNow (true|false|null), season (春|夏|秋|冬|null), ' +
            'crowdMax (1-5|null), quietMin (1-5|null), pets (bool|null), camping (bool|null), ' +
            'run (bool|null), playground (bool|null), sort (distance|rating|heat|ticket|null), count (number|null). ' +
            'Omit unknown keys. No commentary.';
        try {
            var ctl = new AbortController();
            var to = setTimeout(function () { ctl.abort(); }, 9000);
            var res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
                body: JSON.stringify({
                    model: cfg.model,
                    temperature: 0,
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: text }],
                }),
                signal: ctl.signal,
            });
            clearTimeout(to);
            if (!res.ok) return null;
            var data = await res.json();
            var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content) return null;
            var json = JSON.parse(content.replace(/```json|```/g, '').trim());
            var local = parseLocal(text, freshContext());
            var out = {
                intent: json.intent === 'refine' ? '继续' : (json.intent || local.intent),
                filters: {},
                exclude: {},
                sort: json.sort || local.sort,
                count: json.count || local.count,
                mentioned: local.mentioned,
                raw: norm(text),
                viaLLM: true,
            };
            ['tags', 'types', 'districts', 'facilities'].forEach(function (k) {
                if (Array.isArray(json[k]) && json[k].length) out.filters[k] = json[k].filter(function (v) { return typeof v === 'string'; });
            });
            ['free', 'maxTicket', 'maxDistance', 'minRating', 'openNow', 'pets', 'camping', 'run', 'playground'].forEach(function (k) {
                if (json[k] !== undefined && json[k] !== null) out.filters[k] = json[k];
            });
            if (json.season) out.filters.season = json.season;
            if (json.crowdMax) out.filters.crowdMax = json.crowdMax;
            if (json.quietMin) out.filters.quietMin = json.quietMin;
            return out;
        } catch (e) {
            return null;
        }
    }

    /* ---------------------------------------------------------------- respond */
    /**
     * Main entry. Returns a plan the UI can render:
     *   { text, parse, results[], parks[], mode, burst }
     */
    async function respond(rawText, ctx, opts) {
        opts = opts || {};
        var text = norm(rawText);
        var parsed = null;

        if (opts.llm && opts.llm.enabled) parsed = await llmParse(text, opts.llm);
        if (!parsed) parsed = parseLocal(text, ctx);
        var tier = parsed.viaLLM ? 'llm' : 'local';

        // pure conversational intents short-circuit
        if (parsed.intent === '打招呼' && text.length <= 8) {
            return {
                text: pickReply(REPLY.greeting, text.length), parse: { chips: [] }, results: [], mode: 'chat', tier: tier, ctx: ctx,
                suggests: ['附近免费的公园', '适合遛娃的', '能露营的草坪', '现在开着的'],
            };
        }
        if (parsed.intent === '帮助') {
            return { text: pickReply(REPLY.help, text.length), parse: { chips: [] }, results: [], mode: 'help', tier: tier, ctx: ctx };
        }
        if (parsed.intent === '感谢') {
            return { text: pickReply(REPLY.thanks, text.length), parse: { chips: [] }, results: [], mode: 'chat', tier: tier, ctx: ctx };
        }
        if (parsed.intent === '再见') {
            return { text: pickReply(REPLY.bye, text.length), parse: { chips: [] }, results: [], mode: 'chat', tier: tier, ctx: ctx };
        }

        // a specific park named -> detail or compare
        if (parsed.mentioned.length >= 1 && (parsed.intent === '比较' || parsed.mentioned.length >= 2)) {
            var two = parsed.mentioned.slice(0, 2).map(function (m) { return m.park; });
            if (two.length === 2) return { text: compareText(two[0], two[1]), parse: { chips: [] }, results: [], parks: two, mode: 'compare', tier: tier, ctx: ctx };
        }
        if (parsed.mentioned.length === 1 && parsed.mentioned[0].name.length >= 3 && parsed.intent !== '搜索') {
            var pk = parsed.mentioned[0].park;
            return { text: detailText(pk), parse: { chips: [] }, results: [{ park: pk, why: reasons(pk, { filters: {} }) }], mode: 'detail', tier: tier, ctx: ctx };
        }
        if (parsed.mentioned.length === 1 && parsed.mentioned[0].name.length >= 3 && parsed.intent === '搜索' && !hasAnyFilter(parsed)) {
            var pk2 = parsed.mentioned[0].park;
            return { text: detailText(pk2), parse: { chips: [] }, results: [{ park: pk2, why: reasons(pk2, { filters: {} }) }], mode: 'detail', tier: tier, ctx: ctx };
        }

        var merged = merge(ctx, parsed);
        ctx = merged.ctx;

        if (parsed.intent === '清空') {
            return { text: '好，条件都清掉了，重新说一个吧。', parse: { chips: [] }, results: [], mode: 'reset', tier: tier, ctx: ctx,
                suggests: ['人少的公园', '免费能野餐的', '有湖能跑步的'] };
        }

        var avoidSeen = parsed.intent === '继续';
        var forceRelax = parsed.intent === '放宽';
        var out = runQuery(ctx, { avoidSeen: avoidSeen, forceRelax: forceRelax });
        var results = out.results.slice(0, ctx.count);
        results.forEach(function (r) { ctx.seen[r.park.id] = 1; });
        ctx.lastIds = results.map(function (r) { return r.park.id; });

        var chips = slotChips(ctx);
        var body;
        var thin = !out.relaxed.length && results.length > 0 && results.length < 3;

        if (out.relaxed.length) {
            var opening = out.strictCount === 0
                ? '严格按条件一个都没匹配上。'
                : '严格匹配只剩 ' + out.strictCount + ' 个。';
            body = opening + '我把「' + out.relaxed.join('、') + '」放宽之后，找到这 ' + results.length + ' 个，先看看有没有能接受的：';
        } else if (!results.length) {
            body = '这个组合我一个都没找到。换个思路试试：说说你最在意的一点，比如「免费」或者「能露营的」，我从那儿开始。';
        } else if (parsed.intent === '继续') {
            body = '又挑出 ' + results.length + ' 个不一样的：';
        } else if (!hasAnyFilter(parsed) && parsed.sort == null) {
            body = '给你挑了 ' + results.length + ' 个口碑最好的：';
        } else if (thin) {
            body = '完全符合的只有 ' + results.length + ' 个，都在下面了。想再宽一点就说「放宽」。';
        } else {
            body = '按你的条件筛出 ' + results.length + ' 个：';
        }

        return {
            text: body,
            parse: { chips: chips, raw: text },
            results: results,
            mode: results.length ? 'results' : 'empty',
            relaxed: out.relaxed,
            strictCount: out.strictCount,
            tier: tier,
            ctx: ctx,
            suggests: nextSuggests(ctx, results, thin),
        };
    }

    function hasAnyFilter(parsed) {
        var f = parsed.filters || {};
        return !!((f.tags || []).length || (f.types || []).length || (f.districts || []).length || (f.facilities || []).length ||
            f.free != null || f.maxTicket != null || f.maxDistance != null || f.minRating != null || f.openNow ||
            f.season || f.crowdMax != null || f.quietMin != null || f.pets || f.camping || f.run || f.playground);
    }

    /** Two or three contextual follow-ups drawn from what is NOT yet filtered. */
    function nextSuggests(ctx, results, thin) {
        var f = ctx.filters;
        var out = [];
        if (thin) out.push('放宽一点条件');
        if (f.maxDistance == null) out.push('离我 3 公里内的');
        if (f.free == null) out.push('只要免费的');
        if (!f.camping) out.push('能露营的');
        if (f.quietMin == null) out.push('人少一点的');
        if (!f.run) out.push('有跑步道的');
        if (results && results.length) out.push('把 ' + results[0].park.name + ' 的详情给我');
        return out.slice(0, 4);
    }

    function detailText(p) {
        var lines = [];
        lines.push('**' + p.name + '**（' + p.type + ' · ' + p.district + '）');
        lines.push(p.intro);
        lines.push('');
        lines.push('· 开放：' + p.openLabel + '　票价：' + (p.free ? '免费' : p.ticket + ' 元'));
        lines.push('· 距你约 ' + p.distance + 'km　评分 ' + p.rating + '（' + p.reviews + ' 条）　面积 ' + p.size);
        lines.push('· 人流：' + p.crowdLabel + '　安静度：' + p.quietLabel + '　遮荫：' + p.shadeLabel);
        if (p.hi.length) lines.push('· 看点：' + p.hi.join(' / '));
        if (p.tips.length) lines.push('· 小贴士：' + p.tips[0]);
        return lines.join('\n');
    }

    function compareText(a, b) {
        function rate(x) { return x.rating; }
        var rows = [
            ['类型', a.type, b.type],
            ['距离', a.distance + 'km', b.distance + 'km'],
            ['票价', a.free ? '免费' : a.ticket + '元', b.free ? '免费' : b.ticket + '元'],
            ['评分', a.rating + '（' + a.reviews + '条）', b.rating + '（' + b.reviews + '条）'],
            ['人流', a.crowdLabel, b.crowdLabel],
            ['安静', a.quietLabel, b.quietLabel],
            ['遮荫', a.shadeLabel, b.shadeLabel],
            ['看点', a.hi.slice(0, 2).join('、') || '—', b.hi.slice(0, 2).join('、') || '—'],
        ];
        var out = '把 **' + a.name + '** 和 **' + b.name + '** 摆在一起看：\n';
        rows.forEach(function (r) { out += '· ' + r[0] + '：' + a.name + ' — ' + r[1] + '　|　' + b.name + ' — ' + r[2] + '\n'; });
        var winner = rate(a) >= rate(b) ? a : b;
        var closer = a.distance <= b.distance ? a : b;
        out += '\n综合评分 ' + winner.name + ' 略高；离你更近的是 ' + closer.name + '。';
        return out;
    }

    global.PR_AGENT = {
        freshContext: freshContext,
        parseLocal: parseLocal,
        respond: respond,
        isOpenNow: isOpenNow,
        seasonNow: seasonNow,
        runQuery: runQuery,
        slotChips: slotChips,
        tagLabel: tagLabel,
        SORT_LABEL: SORT_LABEL,
    };
})(window);
