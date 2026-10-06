// Export / import a whole house as a .zip: photos, prepared anomalies (AI and
// manual) as plain image files, plus a manifest with layout and click areas.
// Lets AI images be reused after a reset, on another device, or for co-op.
const Backup = (() => {
  const FORMAT = 'anomaly-house';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '') || 'room';
  const pad = n => String(n).padStart(2, '0');

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportHouse(house) {
    const files = [];
    const names = new Set();
    const unique = base => { let n = base, i = 2; while (names.has(n)) n = base.replace(/(\.\w+)$/, `-${i++}$1`); names.add(n); return n; };
    const add = async (imageId, path) => {
      const blob = await Store.getImage(imageId);
      if (!blob) return null;
      const name = unique(`${path}.${EXT[blob.type] || 'jpg'}`);
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      return name;
    };

    const roomName = id => (house.rooms.find(r => r.id === id) || { name: 'room' }).name;
    const photoFile = new Map();
    const rooms = [];
    for (const r of house.rooms) {
      const photos = [];
      for (const [i, pid] of r.photos.entries()) {
        const f = await add(pid, `photos/${slug(r.name)}-${i + 1}`);
        if (f) { photos.push(f); photoFile.set(pid, f); }
      }
      rooms.push({ id: r.id, name: r.name, photos });
    }
    const anomalies = [];
    const counters = {};
    for (const a of house.anomalies) {
      const key = `${a.source}-${slug(roomName(a.roomId))}-${(Prompts.DIFFICULTY[a.difficulty] || 'x').toLowerCase()}`;
      counters[key] = (counters[key] || 0) + 1;
      const f = await add(a.imageId, `anomalies/${key}-${pad(counters[key])}`);
      if (!f) continue;
      anomalies.push({
        source: a.source, roomId: a.roomId, photo: a.photoId ? photoFile.get(a.photoId) || null : null, image: f,
        difficulty: a.difficulty, description: a.description, region: a.region, approx: !!a.approx, template: a.template || null,
      });
    }
    const manifest = {
      format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
      rooms, edges: house.edges, playerRoom: house.playerRoom, useFallback: house.useFallback !== false, coopHide: !!house.coopHide,
      anomalies,
    };
    files.unshift({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const stamp = new Date().toISOString().slice(0, 10);
    download(Zip.build(files), `anomaly-house-${stamp}.zip`);
    return { photos: photoFile.size, anomalies: anomalies.length };
  }

  function readManifest(entries) {
    const mf = entries.get('manifest.json');
    if (!mf) throw new Error('No manifest.json in this file');
    const m = JSON.parse(new TextDecoder().decode(mf));
    if (m.format !== FORMAT) throw new Error('This is not an Anomaly house export');
    return m;
  }

  async function storeHouse(m, entries) {
    const save = async name => {
      const data = entries.get(name);
      if (!data) return null;
      const type = TYPE[name.split('.').pop().toLowerCase()] || 'image/jpeg';
      return Img.save(new Blob([data], { type }), name.startsWith('photos/') ? 'photo' : 'anom');
    };
    const photoId = new Map();
    const rooms = [];
    for (const r of m.rooms) {
      const photos = [];
      for (const f of r.photos) {
        const id = await save(f);
        if (id) { photos.push(id); photoId.set(f, id); }
      }
      rooms.push({ id: r.id, name: r.name, photos });
    }
    const anomalies = [];
    for (const a of m.anomalies || []) {
      const imageId = await save(a.image);
      if (!imageId || !rooms.some(r => r.id === a.roomId)) continue;
      anomalies.push({
        id: Img.uid('a'), source: a.source || 'manual', roomId: a.roomId, photoId: a.photo ? photoId.get(a.photo) || null : null,
        imageId, difficulty: Number(a.difficulty) || 2, description: a.description || '', region: Img.clampRegion(a.region),
        approx: !!a.approx, template: a.template || undefined,
      });
    }
    const ids = new Set(rooms.map(r => r.id));
    return {
      rooms,
      edges: (m.edges || []).filter(([a, b]) => ids.has(a) && ids.has(b)),
      playerRoom: ids.has(m.playerRoom) ? m.playerRoom : null,
      anomalies, useFallback: m.useFallback !== false, coopHide: !!m.coopHide, layoutEdited: true,
    };
  }

  async function importHouse(file, confirmReplace) {
    const entries = await Zip.read(file);
    const m = readManifest(entries);
    const summary = `${m.rooms.length} rooms, ${(m.anomalies || []).length} anomalies`;
    if (!(await confirmReplace(summary))) return null;
    await Store.clear();
    return storeHouse(m, entries);
  }

  async function downloadImage(imageId, filename) {
    const blob = await Store.getImage(imageId);
    if (blob) download(blob, `${filename}.${EXT[blob.type] || 'jpg'}`);
  }

  return { exportHouse, importHouse, downloadImage, slug };
})();
