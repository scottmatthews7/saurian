import { AUDIO } from "./config.js";

// Procedural audio via the Web Audio API. No asset files — every sound is
// synthesised, so the game stays a zero-dependency "serve a folder" build.
// The AudioContext must be created/resumed after a user gesture (browser
// autoplay policy), so we lazily start it on the first play call.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = AUDIO.startMuted;
  let ambientNodes = null;

  // Decoded sample buffers (real CC0/royalty-free audio). Keyed by a logical
  // name; values are AudioBuffer | AudioBuffer[]. Loaded once on unlock; until
  // then the procedural fallbacks below cover any early sound.
  const buffers = { footsteps: [], pant: null, creatures: {} };
  let buffersLoaded = false;
  // Panting loop nodes (created lazily, gain-ramped — never hard cut).
  let pant = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : AUDIO.masterVolume;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = AUDIO.musicVolume;
    musicGain.connect(master);
  }

  function now() { return ctx.currentTime; }

  // Fetch + decode one sample file into an AudioBuffer (null on any failure so a
  // missing/blocked asset silently falls back to procedural, never throws).
  async function load(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return await ctx.decodeAudioData(buf);
    } catch { return null; }
  }

  // Load every configured sample once. Failures are tolerated per-file.
  async function loadSamples() {
    if (!ctx || buffersLoaded) return;
    buffersLoaded = true; // guard re-entry; individual files may still be null
    const s = AUDIO.samples;
    buffers.footsteps = await Promise.all((s.footsteps || []).map(load));
    buffers.footsteps = buffers.footsteps.filter(Boolean);
    buffers.pant = await load(s.pant);
    for (const [kind, url] of Object.entries(s.creatures || {})) {
      buffers.creatures[kind] = await load(url);
    }
  }

  // Play a one-shot buffer with a short attack/release envelope (no clicks) and
  // optional pitch jitter + gain. Returns the source (or null if no buffer).
  function playBuffer(buf, { gain = 1, rate = 1, jitter = 0, attack = 0.005, release = 0.04 } = {}) {
    if (!ctx || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain();
    const t = now();
    const dur = buf.duration / src.playbackRate.value;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(g); g.connect(master);
    src.start();
    return src;
  }

  // A noise buffer reused for breath/impact textures.
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  // Generic decaying tone helper.
  function tone(freq, dur, type, gain, glideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now());
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now() + dur);
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(gain, now() + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(now() + dur + 0.02);
  }

  const api = {
    get muted() { return muted; },
    // Call on the first user gesture so the context is unlocked.
    unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
      loadSamples(); // fire-and-forget; procedural covers anything before it lands
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : AUDIO.masterVolume;
      return muted;
    },
    // A guttural T-Rex roar: detuned saws sweeping down, filtered, plus breath.
    // `gain` (0..1) attenuates the whole roar so a distant predator is fainter;
    // `menace` (0..1) deepens + lengthens it (pushed up as a T-Rex closes /
    // enrages) so the apex predator sounds more threatening the nearer it gets.
    // Play a creature's vocalisation by kind, distance-attenuated by `gain` and
    // intensified by `menace` (0..1). Prefers the real per-species sample
    // (T-Rex rumble / raptor screech / herbivore bellow); falls back to the
    // procedural roar/call. `menace` deepens + slows the predator sample.
    vocalise(kind, gain = 1, menace = 0) {
      if (!ctx || muted) return;
      const vol = Math.max(0, Math.min(1, gain));
      if (vol <= 0.001) return;
      const buf = buffers.creatures && buffers.creatures[kind];
      if (buf) {
        const m = Math.max(0, Math.min(1, menace));
        const predator = kind === "trex" || kind === "raptor";
        playBuffer(buf, {
          gain: vol * (predator ? 0.9 : 0.7),
          rate: predator ? (1 - m * 0.12) : 1,  // a closing predator sounds deeper
          jitter: 0.04,
          attack: 0.02, release: 0.12,           // smooth swell + tail, no click
        });
        return;
      }
      // procedural fallback
      if (kind === "trex" || kind === "raptor") api.roar(vol, menace);
      else api.creatureCall(vol, kind === "apatosaurus" ? 0.7 : 1);
    },
    roar(gain = 1, menace = 0) {
      if (!ctx || muted) return;
      const m = Math.max(0, Math.min(1, menace));
      const vol = Math.max(0, Math.min(1, gain));
      if (vol <= 0.001) return;
      const dur = 1.1 + m * 0.5;                 // more menace = a longer bellow
      const pitchMul = 1 - m * 0.25;             // and a deeper one
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, now());
      filter.frequency.exponentialRampToValueAtTime(220 - m * 60, now() + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.8 * vol, now() + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      filter.connect(g); g.connect(master);
      [70, 73, 110].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? "square" : "sawtooth";
        o.frequency.setValueAtTime(f * pitchMul, now());
        o.frequency.exponentialRampToValueAtTime(f * pitchMul * 0.6, now() + dur);
        o.connect(filter);
        o.start(); o.stop(now() + dur + 0.05);
      });
      const n = noise(), ng = ctx.createGain(), nf = ctx.createBiquadFilter();
      nf.type = "bandpass"; nf.frequency.value = 500;
      ng.gain.setValueAtTime(0.25 * vol, now());
      ng.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      n.connect(nf); nf.connect(ng); ng.connect(master);
      n.start(); n.stop(now() + dur);
    },
    // A herbivore call/bellow — higher, shorter and brighter than the predator
    // roar so the herd reads as "other creatures alive out there" rather than a
    // threat. A two-tone hooting moan through a lowpass, distance-attenuated by
    // `gain`. `pitch` (default 1) lets bigger herbivores call a little deeper.
    creatureCall(gain = 1, pitch = 1) {
      if (!ctx || muted) return;
      const vol = Math.max(0, Math.min(1, gain));
      if (vol <= 0.001) return;
      const dur = 0.85;
      const base = 180 * pitch;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass"; filter.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.5 * vol, now() + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      filter.connect(g); g.connect(master);
      [base, base * 1.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sawtooth" : "triangle";
        o.frequency.setValueAtTime(f * 0.92, now());
        o.frequency.linearRampToValueAtTime(f, now() + 0.18);   // a rising hoot
        o.frequency.linearRampToValueAtTime(f * 0.85, now() + dur); // falling tail
        o.connect(filter);
        o.start(); o.stop(now() + dur + 0.02);
      });
    },
    // Snappy chomp: short pitch-down click plus a noise burst.
    bite() {
      if (!ctx || muted) return;
      tone(180, 0.12, "square", 0.4, 60);
      const n = noise(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 800;
      g.gain.setValueAtTime(0.4, now());
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.1);
      n.connect(f); f.connect(g); g.connect(master);
      n.start(); n.stop(now() + 0.12);
    },
    // Bright ascending blip for collecting an egg; golden eggs get an extra
    // sparkle arpeggio so the rare pickup feels rewarding.
    pickup(golden) {
      if (!ctx || muted) return;
      tone(660, 0.14, "triangle", 0.35, 990);
      tone(990, 0.18, "sine", 0.25, 1320);
      if (golden) {
        [1320, 1760, 2093].forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.22), 60 + i * 70));
      }
    },
    // Warm restorative swell when eating meat to heal.
    heal() {
      if (!ctx || muted) return;
      tone(330, 0.3, "sine", 0.3, 495);
      tone(495, 0.35, "sine", 0.2, 660);
    },
    // Warm chord when an egg is banked at the nest.
    bank() {
      if (!ctx || muted) return;
      [440, 554, 660].forEach((f, i) => setTimeout(() => tone(f, 0.4, "sine", 0.3), i * 60));
    },
    // Ward beacon ignites: a warm bright rising chime (a major arpeggio) that
    // reads "this is safe", distinct from the egg-bank chord.
    beacon() {
      if (!ctx || muted) return;
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.45, "triangle", 0.28), i * 70));
    },
    // A grounded footfall for the human. Two layers: a low body thud (the
    // weight landing) plus a short filtered-noise scuff (foot on dirt). The
    // sprint variant hits harder + brighter so a run reads as heavier/faster
    // than a walk; the wade variant adds a wet splat. `volume` scales the whole
    // step so cadence + loudness both rise with sprint (driven from the loop).
    // Each step is pitch-jittered slightly so a run doesn't sound machine-gun-y.
    footstep(volume = 0.12, sprint = false, wading = false) {
      if (!ctx || muted) return;
      const vol = Math.max(0, volume);
      if (vol <= 0.001) return;
      // Real CC0 footstep sample (Kenney): pick a random variant + pitch-jitter
      // so a run doesn't machine-gun. Sprint plays slightly faster + louder.
      const steps = buffers.footsteps;
      if (steps && steps.length) {
        const buf = steps[(Math.random() * steps.length) | 0];
        playBuffer(buf, {
          gain: vol * (sprint ? 1.3 : 1) * 2.0, // samples are quietish; lift to match SFX bed
          rate: sprint ? 1.12 : 1.0,
          jitter: 0.08,                          // ±8% pitch per step
        });
        if (wading) {
          // wet splat layer on top of the dry sample
          const wn = noise(), wg = ctx.createGain(), wf = ctx.createBiquadFilter();
          wf.type = "lowpass";
          wf.frequency.setValueAtTime(1800, now());
          wf.frequency.exponentialRampToValueAtTime(300, now() + 0.18);
          wg.gain.setValueAtTime(vol * 0.9, now());
          wg.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);
          wn.connect(wf); wf.connect(wg); wg.connect(master);
          wn.start(); wn.stop(now() + 0.2);
        }
        return;
      }
      // Procedural fallback (samples not yet loaded / blocked): a soft filtered
      // noise crunch, NOT a pitched drum tone.
      const jitter = 0.92 + Math.random() * 0.16;
      const n = noise(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.Q.value = 0.7;
      f.frequency.value = (sprint ? 480 : 360) * jitter;
      const dur = sprint ? 0.09 : 0.08;
      g.gain.setValueAtTime(0.0001, now());
      g.gain.linearRampToValueAtTime(vol * 1.4, now() + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      n.connect(f); f.connect(g); g.connect(master);
      n.start(); n.stop(now() + dur);
    },
    // Splash: a bright noise burst sweeping down through a lowpass, plus a
    // little watery blip. Played when the raptor enters the pond.
    splash() {
      if (!ctx || muted) return;
      const n = noise(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(3500, now());
      f.frequency.exponentialRampToValueAtTime(400, now() + 0.35);
      g.gain.setValueAtTime(0.45, now());
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.4);
      n.connect(f); f.connect(g); g.connect(master);
      n.start(); n.stop(now() + 0.4);
      tone(520, 0.18, "sine", 0.18, 240);
    },
    // Dash whoosh: a quick bright noise sweep through a rising bandpass — a
    // short airy "swish" distinct from the watery splash, selling the burst.
    whoosh() {
      if (!ctx || muted) return;
      const n = noise(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(600, now());
      f.frequency.exponentialRampToValueAtTime(2600, now() + 0.22);
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.28, now() + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.26);
      n.connect(f); f.connect(g); g.connect(master);
      n.start(); n.stop(now() + 0.28);
    },
    // Pterosaur screech: a shrill rising-then-falling cry warning of a dive.
    screech() {
      if (!ctx || muted) return;
      const dur = 0.55;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(900, now());
      o.frequency.exponentialRampToValueAtTime(2200, now() + 0.12);
      o.frequency.exponentialRampToValueAtTime(700, now() + dur);
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.3, now() + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = 4;
      o.connect(f); f.connect(g); g.connect(master);
      o.start(); o.stop(now() + dur + 0.02);
    },
    // Player hurt: dissonant low buzz.
    hurt() {
      if (!ctx || muted) return;
      tone(140, 0.3, "sawtooth", 0.4, 80);
    },
    // A single heartbeat-like tension pulse; intensity (0..1) raises pitch+gain.
    tension(intensity) {
      if (!ctx || muted) return;
      const i = Math.max(0, Math.min(1, intensity));
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(50 + i * 30, now());
      const peak = 0.12 + i * 0.25;
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(peak, now() + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.22);
      o.connect(g); g.connect(master);
      o.start(); o.stop(now() + 0.25);
    },
    win() {
      if (!ctx || muted) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.5, "triangle", 0.35), i * 140));
    },
    lose() {
      if (!ctx || muted) return;
      [330, 247, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.5, "sawtooth", 0.35), i * 160));
    },
    // Low evolving ambient drone bed, started once.
    startAmbient() {
      if (!ctx || ambientNodes) return;
      const base = ctx.createOscillator();
      base.type = "sine"; base.frequency.value = 55;
      const fifth = ctx.createOscillator();
      fifth.type = "sine"; fifth.frequency.value = 82.4;
      const lfo = ctx.createOscillator();
      lfo.type = "sine"; lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain); lfoGain.connect(musicGain.gain);
      base.connect(musicGain); fifth.connect(musicGain);
      base.start(); fifth.start(); lfo.start();
      ambientNodes = { base, fifth, lfo };
    },
    // Player breathing: a looping breath sample whose volume + rate track
    // exertion. Call every frame with `active` (sprinting/dashing) and
    // `intensity` (0..1, rises as stamina drains). Gain + rate are smoothly
    // ramped (setTargetAtTime) so the breath swells/eases, never pops. A no-op
    // until the buffer loads (procedural breathing would sound worse than none).
    panting(active, intensity = 0) {
      if (!ctx) return;
      const buf = buffers.pant;
      if (!buf) return;
      const i = Math.max(0, Math.min(1, intensity));
      // lazily build the persistent loop on first use
      if (!pant) {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        src.connect(g); g.connect(master);
        src.start();
        pant = { src, g };
      }
      const target = (active && !muted) ? AUDIO.pantMaxVolume * (0.35 + 0.65 * i) : 0.0001;
      pant.g.gain.setTargetAtTime(Math.max(0.0001, target), now(), AUDIO.pantFadeGlide);
      const rate = AUDIO.pantMinRate + (AUDIO.pantMaxRate - AUDIO.pantMinRate) * i;
      pant.src.playbackRate.setTargetAtTime(rate, now(), AUDIO.pantFadeGlide);
    },
    // Silence the breath loop immediately-but-smoothly (on game over / reset).
    stopPanting() {
      if (pant) pant.g.gain.setTargetAtTime(0.0001, now(), 0.1);
    },
  };
  return api;
}
