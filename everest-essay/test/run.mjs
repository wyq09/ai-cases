import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVEREST_SUMMIT_M,
  SEA_LEVEL_PRESSURE_HPA,
  ELEVATION_ZONES,
  LANDMARK_BENCHMARKS,
  CROSS_SECTION_MARKERS,
  computePressureHpa,
  computeOxygenPct,
  computeInspiredPO2MmHg,
  computeBoilingPointC,
  computeMeanTempC,
  computeUvFactor,
  getZoneForAltitude,
  getPhysiologySummary,
} from "../src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS: ${name}`);
}

console.log("Running everest-essay logic & bundle integrity tests...");

test("sea-level atmospheric baselines are exact", () => {
  assert.equal(computePressureHpa(0), SEA_LEVEL_PRESSURE_HPA);
  assert.equal(computeOxygenPct(0), 100);
  assert.equal(computeBoilingPointC(0), 100);
  assert.ok(computeInspiredPO2MmHg(0) >= 148 && computeInspiredPO2MmHg(0) <= 150);
  assert.equal(computeUvFactor(0), 1);
});

test("summit (8,848.86 m) matches realistic subtropical Himalayan telemetry", () => {
  const p = computePressureHpa(EVEREST_SUMMIT_M);
  const o2 = computeOxygenPct(EVEREST_SUMMIT_M);
  const boil = computeBoilingPointC(EVEREST_SUMMIT_M);
  const temp = computeMeanTempC(EVEREST_SUMMIT_M);
  assert.ok(p >= 332 && p <= 342, `expected summit pressure ~337 hPa, got ${p}`);
  assert.ok(o2 >= 32.5 && o2 <= 34.5, `expected summit O2 ~33.3%, got ${o2}`);
  assert.ok(boil >= 70.5 && boil <= 72.5, `expected summit boiling point ~71.6 C, got ${boil}`);
  assert.ok(temp <= -25, `expected freezing summit mean temp, got ${temp}`);
});

test("Everest Base Camp (5,364 m) is near half sea-level pressure", () => {
  const o2 = computeOxygenPct(5364);
  const boil = computeBoilingPointC(5364);
  assert.ok(o2 >= 50 && o2 <= 56, `EBC O2% should be ~52-53%, got ${o2}`);
  assert.ok(boil >= 81.5 && boil <= 84.5, `EBC boiling point should be ~82.5C, got ${boil}`);
});

test("pressure, O2%, boiling point, and temperature decrease monotonically with altitude", () => {
  let prevP = Infinity;
  let prevO2 = Infinity;
  let prevBoil = Infinity;
  let prevTemp = Infinity;
  let prevUv = 0;

  for (let alt = 0; alt <= 8850; alt += 250) {
    const h = Math.min(EVEREST_SUMMIT_M, alt);
    const p = computePressureHpa(h);
    const o2 = computeOxygenPct(h);
    const b = computeBoilingPointC(h);
    const t = computeMeanTempC(h);
    const uv = computeUvFactor(h);

    assert.ok(p < prevP, `pressure not strictly decreasing at ${h}m`);
    assert.ok(o2 < prevO2, `O2% not strictly decreasing at ${h}m`);
    assert.ok(b < prevBoil, `boiling point not strictly decreasing at ${h}m`);
    assert.ok(t < prevTemp, `temp not strictly decreasing at ${h}m`);
    assert.ok(uv > prevUv, `UV factor not strictly increasing at ${h}m`);

    prevP = p;
    prevO2 = o2;
    prevBoil = b;
    prevTemp = t;
    prevUv = uv;
  }
});

test("all 6 elevation zones cover 1,500 m to 8,848.86 m contiguously without gaps", () => {
  assert.equal(ELEVATION_ZONES.length, 6);
  assert.equal(ELEVATION_ZONES[0].minM, 1500);
  assert.equal(ELEVATION_ZONES[5].maxM, EVEREST_SUMMIT_M);
  for (let i = 0; i < ELEVATION_ZONES.length - 1; i++) {
    assert.equal(
      ELEVATION_ZONES[i].maxM,
      ELEVATION_ZONES[i + 1].minM,
      `gap between zone ${i + 1} and ${i + 2}`
    );
  }
  for (const z of ELEVATION_ZONES) {
    assert.ok(z.title && z.enTitle && z.southNote && z.northNote);
    assert.ok(z.flora.length >= 1 && z.fauna.length >= 1 && z.landmarks.length >= 2);
  }
});

test("getZoneForAltitude maps boundary altitudes accurately", () => {
  assert.equal(getZoneForAltitude(1000).id, "zone-1");
  assert.equal(getZoneForAltitude(1500).id, "zone-1");
  assert.equal(getZoneForAltitude(2999).id, "zone-1");
  assert.equal(getZoneForAltitude(3000).id, "zone-2");
  assert.equal(getZoneForAltitude(4000).id, "zone-3");
  assert.equal(getZoneForAltitude(5364).id, "zone-4");
  assert.equal(getZoneForAltitude(6400).id, "zone-5");
  assert.equal(getZoneForAltitude(8000).id, "zone-6");
  assert.equal(getZoneForAltitude(8848.86).id, "zone-6");
});

test("getPhysiologySummary returns expected clinical bands", () => {
  assert.equal(getPhysiologySummary(0).code, "NORMAL");
  assert.equal(getPhysiologySummary(2500).code, "MILD");
  assert.equal(getPhysiologySummary(3800).code, "MODERATE");
  assert.equal(getPhysiologySummary(5364).code, "SEVERE");
  assert.equal(getPhysiologySummary(7000).code, "EXTREME");
  assert.equal(getPhysiologySummary(8400).code, "DEATH_ZONE");
});

test("cross-section markers and landmark benchmarks are well-formed", () => {
  assert.ok(CROSS_SECTION_MARKERS.south.length >= 6);
  assert.ok(CROSS_SECTION_MARKERS.north.length >= 4);
  assert.equal(CROSS_SECTION_MARKERS.summit.alt, EVEREST_SUMMIT_M);
  assert.ok(LANDMARK_BENCHMARKS.length >= 6);
});

test("bundled single-file index.html exists, embeds 7 WebP plates, and has zero external HTTP(S) resources", () => {
  const htmlPath = path.join(ROOT, "index.html");
  assert.ok(fs.existsSync(htmlPath), "index.html must exist");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.ok(!html.includes("/* __INLINE_CSS__ */"), "CSS placeholder not replaced");
  assert.ok(!html.includes("/* __INLINE_JS__ */"), "JS placeholder not replaced");
  assert.ok(!/__IMG_[A-Z0-9_]+__/.test(html), "Unreplaced image placeholder remains");

  const webpMatches = html.match(/data:image\/webp;base64,/g) || [];
  assert.equal(webpMatches.length, 7, `expected 7 embedded WebP plates, found ${webpMatches.length}`);

  const externalRes = html.match(/<(?:script|link|img)\b[^>]+(?:src|href)\s*=\s*["']https?:\/\//gi);
  assert.equal(externalRes, null, "found external HTTP(S) resource reference");
});

console.log(`All ${passed} tests passed.`);
