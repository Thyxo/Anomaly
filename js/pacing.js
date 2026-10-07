// Pacing: how many anomalies a shift gets, how fast they approach, and which
// room each one starts in. Pure logic (no DOM) so tools/simulate.js can run it.
const Pacing = (() => {
  // n is the night number; endless mode passes a fractional level that grows.
  function params(n) {
    const k = Math.max(0, n - 1);
    return {
      rate: Math.min(4, 1.5 + k * 0.5),        // anomalies per real minute
      approach: Math.max(40, 90 - k * 12),         // seconds from spawn to your door, whatever the distance
      maxThreats: Math.min(4, 1 + Math.ceil(n / 2)),
      stareLimit: Math.max(15, 25 - k * 3),        // seconds on one camera before its sensor saturates
      weights: n < 2 ? { 1: 1, 2: 3, 3: 3, 4: 2 } : n < 3 ? { 1: 2, 2: 3, 3: 2, 4: 1 } : { 1: 4, 2: 3, 3: 2, 4: 1 },
      warnSeconds: Math.max(3, 6 - k),
      flakiness: 0.008 * k,                        // chance per second the current feed drops briefly
      monitor: {
        resolution: Math.max(320, Math.round((640 - k * 80) / 16) * 16),
        grain: Math.min(0.38, 0.12 + k * 0.05),
        glitch: Math.min(0.07, 0.012 + k * 0.012),
        flicker: Math.min(0.14, 0.05 + k * 0.02),
        color: Math.max(0.04, 0.22 - k * 0.045),
      },
    };
  }

  // Seconds per room step, so a far spawn does not block the night and a near
  // spawn still gives a fair chance.
  const stepSeconds = (P, distance) => Math.max(15, Math.min(50, P.approach / Math.max(1, distance)));

  // Seconds between spawns. A night spreads rate × length anomalies over the
  // time after the quiet start; endless simply follows the rate.
  function spawnGap(P, { endless = false, lengthMin = 7, graceSec = 30 } = {}) {
    if (endless) return 60 / P.rate;
    const target = Math.max(1, Math.round(P.rate * lengthMin));
    const active = Math.max(30, lengthMin * 60 - graceSec);
    return active / target;
  }

  // Chooses the spawn room. Never the same room twice in a row (with a single
  // camera that rule is skipped; otherwise the spawn just waits a moment).
  // Default: a shuffled bag, so every room gets a turn before any room
  // repeats. With `far`, rooms far from you are more likely.
  function picker(allIds, far = false) {
    let bag = [];
    let last = null;
    const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
    return function pick(candidates /* [{ id, dist }] */) {
      const pool = allIds.length > 1 ? candidates.filter(c => c.id !== last) : candidates;
      if (!pool.length) return null;
      let choice;
      if (far) {
        const w = pool.map(c => c.dist * c.dist);
        let r = Math.random() * w.reduce((s, v) => s + v, 0);
        choice = pool.find((c, i) => (r -= w[i]) < 0) || pool[pool.length - 1];
      } else {
        let inBag = pool.filter(c => bag.includes(c.id));
        if (!inBag.length) {
          bag = allIds.slice();
          inBag = pool.filter(c => bag.includes(c.id));
        }
        choice = rnd(inBag.length ? inBag : pool);
      }
      bag = bag.filter(id => id !== choice.id);
      last = choice.id;
      return choice;
    };
  }

  // Endless: difficulty 1–3 sets where the level starts and how fast it climbs.
  const ENDLESS = { 1: { start: 1, minutesPerLevel: 3 }, 2: { start: 2, minutesPerLevel: 2 }, 3: { start: 3, minutesPerLevel: 1.5 } };
  const endlessLevel = (difficulty, elapsedMs) => {
    const e = ENDLESS[difficulty] || ENDLESS[1];
    return e.start + elapsedMs / 60000 / e.minutesPerLevel;
  };

  return { params, stepSeconds, spawnGap, picker, endlessLevel };
})();
if (typeof module !== 'undefined') module.exports = Pacing;
