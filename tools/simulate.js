// Quick pacing check without a browser:  node tools/simulate.js [minutes] [runs]
// Plays many nights with a simple simulated guard (cycles the cameras every few
// seconds, sometimes notices what is on screen) and prints how many anomalies
// appear, where they start, and how often a room repeats.
const Pacing = require('../js/pacing.js');

const LAYOUTS = {
  'chain of 4 (demo)': { rooms: ['Hallway', 'Kitchen', 'Living', 'Bedroom'], edges: [[0, 1], [1, 2], [2, 3]], player: 3 },
  'house of 7 (hub)': {
    rooms: ['Entrance', 'Hallway', 'Kitchen', 'Living', 'Bathroom', 'Office', 'Bedroom'],
    edges: [[0, 1], [1, 2], [1, 3], [1, 4], [3, 5], [1, 6]], player: 6,
  },
};

function distances(L) {
  const dist = L.rooms.map(() => Infinity);
  dist[L.player] = 0;
  const q = [L.player];
  while (q.length) {
    const c = q.shift();
    for (const [a, b] of L.edges) {
      const nb = a === c ? b : b === c ? a : -1;
      if (nb >= 0 && dist[nb] === Infinity) { dist[nb] = dist[c] + 1; q.push(nb); }
    }
  }
  return dist;
}

const rand = (a, b) => a + Math.random() * (b - a);

function night(L, n, { lengthMin, graceSec, far }) {
  const P = Pacing.params(n);
  const dist = distances(L);
  const cams = L.rooms.map((_, i) => i).filter(i => i !== L.player);
  const nb = id => L.edges.filter(e => e.includes(id)).map(([a, b]) => (a === id ? b : a));
  const pick = Pacing.picker(cams, far);
  const gap = Pacing.spawnGap(P, { lengthMin, graceSec });
  const end = lengthMin * 60;
  let t = 0, cam = cams[0], nextSwitch = rand(3, 8), nextSpawn = graceSec + rand(0, 0.3) * gap;
  const threats = [], spawns = [];
  const dt = 0.2;
  while (t < end) {
    t += dt;
    if (t >= nextSwitch) { cam = cams[(cams.indexOf(cam) + 1) % cams.length]; nextSwitch = t + rand(3, 6); }
    if (t >= nextSpawn && end - t > 10) {
      const cands = cams.filter(r => r !== cam && !threats.some(x => x.room === r)).map(id => ({ id, dist: dist[id] }));
      const c = threats.length < P.maxThreats ? pick(cands) : null;
      if (c) {
        const step = Pacing.stepSeconds(P, c.dist);
        threats.push({ room: c.id, step, next: t + step * rand(0.95, 1.25) });
        spawns.push(c.id);
        nextSpawn = t + gap * rand(0.8, 1.2);
      } else nextSpawn = t + 3;
    }
    for (const th of [...threats]) {
      if (t < th.next) continue;
      if (dist[th.room] <= 1) return { spawns, died: true, at: t };
      if (th.room === cam) { th.next += 2; continue; }
      const opts = nb(th.room).filter(id => dist[id] === dist[th.room] - 1 && id !== L.player && id !== cam && !threats.some(x => x.room === id));
      if (opts.length) { th.room = opts[0]; th.next = t + th.step * rand(0.85, 1.15); } else th.next += 2;
    }
    const seen = threats.find(x => x.room === cam);
    if (seen && Math.random() < 0.15 * dt) threats.splice(threats.indexOf(seen), 1);
  }
  return { spawns, died: false };
}

const lengthMin = Number(process.argv[2]) || 4;
const runs = Number(process.argv[3]) || 400;
for (const [name, L] of Object.entries(LAYOUTS)) {
  for (const far of [false, true]) {
    console.log(`\n${name} · ${lengthMin} min nights · start: ${far ? 'mostly far' : 'any room (bag)'}`);
    for (const n of [1, 2, 3, 5]) {
      let total = 0, deaths = 0, repeats = 0, pairs = 0;
      const perRoom = {};
      for (let i = 0; i < runs; i++) {
        const r = night(L, n, { lengthMin, graceSec: 30, far });
        total += r.spawns.length;
        if (r.died) deaths++;
        r.spawns.forEach((id, j) => {
          perRoom[L.rooms[id]] = (perRoom[L.rooms[id]] || 0) + 1;
          if (j) { pairs++; if (r.spawns[j - 1] === id) repeats++; }
        });
      }
      const share = Object.entries(perRoom).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(', ');
      console.log(`  night ${n}: ${(total / runs).toFixed(1)} per night · lost ${Math.round((deaths / runs) * 100)}% · same room twice in a row ${pairs ? Math.round((repeats / pairs) * 100) : 0}%\n    ${share}`);
    }
  }
}
