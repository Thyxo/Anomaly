// Image helpers: loading, resizing, encoding, and before/after difference detection.
const Img = (() => {
  const cache = new Map(); // imageId -> HTMLImageElement

  const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function loadFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve(img); // keep the object URL alive: the element is reused for drawing
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
      img.src = url;
    });
  }

  async function get(id) {
    if (cache.has(id)) return cache.get(id);
    const blob = await Store.getImage(id);
    if (!blob) return null;
    const img = await loadFromBlob(blob);
    cache.set(id, img);
    return img;
  }

  function forget(id) {
    const img = cache.get(id);
    if (img) URL.revokeObjectURL(img.src);
    cache.delete(id);
  }

  function size(src) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }

  function toCanvas(src, w, h) {
    const s = size(src);
    const c = document.createElement('canvas');
    c.width = w || s.w;
    c.height = h || s.h;
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality));
  }

  // Downscale a user photo so storage and API calls stay small. CCTV is low-res anyway.
  async function normalizeUpload(file, maxDim = 1280) {
    const img = await loadFromBlob(file);
    const s = size(img);
    const k = Math.min(1, maxDim / Math.max(s.w, s.h));
    const c = toCanvas(img, Math.round(s.w * k), Math.round(s.h * k));
    URL.revokeObjectURL(img.src);
    return canvasToBlob(c);
  }

  // Store a blob under a new id and return the id.
  async function save(blob, prefix = 'img') {
    const id = uid(prefix);
    await Store.putImage(id, blob);
    return id;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, type = 'image/png') {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }

  // Compare an original and an edited image and return the normalized bounding
  // box ({x,y,w,h} in 0..1) of the most significant change. AI editors redraw the
  // whole picture slightly, so we blur, threshold relative to the overall noise,
  // and keep the strongest connected blob.
  function diffRegion(original, edited) {
    const so = size(original);
    const W = 128;
    const H = Math.max(8, Math.round(W * so.h / so.w));
    const a = toCanvas(original, W, H).getContext('2d').getImageData(0, 0, W, H).data;
    const b = toCanvas(edited, W, H).getContext('2d').getImageData(0, 0, W, H).data;

    const raw = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      raw[i] = (Math.abs(a[j] - b[j]) + Math.abs(a[j + 1] - b[j + 1]) + Math.abs(a[j + 2] - b[j + 2])) / 3;
    }
    // 3x3 box blur to suppress pixel-level resampling noise
    const d = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += raw[yy * W + xx]; n++; }
      }
      d[y * W + x] = s / n;
    }

    const sorted = Array.from(d).sort((p, q) => p - q);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const threshold = Math.max(20, median * 3, p90 * 1.15);

    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (d[i] > threshold) mask[i] = 1;

    // connected components (4-neighbour)
    const label = new Int32Array(W * H).fill(-1);
    const comps = [];
    const stack = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || label[i] !== -1) continue;
      const c = { score: 0, n: 0, x0: W, y0: H, x1: 0, y1: 0 };
      label[i] = comps.length;
      stack.push(i);
      while (stack.length) {
        const k = stack.pop();
        const x = k % W, y = (k / W) | 0;
        c.score += d[k]; c.n++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        const nb = [x > 0 && k - 1, x < W - 1 && k + 1, y > 0 && k - W, y < H - 1 && k + W];
        for (const m of nb) if (m !== false && mask[m] && label[m] === -1) { label[m] = comps.length; stack.push(m); }
      }
      comps.push(c);
    }
    if (!comps.length) return { region: null, reliable: false, coverage: 0 };

    comps.sort((p, q) => q.score - p.score);
    const best = { ...comps[0] };
    const total = comps.reduce((s, c) => s + c.score, 0);
    // absorb strong nearby blobs (an edit is often split by edges)
    const near = Math.max(W, H) * 0.08;
    for (const c of comps.slice(1)) {
      if (c.score < best.score * 0.25) continue;
      if (c.x0 > best.x1 + near || c.x1 < best.x0 - near || c.y0 > best.y1 + near || c.y1 < best.y0 - near) continue;
      best.x0 = Math.min(best.x0, c.x0); best.y0 = Math.min(best.y0, c.y0);
      best.x1 = Math.max(best.x1, c.x1); best.y1 = Math.max(best.y1, c.y1);
      best.score += c.score;
    }

    const pad = 0.03;
    let x = best.x0 / W - pad, y = best.y0 / H - pad;
    let w = (best.x1 - best.x0 + 1) / W + pad * 2, h = (best.y1 - best.y0 + 1) / H + pad * 2;
    const region = clampRegion({ x, y, w: Math.max(w, 0.06), h: Math.max(h, 0.06) });
    const coverage = mask.reduce((s, v) => s + v, 0) / (W * H);
    const share = best.score / total;
    const reliable = best.n >= 4 && region.w * region.h < 0.45 && (share > 0.35 || coverage < 0.05);
    return { region, reliable, coverage };
  }

  function clampRegion(r) {
    const x = Math.max(0, Math.min(1, r.x));
    const y = Math.max(0, Math.min(1, r.y));
    return { x, y, w: Math.max(0.01, Math.min(1 - x, r.w)), h: Math.max(0.01, Math.min(1 - y, r.h)) };
  }

  return { uid, loadFromBlob, get, forget, size, toCanvas, canvasToBlob, normalizeUpload, save, blobToBase64, base64ToBlob, diffRegion, clampRegion };
})();
