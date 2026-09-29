/* Park Radar · Lumen — procedural artwork
 * Every park image is generated in the browser as SVG: a layered landscape
 * (sky, sun, clouds, hill ranges, water with shimmer, ground, trees, walkway,
 * foreground planting, birds) driven by a per-park seed and palette.
 * No image files, no network, and each park looks like itself.
 */
(function (global) {
    'use strict';

    var uidSeq = 0;
    function uid(p) { uidSeq += 1; return p + uidSeq; }

    /** Deterministic PRNG so a park always renders the same scene. */
    function rng(seed) {
        var a = (seed >>> 0) || 1;
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
    function between(r, a, b) { return a + r() * (b - a); }

    /* ------------------------------------------------------------ palettes */
    var TIMES = {
        day: { sky: ['#bfe6f5', '#e8f4e2'], sun: '#fff3c4', glow: '#ffe89a', sunY: 62, hillA: '#8fbf8a', hillB: '#6da878', hillC: '#4f8f66', water: ['#8fd0d8', '#5fb3c4'], ground: '#7cb87a', tree: ['#4f8f66', '#3f7a55', '#63a06f'], cloud: '#ffffff', star: 0 },
        morning: { sky: ['#ffd9b0', '#fdeccd'], sun: '#fff0c0', glow: '#ffcf8a', sunY: 74, hillA: '#a8c79a', hillB: '#7fae86', hillC: '#5f9270', water: ['#bcdcdf', '#8cc0c8'], ground: '#8cbe84', tree: ['#5f9270', '#4a7d5c', '#77ab79'], cloud: '#fff6e6', star: 0 },
        sunset: { sky: ['#f8a978', '#ffe0b0'], sun: '#ffd98a', glow: '#ff9f5e', sunY: 132, hillA: '#c58f74', hillB: '#9a6a5c', hillC: '#6f4a48', water: ['#f0b183', '#c47a68'], ground: '#a3775c', tree: ['#6f4a48', '#5a3c3e', '#84604f'], cloud: '#ffd9b8', star: 0 },
        night: { sky: ['#1c2f4a', '#3a4d6b'], sun: '#fdf6d8', glow: '#cfe0ff', sunY: 54, hillA: '#2c4460', hillB: '#22374f', hillC: '#1a2b3f', water: ['#2e4a68', '#1d3350'], ground: '#24405a', tree: ['#1a2b3f', '#152436', '#2a4159'], cloud: '#4f6b8c', star: 1, moon: 1 },
        mist: { sky: ['#dfe9e4', '#f2f4e8'], sun: '#ffffff', glow: '#e8f0e0', sunY: 58, hillA: '#b6cbb6', hillB: '#95b39c', hillC: '#74947e', water: ['#c4d8d4', '#a6c4c0'], ground: '#9dba95', tree: ['#74947e', '#5f8169', '#8aa98c'], cloud: '#ffffff', star: 0 },
    };

    var TYPE_STYLE = {
        滨水公园: { time: 'day', water: 1, hills: 2, trees: 5, flowers: 0.5, walk: 1, reeds: 0.7, boats: 0.6 },
        湿地公园: { time: 'mist', water: 1, hills: 1, trees: 4, flowers: 0.3, walk: 0.8, reeds: 1, boats: 0.3 },
        山地公园: { time: 'day', water: 0, hills: 4, trees: 7, flowers: 0.3, walk: 1, reeds: 0, boats: 0 },
        森林公园: { time: 'mist', water: 0, hills: 3, trees: 11, flowers: 0.2, walk: 1, reeds: 0.2, boats: 0 },
        植物园: { time: 'morning', water: 0.4, hills: 2, trees: 6, flowers: 1, walk: 1, reeds: 0.2, boats: 0 },
        主题公园: { time: 'day', water: 0.4, hills: 2, trees: 4, flowers: 0.8, walk: 1, reeds: 0.2, boats: 0.4, balloons: 1 },
        体育公园: { time: 'day', water: 0, hills: 1, trees: 4, flowers: 0.4, walk: 1, reeds: 0, boats: 0, field: 1 },
        社区公园: { time: 'morning', water: 0, hills: 1, trees: 5, flowers: 0.7, walk: 1, reeds: 0, boats: 0, houses: 1 },
        口袋公园: { time: 'morning', water: 0, hills: 0, trees: 3, flowers: 1, walk: 1, reeds: 0, boats: 0, bench: 1 },
        遗址公园: { time: 'sunset', water: 0.2, hills: 2, trees: 3, flowers: 0.5, walk: 1, reeds: 0.6, boats: 0, field: 1, ruins: 1 },
        综合公园: { time: 'day', water: 0.5, hills: 2, trees: 6, flowers: 0.6, walk: 1, reeds: 0.2, boats: 0.2 },
    };

    /* ------------------------------------------------------------ primitives */
    function smoothHills(r, yBase, amp, w, h) {
        var pts = [];
        var n = 6;
        for (var i = 0; i <= n; i++) {
            var x = (w / n) * i;
            var y = yBase + Math.sin(i * 1.4 + r() * 2) * amp - between(r, 0, amp * 0.6);
            pts.push([x, y]);
        }
        var d = 'M' + (-10) + ',' + h + ' L' + pts[0][0] + ',' + pts[0][1].toFixed(1);
        for (var j = 0; j < pts.length - 1; j++) {
            var a = pts[j], b = pts[j + 1];
            var cx = (a[0] + b[0]) / 2;
            d += ' Q' + a[0].toFixed(1) + ',' + a[1].toFixed(1) + ' ' + cx.toFixed(1) + ',' + ((a[1] + b[1]) / 2).toFixed(1);
            d += ' Q' + b[0].toFixed(1) + ',' + b[1].toFixed(1) + ' ' + b[0].toFixed(1) + ',' + b[1].toFixed(1);
        }
        d += ' L' + (w + 10) + ',' + h + ' Z';
        return d;
    }

    function conifer(x, y, h, c) {
        x = +x; y = +y; h = +h;
        var w = h * 0.46;
        var s = '';
        for (var i = 0; i < 3; i++) {
            var t = i / 3;
            var seg = h * (0.42 - t * 0.06);
            var yy = y - h * (0.32 + t * 0.26);
            var ww = w * (1 - t * 0.34);
            s += '<path d="M' + x + ',' + (yy - seg) + ' L' + (x + ww / 2) + ',' + (yy + seg * 0.5) + ' L' + (x - ww / 2) + ',' + (yy + seg * 0.5) + ' Z" fill="' + c + '"/>';
        }
        s += '<rect x="' + (x - h * 0.035).toFixed(1) + '" y="' + (y - h * 0.3).toFixed(1) + '" width="' + (h * 0.07).toFixed(1) + '" height="' + (h * 0.32).toFixed(1) + '" rx="1" fill="#8b6a4a"/>';
        return s;
    }
    function roundTree(x, y, h, c, c2) {
        x = +x; y = +y; h = +h;
        var rr = h * 0.32;
        var s = '<rect x="' + (x - h * 0.035).toFixed(1) + '" y="' + (y - h * 0.42).toFixed(1) + '" width="' + (h * 0.07).toFixed(1) + '" height="' + (h * 0.46).toFixed(1) + '" rx="1.5" fill="#8b6a4a"/>';
        s += '<circle cx="' + x + '" cy="' + (y - h * 0.62).toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + c + '"/>';
        s += '<circle cx="' + (x - rr * 0.66).toFixed(1) + '" cy="' + (y - h * 0.5).toFixed(1) + '" r="' + (rr * 0.72).toFixed(1) + '" fill="' + c2 + '"/>';
        s += '<circle cx="' + (x + rr * 0.62).toFixed(1) + '" cy="' + (y - h * 0.52).toFixed(1) + '" r="' + (rr * 0.66).toFixed(1) + '" fill="' + c + '"/>';
        return s;
    }
    function bamboo(x, y, h, c) {
        x = +x; y = +y; h = +h;
        var s = '';
        for (var i = 0; i < 3; i++) {
            var xx = x + (i - 1) * h * 0.13;
            var hh = h * (0.8 + i * 0.1);
            s += '<rect x="' + xx.toFixed(1) + '" y="' + (y - hh).toFixed(1) + '" width="' + (h * 0.055).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2" fill="' + c + '"/>';
            s += '<ellipse cx="' + (xx + h * 0.13).toFixed(1) + '" cy="' + (y - hh * 0.82).toFixed(1) + '" rx="' + (h * 0.12).toFixed(1) + '" ry="' + (h * 0.035).toFixed(1) + '" fill="' + c + '" transform="rotate(-22 ' + (xx + h * 0.13).toFixed(1) + ' ' + (y - hh * 0.82).toFixed(1) + ')"/>';
        }
        return s;
    }
    function reed(x, y, h, c) {
        x = +x; y = +y; h = +h;
        return '<path d="M' + x + ',' + y + ' C' + (x - h * 0.1) + ',' + (y - h * 0.5) + ' ' + (x + h * 0.16) + ',' + (y - h * 0.7) + ' ' + (x + h * 0.06) + ',' + (y - h) + '" stroke="' + c + '" stroke-width="' + Math.max(1, h * 0.045).toFixed(1) + '" fill="none" stroke-linecap="round"/>' +
            '<ellipse cx="' + (x + h * 0.06).toFixed(1) + '" cy="' + (y - h * 0.96).toFixed(1) + '" rx="' + (h * 0.07).toFixed(1) + '" ry="' + (h * 0.16).toFixed(1) + '" fill="' + c + '" opacity=".9"/>';
    }
    function flower(x, y, s, c) {
        x = +x; y = +y; s = +s;
        var out = '<path d="M' + x + ',' + y + ' L' + x + ',' + (y - s).toFixed(1) + '" stroke="#5f9270" stroke-width="1.2"/>';
        var petals = ['0,-1 0,0', '1,0 0,0', '0,1 0,0', '-1,0 0,0'];
        out += '<g transform="translate(' + x + ',' + (y - s).toFixed(1) + ')">';
        petals.forEach(function (_, i) {
            out += '<circle cx="0" cy="' + (-s * 0.22).toFixed(1) + '" r="' + (s * 0.2).toFixed(1) + '" fill="' + c[i % c.length] + '" transform="rotate(' + i * 90 + ')"/>';
        });
        out += '<circle r="' + (s * 0.13).toFixed(1) + '" fill="#ffdf8a"/></g>';
        return out;
    }
    function cloud(x, y, s, c, o) {
        x = +x; y = +y; s = +s;
        return '<g opacity="' + o + '" fill="' + c + '">' +
            '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (28 * s) + '" ry="' + (13 * s) + '"/>' +
            '<ellipse cx="' + (x + 24 * s) + '" cy="' + (y + 3 * s) + '" rx="' + (20 * s) + '" ry="' + (10 * s) + '"/>' +
            '<ellipse cx="' + (x - 26 * s) + '" cy="' + (y + 4 * s) + '" rx="' + (17 * s) + '" ry="' + (9 * s) + '"/></g>';
    }
    function birds(x, y, s, c) {
        x = +x; y = +y; s = +s;
        var out = '';
        for (var i = 0; i < 3; i++) {
            var xx = x + i * 16 * s, yy = y + (i % 2) * 7 * s;
            out += '<path d="M' + xx + ',' + yy + ' q' + (5 * s) + ',' + (-5 * s) + ' ' + (10 * s) + ',0 q' + (5 * s) + ',' + (-5 * s) + ' ' + (10 * s) + ',0" stroke="' + c + '" stroke-width="' + (1.6 * s).toFixed(1) + '" fill="none" stroke-linecap="round" opacity=".8"/>';
        }
        return out;
    }

    /* ---------------------------------------------------------------- scene */
    /**
     * Render a park landscape.
     * @param park  dataset record (uses seed + type)
     * @param opts  { w, h, time, detail, variant }
     */
    function scene(park, opts) {
        opts = opts || {};
        var W = opts.w || 400;
        var H = opts.h || 240;
        var r = rng((park.seed || 7) + (opts.variant || 0) * 977);
        var style = TYPE_STYLE[park.type] || TYPE_STYLE.综合公园;
        var timeKey = opts.time || style.time;
        if (opts.variant && !opts.time) {
            // gallery views cycle the hour so a park's album reads as a day out
            timeKey = ['day', 'morning', 'sunset', 'night'][opts.variant % 4];
        }
        var T = TIMES[timeKey] || TIMES.day;
        var detail = opts.detail == null ? 1 : opts.detail;

        var gSky = uid('sky'), gWater = uid('wat'), gGlow = uid('glo');
        var horizon = H * (style.water ? 0.56 : 0.62);
        var waterTop = horizon;
        var waterBot = style.water ? Math.min(H, horizon + H * 0.26) : horizon;
        var groundTop = style.water ? waterBot : horizon;

        var svg = '';
        svg += '<defs>';
        svg += '<linearGradient id="' + gSky + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + T.sky[0] + '"/><stop offset="1" stop-color="' + T.sky[1] + '"/></linearGradient>';
        svg += '<linearGradient id="' + gWater + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + T.water[0] + '"/><stop offset="1" stop-color="' + T.water[1] + '"/></linearGradient>';
        svg += '<radialGradient id="' + gGlow + '"><stop offset="0" stop-color="' + T.glow + '" stop-opacity=".85"/><stop offset="1" stop-color="' + T.glow + '" stop-opacity="0"/></radialGradient>';
        svg += '</defs>';

        svg += '<rect width="' + W + '" height="' + H + '" fill="url(#' + gSky + ')"/>';

        if (T.star) {
            for (var si = 0; si < 34; si++) {
                svg += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * horizon * 0.8).toFixed(0) + '" r="' + (r() * 1.3 + 0.4).toFixed(1) + '" fill="#fffdf3" opacity="' + (0.35 + r() * 0.6).toFixed(2) + '"/>';
            }
        }

        var sunX = between(r, W * 0.18, W * 0.82);
        var sunR = T.moon ? 15 : 20;
        svg += '<circle cx="' + sunX.toFixed(0) + '" cy="' + T.sunY + '" r="' + (sunR * 4.2).toFixed(0) + '" fill="url(#' + gGlow + ')"/>';
        svg += '<circle cx="' + sunX.toFixed(0) + '" cy="' + T.sunY + '" r="' + sunR + '" fill="' + T.sun + '"/>';
        if (T.moon) svg += '<circle cx="' + (sunX - 6).toFixed(0) + '" cy="' + (T.sunY - 4) + '" r="' + (sunR * 0.92).toFixed(0) + '" fill="' + T.sky[0] + '" opacity=".92"/>';

        if (detail) {
            var cn = 2 + Math.floor(r() * 2);
            for (var ci = 0; ci < cn; ci++) {
                svg += cloud(between(r, W * 0.1, W * 0.85), between(r, 26, horizon * 0.42), between(r, 0.6, 1.1), T.cloud, between(r, 0.5, 0.85).toFixed(2));
            }
        }

        // hill ranges — farther = paler
        var ranges = Math.min(4, style.hills || 1);
        var hillColors = [T.hillA, T.hillB, T.hillC, T.hillC];
        for (var hi = ranges - 1; hi >= 0; hi--) {
            var yb = horizon - (hi + 1) * H * 0.035 + H * 0.02;
            var amp = H * (0.035 + hi * 0.012);
            svg += '<path d="' + smoothHills(r, yb, amp, W, H) + '" fill="' + hillColors[hi] + '" opacity="' + (0.72 + hi * 0.1).toFixed(2) + '"/>';
        }

        if (style.ruins) {
            svg += '<g opacity=".55" fill="#7d6f59"><rect x="' + (W * 0.62) + '" y="' + (horizon - 34) + '" width="26" height="34"/><rect x="' + (W * 0.62 + 34) + '" y="' + (horizon - 48) + '" width="18" height="48"/><rect x="' + (W * 0.62 + 8) + '" y="' + (horizon - 52) + '" width="8" height="18"/></g>';
        }
        if (style.houses) {
            for (var hh = 0; hh < 3; hh++) {
                var hx = W * (0.1 + hh * 0.33) + between(r, -14, 14);
                var hw = between(r, 26, 40);
                svg += '<g opacity=".5"><rect x="' + hx.toFixed(0) + '" y="' + (horizon - 34) + '" width="' + hw.toFixed(0) + '" height="34" rx="3" fill="#d8c7a8"/><path d="M' + (hx - 5).toFixed(0) + ',' + (horizon - 34) + ' L' + (hx + hw / 2).toFixed(0) + ',' + (horizon - 50) + ' L' + (hx + hw + 5).toFixed(0) + ',' + (horizon - 34) + ' Z" fill="#b5715f"/></g>';
            }
        }

        if (style.water) {
            svg += '<rect x="0" y="' + waterTop.toFixed(0) + '" width="' + W + '" height="' + (waterBot - waterTop).toFixed(0) + '" fill="url(#' + gWater + ')"/>';
            // sun reflection
            svg += '<rect x="' + (sunX - 20).toFixed(0) + '" y="' + waterTop.toFixed(0) + '" width="40" height="' + (waterBot - waterTop).toFixed(0) + '" fill="' + T.glow + '" opacity=".22"/>';
            var waves = detail ? 9 : 5;
            for (var wi = 0; wi < waves; wi++) {
                var wy = waterTop + ((wi + 1) / (waves + 1)) * (waterBot - waterTop);
                var wx = between(r, 0, W * 0.5);
                var wl = between(r, 30, 110);
                svg += '<path d="M' + wx.toFixed(0) + ',' + wy.toFixed(0) + ' h' + wl.toFixed(0) + '" stroke="#fffdf3" stroke-width="1.4" stroke-linecap="round" opacity="' + between(r, 0.22, 0.5).toFixed(2) + '"/>';
            }
            if (style.boats && r() > 0.35) {
                var bx = between(r, W * 0.2, W * 0.75);
                var by = waterTop + (waterBot - waterTop) * 0.55;
                svg += '<g opacity=".9"><path d="M' + (bx - 14) + ',' + by + ' q14,9 28,0 z" fill="#8b6a4a"/><rect x="' + (bx - 1) + '" y="' + (by - 16) + '" width="2" height="16" fill="#6b5138"/><path d="M' + (bx + 1) + ',' + (by - 15) + ' L' + (bx + 13) + ',' + (by - 3) + ' L' + (bx + 1) + ',' + (by - 3) + ' Z" fill="#fffdf3"/></g>';
            }
        }

        // ground
        var gd = 'M-10,' + H + ' L-10,' + groundTop.toFixed(0) + ' Q' + (W * 0.3).toFixed(0) + ',' + (groundTop - H * 0.05).toFixed(0) + ' ' + (W * 0.55).toFixed(0) + ',' + groundTop.toFixed(0) + ' T' + (W + 10) + ',' + (groundTop - 4).toFixed(0) + ' L' + (W + 10) + ',' + H + ' Z';
        svg += '<path d="' + gd + '" fill="' + T.ground + '"/>';
        svg += '<path d="' + gd + '" fill="#000" opacity=".05"/>';

        // walkway
        if (style.walk) {
            var px = W * between(r, 0.35, 0.6);
            svg += '<path d="M' + px.toFixed(0) + ',' + (groundTop + 6).toFixed(0) + ' C' + (px - 30).toFixed(0) + ',' + (groundTop + 30).toFixed(0) + ' ' + (px + 40).toFixed(0) + ',' + (H - 40).toFixed(0) + ' ' + (px + 10).toFixed(0) + ',' + H + '" stroke="#e0d4b8" stroke-width="' + (14 + (detail ? 4 : 0)) + '" fill="none" stroke-linecap="round" opacity=".92"/>';
        }
        if (style.field) {
            svg += '<rect x="0" y="' + (groundTop + 6).toFixed(0) + '" width="' + W + '" height="' + (H - groundTop - 6).toFixed(0) + '" fill="#d9c46a" opacity=".35"/>';
        }

        // trees
        var tn = Math.max(2, Math.round((style.trees || 4) * (detail ? 1 : 0.6)));
        var placed = [];
        for (var ti = 0; ti < tn; ti++) {
            var tx = between(r, 14, W - 14);
            var ok = true;
            for (var pi = 0; pi < placed.length; pi++) if (Math.abs(placed[pi] - tx) < 24) ok = false;
            if (!ok) continue;
            placed.push(tx);
            var depth = (tx / W);
            var th = between(r, 34, 62) * (0.72 + depth * 0.5);
            var ty = groundTop + 6 + depth * (H - groundTop) * 0.72;
            var tc = pick(r, T.tree);
            var tc2 = pick(r, T.tree);
            var kind = r();
            if (park.type === '森林公园' && kind < 0.55) svg += conifer(tx.toFixed(0), ty.toFixed(0), th, tc);
            else if (park.type === '植物园' || park.type === '山地公园') svg += roundTree(tx.toFixed(0), ty.toFixed(0), th, tc, tc2);
            else if (kind < 0.3) svg += conifer(tx.toFixed(0), ty.toFixed(0), th, tc);
            else svg += roundTree(tx.toFixed(0), ty.toFixed(0), th, tc, tc2);
        }

        // foreground planting
        if (style.reeds) {
            for (var ri = 0; ri < (detail ? 9 : 5); ri++) {
                var rx = ri < 5 ? between(r, 4, W * 0.28) : between(r, W * 0.72, W - 4);
                svg += reed(rx.toFixed(0), (H - between(r, 4, 26)).toFixed(0), between(r, 24, 50).toFixed(0), T.tree[0]);
            }
        }
        if (style.flowers) {
            var fn = Math.round(6 * style.flowers * (detail ? 1.4 : 0.7));
            var flowerColors = ['#f8a6b2', '#f7cd67', '#b77dee', '#fc736d', '#fffdf3'];
            for (var fi = 0; fi < fn; fi++) {
                svg += flower(between(r, 10, W - 10).toFixed(0), between(r, H - 30, H - 6).toFixed(0), between(r, 7, 13).toFixed(1), flowerColors);
            }
        }
        if (style.balloons) {
            var bcol = ['#f8a6b2', '#889df0', '#f7cd67', '#8ac68a', '#b77dee'];
            for (var bi = 0; bi < 4; bi++) {
                var bxx = between(r, W * 0.15, W * 0.85), byy = between(r, 34, 92);
                svg += '<g opacity=".95"><ellipse cx="' + bxx.toFixed(0) + '" cy="' + byy.toFixed(0) + '" rx="9" ry="11" fill="' + bcol[bi % bcol.length] + '"/><path d="M' + bxx.toFixed(0) + ',' + (byy + 11) + ' q4,5 0,10" stroke="#8b6a4a" stroke-width="1" fill="none"/></g>';
            }
        }
        if (style.bench && detail) {
            svg += '<g transform="translate(' + (W * 0.72).toFixed(0) + ',' + (H - 30) + ')"><rect x="0" y="0" width="40" height="5" rx="2" fill="#a9773f"/><rect x="0" y="-11" width="40" height="4" rx="2" fill="#a9773f"/><rect x="3" y="5" width="4" height="10" fill="#7d6f59"/><rect x="33" y="5" width="4" height="10" fill="#7d6f59"/></g>';
        }
        if (detail) svg += birds(between(r, W * 0.12, W * 0.55).toFixed(0), between(r, 34, 70).toFixed(0), 1, timeKey === 'night' ? '#8fa8c8' : '#6b5138');

        return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + (park.name || '公园') + ' 示意图">' + svg + '</svg>';
    }

    /** A small avatar-ish circular vignette used for chat avatars. */
    function avatar(park, size) {
        var r = rng(park.seed || 3);
        var T = TIMES[(TYPE_STYLE[park.type] || TYPE_STYLE.综合公园).time] || TIMES.day;
        var g = uid('av');
        var W = 80, H = 80;
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
            '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + T.sky[0] + '"/><stop offset="1" stop-color="' + T.sky[1] + '"/></linearGradient></defs>' +
            '<rect width="' + W + '" height="' + H + '" fill="url(#' + g + ')"/>' +
            '<circle cx="' + (24 + r() * 10).toFixed(0) + '" cy="26" r="9" fill="' + T.sun + '"/>' +
            '<path d="M0,58 Q24,44 44,56 T80,52 L80,80 L0,80 Z" fill="' + T.hillB + '"/>' +
            '<path d="M0,68 Q28,58 52,68 T80,64 L80,80 L0,80 Z" fill="' + T.ground + '"/>' +
            '<circle cx="58" cy="54" r="7" fill="' + T.tree[0] + '"/>' +
            '</svg>';
    }

    /* ------------------------------------------------------------- map view */
    /**
     * Schematic city map: parks plotted by lat/lng against the user origin,
     * plus roads, a river and the radar rings. Used for both the "scan" view
     * and the per-park mini map.
     */
    function map(opts) {
        opts = opts || {};
        var parks = opts.parks || [];
        var W = opts.w || 360;
        var H = opts.h || 180;
        var focusId = opts.focus || null;
        var gid = uid('map');
        var origin = global.PR_DATA.USER_ORIGIN;

        var pts = parks.concat([origin]);
        var lats = pts.map(function (p) { return p.lat; });
        var lngs = pts.map(function (p) { return p.lng; });
        var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
        var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
        var padLat = Math.max((maxLat - minLat) * 0.22, 0.02);
        var padLng = Math.max((maxLng - minLng) * 0.22, 0.02);
        minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
        var spanLat = maxLat - minLat, spanLng = maxLng - minLng;
        // keep the aspect honest (1° lat ≈ 0.84° lng at this latitude)
        var spanLngAdj = spanLng * 0.84;
        var scale = Math.min(W / spanLngAdj, H / spanLat);
        function project(p) {
            return {
                x: W / 2 + (p.lng - (minLng + maxLng) / 2) * 0.84 * scale,
                y: H / 2 - (p.lat - (minLat + maxLat) / 2) * scale,
            };
        }

        var s = '';
        s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4e6"/><stop offset="1" stop-color="#e3ecdc"/></linearGradient></defs>';
        s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + gid + ')"/>';

        // river band
        var river = 'M-10,' + (H * 0.68).toFixed(0) + ' C' + (W * 0.25).toFixed(0) + ',' + (H * 0.5).toFixed(0) + ' ' + (W * 0.55).toFixed(0) + ',' + (H * 0.88).toFixed(0) + ' ' + (W + 10) + ',' + (H * 0.62).toFixed(0);
        s += '<path d="' + river + '" stroke="#9ecfd8" stroke-width="' + (H * 0.13).toFixed(0) + '" fill="none" opacity=".75"/>';
        s += '<path d="' + river + '" stroke="#bfe0e6" stroke-width="2" fill="none"/>';

        // road grid
        s += '<g stroke="#f6f2e6" stroke-width="4" opacity=".95">';
        for (var i = 1; i < 5; i++) s += '<line x1="0" y1="' + ((H / 5) * i).toFixed(0) + '" x2="' + W + '" y2="' + ((H / 5) * i).toFixed(0) + '"/>';
        for (var j = 1; j < 6; j++) s += '<line x1="' + ((W / 6) * j).toFixed(0) + '" y1="0" x2="' + ((W / 6) * j).toFixed(0) + '" y2="' + H + '"/>';
        s += '</g>';
        s += '<g stroke="#c9bda3" stroke-width="1">';
        for (var i2 = 1; i2 < 5; i2++) s += '<line x1="0" y1="' + ((H / 5) * i2).toFixed(0) + '" x2="' + W + '" y2="' + ((H / 5) * i2).toFixed(0) + '" stroke-dasharray="6 6"/>';
        s += '</g>';

        // the user
        var o = project(origin);
        s += '<g><circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="16" fill="#19c8b9" opacity=".16"/>';
        s += '<circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="8" fill="#19c8b9" opacity=".26"/>';
        s += '<circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="4.5" fill="#0b6f66" stroke="#fffdf3" stroke-width="2"/></g>';

        // parks
        parks.forEach(function (p, idx) {
            var q = project(p);
            var isFocus = focusId && p.id === focusId;
            if (!focusId && idx > 26) return;
            var col = p.free ? '#5aa832' : '#e0a51c';
            if (isFocus) col = '#e05a5a';
            s += '<g><circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + (isFocus ? 12 : 8) + '" fill="' + col + '" opacity=".18"/>';
            s += '<circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + (isFocus ? 6 : 4) + '" fill="' + col + '" stroke="#fffdf3" stroke-width="1.6"/>';
            if (isFocus) {
                s += '<text x="' + q.x.toFixed(1) + '" y="' + (q.y - 14).toFixed(1) + '" text-anchor="middle" font-family="Nunito, sans-serif" font-size="11" font-weight="800" fill="#794f27">' + (p.name || '').replace(/[<>&]/g, '') + '</text>';
            }
            s += '</g>';
        });

        return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' + s + '</svg>';
    }

    global.PR_ART = { scene: scene, avatar: avatar, map: map, rng: rng, TEMES: TIMES, TYPE_STYLE: TYPE_STYLE };
})(window);
