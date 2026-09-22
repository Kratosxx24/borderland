// The game loop for Borderland: pick a country, name its neighbours.

const STORE = 'borderland:v1';
const CURRENT = STORE + ':current';
const slotOf = (daily, seed) => STORE + (daily ? ':' + seed : ':practice');

export function createFlow({ ui, world, map, autocomplete, deps }) {
  const { recordDaily, readJson, writeJson, getBlind } = deps;

  let puzzle = null;
  let state = null;
  let concedeArmed = null;
  let gen = 0;

  function rememberCurrent(daily, seed) {
    writeJson(CURRENT, { daily, seed });
  }

  function save() {
    writeJson(slotOf(state.daily, puzzle.id), {
      seed: puzzle.id,
      target: puzzle.target,
      guesses: state.guesses,
      found: state.found,
      status: state.status,
      blindRun: state.blindRun,
      conceded: state.conceded,
    });
    rememberCurrent(state.daily, puzzle.id);
  }

  function bboxOf(names) {
    return names
      .map((n) => world.get(n)?.bbox)
      .filter(Boolean)
      .reduce(
        (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
        [180, 90, -180, -90],
      );
  }

  function frameBoard(instant) {
    const names = [puzzle.target, ...puzzle.neighbours];
    map.focus(bboxOf(names), { padding: 0.6, instant });
  }

  function render() {
    const foundSet = new Set(state.found);
    const wrongSet = new Set(state.guesses.filter((g) => !g.isNeighbour).map((g) => g.name));

    const states = new Map();
    states.set(puzzle.target, 'target');
    for (const name of state.found) states.set(name, 'found');
    for (const name of wrongSet) states.set(name, 'wrong');
    map.paint(states);

    const labels = [
      { name: puzzle.target, kind: 'target' },
      ...[...state.guesses].reverse().map((g) => ({
        name: g.name,
        kind: g.isNeighbour ? 'found' : 'wrong',
      })),
    ].map((l) => {
      const c = world.get(l.name);
      return { ...l, p: c.p, r: c.r, w: c.w };
    });
    map.setLabels(labels);

    // Guess list
    ui.guesses.replaceChildren(
      ...[...state.guesses].reverse().map((g) => {
        const li = document.createElement('li');
        li.className = 'guess is-' + (g.isNeighbour ? 'found' : 'wrong');
        li.innerHTML = `<i class="dot"></i><span class="name"></span><span class="score">${g.isNeighbour ? 'neighbour' : 'nope'}</span>`;
        li.querySelector('.name').textContent = g.name;
        return li;
      }),
    );

    // Progress bar (one slot per neighbour)
    ui.pips.replaceChildren(
      ...Array.from({ length: puzzle.total }, (_, i) => {
        const slot = document.createElement('i');
        slot.className = 'pip' + (i < state.found.length ? ' is-found' : '');
        return slot;
      }),
    );

    ui.concede.hidden = state.status !== 'playing';
    const remaining = puzzle.limit - state.guesses.length;
    ui.tally.textContent =
      state.status === 'playing'
        ? `${state.found.length}/${puzzle.total} found · ${remaining} left`
        : state.status === 'won'
          ? `All ${puzzle.total} found!`
          : `${state.found.length}/${puzzle.total} found`;
  }

  function disarmConcede() {
    clearTimeout(concedeArmed);
    concedeArmed = null;
    ui.concede.textContent = 'Give Up';
    ui.concede.classList.remove('is-armed');
  }

  function concedeRoute(onFinished) {
    if (state.status !== 'playing') return;
    if (!concedeArmed) {
      ui.concede.textContent = 'Sure?';
      ui.concede.classList.add('is-armed');
      concedeArmed = setTimeout(disarmConcede, 3000);
      return;
    }
    disarmConcede();
    state.status = 'lost';
    state.conceded = true;
    ui.input.value = '';
    ui.input.disabled = true;
    autocomplete.hide();
    if (state.daily) recordDaily(puzzle.id, false, state.found.length, puzzle.total);
    save();
    render();
    const myGen = gen;
    setTimeout(() => { if (gen === myGen) onFinished(); }, 320);
  }

  function say(text, band) {
    ui.feedback.className = 'feedback' + (band ? ' is-' + band : '');
    ui.feedback.innerHTML = text;
  }

  function reject(text) {
    say(text);
    ui.field.classList.remove('is-wrong');
    void ui.field.offsetWidth;
    ui.field.classList.add('is-wrong');
  }

  function submit(raw, escapeHtml, onFinished) {
    if (state.status !== 'playing') return;
    const text = raw.trim();
    if (!text) return;

    let name = world.resolve(text);
    if (!name) {
      const matches = world.suggest(text, 6);
      if (matches.length === 1) {
        name = matches[0].name;
      } else if (matches.length > 1) {
        autocomplete.show(puzzle, state);
        return say(`Which one? <b>${escapeHtml(text)}</b> matches ${matches.length} countries.`);
      }
    }
    if (!name) return reject(`No country matches "${escapeHtml(text)}".`);

    ui.input.value = '';
    autocomplete.hide();

    if (name === puzzle.target) {
      return reject(`<b>${name}</b> is the target country!`);
    }
    if (state.guesses.some((g) => g.name === name)) {
      return reject(`You already guessed <b>${name}</b>.`);
    }

    const isNeighbour = puzzle.neighbours.includes(name);
    state.guesses.push({ name, isNeighbour });
    state.blindRun = state.blindRun && getBlind();

    if (isNeighbour) {
      state.found.push(name);
      say(`<b>${name}</b> borders ${puzzle.target}!`, 'found');
    } else {
      say(`<b>${name}</b> does not border ${puzzle.target}.`, 'wrong');
    }

    if (state.found.length === puzzle.total) state.status = 'won';
    else if (state.guesses.length >= puzzle.limit) state.status = 'lost';

    save();
    render();

    if (state.status !== 'playing') {
      if (state.daily) recordDaily(puzzle.id, state.status === 'won', state.found.length, puzzle.total);
      ui.input.value = '';
      ui.input.disabled = true;
      autocomplete.hide();
      const myGen = gen;
      const delay = state.status === 'won' ? 800 : 400;
      setTimeout(() => { if (gen === myGen) onFinished(); }, delay);
    }
  }

  function startPuzzle(next, daily, onFinished, archiveLabel) {
    gen++;
    puzzle = next;
    const saved = readJson(slotOf(daily, puzzle.id));
    const stale =
      saved &&
      ((saved.seed ?? puzzle.id) !== puzzle.id ||
        (saved.target ?? puzzle.target) !== puzzle.target);
    const resume = saved && !stale ? saved : null;
    state = {
      daily,
      guesses: resume?.guesses ?? [],
      found: resume?.found ?? [],
      status: resume?.status ?? 'playing',
      blindRun: resume?.blindRun ?? true,
      conceded: resume?.conceded ?? false,
    };
    rememberCurrent(daily, puzzle.id);

    ui.label.innerHTML = daily
      ? 'Daily Challenge · ' + puzzle.id
      : `${archiveLabel ?? 'Practice'} · <button type="button" class="linky" data-act="daily">Back to Today</button>`;
    ui.targetCountry.textContent = puzzle.target;
    ui.meta.innerHTML = `Name all <b>${puzzle.total}</b> bordering ${puzzle.total === 1 ? 'country' : 'countries'} · <b>${puzzle.limit}</b> guesses`;
    ui.input.value = '';
    ui.input.disabled = false;
    say('');
    disarmConcede();
    autocomplete.hide();
    render();
    frameBoard(true);
    if (state.status !== 'playing') {
      if (daily) recordDaily(puzzle.id, state.status === 'won', state.found.length, puzzle.total);
      onFinished();
    } else {
      ui.input.focus();
    }
  }

  return {
    startPuzzle,
    submit,
    concedeRoute,
    frameBoard,
    getPuzzle: () => puzzle,
    getState: () => state,
  };
}
