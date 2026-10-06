// Mode A: AI image editing, called straight from the browser (no backend).
// Both Gemini and OpenAI accept browser requests with an API key; the key is
// therefore visible to anyone who has this page. Keep the game private.
const AI = (() => {
  const LS_KEY = 'anomaly.ai';         // provider, model, count: remembered on this device
  const SS_KEY = 'anomaly.ai.keys';    // pasted API keys: this tab only, gone when it closes

  const read = (store, key) => { try { return JSON.parse(store.getItem(key) || '{}'); } catch { return {}; } };
  const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

  // Older versions kept pasted keys in localStorage; move them out.
  (() => {
    const local = read(localStorage, LS_KEY);
    let changed = false;
    for (const p of ['gemini', 'openai']) {
      if (local[p] && local[p].apiKey) { delete local[p].apiKey; changed = true; }
    }
    if (changed) write(localStorage, LS_KEY, local);
  })();

  function settings() {
    const cfg = window.ANOMALY_CONFIG || {};
    const local = read(localStorage, LS_KEY);
    const keys = read(sessionStorage, SS_KEY);
    const provider = local.provider || cfg.provider || 'none';
    const base = (cfg[provider] || {});
    const loc = (local[provider] || {});
    return {
      provider,
      model: loc.model || base.model || '',
      apiKey: keys[provider] || base.apiKey || '',
      keyFromConfig: !keys[provider] && !!base.apiKey,
      quality: base.quality || 'medium',
      perRoom: Number(local.perRoom || cfg.aiAnomaliesPerRoom || 2),
    };
  }

  function saveSettings(patch) {
    const local = read(localStorage, LS_KEY);
    if (patch.provider !== undefined) local.provider = patch.provider;
    if (patch.perRoom !== undefined) local.perRoom = patch.perRoom;
    const p = patch.provider || local.provider;
    if (p && patch.model !== undefined) {
      local[p] = local[p] || {};
      local[p].model = patch.model;
    }
    write(localStorage, LS_KEY, local);
    if (p && patch.apiKey !== undefined) {
      const keys = read(sessionStorage, SS_KEY);
      if (patch.apiKey) keys[p] = patch.apiKey; else delete keys[p];
      write(sessionStorage, SS_KEY, keys);
    }
  }

  function defaultModel(provider) {
    const cfg = window.ANOMALY_CONFIG || {};
    return (cfg[provider] && cfg[provider].model) || (provider === 'openai' ? 'gpt-image-1' : 'gemini-2.5-flash-image');
  }

  const available = () => { const s = settings(); return s.provider !== 'none' && !!s.apiKey; };

  const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  function closestRatio(w, h) {
    const r = w / h;
    let best = RATIOS[0], bd = Infinity;
    for (const s of RATIOS) {
      const [a, b] = s.split(':').map(Number);
      const d = Math.abs(Math.log(a / b) - Math.log(r));
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  async function errorText(res) {
    let t = '';
    try { const j = await res.json(); t = (j.error && (j.error.message || j.error.status)) || JSON.stringify(j); } catch { t = res.statusText; }
    return `HTTP ${res.status}: ${String(t).slice(0, 200)}`;
  }

  async function gemini(s, photoBlob, photoImg, prompt) {
    const { w, h } = Img.size(photoImg);
    const body = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: photoBlob.type || 'image/jpeg', data: await Img.blobToBase64(photoBlob) } },
      ] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: closestRatio(w, h) } },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await errorText(res));
    const json = await res.json();
    const parts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    const imgPart = parts.find(p => p.inlineData || p.inline_data);
    if (!imgPart) {
      const reason = (json.candidates && json.candidates[0] && json.candidates[0].finishReason) || (json.promptFeedback && json.promptFeedback.blockReason) || 'no image returned';
      throw new Error('Gemini: ' + reason);
    }
    const data = imgPart.inlineData || imgPart.inline_data;
    return Img.base64ToBlob(data.data, data.mimeType || data.mime_type || 'image/png');
  }

  async function openai(s, photoBlob, photoImg, prompt, where) {
    const { w, h } = Img.size(photoImg);
    // Mask: transparent where the model may edit. It is guidance only — the
    // model still redraws the whole picture — so we diff afterwards anyway.
    const mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    const mg = mask.getContext('2d');
    mg.fillStyle = '#000';
    mg.fillRect(0, 0, w, h);
    const r = where.region;
    mg.clearRect(r.x * w, r.y * h, r.w * w, r.h * h);
    const pngPhoto = await Img.canvasToBlob(Img.toCanvas(photoImg), 'image/png');

    const form = new FormData();
    form.append('model', s.model);
    form.append('image', pngPhoto, 'room.png');
    form.append('mask', await Img.canvasToBlob(mask, 'image/png'), 'mask.png');
    form.append('prompt', prompt);
    form.append('n', '1');
    form.append('size', 'auto');
    form.append('quality', s.quality);
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + s.apiKey }, body: form });
    if (!res.ok) throw new Error(await errorText(res));
    const json = await res.json();
    const b64 = json.data && json.data[0] && json.data[0].b64_json;
    if (!b64) throw new Error('OpenAI: no image returned');
    return Img.base64ToBlob(b64, 'image/png');
  }

  // Edit one room photo. Returns { blob, region, description, prompt, approx }.
  async function generate({ photoBlob, photoImg, roomName, difficulty, avoid }) {
    const s = settings();
    const p = Prompts.build(roomName, difficulty, avoid);
    const raw = s.provider === 'openai'
      ? await openai(s, photoBlob, photoImg, p.prompt, p.where)
      : await gemini(s, photoBlob, photoImg, p.prompt);

    // Bring the result back to the original photo's exact size so views line up.
    const editedImg = await Img.loadFromBlob(raw);
    const { w, h } = Img.size(photoImg);
    const canvas = Img.toCanvas(editedImg, w, h);
    URL.revokeObjectURL(editedImg.src);
    const blob = await Img.canvasToBlob(canvas);

    const diff = Img.diffRegion(photoImg, canvas);
    const approx = !diff.reliable;
    const region = diff.reliable ? diff.region : p.where.region;
    return { blob, region, approx, description: p.change, prompt: p.prompt, template: p.template };
  }

  return { settings, saveSettings, defaultModel, available, generate };
})();
