// Mode B editor: the player marks where the anomaly is on an uploaded image.
const Editor = (() => {
  const $ = id => document.getElementById(id);
  let state = null; // { house, img, rect, onSave, resolve }

  function show(rect) {
    const el = $('editor-rect');
    if (!rect) { el.style.display = 'none'; return; }
    Object.assign(el.style, {
      display: 'block', left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%',
    });
  }

  function fillRooms(selected) {
    const sel = $('ed-room');
    sel.innerHTML = '';
    for (const r of state.house.rooms) {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.name + (r.id === state.house.playerRoom ? ' (your room — shown if it reaches you)' : '');
      sel.appendChild(o);
    }
    if (selected) sel.value = selected;
  }

  function fillBases(selected) {
    const room = state.house.rooms.find(r => r.id === $('ed-room').value);
    const sel = $('ed-base');
    sel.innerHTML = '<option value="">None / not sure</option>';
    (room ? room.photos : []).forEach((pid, i) => {
      const o = document.createElement('option');
      o.value = pid;
      o.textContent = `Photo ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = selected && room && room.photos.includes(selected) ? selected : '';
    $('ed-auto').disabled = !sel.value;
  }

  function pointFrom(ev) {
    const r = $('editor-img').getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) };
  }

  function bind() {
    const stage = $('editor-stage');
    let start = null;
    stage.addEventListener('pointerdown', ev => {
      if (!state) return;
      stage.setPointerCapture(ev.pointerId);
      start = pointFrom(ev);
      state.rect = { x: start.x, y: start.y, w: 0, h: 0 };
      show(state.rect);
    });
    stage.addEventListener('pointermove', ev => {
      if (!state || !start) return;
      const p = pointFrom(ev);
      state.rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      show(state.rect);
    });
    const end = () => { start = null; };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    $('ed-room').onchange = () => fillBases('');
    $('ed-base').onchange = () => { $('ed-auto').disabled = !$('ed-base').value; };
    $('ed-auto').onclick = async () => {
      const base = await Img.get($('ed-base').value);
      if (!base) return;
      const d = Img.diffRegion(base, state.img);
      if (!d.region) { $('ed-status').textContent = 'No clear difference found. Draw the area by hand.'; return; }
      state.rect = d.region;
      show(state.rect);
      $('ed-status').textContent = d.reliable
        ? 'Suggested area from the difference. Adjust it if needed.'
        : 'The images differ in many places (the editor probably redrew the whole photo). This is a rough guess — please check it.';
    };
    $('ed-cancel').onclick = () => close(null);
    $('ed-save').onclick = () => {
      const r = state.rect;
      if (!r || r.w < 0.01 || r.h < 0.01) { $('ed-status').textContent = 'Drag a rectangle over the anomaly first.'; return; }
      close({
        roomId: $('ed-room').value,
        photoId: $('ed-base').value || null,
        difficulty: Number($('ed-diff').value),
        description: $('ed-desc').value.trim() || 'Manual anomaly',
        region: Img.clampRegion(r),
      });
    };
  }

  function close(result) {
    $('editor').hidden = true;
    const s = state;
    state = null;
    if (s) s.resolve(result);
  }

  // Opens the editor for an image element. Resolves with the details, or null.
  function open(house, img, existing = {}) {
    return new Promise(resolve => {
      state = { house, img, rect: existing.region || null, resolve };
      $('editor-img').src = img.src || img.toDataURL();
      fillRooms(existing.roomId || (house.rooms.find(r => r.id !== house.playerRoom) || house.rooms[0] || {}).id);
      fillBases(existing.photoId);
      $('ed-diff').value = String(existing.difficulty || 2);
      $('ed-desc').value = existing.description || '';
      $('ed-status').textContent = '';
      show(state.rect);
      $('editor').hidden = false;
    });
  }

  return { bind, open };
})();
