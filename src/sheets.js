function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function formatDate(id) {
  return new Date(id + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function neighboursHtml(puzzle, foundSet) {
  return (
    '<div class="neighbours-list">' +
    '<span class="hop is-target">' + escapeHtml(puzzle.target) + '</span>' +
    puzzle.neighbours
      .map((n) => {
        const cls = foundSet.has(n) ? 'is-found' : 'is-missed';
        return `<span class="hop ${cls}">${escapeHtml(n)}</span>`;
      })
      .join('') +
    '</div>'
  );
}

export function createSheets(ui, { readStats, distributionRows }) {
  function openSheet(html) {
    ui.sheetBody.innerHTML = html;
    ui.scrim.hidden = false;
  }

  function closeSheet(state) {
    ui.scrim.hidden = true;
    if (state.status === 'playing') ui.input.focus();
    else document.activeElement?.blur?.();
  }

  function shareGrid(state) {
    return state.guesses
      .map((g) => (g.isNeighbour ? '🟩' : '🟥'))
      .join('');
  }

  function shareText(puzzle, state) {
    const head = state.daily ? 'Borderland ' + puzzle.id : 'Borderland practice';
    const score = `${state.found.length}/${puzzle.total}`;
    return `${head}\n${puzzle.target}: ${score}\n${shareGrid(state)}`;
  }

  function statsHtml(highlight = null) {
    const stats = readStats();
    if (!stats.played) {
      return '<p>No daily challenge finished yet.</p>';
    }

    const rows = distributionRows(stats, highlight);
    const tiles = [
      ['Played', stats.played],
      ['Won', Math.round((stats.wins / stats.played) * 100) + '%'],
      ['Streak', stats.streak],
      ['Best', stats.best],
    ];

    return `
      <div class="stat-row">
        ${tiles.map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('')}
      </div>
      <h3>Score Distribution</h3>
      <ul class="dist">
        ${rows
          .map(
            (r) => `
          <li class="dist-row${r.current ? ' is-current' : ''}${r.key === 'X' ? ' is-fail' : ''}">
            <span class="dist-key">${r.label}</span>
            <span class="dist-bar" style="--share: ${(r.share * 100).toFixed(1)}%"><i></i></span>
            <span class="dist-n">${r.count}</span>
          </li>`,
          )
          .join('')}
      </ul>
    `;
  }

  function showArchive(dates) {
    openSheet(`
      <p class="eyebrow">Archive</p>
      <h2 id="sheet-title">Past Challenges</h2>
      <p>Play a previous day's challenge. It won't affect your streak.</p>
      <ul class="archive-list">
        ${dates
          .map(
            (d) =>
              `<li><button type="button" class="archive-day" data-act="archive-pick" data-date="${d}">${formatDate(d)}</button></li>`,
          )
          .join('')}
      </ul>
    `);
  }

  function showStats() {
    openSheet(`
      <p class="eyebrow">Statistics</p>
      <h2 id="sheet-title">Your Record</h2>
      ${statsHtml()}
      <div class="sheet-actions">
        <button type="button" class="btn primary" data-act="close">Done</button>
      </div>
    `);
  }

  function showResult(puzzle, state) {
    const foundCount = state.found.length;
    const total = puzzle.total;
    const perfect = foundCount === total;
    const pct = Math.round((foundCount / total) * 100);
    const foundSet = new Set(state.found);

    const title = perfect
      ? 'Perfect!'
      : state.conceded
        ? 'Gave Up'
        : pct >= 75
          ? 'Well Done'
          : pct >= 50
            ? 'Not Bad'
            : 'Tough One';

    const lead = perfect
      ? `You named all <b>${total}</b> of <b>${puzzle.target}</b>'s neighbours!`
      : `You found <b>${foundCount}</b> of <b>${total}</b> countries bordering <b>${puzzle.target}</b>.`;

    const highlightBucket = perfect ? '100%' : pct >= 75 ? '75%+' : pct >= 50 ? '50%+' : '<50%';

    openSheet(`
      <p class="eyebrow">${state.daily ? 'Daily Challenge · ' + puzzle.id : 'Practice'}</p>
      <h2 id="sheet-title"${perfect ? ' class="is-win"' : ''}>${title}</h2>
      <p>${lead}</p>
      <h3>All Neighbours</h3>
      ${neighboursHtml(puzzle, foundSet)}
      ${state.daily ? '<h3>Your Record</h3>' + statsHtml(highlightBucket) : ''}
      ${state.guesses.length ? '<h3>Share</h3><p class="grid-share">' + shareGrid(state) + '</p>' : ''}
      <div class="sheet-actions">
        <button type="button" class="btn" data-act="copy">Copy Result</button>
        <button type="button" class="btn primary" data-act="shuffle">New Country</button>
      </div>
      <p class="sheet-hint">Or press <kbd>Enter</kbd> for another challenge.</p>
    `);
  }

  function showHow() {
    openSheet(`
      <p class="eyebrow">How to Play</p>
      <h2 id="sheet-title">Name the Neighbours</h2>
      <p>You are given a country, highlighted on the map. Name every country that shares a land border with it.</p>
      <ul class="rules">
        <li><span class="marker is-target">★</span><span>The highlighted country is your <b>target</b>. It's already on the map.</span></li>
        <li><span class="marker is-found">✓</span><span><b>Green</b> — correct! This country borders the target.</span></li>
        <li><span class="marker is-wrong">✗</span><span><b>Red</b> — this country does not border the target.</span></li>
      </ul>
      <h3>The Rules</h3>
      <p>You get a limited number of guesses — the number of actual neighbours plus a few extra. Only land borders count. A new country appears every day.</p>
      <h3>The Map</h3>
      <p>The map zooms to show the target country and its region. Scroll to zoom, drag to pan, use two fingers on a touch screen, and tap <b>Reset View</b> to put it back.</p>
      <h3>Blind Mode</h3>
      <p>Hide the borders and the map shows only bare continent silhouettes plus the countries you've named. Can you find them all without seeing the lines?</p>
      <div class="sheet-actions">
        <button type="button" class="btn primary" data-act="close">Start Playing</button>
      </div>
    `);
  }

  return { openSheet, closeSheet, showStats, showResult, showHow, showArchive, shareText, formatDate };
}
