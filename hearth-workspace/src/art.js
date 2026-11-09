/* ==========================================================================
   Hearth — procedural artwork (SVG, zero external resources)
   ========================================================================== */

const ART = (() => {
  const CLOUD = "M6 84C-6 84-6 62 10 58 12 30 34 10 62 10c20 0 38 12 46 30 10-6 22-8 34-6 24 4 40 22 38 44 14 2 22 12 20 22H6Z";

  function cloud(x, y, s, op = 0.92) {
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})" opacity="${op}"><path d="${CLOUD}" fill="#ffffff"/></g>`;
  }

  /* ---------------- landscape banner ----------------
     Normalised coordinates so the same composition reads correctly at any
     banner aspect ratio (5:1 hero, 2.7:1 insight strip). */
  function landscape(opts = {}) {
    const w = opts.w ?? 1200;
    const h = opts.h ?? 420;

    const X = (f) => (f * w).toFixed(1);
    const Y = (f) => (f * h).toFixed(1);
    const poly = (pts) => "M" + pts.map((p) => `${X(p[0])} ${Y(p[1])}`).join(" L ");

    const far = [
      [0, 0.68], [0.1, 0.42], [0.172, 0.58], [0.275, 0.3], [0.36, 0.57], [0.433, 0.45],
      [0.533, 0.65], [0.633, 0.46], [0.733, 0.63], [0.842, 0.35], [0.95, 0.58], [1, 0.47],
    ];
    const mid = [
      [0, 0.79], [0.127, 0.56], [0.218, 0.72], [0.35, 0.49], [0.452, 0.7], [0.568, 0.55],
      [0.685, 0.735], [0.802, 0.54], [0.91, 0.71], [1, 0.6],
    ];

    const farPath = `${poly(far)} L${X(1)} ${Y(1)} L${X(0)} ${Y(1)} Z`;
    const midPath = `${poly(mid)} L${X(1)} ${Y(1)} L${X(0)} ${Y(1)} Z`;

    const snow = (i, scale = 1) => {
      const p = far[i];
      const q = far[i + 1];
      const px = p[0] * w;
      const py = p[1] * h;
      const qx = q[0] * w;
      const qy = q[1] * h;
      const s = (h / 420) * 1.1 * scale;
      const cx = px + (qx - px) * 0.45;
      const cy = py + (qy - py) * 0.45;
      return `<path d="M${(px - 26 * s).toFixed(1)} ${(py + 16 * s).toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)} L${(px + 26 * s).toFixed(1)} ${(py + 16 * s).toFixed(1)} L${cx.toFixed(1)} ${cy.toFixed(1)} Z" fill="#f3f8fc"/>`;
    };

    const cs = h / 420;

    return `
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="h-sky" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="#6fbde9"/><stop offset="0.42" stop-color="#b2dbf3"/><stop offset="1" stop-color="#eef5ea"/>
    </linearGradient>
    <radialGradient id="h-sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff8dc" stop-opacity="0.95"/><stop offset="1" stop-color="#fff8dc" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="h-far" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9d2e6"/><stop offset="1" stop-color="#7ba0bd"/>
    </linearGradient>
    <linearGradient id="h-mid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5d8da8"/><stop offset="1" stop-color="#25546c"/>
    </linearGradient>
    <linearGradient id="h-hill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9e063"/><stop offset="1" stop-color="#5f9c27"/>
    </linearGradient>
    <linearGradient id="h-front" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#86bb3f"/><stop offset="1" stop-color="#437c1c"/>
    </linearGradient>
    <linearGradient id="h-haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="h-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f7f9f8" stop-opacity="0.94"/><stop offset="0.3" stop-color="#f7f9f8" stop-opacity="0.78"/>
      <stop offset="0.55" stop-color="#f7f9f8" stop-opacity="0.2"/><stop offset="1" stop-color="#f7f9f8" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#h-sky)"/>
  <circle cx="${(0.83 * w).toFixed(1)}" cy="${(0.14 * h).toFixed(1)}" r="${(0.34 * h).toFixed(1)}" fill="url(#h-sun)"/>

  ${cloud(0.045 * w, 0.06 * h, 0.62 * cs, 0.95)}
  ${cloud(0.235 * w, 0.19 * h, 0.42 * cs, 0.8)}
  ${cloud(0.49 * w, 0.04 * h, 0.55 * cs, 0.9)}
  ${cloud(0.72 * w, 0.25 * h, 0.36 * cs, 0.68)}
  ${cloud(0.34 * w, 0.36 * h, 0.26 * cs, 0.5)}
  ${cloud(0.88 * w, 0.1 * h, 0.46 * cs, 0.86)}

  <path d="${farPath}" fill="url(#h-far)"/>
  ${snow(2)}
  ${snow(3, 0.9)}
  ${snow(9)}
  ${snow(1, 0.8)}

  <path d="${midPath}" fill="url(#h-mid)"/>
  <rect y="${Y(0.48)}" width="${w}" height="${Y(0.26)}" fill="url(#h-haze)" opacity="0.28"/>

  <path d="M${X(0)} ${Y(0.88)} C${X(0.1)} ${Y(0.81)} ${X(0.18)} ${Y(0.86)} ${X(0.275)} ${Y(0.82)} C${X(0.37)} ${Y(0.775)} ${X(0.43)} ${Y(0.85)} ${X(0.533)} ${Y(0.81)} C${X(0.633)} ${Y(0.765)} ${X(0.717)} ${Y(0.845)} ${X(0.825)} ${Y(0.79)} C${X(0.9)} ${Y(0.757)} ${X(0.958)} ${Y(0.8)} ${X(1)} ${Y(0.78)} L${X(1)} ${Y(1)} L${X(0)} ${Y(1)} Z" fill="url(#h-hill)"/>
  <path d="M${X(0)} ${Y(0.958)} C${X(0.133)} ${Y(0.893)} ${X(0.25)} ${Y(0.945)} ${X(0.39)} ${Y(0.907)} C${X(0.533)} ${Y(0.87)} ${X(0.667)} ${Y(0.935)} ${X(0.8)} ${Y(0.9)} C${X(0.9)} ${Y(0.87)} ${X(0.958)} ${Y(0.913)} ${X(1)} ${Y(0.887)} L${X(1)} ${Y(1)} L${X(0)} ${Y(1)} Z" fill="url(#h-front)"/>

  <rect width="${w}" height="${h}" fill="url(#h-fade)"/>
</svg>`;
  }

  /* Stand-alone figure layer: rendered outside the stretched backdrop so the
     silhouette never distorts, whatever the banner aspect ratio is. */
  function personFigure(kind = "sit") {
    const box = kind === "stand" ? "972 224 72 112" : "938 238 118 172";
    const body = kind === "stand" ? FIG_STAND : FIG_SIT;
    return `<svg viewBox="${box}" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  const FIG_SIT = `
  <g fill="#141d25" opacity=".9">
    <circle cx="1002" cy="258" r="15"/>
    <path d="M996 278c-11 4-17 14-18 27l-2 24c-1 8 5 13 12 13h34c8 0 13-5 12-13l-3-24c-2-13-9-23-20-27Z"/>
    <path d="M980 342h44c7 0 11 5 10 11l-4 22c-1 5-5 8-10 8h-16l1-20h-12l-1 20h-8c-5 0-9-3-10-8l-4-22c-1-6 3-11 10-11Z"/>
  </g>
  <path d="M944 396c0-11 9-20 20-20h50c11 0 20 9 20 20v8h-90Z" fill="#2f3d49" opacity=".85"/>`;

  const FIG_STAND = `
  <g fill="#141d25" opacity=".9">
    <circle cx="1008" cy="244" r="14.5"/>
    <path d="M994 262c-8 3-12 12-13 24l-2 30c0 3 2 5 5 5s5-2 5-5l2-20 1 26c0 3 2 5 5 5s5-2 5-5l2-24h5l2 24c0 3 2 5 5 5s5-2 5-5l1-26 2 20c0 3 2 5 5 5s5-2 5-5l-2-30c-1-12-5-21-13-24Z"/>
  </g>`;

  /* ---------------- grayscale vision-board illustrations ---------------- */
  const ART_CAREER = `
<svg viewBox="0 0 180 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path d="M8 96h164v-8h-30V70h-32V46H78V24H44v72H8Z" fill="#c6c6cc"/>
  <path d="M44 24h34v22H44zM78 46h32v24H78zM110 70h32v18h-32z" fill="#a5a5ad"/>
  <path d="M8 96h164v-8H8Z" fill="#8f8f98" opacity=".5"/>
  <circle cx="60" cy="30" r="4.4" fill="#4d4d55"/>
  <path d="M56.6 36h6.8l2.4 16h-11.6Z" fill="#4d4d55"/>
  <path d="M58 40l-8 9 2.6 2.6L60 44Z" fill="#4d4d55"/>
  <path d="M57.6 52l-2 12 3 .6 2.6-12Z" fill="#4d4d55"/>
  <path d="M62 52l4 12 3-1-4-12Z" fill="#4d4d55"/>
</svg>`;

  const ART_BOOK = `
<svg viewBox="0 0 180 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path d="M90 26c-11-8-27-11-46-11v58c19 0 35 3 46 11 11-8 27-11 46-11V15c-19 0-35 3-46 11Z" fill="#cfcfd5"/>
  <path d="M90 26v58" stroke="#9c9ca4" stroke-width="2.4"/>
  <path d="M18 22c16-2 30 1 40 8-10 7-24 10-40 8Z" fill="#b1b1b9"/>
  <path d="M162 22c-16-2-30 1-40 8 10 7 24 10 40 8Z" fill="#b1b1b9"/>
  <path d="M30 40c12-1 22 1 30 6M30 52c12-1 22 1 30 6M150 40c-12-1-22 1-30 6M150 52c-12-1-22 1-30 6" stroke="#a5a5ad" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 84h156" stroke="#c9c9cf" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

  const ART_MONEY = `
<svg viewBox="0 0 180 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path d="M74 78h32l-6 22H80Z" fill="#b0b0b8"/>
  <path d="M70 74h40v8H70Z" fill="#94949d"/>
  <path d="M90 74V44" stroke="#8e8e96" stroke-width="4" stroke-linecap="round"/>
  <g fill="#c3c3c9">
    <circle cx="62" cy="46" r="15"/><circle cx="90" cy="30" r="17"/><circle cx="118" cy="46" r="15"/>
    <circle cx="74" cy="52" r="14"/><circle cx="106" cy="52" r="14"/>
  </g>
  <g fill="#8f8f98" opacity=".55">
    <circle cx="58" cy="42" r="9"/><circle cx="86" cy="26" r="10"/>
  </g>
  <g fill="#a5a5ad">
    <circle cx="42" cy="22" r="8"/><circle cx="132" cy="18" r="7"/><circle cx="148" cy="38" r="6"/>
  </g>
  <g stroke="#7c7c85" stroke-width="1.6" fill="none" opacity=".8">
    <path d="M40 18v8M38 20h4v4h-4zM131 15v6M129.6 16.5h2.8v3h-2.8z"/>
  </g>
</svg>`;

  /* ---------------- charts ---------------- */
  function curvePoints(values, w, h, pad) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    return values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2.4);
      return [x, y];
    });
  }

  function smoothPath(pts) {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [cx, cy] = pts[i];
      const mx = (px + cx) / 2;
      d += ` C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${cy.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
    }
    return d;
  }

  /* Smooth area chart with the signature "curtain" of vertical hairlines. */
  function sparkline(values, opts = {}) {
    const w = opts.width ?? 320;
    const h = opts.height ?? 84;
    const pad = 6;
    const pts = curvePoints(values, w, h, pad);
    const d = smoothPath(pts);
    const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
    const marker = opts.marker ?? Math.floor(values.length * 0.62);
    const mx = pts[marker][0];
    const my = pts[marker][1];

    const steps = 44;
    let curtain = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (pts.length - 1);
      const i0 = Math.min(pts.length - 1, Math.floor(t));
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const f = t - i0;
      const x = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f;
      const y = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f;
      const op = 0.1 + 0.24 * (1 - Math.abs(i / steps - 0.5) * 2);
      curtain += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${h}" stroke="#8b7bf0" stroke-width="1" opacity="${op.toFixed(3)}"/>`;
    }

    return `
<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="sp-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8b7bf0" stop-opacity=".14"/><stop offset="1" stop-color="#8b7bf0" stop-opacity="0"/>
  </linearGradient></defs>
  ${curtain}
  <path d="${area}" fill="url(#sp-g)"/>
  <path d="${d}" fill="none" stroke="#6f6af2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="${mx}" y1="${my}" x2="${mx}" y2="${h}" stroke="#3c3a55" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
  <circle cx="${mx}" cy="${my}" r="3.6" fill="#3c3a55"/>
</svg>`;
  }

  /* Dense thin-bar histogram with a highlighted middle cluster. */
  function barChart(values, opts = {}) {
    const w = opts.width ?? 320;
    const h = opts.height ?? 84;
    const gap = 1.6;
    const bw = (w - gap * (values.length - 1)) / values.length;
    const max = Math.max(...values);
    const hot = values.map((v) => v / max > 0.62);
    return `
<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  ${values
    .map((v, i) => {
      const bh = Math.max(3, (v / max) * (h - 6));
      const x = i * (bw + gap);
      return `<rect x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${hot[i] ? "#3d3a55" : "#8b8fa8"}" opacity="${hot[i] ? ".92" : ".45"}"/>`;
    })
    .join("")}
</svg>`;
  }

  function storageDonut(used, total) {
    const r = 46;
    const c = 2 * Math.PI * r;
    const pct = Math.min(1, used / total);
    return `
<svg viewBox="0 0 120 120" width="112" height="112" aria-hidden="true">
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e9e9ef" stroke-width="12"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="#7c5cf0" stroke-width="12" stroke-linecap="round"
    stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
  <text x="60" y="56" text-anchor="middle" font-family="ui-monospace, monospace" font-size="16" font-weight="700" fill="currentColor">${used}</text>
  <text x="60" y="72" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#8b8b96">of ${total} GB</text>
</svg>`;
  }

  return { landscape, personFigure, cloud, ART_CAREER, ART_BOOK, ART_MONEY, sparkline, barChart, storageDonut };
})();
