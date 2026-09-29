/* =====================================================================
   公园雷达 · 核心工具层
   store / toast / 粒子特效 / 图标 / 场景画 / 流体球(rare-ui) / 数字滚轮
   ===================================================================== */
const { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } = React;

/* ---------- 基础工具 ---------- */
const cn = (...xs) => xs.filter(Boolean).join(' ');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sysReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- 持久化 store ---------- */
const LS = {
    get(k, d) { try { const v = localStorage.getItem('park-radar:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('park-radar:' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } },
    del(k) { try { localStorage.removeItem('park-radar:' + k); } catch (e) { } },
    clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith('park-radar:')).forEach(k => localStorage.removeItem(k)); } catch (e) { } },
};

function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    return {
        get: () => state,
        set(patch) {
            /* 函数式 patch 返回「部分状态」，始终做浅合并，避免丢字段 */
            state = typeof patch === 'function' ? { ...state, ...patch(state) } : { ...state, ...patch };
            listeners.forEach(fn => fn(state));
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
}

const store = createStore({
    favs: LS.get('favs', []),            // 收藏的 park id
    likes: LS.get('likes', []),          // 点赞的 park id
    cLikes: LS.get('cLikes', []),        // 评论点赞 "parkId:idx"
    history: LS.get('history', []),      // [{id, ts}]
    settings: LS.get('settings', { notify: true, record: true, reduceMotion: false }),
});
store.subscribe(s => {
    LS.set('favs', s.favs); LS.set('likes', s.likes);
    LS.set('cLikes', s.cLikes); LS.set('history', s.history); LS.set('settings', s.settings);
});
function useStore() { return useSyncExternalStore(store.subscribe, store.get); }

const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [id, ...arr];
const isFav = id => store.get().favs.includes(id);
const isLiked = id => store.get().likes.includes(id);

function toggleFav(park, el) {
    const s = store.get();
    const on = !s.favs.includes(park.id);
    store.set({ favs: toggleIn(s.favs, park.id) });
    if (on && el) {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#f7cd67', '#e8a93d', '#ffd97a'], shape: 'star' });
        floatWord(r.left + r.width / 2, r.top, '已收藏', '#dba90e');
    }
    toast(on ? 'success' : 'info', on ? `已收藏「${park.name}」` : `已取消收藏「${park.name}」`);
    return on;
}
function toggleLike(park, el) {
    const s = store.get();
    const on = !s.likes.includes(park.id);
    store.set({ likes: toggleIn(s.likes, park.id) });
    if (on && el) {
        const r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#fc736d', '#f8a6b2', '#e05a5a'], shape: 'heart' });
        floatWord(r.left + r.width / 2, r.top, '+1', '#e05a5a');
    }
    return on;
}
function pushHistory(id) {
    const s = store.get();
    if (!s.settings.record) return;
    const h = s.history.filter(x => x.id !== id);
    h.unshift({ id, ts: Date.now() });
    store.set({ history: h.slice(0, 30) });
}
/* 公园点赞基础数（演示数据，由评论数派生，稳定不变） */
const baseLikes = p => Math.round(p.reviews * 0.42);
const likeCount = p => baseLikes(p) + (isLiked(p.id) ? 1 : 0);

/* ---------- Toast ---------- */
let toastSeq = 0;
function toast(type, text) {
    const layer = document.getElementById('toast-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const glyph = { success: '✓', info: 'i', warning: '!', error: '×' }[type] || 'i';
    el.innerHTML = `<span class="toast-icon" style="font-weight:900;font-size:13px">${glyph}</span><span></span>`;
    el.lastChild.textContent = text;
    layer.appendChild(el);
    const id = ++toastSeq;
    setTimeout(() => {
        el.classList.add('out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 400);
    }, 2200);
    return id;
}

/* ---------- 粒子爆发（rare-ui emoji-reaction 风格） ---------- */
const FX = document.getElementById('fx-layer');
function burst(x, y, opts = {}) {
    if (sysReduced() || store.get().settings.reduceMotion) return;
    const { colors = ['#fc736d', '#f8a6b2', '#f7cd67'], shape = 'heart', count = 8 } = opts;
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'particle';
        const c = colors[i % colors.length];
        const size = 7 + Math.random() * 8;
        if (shape === 'heart') {
            el.innerHTML = `<svg width="${size * 1.6}" height="${size * 1.6}" viewBox="0 0 48 48"><path d="M24 40 C 8 30 4 18 12 12 C 18 8 22 12 24 16 C 26 12 30 8 36 12 C 44 18 40 30 24 40 Z" fill="${c}"/></svg>`;
        } else {
            el.innerHTML = `<svg width="${size * 1.6}" height="${size * 1.6}" viewBox="0 0 24 24"><path d="M12 2 L14.6 8.6 L21.5 9.2 L16.2 13.8 L17.8 20.6 L12 17 L6.2 20.6 L7.8 13.8 L2.5 9.2 L9.4 8.6 Z" fill="${c}"/></svg>`;
        }
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        FX.appendChild(el);
        const ang = (-90 + (Math.random() * 100 - 50)) * Math.PI / 180;
        const dist = 55 + Math.random() * 65;
        const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
        const sway = (Math.random() * 40 - 20);
        const dur = 750 + Math.random() * 450;
        const rot = Math.random() * 280 - 140;
        el.animate([
            { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 1, offset: 0 },
            { transform: `translate(calc(-50% + ${dx * 0.55 + sway}px), calc(-50% + ${dy * 0.62}px)) scale(1.15) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.45 },
            { transform: `translate(calc(-50% + ${dx + sway * 1.6}px), calc(-50% + ${dy + 46}px)) scale(0.5) rotate(${rot}deg)`, opacity: 0, offset: 1 },
        ], { duration: dur, easing: 'cubic-bezier(0.4, 0.3, 0.5, 1)', delay: i * 22 });
        setTimeout(() => el.remove(), dur + i * 22 + 60);
    }
}
function floatWord(x, y, text, color) {
    if (sysReduced() || store.get().settings.reduceMotion) return;
    const el = document.createElement('div');
    el.className = 'float-word';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color || '#725d42';
    FX.appendChild(el);
    el.animate([
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -14px) scale(1.1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -40px) scale(1)', opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    setTimeout(() => el.remove(), 960);
}

/* ---------- 图标（naive-icons 数据渲染） ---------- */
function Icon({ name, size = 24, style, className }) {
    const inner = ICONS[name];
    if (!inner) return null;
    return (
        <span className={cn('icon', className)} style={{ width: size, height: size, ...style }}
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>` }} />
    );
}

/* ---------- 流体球（移植自 rare-ui fluid-orb · rareui.com） ---------- */
const ORB_VERT = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.0,1.0); }`;
const ORB_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution; uniform float u_time; uniform vec3 u_color;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i+vec2(0.0,0.0)), hash(i+vec2(1.0,0.0)), u.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v=0.0; float a=0.6; for(int i=0;i<3;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.22;
  vec2 drift = vec2(sin(t)+0.6*sin(t*1.7+1.3), cos(t*0.8)+0.6*cos(t*1.3+2.1));
  vec2 p = vec2(uv.x*1.8, uv.y*1.0) + drift*0.7;
  vec2 q = vec2(fbm(p+drift), fbm(p+vec2(3.2,1.5)-drift));
  float f = fbm(p + 1.2*q);
  float g = clamp(1.0-uv.y, 0.0, 1.0);
  float anchor = smoothstep(0.0, 0.3, uv.y);
  float shade = clamp(g + (f-0.5)*0.8* anchor, 0.0, 1.0);
  vec3 white = vec3(0.99,1.0,1.0);
  vec3 light = mix(white, u_color, 0.5);
  vec3 dark = u_color;
  vec3 col = white;
  col = mix(col, light, smoothstep(0.28,0.52,shade));
  col = mix(col, dark, smoothstep(0.58,0.88,shade));
  float edge = smoothstep(0.5,0.49,distance(uv, vec2(0.5)));
  gl_FragColor = vec4(col*edge, edge);
}`;
function orbCompile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
}
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function FluidOrb({ size = 56, color = '#19c8b9', className, style }) {
    const ref = useRef(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
        if (!gl) { canvas.style.display = 'none'; return; }
        const prog = gl.createProgram();
        const vs = orbCompile(gl, gl.VERTEX_SHADER, ORB_VERT);
        const fs = orbCompile(gl, gl.FRAGMENT_SHADER, ORB_FRAG);
        if (!vs || !fs) return;
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        const uRes = gl.getUniformLocation(prog, 'u_resolution');
        const uTime = gl.getUniformLocation(prog, 'u_time');
        gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), ...hexToRgb(color));
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const px = Math.round(size * dpr);
        canvas.width = px; canvas.height = px;
        gl.viewport(0, 0, px, px);
        gl.uniform2f(uRes, px, px);
        const reduce = sysReduced() || store.get().settings.reduceMotion;
        const start = performance.now();
        let raf = 0, visible = true, last = 0;
        const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
        io.observe(canvas);
        const render = (now) => {
            /* 限帧 30fps：装饰动画无需满帧，省出主线程 */
            if (visible && now - last >= 33) {
                last = now;
                gl.uniform1f(uTime, reduce ? 0.8 : (now - start) / 1000);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
            if (!reduce) raf = requestAnimationFrame(render);
        };
        render(start);
        return () => { cancelAnimationFrame(raf); io.disconnect(); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteBuffer(buf); };
    }, [size, color]);
    return (
        <span className={className} style={{ position: 'relative', display: 'inline-block', width: size, height: size, overflow: 'hidden', borderRadius: '50%', ...style }}>
            <canvas ref={ref} style={{ width: size, height: size, position: 'relative', zIndex: 1 }} />
            <span className="orb-fallback" style={{ position: 'absolute', inset: 0 }} />
        </span>
    );
}

/* ---------- 数字滚轮（rare-ui animated-counter 风格） ---------- */
function Odometer({ value, className, style, delay = 0 }) {
    const str = String(value);
    const [shown, setShown] = useState(() => str.replace(/\d/g, '0'));
    useEffect(() => {
        const t = setTimeout(() => setShown(str), 120 + delay);
        return () => clearTimeout(t);
    }, [str, delay]);
    let di = 0;
    return (
        <span className={cn('odo odo-mask', className)} style={style}>
            {shown.split('').map((ch, i) => {
                if (ch < '0' || ch > '9') return <span key={i} className="odo-static">{ch}</span>;
                const d = +ch; di++;
                return (
                    <span key={i} className="odo-digit">
                        <span className="odo-strip" style={{
                            transform: `translateY(${-d * 1.15}em)`,
                            transitionDelay: `${(di - 1) * 0.07}s`,
                        }}>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <span key={n}>{n}</span>)}
                        </span>
                    </span>
                );
            })}
        </span>
    );
}

/* ---------- 打字机（rAF + 时间推进：即使主线程繁忙也按墙钟完成） ---------- */
function useTypewriter(text, speed = 26, active = true, onDone) {
    const [n, setN] = useState(active ? 0 : text.length);
    const doneRef = useRef(onDone); doneRef.current = onDone;
    useEffect(() => {
        if (!active) { setN(text.length); return; }
        if (sysReduced() || store.get().settings.reduceMotion) { setN(text.length); doneRef.current && doneRef.current(); return; }
        setN(0);
        let raf = 0;
        const t0 = performance.now();
        const step = (now) => {
            const i = Math.min(text.length, Math.floor((now - t0) / speed));
            setN(i);
            if (i < text.length) raf = requestAnimationFrame(step);
            else doneRef.current && doneRef.current();
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [text, speed, active]);
    return { shown: text.slice(0, n), done: n >= text.length };
}

/* ---------- 程序化场景画（纯 CSS/SVG 装饰，Animal Island 风格） ---------- */
function SceneArt({ park, variant = 'card' }) {
    const s = park.scene;
    const rnd = useMemo(() => mulberry32(park.seed), [park.seed]);
    const r = useMemo(() => Array.from({ length: 26 }, () => rnd()), [rnd]);
    const night = !!s.moon;
    const hero = variant === 'hero';
    const hills = s.hills;

    const hillStyle = (c, w, h, left, bottom) => ({
        background: c, width: w, height: h, left, bottom,
        position: 'absolute', borderRadius: '50% 50% 0 0',
    });

    const els = [];
    /* 天空 */
    els.push(<div key="sky" className="sky" style={{ background: `linear-gradient(180deg, ${s.sky[0]} 0%, ${s.sky[1]} 100%)` }} />);
    /* 云 / 星 */
    if (!night) {
        els.push(<div key="c1" className="cloud" style={{ width: `${16 + r[0] * 10}%`, height: hero ? 16 : 10, top: `${8 + r[1] * 14}%`, left: `${5 + r[2] * 30}%`, animationDuration: `${30 + r[3] * 22}s`, animationDelay: `${-r[4] * 30}s`, opacity: 0.9 }} />);
        els.push(<div key="c2" className="cloud" style={{ width: `${12 + r[5] * 8}%`, height: hero ? 12 : 7, top: `${16 + r[6] * 16}%`, left: `${45 + r[7] * 30}%`, animationDuration: `${38 + r[8] * 20}s`, animationDelay: `${-r[9] * 38}s`, opacity: 0.75 }} />);
    } else {
        for (let i = 0; i < 12; i++) {
            els.push(<span key={'st' + i} className="star-dot" style={{ width: 2.4, height: 2.4, left: `${r[(i * 2) % 26] * 96}%`, top: `${r[(i * 2 + 1) % 26] * 46}%`, animationDelay: `${i * 0.31}s` }} />);
        }
        els.push(<div key="moon" className="moon" style={{ width: hero ? 44 : 28, height: hero ? 44 : 28, left: `${12 + r[10] * 20}%`, top: `${10 + r[11] * 8}%` }} />);
    }

    /* 远景山 */
    els.push(<div key="h1" className="hill" style={hillStyle(hills[0], '130%', '52%', `${-30 + r[12] * 12}%`, s.water ? '20%' : '12%')} />);
    els.push(<div key="h2" className="hill" style={hillStyle(hills[1], '110%', '40%', `${28 + r[13] * 22}%`, s.water ? '19%' : '8%')} />);

    /* 水面 */
    if (s.water) {
        els.push(<div key="w" className="water" style={{ height: '26%', background: `linear-gradient(180deg, ${s.water}, ${shade(s.water, -14)})` }} />);
    }

    const t = s.type;
    /* 类型化前景 */
    if (t === 'forest' || t === 'night') {
        const pc = night ? '#1a2340' : hills[2] || hills[1];
        [[14, 46, 0.3], [30, 62, 0], [52, 50, 0.15], [72, 66, 0.05], [88, 44, 0.35]].forEach(([left, h, dl], i) => {
            els.push(<div key={'p' + i} className="pine" style={{ left: `${left}%`, width: '13%', height: `${h * (hero ? 1.5 : 1)}%`, background: `linear-gradient(180deg, ${shade(pc, 8)}, ${pc})`, bottom: s.water ? '22%' : 0, animation: `flower-sway ${3 + dl * 4}s ease-in-out ${dl}s infinite` }} />);
        });
        if (night) {
            for (let i = 0; i < 7; i++) {
                els.push(<span key={'ff' + i} className="firefly" style={{ left: `${8 + r[(i * 3) % 26] * 84}%`, top: `${30 + r[(i * 3 + 1) % 26] * 45}%`, animationDelay: `${i * 0.45}s` }} />);
            }
        }
    }
    if (t === 'sakura' || t === 'orchard' || t === 'meadow' || t === 'playground') {
        const crownC = t === 'sakura' ? ['#f7b7cb', '#ef9ab8'] : (t === 'orchard' ? ['#8cc765', '#6fae4e'] : ['#7cc57f', '#5aa862']);
        [[10, 34], [26, 26], [64, 30], [82, 24]].forEach(([left, h], i) => {
            els.push(
                <div key={'tr' + i} className="tree" style={{ left: `${left}%`, width: '16%', height: `${h * (hero ? 1.4 : 1)}%`, bottom: s.water ? '22%' : '2%' }}>
                    <div className="trunk" style={{ width: '14%', height: '34%' }} />
                    <div className="crown" style={{ width: '100%', height: '74%', background: `radial-gradient(circle at 34% 30%, ${crownC[0]}, ${crownC[1]})` }} />
                    {t === 'orchard' && i % 2 === 0 && <span style={{ position: 'absolute', left: '24%', top: '18%', width: 5, height: 5, borderRadius: '50%', background: '#fc736d' }} />}
                    {t === 'orchard' && i % 2 === 0 && <span style={{ position: 'absolute', left: '58%', top: '34%', width: 5, height: 5, borderRadius: '50%', background: '#f7cd67' }} />}
                </div>
            );
        });
        if (t === 'sakura') {
            for (let i = 0; i < 7; i++) {
                els.push(<span key={'pe' + i} className="petal" style={{ left: `${6 + r[(i * 2 + 3) % 26] * 86}%`, top: '-6%', width: 6, height: 6, background: i % 2 ? '#ffd7e4' : '#f8a6b2', animationDuration: `${5 + r[(i * 3) % 26] * 4}s`, animationDelay: `${-r[(i * 3 + 1) % 26] * 7}s` }} />);
            }
        }
        const flowerColors = ['#f8a6b2', '#f7cd67', '#fc736d', '#b77dee', '#fff'];
        for (let i = 0; i < 9; i++) {
            els.push(<span key={'fl' + i} className="flower-dot" style={{ left: `${4 + i * 11 + (r[i % 26] * 4 - 2)}%`, bottom: `${2 + r[(i + 5) % 26] * 7}%`, width: 5.5, height: 5.5, background: flowerColors[i % flowerColors.length], animationDelay: `${i * 0.24}s`, zIndex: 3 }} />);
        }
        if (t === 'playground') {
            els.push(<div key="ferris" className="ferris" style={{ width: hero ? 92 : 56, height: hero ? 92 : 56, right: '9%', bottom: s.water ? '26%' : '8%', borderColor: 'rgba(255,250,235,0.9)' }} />);
            els.push(<span key="bl1" className="balloon-dot" style={{ position: 'absolute', left: '44%', top: '18%', width: 11, height: 14, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: '#fc736d', animation: 'empty-bob 3.4s ease-in-out infinite' }} />);
            els.push(<span key="bl2" className="balloon-dot" style={{ position: 'absolute', left: '51%', top: '26%', width: 9, height: 11, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: '#889df0', animation: 'empty-bob 4.2s ease-in-out 0.6s infinite' }} />);
        }
    }
    if (t === 'camp') {
        [[18, '#e59266', 30], [40, '#f7cd67', 22], [66, '#d1da49', 26]].forEach(([left, c, w], i) => {
            els.push(<div key={'te' + i} className="tent-shape" style={{ left: `${left}%`, width: w, height: w * 0.9, background: `linear-gradient(160deg, ${c}, ${shade(c, -18)})`, bottom: '6%', zIndex: 3 }} />);
        });
        els.push(<span key="fire" style={{ position: 'absolute', left: '54%', bottom: '6%', width: 10, height: 10, borderRadius: '50%', background: '#ff9d5c', boxShadow: '0 0 14px 5px rgba(255,157,92,0.65)', animation: 'sun-breathe 1.6s ease-in-out infinite', zIndex: 4 }} />);
        for (let i = 0; i < 5; i++) {
            els.push(<span key={'cs' + i} className="star-dot" style={{ width: 2.2, height: 2.2, left: `${10 + r[i * 4 % 26] * 80}%`, top: `${6 + r[(i * 4 + 2) % 26] * 22}%`, animationDelay: `${i * 0.5}s` }} />);
        }
    }
    if (t === 'wetland' || t === 'marsh') {
        for (let i = 0; i < 8; i++) {
            const h = 16 + r[(i * 2) % 26] * 22;
            els.push(<span key={'re' + i} className="reed" style={{ left: `${3 + i * 12.5}%`, height: `${h}%`, background: i % 3 === 0 ? '#7a9a5a' : '#93ab6e', animationDelay: `${i * 0.22}s`, zIndex: 4 }} />);
        }
        els.push(<span key="bd1" className="bird" style={{ top: '18%', animationDelay: '-2s' }} />);
        els.push(<span key="bd2" className="bird" style={{ top: '26%', animationDelay: '-6.5s', transform: 'scale(0.7)' }} />);
        if (t === 'wetland') {
            els.push(<div key="boat" className="boat" style={{ left: `${30 + r[20] * 25}%`, bottom: '9%', zIndex: 4 }}><div className="sail" /><div className="hull" /></div>);
        }
        if (t === 'marsh') {
            els.push(<span key="mist" style={{ position: 'absolute', left: 0, right: 0, bottom: '18%', height: '16%', background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))', animation: 'water-shimmer 7s ease-in-out infinite' }} />);
        }
    }
    if (t === 'lotus') {
        const padC = '#5f9e6f';
        for (let i = 0; i < 6; i++) {
            const x = 8 + i * 16 + (r[i % 26] * 6 - 3), y = 8 + r[(i + 3) % 26] * 12;
            els.push(<span key={'pad' + i} style={{ position: 'absolute', left: `${x}%`, bottom: `${y}%`, width: 15, height: 7, borderRadius: '50%', background: padC, opacity: 0.85, zIndex: 3 }} />);
            if (i % 2 === 0) els.push(<span key={'lot' + i} style={{ position: 'absolute', left: `${x + 2.5}%`, bottom: `${y + 3.5}%`, width: 8, height: 8, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: '#f8a6b2', boxShadow: '0 0 0 2px rgba(255,255,255,0.4)', animation: `flower-sway ${3 + i * 0.3}s ease-in-out infinite`, zIndex: 4 }} />);
        }
        els.push(<div key="boat" className="boat" style={{ left: `${62 + r[21] * 12}%`, bottom: '10%', zIndex: 5 }}><div className="sail" /><div className="hull" /></div>);
    }
    if (t === 'river') {
        const bC = '#8a6a58';
        [[6, 20, 34], [13, 15, 46], [20, 24, 28], [76, 18, 40], [84, 13, 30], [90, 22, 50]].forEach(([left, w, h], i) => {
            els.push(<div key={'bu' + i} className="building" style={{ left: `${left}%`, width: `${w * 0.55}%`, height: `${h * (hero ? 1.2 : 1)}%`, background: shade(bC, -6 - i * 3), bottom: s.water ? '24%' : '10%', opacity: 0.85, zIndex: 2 }} />);
        });
        els.push(<div key="boat" className="boat" style={{ left: `${34 + r[22] * 20}%`, bottom: '8%', zIndex: 4 }}><div className="sail" /><div className="hull" /></div>);
    }
    if (t === 'bamboo') {
        for (let i = 0; i < 10; i++) {
            const h = 46 + r[(i * 2 + 1) % 26] * 34;
            els.push(<span key={'bb' + i} style={{
                position: 'absolute', left: `${2 + i * 10.5}%`, bottom: 0, width: 4.5, height: `${h}%`,
                background: `linear-gradient(180deg, ${i % 2 ? '#7fae5c' : '#6a9a4c'}, ${i % 2 ? '#5c8a3e' : '#4e7a34'})`,
                borderRadius: '3px 3px 0 0', transform: `rotate(${r[i % 26] * 3 - 1.5}deg)`, transformOrigin: 'bottom', zIndex: 3,
            }} />);
            els.push(<span key={'bl' + i} style={{ position: 'absolute', left: `${2.4 + i * 10.5}%`, bottom: `${h - 6}%`, width: 13, height: 5, borderRadius: '0 80% 0 80%', background: '#8cc765', transform: `rotate(${-18 + r[(i + 7) % 26] * 30}deg)`, zIndex: 3, animation: `leaf-wiggle ${2.4 + i * 0.18}s ease-in-out infinite` }} />);
        }
    }

    /* 近景丘（有水面时压低成岸线，别挡住水） */
    els.push(<div key="h3" className="hill" style={hillStyle(hills[2] || hills[1], '150%', s.water ? '12%' : '20%', `${-24 + r[14] * 10}%`, s.water ? '-4%' : '-6%')} />);

    /* 太阳（非夜景） */
    if (!night) {
        const sz = hero ? 46 : 30;
        els.push(<div key="sun" className="sun" style={{
            width: sz, height: sz, left: `${62 + r[15] * 22}%`, top: `${9 + r[16] * 9}%`,
            background: `radial-gradient(circle, #fff8dc 18%, ${s.sun} 46%, ${hexA(s.sun, 0)} 72%)`,
            boxShadow: `0 0 ${hero ? 34 : 20}px 6px ${hexA(s.sun, 0.5)}`,
        }} />);
    }

    return <div className="scene" aria-hidden="true">{els}</div>;
}
/* 颜色工具 */
function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = clamp(((n >> 16) & 255) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
}
function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---------- 营业状态 ---------- */
function openState(park) {
    if (park.open === '全天') return { open: true, text: '全天开放' };
    const now = new Date();
    const hm = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = park.open.split(':').map(Number);
    const [ch, cm] = park.close.split(':').map(Number);
    const o = oh * 60 + om, c = ch * 60 + cm;
    if (park.close === '开放') return { open: true, text: '全天开放' };
    if (hm >= o && hm <= c) return { open: true, text: `营业中 · ${park.open}-${park.close}` };
    return { open: false, text: `已闭园 · ${park.open}-${park.close}` };
}
const crowdText = c => ['非常清净', '比较清净', '人流适中', '较为热门', '非常热门'][clamp(c, 1, 5) - 1];
