// Ambience and cues, all synthesized with the Web Audio API. No music.
const Sound = (() => {
  let ctx, master, bed, comp, noiseBuf, eventTimer;
  let bedSources = [];
  let started = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    // 2 seconds of white noise reused by every noise-based sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noiseSource(loop = false) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop;
    return s;
  }

  // Constant bed: mains hum + brownish room tone. Its gain is what "silence" cuts.
  function startAmbience() {
    init();
    if (!ctx || started) return;
    started = true;
    bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(master);
    bed.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);

    const hum = ctx.createGain();
    hum.gain.value = 0.035;
    hum.connect(bed);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    lp.connect(hum);
    for (const [f, type, g] of [[50, 'sawtooth', 0.6], [100, 'sine', 0.5], [150.3, 'sine', 0.18]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og); og.connect(lp); o.start();
      bedSources.push(o);
    }
    // slow wobble so the hum feels like a real transformer
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.012;
    lfo.connect(lfoG); lfoG.connect(hum.gain); lfo.start();
    bedSources.push(lfo);

    const room = noiseSource(true);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 380;
    const rg = ctx.createGain(); rg.gain.value = 0.05;
    room.connect(rf); rf.connect(rg); rg.connect(bed); room.start();
    bedSources.push(room);

    const hiss = noiseSource(true);
    const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 5000;
    const hg = ctx.createGain(); hg.gain.value = 0.006;
    hiss.connect(hf); hf.connect(hg); hg.connect(bed); hiss.start();
    bedSources.push(hiss);

    scheduleDistant();
  }

  // Random distant house noises every 15–50 s.
  function scheduleDistant() {
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => {
      if (!started) return;
      if (bed && bed.gain.value > 0.5) pick([thud, creak, tick, thud])(0.25 + Math.random() * 0.3, Math.random() * 1.6 - 0.8);
      scheduleDistant();
    }, 15000 + Math.random() * 35000);
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function out(vol, pan = 0) {
    const g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(master);
    } else g.connect(master);
    return g;
  }

  function thud(vol = 0.4, pan = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f); f.connect(g); g.connect(out(vol * 1.6, pan));
    s.start(t); s.stop(t + 0.6);
  }

  function creak(vol = 0.3, pan = 0) {
    if (!ctx) return;
    const t = ctx.currentTime, dur = 0.8 + Math.random() * 0.9;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 40, t);
    o.frequency.linearRampToValueAtTime(110 + Math.random() * 80, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(out(vol, pan));
    o.start(t); o.stop(t + dur);
  }

  function tick(vol = 0.2, pan = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(out(vol, pan));
    s.start(t); s.stop(t + 0.1);
  }

  function staticBurst(dur = 0.22, vol = 0.18) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  function beep(freq = 880, dur = 0.08, vol = 0.07, type = 'sine', when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // The hint that something is in the house: a slow low swell with a faint,
  // slightly out-of-tune pair of tones under it. Never says where.
  function presence(vol = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime, dur = 2.6;
    const s = noiseSource(true);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(90, t); f.frequency.linearRampToValueAtTime(420, t + dur * 0.6); f.frequency.linearRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.55); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(out(vol));
    s.start(t); s.stop(t + dur + 0.1);
    for (const fr of [55, 58.3]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.16, t + dur * 0.5); og.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(og); og.connect(out(vol)); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  const accepted = () => { beep(1046, 0.09); beep(784, 0.14, 0.07, 'sine', 0.11); };
  const rejected = () => { beep(110, 0.35, 0.08, 'square'); };
  const click = () => beep(1400, 0.03, 0.04);

  // Sudden silence: the bed drops away. Used right before danger.
  function silence(on, seconds = 0.4) {
    if (!ctx || !bed) return;
    const t = ctx.currentTime;
    bed.gain.cancelScheduledValues(t);
    bed.gain.setValueAtTime(bed.gain.value, t);
    bed.gain.linearRampToValueAtTime(on ? 0 : 1, t + seconds);
  }

  function scare() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = noiseSource();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    s.connect(g); g.connect(master); s.start(t); s.stop(t + 1.5);
    for (const f of [41, 43.5, 61]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + 1.7);
    }
  }

  function stop() {
    clearTimeout(eventTimer);
    if (bed) {
      const b = bed;
      b.gain.cancelScheduledValues(ctx.currentTime);
      b.gain.setValueAtTime(b.gain.value, ctx.currentTime);
      b.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      const srcs = bedSources;
      setTimeout(() => { srcs.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); b.disconnect(); }, 1800);
    }
    bedSources = [];
    bed = null;
    started = false;
  }

  return { init, startAmbience, stop, silence, staticBurst, thud, creak, tick, presence, beep, accepted, rejected, click, scare };
})();
