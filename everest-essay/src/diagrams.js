// Interactive SVG generators for the Everest Vertical Cross-Section, Geological Collision, and Altitude Lab.
import {
  EVEREST_SUMMIT_M,
  ELEVATION_ZONES,
  CROSS_SECTION_MARKERS,
  LANDMARK_BENCHMARKS,
  computePressureHpa,
  computeOxygenPct,
  computeBoilingPointC,
  computeMeanTempC,
  computeUvFactor,
  computeInspiredPO2MmHg,
  getZoneForAltitude,
  getPhysiologySummary,
} from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function altToY(altM, topY = 58, bottomY = 470, minAlt = 1200, maxAlt = 9200) {
  const ratio = (altM - minAlt) / (maxAlt - minAlt);
  return Math.round((bottomY - ratio * (bottomY - topY)) * 10) / 10;
}

/**
 * Builds the interactive dual-slope Mount Everest vertical elevation cross-section SVG.
 */
export function buildCrossSectionDiagram(container, onSelectZone) {
  const W = 960;
  const H = 520;
  const activeState = {
    zoneId: "zone-4",
    slopeMode: "both", // 'both' | 'south' | 'north'
  };

  // Mountain silhouette polygon (South Khumbu valley low on left -> Summit at x=540 -> North Tibetan plateau ~4200m on right)
  const y1500 = altToY(1500);
  const y3000 = altToY(3000);
  const y4000 = altToY(4000);
  const y5000 = altToY(5000);
  const y6000 = altToY(6000);
  const y8000 = altToY(8000);
  const ySummit = altToY(EVEREST_SUMMIT_M);
  const yNorthBase = altToY(4200);

  const mountainPoints = [
    [60, y1500 + 18],
    [110, altToY(2100)],
    [138, altToY(2860)], // Lukla
    [198, altToY(3440)], // Namche
    [245, altToY(3867)], // Tengboche
    [300, altToY(4410)], // Dingboche
    [378, altToY(5364)], // EBC South
    [412, altToY(5850)], // Khumbu Icefall top
    [438, altToY(6400)], // Western Cwm C2
    [474, altToY(7200)], // Lhotse Face C3
    [500, altToY(7906)], // South Col
    [522, altToY(8550)], // South Summit ridge
    [540, ySummit],      // Summit 8848.86
    [562, altToY(8610)], // Second Step
    [582, altToY(8300)], // North C3
    [618, altToY(7650)], // North ridge
    [642, altToY(7020)], // North Col
    [678, altToY(6500)], // ABC
    [716, altToY(5800)], // East Rongbuk
    [758, altToY(5200)], // North Base Camp
    [828, altToY(4550)], // Rongbuk Valley
    [900, yNorthBase],   // Tibetan Plateau ~4200m
    [900, 488],
    [60, 488],
  ];

  const polyStr = mountainPoints.map((p) => `${p[0]},${p[1]}`).join(" ");
  const ridgeLineStr = mountainPoints
    .slice(0, -2)
    .map((p) => `${p[0]},${p[1]}`)
    .join(" ");

  const bandsMarkup = ELEVATION_ZONES.map((z) => {
    const yTop = altToY(z.maxM);
    const yBot = z.index === 1 ? 488 : altToY(z.minM);
    const height = Math.max(4, yBot - yTop);
    return `
      <g class="cs-band" data-zone="${z.id}" tabindex="0" role="button" aria-label="查看${z.title}（${z.minM}至${z.maxM}米）">
        <rect x="60" y="${yTop}" width="840" height="${height}" fill="${z.bandColor}" class="cs-band-fill" />
        <line x1="60" y1="${yTop}" x2="900" y2="${yTop}" class="cs-grid-line" />
      </g>
    `;
  }).join("");

  const altTicks = [1500, 3000, 4000, 5000, 6000, 7000, 8000, 8848.86];
  const axisMarkup = altTicks
    .map((m) => {
      const y = altToY(m);
      const label = m === 8848.86 ? "8,849m" : `${m.toLocaleString("en-US")}m`;
      return `
        <g class="cs-tick">
          <line x1="50" y1="${y}" x2="60" y2="${y}" stroke="currentColor" stroke-opacity="0.45" />
          <text x="45" y="${y + 3.5}" text-anchor="end" class="cs-axis-text">${label}</text>
        </g>
      `;
    })
    .join("");

  const southSnowY = altToY(5650);
  const northSnowY = altToY(6050);
  const treeLineY = altToY(4000);

  function renderMarkers(list, sideClass) {
    return list
      .map((m) => {
        const y = altToY(m.alt);
        const zone = getZoneForAltitude(m.alt);
        const anchor = m.side === "south" ? "end" : "start";
        const dx = m.side === "south" ? -9 : 9;
        const dy = m.name === "第二台阶" ? -1.5 : m.name === "突击营地 C3" ? 6.5 : 3.5;
        return `
          <g class="cs-marker ${sideClass}" data-zone="${zone.id}" data-detail="${m.detail}">
            <circle cx="${m.x}" cy="${y}" r="4.2" class="cs-dot" />
            <text x="${m.x + dx}" y="${y + dy}" text-anchor="${anchor}" class="cs-marker-label">${m.name}</text>
          </g>
        `;
      })
      .join("");
  }

  const summit = CROSS_SECTION_MARKERS.summit;

  container.innerHTML = `
    <div class="cs-toolbar">
      <div class="cs-slope-tabs" role="tablist" aria-label="坡向视图切换">
        <button type="button" class="cs-tab is-active" data-slope="both" role="tab" aria-selected="true">南北坡全景对比</button>
        <button type="button" class="cs-tab" data-slope="south" role="tab" aria-selected="false">聚焦南坡（尼泊尔 · 湿润季风）</button>
        <button type="button" class="cs-tab" data-slope="north" role="tab" aria-selected="false">聚焦北坡（中国西藏 · 高原雨影）</button>
      </div>
      <div class="cs-legend-inline">
        <span><i class="swatch swatch-tree"></i>南坡林线 ~4,000 m</span>
        <span><i class="swatch swatch-snow"></i>南北雪线（南 ~5,650 m / 北 ~6,050 m）</span>
      </div>
    </div>

    <div class="cs-canvas-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="cs-svg" role="img" aria-label="珠穆朗玛峰南北坡垂直海拔带交互剖面图">
        <defs>
          <clipPath id="everest-silhouette-clip">
            <polygon points="${polyStr}" />
          </clipPath>
          <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0D192B" stop-opacity="0.92" />
            <stop offset="22%" stop-color="#1E3C62" stop-opacity="0.58" />
            <stop offset="58%" stop-color="#7EA6C4" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#F5F2EB" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="banner-cloud-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.88" />
            <stop offset="55%" stop-color="#E7F0F7" stop-opacity="0.42" />
            <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Atmospheric backdrop -->
        <rect x="60" y="24" width="840" height="464" fill="url(#sky-grad)" rx="4" />

        <!-- Subtle jet-stream banner cloud off summit -->
        <path d="M540,${ySummit} C595,${ySummit - 12} 660,${ySummit - 20} 755,${ySummit - 8} C680,${ySummit + 4} 615,${ySummit + 8} 540,${ySummit + 4} Z" fill="url(#banner-cloud-grad)" />

        <!-- Elevation bands clipped inside mountain silhouette -->
        <g clip-path="url(#everest-silhouette-clip)">
          ${bandsMarkup}
          <!-- Subtle ridge facet shading for sculptural depth -->
          <polygon points="540,${ySummit} 500,${altToY(7906)} 565,488 900,488 900,${yNorthBase} 758,${altToY(5200)} 642,${altToY(7020)}" fill="#0A1422" fill-opacity="0.18" />
          <!-- Plateau floor line on North side -->
          <rect x="60" y="${y8000}" width="840" height="${y8000 - ySummit + 4}" fill="none" />
        </g>

        <!-- Clickable band hit areas + right-side Roman numeral tags -->
        <g class="cs-band-labels">
          ${ELEVATION_ZONES.map((z) => {
            const yMid = altToY((z.minM + z.maxM) / 2);
            return `
              <g class="cs-zone-pill" data-zone="${z.id}">
                <rect x="906" y="${yMid - 10}" width="44" height="20" rx="10" class="cs-pill-bg" />
                <text x="928" y="${yMid + 4}" text-anchor="middle" class="cs-pill-txt">${z.numeral}</text>
              </g>
            `;
          }).join("")}
        </g>

        <!-- Mountain crest outline -->
        <polyline points="${ridgeLineStr}" fill="none" stroke="#182026" stroke-width="2" stroke-linejoin="round" />

        <!-- Ecological boundary lines -->
        <line x1="60" y1="${treeLineY}" x2="290" y2="${treeLineY}" stroke="#2B6A4E" stroke-width="1.4" stroke-dasharray="5 4" class="cs-eco-line south-only" />
        <text x="72" y="${treeLineY - 6}" class="cs-eco-text south-only" fill="#1F523B">林线 Timberline ~4,000 m</text>

        <line x1="365" y1="${southSnowY}" x2="465" y2="${southSnowY}" stroke="#1B6B8A" stroke-width="1.5" stroke-dasharray="4 3" class="cs-eco-line south-only" />
        <text x="365" y="${southSnowY - 6}" class="cs-eco-text south-only" fill="#134E66">南坡雪线 ~5,650 m</text>

        <line x1="670" y1="${northSnowY}" x2="886" y2="${northSnowY}" stroke="#1B6B8A" stroke-width="1.5" stroke-dasharray="4 3" class="cs-eco-line north-only" />
        <text x="886" y="${northSnowY - 6}" text-anchor="end" class="cs-eco-text north-only" fill="#134E66">北坡雪线 ~6,050 m（干旱抬升）</text>

        <!-- Death zone boundary 8,000m -->
        <line x1="60" y1="${y8000}" x2="900" y2="${y8000}" stroke="#E08B5A" stroke-width="1.2" stroke-dasharray="3 4" stroke-opacity="0.85" />
        <text x="888" y="${y8000 - 6}" text-anchor="end" class="cs-death-text">8,000 m 死亡地带界线</text>

        <!-- Slope direction headers -->
        <text x="74" y="46" class="cs-slope-header south-only">◀ 南坡 · 尼泊尔昆布河谷（湿润季风迎风坡）</text>
        <text x="886" y="46" text-anchor="end" class="cs-slope-header north-only">北坡 · 中国西藏绒布河谷（青藏高原背风坡）▶</text>

        <!-- Plateau note on north base -->
        <text x="888" y="${yNorthBase + 18}" text-anchor="end" class="cs-plateau-note north-only">青藏高原基面 ~4,200 m（缺失低海拔森林带）</text>

        <!-- Markers -->
        ${renderMarkers(CROSS_SECTION_MARKERS.south, "south-only")}
        ${renderMarkers(CROSS_SECTION_MARKERS.north, "north-only")}

        <!-- Summit Marker -->
        <g class="cs-marker cs-summit-marker" data-zone="zone-6" data-detail="${summit.detail}">
          <circle cx="${summit.x}" cy="${ySummit}" r="5.5" fill="#D97B4A" stroke="#FFFFFF" stroke-width="2" />
          <text x="${summit.x}" y="${ySummit - 14}" text-anchor="middle" class="cs-summit-label">▲ 珠穆朗玛峰 8,848.86 m</text>
        </g>

        <!-- Left altitude axis -->
        <g class="cs-axis">${axisMarkup}</g>
        <line x1="60" y1="24" x2="60" y2="488" stroke="currentColor" stroke-opacity="0.3" />
      </svg>
    </div>

    <div class="cs-inspector" id="cs-inspector" aria-live="polite"></div>
  `;

  const inspectorEl = container.querySelector("#cs-inspector");
  const svgEl = container.querySelector(".cs-svg");

  function renderInspector(zoneId) {
    const z = ELEVATION_ZONES.find((item) => item.id === zoneId) || ELEVATION_ZONES[0];
    const pMid = computePressureHpa(z.midM);
    const o2Mid = computeOxygenPct(z.midM);
    const boilMid = computeBoilingPointC(z.midM);

    svgEl.querySelectorAll(".cs-band, .cs-zone-pill").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.zone === z.id);
    });

    const slopeHtml =
      activeState.slopeMode === "south"
        ? `<p class="cs-slope-copy"><strong>南坡特征：</strong>${z.southNote}</p>`
        : activeState.slopeMode === "north"
          ? `<p class="cs-slope-copy"><strong>北坡特征：</strong>${z.northNote}</p>`
          : `<div class="cs-slope-grid">
               <p class="cs-slope-copy"><strong>南坡（尼泊尔）：</strong>${z.southNote}</p>
               <p class="cs-slope-copy"><strong>北坡（西藏）：</strong>${z.northNote}</p>
             </div>`;

    inspectorEl.innerHTML = `
      <div class="cs-ins-head">
        <div>
          <span class="cs-ins-kicker">第 ${z.numeral} 带 · ${z.minM.toLocaleString("en-US")} – ${z.maxM === 8848.86 ? "8,848.86" : z.maxM.toLocaleString("en-US")} m</span>
          <h4 class="cs-ins-title">${z.title} <small>${z.enTitle}</small></h4>
        </div>
        <a href="#${z.id}" class="cs-jump-btn">跳转本带正文 ↓</a>
      </div>
      <div class="cs-ins-metrics">
        <div><span>典型气压</span><strong>${pMid} hPa</strong></div>
        <div><span>相对含氧</span><strong>${o2Mid}%</strong></div>
        <div><span>水沸点</span><strong>${boilMid}°C</strong></div>
        <div><span>夏季参考温</span><strong>${z.tempSummer}</strong></div>
      </div>
      ${slopeHtml}
      <div class="cs-ins-tags">
        <span><strong>代表植物：</strong>${z.flora.join(" · ")}</span>
        <span><strong>代表动物：</strong>${z.fauna.join(" · ")}</span>
      </div>
    `;
  }

  function applySlopeMode(mode) {
    activeState.slopeMode = mode;
    svgEl.dataset.slope = mode;
    container.querySelectorAll(".cs-tab").forEach((btn) => {
      const isAct = btn.dataset.slope === mode;
      btn.classList.toggle("is-active", isAct);
      btn.setAttribute("aria-selected", String(isAct));
    });
    renderInspector(activeState.zoneId);
  }

  container.querySelectorAll(".cs-band, .cs-zone-pill, .cs-marker").forEach((el) => {
    const activate = () => {
      const zid = el.dataset.zone;
      if (!zid) return;
      activeState.zoneId = zid;
      renderInspector(zid);
      if (typeof onSelectZone === "function") onSelectZone(zid);
    };
    el.addEventListener("click", activate);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  container.querySelectorAll(".cs-tab").forEach((btn) => {
    btn.addEventListener("click", () => applySlopeMode(btn.dataset.slope));
  });

  applySlopeMode("both");
}

/**
 * Builds the editorial tectonic collision SVG (Indian Plate vs Eurasian Plate).
 */
export function buildTectonicDiagram(container) {
  container.innerHTML = `
    <svg viewBox="0 0 820 265" class="geo-svg" role="img" aria-label="印度板块与欧亚板块碰撞抬升珠穆朗玛峰地质剖面图">
      <defs>
        <linearGradient id="mantle-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D4C7B4" />
          <stop offset="100%" stop-color="#B9A58C" />
        </linearGradient>
        <linearGradient id="crust-india" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#8B6B54" />
          <stop offset="100%" stop-color="#6F513D" />
        </linearGradient>
        <linearGradient id="crust-eurasia" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#5B6E7D" />
          <stop offset="100%" stop-color="#405363" />
        </linearGradient>
      </defs>

      <!-- Background paper sky -->
      <rect x="0" y="0" width="820" height="265" fill="transparent" />

      <!-- Sea-level reference dashed line -->
      <line x1="24" y1="158" x2="796" y2="158" stroke="#1B6B8A" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.55" />
      <text x="32" y="150" class="geo-small" fill="#1B6B8A">海平面 0 m</text>

      <!-- Asthenosphere / Mantle -->
      <rect x="24" y="205" width="772" height="44" fill="url(#mantle-grad)" rx="3" />
      <text x="410" y="232" text-anchor="middle" class="geo-small" fill="#524436">岩石圈地幔 · 板块持续以约 4–5 cm/年 向北推挤</text>

      <!-- Indian Plate subducting -->
      <path d="M24,158 L355,158 L515,212 L515,232 L345,198 L24,198 Z" fill="url(#crust-india)" />
      <!-- Subduction motion arrows -->
      <path d="M110,178 L215,178 M208,173 L217,178 L208,183" stroke="#F5F2EB" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M378,176 L458,203 M450,205 L460,204 L453,196" stroke="#F5F2EB" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <text x="165" y="193" text-anchor="middle" class="geo-light">印度板块（北移俯冲）</text>

      <!-- Eurasian Plate & Tibetan Plateau uplifted -->
      <path d="M355,158 L415,108 L458,52 L492,98 L545,112 L796,112 L796,205 L515,205 L355,158 Z" fill="url(#crust-eurasia)" />

      <!-- Highlighted Qomolangma Limestone Cap (Ordovician seabed) -->
      <polygon points="444,72 458,52 473,73 458,76" fill="#E8DFC8" stroke="#182026" stroke-width="1.2" />
      <!-- Yellow Band marble layer -->
      <polygon points="436,84 444,72 473,73 480,85" fill="#C9A25B" fill-opacity="0.92" />

      <!-- Uplift arrows & callouts -->
      <line x1="458" y1="45" x2="458" y2="25" stroke="#B84A2E" stroke-width="1.8" />
      <path d="M453,31 L458,23 L463,31" fill="none" stroke="#B84A2E" stroke-width="1.8" />
      <text x="472" y="34" class="geo-bold" fill="#B84A2E">仍在隆升（~4 mm/年）</text>

      <!-- Callout: Ordovician limestone -->
      <line x1="468" y1="62" x2="545" y2="48" stroke="#182026" stroke-width="1" />
      <text x="551" y="46" class="geo-bold" fill="#182026">顶峰“珠穆朗玛灰岩”</text>
      <text x="551" y="62" class="geo-small" fill="#52606B">4.5 亿年前奥陶纪古特提斯海海底沉积（含海百合化石）</text>

      <!-- Callout: Yellow Band -->
      <line x1="477" y1="80" x2="545" y2="82" stroke="#9C6B32" stroke-width="1" />
      <text x="551" y="86" class="geo-small" fill="#8A5B22">“黄带（Yellow Band）”大理岩变质岩层（~8,200–8,600 m）</text>

      <!-- Labels for Tibetan Plateau & Thrust Fault -->
      <text x="680" y="142" text-anchor="middle" class="geo-light">青藏高原地壳（增厚至 ~70 km）</text>
      <text x="680" y="160" text-anchor="middle" class="geo-light-sub">欧亚板块强烈挤压抬升</text>
      <text x="355" y="128" text-anchor="end" class="geo-small" fill="#182026">喜马拉雅主逆冲断层</text>
      <line x1="362" y1="126" x2="395" y2="146" stroke="#182026" stroke-width="1" />
    </svg>
  `;
}

/**
 * Builds the Interactive High-Altitude Physics & Physiology Lab.
 */
export function buildAltitudeLab(container) {
  const W = 720;
  const H = 250;
  const padL = 56;
  const padR = 26;
  const padT = 24;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const altToX = (m) => padL + (m / EVEREST_SUMMIT_M) * plotW;
  const pctToY = (pct) => padT + (1 - pct / 100) * plotH;

  // Generate smooth atmospheric O2% decay curve
  const pts = [];
  for (let m = 0; m <= 8850; m += 150) {
    const clamped = Math.min(EVEREST_SUMMIT_M, m);
    pts.push(`${altToX(clamped).toFixed(1)},${pctToY(computeOxygenPct(clamped)).toFixed(1)}`);
  }
  const curvePath = `M ${pts.join(" L ")}`;
  const areaPath = `${curvePath} L ${altToX(EVEREST_SUMMIT_M).toFixed(1)},${(padT + plotH).toFixed(1)} L ${padL},${(padT + plotH).toFixed(1)} Z`;

  const xDeath = altToX(8000);

  container.innerHTML = `
    <div class="lab-header">
      <div>
        <span class="lab-kicker">INTERACTIVE ALTITUDE LAB · 高海拔物理与人体生理模拟器</span>
        <h3>拖动海拔标尺：感受稀薄空气的指数级衰减</h3>
      </div>
      <div class="lab-presets" role="group" aria-label="典型地标海拔预设">
        ${LANDMARK_BENCHMARKS.map(
          (b) =>
            `<button type="button" class="lab-preset-btn" data-alt="${b.altitudeM}">${b.name}<span>${Math.round(b.altitudeM)}m</span></button>`
        ).join("")}
      </div>
    </div>

    <div class="lab-slider-row">
      <label for="altitude-slider" class="lab-slider-label">
        当前模拟海拔：<strong id="lab-alt-readout">5,364 m</strong>
        <span id="lab-zone-badge" class="lab-zone-badge">第 IV 带 · 流石滩、冰川舌与大本营带</span>
      </label>
      <input type="range" id="altitude-slider" class="lab-range" min="0" max="8849" step="10" value="5364" aria-label="选择模拟海拔高度（米）" />
    </div>

    <div class="lab-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="lab-svg" role="img" aria-label="海拔与有效含氧百分比衰减曲线">
        <defs>
          <linearGradient id="o2-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1B6B8A" stop-opacity="0.34" />
            <stop offset="100%" stop-color="#1B6B8A" stop-opacity="0.03" />
          </linearGradient>
        </defs>

        <!-- Death zone highlight -->
        <rect x="${xDeath}" y="${padT}" width="${padL + plotW - xDeath}" height="${plotH}" fill="#B84A2E" fill-opacity="0.13" />
        <text x="${padL + plotW - 6}" y="${padT + 14}" text-anchor="end" class="lab-axis-txt" fill="#B84A2E">死亡地带 &gt;8,000m</text>

        <!-- Horizontal grid lines -->
        ${[100, 75, 50, 33]
          .map((pct) => {
            const y = pctToY(pct);
            return `
              <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="currentColor" stroke-opacity="0.14" stroke-dasharray="3 3" />
              <text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" class="lab-axis-txt">${pct}%</text>
            `;
          })
          .join("")}

        <!-- Vertical ticks -->
        ${[0, 2000, 4000, 6000, 8000, 8848.86]
          .map((m) => {
            const x = altToX(m);
            const lbl = m === 8848.86 ? "8,849m" : `${m}m`;
            return `
              <line x1="${x}" y1="${padT + plotH}" x2="${x}" y2="${padT + plotH + 5}" stroke="currentColor" stroke-opacity="0.35" />
              <text x="${x}" y="${padT + plotH + 19}" text-anchor="middle" class="lab-axis-txt">${lbl}</text>
            `;
          })
          .join("")}

        <path d="${areaPath}" fill="url(#o2-area)" />
        <path d="${curvePath}" fill="none" stroke="#1B6B8A" stroke-width="2.6" stroke-linecap="round" />

        <!-- Benchmark dots -->
        ${LANDMARK_BENCHMARKS.map((b) => {
          const cx = altToX(b.altitudeM);
          const cy = pctToY(computeOxygenPct(b.altitudeM));
          return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="#182026" fill-opacity="0.45" />`;
        }).join("")}

        <!-- Live interactive cursor -->
        <line id="lab-cursor-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#B84A2E" stroke-width="1.6" stroke-dasharray="4 3" />
        <circle id="lab-cursor-dot" cx="0" cy="0" r="6" fill="#B84A2E" stroke="#F5F2EB" stroke-width="2.2" />
      </svg>
    </div>

    <div class="lab-readout-grid">
      <div class="lab-metric-card">
        <span class="lab-m-label">大气压强</span>
        <strong id="lab-pressure" class="lab-m-val">--</strong>
        <small>标准海平面 1013.25 hPa</small>
      </div>
      <div class="lab-metric-card">
        <span class="lab-m-label">有效含氧比例</span>
        <strong id="lab-o2" class="lab-m-val">--</strong>
        <small id="lab-pio2">吸入氧分压 PiO₂ -- mmHg</small>
      </div>
      <div class="lab-metric-card">
        <span class="lab-m-label">纯水沸点</span>
        <strong id="lab-boil" class="lab-m-val">--</strong>
        <small>高海拔米饭难以煮熟的物理原因</small>
      </div>
      <div class="lab-metric-card">
        <span class="lab-m-label">参考年均气温 / 紫外线</span>
        <strong id="lab-temp" class="lab-m-val">--</strong>
        <small id="lab-uv">紫外线强度约海平面 --×</small>
      </div>
    </div>

    <div class="lab-phys-box" id="lab-phys-box"></div>
  `;

  const slider = container.querySelector("#altitude-slider");
  const readoutEl = container.querySelector("#lab-alt-readout");
  const zoneBadgeEl = container.querySelector("#lab-zone-badge");
  const cursorLine = container.querySelector("#lab-cursor-line");
  const cursorDot = container.querySelector("#lab-cursor-dot");
  const pressureEl = container.querySelector("#lab-pressure");
  const o2El = container.querySelector("#lab-o2");
  const pio2El = container.querySelector("#lab-pio2");
  const boilEl = container.querySelector("#lab-boil");
  const tempEl = container.querySelector("#lab-temp");
  const uvEl = container.querySelector("#lab-uv");
  const physBox = container.querySelector("#lab-phys-box");

  function updateLab(rawAlt) {
    const alt = rawAlt >= 8845 ? EVEREST_SUMMIT_M : Math.max(0, Math.min(EVEREST_SUMMIT_M, Number(rawAlt)));
    const p = computePressureHpa(alt);
    const o2 = computeOxygenPct(alt);
    const pio2 = computeInspiredPO2MmHg(alt);
    const boil = computeBoilingPointC(alt);
    const temp = computeMeanTempC(alt);
    const uv = computeUvFactor(alt);
    const zone = getZoneForAltitude(alt);
    const phys = getPhysiologySummary(alt);

    const cx = altToX(alt);
    const cy = pctToY(o2);
    cursorLine.setAttribute("x1", cx.toFixed(1));
    cursorLine.setAttribute("x2", cx.toFixed(1));
    cursorDot.setAttribute("cx", cx.toFixed(1));
    cursorDot.setAttribute("cy", cy.toFixed(1));

    readoutEl.textContent = alt === EVEREST_SUMMIT_M ? "8,848.86 m" : `${Math.round(alt).toLocaleString("en-US")} m`;
    zoneBadgeEl.textContent = alt < 1500 ? "低于珠峰南坡基带（海平面至河谷）" : `第 ${zone.numeral} 带 · ${zone.title}`;

    pressureEl.textContent = `${p.toFixed(1)} hPa`;
    o2El.textContent = `${o2.toFixed(1)}%`;
    pio2El.textContent = `吸入氧分压 PiO₂ ${pio2.toFixed(1)} mmHg（海平面 ~149）`;
    boilEl.textContent = `${boil.toFixed(1)}°C`;
    tempEl.textContent = `${temp > 0 ? "+" : ""}${temp.toFixed(1)}°C`;
    uvEl.textContent = `紫外线辐射约为海平面的 ${uv.toFixed(2)}×`;

    physBox.innerHTML = `
      <span class="lab-phys-tag phys-${phys.code.toLowerCase()}">${phys.level}</span>
      <p>${phys.desc}</p>
    `;

    container.querySelectorAll(".lab-preset-btn").forEach((btn) => {
      const bAlt = Number(btn.dataset.alt);
      btn.classList.toggle("is-active", Math.abs(bAlt - alt) < 25);
    });
  }

  slider.addEventListener("input", () => updateLab(Number(slider.value)));

  container.querySelectorAll(".lab-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.dataset.alt);
      slider.value = String(Math.round(target));
      updateLab(target);
    });
  });

  updateLab(5364);
}
