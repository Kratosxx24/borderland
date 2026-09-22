export function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function createAutocomplete(ui, world) {
  let cursor = -1;

  function hide() {
    ui.suggest.hidden = true;
    ui.suggest.replaceChildren();
    cursor = -1;
  }

  function show(puzzle, state) {
    const q = ui.input.value.trim();
    if (q.length < 1 || state.status !== 'playing') return hide();
    const hits = world.suggest(q, 6).filter((c) => c.name !== puzzle.target);
    if (!hits.length) return hide();

    cursor = 0;
    ui.suggest.replaceChildren(
      ...hits.map((c, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === 0));
        li.dataset.name = c.name;
        const tried = state.guesses.some((g) => g.name === c.name);
        li.innerHTML = '<span></span><span class="hint"></span>';
        li.firstChild.textContent = c.name;
        li.lastChild.textContent = tried ? 'tried' : c.n.length ? `${c.n.length} borders` : 'no land borders';
        return li;
      }),
    );
    ui.suggest.hidden = false;
  }

  function move(step) {
    const rows = [...ui.suggest.children];
    if (!rows.length) return;
    cursor = (cursor + step + rows.length) % rows.length;
    rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === cursor)));
    rows[cursor].scrollIntoView({ block: 'nearest' });
  }

  function selected() {
    return ui.suggest.hidden ? null : (ui.suggest.children[cursor]?.dataset.name ?? null);
  }

  return { hide, show, move, selected };
}
