// Procedural anomalies drawn on a canvas. Used when no AI / manual anomaly is
// left for a room, or when AI generation fails. Every generator returns the
// exact area it changed, so reporting works the same as for other anomalies.
const Procedural = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const canFilter = (() => { try { return 'filter' in document.createElement('canvas').getContext('2d'); } catch { return false; } })();

  function blank(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Draw `layer` onto ctx softened by `px` pixels of blur.
  function softDraw(ctx, layer, px, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (canFilter && px > 0) {
      ctx.filter = `blur(${px}px)`;
      ctx.drawImage(layer, 0, 0);
    } else {
      const k = Math.max(1, px);
      ctx.globalAlpha = alpha / 5;
      for (const [dx, dy] of [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]]) ctx.drawImage(layer, dx, dy);
    }
    ctx.restore();
  }

  // Cut a rectangular patch with feathered (elliptical) edges.
  function featheredPatch(src, sx, sy, sw, sh, transform) {
    const p = blank(Math.round(sw), Math.round(sh));
    const g = p.getContext('2d');
    g.save();
    if (transform) transform(g, sw, sh);
    g.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    g.restore();
    g.globalCompositeOperation = 'destination-in';
    g.save();
    g.translate(sw / 2, sh / 2);
    g.scale(sw / 2, sh / 2);
    const grad = g.createRadialGradient(0, 0, 0.55, 0, 0, 1);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
    return p;
  }

  // Coarse luminance grid used to place figures in darker areas.
  function lumGrid(src, gw = 32, gh = 24) {
    const d = Img.toCanvas(src, gw, gh).getContext('2d').getImageData(0, 0, gw, gh).data;
    const L = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    return { L, gw, gh };
  }

  function darkColumn(src, minX = 0.08, maxX = 0.92) {
    const { L, gw, gh } = lumGrid(src);
    const cols = [];
    for (let x = Math.ceil(minX * gw); x < Math.floor(maxX * gw); x++) {
      let s = 0;
      for (let y = Math.floor(gh * 0.2); y < Math.floor(gh * 0.8); y++) s += L[y * gw + x];
      cols.push({ x: (x + 0.5) / gw, s });
    }
    cols.sort((a, b) => a.s - b.s);
    return pick(cols.slice(0, Math.max(1, Math.floor(cols.length * 0.3)))).x;
  }

  // Pick a patch position (pixels) that covers visible detail rather than a
  // blank wall or ceiling, so moved/duplicated/mirrored areas are noticeable.
  function busySpot(src, W, H, pw, ph, x0, x1, y0, y1) {
    const gw = 64, gh = 48;
    const { L } = lumGrid(src, gw, gh);
    const E = new Float32Array(gw * gh);
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      E[i] = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + gw] - L[i - gw]);
    }
    const cands = [];
    for (let k = 0; k < 40; k++) {
      const sx = rand(x0 * W, Math.max(x0 * W, x1 * W - pw));
      const sy = rand(y0 * H, Math.max(y0 * H, y1 * H - ph));
      let score = 0;
      const gx0 = Math.floor(sx / W * gw), gx1 = Math.ceil((sx + pw) / W * gw);
      const gy0 = Math.floor(sy / H * gh), gy1 = Math.ceil((sy + ph) / H * gh);
      for (let y = gy0; y < gy1 && y < gh; y++) for (let x = gx0; x < gx1 && x < gw; x++) score += E[y * gw + x];
      cands.push({ sx, sy, score });
    }
    cands.sort((a, b) => b.score - a.score);
    return pick(cands.slice(0, 3));
  }

  function region(x, y, w, h, W, H, pad = 0.02) {
    return Img.clampRegion({ x: x / W - pad, y: y / H - pad, w: w / W + pad * 2, h: h / H + pad * 2 });
  }

  // A human silhouette standing with feet at (cx, feetY) and the given height.
  function figureLayer(W, H, cx, feetY, h, color) {
    const layer = blank(W, H);
    const g = layer.getContext('2d');
    const w = h * 0.24, top = feetY - h, head = w * 0.36;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(cx, top + head, head * 0.9, head * 1.1, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - head * 0.45, top + head * 1.9);
    g.quadraticCurveTo(cx - w * 0.5, top + head * 2.3, cx - w * 0.55, top + h * 0.3);
    g.lineTo(cx - w * 0.5, top + h * 0.62);       // arm hanging
    g.lineTo(cx - w * 0.36, top + h * 0.62);
    g.lineTo(cx - w * 0.3, feetY);                // leg
    g.lineTo(cx - w * 0.04, feetY);
    g.lineTo(cx, top + h * 0.6);
    g.lineTo(cx + w * 0.04, feetY);
    g.lineTo(cx + w * 0.3, feetY);
    g.lineTo(cx + w * 0.36, top + h * 0.62);
    g.lineTo(cx + w * 0.5, top + h * 0.62);
    g.lineTo(cx + w * 0.55, top + h * 0.3);
    g.quadraticCurveTo(cx + w * 0.5, top + head * 2.3, cx + head * 0.45, top + head * 1.9);
    g.closePath();
    g.fill();
    return { layer, box: { x: cx - w * 0.6, y: top, w: w * 1.2, h } };
  }

  const GENERATORS = {
    // ---- 1 · subtle ----
    light(c, g, W, H) {
      const x = W * rand(0.15, 0.85), y = H * rand(0.15, 0.55), r = W * rand(0.08, 0.14);
      g.save();
      g.globalCompositeOperation = 'screen';
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,225,170,0.85)');
      grad.addColorStop(0.25, 'rgba(255,200,140,0.35)');
      grad.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
      return { region: region(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, W, H), description: 'A light is on that should be off.' };
    },
    shift(c, g, W, H) {
      const pw = W * rand(0.14, 0.22), ph = H * rand(0.18, 0.3);
      const { sx, sy } = busySpot(c, W, H, pw, ph, 0.1, 0.9, 0.3, 0.95);
      const dx = (Math.random() < 0.5 ? -1 : 1) * W * rand(0.04, 0.07);
      const patch = featheredPatch(c, sx, sy, pw, ph);
      g.drawImage(patch, Math.max(0, Math.min(W - pw, sx + dx)), sy);
      return { region: region(Math.min(sx, sx + dx), sy, pw + Math.abs(dx), ph, W, H), description: 'Something has moved.' };
    },
    // ---- 2 · strange ----
    clone(c, g, W, H) {
      const pw = W * rand(0.12, 0.2), ph = H * rand(0.16, 0.26);
      const { sx, sy } = busySpot(c, W, H, pw, ph, 0.05, 0.95, 0.25, 0.95);
      let tx = sx + (sx < W / 2 ? 1 : -1) * pw * rand(1.1, 1.8);
      tx = Math.max(0, Math.min(W - pw, tx));
      const ty = Math.max(0, Math.min(H - ph, sy + H * rand(-0.04, 0.04)));
      g.drawImage(featheredPatch(c, sx, sy, pw, ph), tx, ty);
      return { region: region(tx, ty, pw, ph, W, H), description: 'Something has been duplicated.' };
    },
    mirror(c, g, W, H) {
      const pw = W * rand(0.16, 0.26), ph = H * rand(0.2, 0.32);
      const { sx, sy } = busySpot(c, W, H, pw, ph, 0.05, 0.95, 0.1, 0.85);
      g.drawImage(featheredPatch(c, sx, sy, pw, ph, (pg, w) => { pg.translate(w, 0); pg.scale(-1, 1); }), sx, sy);
      return { region: region(sx, sy, pw, ph, W, H), description: 'Part of the room is mirrored.' };
    },
    tilt(c, g, W, H) {
      const pw = W * rand(0.16, 0.24), ph = H * rand(0.18, 0.28);
      const { sx, sy } = busySpot(c, W, H, pw, ph, 0.05, 0.95, 0.15, 0.75);
      const a = (Math.random() < 0.5 ? -1 : 1) * rand(0.14, 0.24);
      g.drawImage(featheredPatch(c, sx, sy, pw, ph, (pg, w, h) => { pg.translate(w / 2, h / 2); pg.rotate(a); pg.translate(-w / 2, -h / 2); }), sx, sy);
      return { region: region(sx, sy, pw, ph, W, H), description: 'Something hangs crooked.' };
    },
    // ---- 3 · creepy ----
    figure(c, g, W, H, src) {
      const cx = W * darkColumn(src), feet = H * rand(0.62, 0.82), h = H * rand(0.36, 0.5);
      const f = figureLayer(W, H, cx, feet, h, 'rgb(6,6,8)');
      softDraw(g, f.layer, Math.max(1.5, h * 0.012), rand(0.5, 0.68));
      return { region: region(f.box.x, f.box.y, f.box.w, f.box.h, W, H), description: 'A figure is standing in the dark.' };
    },
    shadow(c, g, W, H) {
      const x = W * rand(0.2, 0.8), y = H * rand(0.72, 0.9), len = H * rand(0.25, 0.4), ang = rand(-0.9, -0.3) * (Math.random() < 0.5 ? 1 : -1);
      const layer = blank(W, H);
      const lg = layer.getContext('2d');
      lg.translate(x, y);
      lg.rotate(ang);
      lg.fillStyle = 'rgb(0,0,0)';
      lg.beginPath();
      lg.ellipse(0, -len / 2, len * 0.09, len / 2, 0, 0, Math.PI * 2);
      lg.fill();
      lg.beginPath();
      lg.arc(0, -len * 1.02, len * 0.08, 0, Math.PI * 2);
      lg.fill();
      g.save();
      g.globalCompositeOperation = 'multiply';
      softDraw(g, layer, Math.max(3, len * 0.04), 0.55);
      g.restore();
      const bx = x + Math.sin(ang) * len * 1.1;
      const by = y - Math.cos(ang) * len * 1.1;
      return { region: region(Math.min(x, bx) - len * 0.1, Math.min(y, by) - len * 0.1, Math.abs(bx - x) + len * 0.2, Math.abs(by - y) + len * 0.2, W, H), description: 'A shadow with nothing to cast it.' };
    },
    face(c, g, W, H, src) {
      const cx = W * darkColumn(src, 0.12, 0.88), cy = H * rand(0.25, 0.5), fw = W * rand(0.035, 0.05), fh = fw * 1.35;
      const layer = blank(W, H);
      const lg = layer.getContext('2d');
      lg.fillStyle = 'rgb(205,205,198)';
      lg.beginPath(); lg.ellipse(cx, cy, fw / 2, fh / 2, 0, 0, Math.PI * 2); lg.fill();
      lg.fillStyle = 'rgb(10,10,12)';
      for (const s of [-1, 1]) { lg.beginPath(); lg.ellipse(cx + s * fw * 0.2, cy - fh * 0.06, fw * 0.11, fh * 0.07, 0, 0, Math.PI * 2); lg.fill(); }
      lg.beginPath(); lg.ellipse(cx, cy + fh * 0.25, fw * 0.12, fh * 0.035, 0, 0, Math.PI * 2); lg.fill();
      softDraw(g, layer, Math.max(1, fw * 0.04), rand(0.32, 0.45));
      return { region: region(cx - fw, cy - fh, fw * 2, fh * 2, W, H), description: 'A face where there should be none.' };
    },
    // ---- 4 · severe ----
    footprints(c, g, W, H) {
      const n = 6 + Math.floor(Math.random() * 4);
      const x0 = W * rand(0.1, 0.9), y0 = H * rand(0.62, 0.72);
      const x1 = W * rand(0.25, 0.75), y1 = H * 0.98;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const layer = blank(W, H);
      const lg = layer.getContext('2d');
      lg.fillStyle = 'rgb(18,10,8)';
      let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const s = 0.6 + t * 0.8; // perspective: larger near the camera
        const side = i % 2 ? 1 : -1;
        const px = x0 + (x1 - x0) * t + Math.cos(ang + Math.PI / 2) * side * W * 0.012 * s;
        const py = y0 + (y1 - y0) * t + Math.sin(ang + Math.PI / 2) * side * W * 0.012 * s;
        const fl = W * 0.026 * s, fw = fl * 0.38;
        lg.save();
        lg.translate(px, py);
        lg.rotate(ang - Math.PI / 2);
        lg.beginPath(); lg.ellipse(0, -fl * 0.15, fw, fl * 0.55, 0, 0, Math.PI * 2); lg.fill();
        lg.beginPath(); lg.ellipse(0, fl * 0.55, fw * 0.75, fl * 0.3, 0, 0, Math.PI * 2); lg.fill();
        lg.restore();
        bx0 = Math.min(bx0, px - fl); by0 = Math.min(by0, py - fl); bx1 = Math.max(bx1, px + fl); by1 = Math.max(by1, py + fl);
      }
      g.save();
      g.globalCompositeOperation = 'multiply';
      softDraw(g, layer, 1.2, 0.75);
      g.restore();
      return { region: region(bx0, by0, bx1 - bx0, by1 - by0, W, H), description: 'Wet footprints on the floor.' };
    },
    standing(c, g, W, H, src) {
      const cx = W * darkColumn(src, 0.15, 0.85), feet = H * rand(0.82, 0.95), h = H * rand(0.55, 0.7);
      const f = figureLayer(W, H, cx, feet, h, 'rgb(12,12,14)');
      softDraw(g, f.layer, Math.max(1, h * 0.006), 0.86);
      return { region: region(f.box.x, f.box.y, f.box.w, f.box.h, W, H), description: 'A person is standing in the room.' };
    },
    scratches(c, g, W, H) {
      const x = W * rand(0.15, 0.75), y = H * rand(0.2, 0.4), len = H * rand(0.2, 0.32), sp = W * 0.012;
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.strokeStyle = 'rgba(25,18,15,0.8)';
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        g.lineWidth = Math.max(1.5, W * 0.0035);
        g.beginPath();
        g.moveTo(x + i * sp, y);
        g.quadraticCurveTo(x + i * sp + sp * 1.5, y + len / 2, x + i * sp + sp * 0.5, y + len);
        g.stroke();
      }
      g.restore();
      return { region: region(x - sp, y - sp, sp * 7, len + sp * 2, W, H), description: 'Scratch marks on the wall.' };
    },
  };

  const BY_DIFFICULTY = { 1: ['light', 'shift'], 2: ['clone', 'mirror', 'tilt'], 3: ['figure', 'shadow', 'face'], 4: ['footprints', 'standing', 'scratches'] };

  // Returns { canvas, region, description, kind } for the given base image.
  function generate(src, difficulty, kind) {
    const c = Img.toCanvas(src);
    const orig = Img.toCanvas(src);
    const g = c.getContext('2d');
    const k = kind || pick(BY_DIFFICULTY[difficulty] || BY_DIFFICULTY[2]);
    const out = GENERATORS[k](orig, g, c.width, c.height, src);
    return { canvas: c, region: out.region, description: out.description, kind: k };
  }

  // A close, dark figure filling the frame — used when something reaches your room.
  function intruder(src, W = 960, H = 720) {
    const c = blank(W, H);
    const g = c.getContext('2d');
    if (src) {
      const s = Img.size(src);
      const k = Math.max(W / s.w, H / s.h);
      g.drawImage(src, (W - s.w * k) / 2, (H - s.h * k) / 2, s.w * k, s.h * k);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, W, H);
    } else {
      g.fillStyle = '#0a0c0b';
      g.fillRect(0, 0, W, H);
    }
    const f = figureLayer(W, H, W * rand(0.42, 0.58), H * 1.6, H * 1.42, 'rgb(3,3,4)');
    softDraw(g, f.layer, 4, 0.94);
    return c;
  }

  return { generate, intruder, BY_DIFFICULTY };
})();
