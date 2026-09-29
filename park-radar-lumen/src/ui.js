/* Park Radar · Lumen — shell, list page, detail page */
(function (global) {
    'use strict';

    var P = global.PR;
    var D = global.PR_DATA;
    var ART = global.PR_ART;
    var PARKS = D.PARKS;

    var state = {
        likes: P.store.get('likes', {}),
        favs: P.store.get('favs', {}),
        footprints: P.store.get('footprints', []),
        notifs: P.store.get('notifs', []),
        settings: P.store.get('settings', { sound: true, motion: true, llm: null }),
        llmEnabled: false,
    };
    P.store.get('settings', null);
    if (!state.settings.llm) state.settings.llm = { enabled: false, baseUrl: '', apiKey: '', model: '' };
    state.llmEnabled = !!state.settings.llm.enabled;

    function saveState() {
        P.store.set('likes', state.likes);
        P.store.set('favs', state.favs);
        P.store.set('footprints', state.footprints);
        P.store.set('notifs', state.notifs);
        P.store.set('settings', state.settings);
        if (state.chat) P.store.set('chat', { ctx: state.chat.ctx, messages: state.chat.messages.slice(-40) });
    }
    function parkById(id) {
        for (var i = 0; i < PARKS.length; i++) if (PARKS[i].id === id) return PARKS[i];
        return null;
    }
    function favCount() { return Object.keys(state.favs).length; }
    function likeCount() { return Object.keys(state.likes).length; }

    function toggleLike(id, el) {
        if (state.likes[id]) { delete state.likes[id]; P.sound.play('tap'); P.haptic(6); }
        else {
            state.likes[id] = Date.now();
            P.sound.play('like'); P.haptic(12);
            if (el) { el.classList.add('is-bumped'); setTimeout(function () { el.classList.remove('is-bumped'); }, 480); }
            P.burstAt(el, { set: 'like', count: 15, size: 20, spread: 2.0 });
        }
        saveState();
        return !!state.likes[id];
    }
    function toggleFav(id, el) {
        var on;
        if (state.favs[id]) { delete state.favs[id]; P.sound.play('tap'); P.haptic(6); on = false; }
        else {
            state.favs[id] = Date.now();
            P.sound.play('fav'); P.haptic(14);
            if (el) { el.classList.add('is-bumped'); setTimeout(function () { el.classList.remove('is-bumped'); }, 480); }
            P.burstAt(el, { set: 'fav', count: 18, size: 21, spread: 2.3 });
            P.notify('success', '已收藏 ' + (parkById(id) || {}).name, '在「我的 → 收藏」里能找到它');
            on = true;
        }
        saveState();
        return on;
    }
    function pushNotif(title, desc, icon, cat) {
        state.notifs.unshift({ title: title, desc: desc, icon: icon || 'BellIcon', cat: cat || 'info', ts: Date.now() });
        state.notifs = state.notifs.slice(0, 30);
        saveState();
        renderBadge();
    }
    function recordFootprint(park, action) {
        state.footprints.unshift({ id: park.id, action: action || '浏览', ts: Date.now() });
        state.footprints = state.footprints.slice(0, 60);
        saveState();
    }

    /* ------------------------------------------------------- shared renderers */
    function quickBtn(kind, id) {
        var on = kind === 'like' ? !!state.likes[id] : !!state.favs[id];
        var ic = kind === 'like' ? 'HeartIcon' : 'StarIcon';
        return '<button class="qbtn qbtn--' + kind + (on ? ' is-on' : '') + '" data-act="quick-' + kind + '" data-id="' + id + '" aria-pressed="' + on + '" aria-label="' + (kind === 'like' ? '点赞' : '收藏') + '">' +
            '<span class="qbtn__bump"></span>' + P.icon(ic) + '</button>';
    }

    function crowdBar(level) {
        var out = '<span class="crowdbar">';
        for (var i = 1; i <= 5; i++) {
            out += '<i class="' + (i <= level ? 'on' : '') + (level >= 4 ? ' hot' : '') + '"></i>';
        }
        return out + '</span>';
    }

    function parkCard(park, idx) {
        var tags = park.tags.slice(0, 3);
        return '<article class="pcard reveal" data-idx="' + (idx % 8) + '" data-act="open" data-id="' + park.id + '" role="button" tabindex="0" aria-label="' + P.esc(park.name) + ' 详情">' +
            '<div class="pcard__art">' + ART.scene(park, { w: 400, h: 240, variant: 0 }) +
            '<div class="pcard__badges">' +
            '<span class="pcard__badge pcard__badge--' + (park.free ? 'free' : 'paid') + '">' + (park.free ? '免费' : park.ticket + ' 元') + '</span>' +
            '<span class="pcard__badge pcard__badge--rating">' + P.icon('StarIcon') + park.rating + '</span>' +
            (park.is24h ? '<span class="pcard__badge">全天</span>' : '') +
            '</div>' +
            '<div class="pcard__quick">' + quickBtn('like', park.id) + quickBtn('fav', park.id) + '</div>' +
            '</div>' +
            '<div class="pcard__body">' +
            '<div class="pcard__titlerow"><span class="pcard__name">' + P.esc(park.name) + '</span><span class="pcard__type">' + P.esc(park.type) + '</span></div>' +
            '<div class="pcard__meta">' +
            '<span class="pcard__metaitem">' + P.icon('LocationIcon') + P.esc(park.district) + ' · ' + park.distance + 'km</span>' +
            '<span class="pcard__metaitem">' + P.icon('ClockIcon') + P.esc(park.openLabel) + '</span>' +
            '</div>' +
            '<div class="pcard__tags">' + tags.map(function (t) { return '<span class="minitag">' + P.esc(t) + '</span>'; }).join('') + '</div>' +
            '<div class="pcard__foot"><div class="pcard__crowd">' + crowdBar(park.crowd) +
            '<div class="pcard__live">人流' + park.crowdLabel + ' · ' + P.esc(park.quietLabel) + '</div></div>' +
            '<span class="pill-note">' + P.esc(park.size) + '</span>' +
            '</div></div></article>';
    }

    function hitCard(r, idx) {
        var p = r.park;
        return '<button class="hit" data-act="open" data-id="' + p.id + '" style="animation-delay:' + (idx * 60) + 'ms">' +
            '<span class="hit__art">' + ART.scene(p, { w: 200, h: 160, detail: 0.4, variant: 0 }) + '</span>' +
            '<span class="hit__body">' +
            '<span class="hit__name"><span class="hit__rank">' + (idx + 1) + '</span>' + P.esc(p.name) + '</span>' +
            '<span class="hit__why">' + P.esc((r.why || []).join(' · ')) + '</span>' +
            '<span class="hit__meta"><span>' + P.esc(p.type) + '</span><span>' + p.distance + 'km</span><span>' + P.esc(p.free ? '免费' : p.ticket + '元') + '</span><span>' + P.icon('StarIcon') + p.rating + '</span></span>' +
            '</span></button>';
    }

    /* --------------------------------------------------------- list filtering */
    var listState = {
        q: '',
        cats: [],
        price: 'all',
        maxDistance: null,
        minRating: null,
        facilities: [],
        sort: 'default',
        shown: 8,
        loading: false,
    };

    var CATS = [
        { key: '亲子', icon: 'BearIcon' },
        { key: '露营', icon: 'TentIcon' },
        { key: '跑步', icon: 'DumbbellIcon' },
        { key: '拍照', icon: 'CameraIcon' },
        { key: '湖景', icon: 'SailboatIcon' },
        { key: '樱花', icon: 'CherryIcon' },
        { key: '观鸟', icon: 'BirdIcon' },
        { key: '夜景', icon: 'MoonIcon' },
        { key: '古迹', icon: 'BookIcon' },
        { key: '登高', icon: 'MountainIcon' },
    ];

    function applyListFilter() {
        var q = listState.q.trim();
        var out = PARKS.filter(function (p) {
            if (listState.price === 'free' && !p.free) return false;
            if (listState.price === 'paid' && p.free) return false;
            if (listState.maxDistance != null && p.distance > listState.maxDistance) return false;
            if (listState.minRating != null && p.rating < listState.minRating) return false;
            for (var i = 0; i < listState.cats.length; i++) if (p.tags.indexOf(listState.cats[i]) === -1) return false;
            for (var j = 0; j < listState.facilities.length; j++) if (p.fac.indexOf(listState.facilities[j]) === -1) return false;
            if (q) {
                var hay = (p.name + ' ' + p.type + ' ' + p.district + ' ' + p.area + ' ' + p.tags.join(' ') + ' ' + p.hi.join(' ') + ' ' + p.intro).toLowerCase();
                var words = q.toLowerCase().split(/\s+/).filter(Boolean);
                for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) === -1) return false;
            }
            return true;
        });
        if (listState.sort === 'distance') out.sort(function (a, b) { return a.distance - b.distance; });
        else if (listState.sort === 'rating') out.sort(function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; });
        else if (listState.sort === 'heat') out.sort(function (a, b) { return b.heat - a.heat; });
        else if (listState.sort === 'quiet') out.sort(function (a, b) { return b.quiet - a.quiet || a.crowd - b.crowd; });
        else out.sort(function (a, b) { return (b.rating * 12 + Math.log(1 + b.reviews) * 4 - b.distance) - (a.rating * 12 + Math.log(1 + a.reviews) * 4 - a.distance); });
        return out;
    }

    function activeFilterCount() {
        var n = 0;
        if (listState.price !== 'all') n++;
        if (listState.maxDistance != null) n++;
        if (listState.minRating != null) n++;
        n += listState.facilities.length;
        if (listState.sort !== 'default') n++;
        return n;
    }

    /* ------------------------------------------------------------ list page */
    function listPage() {
        var el = P.frag('<section class="view is-tab" id="view-list" aria-label="公园列表"></section>');

        function headerHtml() {
            return '<header class="appbar" id="list-appbar">' +
                '<div class="appbar__title"><span>公园雷达</span><span class="brand-sub">LUMEN</span></div>' +
                '<button class="appbar__btn" data-act="agent-jump" aria-label="问我">' + P.icon('ChatIcon') + '</button>' +
                '<button class="appbar__btn" data-act="notif" aria-label="通知">' + P.icon('BellIcon') + '<span class="appbar__badge appbar__badge--bell is-bell" id="notif-badge" hidden>0</span></button>' +
                '</header>' +
                '<div class="radar-card">' +
                '<div class="radar-card__art">' + radarArt() + '</div>' +
                '<div class="radar-card__body">' +
                '<div class="radar-card__text">' +
                '<div class="radar-card__kicker">' + P.icon('CompassIcon') + '本城公园雷达</div>' +
                '<div class="radar-card__title">已扫描到 ' + PARKS.length + ' 座公园</div>' +
                '<div class="radar-card__sub">以' + P.esc(D.USER_ORIGIN.label) + '为中心 · 覆盖 10 个城区</div>' +
                '<div class="radar-card__stats">' +
                '<div class="radar-card__stat"><b>' + PARKS.filter(function (p) { return p.free; }).length + '</b><span>免费</span></div>' +
                '<div class="radar-card__stat"><b>' + PARKS.filter(function (p) { return global.PR_AGENT.isOpenNow(p); }).length + '</b><span>此刻开放</span></div>' +
                '<div class="radar-card__stat"><b>' + PARKS.filter(function (p) { return p.distance <= 5; }).length + '</b><span>5km 内</span></div>' +
                '</div></div>' +
                '<div class="radar-card__scan" aria-hidden="true">' + radarMini() + '</div>' +
                '</div></div>';
        }

        function radarArt() {
            return '<svg viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '<path d="M0,150 Q60,120 120,138 T260,126 T400,142 L400,200 L0,200 Z" fill="rgba(127,227,212,.12)"/>' +
                '<path d="M0,168 Q90,146 170,162 T400,158 L400,200 L0,200 Z" fill="rgba(127,227,212,.1)"/>' +
                '<circle cx="330" cy="44" r="30" fill="rgba(255,223,138,.14)"/>' +
                '<circle cx="330" cy="44" r="15" fill="rgba(255,223,138,.3)"/>' +
                '</svg>';
        }
        function radarMini() {
            var blips = '';
            var r = ART.rng(42);
            for (var i = 0; i < 7; i++) {
                var a = r() * Math.PI * 2, d = 12 + r() * 34;
                blips += '<span class="radar-card__blip" style="left:' + (50 + Math.cos(a) * d).toFixed(1) + '%;top:' + (50 + Math.sin(a) * d).toFixed(1) + '%;animation-delay:' + (r() * 3).toFixed(2) + 's"></span>';
            }
            return '<span class="radar-card__ring"></span><span class="radar-card__ring"></span>' +
                '<span class="radar-card__cross radar-card__cross--h"></span><span class="radar-card__cross radar-card__cross--v"></span>' +
                '<span class="radar-card__sweep"></span>' + blips + '<span class="radar-card__center"></span>';
        }

        function skeletonCards(n) {
            var out = '';
            for (var i = 0; i < n; i++) {
                out += '<div class="pcard skel-card">' +
                    '<div class="skel" style="height:132px;border-radius:0"></div>' +
                    '<div style="padding:13px 14px 15px">' +
                    '<div class="skel skel--text" style="width:56%"></div>' +
                    '<div class="skel skel--text" style="width:38%;height:12px;margin-top:9px"></div>' +
                    '<div style="display:flex;gap:6px;margin-top:11px">' +
                    '<span class="skel skel--pill" style="width:56px;height:20px"></span>' +
                    '<span class="skel skel--pill" style="width:44px;height:20px"></span>' +
                    '<span class="skel skel--pill" style="width:64px;height:20px"></span>' +
                    '</div></div></div>';
            }
            return '<div class="plist">' + out + '</div>';
        }

        function listBodyHtml() {
            var arr = applyListFilter();
            var shown = arr.slice(0, listState.shown);
            var cards = shown.map(function (p, i) { return parkCard(p, i); }).join('');
            var more = arr.length > listState.shown
                ? '<div style="text-align:center;padding:6px 0 2px"><button class="btn btn--dashed btn--sm" data-act="load-more">加载更多（还有 ' + (arr.length - listState.shown) + ' 座）</button></div>'
                : (arr.length ? '<div class="credit" style="padding:14px 0 0;font-size:11px">— 已经到底啦 —</div>' : '');
            var empty = '<div class="empty"><span class="empty__ic">' + P.icon('CompassIcon') + '</span>' +
                '<div class="empty__title">雷达没扫到符合条件的公园</div>' +
                '<div class="empty__desc">把筛选放松一点，或者去问问小岛<br><button class="btn btn--primary btn--sm" style="margin-top:12px" data-act="agent-jump">' + P.icon('ChatIcon') + ' 让小岛帮我找</button></div></div>';
            return '<div class="plist" id="plist">' + (arr.length ? cards : empty) + '</div>' + more;
        }

        el.innerHTML = headerHtml() +
            '<div class="ptr" id="ptr"><div class="ptr__inner">' + '<span class="ptr__radar">' + P.icon('CompassIcon') + '</span>正在扫描…</div></div>' +
            '<div class="searchbar">' +
            '<label class="input input--shadow">' + '<span class="input__prefix">' + P.icon('SearchIcon') + '</span>' +
            '<input class="input__field" id="list-q" type="search" placeholder="搜公园名 / 特色 / 区域" aria-label="搜索公园">' +
            '<button class="input__clear" data-act="clear-q" aria-label="清空" hidden>' + P.icon('CloseIcon') + '</button></label>' +
            '<button class="searchbar__scan" data-act="scan" aria-label="雷达扫描">' + P.icon('CompassIcon') + '</button>' +
            '</div>' +
            '<div class="rail" id="cat-rail">' +
            '<button class="chip is-on" data-act="cat" data-cat="">全部分类</button>' +
            CATS.map(function (c) { return '<button class="chip" data-act="cat" data-cat="' + c.key + '">' + P.icon(c.icon) + P.esc(c.key) + '</button>'; }).join('') +
            '</div>' +
            '<div class="toolrow">' +
            '<button class="toolbtn" data-act="filters">' + P.icon('SettingsIcon') + '筛选<span class="toolbtn__count" id="fcount" hidden>0</span></button>' +
            '<button class="toolbtn" data-act="sort">' + P.icon('ArrowDownIcon') + '<span id="sort-label">智能排序</span></button>' +
            '<span class="toolrow__spacer"></span>' +
            '<span class="tiny muted" id="result-count"></span>' +
            '</div>' +
            '<div id="list-body">' + skeletonCards(4) + '</div>';

        /* ---- behaviour ---- */
        var q = P.qs('#list-q', el);
        var clearBtn = P.qs('[data-act="clear-q"]', el);
        var countEl = P.qs('#result-count', el);
        var appbar = P.qs('#list-appbar', el);
        var debounce = null;

        function refresh() {
            var arr = applyListFilter();
            listState.shown = Math.max(8, Math.min(listState.shown, arr.length || 8));
            P.qs('#list-body', el).innerHTML = listBodyHtml();
            countEl.textContent = arr.length + ' 个结果';
            clearBtn.hidden = !q.value;
            var n = activeFilterCount();
            var fc = P.qs('#fcount', el);
            fc.hidden = n === 0;
            fc.textContent = n;
            P.qs('#sort-label', el).textContent = P.qs('#sort-label', el).textContent; // keep
            P.observeReveals(el);
            updateCatChips();
        }
        function updateCatChips() {
            P.qsa('#cat-rail .chip', el).forEach(function (c) {
                var k = c.dataset.cat;
                var on = k === '' ? listState.cats.length === 0 : listState.cats.indexOf(k) !== -1;
                c.classList.toggle('is-on', on);
            });
        }
        el._refresh = refresh;

        // the first paint shows the scanning skeleton, then the cards deal in
        var firstLoad = true;
        function bootList() {
            setTimeout(function () {
                firstLoad = false;
                refresh();
            }, 620);
        }
        bootList();

        q.addEventListener('input', function () {
            clearTimeout(debounce);
            debounce = setTimeout(function () {
                listState.q = q.value;
                listState.shown = 8;
                refresh();
            }, 170);
        });
        q.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { q.blur(); listState.q = q.value; refresh(); }
        });

        // pull to refresh
        var ptr = P.qs('#ptr', el);
        var startY = 0, pulling = false;
        el.addEventListener('touchstart', function (e) {
            if (el.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
        }, { passive: true });
        el.addEventListener('touchmove', function (e) {
            if (!pulling) return;
            var dy = e.touches[0].clientY - startY;
            if (dy > 0 && el.scrollTop <= 0) {
                ptr.style.height = Math.min(56, dy * 0.42) + 'px';
                ptr.classList.toggle('is-idle', dy * 0.42 < 46);
            }
        }, { passive: true });
        el.addEventListener('touchend', function () {
            if (!pulling) return;
            pulling = false;
            if (parseFloat(ptr.style.height) > 40) {
                ptr.classList.remove('is-idle');
                ptr.style.height = '56px';
                P.sound.play('scan');
                listState.shown = 8;
                P.qs('#list-body', el).innerHTML = skeletonCards(4);
                setTimeout(function () {
                    refresh();
                    ptr.style.height = '0px';
                    P.notify('info', '雷达已刷新', '重新扫描了 ' + PARKS.length + ' 座公园');
                }, 620);
            } else {
                ptr.style.height = '0px';
            }
        });

        el.addEventListener('scroll', function () {
            appbar.classList.toggle('is-scrolled', el.scrollTop > 6);
        }, { passive: true });

        // infinite scroll
        el.addEventListener('scroll', function () {
            if (listState.loading) return;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) {
                var arr = applyListFilter();
                if (listState.shown < arr.length) {
                    listState.loading = true;
                    listState.shown += 8;
                    setTimeout(function () { refresh(); listState.loading = false; }, 180);
                }
            }
        }, { passive: true });

        return el;
    }

    /* ---------------------------------------------------------- filter drawer */
    function openFilterDrawer(onApply) {
        var prices = [['all', '不限'], ['free', '只看免费'], ['paid', '可以收费']];
        var dists = [[null, '不限'], [3, '3km 内'], [5, '5km 内'], [10, '10km 内'], [20, '20km 内']];
        var ratings = [[null, '不限'], [4.0, '4.0 以上'], [4.5, '4.5 以上'], [4.7, '4.7 以上']];
        var facs = ['停车场', '母婴室', '无障碍通道', '直饮水', '儿童游乐区', '餐厅', '自行车租赁', '充电桩'];
        var sorts = [['default', '智能排序'], ['distance', '离我最近'], ['rating', '评分最高'], ['heat', '人气最旺'], ['quiet', '最安静']];

        var html =
            '<div class="section" style="padding:0 0 4px"><div class="strong" style="font-size:13px;margin-bottom:8px">价格</div><div class="seg" data-group="price">' +
            prices.map(function (p) { return '<button class="seg__item' + (listState.price === p[0] ? ' is-active' : '') + '" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="section" style="padding:16px 0 4px"><div class="strong" style="font-size:13px;margin-bottom:8px">距离</div><div class="seg" data-group="dist">' +
            dists.map(function (p) { return '<button class="seg__item' + (listState.maxDistance === p[0] ? ' is-active' : '') + '" data-v="' + (p[0] == null ? '' : p[0]) + '">' + p[1] + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="section" style="padding:16px 0 4px"><div class="strong" style="font-size:13px;margin-bottom:8px">评分</div><div class="seg" data-group="rating">' +
            ratings.map(function (p) { return '<button class="seg__item' + (listState.minRating === p[0] ? ' is-active' : '') + '" data-v="' + (p[0] == null ? '' : p[0]) + '">' + p[1] + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="section" style="padding:16px 0 4px"><div class="strong" style="font-size:13px;margin-bottom:8px">必须有的设施</div><div class="rail" style="padding:0;flex-wrap:wrap;overflow:visible">' +
            facs.map(function (f) { return '<button class="chip' + (listState.facilities.indexOf(f) !== -1 ? ' is-on' : '') + '" data-fac="' + f + '">' + P.esc(f) + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="section" style="padding:16px 0 4px"><div class="strong" style="font-size:13px;margin-bottom:8px">排序</div><div class="seg" data-group="sort" style="flex-wrap:wrap">' +
            sorts.map(function (s) { return '<button class="seg__item' + (listState.sort === s[0] ? ' is-active' : '') + '" data-v="' + s[0] + '" style="flex:0 0 auto">' + s[1] + '</button>'; }).join('') +
            '</div></div>';

        P.drawer({
            title: '筛选与排序', icon: 'SettingsIcon', html: html,
            footHtml: '<button class="btn" style="flex:1" data-x="reset">重置</button><button class="btn btn--primary" style="flex:2" data-x="apply">看看结果</button>',
            onMount: function (panel, close) {
                var draft = { price: listState.price, maxDistance: listState.maxDistance, minRating: listState.minRating, sort: listState.sort, facilities: listState.facilities.slice() };
                function sync() {
                    P.qsa('.seg', panel).forEach(function (seg) {
                        var group = seg.dataset.group;
                        P.qsa('.seg__item', seg).forEach(function (b) {
                            var v = b.dataset.v;
                            var cur = draft[group];
                            var match = (group === 'dist' || group === 'rating') ? (String(cur == null ? '' : cur) === v) : (cur === v);
                            b.classList.toggle('is-active', match);
                        });
                    });
                    P.qsa('[data-fac]', panel).forEach(function (b) {
                        b.classList.toggle('is-on', draft.facilities.indexOf(b.dataset.fac) !== -1);
                    });
                }
                panel.addEventListener('click', function (e) {
                    var seg = e.target.closest('.seg__item');
                    if (seg) {
                        var group = seg.parentNode.dataset.group;
                        var v = seg.dataset.v;
                        if (group === 'price') draft.price = v;
                        else if (group === 'sort') draft.sort = v;
                        else if (group === 'dist') draft.maxDistance = v === '' ? null : parseFloat(v);
                        else if (group === 'rating') draft.minRating = v === '' ? null : parseFloat(v);
                        P.sound.play('tap');
                        sync();
                        return;
                    }
                    var fac = e.target.closest('[data-fac]');
                    if (fac) {
                        var k = fac.dataset.fac;
                        var i = draft.facilities.indexOf(k);
                        if (i === -1) draft.facilities.push(k); else draft.facilities.splice(i, 1);
                        P.sound.play('tap');
                        sync();
                        return;
                    }
                    var x = e.target.closest('[data-x]');
                    if (x) {
                        if (x.dataset.x === 'reset') {
                            draft = { price: 'all', maxDistance: null, minRating: null, sort: 'default', facilities: [] };
                            sync();
                            P.sound.play('tap');
                        } else {
                            listState.price = draft.price;
                            listState.maxDistance = draft.maxDistance;
                            listState.minRating = draft.minRating;
                            listState.sort = draft.sort;
                            listState.facilities = draft.facilities;
                            listState.shown = 8;
                            P.sound.play('pop');
                            close();
                            onApply();
                        }
                    }
                });
            },
        });
    }

    /* ---------------------------------------------------------- detail page */
    function detailPage(park) {
        var el = P.frag('<section class="view is-pushed" id="view-detail" aria-label="' + P.esc(park.name) + ' 详情"></section>');
        var nearby = PARKS.filter(function (p) { return p.id !== park.id; })
            .sort(function (a, b) { return (Math.abs(a.distance - park.distance) + Math.abs(a.rating - park.rating)) - (Math.abs(b.distance - park.distance) + Math.abs(b.rating - park.rating)); })
            .slice(0, 4);

        var reviews = [
            { n: '林小满', ic: 'BearIcon', s: 5, t: '周末早上八点到的，人还不多。' + (park.hi[0] ? park.hi[0] + '确实好看，' : '') + '走一圈一个半小时，很舒服。', d: '2 天前' },
            { n: '阿岛', ic: 'FoxIcon', s: 4, t: '地方不错，就是' + (park.crowd >= 4 ? '人有点多，建议避开下午' : '配套少了点，最好自己带水') + '。', d: '1 周前' },
            { n: '小海豚', ic: 'FishIcon', s: 5, t: '带小孩来的，' + (park.playground ? '儿童区能玩很久，' : '路面平推车很方便，') + '下次还来。', d: '3 周前' },
        ];

        var facIcon = {
            停车场: 'CarIcon', 公共厕所: 'WaterCupIcon', 母婴室: 'BearIcon', 无障碍通道: 'UserIcon',
            直饮水: 'WaterCupIcon', 自动售卖机: 'CartIcon', 游客中心: 'HomeIcon', 儿童游乐区: 'BalloonIcon',
            健身器材: 'DumbbellIcon', 篮球场: 'BasketballIcon', 足球场: 'TrophyIcon', 网球场: 'TrophyIcon',
            餐厅: 'CoffeeIcon', 茶室: 'CoffeeCupIcon', 驿站: 'HomeIcon', 观景平台: 'EyeIcon',
            自行车租赁: 'BicycleIcon', 充电桩: 'BulbIcon', 婴儿车租赁: 'BearIcon', 电梯: 'ArrowUpIcon',
            游船码头: 'AnchorIcon', 摇橹船码头: 'AnchorIcon', 观光车: 'CarIcon', 凉亭: 'HomeIcon',
            儿童滑梯: 'BalloonIcon', 棋牌长廊: 'LampIcon',
        };

        el.innerHTML =
            '<div class="scrollprog" id="dprog"><div class="scrollprog__bar"></div><div class="scrollprog__label"></div></div>' +
            '<div class="hero">' +
            '<div class="hero__art" id="hero-art">' + ART.scene(park, { w: 800, h: 480, variant: 0 }) + '</div>' +
            '<div class="hero__scrim"></div>' +
            '<button class="hero__back" data-act="back" aria-label="返回">' + P.icon('ArrowLeftIcon') + '</button>' +
            '<div class="hero__actions">' +
            '<button class="hero__back" style="position:static" data-act="share" aria-label="分享">' + P.icon('ShareIcon') + '</button>' +
            '</div>' +
            '<div class="hero__caption">' +
            '<div class="hero__name">' + P.esc(park.name) + '</div>' +
            '<div class="hero__sub">' +
            '<span class="hero__pill">' + P.icon('StarIcon') + park.rating + '</span>' +
            '<span class="hero__pill">' + P.icon('LocationIcon') + P.esc(park.district) + ' · ' + park.distance + 'km</span>' +
            '<span class="hero__pill">' + P.icon('ClockIcon') + P.esc(park.openLabel) + '</span>' +
            '<span class="hero__pill">' + (park.free ? '免费' : park.ticket + ' 元') + '</span>' +
            '</div></div></div>' +

            '<div class="dsheet">' +
            '<div class="dstats">' +
            '<div class="dstat"><div class="dstat__v">' + park.rating + '</div><div class="dstat__k">评分</div></div>' +
            '<div class="dstat"><div class="dstat__v">' + park.distance + '<span style="font-size:11px">km</span></div><div class="dstat__k">距离</div></div>' +
            '<div class="dstat"><div class="dstat__v">' + P.esc(park.size) + '</div><div class="dstat__k">面积</div></div>' +
            '<div class="dstat"><div class="dstat__v">' + park.built + '</div><div class="dstat__k">建园</div></div>' +
            '</div>' +

            '<div class="section"><div class="section__head"><span class="title title--layer title--teal" style="font-size:15px"><span class="title__layerFront">看点</span></span>' +
            '<span class="tiny muted">' + park.reviews + ' 条评价</span></div>' +
            '<p style="font-size:14px;line-height:1.75;color:var(--animal-text-muted)">' + P.esc(park.intro) + '</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">' +
            park.hi.map(function (h) { return '<span class="tag tag--app-teal tag--soft tag--sm">' + P.icon('StarIcon') + P.esc(h) + '</span>'; }).join('') +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">特色标签</span></div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:7px">' +
            park.tags.map(function (t) {
                var m = P.tagMeta(t);
                return '<span class="tag tag--' + m[1] + ' tag--soft tag--sm">' + P.icon(m[0]) + P.esc(t) + '</span>';
            }).join('') +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">园区写真</span><span class="tiny muted">按一天里的不同时刻生成</span></div>' +
            '<div class="gallery">' +
            [0, 1, 2, 3].map(function (v) {
                return '<div class="gallery__item" data-act="zoom" data-v="' + v + '" data-id="' + park.id + '">' + ART.scene(park, { w: 380, h: 240, variant: v }) + '</div>';
            }).join('') +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">实用信息</span>' +
            '<button class="section__more" data-act="nav" data-id="' + park.id + '">' + P.icon('LocationIcon') + '带我去</button></div>' +
            '<div class="card" style="padding:6px 16px">' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('ClockIcon') + '</span><span class="mapline__k">开放</span><span class="mapline__v">' + P.esc(park.openLabel) + (global.PR_AGENT.isOpenNow(park) ? ' <span class="pill-note">此刻开放</span>' : ' <span style="color:var(--animal-error)">此刻闭园</span>') + '</span></div>' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('TagIcon') + '</span><span class="mapline__k">票价</span><span class="mapline__v">' + (park.free ? '免费开放' : park.ticket + ' 元 / 人') + '</span></div>' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('LocationIcon') + '</span><span class="mapline__k">地址</span><span class="mapline__v">' + P.esc(park.area) + '（' + P.esc(park.district) + '）</span></div>' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('CarIcon') + '</span><span class="mapline__k">停车</span><span class="mapline__v">' + (park.parking ? '约 ' + park.parking + ' 个车位' : '<span class="muted">无专用停车场，建议公共交通</span>') + '</span></div>' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('TrainIcon') + '</span><span class="mapline__k">交通</span><span class="mapline__v">' + park.transit.map(P.esc).join('<br>') + '</span></div>' +
            '<div class="mapline"><span class="mapline__ic">' + P.icon('PhoneIcon') + '</span><span class="mapline__k">电话</span><span class="mapline__v">' + P.esc(park.phone) + '</span></div>' +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">现场体感</span></div>' +
            '<div class="card" style="padding:14px 16px">' +
            meter('人流密度', park.crowd, 5, park.crowdLabel, '#e05a5a') +
            meter('安静程度', park.quiet, 5, park.quietLabel, '#19c8b9') +
            meter('遮荫程度', park.shade, 5, park.shadeLabel, '#6fba2c') +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">设施</span><span class="tiny muted">' + park.fac.length + ' 项</span></div>' +
            '<div class="facgrid">' +
            park.fac.map(function (f) {
                return '<div class="fac"><span class="fac__ic">' + P.icon(facIcon[f] || 'CheckIcon') + '</span><span class="fac__t">' + P.esc(f) + '</span></div>';
            }).join('') +
            '</div></div>' +

            '<div class="section"><div class="section__head"><span class="strong">位置</span><span class="tiny muted">经纬 ' + park.lat.toFixed(4) + ', ' + park.lng.toFixed(4) + '</span></div>' +
            '<div class="minimap">' + ART.map({ parks: PARKS.filter(function (p) { return p.distance < 8; }), focus: park.id, w: 360, h: 180 }) + '</div>' +
            '</div>' +

            (park.tips.length ? '<div class="section"><div class="section__head"><span class="strong">过来人的建议</span></div>' +
                park.tips.map(function (t, i) {
                    return '<div class="collapse' + (i === 0 ? ' is-open' : '') + '" data-act="collapse"><button class="collapse__head">' +
                        '<span class="collapse__icon">' + P.icon('ArrowDownIcon') + '</span>' +
                        '<span class="collapse__title">' + P.esc(t.split(/[，,。]/)[0]) + '</span>' +
                        '<span class="collapse__fish">' + P.icon('FishIcon') + '</span></button>' +
                        '<div class="collapse__grid"><div class="collapse__inner"><div class="collapse__body">' + P.esc(t) + '</div></div></div></div>';
                }).join('') + '</div>' : '') +

            '<div class="section"><div class="section__head"><span class="strong">大家怎么说</span><span class="tiny muted">' + park.reviews + ' 条</span></div>' +
            reviews.map(function (r) {
                return '<div class="review"><span class="review__av">' + P.icon(r.ic) + '</span><div class="review__body">' +
                    '<div class="review__top"><span class="review__name">' + P.esc(r.n) + '</span><span class="review__stars">' +
                    Array.apply(null, Array(r.s)).map(function () { return P.icon('StarIcon'); }).join('') + '</span></div>' +
                    '<div class="review__text">' + P.esc(r.t) + '</div><div class="review__time">' + r.d + '</div></div></div>';
            }).join('') + '</div>' +

            '<div class="section" style="padding-bottom:8px"><div class="section__head"><span class="strong">附近还有</span></div>' +
            '<div class="plist" style="padding:0">' + nearby.map(function (p, i) { return parkCard(p, i); }).join('') + '</div></div>' +

            '<div class="credit">公园雷达 · Lumen · 数据为演示用途<br>视觉参考 animal-island-ui · 动效参考 <a href="https://rareui.com" target="_blank" rel="noopener">Rare UI</a></div>' +
            '</div>' +

            '<div class="dbar">' +
            '<button class="dbar__btn' + (state.favs[park.id] ? ' is-on--fav is-on' : '') + '" data-act="detail-fav" data-id="' + park.id + '">' + P.icon('StarIcon') + '</button>' +
            '<button class="dbar__btn' + (state.likes[park.id] ? ' is-on' : '') + '" data-act="detail-like" data-id="' + park.id + '">' + P.icon('HeartIcon') + '</button>' +
            '<button class="dbar__btn" data-act="nav" data-id="' + park.id + '">' + P.icon('LocationIcon') + '</button>' +
            '<button class="btn btn--primary" style="flex:1" data-act="agent-about" data-id="' + park.id + '">' + P.icon('ChatIcon') + '问问小岛</button>' +
            '</div>';

        var hero = P.qs('#hero-art', el);
        var prog = P.qs('#dprog', el).firstElementChild;
        var label = P.qs('.scrollprog__label', el);
        P.scrollProgress(el, prog, label, ['看点', '写真', '信息', '体感', '设施', '位置', '建议', '评价', '附近']);
        el.addEventListener('scroll', function () {
            var y = el.scrollTop;
            if (y < 300) hero.style.transform = 'translateY(' + (y * 0.35).toFixed(1) + 'px) scale(' + (1 + y * 0.0006).toFixed(3) + ')';
        }, { passive: true });

        return el;
    }

    function meter(key, value, max, label, color) {
        var pct = Math.round((value / max) * 100);
        return '<div style="margin-bottom:12px">' +
            '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span class="strong">' + P.esc(key) + '</span><span class="muted">' + P.esc(label) + '</span></div>' +
            '<div class="progress__track progress__track--sm"><div class="progress__fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '</div>';
    }

    /* --------------------------------------------------------- notification */
    function openNotifDrawer() {
        var html = state.notifs.length
            ? state.notifs.map(function (n) {
                return '<div class="srow" style="cursor:default"><span class="srow__ic">' + P.icon(n.icon) + '</span><span class="srow__body">' +
                    '<span class="srow__t">' + P.esc(n.title) + '</span><span class="srow__d">' + P.esc(n.desc) + '</span></span>' +
                    '<span class="srow__right tiny muted">' + timeAgo(n.ts) + '</span></div>';
            }).join('')
            : '<div class="empty"><span class="empty__ic">' + P.icon('BellIcon') + '</span><div class="empty__title">还没有提醒</div><div class="empty__desc">收藏或点赞公园后，这里会记下你的动作</div></div>';
        P.drawer({
            title: '消息与提醒', icon: 'BellIcon', side: 'right', html: html,
            footHtml: state.notifs.length ? '<button class="btn btn--block" data-x="clear">清空全部</button>' : '',
            onMount: function (panel, close) {
                panel.addEventListener('click', function (e) {
                    if (e.target.closest('[data-x="clear"]')) {
                        state.notifs = [];
                        saveState();
                        renderBadge();
                        close();
                        P.notify('info', '已清空提醒');
                    }
                });
            },
        });
    }

    function timeAgo(ts) {
        var s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return '刚刚';
        if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
        if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
        return Math.floor(s / 86400) + ' 天前';
    }

    function renderBadge() {
        var b = P.qs('#notif-badge');
        if (!b) return;
        var n = state.notifs.length;
        b.hidden = n === 0;
        b.textContent = n > 99 ? '99+' : n;
    }

    /* --------------------------------------------------------------- exports */
    global.PR_UI = {
        state: state, saveState: saveState, parkById: parkById,
        favCount: favCount, likeCount: likeCount,
        toggleLike: toggleLike, toggleFav: toggleFav,
        pushNotif: pushNotif, recordFootprint: recordFootprint,
        parkCard: parkCard, hitCard: hitCard, crowdBar: crowdBar, quickBtn: quickBtn,
        listPage: listPage, detailPage: detailPage,
        openFilterDrawer: openFilterDrawer, openNotifDrawer: openNotifDrawer,
        renderBadge: renderBadge, timeAgo: timeAgo,
        listState: listState, CATS: CATS, applyListFilter: applyListFilter,
    };
})(window);
