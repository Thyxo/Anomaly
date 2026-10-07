// A drawn demo house so the game can be tried without taking photos.
const Demo = (() => {
  const W = 1024, H = 768;
  const BX0 = 270, BY0 = 170, BX1 = 754, BY1 = 520; // back wall

  function poly(g, pts, fill) {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }

  function shell(g, wall, floor, ceil) {
    poly(g, [[0, 0], [W, 0], [BX1, BY0], [BX0, BY0]], ceil);
    poly(g, [[0, 0], [BX0, BY0], [BX0, BY1], [0, H]], shade(wall, -18));
    poly(g, [[W, 0], [BX1, BY0], [BX1, BY1], [W, H]], shade(wall, -10));
    poly(g, [[BX0, BY0], [BX1, BY0], [BX1, BY1], [BX0, BY1]], wall);
    poly(g, [[0, H], [BX0, BY1], [BX1, BY1], [W, H]], floor);
    // floor boards
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      g.beginPath();
      g.moveTo(BX0 + (BX1 - BX0) * t, BY1);
      g.lineTo(W * t, H);
      g.stroke();
    }
  }

  function shade(hex, d) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, v + d));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  const rect = (g, x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x, y, w, h); };

  function door(g, x, open) {
    rect(g, x - 6, 300, 112, 222, '#2a2520');
    rect(g, x, 306, 100, 216, open ? '#0b0a09' : '#5b4a3a');
    if (!open) rect(g, x + 80, 410, 8, 8, '#b9a27a');
  }
  function windowAt(g, x, y, w, h) {
    rect(g, x - 6, y - 6, w + 12, h + 12, '#d8d2c4');
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#0b1424'); grad.addColorStop(1, '#1b2638');
    rect(g, x, y, w, h, grad);
    rect(g, x + w / 2 - 3, y, 6, h, '#d8d2c4');
  }
  function frame(g, x, y, w, h, inner) {
    rect(g, x, y, w, h, '#3b2f25');
    rect(g, x + 6, y + 6, w - 12, h - 12, inner);
  }
  function lampGlow(g, x, y) {
    const grad = g.createRadialGradient(x, y, 0, x, y, 180);
    grad.addColorStop(0, 'rgba(255,214,150,0.45)'); grad.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = grad;
    g.fillRect(x - 180, y - 180, 360, 360);
  }

  function finish(g) {
    // dim everything a bit, add vignette and sensor noise
    const v = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 700);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    const id = g.getImageData(0, 0, W, H);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
    }
    g.putImageData(id, 0, 0);
  }

  const ROOMS = {
    Hallway(g) {
      shell(g, '#8a8476', '#5a4634', '#55534d');
      door(g, 330, false);
      door(g, 600, true);
      frame(g, 470, 250, 90, 70, '#6d7f73');
      rect(g, 60, 520, 120, 150, '#3a2e24');  // shoe cabinet
      rect(g, 70, 500, 30, 22, '#5c2f2a');   // shoes
      rect(g, 900, 80, 6, 260, '#2b2b2b');    // coat rack
      rect(g, 880, 160, 46, 150, '#40362f');
    },
    Kitchen(g) {
      shell(g, '#a39e8c', '#4a4440', '#66645c');
      rect(g, BX0, 380, BX1 - BX0, 140, '#d3cfc4');            // cabinets
      for (let x = BX0 + 10; x < BX1 - 60; x += 80) rect(g, x, 395, 70, 110, '#bfbab0');
      rect(g, BX0, 370, BX1 - BX0, 14, '#3d3934');            // counter
      rect(g, BX0 + 20, 220, 160, 90, '#cbc6ba');              // wall cupboard
      rect(g, BX0 + 260, 220, 160, 90, '#cbc6ba');
      windowAt(g, 820, 160, 120, 180);
      rect(g, 420, 600, 220, 16, '#5b4636');                   // table
      rect(g, 430, 616, 12, 120, '#3e2f24'); rect(g, 618, 616, 12, 120, '#3e2f24');
      rect(g, 340, 560, 70, 12, '#4d3a2c'); rect(g, 340, 500, 12, 70, '#4d3a2c'); // chair
      rect(g, 500, 586, 26, 16, '#e6e2d8');                    // cup
    },
    'Living room'(g) {
      shell(g, '#6f7468', '#4b3a2c', '#4c4f48');
      windowAt(g, 340, 210, 140, 160);
      frame(g, 560, 240, 120, 80, '#7a6a52');
      rect(g, 300, 450, 380, 110, '#3b4a52');                  // sofa
      rect(g, 300, 410, 380, 50, '#34434a');
      rect(g, 290, 430, 30, 130, '#2f3c42'); rect(g, 660, 430, 30, 130, '#2f3c42');
      rect(g, 420, 600, 200, 60, '#4e3b2b');                   // coffee table
      rect(g, 820, 300, 10, 260, '#222');                      // floor lamp (off)
      poly(g, [[790, 300], [860, 300], [845, 250], [805, 250]], '#cfc7b4');
      rect(g, 90, 300, 110, 330, '#2d2620');                   // bookshelf
      for (let y = 330; y < 620; y += 60) rect(g, 100, y, 90, 40, '#6a4b3a');
    },
    Bedroom(g) {
      shell(g, '#7d7a8c', '#4f4136', '#57556a');
      windowAt(g, 600, 200, 110, 150);
      rect(g, 300, 430, 300, 140, '#d9d6cf');                  // bed
      rect(g, 300, 380, 300, 60, '#5b4a3c');
      rect(g, 330, 440, 90, 40, '#efece6');
      rect(g, 640, 470, 60, 60, '#4a3a2e');                    // night stand
      rect(g, 655, 430, 30, 40, '#d8cfb8');
      lampGlow(g, 670, 440);
      rect(g, 60, 220, 160, 420, '#3b3129');                   // wardrobe
      rect(g, 138, 230, 4, 400, '#2a221c');
    },
  };

  async function draw(name) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    ROOMS[name](g);
    finish(g);
    return Img.canvasToBlob(c);
  }

  // Build a complete demo house: hallway → kitchen → living room → bedroom (yours).
  async function build() {
    const names = ['Hallway', 'Kitchen', 'Living room', 'Bedroom'];
    const rooms = [];
    for (const name of names) {
      const id = await Img.save(await draw(name), 'photo');
      rooms.push({ id: Img.uid('room'), name, photos: [id] });
    }
    const edges = [];
    for (let i = 1; i < rooms.length; i++) edges.push([rooms[i - 1].id, rooms[i].id]);
    const house = { rooms, edges, playerRoom: rooms[3].id, anomalies: [], useFallback: true, spawnFar: false, layoutEdited: true };

    // One "manual" anomaly so the Mode B path can be seen without uploading anything.
    const kitchen = rooms[1];
    const base = await Img.get(kitchen.photos[0]);
    const p = Procedural.generate(base, 3, 'figure');
    const imageId = await Img.save(await Img.canvasToBlob(p.canvas), 'anom');
    house.anomalies.push({ id: Img.uid('a'), source: 'manual', roomId: kitchen.id, photoId: kitchen.photos[0], imageId, difficulty: 3, description: 'Demo: figure in the kitchen', region: p.region });
    return house;
  }

  return { build };
})();
