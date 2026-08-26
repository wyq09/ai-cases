// Decode world-atlas TopoJSON -> equirectangular land bitmap rows ("#"/".")
const fs = require('fs');
const topo = JSON.parse(fs.readFileSync(__dirname + '/land-110m.json', 'utf8'));

const { scale, translate } = topo.transform;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function ringCoords(arcIdxs) {
  const pts = [];
  for (const i of arcIdxs) {
    const a = i >= 0 ? arcs[i] : [...arcs[~i]].reverse();
    if (pts.length) pts.pop();
    pts.push(...a);
  }
  return pts;
}

const rings = [];
for (const geom of topo.objects.land.geometries) {
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
  for (const poly of polys) {
    // outer ring only (+ holes as separate rings for PIP with parity)
    for (const r of poly) rings.push(ringCoords(r));
  }
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// grid: lon -180..179 step 2 (180 cols), lat 84..-84 step 2 (85 rows)
const COLS = 180, STEP = 2;
const rows = [];
for (let lat = 84; lat >= -84; lat -= STEP) {
  let row = '';
  for (let c = 0; c < COLS; c++) {
    const lon = -180 + c * STEP + STEP / 2;
    // parity across all rings (outer rings + holes)
    let parity = 0;
    for (const r of rings) if (inRing(lon, lat, r)) parity ^= 1;
    row += parity ? '#' : '.';
  }
  rows.push(row);
}
fs.writeFileSync(__dirname + '/land-mask.txt', rows.join('\n'));
fs.writeFileSync(__dirname + '/land-mask.js', 'window.LAND_MASK="' + rows.join(' ') + '";\n');
console.log('rows=' + rows.length + ' cols=' + COLS);
