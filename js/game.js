// The shift loop: cameras, anomaly movement through the house graph, reporting,
// interference, add-on hooks, and the win/lose conditions.
const Game = (() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const SPEED = Math.max(0.1, Number(params.get('speed')) || 1);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const HIT_TOLERANCE = 0.035; // forgiving margin around the marked area
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

  let G = null;

  function weightedDifficulty(w) {
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (const [d, v] of Object.entries(w)) { if ((r -= v) < 0) return Number(d); }
    return 2;
  }

  // Shortest number of steps from every room to the player's room.
  function distances(house) {
    const dist = new Map(house.rooms.map(r => [r.id, Infinity]));
    if (!house.playerRoom) return dist;
    dist.set(house.playerRoom, 0);
    const q = [house.playerRoom];
    while (q.length) {
      const cur = q.shift();
      for (const [a, b] of house.edges) {
        const nb = a === cur ? b : b === cur ? a : null;
        if (nb && dist.get(nb) === Infinity) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
      }
    }
    return dist;
  }

  const neighbours = (house, id) => house.edges.filter(e => e.includes(id)).map(([a, b]) => (a === id ? b : a));
  // One camera per room: the room's first photo.
  const camPhoto = room => room.photos[0];

  // ---------- time ----------
  // A night maps its real length onto 00:00–06:00. Endless keeps the same pace
  // and simply carries on past 06:00.
  function clockParts(ms) {
    let s = Math.floor((ms / G.lengthMs) * 6 * 3600);
    if (G.mode !== 'endless') s = Math.min(6 * 3600, s);
    return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
  }
  const pad = n => String(n).padStart(2, '0');
  const clock = (ms = G.elapsed, secs = true) => { const [h, m, s] = clockParts(ms); return pad(h) + ':' + pad(m) + (secs ? ':' + pad(s) : ''); };

  function log(text, alert = false) {
    const el = $('log');
    const line = document.createElement('div');
    line.textContent = `${clock(G.elapsed, false)}  ${text}`;
    if (alert) line.className = 'alert';
    el.appendChild(line);
    while (el.children.length > 5) el.firstChild.remove();
  }

  let centerTimer = 0;
  function center(text, ms = 0) {
    const el = $('osd-center');
    clearTimeout(centerTimer);
    el.textContent = text;
    el.classList.toggle('show', !!text);
    if (text && ms) centerTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------- setup ----------
  // opts: { mode: 'night' | 'endless', night, difficulty (1–3), lengthMinutes, graceSeconds }
  async function start(house, opts, onEnd) {
    stop();
    const mode = opts.mode === 'endless' ? 'endless' : 'night';
    const night = Math.max(1, opts.night || 1);
    const difficulty = Math.min(3, Math.max(1, opts.difficulty || 1));
    const level = mode === 'endless' ? Pacing.endlessLevel(difficulty, 0) : night;
    const P = Pacing.params(level);
    const dist = distances(house);
    const cams = house.rooms.filter(r => r.id !== house.playerRoom && r.photos.length && dist.get(r.id) < Infinity);
    if (!cams.length) throw new Error('No camera rooms connected to your room.');
    const graceMs = Math.max(0, opts.graceSeconds ?? 30) * 1000;
    const lengthMs = Math.max(1, opts.lengthMinutes || 7) * 60 * 1000;

    G = {
      house, mode, night, difficulty, P, dist, cams, onEnd, graceMs, lengthMs,
      elapsed: 0, lastTick: performance.now(), paused: false, over: false,
      camIdx: 0,
      // Nothing appears during the quiet start, so the rooms can be learned first.
      threats: [], nextSpawn: 0,
      pickRoom: Pacing.picker(cams.map(r => r.id), !!house.spawnFar),
      stress: 0, lockUntil: 0, offlineUntil: 0, flakyUntil: 0,
      stareSince: 0, stareWarned: false,
      armed: false, busy: false, nextHint: 0, nextLevelCheck: 0,
      used: new Set(), stats: { cleared: 0, falseReports: 0, spawned: 0 },
      warnSilence: Addons.settings('warning').on,
      history: [], lastHour: 0, photos: new Map(), anomImgs: new Map(), addons: [],
    };
    G.nextSpawn = graceMs + rand(0, 0.3) * spawnGap() * 1000;

    // Preload everything so camera switches are instant.
    for (const r of house.rooms) for (const pid of r.photos) { const img = await Img.get(pid); if (img) G.photos.set(pid, img); }
    for (const a of house.anomalies) { const img = await Img.get(a.imageId); if (img) G.anomImgs.set(a.id, img); }

    Monitor.configure({ ...P.monitor, filter: 'none' });
    buildCamButtons();
    $('hud-night').textContent = mode === 'endless' ? `ENDLESS ${ROMAN[difficulty]}` : 'NIGHT ' + night;
    $('log').innerHTML = '';
    $('hud-addons').innerHTML = '';
    $('addon-actions').innerHTML = '';
    $('osd-date').textContent = new Date().toISOString().slice(0, 10);
    $('jumpscare').classList.remove('show');
    center('');
    log(mode === 'endless' ? `Shift started. Endless, difficulty ${difficulty}. ${cams.length} feeds online.` : `Shift started. Night ${night}. ${cams.length} feeds online.`);
    G.addons = Addons.start(addonApi());
    showView();
    Monitor.start();
    Sound.startAmbience();
    G.timer = setInterval(tick, 200);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stop() {
    if (!G) return;
    clearInterval(G.timer);
    document.removeEventListener('visibilitychange', onVisibility);
    Monitor.stop();
    Addons.call(G.addons, 'stop');
    G.addons = [];
    Monitor.configure({ filter: 'none' });
    G.over = true;
  }

  function onVisibility() {
    if (!G || G.over) return;
    G.paused = document.hidden;
    G.lastTick = performance.now();
    center(G.paused ? 'PAUSED' : '');
  }

  // What add-ons may see and do.
  function addonApi() {
    return {
      graceMs: G.graceMs,
      elapsed: () => G.elapsed,
      camIdx: () => G.camIdx,
      camCount: () => G.cams.length,
      offline: () => !!G.offlineUntil,
      log, center,
      refresh: () => { if (G && !G.over) showView(); },
      feedsDown: (msg, ms, raiseStress) => feedsDown(msg, ms, raiseStress),
      markCam: (i, cls, on) => { const b = $('cam-buttons').children[i]; if (b) b.classList.toggle(cls, on); },
      hud: $('hud-addons'),
      actions: $('addon-actions'),
    };
  }

  function buildCamButtons() {
    const wrap = $('cam-buttons');
    wrap.innerHTML = '';
    G.cams.forEach((room, i) => {
      const b = document.createElement('button');
      b.className = 'cam-btn';
      b.innerHTML = `CAM ${pad(i + 1)}<small></small>`;
      b.querySelector('small').textContent = room.name.toUpperCase();
      b.onclick = () => switchCam(i);
      wrap.appendChild(b);
    });
  }

  // ---------- views ----------
  const currentRoom = () => G.cams[G.camIdx];
  const threatIn = roomId => G.threats.find(t => t.roomId === roomId);
  const viewing = roomId => currentRoom().id === roomId;
  const camDead = i => Addons.any(G.addons, 'feedDead', i);
  // Is this room's picture on screen right now? (Nothing is while all feeds are
  // down, or while its camera is dead.)
  const isVisible = roomId => !G.offlineUntil && currentRoom().id === roomId && !camDead(G.camIdx);

  function showView() {
    const room = currentRoom();
    const t = threatIn(room.id);
    const src = t ? t.manif.src : G.photos.get(camPhoto(room));
    const dead = camDead(G.camIdx);
    const off = G.elapsed < G.offlineUntil || G.elapsed < G.flakyUntil || dead;
    Monitor.setOffline(off);
    Monitor.setSource(src);
    $('osd-status').textContent = dead && !G.offlineUntil ? 'NO SIGNAL' : '';
    [...$('cam-buttons').children].forEach((b, i) => b.classList.toggle('active', i === G.camIdx));
    if (dead && G.armed) disarm();
    updateOsd();
    drawDebug();
  }

  function updateOsd() {
    $('osd-cam').textContent = `CAM ${pad(G.camIdx + 1)} - ${currentRoom().name.toUpperCase()} - ${clock()}`;
  }

  function switchCam(i) {
    if (!G || G.over || i < 0 || i >= G.cams.length) return;
    disarm();
    const changed = i !== G.camIdx;
    G.camIdx = i;
    G.stareSince = G.elapsed;
    G.stareWarned = false;
    Sound.staticBurst(0.18, 0.12);
    Monitor.staticFor(200 + Math.random() * 150);
    Addons.call(G.addons, 'afterSwitch', addonApi(), changed);
    showView();
  }

  function drawDebug() {
    const layer = $('debug-layer');
    layer.innerHTML = '';
    if (!DEBUG) return;
    const t = threatIn(currentRoom().id);
    if (t) {
      const r = t.manif.region, d = document.createElement('div');
      d.className = 'dbg-rect';
      Object.assign(d.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
      layer.appendChild(d);
    }
  }

  // ---------- anomalies ----------
  // Rule: the picture on screen never changes while you look at it. Things only
  // appear, move or leave on feeds you are not watching (or while feeds are down).

  // Pick what the threat looks like in a room: a prepared anomaly (AI or manual)
  // if one is left, otherwise a procedural one. Null if the room is on screen.
  function manifest(roomId) {
    if (isVisible(roomId)) return null;
    const room = G.house.rooms.find(r => r.id === roomId);
    const photoId = camPhoto(room);
    const diff = weightedDifficulty(G.P.weights);
    const usable = a => a.roomId === roomId && G.anomImgs.has(a.id) && (!a.photoId || a.photoId === photoId || !room.photos.includes(a.photoId));
    let pool = G.house.anomalies.filter(a => usable(a) && !G.used.has(a.id));
    if (!pool.length && G.house.useFallback === false) pool = G.house.anomalies.filter(usable);
    if (pool.length) {
      const same = pool.filter(a => a.difficulty === diff);
      const a = pick(same.length ? same : pool);
      G.used.add(a.id);
      return { photoId, src: G.anomImgs.get(a.id), region: a.region, description: a.description, difficulty: a.difficulty, anomalyId: a.id };
    }
    const p = Procedural.generate(G.photos.get(photoId), diff);
    return { photoId, src: p.canvas, region: p.region, description: p.description, difficulty: diff, anomalyId: null };
  }

  // Remember every anomaly that actually appeared, for the after-shift review.
  function record(t) {
    const room = G.house.rooms.find(r => r.id === t.roomId);
    t.rec = {
      room: room.name, at: clock(G.elapsed, false), outcome: null,
      before: G.photos.get(t.manif.photoId), after: t.manif.src, region: t.manif.region, description: t.manif.description,
    };
    G.history.push(t.rec);
  }

  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

  function spawnGap() {
    return Pacing.spawnGap(G.P, { endless: G.mode === 'endless', lengthMin: G.lengthMs / 60000, graceSec: G.graceMs / 1000 });
  }

  // Spawn in a free room that is not on screen. The picker keeps it fair: a
  // shuffled bag of rooms, never the same room twice in a row.
  function spawn() {
    const free = G.cams.filter(r => !threatIn(r.id) && !isVisible(r.id)).map(r => ({ id: r.id, dist: G.dist.get(r.id) }));
    const choice = G.pickRoom(free);
    if (!choice) return false;
    const manif = manifest(choice.id);
    if (!manif) return false;
    const step = Pacing.stepSeconds(G.P, choice.dist);
    const t = {
      id: Img.uid('t'), roomId: choice.id, manif, step,
      nextMove: G.elapsed + step * 1000 * rand(0.95, 1.25), warned: false,
      unseenSince: G.elapsed, hintAfter: rand(55, 85) * 1000,
    };
    G.threats.push(t);
    record(t);
    G.stats.spawned++;
    // Sometimes, not always, you hear that something arrived.
    if (Math.random() < 0.35) hint();
    return true;
  }

  function hint() {
    if (G.elapsed < G.nextHint) return;
    G.nextHint = G.elapsed + 20000;
    setTimeout(() => G && !G.over && Sound.presence(0.45), rand(400, 2500));
  }

  function tryMove(t) {
    const d = G.dist.get(t.roomId);
    if (d <= 1) return enterYourRoom(t);
    // It will not vanish from a picture you are looking at.
    if (isVisible(t.roomId)) { t.nextMove += 2000; return; }
    const options = neighbours(G.house, t.roomId).filter(id => G.dist.get(id) === d - 1 && id !== G.house.playerRoom && !threatIn(id));
    for (const target of shuffle(options)) {
      const manif = manifest(target);
      if (!manif) continue; // you are watching that room; wait
      t.rec.outcome = 'missed';
      t.roomId = target;
      t.manif = manif;
      record(t);
      t.nextMove = G.elapsed + t.step * 1000 * rand(0.85, 1.15);
      Sound.thud(0.12 + 0.25 / G.dist.get(target), rand(-0.7, 0.7));
      return;
    }
    t.nextMove += 2000;
  }

  // Only with the "Warning silence" add-on: the hum dies before it reaches you.
  function updateSilence() {
    if (!G.warnSilence) return;
    Sound.silence(G.threats.some(t => t.warned));
  }

  // ---------- loop ----------
  function tick() {
    if (!G || G.over || G.paused) return;
    const now = performance.now();
    const dt = (now - G.lastTick) * SPEED;
    G.lastTick = now;
    G.elapsed += dt;

    if (G.mode === 'night' && G.elapsed >= G.lengthMs) return win();

    const [h] = clockParts(G.elapsed);
    if (h !== G.lastHour) { G.lastHour = h; log(`${pad(h)}:00.`); }

    // Endless: everything slowly gets worse.
    if (G.mode === 'endless' && G.elapsed >= G.nextLevelCheck) {
      G.nextLevelCheck = G.elapsed + 10000;
      G.P = Pacing.params(Pacing.endlessLevel(G.difficulty, G.elapsed));
      Monitor.configure(G.P.monitor);
    }

    const lastStretch = G.mode === 'night' && G.lengthMs - G.elapsed < 10000;
    if (G.elapsed >= G.nextSpawn && !lastStretch) {
      if (G.threats.length < G.P.maxThreats && spawn()) G.nextSpawn = G.elapsed + spawnGap() * 1000 * rand(0.8, 1.2);
      else G.nextSpawn = G.elapsed + 3000;
    }

    for (const t of [...G.threats]) {
      if (G.over) return;
      if (isVisible(t.roomId)) t.unseenSince = G.elapsed;
      else if (G.elapsed - t.unseenSince > t.hintAfter) {
        // It has been there a long time without you seeing it.
        t.unseenSince = G.elapsed;
        if (Math.random() < 0.6) hint();
      }
      if (!t.warned && G.dist.get(t.roomId) === 1 && G.elapsed >= t.nextMove - G.P.warnSeconds * 1000) {
        t.warned = true;
        updateSilence();
      }
      if (G.elapsed >= t.nextMove) tryMove(t);
    }
    if (G.over) return;

    Addons.call(G.addons, 'tick', addonApi(), dt / 1000);

    // occasional dropped feed on later nights
    if (G.elapsed > G.flakyUntil && G.elapsed > G.offlineUntil && Math.random() < G.P.flakiness * dt / 1000) {
      G.flakyUntil = G.elapsed + 1500 * SPEED;
      center('SIGNAL LOST', 1500);
      showView();
      setTimeout(() => G && !G.over && showView(), 1550);
    }
    if (G.offlineUntil && G.elapsed >= G.offlineUntil) {
      G.offlineUntil = 0;
      if (G.raiseStressOnDown) G.stress = 40;
      G.stareSince = G.elapsed;
      G.stareWarned = false;
      center('');
      log('Feeds restored.');
      showView();
    }

    // Watching one feed for too long saturates its sensor: interference climbs
    // until every feed drops, and while they are down things move freely.
    const staring = !G.offlineUntil && !camDead(G.camIdx) && G.elapsed - G.stareSince > G.P.stareLimit * 1000;
    if (staring) {
      if (!G.stareWarned) { G.stareWarned = true; log(`CAM ${pad(G.camIdx + 1)}: sensor saturating.`, true); }
      G.stress += (dt / 1000) * 6;
      if (G.stress >= 100) feedsDown();
    } else {
      G.stress = Math.max(0, G.stress - (dt / 1000) * 1.0);
    }
    Monitor.configure({ grain: G.P.monitor.grain + Math.min(100, G.stress) / 100 * 0.3 });
    $('hud-stress').style.width = Math.min(100, G.stress) + '%';
    updateOsd();
  }

  // ---------- reporting ----------
  function disarm() {
    if (!G) return;
    G.armed = false;
    $('hud').classList.remove('armed');
    $('monitor').classList.remove('armed');
    $('btn-report').classList.remove('armed');
  }

  function toggleReport() {
    if (!G || G.over || G.busy) return;
    if (G.offlineUntil || camDead(G.camIdx)) return;
    if (performance.now() < G.lockUntil) { center('CONSOLE LOCKED', 900); Sound.rejected(); return; }
    G.armed = !G.armed;
    $('monitor').classList.toggle('armed', G.armed);
    $('hud').classList.toggle('armed', G.armed);
    $('btn-report').classList.toggle('armed', G.armed);
    Sound.click();
  }

  function onMonitorClick(ev) {
    if (!G || !G.armed || G.busy || G.over) return;
    const p = Monitor.normalizedPoint(ev);
    if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
    disarm();
    G.busy = true;
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.style.left = p.x * 100 + '%';
    mark.style.top = p.y * 100 + '%';
    $('monitor').appendChild(mark);
    const roomId = currentRoom().id;
    center('TRANSMITTING REPORT…');
    Sound.click();
    setTimeout(() => {
      mark.remove();
      G.busy = false;
      if (G.over) return;
      const t = threatIn(roomId);
      const r = t ? t.manif.region : null;
      const hit = r && p.x >= r.x - HIT_TOLERANCE && p.x <= r.x + r.w + HIT_TOLERANCE && p.y >= r.y - HIT_TOLERANCE && p.y <= r.y + r.h + HIT_TOLERANCE;
      const room = G.house.rooms.find(x => x.id === roomId);
      if (hit) {
        G.threats = G.threats.filter(x => x !== t);
        t.rec.outcome = 'found';
        G.stats.cleared++;
        updateSilence();
        Sound.accepted();
        Monitor.staticFor(600);
        center('ANOMALY CLEARED', 1400);
        log(`Report accepted. ${room.name.toUpperCase()} cleared.`);
        if (viewing(roomId)) setTimeout(() => G && !G.over && showView(), 300);
      } else {
        G.stats.falseReports++;
        G.stress += 25;
        G.lockUntil = performance.now() + 6000;
        Sound.rejected();
        Monitor.staticFor(250);
        center('REPORT REJECTED\nNO ANOMALY AT MARKED POSITION', 1800);
        log('False report. Console locked.', true);
        if (G.stress >= 100) feedsDown();
      }
    }, 1500);
  }

  function feedsDown(msg = 'SIGNAL LOST\nALL FEEDS', ms = 12000, raiseStress = true) {
    G.offlineUntil = G.elapsed + ms * SPEED;
    G.raiseStressOnDown = raiseStress;
    if (raiseStress) G.stress = 100;
    disarm();
    Sound.staticBurst(1, 0.25);
    center(msg);
    if (raiseStress) log('Interference critical. All feeds lost.', true);
    showView();
  }

  // ---------- endings ----------
  // Close the record of the shift: whatever was still out there was missed.
  function history() {
    G.history.forEach(h => { if (!h.outcome) h.outcome = 'missed'; });
    return G.history;
  }

  function result(extra) {
    return {
      mode: G.mode, night: G.night, difficulty: G.difficulty, stats: G.stats,
      survivedMs: G.elapsed, clock: clock(G.elapsed, false), history: history(), ...extra,
    };
  }

  function enterYourRoom(t) {
    G.over = true;
    clearInterval(G.timer);
    disarm();
    t.rec.outcome = 'killer';
    const at = clock();
    // Without the warning add-on there is no build-up: the scare comes at once.
    const lead = G.warnSilence ? 1500 : 120;
    if (G.warnSilence) { Sound.silence(true, 0.15); Monitor.staticFor(1400); }
    center('');
    const house = G.house;
    const yours = house.rooms.find(r => r.id === house.playerRoom);

    const prepared = house.anomalies.filter(a => a.roomId === house.playerRoom && G.anomImgs.has(a.id));
    const base = prepared.length ? G.anomImgs.get(pick(prepared).id)
      : Procedural.intruder(yours && yours.photos.length ? G.photos.get(pick(yours.photos)) : null);
    const frame = Monitor.process(base);
    const res = result({ won: false, time: at, yourRoom: yours ? yours.name : 'your room' });
    const onEnd = G.onEnd;

    setTimeout(() => {
      const c = $('js-canvas');
      c.width = frame.width; c.height = frame.height;
      c.getContext('2d').drawImage(frame, 0, 0);
      const js = $('jumpscare');
      js.classList.add('show');
      Sound.scare();
      if (navigator.vibrate) { try { navigator.vibrate([120, 60, 260]); } catch { /* ignore */ } }
      let n = 0;
      const flick = setInterval(() => { js.style.opacity = n++ % 2 ? '1' : String(0.25 + Math.random() * 0.5); }, 70);
      setTimeout(() => {
        clearInterval(flick);
        js.classList.remove('show');
        js.style.opacity = '1';
        Sound.stop();
        stop();
        onEnd(res);
      }, 1700);
    }, lead);
  }

  function win() {
    G.over = true;
    clearInterval(G.timer);
    disarm();
    log('06:00. Shift complete.');
    center('06:00');
    Sound.stop();
    const onEnd = G.onEnd;
    const res = result({ won: true });
    setTimeout(() => { stop(); onEnd(res); }, 2500);
  }

  // ---------- fullscreen ----------
  const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fsSupported() && req && !document.fullscreenElement) {
      try { const p = req.call(el); if (p && p.then) p.then(lockLandscape, () => {}); } catch { /* not allowed here */ }
    } else lockLandscape();
  }
  // Only works in fullscreen on some phones (mostly Android); elsewhere the
  // portrait overlay asks the player to turn the phone.
  function lockLandscape() {
    try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch { /* unsupported */ }
  }
  function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) {
      try { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  const toggleFullscreen = () => ((document.fullscreenElement || document.webkitFullscreenElement) ? exitFullscreen() : enterFullscreen());

  // ---------- input ----------
  function bindInput() {
    $('btn-fullscreen').onclick = toggleFullscreen;
    $('btn-fullscreen').hidden = !fsSupported();
    $('btn-report').onclick = toggleReport;
    $('monitor').addEventListener('click', onMonitorClick);
    document.addEventListener('keydown', e => {
      if (!G || G.over || !$('screen-game').classList.contains('active')) return;
      if (e.key >= '1' && e.key <= '9') switchCam(Number(e.key) - 1);
      else if (e.key === 'r' || e.key === 'R') toggleReport();
      else if (e.key === 'Escape') disarm();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  }

  return { start, stop, bindInput, distances, enterFullscreen, exitFullscreen, debugState: () => G };
})();
