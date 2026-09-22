// TopoJSON decoding + the Robinson projection.

export function decodeTopology(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;

  const arcs = topo.arcs.map((deltas) => {
    let x = 0;
    let y = 0;
    const pts = new Array(deltas.length);
    for (let i = 0; i < deltas.length; i++) {
      x += deltas[i][0];
      y += deltas[i][1];
      pts[i] = [x * sx + tx, y * sy + ty];
    }
    return pts;
  });

  const ringOf = (ring) => {
    const pts = [];
    for (const a of ring) {
      const src = a < 0 ? arcs[~a] : arcs[a];
      if (a < 0) {
        for (let i = src.length - (pts.length ? 2 : 1); i >= 0; i--) pts.push(src[i]);
      } else {
        for (let i = pts.length ? 1 : 0; i < src.length; i++) pts.push(src[i]);
      }
    }
    return pts;
  };

  return topo.objects.countries.geometries.map((g) => ({
    key: g.k,
    polygons: (g.type === 'Polygon' ? [g.arcs] : g.arcs).map((poly) => poly.map(ringOf)),
  }));
}

const RX = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962,
  0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
const RY = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571,
  0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1];

function interp(table, absLat) {
  const t = Math.min(absLat, 90) / 5;
  const i = Math.min(Math.floor(t), 17);
  return table[i] + (table[i + 1] - table[i]) * (t - i);
}

export function project(lon, lat) {
  const a = Math.abs(lat);
  const x = 0.8487 * interp(RX, a) * (lon * Math.PI) / 180;
  const y = 1.3523 * interp(RY, a) * (lat < 0 ? -1 : 1);
  return [x * 100, -y * 100];
}

export function pathFor(polygons, minAreaPx = 0.35) {
  const subpath = (ring, offset) => {
    const pts = ring.map(([lon, lat]) => project(lon + offset, lat));
    return 'M' + pts.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join('L') + 'Z';
  };

  let d = '';
  for (const poly of polygons) {
    let outer = poly[0];
    if (!outer || outer.length < 4) continue;

    const lons = outer.map((p) => p[0]);
    const wraps = Math.max(...lons) - Math.min(...lons) > 180;
    const rings = wraps
      ? poly.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]))
      : poly;
    outer = rings[0];

    const pts = outer.map(([lon, lat]) => project(lon, lat));
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    if (Math.abs(area / 2) < minAreaPx) continue;

    for (const ring of rings) {
      if (ring.length < 4) continue;
      d += subpath(ring, 0);
      if (wraps) d += subpath(ring, -360);
    }
  }
  return d;
}

export function projectBBox([w, s, e, n]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (lon, lat) => {
    const [x, y] = project(lon, lat);
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const lon = w + ((e - w) * i) / steps;
    const lat = s + ((n - s) * i) / steps;
    add(lon, s);
    add(lon, n);
    add(w, lat);
    add(e, lat);
  }
  return [x0, y0, x1, y1];
}
