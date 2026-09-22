const KEY = 'borderland:v1:stats';

const EMPTY = { played: 0, wins: 0, streak: 0, best: 0, last: null, dist: {} };

export function readStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved ? { ...EMPTY, ...saved, dist: { ...saved.dist } } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function previousDay(id) {
  const d = new Date(id + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function recordDaily(id, won, foundCount, totalNeighbours) {
  const stats = readStats();
  if (stats.last === id) return stats;

  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.streak = stats.last === previousDay(id) ? stats.streak + 1 : 1;
    stats.best = Math.max(stats.best, stats.streak);
    const pct = Math.round((foundCount / totalNeighbours) * 100);
    const bucket = pct === 100 ? '100%' : pct >= 75 ? '75%+' : pct >= 50 ? '50%+' : '<50%';
    stats.dist[bucket] = (stats.dist[bucket] ?? 0) + 1;
  } else {
    stats.streak = 0;
    stats.dist.X = (stats.dist.X ?? 0) + 1;
  }
  stats.last = id;

  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch { /* storage full */ }
  return stats;
}

export function distributionRows(stats, highlight = null) {
  const order = ['100%', '75%+', '50%+', '<50%', 'X'];
  const rows = order
    .filter((k) => stats.dist[k] > 0)
    .map((k) => ({ label: k, count: stats.dist[k], key: k }));
  if (!rows.length) return [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => ({
    ...r,
    share: Math.max(r.count / max, 0.06),
    current: highlight !== null && r.key === String(highlight),
  }));
}
