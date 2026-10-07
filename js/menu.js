// Main menu: game-mode cards, the start screen for each mode, and the add-ons list.
const Menu = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const LS_DIFF = 'anomaly.endless.difficulty';
  const LS_BEST = 'anomaly.endless.best';
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
  let mode = 'night';
  let addonsBack = 'title';

  const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  const difficulty = () => Math.min(3, Math.max(1, Number(read(LS_DIFF, 1)) || 1));
  const bests = () => read(LS_BEST, {}) || {};
  const realTime = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

  // Store an endless result; returns true if it is a new best.
  function recordEndless(diff, survivedMs, clock) {
    const all = bests();
    const prev = all[diff];
    if (prev && prev.ms >= survivedMs) return false;
    all[diff] = { ms: survivedMs, clock };
    write(LS_BEST, all);
    return true;
  }
  const bestFor = diff => bests()[diff] || null;

  // ---------- title ----------
  function renderTitle() {
    const v = Setup.validate(App.house);
    const status = $('title-status');
    if (!App.house.rooms.length) status.textContent = 'No house configured. Set up your house, or load the demo house.';
    else if (!v.ok) status.textContent = 'Setup incomplete.\n' + v.problems[0];
    else status.textContent = `${v.cams.length} feed${v.cams.length === 1 ? '' : 's'} ready`;
    $('meta-night').textContent = `NIGHT ${App.night()}`;
    const b = bestFor(difficulty());
    $('meta-endless').textContent = b ? `BEST ${ROMAN[difficulty()]}: ${b.clock}` : 'NO RECORD YET';
    const n = Addons.enabled().length;
    $('addon-count').textContent = n ? `(${n})` : '';
  }

  // ---------- mode start screen ----------
  function openMode(m) {
    mode = m;
    App.go('mode');
    renderMode();
  }

  function renderMode() {
    const night = mode === 'night';
    $('mode-title').textContent = night ? 'Night shift' : 'Endless';
    $('mode-desc').textContent = night
      ? 'Survive until 06:00. Win and the next night is harder.'
      : 'One life. There is no 06:00 — the shift goes on and gets worse until something reaches you.';
    $('opts-night').hidden = !night;
    $('opts-endless').hidden = night;
    $('night-select').value = App.night();
    $('night-length').value = App.nightLength();
    $('grace-seconds').value = App.graceSeconds();
    $('grace-seconds-endless').value = App.graceSeconds();
    const d = difficulty();
    document.querySelectorAll('#endless-diff .diff').forEach(b => b.classList.toggle('active', Number(b.dataset.diff) === d));
    $('endless-best').textContent = [1, 2, 3].map(k => {
      const b = bestFor(k);
      return `BEST ${ROMAN[k].padEnd(3)} ... ${b ? `${b.clock}  (${realTime(b.ms)})` : '—'}`;
    }).join('\n');

    const box = $('mode-addons');
    box.innerHTML = '';
    const on = Addons.enabled();
    box.appendChild(el('span', '', 'ADD-ONS: ' + (on.length ? on.map(a => a.name).join(' · ') : 'none')));
    const change = el('button', 'btn small', 'Change');
    change.onclick = () => openAddons('mode');
    box.appendChild(change);

    const v = Setup.validate(App.house);
    $('mode-problem').textContent = v.ok ? '' : (App.house.rooms.length ? v.problems[0] : 'Set up your house first (or load the demo house).');
    $('btn-mode-start').disabled = !v.ok;
    $('btn-mode-start').textContent = night ? `Begin night ${App.night()}` : `Begin endless ${ROMAN[d]}`;
  }

  function begin() {
    if (mode === 'endless') App.startGame({ mode: 'endless', difficulty: difficulty() });
    else App.startGame({ mode: 'night', night: App.night() });
  }

  // ---------- add-ons ----------
  function openAddons(back) {
    addonsBack = back;
    App.go('addons');
  }

  function renderAddons() {
    const list = $('addon-list');
    list.innerHTML = '';
    for (const def of Addons.DEFS) {
      const s = Addons.settings(def.id);
      const card = el('div', 'addon' + (s.on ? ' on' : ''));
      const head = el('label', 'check addon-head');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = s.on;
      box.onchange = () => { Addons.set(def.id, { on: box.checked }); renderAddons(); };
      head.append(box, el('b', '', def.name));
      card.append(head, el('p', 'muted small', def.description));
      for (const o of def.options || []) {
        const lab = el('label', 'addon-opt', o.label + ' ');
        const sel = document.createElement('select');
        for (const [val, text] of o.choices) {
          const opt = el('option', '', text);
          opt.value = val;
          sel.appendChild(opt);
        }
        sel.value = s[o.key];
        sel.onchange = () => Addons.set(def.id, { [o.key]: sel.value });
        lab.appendChild(sel);
        card.appendChild(lab);
      }
      list.appendChild(card);
    }
  }

  function bind() {
    document.querySelectorAll('#mode-cards .mode-card[data-mode]').forEach(c => { c.onclick = () => openMode(c.dataset.mode); });
    $('btn-addons').onclick = () => openAddons('title');
    $('addons-back').onclick = () => { App.go(addonsBack); if (addonsBack === 'mode') renderMode(); };
    $('btn-mode-start').onclick = begin;
    document.querySelectorAll('#endless-diff .diff').forEach(b => {
      b.onclick = () => { write(LS_DIFF, Number(b.dataset.diff)); renderMode(); };
    });
    $('night-select').onchange = e => { App.setNight(Math.max(1, Math.min(10, Number(e.target.value) || 1))); renderMode(); };
    $('night-length').onchange = e => App.setNightLength(Math.max(2, Math.min(20, Number(e.target.value) || 7)));
    const grace = e => { App.setGraceSeconds(Math.max(0, Math.min(300, Number(e.target.value) || 0))); renderMode(); };
    $('grace-seconds').onchange = grace;
    $('grace-seconds-endless').onchange = grace;
  }

  return { bind, renderTitle, renderMode, renderAddons, openMode, recordEndless, bestFor, realTime };
})();
