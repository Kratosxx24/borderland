// Puzzle generation and the border graph for Borderland.
// Given a country, name all its neighbours.

export function normalise(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class World {
  constructor(countries) {
    this.list = countries;
    this.byName = new Map(countries.map((c) => [c.name, c]));

    this.lookup = new Map();
    for (const c of countries) {
      this.lookup.set(normalise(c.name), c.name);
      for (const a of c.aliases) this.lookup.set(normalise(a), c.name);
    }
  }

  get(name) {
    return this.byName.get(name);
  }

  resolve(text) {
    const q = normalise(text);
    if (!q) return null;
    return this.lookup.get(q) ?? null;
  }

  suggest(text, limit = 6) {
    const q = normalise(text);
    if (!q) return [];
    const hits = [];
    for (const c of this.list) {
      const n = normalise(c.name);
      let score = -1;
      if (n === q) score = 0;
      else if (n.startsWith(q)) score = 1;
      else if (n.split(' ').some((w) => w.startsWith(q))) score = 2;
      else if (n.includes(q)) score = 3;
      else if (c.aliases.some((a) => normalise(a).startsWith(q))) score = 2;
      if (score >= 0) hits.push([score, c]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
    return hits.slice(0, limit).map((h) => h[1]);
  }
}

// -- Deterministic daily puzzles ---------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MIN_NEIGHBOURS = 3;
const MAX_NEIGHBOURS = 14;

export function makePuzzle(world, seed) {
  const rand = rng(hash(seed));
  const eligible = world.list.filter(
    (c) => c.n.length >= MIN_NEIGHBOURS && c.n.length <= MAX_NEIGHBOURS && c.end
  );

  for (let attempt = 0; attempt < 200; attempt++) {
    const country = eligible[Math.floor(rand() * eligible.length)];
    return buildPuzzle(world, country.name, seed);
  }
  return buildPuzzle(world, 'France', seed);
}

export function buildPuzzle(world, target, id) {
  const country = world.get(target);
  const neighbours = [...country.n].sort();
  const extraGuesses = Math.max(2, Math.ceil(neighbours.length * 0.5));
  return {
    id,
    target,
    neighbours,
    total: neighbours.length,
    limit: neighbours.length + extraGuesses,
  };
}
