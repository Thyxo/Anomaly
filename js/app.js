// App shell: screen routing, persisted house data, title and end screens.
const App = (() => {
  const $ = id => document.getElementById(id);
  const LS_NIGHT = 'anomaly.night';
  const LS_LENGTH = 'anomaly.length';
  const LS_GRACE = 'anomaly.grace';
  const emptyHouse = () => ({ rooms: [], edges: [], playerRoom: null, anomalies: [], useFallback: true, coopHide: false, layoutEdited: false });

  const app = {
    house: emptyHouse(),

    go(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
      if (name === 'title') renderTitle();
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

    async startNight(n = app.night()) {
      const v = Setup.validate();
      if (!v.ok) { app.go('setup'); Setup.showTab('begin'); return; }
      Sound.init(); // must happen inside the click that started the night
      Game.enterFullscreen(); // likewise
      app.go('game');
      try {
        await Game.start(app.house, n, app.nightLength(), showEnd, app.graceSeconds());
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

  function renderTitle() {
    const v = Setup.validate(app.house);
    const status = $('title-status');
    if (!app.house.rooms.length) status.textContent = 'No house configured.';
    else if (!v.ok) status.textContent = 'Setup incomplete.\n' + v.problems[0];
    else status.textContent = `NIGHT ${app.night()} · ${v.cams.length} feed${v.cams.length === 1 ? '' : 's'} ready`;
    $('btn-begin').disabled = !v.ok;
    $('btn-begin').textContent = `Begin night ${app.night()}`;
  }

  function showEnd(r) {
    Game.exitFullscreen();
    const s = r.stats;
    if (r.won) {
      app.setNight(r.night + 1);
      $('end-title').textContent = '06:00 — SHIFT COMPLETE';
      $('end-text').textContent =
        `Night ${r.night} logged.\nAnomalies cleared .... ${s.cleared}\nFalse reports ....... ${s.falseReports}\n\nNight ${r.night + 1} will be worse.`;
      $('btn-end-next').textContent = `Begin night ${r.night + 1}`;
      $('btn-end-next').onclick = () => app.startNight(r.night + 1);
    } else {
      $('end-title').textContent = 'SIGNAL LOST';
      $('end-text').textContent =
        `${r.time} — Contact with guard lost.\nLast known location: ${r.yourRoom.toUpperCase()}.\n\nAnomalies cleared .... ${s.cleared}\nFalse reports ....... ${s.falseReports}`;
      $('btn-end-next').textContent = `Retry night ${r.night}`;
      $('btn-end-next').onclick = () => app.startNight(r.night);
    }
    app.go('end');
  }

  async function init() {
    Monitor.init($('feed'), $('monitor'), $('monitor-area'));
    Game.bindInput();
    Editor.bind();
    Setup.bind();
    document.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => app.go(b.dataset.goto); });
    $('btn-setup').onclick = () => app.go('setup');
    $('btn-begin').onclick = () => app.startNight();
    $('btn-demo').onclick = async () => {
      if (app.house.rooms.length && !confirm('Replace your current house with the demo house?')) return;
      await app.reset();
      app.house = await Demo.build();
      await app.save();
      app.toast('Demo house loaded.');
      renderTitle();
    };
    try {
      const saved = await Store.loadHouse();
      if (saved) app.house = Object.assign(emptyHouse(), saved);
    } catch (e) {
      app.toast('Local storage is unavailable: ' + e.message);
    }
    renderTitle();
  }

  document.addEventListener('DOMContentLoaded', init);
  return app;
})();
