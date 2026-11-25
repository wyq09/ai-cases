// Main editorial runtime: live scroll altimeter, stratospheric theme shift, TOC drawer, and plate lightbox.
import {
  EVEREST_SUMMIT_M,
  ELEVATION_ZONES,
  computePressureHpa,
  computeOxygenPct,
  computeBoilingPointC,
  getZoneForAltitude,
} from "./data.js";
import {
  buildCrossSectionDiagram,
  buildTectonicDiagram,
  buildAltitudeLab,
} from "./diagrams.js";

function initEssay() {
  // 1. Mount interactive SVG diagrams
  const crossSecEl = document.getElementById("cross-section-root");
  if (crossSecEl) {
    buildCrossSectionDiagram(crossSecEl);
  }
  const geoEl = document.getElementById("tectonic-diagram-root");
  if (geoEl) {
    buildTectonicDiagram(geoEl);
  }
  const labEl = document.getElementById("altitude-lab-root");
  if (labEl) {
    buildAltitudeLab(labEl);
  }

  // 2. Scroll-driven live altimeter telemetry & active chapter highlight
  const sections = Array.from(document.querySelectorAll("[data-altitude]"));
  const navLinks = Array.from(document.querySelectorAll(".rail-nav a, .toc-drawer-list a"));
  const altReadoutNodes = Array.from(document.querySelectorAll("[data-live-alt]"));
  const o2ReadoutNodes = Array.from(document.querySelectorAll("[data-live-o2]"));
  const hpaReadoutNodes = Array.from(document.querySelectorAll("[data-live-hpa]"));
  const boilReadoutNodes = Array.from(document.querySelectorAll("[data-live-boil]"));
  const zoneLabelNodes = Array.from(document.querySelectorAll("[data-live-zone]"));
  const progressBar = document.getElementById("reading-progress-fill");
  const railIndicator = document.getElementById("rail-alt-fill");
  const altimeterRail = document.querySelector(".altimeter-rail");
  const deathSection = document.getElementById("zone-6");

  function interpolateAltitude() {
    const viewportMid = window.scrollY + window.innerHeight * 0.38;
    if (!sections.length) return 1500;

    // Gather sorted anchor points
    const anchors = sections.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        id: el.id,
        y: rect.top + window.scrollY,
        alt: Number(el.dataset.altitude) || 1500,
      };
    });

    if (viewportMid <= anchors[0].y) {
      return anchors[0].alt;
    }
    const last = anchors[anchors.length - 1];
    if (viewportMid >= last.y) {
      return last.alt;
    }

    for (let i = 0; i < anchors.length - 1; i++) {
      const cur = anchors[i];
      const next = anchors[i + 1];
      if (viewportMid >= cur.y && viewportMid <= next.y) {
        const span = Math.max(1, next.y - cur.y);
        const t = (viewportMid - cur.y) / span;
        return cur.alt + (next.alt - cur.alt) * t;
      }
    }
    return anchors[0].alt;
  }

  function updateScrollTelemetry() {
    const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollPct = Math.max(0, Math.min(1, window.scrollY / docH));
    if (progressBar) {
      progressBar.style.transform = `scaleX(${scrollPct.toFixed(4)})`;
    }

    const liveAlt = Math.max(1500, Math.min(EVEREST_SUMMIT_M, interpolateAltitude()));
    const altPct = Math.max(0, Math.min(1, (liveAlt - 1500) / (EVEREST_SUMMIT_M - 1500)));
    if (railIndicator) {
      railIndicator.style.height = `${(altPct * 100).toFixed(1)}%`;
    }

    const formattedAlt =
      liveAlt >= 8835 ? "8,848.86 m" : `${Math.round(liveAlt).toLocaleString("en-US")} m`;
    const o2 = computeOxygenPct(liveAlt);
    const hpa = computePressureHpa(liveAlt);
    const boil = computeBoilingPointC(liveAlt);
    const zone = getZoneForAltitude(liveAlt);

    altReadoutNodes.forEach((n) => (n.textContent = formattedAlt));
    o2ReadoutNodes.forEach((n) => (n.textContent = `${o2.toFixed(0)}%`));
    hpaReadoutNodes.forEach((n) => (n.textContent = `${Math.round(hpa)} hPa`));
    boilReadoutNodes.forEach((n) => (n.textContent = `${boil.toFixed(1)}°C`));
    zoneLabelNodes.forEach((n) => (n.textContent = `第 ${zone.numeral} 带 · ${zone.title}`));

    // Determine active section ID for nav highlight
    let activeId = sections[0] ? sections[0].id : "";
    const threshold = window.scrollY + window.innerHeight * 0.35;
    for (const sec of sections) {
      const top = sec.getBoundingClientRect().top + window.scrollY;
      if (top <= threshold) {
        activeId = sec.id;
      }
    }

    navLinks.forEach((a) => {
      const hrefId = (a.getAttribute("href") || "").replace(/^#/, "");
      a.classList.toggle("is-active", hrefId === activeId);
    });

    // Reveal desktop altimeter rail only after scrolling past the hero cover
    if (altimeterRail) {
      altimeterRail.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.42);
    }

    // Atmospheric dark-sky tint when reading Death Zone (zone-6)
    if (deathSection) {
      const r = deathSection.getBoundingClientRect();
      const inDeathZone = r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.25;
      document.body.classList.toggle("in-death-zone", inDeathZone);
    }
  }

  let rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updateScrollTelemetry();
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  updateScrollTelemetry();

  // 3. Mobile / Compact Table of Contents Drawer
  const tocBtn = document.getElementById("toc-toggle-btn");
  const tocDrawer = document.getElementById("toc-drawer");
  const tocClose = document.getElementById("toc-close-btn");

  function setDrawerOpen(open) {
    if (!tocDrawer || !tocBtn) return;
    tocDrawer.classList.toggle("is-open", open);
    tocDrawer.setAttribute("aria-hidden", String(!open));
    tocBtn.setAttribute("aria-expanded", String(open));
  }

  if (tocBtn && tocDrawer) {
    tocBtn.addEventListener("click", () => setDrawerOpen(!tocDrawer.classList.contains("is-open")));
    if (tocClose) tocClose.addEventListener("click", () => setDrawerOpen(false));
    tocDrawer.addEventListener("click", (e) => {
      if (e.target === tocDrawer || e.target.closest("a")) {
        setDrawerOpen(false);
      }
    });
  }

  // 4. Editorial Plate Lightbox (click any illustration to inspect full-bleed)
  const lightbox = document.getElementById("plate-lightbox");
  const lbImg = document.getElementById("lightbox-img");
  const lbCaption = document.getElementById("lightbox-caption");
  const lbCounter = document.getElementById("lightbox-counter");
  const lbClose = document.getElementById("lightbox-close");
  const lbPrev = document.getElementById("lightbox-prev");
  const lbNext = document.getElementById("lightbox-next");
  const plateTriggers = Array.from(document.querySelectorAll("[data-plate-index]"));
  let currentPlateIdx = -1;

  function openLightbox(idx) {
    if (!lightbox || !plateTriggers.length) return;
    currentPlateIdx = ((idx % plateTriggers.length) + plateTriggers.length) % plateTriggers.length;
    const fig = plateTriggers[currentPlateIdx];
    const img = fig.querySelector("img");
    const cap = fig.querySelector("figcaption");
    if (!img) return;
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCaption.textContent = cap ? cap.textContent.trim() : img.alt;
    lbCounter.textContent = `图版 ${currentPlateIdx + 1} / ${plateTriggers.length}`;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    currentPlateIdx = -1;
  }

  plateTriggers.forEach((fig, idx) => {
    fig.addEventListener("click", () => openLightbox(idx));
    fig.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(idx);
      }
    });
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbPrev) lbPrev.addEventListener("click", () => openLightbox(currentPlateIdx - 1));
  if (lbNext) lbNext.addEventListener("click", () => openLightbox(currentPlateIdx + 1));
  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightbox && lightbox.classList.contains("is-open")) closeLightbox();
      if (tocDrawer && tocDrawer.classList.contains("is-open")) setDrawerOpen(false);
    } else if (lightbox && lightbox.classList.contains("is-open")) {
      if (e.key === "ArrowLeft") openLightbox(currentPlateIdx - 1);
      if (e.key === "ArrowRight") openLightbox(currentPlateIdx + 1);
    }
  });

  // 5. Gentle scroll-reveal for plates and essay blocks (respects reduced motion)
  const prefersReduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealEls = Array.from(document.querySelectorAll(".reveal-on-scroll"));
  if (!prefersReduced && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: "140px 0px 140px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEssay);
} else {
  initEssay();
}
