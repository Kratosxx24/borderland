// Borderland — name the countries that border a given nation.

const V = new URL(import.meta.url).search;
const { WorldMap } = await import('./map.js' + V);
const { World, makePuzzle, buildPuzzle } = await import('./game.js' + V);
const { readStats, recordDaily, distributionRows } = await import('./stats.js' + V);
const { readJson, writeJson, todayId, pastDays } = await import('./storage.js' + V);
const { escapeHtml, createAutocomplete } = await import('./guess-input.js' + V);
const { createSheets } = await import('./sheets.js' + V);
const { createFlow } = await import('./puzzle-flow.js' + V);

const STORE = 'borderland:v1';
const CURRENT = STORE + ':current';
const $ = (id) => document.getElementById(id);

const ui = {
  targetCountry: $('target-country'),
  meta: $('prompt-meta'),
  label: $('puzzle-label'),
  form: $('guessform'),
  field: document.querySelector('.field'),
  input: $('guess'),
  suggest: $('suggest'),
  feedback: $('feedback'),
  pips: $('pips'),
  tally: $('tally'),
  guesses: $('guesses'),
  concede: document.querySelector('[data-act="concede"]'),
  scrim: $('scrim'),
  sheetBody: $('sheet-body'),
};

let world;
let map;
let flow;
let sheets;
let autocomplete;
let blind = localStorage.getItem(STORE + ':blind') === '1';

const prefersDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORE + ':theme', theme);
  document.getElementById('meta-theme-color').content = theme === 'dark' ? '#111a20' : '#dfe6e9';
}
applyTheme(localStorage.getItem(STORE + ':theme') ?? (prefersDark.matches ? 'dark' : 'light'));

function applyBlind(on) {
  blind = on;
  localStorage.setItem(STORE + ':blind', on ? '1' : '0');
  map?.setBlind(on);
  const button = document.querySelector('[data-act="blind"]');
  button.setAttribute('aria-pressed', String(on));
  button.querySelector('.mapmode-text').textContent = on ? 'Borders Hidden' : 'Borders Shown';
}

function showResult() {
  const state = flow.getState();
  sheets.showResult(flow.getPuzzle(), state);
}

async function boot() {
  const dataUrl = (file) => new URL('../public/data/' + file, import.meta.url);
  const [countries, topo] = await Promise.all([
    fetch(dataUrl('countries.json')).then((r) => r.json()),
    fetch(dataUrl('world.topo.json')).then((r) => r.json()),
  ]);

  world = new World(countries);
  map = new WorldMap($('stage'), topo);
  map.onViewChange = (moved) => {
    document.querySelector('[data-act="recenter"]').hidden = !moved;
  };
  applyBlind(blind);

  autocomplete = createAutocomplete(ui, world);
  sheets = createSheets(ui, { readStats, distributionRows });
  flow = createFlow({
    ui,
    world,
    map,
    autocomplete,
    deps: { recordDaily, readJson, writeJson, getBlind: () => blind },
  });

  const current = readJson(CURRENT);
  if (current && !current.daily && current.seed) {
    flow.startPuzzle(makePuzzle(world, current.seed), false, showResult);
  } else {
    flow.startPuzzle(makePuzzle(world, todayId()), true, showResult);
  }
  wire();
}

function wire() {
  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = autocomplete.selected();
    flow.submit(picked ?? ui.input.value, escapeHtml, showResult);
  });

  ui.input.addEventListener('input', () => autocomplete.show(flow.getPuzzle(), flow.getState()));
  ui.input.addEventListener('blur', () => setTimeout(autocomplete.hide, 120));

  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      ui.suggest.hidden ? autocomplete.show(flow.getPuzzle(), flow.getState()) : autocomplete.move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocomplete.move(-1);
    } else if (e.key === 'Escape') {
      autocomplete.hide();
    }
  });

  ui.suggest.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    flow.submit(li.dataset.name, escapeHtml, showResult);
  });

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'how') sheets.showHow();
    if (act === 'close') sheets.closeSheet(flow.getState());
    if (act === 'concede') flow.concedeRoute(showResult);
    if (act === 'stats') sheets.showStats();
    if (act === 'archive') sheets.showArchive(pastDays(14));
    if (act === 'archive-pick') {
      const date = e.target.closest('[data-act]').dataset.date;
      sheets.closeSheet(flow.getState());
      flow.startPuzzle(makePuzzle(world, date), false, showResult, 'Archive · ' + sheets.formatDate(date));
    }
    if (act === 'blind') applyBlind(!blind);
    if (act === 'recenter') map.resetView();
    if (act === 'theme') {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }
    if (act === 'shuffle') {
      sheets.closeSheet(flow.getState());
      flow.startPuzzle(makePuzzle(world, 'practice-' + Math.random()), false, showResult);
    }
    if (act === 'daily') {
      sheets.closeSheet(flow.getState());
      flow.startPuzzle(makePuzzle(world, todayId()), true, showResult);
    }
    if (act === 'copy') {
      navigator.clipboard.writeText(sheets.shareText(flow.getPuzzle(), flow.getState())).then(
        () => (e.target.textContent = 'Copied'),
        () => (e.target.textContent = 'Copy Failed'),
      );
    }
  });

  ui.scrim.addEventListener('click', (e) => {
    if (e.target === ui.scrim) sheets.closeSheet(flow.getState());
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.scrim.hidden) sheets.closeSheet(flow.getState());

    if (e.key === 'Enter' && flow.getState().status !== 'playing' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const focused = document.activeElement;
      if (focused?.closest('.sheet-actions') || /^(INPUT|TEXTAREA)$/.test(focused?.tagName ?? '')) {
        return;
      }
      e.preventDefault();
      sheets.closeSheet(flow.getState());
      flow.startPuzzle(makePuzzle(world, 'practice-' + Math.random()), false, showResult);
    }
  });

  if (!localStorage.getItem(STORE + ':seen')) {
    localStorage.setItem(STORE + ':seen', '1');
    sheets.showHow();
  }
}

window.borderland = {
  get world() { return world; },
  get puzzle() { return flow.getPuzzle(); },
  buildPuzzle,
  startPuzzle: (next, daily) => flow.startPuzzle(next, daily, showResult),
};

boot();
