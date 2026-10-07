// After-shift review: one card per anomaly that actually appeared during the
// shift (found, missed, or the one that got you). Anomalies that never
// appeared are never shown. Tap the picture to compare with the normal room;
// Next / swipe moves on; "Skip all" leaves at once.
const Review = (() => {
  const $ = id => document.getElementById(id);
  const TAGS = { found: 'FOUND', missed: 'MISSED', killer: 'GOT YOU' };
  let items = [], idx = 0, showBefore = false, done = null;

  function show(list, onDone) {
    items = list;
    idx = 0;
    done = onDone;
    if (!items.length) { finish(); return; }
    App.go('review');
    render();
  }

  function finish() {
    const cb = done;
    done = null;
    items = [];
    if (cb) cb();
  }

  function render() {
    const it = items[idx];
    showBefore = false;
    $('rv-count').textContent = `${idx + 1} / ${items.length}`;
    const tag = $('rv-tag');
    tag.textContent = TAGS[it.outcome] || it.outcome.toUpperCase();
    tag.className = 'rv-tag ' + it.outcome;
    $('rv-title').textContent = `${it.room.toUpperCase()} · ${it.at}`;
    $('rv-desc').textContent = it.description ? it.description.charAt(0).toUpperCase() + it.description.slice(1) : '';
    $('rv-next').textContent = idx === items.length - 1 ? 'Done' : 'Next';
    $('rv-prev').disabled = idx === 0;
    draw();
  }

  function draw() {
    const it = items[idx];
    const src = showBefore && it.before ? it.before : it.after;
    const c = $('rv-canvas');
    const s = Img.size(src);
    c.width = s.w; c.height = s.h;
    c.getContext('2d').drawImage(src, 0, 0, s.w, s.h);
    const r = it.region, ring = $('rv-ring');
    // a circle around the marked area, a little bigger than the area itself
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const rw = Math.max(r.w, 0.06) * 1.35, rh = Math.max(r.h, 0.06 * s.w / s.h) * 1.35;
    Object.assign(ring.style, { left: (cx - rw / 2) * 100 + '%', top: (cy - rh / 2) * 100 + '%', width: rw * 100 + '%', height: rh * 100 + '%' });
    ring.hidden = showBefore;
    $('rv-label').textContent = showBefore ? 'NORMAL' : 'ANOMALY';
  }

  const next = () => { if (idx < items.length - 1) { idx++; render(); } else finish(); };
  const prev = () => { if (idx > 0) { idx--; render(); } };
  const toggle = () => { if (items[idx] && items[idx].before) { showBefore = !showBefore; draw(); } };

  function bind() {
    $('rv-next').onclick = next;
    $('rv-prev').onclick = prev;
    $('rv-skip').onclick = finish;
    // tap = compare, swipe = next / previous
    const stage = $('rv-stage');
    let x0 = null;
    stage.addEventListener('pointerdown', e => { x0 = e.clientX; });
    stage.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 12) toggle();
      else if (dx < -50) next();
      else if (dx > 50) prev();
    });
    document.addEventListener('keydown', e => {
      if (!$('screen-review').classList.contains('active')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'Escape') finish();
    });
  }

  return { show, bind };
})();
