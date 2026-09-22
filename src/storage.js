export function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function todayId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function pastDays(count) {
  const p = (n) => String(n).padStart(2, '0');
  const ids = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    d.setDate(d.getDate() - 1);
    ids.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return ids;
}
