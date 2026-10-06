// The night loop: cameras, anomaly movement through the house graph, reporting,
// interference, and the win/lose conditions.
const Game = (() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const SPEED = Math.max(0.1, Number(params.get('speed')) || 1);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const HIT_TOLERANCE = 0.035; // forgiving margin around the marked area

  let G = null;

  // Difficulty curve: more, subtler, faster anomalies and a worse picture each night.
  function nightParams(n) {
    const k = n - 1;
    return {
      stareLimit: Math.max(15, 25 - k * 3), // seconds on one camera before its sensor saturates
      spawnEvery: Math.max(30, 75 - k * 10),
      moveEvery: Math.max(20, 55 - k * 7),
      maxThreats: Math.min(4, 1 + Math.floor(n / 2)),
      weights: n === 1 ? { 1: 1, 2: 3, 3: 3, 4: 2 } : n === 2 ? { 1: 2, 2: 3, 3: 2, 4: 1 } : { 1: 4, 2: 3, 3: 2, 4: 1 },
      warnSeconds: Math.max(3, 6 - k),
      flakiness: 0.008 * k,             // chance per second the current feed drops briefly
      monitor: {
        resolution: Math.max(320, 640 - k * 80),
        grain: Math.min(0.38, 0.12 + k * 0.05),
        glitch: Math.min(0.07, 0.012 + k * 0.012),
        flicker: Math.min(0.14, 0.05 + k * 0.02),
        color: Math.max(0.04, 0.22 - k * 0.045),
      },
    };
  }

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

  // ---------- time ----------
  function clockParts(ms) {
    const s = Math.min(6 * 3600, Math.floor((ms / G.lengthMs) * 6 * 3600));
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
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
  async function start(house, night, lengthMinutes, onEnd, graceSeconds = 30) {
    stop();
    const P = nightParams(night);
    const dist = distances(house);
    const cams = house.rooms.filter(r => r.id !== house.playerRoom && r.photos.length && dist.get(r.id) < Infinity);
    if (!cams.length) throw new Error('No camera rooms connected to your room.');

    G = {
      house, night, P, dist, cams, onEnd,
      lengthMs: lengthMinutes * 60 * 1000,
      elapsed: 0, lastTick: performance.now(), paused: false, over: false,
      camIdx: 0, viewIdx: 0,
      // Nothing appears during the grace period, so the rooms can be learned first.
      threats: [], nextSpawn: (graceSeconds + rand(0, 12)) * 1000,
      stress: 0, lockUntil: 0, offlineUntil: 0, flakyUntil: 0,
      stareSince: 0, stareWarned: false,
      armed: false, busy: false,
      used: new Set(), stats: { cleared: 0, falseReports: 0, spawned: 0 },
      lastHour: 0, photos: new Map(), anomImgs: new Map(),
    };

    // Preload everything so camera switches are instant.
    for (const r of house.rooms) for (const pid of r.photos) { const img = await Img.get(pid); if (img) G.photos.set(pid, img); }
    for (const a of house.anomalies) { const img = await Img.get(a.imageId); if (img) G.anomImgs.set(a.id, img); }

    Monitor.configure(P.monitor);
    buildCamButtons();
    $('hud-night').textContent = 'NIGHT ' + night;
    $('log').innerHTML = '';
    $('osd-date').textContent = new Date().toISOString().slice(0, 10);
    $('jumpscare').classList.remove('show');
    center('');
    showView();
    Monitor.start();
    Sound.startAmbience();
    log(`Shift started. Night ${night}. ${cams.length} feeds online.`);
    const first = G.photos.get(cams[0].photos[0]);
    if (first && innerHeight > innerWidth && Img.size(first).w > Img.size(first).h) App.toast('Turn your phone sideways for a bigger picture.');
    G.timer = setInterval(tick, 200);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stop() {
    if (!G) return;
    clearInterval(G.timer);
    document.removeEventListener('visibilitychange', onVisibility);
    Monitor.stop();
    G.over = true;
  }

  function onVisibility() {
    if (!G || G.over) return;
    G.paused = document.hidden;
    G.lastTick = performance.now();
    center(G.paused ? 'PAUSED' : '');
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
  const currentPhotoId = () => currentRoom().photos[G.viewIdx] || currentRoom().photos[0];
  const threatIn = roomId => G.threats.find(t => t.roomId === roomId);
  const viewing = roomId => currentRoom().id === roomId;
  // Is this exact picture on screen right now? (Nothing is, while all feeds are down.)
  const isVisible = (roomId, photoId) => !G.offlineUntil && currentRoom().id === roomId && currentPhotoId() === photoId;

  function showView() {
    const room = currentRoom();
    const pid = currentPhotoId();
    const t = threatIn(room.id);
    const src = t && t.manif.photoId === pid ? t.manif.src : G.photos.get(pid);
    const off = G.elapsed < G.offlineUntil || G.elapsed < G.flakyUntil;
    Monitor.setOffline(off);
    Monitor.setSource(src);
    [...$('cam-buttons').children].forEach((b, i) => b.classList.toggle('active', i === G.camIdx));
    $('osd-view').textContent = room.photos.length > 1 ? `VIEW ${G.viewIdx + 1}/${room.photos.length}` : '';
    $('btn-view').disabled = room.photos.length < 2;
    updateOsd();
    drawDebug();
  }

  function updateOsd() {
    $('osd-cam').textContent = `CAM ${pad(G.camIdx + 1)} - ${currentRoom().name.toUpperCase()} - ${clock()}`;
  }

  function switchCam(i) {
    if (!G || G.over || i < 0 || i >= G.cams.length) return;
    disarm();
    if (i !== G.camIdx) { G.camIdx = i; G.viewIdx = 0; }
    else if (currentRoom().photos.length > 1) G.viewIdx = (G.viewIdx + 1) % currentRoom().photos.length;
    G.stareSince = G.elapsed;
    G.stareWarned = false;
    Sound.staticBurst(0.18, 0.12);
    Monitor.staticFor(200 + Math.random() * 150);
    showView();
  }

  function switchView() {
    if (!G || G.over) return;
    const n = currentRoom().photos.length;
    if (n < 2) return;
    disarm();
    G.viewIdx = (G.viewIdx + 1) % n;
    G.stareSince = G.elapsed;
    G.stareWarned = false;
    Sound.staticBurst(0.12, 0.08);
    Monitor.staticFor(150);
    showView();
  }

  function drawDebug() {
    const layer = $('debug-layer');
    layer.innerHTML = '';
    if (!DEBUG) return;
    const t = threatIn(currentRoom().id);
    if (t && t.manif.photoId === currentPhotoId()) {
      const r = t.manif.region, d = document.createElement('div');
      d.className = 'dbg-rect';
      Object.assign(d.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
      layer.appendChild(d);
    }
  }

  // ---------- anomalies ----------
  // Rule: the picture on screen never changes while you look at it. Things only
  // appear, move or leave on feeds you are not watching (or while all feeds are down).

  // Pick what the threat looks like in a room: a prepared anomaly (AI or manual)
  // if one is left, otherwise a procedural one. Returns null if every angle of
  // the room is on screen right now.
  function manifest(roomId) {
    const room = G.house.rooms.find(r => r.id === roomId);
    const hidden = room.photos.filter(pid => !isVisible(roomId, pid));
    if (!hidden.length) return null;
    const diff = weightedDifficulty(G.P.weights);
    const photoOf = a => (a.photoId && room.photos.includes(a.photoId) ? a.photoId : room.photos[0]);
    const usable = a => a.roomId === roomId && G.anomImgs.has(a.id) && hidden.includes(photoOf(a));
    let pool = G.house.anomalies.filter(a => usable(a) && !G.used.has(a.id));
    if (!pool.length && G.house.useFallback === false) pool = G.house.anomalies.filter(usable);
    if (pool.length) {
      const same = pool.filter(a => a.difficulty === diff);
      const a = pick(same.length ? same : pool);
      G.used.add(a.id);
      return { photoId: photoOf(a), src: G.anomImgs.get(a.id), region: a.region, description: a.description, difficulty: a.difficulty, anomalyId: a.id };
    }
    const photoId = pick(hidden);
    const p = Procedural.generate(G.photos.get(photoId), diff);
    return { photoId, src: p.canvas, region: p.region, description: p.description, difficulty: diff, anomalyId: null };
  }

  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

  // Spawn in the farthest free room that is not on screen.
  function spawn() {
    const free = G.cams.filter(r => !threatIn(r.id));
    const order = shuffle(free).sort((x, y) => G.dist.get(y.id) - G.dist.get(x.id));
    for (const room of order) {
      const manif = manifest(room.id);
      if (!manif) continue;
      G.threats.push({
        id: Img.uid('t'), roomId: room.id, manif,
        nextMove: G.elapsed + G.P.moveEvery * 1000 * rand(0.95, 1.25), warned: false,
      });
      G.stats.spawned++;
      return true;
    }
    return false;
  }

  function tryMove(t) {
    const d = G.dist.get(t.roomId);
    if (d <= 1) return enterYourRoom(t);
    // It will not vanish from a picture you are looking at.
    if (isVisible(t.roomId, t.manif.photoId)) { t.nextMove += 2000; return; }
    const options = neighbours(G.house, t.roomId).filter(id => G.dist.get(id) === d - 1 && id !== G.house.playerRoom && !threatIn(id));
    for (const target of shuffle(options)) {
      const manif = manifest(target);
      if (!manif) continue; // you are watching that room; wait
      t.roomId = target;
      t.manif = manif;
      t.nextMove = G.elapsed + G.P.moveEvery * 1000 * rand(0.85, 1.15);
      Sound.thud(0.12 + 0.25 / G.dist.get(target), rand(-0.7, 0.7));
      return;
    }
    t.nextMove += 2000;
  }

  function updateSilence() {
    Sound.silence(G.threats.some(t => t.warned));
  }

  // ---------- loop ----------
  function tick() {
    if (!G || G.over || G.paused) return;
    const now = performance.now();
    const dt = (now - G.lastTick) * SPEED;
    G.lastTick = now;
    G.elapsed += dt;

    if (G.elapsed >= G.lengthMs) return win();

    const [h] = clockParts(G.elapsed);
    if (h !== G.lastHour) { G.lastHour = h; log(`${pad(h)}:00.`); }

    if (G.elapsed >= G.nextSpawn) {
      if (G.threats.length < G.P.maxThreats && spawn()) G.nextSpawn = G.elapsed + G.P.spawnEvery * 1000 * rand(0.8, 1.2);
      else G.nextSpawn = G.elapsed + 5000;
    }

    for (const t of [...G.threats]) {
      if (G.over) return;
      if (!t.warned && G.dist.get(t.roomId) === 1 && G.elapsed >= t.nextMove - G.P.warnSeconds * 1000) {
        t.warned = true;
        updateSilence();
      }
      if (G.elapsed >= t.nextMove) tryMove(t);
    }
    if (G.over) return;

    // occasional dropped feed on later nights
    if (G.elapsed > G.flakyUntil && G.elapsed > G.offlineUntil && Math.random() < G.P.flakiness * dt / 1000) {
      G.flakyUntil = G.elapsed + 1500 * SPEED;
      center('SIGNAL LOST', 1500);
      showView();
      setTimeout(() => G && !G.over && showView(), 1550);
    }
    if (G.offlineUntil && G.elapsed >= G.offlineUntil) {
      G.offlineUntil = 0;
      G.stress = 40;
      G.stareSince = G.elapsed;
      G.stareWarned = false;
      center('');
      log('Feeds restored.');
      showView();
    }

    // Watching one feed for too long saturates its sensor: interference climbs
    // until every feed drops, and while they are down things move freely.
    const staring = !G.offlineUntil && G.elapsed - G.stareSince > G.P.stareLimit * 1000;
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
    if (G.offlineUntil) return;
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
    const roomId = currentRoom().id, pid = currentPhotoId();
    center('TRANSMITTING REPORT…');
    Sound.click();
    setTimeout(() => {
      mark.remove();
      G.busy = false;
      if (G.over) return;
      const t = threatIn(roomId);
      const r = t && t.manif.photoId === pid ? t.manif.region : null;
      const hit = r && p.x >= r.x - HIT_TOLERANCE && p.x <= r.x + r.w + HIT_TOLERANCE && p.y >= r.y - HIT_TOLERANCE && p.y <= r.y + r.h + HIT_TOLERANCE;
      const room = G.house.rooms.find(x => x.id === roomId);
      if (hit) {
        G.threats = G.threats.filter(x => x !== t);
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

  function feedsDown() {
    G.offlineUntil = G.elapsed + 12000 * SPEED;
    G.stress = 100;
    disarm();
    Sound.staticBurst(1, 0.25);
    center('SIGNAL LOST\nALL FEEDS');
    log('Interference critical. All feeds lost.', true);
    showView();
  }

  // ---------- endings ----------
  function enterYourRoom(t) {
    G.over = true;
    clearInterval(G.timer);
    disarm();
    const at = clock();
    Sound.silence(true, 0.15);
    Monitor.staticFor(1400);
    center('');
    const house = G.house, stats = G.stats, night = G.night;
    const yours = house.rooms.find(r => r.id === house.playerRoom);

    const prepared = house.anomalies.filter(a => a.roomId === house.playerRoom && G.anomImgs.has(a.id));
    const base = prepared.length ? G.anomImgs.get(pick(prepared).id)
      : Procedural.intruder(yours && yours.photos.length ? G.photos.get(pick(yours.photos)) : null);
    const frame = Monitor.process(base);

    setTimeout(() => {
      const c = $('js-canvas');
      c.width = frame.width; c.height = frame.height;
      c.getContext('2d').drawImage(frame, 0, 0);
      const js = $('jumpscare');
      js.classList.add('show');
      Sound.scare();
      let n = 0;
      const flick = setInterval(() => { js.style.opacity = n++ % 2 ? '1' : String(0.25 + Math.random() * 0.5); }, 70);
      setTimeout(() => {
        clearInterval(flick);
        js.classList.remove('show');
        js.style.opacity = '1';
        Sound.stop();
        Monitor.stop();
        G.onEnd({ won: false, night, time: at, stats, yourRoom: yours ? yours.name : 'your room' });
      }, 1700);
    }, 1500);
  }

  function win() {
    G.over = true;
    clearInterval(G.timer);
    disarm();
    log('06:00. Shift complete.');
    center('06:00');
    Sound.stop();
    const { night, stats, onEnd } = G;
    setTimeout(() => { Monitor.stop(); onEnd({ won: true, night, stats }); }, 2500);
  }

  // ---------- fullscreen ----------
  const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fsSupported() && req && !document.fullscreenElement) {
      try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ }
    }
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
    $('btn-view').onclick = switchView;
    $('monitor').addEventListener('click', onMonitorClick);
    document.addEventListener('keydown', e => {
      if (!G || G.over || !$('screen-game').classList.contains('active')) return;
      if (e.key >= '1' && e.key <= '9') switchCam(Number(e.key) - 1);
      else if (e.key === 'r' || e.key === 'R') toggleReport();
      else if (e.key === 'v' || e.key === 'V') switchView();
      else if (e.key === 'Escape') disarm();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  }

  return { start, stop, bindInput, distances, nightParams, enterFullscreen, exitFullscreen, debugState: () => G };
})();
