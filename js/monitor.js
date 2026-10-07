// The CCTV feed: degrades a photo into a low-res tinted frame, then animates
// grain, rolling bars, flicker, tape glitches and static on top of it.
const Monitor = (() => {
  let canvas, ctx, box, area;
  let frame = null;            // processed low-res frame for the current view
  let noise = [];              // pre-generated grain frames
  let raf = 0, last = 0;
  let staticUntil = 0, offline = false;
  const fx = { grain: 0.12, glitch: 0.01, flicker: 0.05, color: 0.2, resolution: 640, filter: 'none' };

  // Thermal palette: cold black/blue through purple and red to hot yellow-white.
  const THERMAL = (() => {
    const stops = [[0, [4, 4, 20]], [0.25, [42, 10, 107]], [0.45, [160, 18, 122]], [0.65, [240, 80, 42]], [0.82, [255, 194, 58]], [1, [255, 255, 224]]];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let j = 0;
      while (j < stops.length - 2 && v > stops[j + 1][0]) j++;
      const [a, ca] = stops[j], [b, cb] = stops[j + 1];
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = ca[c] + (cb[c] - ca[c]) * t;
    }
    return lut;
  })();

  function init(canvasEl, boxEl, areaEl) {
    canvas = canvasEl; box = boxEl; area = areaEl;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', layout);
  }

  function configure(opts) {
    const resChanged = opts.resolution && opts.resolution !== fx.resolution;
    Object.assign(fx, opts);
    if (resChanged) noise = [];
  }

  function makeNoise(w, h) {
    noise = [];
    for (let n = 0; n < 6; n++) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const id = g.createImageData(w, h);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.random() * 255;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      noise.push(c);
    }
  }

  // Turn any image/canvas into the CCTV frame. The default is green-grey; the
  // camera-filter add-on switches to night vision, VHS tape or thermal.
  function process(src) {
    const s = Img.size(src);
    const W = Math.min(fx.resolution, s.w, fx.filter === 'vhs' ? 352 : Infinity);
    const H = Math.round(W * s.h / s.w);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (fx.filter === 'thermal' && 'filter' in g) g.filter = 'blur(1.5px)';
    g.drawImage(src, 0, 0, W, H);
    g.filter = 'none';
    const id = g.getImageData(0, 0, W, H);
    const d = id.data, mix = fx.color;
    const src0 = fx.filter === 'vhs' ? new Uint8ClampedArray(d) : null;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      let l = 0.3 * r + 0.59 * gr + 0.11 * b;
      if (fx.filter === 'nightvision') {
        l = Math.min(255, l * 1.45 + 16);
        d[i] = l * 0.28; d[i + 1] = l; d[i + 2] = l * 0.34;
      } else if (fx.filter === 'thermal') {
        const k = Math.max(0, Math.min(255, (l - 20) * 1.25)) | 0;
        d[i] = THERMAL[k * 3]; d[i + 1] = THERMAL[k * 3 + 1]; d[i + 2] = THERMAL[k * 3 + 2];
      } else if (fx.filter === 'vhs') {
        // washed-out colour with red and blue bleeding sideways
        const x = (i / 4) % W;
        const rI = i + (x + 3 < W ? 12 : 0), bI = i - (x - 3 >= 0 ? 12 : 0);
        const lr = src0[rI], lb = src0[bI + 2];
        d[i] = Math.min(255, (lr * 0.6 + l * 0.4) * 0.92 + 18);
        d[i + 1] = (gr * 0.55 + l * 0.45) * 0.9 + 10;
        d[i + 2] = (lb * 0.6 + l * 0.4) * 0.85 + 14;
      } else {
        l = (l - 128) * 1.12 + 120;                  // a little contrast, slightly darker
        const tr = l * 0.84 + 6, tg = l * 0.98 + 12, tb = l * 0.88 + 8;
        d[i] = tr * (1 - mix) + r * mix;
        d[i + 1] = tg * (1 - mix) + gr * mix;
        d[i + 2] = tb * (1 - mix) + b * mix;
      }
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  function setSource(src) {
    frame = src ? process(src) : null;
    if (frame) {
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width; canvas.height = frame.height;
      }
      if (!noise.length || noise[0].width !== frame.width || noise[0].height !== frame.height) makeNoise(frame.width, frame.height);
    }
    layout();
  }

  // Fit the picture to the whole screen, keeping its aspect ratio (no cropping,
  // so nothing that must be reported can end up off-screen).
  function layout() {
    if (!area || !canvas.width) return;
    const aw = area.clientWidth, ah = area.clientHeight;
    if (aw <= 0 || ah <= 0) return;
    const r = canvas.width / canvas.height;
    let w = aw, h = aw / r;
    if (h > ah) { h = ah; w = ah * r; }
    box.style.width = Math.floor(w) + 'px';
    box.style.height = Math.floor(h) + 'px';
  }

  const staticFor = ms => { staticUntil = Math.max(staticUntil, performance.now() + ms); };
  const setOffline = on => { offline = on; };

  function draw(now) {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    const n = noise.length ? noise[(now / 60 | 0) % noise.length] : null;

    if (offline || !frame) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (n) { ctx.globalAlpha = 0.18; ctx.drawImage(n, 0, 0); ctx.globalAlpha = 1; }
      return;
    }
    if (now < staticUntil) {
      if (n) ctx.drawImage(n, 0, 0);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`;
        ctx.fillRect(0, Math.random() * H, W, Math.random() * H * 0.15);
      }
      return;
    }

    ctx.drawImage(frame, 0, 0);

    // tape glitch: a few horizontal slices pushed sideways
    if (Math.random() < fx.glitch) {
      const k = 1 + (Math.random() * 4 | 0);
      for (let i = 0; i < k; i++) {
        const y = Math.random() * H, h = 2 + Math.random() * H * 0.06, dx = (Math.random() - 0.5) * W * 0.08;
        ctx.drawImage(frame, 0, y, W, h, dx, y, W, h);
      }
    }

    // slow rolling hum bar
    const barH = H * 0.14;
    const by = ((now * 0.03) % (H + barH * 2)) - barH;
    const grad = ctx.createLinearGradient(0, by, 0, by + barH);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.035)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, by, W, barH);

    if (n) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(0.75, fx.grain * (fx.filter === 'nightvision' ? 1.8 : 1));
      ctx.drawImage(n, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // VHS: a ragged tracking band near the bottom of the tape
    if (fx.filter === 'vhs' && n) {
      const th = H * 0.05, ty = H - th - (Math.sin(now / 900) + 1) * H * 0.02;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(n, 0, ty, W, th, (Math.random() - 0.5) * 12, ty, W, th);
      ctx.globalAlpha = 1;
    }

    if (Math.random() < 0.3) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * fx.flicker})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / 24) return; // ~24 fps is plenty for CCTV
    last = now;
    draw(now);
  }

  const start = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  // Pointer position as 0..1 coordinates of the picture.
  function normalizedPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  }

  return { init, configure, process, setSource, layout, staticFor, setOffline, start, stop, normalizedPoint };
})();
