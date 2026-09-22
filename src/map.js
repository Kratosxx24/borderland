// The map: one SVG built once, then animated by moving its viewBox.

const { decodeTopology, pathFor, projectBBox } = await import(
  './geo.js' + new URL(import.meta.url).search
);

const SVG = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const CALLOUTS = [
  { ux: 1, uy: 0, a: 'start' },
  { ux: -1, uy: 0, a: 'end' },
  { ux: 0.72, uy: -0.72, a: 'start' },
  { ux: -0.72, uy: -0.72, a: 'end' },
  { ux: 0.72, uy: 0.72, a: 'start' },
  { ux: -0.72, uy: 0.72, a: 'end' },
  { ux: 0, uy: -1, a: 'middle' },
  { ux: 0, uy: 1, a: 'middle' },
];

export class WorldMap {
  constructor(container, topo) {
    this.container = container;
    this.paths = new Map();

    this.svg = el('svg', { class: 'map', preserveAspectRatio: 'xMidYMid meet' });
    this.landLayer = el('g', { class: 'layer-land' });
    this.labelLayer = el('g', { class: 'layer-labels' });
    this.svg.append(this.landLayer, this.labelLayer);
    container.append(this.svg);

    for (const feature of decodeTopology(topo)) {
      const d = pathFor(feature.polygons);
      if (!d) continue;
      const node = el('path', { d, class: 'country' });
      if (feature.key) {
        node.dataset.name = feature.key;
        node.append(el('title'));
        if (!this.paths.has(feature.key)) this.paths.set(feature.key, []);
        this.paths.get(feature.key).push(node);
      } else {
        node.classList.add('is-territory');
      }
      this.landLayer.append(node);
    }

    this.view = [-160, -105, 320, 210];
    this.target = this.view.slice();
    this.labels = [];
    this.measuredSize = 0;
    this.frame = null;
    this.labelMemory = new Map();
    this.homeBBox = null;
    this.home = null;
    this.moved = false;
    this.onViewChange = null;
    this.minWidth = 4;
    this.maxWidth = 620;

    this.applyView();
    this.bindGestures();

    document.fonts?.ready.then(() => {
      this.measuredSize = 0;
      this.scaleLabels();
    });

    this.ro = new ResizeObserver(() => {
      if (!this.homeBBox) return this.applyView();
      this.home = this.computeTarget(this.homeBBox);
      if (this.moved) this.reaspect();
      else this.setView(this.home.slice());
    });
    this.ro.observe(container);
  }

  paint(states) {
    for (const [name, nodes] of this.paths) {
      const state = states.get(name);
      for (const node of nodes) {
        const title = node.querySelector('title');
        node.setAttribute('class', 'country' + (state ? ' is-' + state : ''));
        title.textContent = state ? name : '';
      }
    }
  }

  setBlind(on) {
    this.svg.classList.toggle('is-blind', on);
  }

  setLabels(entries) {
    this.labelLayer.replaceChildren();
    this.labels = entries.map((entry) => {
      const remembered = this.labelMemory.get(entry.name);
      const [x, y] = entry.p;
      const node = el('g', {
        class: 'label is-' + entry.kind + (remembered?.visible ? '' : ' is-hidden'),
        transform: `translate(${x} ${y})`,
      });
      const leader = el('line', { class: 'label-leader', x1: 0, y1: 0, x2: 0, y2: 0 });
      const dot = el('circle', { class: 'label-anchor', r: 0 });
      const body = el('g', { class: 'label-body' });
      const halo = el('text', { class: 'label-halo' });
      const face = el('text', { class: 'label-face' });
      halo.textContent = entry.name;
      face.textContent = entry.name;
      body.append(halo, face);
      node.append(leader, dot, body);
      this.labelLayer.append(node);
      return {
        node, leader, dot, body, face, halo,
        name: entry.name, x, y,
        r: entry.r, w: entry.w,
        widthPx: 0,
        visible: remembered?.visible ?? false,
        choiceKey: remembered?.choiceKey ?? null,
      };
    });
    this.measuredSize = 0;
    this.scaleLabels();
  }

  computeTarget(bbox, padding = 0.5, minSpan = 26) {
    const [x0, y0, x1, y1] = projectBBox(bbox);
    let w = Math.max(x1 - x0, minSpan) * (1 + padding);
    let h = Math.max(y1 - y0, minSpan * 0.62) * (1 + padding);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const box = this.container.getBoundingClientRect();
    const aspect = box.width / Math.max(box.height, 1) || 1.4;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  focus(bbox, { padding = 0.5, minSpan = 26, instant = false } = {}) {
    this.homeBBox = bbox;
    this.home = this.computeTarget(bbox, padding, minSpan);
    this.minWidth = Math.max(this.home[2] / 10, 3);
    this.maxWidth = Math.min(Math.max(this.home[2] * 3, 90), 620);
    this.moved = false;
    this.onViewChange?.(false);
    this.target = this.home.slice();
    if (instant) {
      this.view = this.target.slice();
      this.applyView();
    } else {
      this.animate();
    }
  }

  resetView() {
    if (!this.home) return;
    this.moved = false;
    this.onViewChange?.(false);
    this.target = this.home.slice();
    this.animate();
  }

  setView(next) {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.view = this.clampView(next);
    this.target = this.view.slice();
    this.applyView();
  }

  clampView([x, y, w, h]) {
    const width = Math.min(Math.max(w, this.minWidth), this.maxWidth);
    const height = h * (width / w);
    const cx = Math.min(Math.max(x + w / 2, -300), 300);
    const cy = Math.min(Math.max(y + h / 2, -170), 170);
    return [cx - width / 2, cy - height / 2, width, height];
  }

  reaspect() {
    const box = this.container.getBoundingClientRect();
    const aspect = box.width / Math.max(box.height, 1) || 1.4;
    const [x, y, w, h] = this.view;
    const nh = w / aspect;
    this.setView([x, y + (h - nh) / 2, w, nh]);
  }

  zoomAt(factor, clientX, clientY) {
    const box = this.container.getBoundingClientRect();
    const [x, y, w, h] = this.view;
    const px = (clientX - box.left) / Math.max(box.width, 1);
    const py = (clientY - box.top) / Math.max(box.height, 1);
    const nw = Math.min(Math.max(w * factor, this.minWidth), this.maxWidth);
    const nh = h * (nw / w);
    this.setView([x + (w - nw) * px, y + (h - nh) * py, nw, nh]);
    this.markMoved();
  }

  panBy(dxPx, dyPx) {
    const box = this.container.getBoundingClientRect();
    const unitsPerPx = this.view[2] / Math.max(box.width, 1);
    const [x, y, w, h] = this.view;
    this.setView([x - dxPx * unitsPerPx, y - dyPx * unitsPerPx, w, h]);
    this.markMoved();
  }

  markMoved() {
    if (this.moved) return;
    this.moved = true;
    this.onViewChange?.(true);
  }

  bindGestures() {
    const svg = this.svg;

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });

    const points = new Map();
    let prev = null;
    const gesture = () => {
      const list = [...points.values()];
      if (!list.length) return null;
      const cx = list.reduce((sum, p) => sum + p.x, 0) / list.length;
      const cy = list.reduce((sum, p) => sum + p.y, 0) / list.length;
      const spread = list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0;
      return { cx, cy, spread, count: list.length };
    };

    svg.addEventListener('pointerdown', (e) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      prev = gesture();
      svg.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse') svg.classList.add('is-dragging');
    });

    svg.addEventListener('pointermove', (e) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = gesture();
      if (!prev || !now) return;
      const pinching = now.count >= 2;
      const dragging = now.count === 1 && e.pointerType === 'mouse' && e.buttons & 1;
      if (!pinching && !dragging) { prev = now; return; }
      e.preventDefault();
      if (pinching && prev.spread > 0 && now.spread > 0) {
        this.zoomAt(prev.spread / now.spread, now.cx, now.cy);
      }
      this.panBy(now.cx - prev.cx, now.cy - prev.cy);
      prev = now;
    });

    const release = (e) => {
      points.delete(e.pointerId);
      prev = gesture();
      svg.classList.remove('is-dragging');
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.addEventListener('dblclick', () => this.resetView());
  }

  animate() {
    if (this.frame) return;
    const step = () => {
      let moving = false;
      for (let i = 0; i < 4; i++) {
        const delta = this.target[i] - this.view[i];
        if (Math.abs(delta) > this.target[2] * 0.0006) {
          this.view[i] += delta * 0.16;
          moving = true;
        } else {
          this.view[i] = this.target[i];
        }
      }
      this.applyView();
      this.frame = moving ? requestAnimationFrame(step) : null;
    };
    this.frame = requestAnimationFrame(step);
  }

  applyView() {
    this.svg.setAttribute('viewBox', this.view.map((n) => n.toFixed(3)).join(' '));
    this.scaleLabels();
  }

  scaleLabels() {
    const box = this.container.getBoundingClientRect();
    const unitsPerPx = this.view[2] / Math.max(box.width, 1);
    const size = Math.max(12, Math.min(15, box.width / 46));

    this.labelLayer.style.fontSize = size * unitsPerPx + 'px';
    this.labelLayer.style.setProperty('--halo', 2.6 * unitsPerPx + 'px');
    this.labelLayer.style.setProperty('--hair', 1 * unitsPerPx + 'px');

    if (size !== this.measuredSize) {
      for (const label of this.labels) {
        label.widthPx = label.face.getComputedTextLength() / unitsPerPx;
      }
      this.measuredSize = size;
    }

    this.layoutLabels(size, unitsPerPx, box);
  }

  layoutLabels(size, unitsPerPx, box) {
    const placed = [];
    const heightPx = size + 6;
    const margin = 3;

    for (const label of this.labels) {
      const sx = ((label.x - this.view[0]) / this.view[2]) * box.width;
      const sy = ((label.y - this.view[1]) / this.view[3]) * box.height;
      const wPx = label.widthPx;

      const insideBias = label.choiceKey === 'inside' ? 0.92 : 1.08;
      const roomW = (label.w / unitsPerPx) * 2 - 5;
      const roomH = (label.r / unitsPerPx) * 2;
      const fitsInside = wPx * insideBias <= roomW && heightPx * insideBias <= roomH;

      const ring = Math.max((label.r / unitsPerPx) * 0.9, 2) + 8;
      let options = fitsInside
        ? [{ key: 'inside', dx: 0, dy: 0, a: 'middle', callout: false }]
        : CALLOUTS.map((c, i) => ({
            key: 'c' + i, dx: c.ux * ring, dy: c.uy * ring, a: c.a, callout: true,
          }));

      const previous = options.findIndex((o) => o.key === label.choiceKey);
      if (previous > 0) {
        options = [options[previous], ...options.filter((_, i) => i !== previous)];
      }

      const pad = label.visible ? -1.5 : 3;

      let chosen = null;
      for (const option of options) {
        const cx = sx + option.dx;
        const cy = sy + option.dy;
        const x0 = option.a === 'start' ? cx : option.a === 'end' ? cx - wPx : cx - wPx / 2;
        const rect = [x0, cy - heightPx / 2, x0 + wPx, cy + heightPx / 2];
        const outside =
          rect[0] < margin || rect[1] < margin ||
          rect[2] > box.width - margin || rect[3] > box.height - margin;
        if (outside) continue;
        const test = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
        if (placed.some((p) => test[0] < p[2] && test[2] > p[0] && test[1] < p[3] && test[3] > p[1])) continue;
        chosen = { ...option, rect };
        break;
      }

      label.visible = Boolean(chosen);
      if (chosen) label.choiceKey = chosen.key;
      this.labelMemory.set(label.name, { visible: label.visible, choiceKey: label.choiceKey });

      label.node.classList.toggle('is-hidden', !chosen);
      if (!chosen) continue;

      label.node.classList.toggle('is-callout', chosen.callout);
      label.body.setAttribute('transform', `translate(${chosen.dx * unitsPerPx} ${chosen.dy * unitsPerPx})`);
      label.face.setAttribute('text-anchor', chosen.a);
      label.halo.setAttribute('text-anchor', chosen.a);
      label.leader.setAttribute('x2', chosen.callout ? chosen.dx * 0.82 * unitsPerPx : 0);
      label.leader.setAttribute('y2', chosen.callout ? chosen.dy * 0.82 * unitsPerPx : 0);
      label.dot.setAttribute('r', chosen.callout ? 1.7 * unitsPerPx : 0);
      placed.push(chosen.rect);
    }
  }
}
