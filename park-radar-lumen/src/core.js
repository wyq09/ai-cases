/* Park Radar · Lumen — core runtime
 * Tiny DOM/store/audio/fx layer. No framework, no dependencies.
 */
(function (global) {
    'use strict';

    /* ------------------------------------------------------------------ dom */
    function qs(sel, root) { return (root || document).querySelector(sel); }
    function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    /** Build a detached element from an HTML string. */
    function frag(html) {
        var t = document.createElement('template');
        t.innerHTML = String(html).trim();
        return t.content.firstElementChild;
    }
    function fragAll(html) {
        var t = document.createElement('template');
        t.innerHTML = String(html).trim();
        return t.content;
    }
    /** Escape for interpolation into markup. */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    /** Highlight every occurrence of any keyword (already-escaped output). */
    function mark(text, words) {
        var out = esc(text);
        (words || [])
            .filter(function (w) { return w && w.length >= 2; })
            .sort(function (a, b) { return b.length - a.length; })
            .forEach(function (w) {
                var safe = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                out = out.replace(new RegExp(safe, 'g'), '<span class="hl">' + esc(w) + '</span>');
            });
        return out;
    }

    /** Render one of the extracted naive-icons glyphs. */
    function icon(name, extraClass, inline) {
        var body = (global.PR_ICONS && global.PR_ICONS[name]) || (global.PR_ICONS && global.PR_ICONS.TreeIcon) || '';
        var inner = '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
        if (inline) return inner;
        return '<span class="ic' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' + inner + '</span>';
    }
    function iconBody(name) {
        return (global.PR_ICONS && global.PR_ICONS[name]) || (global.PR_ICONS && global.PR_ICONS.TreeIcon) || '';
    }

    /* ---------------------------------------------------------------- store */
    var NS = 'prl.';
    var store = {
        get: function (k, dflt) {
            try {
                var raw = localStorage.getItem(NS + k);
                if (raw == null) return dflt;
                return JSON.parse(raw);
            } catch (e) { return dflt; }
        },
        set: function (k, v) {
            try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ }
            return v;
        },
        del: function (k) { try { localStorage.removeItem(NS + k); } catch (e) {} },
        wipe: function () {
            try {
                Object.keys(localStorage)
                    .filter(function (k) { return k.indexOf(NS) === 0; })
                    .forEach(function (k) { localStorage.removeItem(k); });
            } catch (e) {}
        },
    };

    /* --------------------------------------------------------------- audio */
    var sound = (function () {
        var ctx = null;
        var enabled = store.get('sound', true);

        function ac() {
            if (!ctx) {
                var C = global.AudioContext || global.webkitAudioContext;
                if (!C) return null;
                ctx = new C();
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }
        function tone(freq, dur, type, gain, delay, slideTo) {
            var c = ac();
            if (!c || !enabled) return;
            var t0 = c.currentTime + (delay || 0);
            var osc = c.createOscillator();
            var g = c.createGain();
            osc.type = type || 'triangle';
            osc.frequency.setValueAtTime(freq, t0);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(gain || 0.09, t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g).connect(c.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        }
        function noise(dur, gain, freq) {
            var c = ac();
            if (!c || !enabled) return;
            var len = Math.floor(c.sampleRate * dur);
            var buf = c.createBuffer(1, len, c.sampleRate);
            var data = buf.getChannelData(0);
            for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
            var src = c.createBufferSource();
            src.buffer = buf;
            var bp = c.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = freq || 1400;
            var g = c.createGain();
            g.gain.value = gain || 0.06;
            src.connect(bp).connect(g).connect(c.destination);
            src.start();
        }
        var CUES = {
            tap: function () { tone(720, 0.055, 'square', 0.05); },
            soft: function () { tone(523, 0.09, 'sine', 0.06); },
            like: function () { tone(659, 0.1, 'triangle', 0.08); tone(988, 0.13, 'triangle', 0.06, 0.06); },
            fav: function () { tone(784, 0.1, 'triangle', 0.08); tone(1175, 0.15, 'triangle', 0.06, 0.07); },
            pop: function () { tone(880, 0.07, 'sine', 0.09, 0, 1500); },
            open: function () { tone(440, 0.1, 'sine', 0.05); tone(660, 0.14, 'sine', 0.05, 0.05); },
            back: function () { tone(560, 0.1, 'sine', 0.05, 0, 330); },
            send: function () { noise(0.16, 0.05, 1800); tone(660, 0.08, 'sine', 0.05, 0.02, 1200); },
            success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.07, i * 0.075); }); },
            error: function () { tone(300, 0.18, 'sawtooth', 0.055); tone(190, 0.24, 'sawtooth', 0.05, 0.1); },
            scan: function () { tone(300, 0.5, 'sine', 0.045, 0, 1500); },
        };
        return {
            play: function (name) { try { (CUES[name] || CUES.tap)(); } catch (e) {} },
            on: function () { enabled = true; store.set('sound', true); },
            off: function () { enabled = false; store.set('sound', false); },
            isOn: function () { return enabled; },
            toggle: function () { enabled ? this.off() : this.on(); return enabled; },
            unlock: function () { ac(); },
        };
    })();

    function haptic(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
    }

    /* -------------------------------------------------------- notifications */
    var notifRoot = null;
    function notifStack() {
        if (!notifRoot) {
            notifRoot = frag('<div class="notif-root" aria-live="polite"><div class="notif-stack"></div></div>');
            document.body.appendChild(notifRoot);
        }
        return qs('.notif-stack', notifRoot);
    }
    var NOTIF_ICON = { success: 'CheckIcon', error: 'CloseIcon', warning: 'BulbIcon', info: 'BellIcon', default: 'BellIcon' };
    function notify(type, message, desc, ms) {
        var stack = notifStack();
        var node = frag(
            '<div class="notif notif--' + esc(type || 'info') + '">' +
            '<span class="notif__icon">' + icon(NOTIF_ICON[type] || 'BellIcon') + '</span>' +
            '<div style="flex:1 1 auto;min-width:0">' +
            '<div class="notif__title">' + esc(message) + '</div>' +
            (desc ? '<div class="notif__desc">' + esc(desc) + '</div>' : '') +
            '</div></div>'
        );
        stack.appendChild(node);
        var t = setTimeout(close, ms || 2600);
        function close() {
            clearTimeout(t);
            node.classList.add('is-out');
            setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
        }
        node.addEventListener('click', close);
        return close;
    }

    /* ------------------------------------------------- modal (blob clip) */
    function ensureModalDefs() {
        if (qs('#animal-modal-defs')) return;
        var defs = frag(
            '<svg id="animal-modal-defs" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>' +
            '<clipPath id="animal-modal-clip" clipPathUnits="objectBoundingBox">' +
            '<path d="M0.501,0.005 L0.501,0.005 L0.523,0.005 L0.549,0.006 C0.704,0.01,0.796,0.017,0.825,0.027 L0.827,0.028 C0.872,0.045,0.939,0.044,0.978,0.17 C1,0.254,1,0.365,0.99,0.505 L0.988,0.513 C0.979,0.558,0.971,0.598,0.965,0.633 C0.956,0.689,0.979,0.77,0.964,0.865 C0.953,0.928,0.921,0.966,0.869,0.979 C0.821,0.986,0.773,0.992,0.726,0.995 L0.712,0.996 L0.694,0.997 C0.648,1,0.586,1,0.507,1 L0.501,1 L0.464,1 C0.385,1,0.325,0.998,0.283,0.995 C0.234,0.992,0.184,0.987,0.133,0.979 C0.081,0.966,0.05,0.928,0.039,0.865 C0.023,0.77,0.047,0.689,0.037,0.633 C0.031,0.595,0.023,0.552,0.013,0.505 C-0.006,0.365,-0.002,0.254,0.024,0.17 C0.064,0.045,0.13,0.045,0.174,0.028 L0.175,0.028 C0.204,0.017,0.303,0.009,0.474,0.005 L0.501,0.005"/>' +
            '</clipPath></defs></svg>'
        );
        document.body.appendChild(defs);
    }

    /** Blob-clipped modal. Resolves true when confirmed, false otherwise. */
    function modal(opts) {
        ensureModalDefs();
        return new Promise(function (resolve) {
            var mask = frag(
                '<div class="mask" role="dialog" aria-modal="true">' +
                '<div class="modal">' +
                '<div class="modal__clip">' +
                '<button class="modal__close" aria-label="关闭">' + icon('CloseIcon') + '</button>' +
                (opts.title ? '<div class="modal__title">' + esc(opts.title) + '</div>' : '') +
                '<div class="modal__body">' + (opts.html || esc(opts.body || '')) + '</div>' +
                '<div class="modal__footer">' +
                (opts.cancelText === null ? '' : '<button class="btn" data-x="no">' + esc(opts.cancelText || '取消') + '</button>') +
                '<button class="btn btn--confirm" data-x="yes">' + esc(opts.confirmText || '好的') + '</button>' +
                '</div></div></div></div>'
            );
            document.body.appendChild(mask);
            var done = false;
            function close(val) {
                if (done) return;
                done = true;
                mask.style.transition = 'opacity .18s ease';
                mask.style.opacity = '0';
                setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 190);
                resolve(val);
                if (opts.onClose) opts.onClose(val);
            }
            mask.addEventListener('click', function (e) {
                var x = e.target.closest('[data-x]');
                if (x) { sound.play(x.dataset.x === 'yes' ? 'pop' : 'tap'); close(x.dataset.x === 'yes'); return; }
                if (e.target === mask || e.target.closest('.modal__close')) { sound.play('tap'); close(false); }
            });
            setTimeout(function () { var b = qs('[data-x="yes"]', mask); if (b) b.focus(); }, 60);
        });
    }

    /* ------------------------------------------------------------- drawer */
    function drawer(opts) {
        var side = opts.side === 'right' ? 'right' : 'bottom';
        var mask = frag('<div class="drawer-mask"></div>');
        var panel = frag(
            '<div class="drawer drawer--' + side + '" role="dialog" aria-modal="true">' +
            '<div class="drawer__head">' +
            '<div class="drawer__title">' + (opts.icon ? icon(opts.icon) : '') + esc(opts.title || '') + '</div>' +
            '<button class="drawer__close" aria-label="关闭">' + icon('CloseIcon') + '</button>' +
            '</div>' +
            '<div class="drawer__body">' + (opts.html || '') + '</div>' +
            (opts.footHtml ? '<div class="drawer__foot">' + opts.footHtml + '</div>' : '') +
            '</div>'
        );
        document.body.appendChild(mask);
        document.body.appendChild(panel);
        document.body.classList.add('is-recessed');
        var done = false;
        function close() {
            if (done) return;
            done = true;
            document.body.classList.remove('is-recessed');
            panel.style.animationDirection = 'reverse';
            mask.style.transition = 'opacity .2s ease';
            mask.style.opacity = '0';
            setTimeout(function () {
                if (panel.parentNode) panel.parentNode.removeChild(panel);
                if (mask.parentNode) mask.parentNode.removeChild(mask);
            }, 260);
            if (opts.onClose) opts.onClose();
        }
        mask.addEventListener('click', close);
        panel.addEventListener('click', function (e) {
            if (e.target.closest('.drawer__close')) close();
        });
        if (opts.onMount) opts.onMount(panel, close);
        sound.play('open');
        return { el: panel, close: close };
    }

    /* --------------------------------------------------------- fx: bursts */
    var fxLayer = null;
    function layer() {
        if (!fxLayer) {
            fxLayer = frag('<div class="fx-layer" aria-hidden="true"></div>');
            document.body.appendChild(fxLayer);
        }
        return fxLayer;
    }
    var BURST_SETS = {
        like: ['HeartIcon', 'HeartIcon', 'FlowerIcon', 'StarIcon', 'LeafIcon', 'ButterflyIcon'],
        fav: ['StarIcon', 'StarIcon', 'CheckIcon', 'FlowerIcon', 'BeeIcon', 'SunIcon'],
        pop: ['LeafIcon', 'FlowerIcon', 'ButterflyIcon', 'BeeIcon', 'AppleIcon'],
        spark: ['StarIcon', 'BulbIcon', 'SunIcon', 'RainbowIcon'],
    };
    /**
     * Particle burst anchored at (x, y) — adapted from Rare UI's emoji-reaction
     * particle model (origin, travel, drift, tilt sway, scale envelope, blur fade).
     */
    function burst(x, y, opts) {
        opts = opts || {};
        var count = opts.count || 16;
        var size = opts.size || 22;
        var set = BURST_SETS[opts.set || 'pop'] || BURST_SETS.pop;
        var reduce = document.body.classList.contains('reduce-motion');
        var host = layer();
        function spawn(i) {
            var ang = -Math.PI / 2 + (Math.random() - 0.5) * (opts.spread || 2.1);
            var travel = 46 + Math.random() * 74;
            var drift = (Math.random() - 0.5) * 54;
            var tilt = (Math.random() - 0.5) * 190;
            var dur = 700 + Math.random() * 620;
            var delay = Math.random() * 130;
            var sc = 0.55 + Math.random() * 0.6;
            var name = set[(Math.random() * set.length) | 0];
            var node = frag(
                '<span class="fx-p" style="width:' + size + 'px;height:' + size + 'px">' + icon(name, null, true) + '</span>'
            );
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            node.style.marginLeft = (-size / 2) + 'px';
            node.style.marginTop = (-size / 2) + 'px';
            host.appendChild(node);
            if (reduce) { host.removeChild(node); return; }
            var dx = Math.cos(ang) * travel * 0.55 + drift;
            var dy = Math.sin(ang) * travel;
            // clear the node on a timer as well as on finish, so a dropped frame
            // can never leave orphaned particles in the layer
            var done = false;
            function kill() {
                if (done) return;
                done = true;
                if (node.parentNode) node.parentNode.removeChild(node);
            }
            try {
                var anim = node.animate(
                    [
                        { transform: 'translate(0px, 0px) scale(0.3) rotate(0deg)', opacity: 0.95, filter: 'blur(0px)' },
                        { transform: 'translate(' + dx * 0.45 + 'px,' + dy * 0.72 + 'px) scale(' + sc * 1.15 + ') rotate(' + tilt * 0.4 + 'deg)', opacity: 1, offset: 0.24, filter: 'blur(0px)' },
                        { transform: 'translate(' + dx + 'px,' + (dy * 1.02 - 12) + 'px) scale(' + sc * 0.62 + ') rotate(' + tilt + 'deg)', opacity: 0, filter: 'blur(' + (2.2 + Math.random() * 3) + 'px)' },
                    ],
                    { duration: dur, delay: delay, easing: 'cubic-bezier(0.18, 0.72, 0.32, 1)', fill: 'forwards' }
                );
                anim.onfinish = kill;
            } catch (e) { /* WAAPI unavailable */ }
            setTimeout(kill, dur + delay + 120);
        }
        for (var i = 0; i < count; i++) spawn(i);
    }
    /** Burst centred on an element. */
    function burstAt(el, opts) {
        if (!el) return;
        var r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, opts);
    }

    /* ------------------------------------------------------- fx: odometer */
    /** Build an odometer markup string for a number (digit strips). */
    function odo(value, opts) {
        opts = opts || {};
        var str = String(Math.max(0, Math.round(value)));
        var out = '<span class="odo" data-odo="' + esc(str) + '">';
        for (var i = 0; i < str.length; i++) {
            var ch = str[i];
            if (ch < '0' || ch > '9') { out += '<span class="odo__d">' + esc(ch) + '</span>'; continue; }
            out += '<span class="odo__d"><span class="odo__strip" data-digit="' + ch + '">';
            for (var d = 0; d <= 9; d++) out += '<span>' + d + '</span>';
            out += '</span></span>';
        }
        return out + (opts.suffix ? esc(opts.suffix) : '') + '</span>';
    }
    /** Animate every odometer inside `root` to its data-odo target. */
    function runOdometers(root) {
        qsa('.odo', root).forEach(function (o) {
            var target = String(o.dataset.odo || '0');
            var strips = qsa('.odo__strip', o);
            strips.forEach(function (strip, idx) {
                var ch = target[idx];
                if (!ch || ch < '0' || ch > '9') return;
                var n = parseInt(ch, 10);
                strip.style.transitionDelay = (idx * 55) + 'ms';
                requestAnimationFrame(function () { strip.style.transform = 'translateY(' + (-n) + 'em)'; });
            });
        });
    }
    /** Count a plain number element up from 0. */
    function countUp(el, to, opts) {
        opts = opts || {};
        var dur = opts.duration || 900;
        var from = opts.from || 0;
        var start = null;
        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / dur);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(from + (to - from) * eased);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    /* ------------------------------------------- fx: reveal on scroll */
    var revealObserver = null;
    function observeReveals(root, stagger) {
        if (!('IntersectionObserver' in global)) {
            qsa('.reveal', root).forEach(function (n) { n.classList.add('is-in'); });
            return;
        }
        if (!revealObserver) {
            revealObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (!en.isIntersecting) return;
                    var n = en.target;
                    var idx = parseInt(n.dataset.idx || '0', 10);
                    n.style.animationDelay = Math.min(idx * 55, 460) + 'ms';
                    n.classList.add('is-in');
                    revealObserver.unobserve(n);
                });
            }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
        }
        qsa('.reveal:not(.is-in)', root).forEach(function (n) { revealObserver.observe(n); });
    }

    /* --------------------------------------- fx: pointer proximity scale */
    /** Nearby elements swell toward the pointer — Rare UI proximity-sidebar idea. */
    function proximity(root, selector, maxDist, maxScale) {
        var nodes = qsa(selector, root);
        if (!nodes.length || global.matchMedia('(hover: none)').matches) return;
        var R = maxDist || 110;
        var S = maxScale || 0.14;
        var raf = null;
        var last = { x: 0, y: 0 };
        function apply() {
            raf = null;
            nodes.forEach(function (n) {
                var r = n.getBoundingClientRect();
                var cx = r.left + r.width / 2;
                var cy = r.top + r.height / 2;
                var d = Math.hypot(last.x - cx, last.y - cy);
                var k = Math.max(0, 1 - d / R);
                n.style.transform = k > 0.01 ? 'translateY(' + (-k * 4).toFixed(2) + 'px) scale(' + (1 + k * S).toFixed(3) + ')' : '';
                n.style.zIndex = k > 0.4 ? '5' : '';
            });
        }
        root.addEventListener('pointermove', function (e) {
            last.x = e.clientX;
            last.y = e.clientY;
            if (!raf) raf = requestAnimationFrame(apply);
        }, { passive: true });
        root.addEventListener('pointerleave', function () {
            nodes.forEach(function (n) { n.style.transform = ''; n.style.zIndex = ''; });
        });
    }

    /* ----------------------------------------------- fx: scroll progress */
    /** Spring-smoothed scroll progress bar (Rare UI scroll-progress). */
    function scrollProgress(scroller, barEl, labelEl, sections) {
        var target = 0;
        var current = 0;
        var running = false;
        function tick() {
            current += (target - current) * 0.18;
            if (Math.abs(target - current) < 0.0008) { current = target; running = false; }
            barEl.style.width = (current * 100).toFixed(2) + '%';
            if (labelEl && sections && sections.length) {
                var idx = Math.min(sections.length - 1, Math.floor(current * sections.length));
                var label = sections[idx];
                if (labelEl.textContent !== label) labelEl.textContent = label;
                labelEl.classList.toggle('is-on', current > 0.02 && current < 0.995);
            }
            if (running) requestAnimationFrame(tick);
        }
        function onScroll() {
            var max = scroller.scrollHeight - scroller.clientHeight;
            target = max > 4 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0;
            if (!running) { running = true; requestAnimationFrame(tick); }
        }
        scroller.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ------------------------------------------------------------- router */
    /** Hash router: #/list, #/park/<id>, #/mine, #/agent */
    var router = (function () {
        var routes = [];
        function parse() {
            var h = (location.hash || '').replace(/^#\/?/, '');
            var parts = h.split('/').filter(Boolean);
            return { name: parts[0] || 'list', param: parts[1] || '' };
        }
        function fire() {
            var r = parse();
            routes.forEach(function (fn) { fn(r); });
        }
        return {
            on: function (fn) { routes.push(fn); return fn; },
            go: function (path, replace) {
                var next = '#/' + String(path).replace(/^#?\/?/, '');
                if (location.hash === next) { fire(); return; }
                if (replace && history.replaceState) history.replaceState(null, '', next);
                else location.hash = next;
                if (replace) fire();
            },
            current: parse,
            start: function () {
                global.addEventListener('hashchange', fire);
                if (!location.hash) history.replaceState(null, '', '#/list');
                fire();
            },
        };
    })();

    /* -------------------------------------------------------- content map */
    var TAG_META = {
        // tag -> { icon, color }
        亲子: ['BearIcon', 'app-orange'], 露营: ['TentIcon', 'app-green'], 野餐: ['UmbrellaIcon', 'app-yellow'],
        跑步: ['DumbbellIcon', 'app-blue'], 骑行: ['BicycleIcon', 'app-teal'], 拍照: ['CameraIcon', 'purple'],
        樱花: ['CherryIcon', 'app-pink'], 梅花: ['FlowerIcon', 'app-pink'], 荷花: ['FlowerIcon', 'app-pink'],
        桂花: ['FlowerIcon', 'app-yellow'], 桃花: ['FlowerIcon', 'app-pink'], 郁金香: ['FlowerIcon', 'app-red'],
        秋色: ['LeafIcon', 'app-orange'], 夜景: ['MoonIcon', 'purple'], 湖景: ['SailboatIcon', 'app-blue'],
        江景: ['FishIcon', 'app-blue'], 草坪: ['LeafIcon', 'app-green'], 沙滩: ['UmbrellaIcon', 'app-yellow'],
        湿地: ['FrogIcon', 'app-teal'], 观鸟: ['BirdIcon', 'app-blue'], 溪流: ['WaterCupIcon', 'app-teal'],
        竹林: ['TreeIcon', 'app-green'], 茶园: ['LeafIcon', 'app-green'], 古迹: ['BookIcon', 'brown'],
        登高: ['MountainIcon', 'brown'], 人少: ['MoonIcon', 'purple'], 免费: ['TagIcon', 'app-green'],
        遛狗: ['DogIcon', 'warm-peach-pink'], 运动: ['BasketballIcon', 'app-blue'], 游乐设施: ['BalloonIcon', 'app-red'],
        科普: ['BookIcon', 'app-teal'], 避暑: ['SnowflakeIcon', 'app-blue'], 日落: ['SunIcon', 'app-orange'],
        喷泉: ['RainbowIcon', 'app-blue'], 文创: ['PaintbrushIcon', 'purple'], 美食: ['CoffeeIcon', 'warm-peach-pink'],
        划船: ['AnchorIcon', 'app-blue'], 晨练: ['SunIcon', 'app-yellow'], 洗肺: ['LeafIcon', 'app-green'],
        野趣: ['SnailIcon', 'app-green'], 安静: ['MoonIcon', 'purple'], 临水: ['SailboatIcon', 'app-blue'],
        慢生活: ['CoffeeCupIcon', 'warm-peach-pink'], 城市客厅: ['HomeIcon', 'app-blue'],
        世界遗产: ['TrophyIcon', 'app-yellow'], 稻田: ['LeafIcon', 'app-green'], 田园: ['AppleIcon', 'app-green'],
        大草原: ['MountainIcon', 'app-green'], 鹿: ['RabbitIcon', 'app-orange'], 研学: ['BookIcon', 'app-teal'],
        农事: ['AppleIcon', 'app-green'], 传统: ['LampIcon', 'brown'], 音乐喷泉: ['MusicIcon', 'purple'],
        商圈: ['ShoppingBagIcon', 'app-pink'], 咖啡: ['CoffeeCupIcon', 'brown'], 小吃: ['DonutIcon', 'warm-peach-pink'],
        夜市: ['MoonIcon', 'purple'], 地标: ['RocketIcon', 'app-red'], 运动场馆: ['TrophyIcon', 'app-blue'],
        灯光秀: ['BulbIcon', 'purple'], 森林: ['TreeIcon', 'app-green'], 徒步: ['CompassIcon', 'brown'],
        观景: ['EyeIcon', 'app-blue'], 古寺: ['LampIcon', 'brown'], 泉水: ['WaterCupIcon', 'app-teal'],
        茶: ['CoffeeCupIcon', 'app-green'], 溪流踩水: ['WaterCupIcon', 'app-teal'], 小麦: ['LeafIcon', 'app-yellow'],
        风筝: ['BalloonIcon', 'app-blue'], 篮球: ['BasketballIcon', 'app-orange'], 足球: ['TrophyIcon', 'app-green'],
        网球: ['TrophyIcon', 'app-yellow'], 乒乓球: ['TrophyIcon', 'app-red'], 轮滑: ['BicycleIcon', 'purple'],
        健身: ['DumbbellIcon', 'app-blue'], 球场: ['BasketballIcon', 'app-orange'], 老人友好: ['LampIcon', 'brown'],
        宠物: ['DogIcon', 'warm-peach-pink'], 口袋公园: ['FlowerIcon', 'app-pink'], 社区: ['HomeIcon', 'app-teal'],
        晨景: ['SunIcon', 'app-yellow'], 慢跑: ['DumbbellIcon', 'app-blue'], 长堤: ['SailboatIcon', 'app-blue'],
        西湖十景: ['TrophyIcon', 'app-teal'], 西湖: ['SailboatIcon', 'app-blue'], 红鱼: ['FishIcon', 'app-red'],
        柳树: ['TreeIcon', 'app-green'], 黄莺: ['BirdIcon', 'app-yellow'], 牡丹: ['FlowerIcon', 'app-pink'],
        古树: ['TreeIcon', 'brown'], 野花: ['FlowerIcon', 'purple'], 芦苇: ['LeafIcon', 'app-yellow'],
        水杉: ['TreeIcon', 'app-orange'], 油菜花: ['FlowerIcon', 'app-yellow'], 农田: ['AppleIcon', 'app-green'],
        铁路: ['TrainIcon', 'brown'], 小火车: ['TrainIcon', 'app-red'], 工业风: ['SettingsIcon', 'brown'],
        樱花跑道: ['CherryIcon', 'app-pink'], 江边跑道: ['DumbbellIcon', 'app-blue'],
    };
    function tagMeta(tag) {
        return TAG_META[tag] || ['TagIcon', 'default'];
    }

    global.PR = {
        qs: qs, qsa: qsa, frag: frag, fragAll: fragAll, esc: esc, mark: mark,
        icon: icon, iconBody: iconBody,
        store: store, sound: sound, haptic: haptic,
        notify: notify, modal: modal, drawer: drawer,
        burst: burst, burstAt: burstAt, odo: odo, runOdometers: runOdometers, countUp: countUp,
        observeReveals: observeReveals, proximity: proximity, scrollProgress: scrollProgress,
        router: router, TAG_META: TAG_META, tagMeta: tagMeta,
    };
})(window);
