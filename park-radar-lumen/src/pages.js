/* Park Radar · Lumen — 我的 page, agent chat page, app boot */
(function (global) {
    'use strict';

    var P = global.PR;
    var D = global.PR_DATA;
    var ART = global.PR_ART;
    var UI = global.PR_UI;
    var PARKS = D.PARKS;

    /* ================================================================ 我的 */
    var mineTab = 'fav';

    function minePage() {
        var el = P.frag('<section class="view is-tab" id="view-mine" aria-label="我的"></section>');
        el.innerHTML =
            '<header class="appbar"><div class="appbar__title"><span>我的</span></div>' +
            '<button class="appbar__btn" data-act="notif" aria-label="通知">' + P.icon('BellIcon') + '</button>' +
            '<button class="appbar__btn" data-act="settings" aria-label="设置">' + P.icon('SettingsIcon') + '</button>' +
            '</header>' + '<div id="mine-body"></div>';
        el._refresh = function () { renderMineBody(el); };
        renderMineBody(el);
        return el;
    }

    function renderMineBody(root) {
        var body = P.qs('#mine-body', root);
        var favs = Object.keys(UI.state.favs).sort(function (a, b) { return UI.state.favs[b] - UI.state.favs[a]; }).map(UI.parkById).filter(Boolean);
        var likes = Object.keys(UI.state.likes).sort(function (a, b) { return UI.state.likes[b] - UI.state.likes[a]; }).map(UI.parkById).filter(Boolean);
        var fps = UI.state.footprints.map(function (f) { return { f: f, p: UI.parkById(f.id) }; }).filter(function (x) { return x.p; });

        var listHtml = '';
        if (mineTab === 'fav') {
            listHtml = favs.length ? favs.map(function (p) { return swipeRow(p); }).join('')
                : empty('StarIcon', '还没有收藏', '在公园卡片右上角点一下星标，就能把它收进这里');
        } else if (mineTab === 'like') {
            listHtml = likes.length ? likes.map(function (p) { return swipeRow(p, true); }).join('')
                : empty('HeartIcon', '还没有点赞', '遇到喜欢的公园点个赞，雷达会记住你的口味');
        } else if (mineTab === 'foot') {
            listHtml = fps.length ? '<div class="timeline">' + fps.slice(0, 14).map(function (x) {
                return '<div class="tl"><span class="tl__dot"></span><div class="tl__time">' + UI.timeAgo(x.f.ts) + '</div>' +
                    '<div class="tl__title">' + P.esc(x.p.name) + ' <span class="tiny muted">· ' + P.esc(x.f.action) + '</span></div>' +
                    '<div class="tl__desc">' + P.esc(x.p.type) + ' · ' + P.esc(x.p.district) + ' · ' + x.p.distance + 'km</div></div>';
            }).join('') + '</div>'
                : empty('CompassIcon', '还没有足迹', '打开任意公园的详情页，这里就会留下记录');
        } else {
            listHtml = settingsHtml();
        }

        body.innerHTML =
            '<div class="profile">' +
            '<div class="profile__deco">' + P.icon('BearIcon') + '</div>' +
            '<div class="profile__row">' +
            '<div class="profile__av">' + P.icon('BearIcon') + '</div>' +
            '<div style="flex:1 1 auto;min-width:0">' +
            '<div class="profile__name">岛民 · 阿岚</div>' +
            '<div class="profile__tag">' + P.icon('LocationIcon') + P.esc(D.USER_ORIGIN.label) + ' 为中心 · <span class="profile__lv">LUMEN Lv.' + (2 + Math.min(9, Math.floor((favs.length + likes.length) / 3))) + '</span></div>' +
            '</div></div>' +
            '<div class="profile__stats">' +
            '<div class="profile__stat" data-act="mine-tab" data-t="fav"><b data-count="' + favs.length + '">0</b><span>收藏</span></div>' +
            '<div class="profile__stat" data-act="mine-tab" data-t="like"><b data-count="' + likes.length + '">0</b><span>点赞</span></div>' +
            '<div class="profile__stat" data-act="mine-tab" data-t="foot"><b data-count="' + fps.length + '">0</b><span>足迹</span></div>' +
            '</div></div>' +

            '<div class="mine-tabs"><div class="seg">' +
            [['fav', '收藏', 'StarIcon'], ['like', '点赞', 'HeartIcon'], ['foot', '足迹', 'CompassIcon'], ['set', '设置', 'SettingsIcon']]
                .map(function (t) {
                    return '<button class="seg__item' + (mineTab === t[0] ? ' is-active' : '') + '" data-act="mine-tab" data-t="' + t[0] + '">' + P.icon(t[2]) + ' ' + t[1] + '</button>';
                }).join('') +
            '</div></div>' +

            '<div class="mine-list" style="padding:12px 16px 0">' + listHtml + '</div>' +
            (mineTab === 'set' ? '' : '<div class="credit">动效参考 <a href="https://rareui.com" target="_blank" rel="noopener">Rare UI</a> · 视觉参考 <a href="https://github.com/guokaigdg/animal-island-ui" target="_blank" rel="noopener">animal-island-ui</a></div>');

        // stat counters
        P.qsa('[data-count]', body).forEach(function (n) { P.countUp(n, parseInt(n.dataset.count, 10) || 0); });
        P.observeReveals(body);
        if (mineTab === 'fav' || mineTab === 'like') bindSwipes(body);
    }

    function empty(icon, title, desc) {
        return '<div class="empty"><span class="empty__ic">' + P.icon(icon) + '</span><div class="empty__title">' + P.esc(title) + '</div><div class="empty__desc">' + P.esc(desc) + '</div></div>';
    }

    function swipeRow(park, isLike) {
        return '<div class="swipe" data-id="' + park.id + '">' +
            '<div class="swipe__actions"><button class="swipe__del" data-act="swipe-del" data-id="' + park.id + '" data-kind="' + (isLike ? 'like' : 'fav') + '">' + P.icon('TrashIcon') + '<span>移除</span></button></div>' +
            '<div class="swipe__panel" data-act="open" data-id="' + park.id + '">' +
            '<span class="swipe__art">' + ART.scene(park, { w: 200, h: 160, detail: 0.5, variant: 0 }) + '</span>' +
            '<span class="swipe__body">' +
            '<span class="swipe__name">' + P.esc(park.name) + '</span>' +
            '<span class="swipe__meta"><span>' + P.esc(park.type) + '</span><span>' + P.esc(park.district) + '</span><span>' + park.distance + 'km</span><span>' + (park.free ? '免费' : park.ticket + '元') + '</span></span>' +
            '</span>' +
            '<span class="swipe__go">' + P.icon('ChevronRightIcon') + '</span>' +
            '</div></div>';
    }

    /** Drag a row left to arm delete — Rare UI's delete-button gesture. */
    function bindSwipes(root) {
        P.qsa('.swipe__panel', root).forEach(function (panel) {
            var startX = 0, startY = 0, dx = 0, dragging = false, moved = false, open = false;
            var row = panel.parentNode;
            function setX(v, animate) {
                panel.style.transition = animate ? 'transform .28s cubic-bezier(.34,1.4,.64,1)' : 'none';
                panel.style.transform = 'translateX(' + v + 'px)';
                var btn = P.qs('.swipe__del', row);
                if (btn) btn.classList.toggle('is-armed', v < -48);
            }
            panel.addEventListener('pointerdown', function (e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                dragging = true; moved = false;
                startX = e.clientX; startY = e.clientY; dx = open ? -76 : 0;
            });
            panel.addEventListener('pointermove', function (e) {
                if (!dragging) return;
                var ddx = e.clientX - startX;
                var ddy = e.clientY - startY;
                if (!moved && Math.abs(ddx) < 6) return;
                if (!moved && Math.abs(ddy) > Math.abs(ddx)) { dragging = false; return; }
                moved = true;
                dx = Math.max(-96, Math.min(0, (open ? -76 : 0) + ddx));
                setX(dx, false);
                if (e.cancelable) e.preventDefault();
            });
            function end() {
                if (!dragging) return;
                dragging = false;
                if (!moved) return;
                open = dx < -40;
                setX(open ? -76 : 0, true);
                if (open) { P.sound.play('tap'); P.haptic(8); }
            }
            panel.addEventListener('pointerup', end);
            panel.addEventListener('pointercancel', end);
            panel.addEventListener('click', function (e) {
                if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
                if (open) { e.preventDefault(); e.stopPropagation(); open = false; setX(0, true); return; }
            }, true);
            panel.addEventListener('lostpointercapture', end);
        });
    }

    function settingsHtml() {
        var s = UI.state.settings;
        return '' +
            '<div class="srow"><span class="srow__ic">' + P.icon('MusicIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t">操作音效</span><span class="srow__d">点赞、收藏、发送时的程序化音效</span></span>' +
            '<button class="switch" role="switch" aria-checked="' + (s.sound ? 'true' : 'false') + '" data-act="toggle-sound" aria-label="音效开关"></button></div>' +

            '<div class="srow"><span class="srow__ic">' + P.icon('ButterflyIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t">动效</span><span class="srow__d">雷达扫描、粒子爆开、卡片入场与里程表数字</span></span>' +
            '<button class="switch" role="switch" aria-checked="' + (s.motion ? 'true' : 'false') + '" data-act="toggle-motion" aria-label="动效开关"></button></div>' +

            '<div class="srow" data-act="llm-config"><span class="srow__ic">' + P.icon('RocketIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t">小岛的大脑</span><span class="srow__d">' + (s.llm && s.llm.enabled ? '已接入大模型：' + P.esc(s.llm.model || '未填模型') + '（失败自动回退本地解析）' : '本地语义解析（离线可用）。可接入任意 OpenAI 兼容接口') + '</span></span>' +
            '<span class="srow__right">' + P.icon('ChevronRightIcon') + '</span></div>' +

            '<div class="srow" data-act="about"><span class="srow__ic">' + P.icon('BookIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t">关于公园雷达 · Lumen</span><span class="srow__d">' + PARKS.length + ' 座公园 · 10 个城区 · 单文件离线可跑</span></span>' +
            '<span class="srow__right">' + P.icon('ChevronRightIcon') + '</span></div>' +

            '<div class="srow" data-act="wipe"><span class="srow__ic">' + P.icon('TrashIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t" style="color:var(--animal-error-active)">清除本机数据</span><span class="srow__d">收藏、点赞、足迹、对话与设置全部清空</span></span>' +
            '<span class="srow__right">' + P.icon('ChevronRightIcon') + '</span></div>' +

            '<div class="toast-note" style="margin-top:4px">' + P.icon('BulbIcon') + ' 本应用为单文件离线 H5：公园数据为演示数据集；小岛默认为本地规则引擎，无需联网，也不会把你的输入发到任何地方。</div>';
    }

    /* --------------------------------------------------------- settings UI */
    function openLLMDrawer() {
        var s = UI.state.settings.llm || { enabled: false, baseUrl: '', apiKey: '', model: '' };
        var html =
            '<div class="toast-note" style="margin-bottom:14px">' + P.icon('BulbIcon') + ' 填好后，小岛会先把你的话发给这个大模型解析成「筛选条件 JSON」，再回到本地数据里查。接口不通或超时会自动退回本地解析，不会卡住。</div>' +
            '<div style="margin-bottom:12px"><div class="strong" style="font-size:13px;margin-bottom:6px">接口地址（OpenAI 兼容）</div>' +
            '<label class="input input--shadow"><input class="input__field" id="llm-base" type="url" placeholder="https://api.example.com/v1" value="' + P.esc(s.baseUrl || '') + '"></label></div>' +
            '<div style="margin-bottom:12px"><div class="strong" style="font-size:13px;margin-bottom:6px">模型名</div>' +
            '<label class="input input--shadow"><input class="input__field" id="llm-model" type="text" placeholder="gpt-4o-mini / deepseek-chat" value="' + P.esc(s.model || '') + '"></label></div>' +
            '<div style="margin-bottom:14px"><div class="strong" style="font-size:13px;margin-bottom:6px">API Key</div>' +
            '<label class="input input--shadow"><input class="input__field" id="llm-key" type="password" placeholder="sk-..." value="' + P.esc(s.apiKey || '') + '"></label>' +
            '<div class="tiny muted" style="margin-top:6px">只存在你自己的浏览器 localStorage 里，不会上传到别处。</div></div>' +
            '<div class="srow" style="cursor:default"><span class="srow__ic">' + P.icon('RocketIcon') + '</span><span class="srow__body">' +
            '<span class="srow__t">启用大模型解析</span><span class="srow__d">关闭时只用本地规则</span></span>' +
            '<button class="switch" role="switch" aria-checked="' + (s.enabled ? 'true' : 'false') + '" id="llm-enable" aria-label="启用大模型"></button></div>';
        P.drawer({
            title: '小岛的大脑', icon: 'RocketIcon', html: html,
            footHtml: '<button class="btn" style="flex:1" data-x="cancel">取消</button><button class="btn btn--primary" style="flex:2" data-x="save">保存</button>',
            onMount: function (panel, close) {
                var enableBtn = P.qs('#llm-enable', panel);
                enableBtn.addEventListener('click', function () {
                    var on = enableBtn.getAttribute('aria-checked') === 'true';
                    enableBtn.setAttribute('aria-checked', on ? 'false' : 'true');
                    P.sound.play('tap');
                });
                panel.addEventListener('click', function (e) {
                    var x = e.target.closest('[data-x]');
                    if (!x) return;
                    if (x.dataset.x === 'cancel') { close(); return; }
                    var cfg = {
                        enabled: enableBtn.getAttribute('aria-checked') === 'true',
                        baseUrl: P.qs('#llm-base', panel).value.trim(),
                        model: P.qs('#llm-model', panel).value.trim(),
                        apiKey: P.qs('#llm-key', panel).value.trim(),
                    };
                    if (cfg.enabled && (!cfg.baseUrl || !cfg.model || !cfg.apiKey)) {
                        P.notify('warning', '还差一点信息', '启用大模型需要同时填接口地址、模型名和 API Key');
                        return;
                    }
                    UI.state.settings.llm = cfg;
                    UI.saveState();
                    close();
                    P.notify(cfg.enabled ? 'success' : 'info', cfg.enabled ? '已接入大模型' : '已切回本地解析', cfg.enabled ? '解析失败时会自动回退，不会影响使用' : '完全离线，无需联网');
                    if (mineTab === 'set') renderMineBody(P.qs('#view-mine'));
                });
            },
        });
    }

    /* ================================================================ agent */
    function agentPage() {
        var el = P.frag('<section class="view is-tab" id="view-agent" aria-label="小岛智能助手"></section>');
        el.innerHTML =
            '<header class="appbar"><div class="appbar__title"><span class="orb orb--sm" style="width:26px;height:26px;display:inline-block"></span><span>小岛</span><span class="brand-sub">PARK GUIDE</span></div>' +
            '<button class="appbar__btn" data-act="chat-reset" aria-label="重新开始">' + P.icon('RefreshIcon') + '</button>' +
            '</header>' +
            '<div class="chat-wrap">' +
            '<div class="chat-scroll" id="chat-scroll"></div>' +
            '<div class="suggests" id="suggests"></div>' +
            '<div class="composer">' +
            '<div class="composer__row">' +
            '<div class="composer__box">' +
            '<textarea class="composer__input" id="chat-input" rows="1" placeholder="想找什么样的公园？说人话就行…" aria-label="输入消息"></textarea>' +
            '<button class="composer__mic" id="chat-mic" data-act="mic" aria-label="语音输入">' + P.icon('MicIcon') + '</button>' +
            '</div>' +
            '<button class="composer__send" id="chat-send" data-act="send" aria-label="发送">' + P.icon('ArrowUpIcon') + '</button>' +
            '</div>' +
            '<div class="composer__hint" id="chat-hint">本地语义解析 · 离线可用 · 说完可补充条件</div>' +
            '</div></div>';

        var scroll = P.qs('#chat-scroll', el);
        var input = P.qs('#chat-input', el);
        var suggests = P.qs('#suggests', el);

        var chat = UI.state.chat || null;
        if (!chat || !chat.messages || !chat.messages.length) {
            chat = {
                ctx: null,
                messages: [{
                    role: 'ai', ts: Date.now(),
                    text: '嗨，我是小岛 🏝️\n这座城市的公园向导。你可以直接说人话——\n· 「带娃去哪玩」\n· 「附近免费能露营的」\n· 「有湖能跑步的公园」\n· 「人少一点的，3 公里内」\n我会把你的话翻译成条件，再在雷达里筛。',
                }],
            };
            UI.state.chat = chat;
            UI.saveState();
        }
        el._chat = chat;

        function renderAll() {
            scroll.innerHTML = chat.messages.map(msgHtml).join('');
            P.qsa('.parse', scroll).forEach(function (n) { n.style.animationDelay = '0ms'; });
            bindHits();
            scrollBottom(true);
        }
        function renderSuggests(list) {
            var items = list || ['附近免费的公园', '适合遛娃的', '能露营的草坪', '现在开着的', '人少又安静的'];
            suggests.innerHTML = items.map(function (s) { return '<button class="suggest" data-act="suggest" data-q="' + P.esc(s) + '">' + P.icon('BulbIcon') + P.esc(s) + '</button>'; }).join('');
        }

        function msgHtml(m) {
            if (m.role === 'me') {
                return '<div class="msg msg--me"><span class="msg__avatar">' + P.icon('UserIcon') + '</span>' +
                    '<div class="msg__col"><div class="bubble">' + P.esc(m.text) + '</div></div></div>';
            }
            var chips = (m.chips && m.chips.length)
                ? '<div class="parse"><span class="parse__label">识别到的条件</span>' +
                m.chips.map(function (c) { return '<span class="parse__chip' + (c.neg ? ' is-neg' : '') + '">' + P.esc(c.label) + '</span>'; }).join('') + '</div>'
                : '';
            var hits = (m.hits && m.hits.length)
                ? '<div class="hits">' + m.hits.map(function (r, i) { return UI.hitCard(r, i); }).join('') + '</div>'
                : '';
            return '<div class="msg"><span class="msg__avatar"><span class="orb" style="width:30px;height:30px"></span></span>' +
                '<div class="msg__col">' + chips +
                '<div class="bubble">' + mdToHtml(m.text) + '</div>' + hits + '</div></div>';
        }

        function mdToHtml(t) {
            return P.esc(t)
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
        }

        function bindHits() {
            P.qsa('.hit', scroll).forEach(function (h) {
                h.addEventListener('click', function () {
                    var p = UI.parkById(h.dataset.id);
                    if (p) { UI.recordFootprint(p, '从对话打开'); }
                });
            });
        }

        function scrollBottom(instant) {
            if (instant) scroll.scrollTop = scroll.scrollHeight;
            else scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
        }

        /* typewriter over already-rendered markup */
        function typewrite(rootEl, speed, done) {
            if (document.body.classList.contains('reduce-motion')) { done && done(); return function () {}; }
            var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
            var textNodes = [];
            var n;
            while ((n = walker.nextNode())) if (n.nodeValue && n.nodeValue.trim()) textNodes.push(n);
            var total = 0;
            textNodes.forEach(function (node) {
                var text = node.nodeValue;
                var f = document.createDocumentFragment();
                for (var i = 0; i < text.length; i++) {
                    var sp = document.createElement('span');
                    sp.textContent = text[i];
                    sp.style.opacity = '0';
                    f.appendChild(sp);
                    total++;
                }
                node.parentNode.replaceChild(f, node);
            });
            var chars = rootEl.querySelectorAll('span');
            var list = [];
            for (var i = 0; i < chars.length; i++) if (chars[i].style.opacity === '0') list.push(chars[i]);
            var idx = 0;
            var doneFlag = false;
            var timer = setInterval(function () {
                if (idx >= list.length) { finish(); return; }
                var step = Math.max(1, Math.round(list.length / 90));
                for (var k = 0; k < step && idx < list.length; k++, idx++) list[idx].style.opacity = '1';
                if (idx % 12 === 0) scrollBottom();
            }, speed || 18);
            function finish() {
                if (doneFlag) return;
                doneFlag = true;
                clearInterval(timer);
                list.forEach(function (c) { c.style.opacity = '1'; });
                done && done();
            }
            setTimeout(finish, 2600);
            return finish;
        }

        var activeTypewrite = null;

        function thinkingBubble() {
            return P.frag('<div class="msg" id="thinking"><span class="msg__avatar"><span class="orb orb--thinking" style="width:30px;height:30px"></span></span>' +
                '<div class="msg__col"><div class="bubble"><span class="thinking"><svg class="thinking__radar" viewBox="0 0 48 48">' +
                '<circle cx="24" cy="24" r="18" fill="none" stroke="#19c8b9" stroke-width="2.5" opacity=".35"/>' +
                '<circle cx="24" cy="24" r="10" fill="none" stroke="#19c8b9" stroke-width="2" opacity=".25"/>' +
                '<path d="M24 24 L24 6" stroke="#19c8b9" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1.4s" repeatCount="indefinite"/></path>' +
                '</svg><span id="think-text">正在理解你的意思</span><span class="dots"><span></span><span></span><span></span></span></span></div></div></div>');
        }

        var THINK_STEPS = ['正在理解你的意思', '正在把话翻译成条件', '正在雷达里检索', '正在按距离和评分排序'];

        async function send(text) {
            text = String(text || '').trim();
            if (!text) return;
            P.sound.play('send');
            P.haptic(10);
            chat.messages.push({ role: 'me', text: text, ts: Date.now() });
            UI.saveState();
            scroll.insertAdjacentHTML('beforeend', msgHtml(chat.messages[chat.messages.length - 1]));
            scrollBottom();
            input.value = '';
            autoGrow();

            var think = thinkingBubble();
            scroll.appendChild(think);
            scrollBottom();
            var step = 0;
            var stepTimer = setInterval(function () {
                step = Math.min(THINK_STEPS.length - 1, step + 1);
                var t = P.qs('#think-text', think);
                if (t) t.textContent = THINK_STEPS[step];
            }, 420);

            var ctx = chat.ctx || global.PR_AGENT.freshContext();
            var llm = UI.state.settings.llm && UI.state.settings.llm.enabled
                ? { enabled: true, baseUrl: UI.state.settings.llm.baseUrl, apiKey: UI.state.settings.llm.apiKey, model: UI.state.settings.llm.model }
                : null;

            var reply;
            try {
                reply = await global.PR_AGENT.respond(text, ctx, { llm: llm });
            } catch (e) {
                reply = { text: '我这会儿有点卡住了，我们先按本地规则来。你再试一次？', parse: { chips: [] }, results: [], mode: 'chat', ctx: ctx };
            }
            clearInterval(stepTimer);

            var minDelay = new Promise(function (r) { setTimeout(r, 620); });
            await minDelay;
            if (think.parentNode) think.parentNode.removeChild(think);

            chat.ctx = reply.ctx || ctx;
            var msg = {
                role: 'ai', ts: Date.now(),
                text: reply.text,
                chips: reply.parse && reply.parse.chips,
                hits: (reply.results || []).map(function (r) { return { park: r.park, why: r.why, score: r.score }; }),
                tier: reply.tier,
            };
            chat.messages.push(msg);
            if (chat.messages.length > 60) chat.messages = chat.messages.slice(-60);
            UI.saveState();

            var node = P.frag(msgHtml(msg));
            scroll.appendChild(node);
            scrollBottom();
            var bubble = P.qs('.bubble', node);
            activeTypewrite = typewrite(bubble, 16, function () { activeTypewrite = null; });
            renderSuggests(reply.suggests);
            P.sound.play('soft');
            var hint = P.qs('#chat-hint', el);
            if (hint) hint.textContent = (reply.tier === 'llm' ? '大模型解析' : '本地语义解析') + ' · 已累计 ' + Math.round(chat.messages.length / 2) + ' 轮对话';
        }
        el._send = send;

        function autoGrow() {
            input.style.height = 'auto';
            input.style.height = Math.min(96, input.scrollHeight) + 'px';
        }
        input.addEventListener('input', autoGrow);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
        });
        el._focusInput = function () { setTimeout(function () { input.focus(); }, 260); };

        /* speech input — real Web Speech API when the browser has it */
        var recog = null;
        function mic() {
            var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
            if (!SR) {
                P.notify('warning', '这个浏览器不支持语音输入', '可以换个 Chrome / Edge，或直接打字给小岛');
                return;
            }
            var btn = P.qs('#chat-mic', el);
            if (recog) { try { recog.stop(); } catch (e) {} recog = null; btn.classList.remove('is-live'); return; }
            recog = new SR();
            recog.lang = 'zh-CN';
            recog.interimResults = true;
            recog.continuous = false;
            btn.classList.add('is-live');
            P.notify('info', '说吧，我在听', '识别结果会实时填进输入框');
            recog.onresult = function (ev) {
                var txt = '';
                for (var i = ev.resultIndex; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
                input.value = txt;
                autoGrow();
                if (ev.results[ev.results.length - 1].isFinal) {
                    btn.classList.remove('is-live');
                    recog = null;
                    setTimeout(function () { send(txt); }, 180);
                }
            };
            recog.onerror = function () {
                btn.classList.remove('is-live');
                recog = null;
                P.notify('warning', '没听清', '再试一次，或者直接打字');
            };
            recog.onend = function () { btn.classList.remove('is-live'); recog = null; };
            try { recog.start(); P.sound.play('scan'); } catch (e) { btn.classList.remove('is-live'); recog = null; }
        }
        el._mic = mic;

        el._reset = function () {
            chat.messages = [{
                role: 'ai', ts: Date.now(),
                text: '好，我们重新开始。想去什么样的公园？',
            }];
            chat.ctx = global.PR_AGENT.freshContext();
            UI.saveState();
            renderAll();
            renderSuggests();
        };
        el._openAbout = function (park) {
            send('把 ' + park.name + ' 的详情给我');
        };
        el._refresh = function () {
            renderAll();
            renderSuggests();
        };
        renderAll();
        renderSuggests();
        return el;
    }

    /* ============================================================== app boot */
    function boot() {
        var stage = P.frag('<div class="stage"></div>');
        var app = P.frag('<div class="app" id="app"></div>');
        var views = P.frag('<div class="views" id="views"></div>');
        var tabbar = P.frag(
            '<nav class="tabbar" id="tabbar" aria-label="主导航">' +
            '<svg class="tabbar__goo" id="goo" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<defs><filter id="gooFilter" x="-30%" y="-60%" width="160%" height="220%">' +
            '<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/>' +
            '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo"/>' +
            '<feComposite in="SourceGraphic" in2="goo" operator="atop"/>' +
            '</filter></defs>' +
            '<g filter="url(#gooFilter)">' +
            '<rect class="goo-rim" x="-20" y="24" height="120" fill="#e2d6bd"/>' +
            '<circle class="goo-rim-ball" cx="0" cy="30" r="31" fill="#e2d6bd"/>' +
            '</g>' +
            '<g filter="url(#gooFilter)">' +
            '<rect class="goo-bar" x="-20" y="27" height="120" fill="#f8f8f0"/>' +
            '<circle class="goo-ball" cx="0" cy="33" r="27" fill="#f8f8f0"/>' +
            '</g>' +
            '</svg>' +
            '<div class="tabbar__tabs" id="tabs"></div>' +
            '</nav>'
        );
        app.appendChild(views);
        app.appendChild(tabbar);
        stage.appendChild(app);
        document.body.appendChild(stage);

        var TABS = [
            { key: 'list', label: '雷达', icon: 'CompassIcon', route: 'list' },
            { key: 'agent', label: '小岛', icon: 'ChatIcon', route: 'agent' },
            { key: 'mine', label: '我的', icon: 'UserIcon', route: 'mine' },
        ];
        var tabsEl = P.qs('#tabs', app);
        tabsEl.innerHTML = TABS.map(function (t, i) {
            return '<button class="tab" data-tab="' + t.key + '" data-i="' + i + '" aria-label="' + t.label + '">' +
                '<span class="tab__dot" data-dot="agent"></span>' + P.icon(t.icon, 'tab__icon') +
                '<span class="tab__label">' + t.label + '</span></button>';
        }).join('');

        var pageList = UI.listPage();
        var pageAgent = agentPage();
        var pageMine = minePage();
        var pageDetail = null;
        views.appendChild(pageList);
        views.appendChild(pageAgent);
        views.appendChild(pageMine);

        var currentTab = 'list';
        var gooBall = P.qs('.goo-ball', app);
        var gooRimBall = P.qs('.goo-rim-ball', app);
        var gooBar = P.qs('.goo-bar', app);
        var gooRim = P.qs('.goo-rim', app);

        function layoutGoo(instant) {
            var w = app.clientWidth;
            var svg = P.qs('#goo', app);
            svg.setAttribute('viewBox', '0 0 ' + w + ' 90');
            gooBar.setAttribute('width', w + 40);
            gooRim.setAttribute('width', w + 40);
            var idx = TABS.findIndex(function (t) { return t.key === currentTab; });
            var tabW = w / TABS.length;
            var cx = tabW * idx + tabW / 2;
            [gooBall, gooRimBall].forEach(function (b) {
                b.style.transition = instant ? 'none' : 'transform .44s cubic-bezier(.34,1.5,.5,1)';
                b.style.transform = 'translateX(' + cx.toFixed(1) + 'px)';
            });
        }

        function setTab(key, opts) {
            opts = opts || {};
            if (key !== 'detail') currentTab = key;
            P.qsa('.tab', tabsEl).forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === currentTab); });
            P.qsa('.view', views).forEach(function (v) { v.classList.remove('is-active'); });
            var map = { list: pageList, agent: pageAgent, mine: pageMine };
            var target = key === 'detail' ? pageDetail : map[key];
            if (target) target.classList.add('is-active');
            app.classList.toggle('is-detail', key === 'detail');
            layoutGoo(opts.instant);
            if (key === 'mine' && pageMine._refresh) pageMine._refresh();
            if (key === 'list' && pageList._refresh) pageList._refresh();
            var dot = P.qs('[data-dot="agent"]', tabsEl);
            if (dot && key === 'agent') {
                dot.classList.remove('is-on');
                P.store.set('agentSeen', true);
            }
        }

        function showDetail(park, push) {
            if (pageDetail && pageDetail.parentNode) pageDetail.parentNode.removeChild(pageDetail);
            pageDetail = UI.detailPage(park);
            pageDetail.classList.add('is-pushed');
            views.appendChild(pageDetail);
            pageDetail.scrollTop = 0;
            // force reflow so the push animation replays
            void pageDetail.offsetWidth;
            setTab('detail');
            UI.recordFootprint(park, '查看详情');
            UI.pushNotif('你打开了 ' + park.name, park.type + ' · ' + park.district + ' · ' + (park.free ? '免费' : park.ticket + ' 元'), park.icon, 'view');
            P.observeReveals(pageDetail);
        }

        function back() {
            P.sound.play('back');
            var from = P.router.current().name;
            if (from === 'park') P.router.go(currentTab === 'detail' ? 'list' : currentTab, true);
            else P.router.go('list', true);
        }

        /* ---------------- global delegated events ---------------- */
        document.addEventListener('click', function (e) {
            var t = e.target;
            var actEl = t.closest ? t.closest('[data-act]') : null;
            var tabBtn = t.closest ? t.closest('[data-tab]') : null;

            if (tabBtn) {
                P.sound.play('tap');
                P.haptic(8);
                P.router.go(tabBtn.dataset.tab);
                return;
            }
            if (!actEl) {
                // clicking a card body
                var card = t.closest ? t.closest('.pcard') : null;
                if (card && card.dataset.id) { openDetailById(card.dataset.id); }
                return;
            }
            var act = actEl.dataset.act;
            var id = actEl.dataset.id;

            switch (act) {
                case 'open': {
                    var c = t.closest('.pcard') || t.closest('.swipe__panel') || t.closest('.hit');
                    openDetailById((c && c.dataset.id) || id);
                    break;
                }
                case 'quick-like': {
                    e.stopPropagation();
                    var on = UI.toggleLike(id, actEl);
                    syncQuick(id);
                    UI.pushNotif(on ? '点赞了 ' + UI.parkById(id).name : '取消点赞', on ? '雷达会更懂你的口味' : '已从点赞里移除', on ? 'HeartIcon' : 'UnlinkIcon', 'like');
                    break;
                }
                case 'quick-fav': {
                    e.stopPropagation();
                    UI.toggleFav(id, actEl);
                    syncQuick(id);
                    break;
                }
                case 'detail-fav': {
                    var onf = UI.toggleFav(id, actEl);
                    actEl.classList.toggle('is-on--fav', onf);
                    actEl.classList.toggle('is-on', onf);
                    actEl.classList.add('is-bumped');
                    setTimeout(function () { actEl.classList.remove('is-bumped'); }, 460);
                    break;
                }
                case 'detail-like': {
                    var onl = UI.toggleLike(id, actEl);
                    actEl.classList.toggle('is-on', onl);
                    actEl.classList.add('is-bumped');
                    setTimeout(function () { actEl.classList.remove('is-bumped'); }, 460);
                    break;
                }
                case 'back': back(); break;
                case 'agent-jump':
                    P.sound.play('tap');
                    P.router.go('agent');
                    if (pageAgent._focusInput) pageAgent._focusInput();
                    break;
                case 'agent-about': {
                    P.router.go('agent');
                    var pk = UI.parkById(id);
                    if (pk && pageAgent._openAbout) setTimeout(function () { pageAgent._openAbout(pk); }, 320);
                    break;
                }
                case 'notif': UI.openNotifDrawer(); break;
                case 'settings': P.router.go('mine'); setTimeout(function () { mineTab = 'set'; pageMine._refresh(); }, 60); break;
                case 'clear-q': {
                    var qi = P.qs('#list-q', pageList);
                    qi.value = '';
                    UI.listState.q = '';
                    UI.listState.shown = 8;
                    pageList._refresh();
                    qi.focus();
                    break;
                }
                case 'cat': {
                    var k = actEl.dataset.cat;
                    var cats = UI.listState.cats;
                    if (k === '') cats.length = 0;
                    else {
                        var i = cats.indexOf(k);
                        if (i === -1) cats.push(k); else cats.splice(i, 1);
                    }
                    P.sound.play('tap');
                    UI.listState.shown = 8;
                    pageList._refresh();
                    break;
                }
                case 'filters':
                    UI.openFilterDrawer(function () { pageList._refresh(); });
                    break;
                case 'sort': {
                    var order = ['default', 'distance', 'rating', 'heat', 'quiet'];
                    var names = { default: '智能排序', distance: '离我最近', rating: '评分最高', heat: '人气最旺', quiet: '最安静' };
                    var cur = order.indexOf(UI.listState.sort);
                    UI.listState.sort = order[(cur + 1) % order.length];
                    P.sound.play('tap');
                    actEl.querySelector('#sort-label').textContent = names[UI.listState.sort];
                    UI.listState.shown = 8;
                    pageList._refresh();
                    break;
                }
                case 'load-more': {
                    UI.listState.shown += 8;
                    P.sound.play('tap');
                    pageList._refresh();
                    break;
                }
                case 'scan': {
                    P.sound.play('scan');
                    P.haptic(16);
                    var h = actEl;
                    h.style.transition = 'transform .6s cubic-bezier(.34,1.5,.5,1)';
                    h.style.transform = 'rotate(360deg)';
                    setTimeout(function () { h.style.transition = 'none'; h.style.transform = 'none'; }, 640);
                    var best = UI.applyListFilter()[0];
                    P.notify('info', '扫描完成', best ? ('离你最近的高分选择：' + best.name + ' · ' + best.distance + 'km') : '当前条件下没有结果');
                    break;
                }
                case 'collapse': {
                    actEl.classList.toggle('is-open');
                    P.sound.play('tap');
                    break;
                }
                case 'zoom': {
                    var zp = UI.parkById(actEl.dataset.id);
                    var v = parseInt(actEl.dataset.v, 10);
                    var labels = ['清晨', '白昼', '黄昏', '夜色'];
                    P.modal({
                        title: zp.name + ' · ' + labels[v],
                        html: '<div style="border-radius:18px;overflow:hidden;border:2px solid #e8dcc8">' + ART.scene(zp, { w: 800, h: 480, variant: v }) + '</div>' +
                            '<div style="font-size:13px;color:#8a7b66;margin-top:10px">同一座公园在不同时刻的样子——图片由程序按这个公园的类型与种子实时生成。</div>',
                        confirmText: '好看', cancelText: null,
                    });
                    break;
                }
                case 'nav': {
                    var np = UI.parkById(id);
                    P.modal({
                        title: '去 ' + np.name,
                        html: '<div style="font-size:14px;line-height:1.7">地址：<b>' + P.esc(np.area) + '</b><br>距离：约 ' + np.distance + 'km' +
                            (np.parking ? '<br>停车：约 ' + np.parking + ' 个车位' : '<br>停车：无专用停车场') +
                            '<br>交通：' + np.transit.map(P.esc).join('　/　') + '</div>' +
                            '<div class="toast-note" style="margin-top:12px">' + P.icon('BulbIcon') + ' 这是离线演示，没有跳转真实地图。复制地址到你的地图 App 即可。</div>',
                        confirmText: '复制地址',
                        cancelText: '关闭',
                    }).then(function (ok) {
                        if (!ok) return;
                        var txt = np.name + ' ' + np.area;
                        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { P.notify('success', '地址已复制', txt); }, function () { P.notify('warning', '复制失败', '请手动记一下：' + txt); });
                        else P.notify('info', '地址', txt);
                    });
                    break;
                }
                case 'share': {
                    var sp = UI.parkById(id) || (pageDetail && pageDetail.querySelector('.hero__name') ? null : null);
                    P.modal({
                        title: '分享这座公园',
                        html: '<div style="font-size:14px;line-height:1.7">复制一句话推荐给朋友，或者直接把链接发过去。</div>' +
                            '<div class="toast-note" style="margin-top:12px">' + P.icon('ShareIcon') + ' 链接会带上这座公园的详情页锚点。</div>',
                        confirmText: '复制链接',
                        cancelText: '关闭',
                    }).then(function (ok) {
                        if (!ok) return;
                        var url = location.origin + location.pathname + '#/park/' + (id || '');
                        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { P.notify('success', '链接已复制', url); }, function () { P.notify('info', '链接', url); });
                    });
                    break;
                }
                case 'mine-tab': {
                    mineTab = actEl.dataset.t;
                    P.sound.play('tap');
                    pageMine._refresh();
                    break;
                }
                case 'toggle-sound': {
                    var son = P.sound.toggle();
                    UI.state.settings.sound = son;
                    UI.saveState();
                    actEl.setAttribute('aria-checked', son ? 'true' : 'false');
                    if (son) P.sound.play('fav');
                    P.notify(son ? 'success' : 'info', son ? '音效已开启' : '音效已关闭');
                    break;
                }
                case 'toggle-motion': {
                    var mon = !UI.state.settings.motion;
                    UI.state.settings.motion = mon;
                    UI.saveState();
                    document.body.classList.toggle('reduce-motion', !mon);
                    actEl.setAttribute('aria-checked', mon ? 'true' : 'false');
                    P.notify(mon ? 'success' : 'info', mon ? '动效已开启' : '动效已精简');
                    break;
                }
                case 'llm-config': openLLMDrawer(); break;
                case 'about': {
                    P.modal({
                        title: '公园雷达 · Lumen',
                        html: '<div style="font-size:14px;line-height:1.75">' +
                            '一个单文件离线 H5 应用：' + PARKS.length + ' 座公园、10 个城区、4 个页面、1 个会说人话的向导。<br><br>' +
                            '<b>视觉</b>：动物岛风格设计系统（暖色羊皮纸底、薄荷青主色、胶囊控件、只给主按钮用的 3D 像素堆叠阴影、燕尾绶带标题、SVG 水滴形弹窗），图标取自 <b>naive-icons</b> 的 125 个字形，已内联，无外部依赖。<br><br>' +
                            '<b>动效</b>：粘性导航的 gooey 连接颈、点赞收藏的粒子迸发、里程表数字、卡片网格揭示、流体球头像、弹簧平滑的滚动进度、指针邻近响应、左滑删除——机制参考 <b>Rare UI</b>（rareui.com，MIT + Commons Clause + Attribution），用原生 CSS/WAAPI 重写。<br><br>' +
                            '<b>向导</b>：默认本地规则语义解析，离线可用；可在设置里接入任意 OpenAI 兼容接口提升理解力，失败自动回退。<br><br>' +
                            '<b>数据</b>：演示用途，坐标为近似值。</div>',
                        confirmText: '知道了', cancelText: null,
                    });
                    break;
                }
                case 'wipe': {
                    P.modal({
                        title: '清除本机数据？',
                        body: '收藏、点赞、足迹、对话记录与设置都会被删掉，且无法恢复。',
                        confirmText: '确认清除',
                        cancelText: '再想想',
                    }).then(function (ok) {
                        if (!ok) return;
                        P.store.wipe();
                        UI.state.likes = {}; UI.state.favs = {}; UI.state.footprints = []; UI.state.notifs = []; UI.state.chat = null;
                        UI.state.settings = { sound: true, motion: true, llm: { enabled: false, baseUrl: '', apiKey: '', model: '' } };
                        UI.saveState();
                        P.notify('success', '已清除', '一切都回到刚打开时的样子');
                        setTimeout(function () { location.reload(); }, 700);
                    });
                    break;
                }
                case 'swipe-del': {
                    var kind = actEl.dataset.kind;
                    var dp = UI.parkById(id);
                    P.modal({
                        title: '移除「' + dp.name + '」？',
                        body: kind === 'fav' ? '它会从你的收藏里消失。' : '它会被移出点赞列表。',
                        confirmText: '移除', cancelText: '留下',
                    }).then(function (ok) {
                        if (!ok) return;
                        if (kind === 'fav') delete UI.state.favs[id]; else delete UI.state.likes[id];
                        UI.saveState();
                        P.sound.play('pop');
                        P.burstAt(actEl, { set: 'pop', count: 10, size: 17 });
                        P.notify('info', '已移除', dp.name);
                        setTimeout(function () { pageMine._refresh(); }, 220);
                    });
                    break;
                }
                case 'chat-reset': {
                    P.modal({ title: '重新开始对话？', body: '当前的对话与筛选条件会被清空。', confirmText: '重新开始', cancelText: '取消' })
                        .then(function (ok) { if (ok && pageAgent._reset) pageAgent._reset(); });
                    break;
                }
                case 'send': {
                    if (pageAgent._send) pageAgent._send(P.qs('#chat-input', pageAgent).value);
                    break;
                }
                case 'mic': if (pageAgent._mic) pageAgent._mic(); break;
                case 'suggest': {
                    P.sound.play('tap');
                    if (pageAgent._send) pageAgent._send(actEl.dataset.q);
                    break;
                }
            }
        });

        function syncQuick(id) {
            var favOn = !!UI.state.favs[id];
            P.qsa('[data-act="quick-fav"][data-id="' + id + '"]').forEach(function (b) {
                b.classList.toggle('is-on', favOn);
                b.setAttribute('aria-pressed', favOn ? 'true' : 'false');
            });
            var likeOn = !!UI.state.likes[id];
            P.qsa('[data-act="quick-like"][data-id="' + id + '"]').forEach(function (b) {
                b.classList.toggle('is-on', likeOn);
                b.setAttribute('aria-pressed', likeOn ? 'true' : 'false');
            });
        }

        function openDetailById(id) {
            var park = UI.parkById(id);
            if (!park) return;
            P.sound.play('open');
            P.haptic(10);
            P.router.go('park/' + id);
        }

        // keyboard: Enter/Space on cards, Esc to go back
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (document.querySelector('.mask')) return;
                if (P.router.current().name === 'park') back();
                return;
            }
            var card = e.target.closest && e.target.closest('.pcard');
            if (card && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                openDetailById(card.dataset.id);
            }
        });

        /* ---------------- routing ---------------- */
        P.router.on(function (r) {
            if (r.name === 'park' && r.param) {
                var park = UI.parkById(r.param);
                if (park) { showDetail(park); return; }
                P.router.go('list', true);
                return;
            }
            if (r.name === 'detail' && r.param) {
                var park2 = UI.parkById(r.param);
                if (park2) { showDetail(park2); return; }
                P.router.go('list', true);
                return;
            }
            var key = ['list', 'agent', 'mine'].indexOf(r.name) === -1 ? 'list' : r.name;
            // leaving detail: drop the pushed page
            if (pageDetail && pageDetail.parentNode && key !== 'detail') {
                pageDetail.parentNode.removeChild(pageDetail);
                pageDetail = null;
            }
            setTab(key, { instant: false });
            if (key === 'agent' && pageAgent._refresh) pageAgent._refresh();
        });

        global.addEventListener('resize', function () { layoutGoo(true); });

        // apply saved settings
        document.body.classList.toggle('reduce-motion', !UI.state.settings.motion);
        if (!UI.state.settings.sound) P.sound.off();
        if (!UI.state.settings.llm) UI.state.settings.llm = { enabled: false, baseUrl: '', apiKey: '', model: '' };

        // unlock audio on first gesture
        var unlock = function () { P.sound.unlock(); document.removeEventListener('pointerdown', unlock); };
        document.addEventListener('pointerdown', unlock);

        // pointer-proximity response on the nav icons and chips (Rare UI proximity-sidebar)
        P.proximity(P.qs('#tabs', app), '.tab', 96, 0.1);
        P.proximity(pageList, '.chip', 90, 0.12);

        UI.renderBadge();
        layoutGoo(true);
        P.router.start();

        // nudge toward the guide until it has been opened once
        if (!P.store.get('agentSeen', false)) {
            var nudge = P.qs('[data-dot="agent"]', tabsEl);
            if (nudge) nudge.classList.add('is-on');
        }

        // first-run welcome notification
        if (!P.store.get('welcomed', false)) {
            P.store.set('welcomed', true);
            setTimeout(function () {
                P.notify('success', '欢迎来到公园雷达', PARKS.length + ' 座公园已就位，去「小岛」说句话试试', 4200);
            }, 900);
        }
        document.body.classList.add('is-ready');
    }

    global.PR_BOOT = boot;
})(window);
