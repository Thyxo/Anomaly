// App shell: screen routing, persisted house data, starting a shift and the end screen.
const App = (() => {
  const $ = id => document.getElementById(id);
  const LS_NIGHT = 'anomaly.night';
  const LS_LENGTH = 'anomaly.length';
  const LS_GRACE = 'anomaly.grace';
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
  const emptyHouse = () => ({ rooms: [], edges: [], playerRoom: null, anomalies: [], useFallback: true, spawnFar: false, layoutEdited: false });

  const app = {
    house: emptyHouse(),

    go(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
      if (name === 'title') Menu.renderTitle();
      if (name === 'mode') Menu.renderMode();
      if (name === 'addons') Menu.renderAddons();
      if (name === 'setup') Setup.render();
      if (name === 'game') requestAnimationFrame(() => Monitor.layout());
      window.scrollTo(0, 0);
    },

    save() {
      return Store.saveHouse(app.house).catch(e => app.toast('Saving failed: ' + e.message));
    },

    toast(text) {
      const t = $('toast');
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(t._h);
      t._h = setTimeout(() => t.classList.remove('show'), 2600);
    },

    night: () => Math.max(1, Number(localStorage.getItem(LS_NIGHT)) || 1),
    setNight: n => { try { localStorage.setItem(LS_NIGHT, String(n)); } catch { /* ignore */ } },
    nightLength: () => Number(localStorage.getItem(LS_LENGTH)) || (window.ANOMALY_CONFIG || {}).nightLengthMinutes || 7,
    setNightLength: m => { try { localStorage.setItem(LS_LENGTH, String(m)); } catch { /* ignore */ } },
    graceSeconds: () => { const v = localStorage.getItem(LS_GRACE); return v === null ? 30 : Math.max(0, Number(v) || 0); },
    setGraceSeconds: s => { try { localStorage.setItem(LS_GRACE, String(s)); } catch { /* ignore */ } },

    // opts: { mode: 'night', night } or { mode: 'endless', difficulty }
    async startGame(opts) {
      const v = Setup.validate();
      if (!v.ok) { app.go('setup'); Setup.showTab('begin'); return; }
      Sound.init(); // must happen inside the click that started the shift
      Game.enterFullscreen(); // likewise
      app.go('game');
      try {
        await Game.start(app.house, { ...opts, lengthMinutes: app.nightLength(), graceSeconds: app.graceSeconds() }, onShiftEnd);
      } catch (e) {
        Game.exitFullscreen();
        app.toast(e.message);
        app.go('title');
      }
    },

    async reset() {
      await Store.clear();
      app.house = emptyHouse();
      app.setNight(1);
    },
  };

  // After a shift: review what happened (skippable), then the end screen.
  function onShiftEnd(r) {
    Game.exitFullscreen();
    if (r.mode === 'night' && r.won) app.setNight(r.night + 1);
    const newBest = r.mode === 'endless' ? Menu.recordEndless(r.difficulty, r.survivedMs, r.clock) : false;
    Review.show(r.history, () => showEnd(r, newBest));
  }

  function showEnd(r, newBest) {
    const s = r.stats;
    const tally = `Anomalies cleared .... ${s.cleared}\nFalse reports ....... ${s.falseReports}`;
    const next = $('btn-end-next');
    if (r.mode === 'endless') {
      const best = Menu.bestFor(r.difficulty);
      $('end-title').textContent = 'SIGNAL LOST';
      $('end-text').textContent =
        `Endless ${ROMAN[r.difficulty]} — you lasted until ${r.clock}\n(${Menu.realTime(r.survivedMs)} real time).\n` +
        (newBest ? 'NEW BEST.\n' : best ? `Best: ${best.clock} (${Menu.realTime(best.ms)}).\n` : '') +
        `\n${tally}`;
      next.textContent = 'Try again';
      next.onclick = () => app.startGame({ mode: 'endless', difficulty: r.difficulty });
    } else if (r.won) {
      $('end-title').textContent = '06:00 — SHIFT COMPLETE';
      $('end-text').textContent = `Night ${r.night} logged.\n${tally}\n\nNight ${r.night + 1} will be worse.`;
      next.textContent = `Begin night ${r.night + 1}`;
      next.onclick = () => app.startGame({ mode: 'night', night: r.night + 1 });
    } else {
      $('end-title').textContent = 'SIGNAL LOST';
      $('end-text').textContent = `${r.time} — Contact with guard lost.\nLast known location: ${r.yourRoom.toUpperCase()}.\n\n${tally}`;
      next.textContent = `Retry night ${r.night}`;
      next.onclick = () => app.startGame({ mode: 'night', night: r.night });
    }
    app.go('end');
  }

  async function init() {
    Monitor.init($('feed'), $('monitor'), $('monitor-area'));
    Game.bindInput();
    Editor.bind();
    Setup.bind();
    Review.bind();
    Menu.bind();
    document.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => app.go(b.dataset.goto); });
    $('btn-setup').onclick = () => app.go('setup');
    $('btn-rotate').onclick = () => Game.enterFullscreen();
    $('btn-demo').onclick = async () => {
      if (app.house.rooms.length && !confirm('Replace your current house with the demo house?')) return;
      await app.reset();
      app.house = await Demo.build();
      await app.save();
      app.toast('Demo house loaded.');
      Menu.renderTitle();
    };
    try {
      const saved = await Store.loadHouse();
      if (saved) app.house = Object.assign(emptyHouse(), saved);
    } catch (e) {
      app.toast('Local storage is unavailable: ' + e.message);
    }
    Menu.renderTitle();
  }

  document.addEventListener('DOMContentLoaded', init);
  return app;
})();
