// Add-ons: optional rules layered on top of any game mode. Each add-on hooks
// into a few fixed points of the night loop (start, tick, camera switch, stop)
// through a small `api` that Game hands over, so new ones never touch the core.
// Rule of thumb for new add-ons: each must give the player a new decision,
// not just bigger numbers.
const Addons = (() => {
  const LS_KEY = 'anomaly.addons';
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = n => String(n).padStart(2, '0');

  const DEFS = [
    {
      id: 'deadcam',
      name: 'Dead cameras',
      description: 'Now and then a camera loses its signal. Hold REBOOT for a few seconds to bring it back. While it is down you are blind in that room, and things can still move there.',
      start(api) {
        const st = { dead: -1, next: api.graceMs + rand(35, 65) * 1000, hold: 0, holding: false };
        const btn = document.createElement('button');
        btn.className = 'btn reboot';
        btn.innerHTML = '<span class="fill"></span><span class="lbl">Hold to reboot</span>';
        btn.hidden = true;
        const on = e => { e.preventDefault(); st.holding = true; };
        const off = () => { st.holding = false; };
        btn.addEventListener('pointerdown', on);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, off));
        btn.addEventListener('contextmenu', e => e.preventDefault());
        st.key = e => { if (e.key === 'b' || e.key === 'B') st.holding = e.type === 'keydown'; };
        document.addEventListener('keydown', st.key);
        document.addEventListener('keyup', st.key);
        api.actions.appendChild(btn);
        st.btn = btn;
        return st;
      },
      tick(st, api, dt) {
        if (st.dead < 0) {
          if (api.elapsed() < st.next || api.camCount() < 2) return;
          st.dead = Math.floor(Math.random() * api.camCount());
          st.hold = 0;
          api.markCam(st.dead, 'dead', true);
          api.log(`CAM ${pad(st.dead + 1)}: no signal.`, true);
          Sound.staticBurst(0.4, 0.16);
          if (api.camIdx() === st.dead) api.refresh();
        }
        const here = api.camIdx() === st.dead && !api.offline();
        st.btn.hidden = !here;
        if (here && st.holding) st.hold += dt;
        else st.hold = Math.max(0, st.hold - dt * 2);
        st.btn.querySelector('.fill').style.width = Math.min(100, (st.hold / 3) * 100) + '%';
        if (st.hold >= 3) {
          api.markCam(st.dead, 'dead', false);
          api.log(`CAM ${pad(st.dead + 1)}: signal restored.`);
          st.dead = -1;
          st.hold = 0;
          st.holding = false;
          st.btn.hidden = true;
          st.next = api.elapsed() + rand(40, 75) * 1000;
          Sound.beep(660, 0.08, 0.06);
          api.refresh();
        }
      },
      feedDead: (st, i) => st.dead === i,
      stop(st) {
        st.btn.remove();
        document.removeEventListener('keydown', st.key);
        document.removeEventListener('keyup', st.key);
      },
    },
    {
      id: 'battery',
      name: 'Battery',
      description: 'Every camera switch costs power, and power only comes back slowly. Run out and every feed goes dark until the generator restarts. Switching a lot keeps the sensors cool, but drains you.',
      start(api) {
        const el = document.createElement('span');
        el.className = 'osd power';
        el.textContent = 'POWER 100%';
        api.hud.appendChild(el);
        return { power: 100, failed: false, el };
      },
      afterSwitch(st, api, changed) {
        if (changed && !st.failed) st.power -= 2.5;
      },
      tick(st, api, dt) {
        if (st.failed) {
          if (!api.offline()) { st.failed = false; st.power = 30; api.log('Generator restarted.'); }
        } else {
          st.power = Math.min(100, st.power + 0.35 * dt);
          if (st.power <= 0) {
            st.power = 0;
            st.failed = true;
            api.feedsDown('POWER FAILURE', 10000, false);
            api.log('Power failure.', true);
          }
        }
        st.el.textContent = `POWER ${Math.max(0, Math.round(st.power))}%`;
        st.el.classList.toggle('low', st.power < 20);
      },
      stop(st) { st.el.remove(); },
    },
    {
      id: 'filter',
      name: 'Camera filters',
      description: 'The cameras run in another mode: night vision, worn VHS tape or thermal. Details look different and some are harder to spot. Meant for harder shifts.',
      options: [{ key: 'mode', label: 'Filter', choices: [['random', 'Random each shift'], ['nightvision', 'Night vision'], ['vhs', 'VHS tape'], ['thermal', 'Thermal']] }],
      start(api, opts) {
        const names = { nightvision: 'night vision', vhs: 'VHS', thermal: 'thermal' };
        const keys = Object.keys(names);
        const f = keys.includes(opts.mode) ? opts.mode : keys[Math.floor(Math.random() * keys.length)];
        Monitor.configure({ filter: f });
        api.log(`Camera mode: ${names[f]}.`);
        return { f };
      },
    },
  ];

  const read = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } };
  const write = v => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

  function settings(id) {
    const def = DEFS.find(d => d.id === id);
    const s = read()[id] || {};
    const opts = {};
    for (const o of (def && def.options) || []) opts[o.key] = s[o.key] || o.choices[0][0];
    return { on: !!s.on, ...opts };
  }

  function set(id, patch) {
    const all = read();
    all[id] = { ...(all[id] || {}), ...patch };
    write(all);
  }

  const enabled = () => DEFS.filter(d => settings(d.id).on);

  // ----- running a night -----
  function start(api) {
    return enabled().map(def => {
      const opts = settings(def.id);
      const state = def.start ? def.start(api, opts) || {} : {};
      return { def, state };
    });
  }
  function call(active, hook, ...args) {
    for (const a of active || []) if (a.def[hook]) a.def[hook](a.state, ...args);
  }
  const any = (active, hook, ...args) => (active || []).some(a => a.def[hook] && a.def[hook](a.state, ...args));

  return { DEFS, settings, set, enabled, start, call, any };
})();
