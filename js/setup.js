// House setup UI: rooms & photos, layout graph, anomaly sources (AI / manual / procedural).
const Setup = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const QUICK = ['Living room', 'Hallway', 'Kitchen', 'Bedroom', 'Bathroom', 'Office', 'Stairs', 'Entrance'];
  const house = () => App.house;

  // ---------- validation shared with the title screen ----------
  function validate(h = house()) {
    const problems = [];
    if (!h.rooms.length) problems.push('Add at least two rooms.');
    if (!h.playerRoom) problems.push('Mark which room you are sitting in.');
    const dist = Game.distances(h);
    const cams = h.rooms.filter(r => r.id !== h.playerRoom && r.photos.length && dist.get(r.id) < Infinity);
    if (h.playerRoom && !cams.length) problems.push('At least one room with a photo must connect to your room (see Layout).');
    for (const r of h.rooms) {
      if (r.id === h.playerRoom) continue;
      if (!r.photos.length) problems.push(`${r.name}: no photo (it will be skipped).`);
      else if (dist.get(r.id) === Infinity && h.playerRoom) problems.push(`${r.name}: not connected to your room (it will be skipped).`);
    }
    return { ok: !!h.playerRoom && cams.length > 0, problems, cams };
  }

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('#setup-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('#screen-setup .tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    render();
  }

  function render() {
    renderRooms();
    renderLayout();
    renderAnomalies();
    renderBegin();
  }

  // ---------- rooms ----------
  function addRoom(name) {
    const h = house();
    const room = { id: Img.uid('room'), name: name || `Room ${h.rooms.length + 1}`, photos: [] };
    const prev = h.rooms.filter(r => r.id !== h.playerRoom).slice(-1)[0];
    h.rooms.push(room);
    // Convenience: connect new rooms in a chain until the player edits the layout.
    if (prev && !h.layoutEdited) h.edges.push([prev.id, room.id]);
    App.save();
    render();
  }

  function deleteRoom(id) {
    const h = house();
    const room = h.rooms.find(r => r.id === id);
    if (!room || !confirm(`Delete ${room.name} and its photos?`)) return;
    room.photos.forEach(pid => { Store.deleteImage(pid); Img.forget(pid); });
    h.anomalies.filter(a => a.roomId === id).forEach(a => { Store.deleteImage(a.imageId); Img.forget(a.imageId); });
    h.anomalies = h.anomalies.filter(a => a.roomId !== id);
    h.rooms = h.rooms.filter(r => r.id !== id);
    h.edges = h.edges.filter(e => !e.includes(id));
    if (h.playerRoom === id) h.playerRoom = null;
    App.save();
    render();
  }

  async function addPhotos(room, files) {
    for (const f of files) {
      if (room.photos.length >= 2) { App.toast('Two photos per room is the maximum.'); break; }
      try {
        const blob = await Img.normalizeUpload(f);
        room.photos.push(await Img.save(blob, 'photo'));
      } catch (e) {
        App.toast('Could not read that image: ' + e.message);
      }
    }
    App.save();
    render();
  }

  function removePhoto(room, pid) {
    room.photos = room.photos.filter(p => p !== pid);
    house().anomalies.forEach(a => { if (a.photoId === pid) a.photoId = null; });
    Store.deleteImage(pid);
    Img.forget(pid);
    App.save();
    render();
  }

  async function thumb(imageId, label, onRemove) {
    const t = el('div', 'thumb');
    const img = await Img.get(imageId);
    if (img) t.style.backgroundImage = `url("${img.src}")`;
    if (label) t.appendChild(el('span', 'tag', label));
    if (onRemove) {
      const x = el('button', 'x', '×');
      x.title = 'Remove';
      x.onclick = e => { e.stopPropagation(); onRemove(); };
      t.appendChild(x);
    }
    return t;
  }

  function fileButton(label, capture, onFiles) {
    const l = el('label', 'btn small', label);
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.hidden = true;
    if (capture) inp.setAttribute('capture', 'environment');
    else inp.multiple = true;
    inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); inp.value = ''; };
    l.appendChild(inp);
    return l;
  }

  function renderRooms() {
    const h = house();
    const quick = $('quick-add');
    quick.innerHTML = '';
    QUICK.filter(n => !h.rooms.some(r => r.name.toLowerCase() === n.toLowerCase())).forEach(n => {
      const c = el('button', 'chip', '+ ' + n);
      c.onclick = () => addRoom(n);
      quick.appendChild(c);
    });

    const list = $('room-list');
    list.innerHTML = '';
    for (const room of h.rooms) {
      const card = el('div', 'room' + (room.id === h.playerRoom ? ' mine' : ''));
      const top = el('div', 'room-top');
      const name = document.createElement('input');
      name.type = 'text';
      name.value = room.name;
      name.maxLength = 24;
      name.onchange = () => { room.name = name.value.trim() || room.name; App.save(); render(); };
      const mine = el('label', 'check');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'player-room';
      radio.checked = room.id === h.playerRoom;
      radio.onchange = () => { h.playerRoom = room.id; App.save(); render(); };
      mine.append(radio, document.createTextNode('Your room'));
      const del = el('button', 'btn ghost small', 'Delete');
      del.onclick = () => deleteRoom(room.id);
      top.append(name, mine, del);
      card.appendChild(top);

      const photos = el('div', 'room-photos');
      card.appendChild(photos);
      room.photos.forEach((pid, i) => thumb(pid, `Photo ${i + 1}`, () => removePhoto(room, pid)).then(t => photos.appendChild(t)));

      if (room.photos.length < 2) {
        const btns = el('div', 'room-buttons');
        btns.append(fileButton('Take photo', true, f => addPhotos(room, f)), fileButton('Choose file', false, f => addPhotos(room, f)));
        card.appendChild(btns);
      }
      if (room.id === h.playerRoom) {
        card.appendChild(el('p', 'muted small', 'You sit here. It has no camera; its photo is used if something reaches you.'));
      }
      list.appendChild(card);
    }
  }

  // ---------- layout ----------
  const hasEdge = (h, a, b) => h.edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));

  function toggleEdge(a, b) {
    const h = house();
    if (hasEdge(h, a, b)) h.edges = h.edges.filter(e => !((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)));
    else h.edges.push([a, b]);
    h.layoutEdited = true;
    App.save();
    render();
  }

  function chain() {
    const h = house();
    const order = h.rooms.filter(r => r.id !== h.playerRoom);
    const mine = h.rooms.find(r => r.id === h.playerRoom);
    if (mine) order.push(mine);
    h.edges = [];
    for (let i = 1; i < order.length; i++) h.edges.push([order[i - 1].id, order[i].id]);
    h.layoutEdited = true;
    App.save();
    render();
  }

  function renderLayout() {
    const h = house();
    const list = $('layout-list');
    list.innerHTML = '';
    for (const room of h.rooms) {
      const row = el('div', 'layout-row');
      row.appendChild(el('b', '', room.name.toUpperCase() + (room.id === h.playerRoom ? ' (your room)' : '')));
      const chips = el('div', 'quick-add');
      for (const other of h.rooms) {
        if (other.id === room.id) continue;
        const c = el('button', 'chip' + (hasEdge(h, room.id, other.id) ? ' on' : ''), other.name);
        c.onclick = () => toggleEdge(room.id, other.id);
        chips.appendChild(c);
      }
      row.appendChild(chips);
      list.appendChild(row);
    }

    $('spawn-any').checked = h.spawnMode === 'any';
    const out = $('layout-paths');
    if (!h.playerRoom) { out.innerHTML = '<span class="warn">Mark your room on the Rooms tab first.</span>'; return; }
    const dist = Game.distances(h);
    const name = id => (h.rooms.find(r => r.id === id) || {}).name.toUpperCase();
    // Walk from each room toward yours to show the route an anomaly will take.
    const lines = h.rooms.filter(r => r.id !== h.playerRoom).sort((a, b) => dist.get(b.id) - dist.get(a.id)).map(r => {
      const d = dist.get(r.id);
      if (d === Infinity) return `! ${name(r.id)} — not connected`;
      const path = [r.id];
      let cur = r.id;
      while (dist.get(cur) > 0) {
        cur = h.edges.map(([a, b]) => (a === cur ? b : b === cur ? a : null)).find(n => n && dist.get(n) === dist.get(cur) - 1);
        path.push(cur);
      }
      return path.map(name).join(' → ') + `   (${d} step${d === 1 ? '' : 's'})`;
    });
    out.textContent = lines.join('\n') || 'Add more rooms.';
  }

  // ---------- anomalies ----------
  function renderAiFields() {
    const s = AI.settings();
    $('ai-provider').value = s.provider;
    $('ai-model').value = s.model || (s.provider !== 'none' ? AI.defaultModel(s.provider) : '');
    $('ai-model').disabled = $('ai-key').disabled = s.provider === 'none';
    $('ai-key').value = s.keyFromConfig ? '' : s.apiKey;
    $('ai-count').value = s.perRoom;
    $('ai-key-source').textContent = s.provider === 'none' ? 'AI generation is off. Manual and procedural anomalies still work.'
      : s.keyFromConfig ? 'Using the API key from config.js.'
      : s.apiKey ? 'Key kept for this tab only. It is forgotten when you close the tab.'
      : 'Paste your API key above. It is kept only until you close this tab (or put it in config.js on your own computer).';
    $('btn-calibrate').disabled = !AI.available();
  }

  function renderHelper() {
    const box = $('prompt-helper-list');
    if (box.childElementCount) return;
    for (const g of Prompts.helperList()) {
      const grp = el('div', 'prompt-group');
      grp.appendChild(el('h4', '', `${g.difficulty} · ${g.name}`));
      for (const text of g.prompts) {
        const item = el('div', 'prompt-item');
        const b = el('button', 'btn small', 'Copy');
        b.onclick = () => copy(text);
        item.append(el('p', '', text), b);
        grp.appendChild(item);
      }
      box.appendChild(grp);
    }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    App.toast('Prompt copied.');
  }

  let libraryRender = 0;
  async function renderLibrary() {
    const token = ++libraryRender;
    const h = house();
    const lib = $('library');
    lib.innerHTML = '';
    $('coop-hide').checked = !!h.coopHide;
    $('use-fallback').checked = h.useFallback !== false;
    if (!h.anomalies.length) { lib.appendChild(el('p', 'muted small', 'No prepared anomalies yet. Procedural ones will be used.')); return; }
    const roomName = id => (h.rooms.find(r => r.id === id) || { name: '?' }).name;
    if (h.coopHide) {
      const counts = {};
      h.anomalies.forEach(a => { counts[roomName(a.roomId)] = (counts[roomName(a.roomId)] || 0) + 1; });
      lib.appendChild(el('p', 'muted', 'Hidden for co-op. ' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')));
      return;
    }
    for (const a of h.anomalies) {
      const item = el('div', 'lib-item');
      const t = await thumb(a.imageId, a.description);
      if (token !== libraryRender) return; // a newer render took over
      t.title = 'Edit the marked area';
      t.onclick = () => editAnomaly(a);
      // show the click area on the thumbnail
      const r = el('div', 'editor-rect');
      Object.assign(r.style, { display: 'block', left: a.region.x * 100 + '%', top: a.region.y * 100 + '%', width: a.region.w * 100 + '%', height: a.region.h * 100 + '%' });
      t.appendChild(r);
      const meta = el('div', 'lib-meta');
      meta.appendChild(el('span', '', `${roomName(a.roomId)} · ${Prompts.DIFFICULTY[a.difficulty]} · ${a.source.toUpperCase()}${a.approx ? ' ~' : ''}`));
      const save = el('button', 'save', 'save');
      save.title = 'Download this image';
      save.onclick = () => Backup.downloadImage(a.imageId, `${a.source}-${Backup.slug(roomName(a.roomId))}-${Prompts.DIFFICULTY[a.difficulty].toLowerCase()}`);
      meta.appendChild(save);
      const del = el('button', '', 'delete');
      del.onclick = () => {
        h.anomalies = h.anomalies.filter(x => x !== a);
        Store.deleteImage(a.imageId);
        Img.forget(a.imageId);
        App.save();
        renderLibrary();
      };
      meta.appendChild(del);
      item.append(t, meta);
      lib.appendChild(item);
    }
  }

  function renderAnomalies() {
    renderAiFields();
    renderHelper();
    renderLibrary();
  }

  async function editAnomaly(a) {
    const img = await Img.get(a.imageId);
    const res = await Editor.open(house(), img, a);
    if (!res) return;
    Object.assign(a, res, { approx: false });
    App.save();
    renderLibrary();
  }

  async function uploadManual(files) {
    const h = house();
    if (!h.rooms.length) { App.toast('Add your rooms first.'); return; }
    for (const f of files) {
      let blob, img;
      try {
        blob = await Img.normalizeUpload(f);
        img = await Img.loadFromBlob(blob);
      } catch (e) { App.toast('Could not read that image.'); continue; }
      const res = await Editor.open(h, img);
      if (!res) { URL.revokeObjectURL(img.src); continue; }
      // Match the original photo's exact size so both views line up on the monitor.
      if (res.photoId) {
        const base = await Img.get(res.photoId);
        if (base) {
          const s = Img.size(base);
          blob = await Img.canvasToBlob(Img.toCanvas(img, s.w, s.h));
        }
      }
      URL.revokeObjectURL(img.src);
      const imageId = await Img.save(blob, 'anom');
      h.anomalies.push({ id: Img.uid('a'), source: 'manual', imageId, ...res });
      App.save();
    }
    renderLibrary();
    renderBegin();
  }

  // ---------- AI calibration (Mode A) ----------
  async function calibrate() {
    const h = house();
    const v = validate();
    if (!h.playerRoom) { App.toast('Mark your room first.'); return; }
    const rooms = v.cams;
    if (!rooms.length) { App.toast('No camera rooms with photos yet.'); return; }
    const per = Math.max(1, Math.min(6, AI.settings().perRoom));
    const total = rooms.length * per;
    App.go('calibrate');
    const logEl = $('calib-log'), bar = $('calib-bar'), done = $('btn-calib-done');
    logEl.textContent = '';
    bar.style.width = '0';
    done.disabled = true;
    const say = line => { logEl.textContent += line + '\n'; logEl.scrollTop = logEl.scrollHeight; };
    const s = AI.settings();
    say(`Provider: ${s.provider} · model: ${s.model}`);
    say(`Preparing ${total} anomalies across ${rooms.length} feeds.`);

    let n = 0, ok = 0, authFailures = 0;
    for (const [ri, room] of rooms.entries()) {
      // spread difficulties so every room gets a mix
      const diffs = [3, 1, 2, 4, 1, 3].slice(0, per).sort(() => Math.random() - 0.5);
      const used = new Set(h.anomalies.filter(a => a.roomId === room.id && a.template).map(a => a.template));
      for (let i = 0; i < per; i++) {
        n++;
        const label = `CAM ${String(ri + 1).padStart(2, '0')} ${room.name.toUpperCase()} [${n}/${total}]`;
        if (authFailures >= 2) { say(`${label} skipped.`); continue; }
        const photoId = room.photos[i % room.photos.length];
        try {
          const photoBlob = await Store.getImage(photoId);
          const photoImg = await Img.get(photoId);
          say(`${label} transmitting…`);
          const r = await AI.generate({ photoBlob, photoImg, roomName: room.name, difficulty: diffs[i], avoid: used });
          used.add(r.template);
          const imageId = await Img.save(r.blob, 'anom');
          h.anomalies.push({
            id: Img.uid('a'), source: 'ai', roomId: room.id, photoId, imageId,
            difficulty: diffs[i], description: r.description, region: r.region, approx: r.approx, template: r.template,
          });
          App.save();
          ok++;
          say(`${label} ok${r.approx ? ' (area approximate — check it in the library)' : ''}.`);
        } catch (e) {
          const msg = String(e.message || e);
          if (/HTTP 40[0134]/.test(msg)) authFailures++;
          say(`${label} failed: ${msg}`);
          say('  → a procedural anomaly will be used instead.');
        }
        bar.style.width = (n / total) * 100 + '%';
      }
    }
    say(`\nCalibration complete. ${ok}/${total} AI anomalies stored.`);
    if (ok) say('Tip: “Export house” on the Anomalies tab saves a copy you can import again later.');
    if (authFailures >= 2) say('Several requests were refused. Check the API key, model name and billing.');
    done.disabled = false;
  }

  // ---------- begin ----------
  function renderBegin() {
    const h = house();
    const v = validate();
    const yours = h.rooms.find(r => r.id === h.playerRoom);
    const by = src => h.anomalies.filter(a => a.source === src).length;
    const s = AI.settings();
    const lines = [
      `ROOMS ........ ${h.rooms.length}  (${v.cams.length} camera${v.cams.length === 1 ? '' : 's'})`,
      `YOUR ROOM .... ${yours ? yours.name.toUpperCase() : '—'}`,
      `PREPARED ..... ${h.anomalies.length}  (AI ${by('ai')}, manual ${by('manual')})`,
      `FALLBACK ..... ${h.useFallback !== false ? 'procedural on' : 'off'}`,
      `STARTS IN .... ${h.spawnMode === 'any' ? 'any room' : 'farthest room'}`,
      `AI ........... ${s.provider === 'none' ? 'off' : s.provider + (s.apiKey ? ' · key set' : ' · no key')}`,
    ];
    $('begin-summary').textContent = lines.join('\n') + (v.problems.length ? '\n\n' + v.problems.map(p => '! ' + p).join('\n') : '');
    $('btn-start-from-setup').disabled = !v.ok;
    $('night-select').value = App.night();
    $('night-length').value = App.nightLength();
    $('grace-seconds').value = App.graceSeconds();
  }

  // ---------- wiring ----------
  function bind() {
    document.querySelectorAll('#setup-tabs .tab').forEach(t => { t.onclick = () => showTab(t.dataset.tab); });
    $('btn-add-room').onclick = () => addRoom();
    $('btn-chain').onclick = chain;
    $('spawn-any').onchange = e => { house().spawnMode = e.target.checked ? 'any' : 'far'; App.save(); renderBegin(); };

    $('ai-provider').onchange = () => {
      const p = $('ai-provider').value;
      AI.saveSettings({ provider: p });
      renderAiFields();
      renderBegin();
    };
    $('ai-model').onchange = () => AI.saveSettings({ provider: $('ai-provider').value, model: $('ai-model').value.trim() });
    $('ai-key').onchange = () => { AI.saveSettings({ provider: $('ai-provider').value, apiKey: $('ai-key').value.trim() }); renderAiFields(); renderBegin(); };
    $('ai-count').onchange = () => AI.saveSettings({ perRoom: Number($('ai-count').value) || 2 });
    $('btn-calibrate').onclick = calibrate;
    $('btn-calib-done').onclick = () => { App.go('setup'); showTab('anomalies'); };

    $('manual-file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; uploadManual(f); };
    $('coop-hide').onchange = e => { house().coopHide = e.target.checked; App.save(); renderLibrary(); };
    $('use-fallback').onchange = e => { house().useFallback = e.target.checked; App.save(); renderBegin(); };

    $('night-select').onchange = e => App.setNight(Math.max(1, Number(e.target.value) || 1));
    $('night-length').onchange = e => App.setNightLength(Math.max(2, Math.min(20, Number(e.target.value) || 7)));
    $('grace-seconds').onchange = e => App.setGraceSeconds(Math.max(0, Math.min(300, Number(e.target.value) || 0)));

    $('btn-export').onclick = async () => {
      const h = house();
      if (!h.rooms.length) { App.toast('Nothing to export yet.'); return; }
      $('btn-export').disabled = true;
      try {
        const r = await Backup.exportHouse(h);
        App.toast(`Exported ${r.photos} photos and ${r.anomalies} anomalies.`);
      } catch (e) { App.toast('Export failed: ' + e.message); }
      $('btn-export').disabled = false;
    };
    $('import-file').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const imported = await Backup.importHouse(f, async summary =>
          !house().rooms.length || confirm(`Replace your current house with the imported one (${summary})?`));
        if (!imported) return;
        App.house = imported;
        await App.save();
        App.toast(`Imported ${imported.rooms.length} rooms and ${imported.anomalies.length} anomalies.`);
        render();
      } catch (err) { App.toast('Import failed: ' + err.message); }
    };
    $('btn-start-from-setup').onclick = () => App.startNight();
    $('btn-reset').onclick = async () => {
      if (!confirm('Erase all rooms, photos and anomalies from this browser?')) return;
      await App.reset();
      render();
    };
  }

  return { bind, render, showTab, validate };
})();
