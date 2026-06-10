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
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : AUDIO.masterVolume;
      return muted;
    },
    // A guttural T-Rex roar: detuned saws sweeping down, filtered, plus breath.
    roar() {
      if (!ctx || muted) return;
      const dur = 1.1;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, now());
      filter.frequency.exponentialRampToValueAtTime(220, now() + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.8, now() + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      filter.connect(g); g.connect(master);
      [70, 73, 110].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? "square" : "sawtooth";
        o.frequency.setValueAtTime(f, now());
        o.frequency.exponentialRampToValueAtTime(f * 0.6, now() + dur);
        o.connect(filter);
        o.start(); o.stop(now() + dur + 0.05);
      });
      const n = noise(), ng = ctx.createGain(), nf = ctx.createBiquadFilter();
      nf.type = "bandpass"; nf.frequency.value = 500;
      ng.gain.setValueAtTime(0.25, now());
      ng.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
      n.connect(nf); nf.connect(ng); ng.connect(master);
      n.start(); n.stop(now() + dur);
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
    // Soft thud footstep while sprinting.
    step() {
      if (!ctx || muted) return;
      tone(110, 0.08, "sine", 0.12, 60);
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
  };
  return api;
}
