// DOM-based HUD overlay: health bar, survival readout, objective, messages.
import { JUICE } from "./config.js";

export function createHUD() {
  const el = (id) => document.getElementById(id);
  const healthFill = el("healthFill");
  const survTime = el("survTime");
  const objective = el("objective");
  const scoreEl = el("score");
  const banner = el("banner");
  const trexBar = el("trexFill");
  const staminaBar = el("staminaFill");
  const dashBar = el("dashFill");
  const dashReady = el("dashReady");
  const vignette = el("vignette");
  const threatGlow = el("threatGlow");
  const duskFill = el("duskFill");
  const duskLabel = el("duskLabel");
  const duskTint = el("duskTint");
  const hitFlashEl = el("hitFlash");
  const popups = el("popups");
  const muteBtn = el("muteBtn");
  const hotbar = el("hotbar");
  const minimapWrap = el("minimapWrap");
  const medkitEl = el("medkit");

  // One-time icon glyphs per weapon kind for the hotbar slots.
  const TOOL_ICONS = { spear: "🗡️", club: "🏏", rock: "🪨", torch: "🔥" };

  return {
    // Hotbar render (wishlist item 6). Draws one cell per backpack slot showing
    // its number key, icon, and stack count; the equipped slot is highlighted.
    // `inv` is the inventory state (slots[] + active index).
    setHotbar(inv) {
      if (!hotbar) return;
      const cells = inv.slots.map((s, i) => {
        const active = i === inv.active ? " active" : "";
        const filled = s ? " filled" : "";
        const icon = s ? (TOOL_ICONS[s.kind] || "•") : "";
        const count = s && s.count > 1 ? `<span class="hbCount">${s.count}</span>` : "";
        return `<div class="hbCell${active}${filled}"><span class="hbKey">${i + 1}</span>`
          + `<span class="hbIcon">${icon}</span>${count}</div>`;
      }).join("");
      hotbar.innerHTML = cells;
    },
    setHealth(v, max) {
      const frac = Math.max(0, v / max);
      healthFill.style.width = `${frac * 100}%`;
      // Red vignette intensifies as health drops below the threshold.
      if (vignette) {
        const t = JUICE.lowHealthThreshold;
        vignette.style.opacity = frac < t ? `${Math.min(1, (t - frac) / t)}` : "0";
      }
    },
    // Re-triggerable full-screen red flash on taking a hit.
    hitFlash() {
      if (!hitFlashEl) return;
      hitFlashEl.classList.remove("fire");
      void hitFlashEl.offsetWidth; // reflow so the animation restarts
      hitFlashEl.classList.add("fire");
    },
    // Floating "+N" style reward popup that rises and fades near the score.
    popup(text, cls) {
      if (!popups) return;
      const p = document.createElement("div");
      p.className = `popup ${cls || ""}`;
      p.textContent = text;
      popups.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    },
    onMuteClick(fn) { if (muteBtn) muteBtn.addEventListener("click", fn); },
    setMuteLabel(muted) { if (muteBtn) muteBtn.textContent = muted ? "Sound off" : "Sound on"; },
    setTrex(v, max) { trexBar.style.width = `${Math.max(0, (v / max) * 100)}%`; },
    // Dash charge: fraction 0 (just used) .. 1 (ready); pulses READY when full.
    setDash(fraction) {
      if (!dashBar) return;
      const f = Math.max(0, Math.min(1, fraction));
      dashBar.style.width = `${f * 100}%`;
      if (dashReady) dashReady.classList.toggle("on", f >= 1);
    },
    // Time-of-day indicator. `factor` is the dusk factor (0 full day .. 1 deepest
    // dusk). The bar shows daylight *remaining* (depletes as dusk falls); the
    // label flips to a dusk look past the midpoint; the screen edges warm amber.
    setDusk(factor) {
      const f = Math.max(0, Math.min(1, factor));
      if (duskFill) duskFill.style.width = `${(1 - f) * 100}%`;
      if (duskTint) duskTint.style.opacity = `${f}`;
      const isDusk = f >= 0.5;
      if (duskLabel) {
        duskLabel.textContent = isDusk ? "Dusk" : "Daylight";
        duskLabel.classList.toggle("dusk", isDusk);
      }
    },
    setStamina(v, max, exhausted) {
      if (!staminaBar) return;
      staminaBar.style.width = `${Math.max(0, (v / max) * 100)}%`;
      staminaBar.classList.toggle("exhausted", !!exhausted);
    },
    // Big survival-time readout (pre-formatted by the game: "47s" / "2:07").
    setSurvival(text) {
      if (survTime) survTime.textContent = text;
    },
    setScore(points) {
      if (scoreEl) scoreEl.textContent = points.toLocaleString();
    },
    setObjective(text) { objective.textContent = text; },
    // Stowed health-pack count; hidden at zero. Shows the H-to-use hint.
    setMedkits(n) {
      if (!medkitEl) return;
      // NB: must set an explicit visible display — the element's stylesheet base
      // is display:none, so clearing the inline style would re-hide it.
      if (n > 0) { medkitEl.style.display = "block"; medkitEl.innerHTML = `<span class="mkIcon">✚</span> ${n} <span class="mkHint">[H]</span>`; }
      else medkitEl.style.display = "none";
    },
    // Soft red edge glow that THROBS while a predator is hunting the player.
    // `level` 0..1 (proximity-scaled); 0 fades it out. The pulse rides a ~2s
    // sine so it breathes rather than flickers.
    setThreat(level) {
      if (!threatGlow) return;
      if (level <= 0) { threatGlow.style.opacity = "0"; return; }
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 320);
      threatGlow.style.opacity = (Math.min(1, level) * pulse).toFixed(3);
    },
    // Show/hide the GPS-gated UI (the minimap + the boat compass pill). Both are
    // hidden until the player loots the pilot's GPS device.
    setGpsUnlocked(on) {
      if (minimapWrap) minimapWrap.style.display = on ? "" : "none";
      if (objective) objective.style.display = on ? "" : "none";
    },
    // Objective pill with a VINTAGE COMPASS needle rotated toward a screen-space
    // heading (radians, 0 = up): a brass bezel + red-north/white-south needle
    // pointing to the boat. Used after the GPS is acquired.
    setGuide(text, headingRad) {
      const deg = headingRad == null ? 0 : headingRad * 180 / Math.PI;
      const compass = headingRad == null ? "" :
        `<span class="vcompass"><span class="vcNeedle" style="transform:rotate(${deg}deg)"></span><span class="vcPin"></span></span>`;
      objective.innerHTML = `${compass}<span class="vcText">${text}</span>`;
    },
    // End-of-run + pause overlays. The game supplies title/sub/cls; the screen
    // dressing (scrim, kicker, flavour line) is keyed off cls. A trailing
    // "Press X ..." sentence in the sub is lifted into the pulsing prompt.
    showBanner(title, sub, cls) {
      const FLAVOUR = {
        win: {
          kicker: "The northern shore",
          flavour: "The hull takes your weight and the island lets you go. Behind you, the roars fade into the wind. Ahead: open water, and home. Few have ever made this crossing.",
        },
        lose: {
          kicker: "The island claims another",
          flavour: "Your story ends in the long grass, beside all the others who tried. The boat still waits at the northern shore, for the next one brave enough.",
        },
      };
      const f = FLAVOUR[cls];
      let stats = sub || "", prompt = "";
      const m = stats.match(/Press [A-Z][^.]*\.?\s*$/);
      if (m) { prompt = m[0].trim().replace(/\.$/, ""); stats = stats.slice(0, m.index).trim(); }
      banner.className = cls || "";
      banner.innerHTML = `
        <div class="reveal">
          ${f ? `<div class="scrKicker">${f.kicker}</div>` : ""}
          <div class="bannerTitle ${cls}">${title}</div>
          ${f ? `<p class="scrHook">${f.flavour}</p>` : ""}
          ${stats ? `<div class="scrStats">${stats}</div>` : ""}
          ${prompt ? `<div class="scrPrompt">${prompt}</div>` : ""}
        </div>`;
      banner.style.display = "flex";
    },
    // Intro story cards — shown ONCE at the start, BEFORE the controls/title
    // screen (never after pause/death; those just resume/retry). One sentence
    // per card; click/any key advances, Esc skips. Capture-phase interceptors
    // swallow input so the game's start listeners can't fire mid-intro. Calls
    // onDone after the last card so the caller can show the title screen next.
    playIntro(onDone) {
      const CARDS = [
        "Somewhere in the southern ocean, a charter flight goes down.",
        "You wake in the wreckage. The pilot doesn't.",
        "His GPS marks one thing: a fishing boat, anchored off the northern shore.",
        "Between you and it: sixty-six million years of teeth.",
      ];
      banner.className = "";
      banner.style.display = "flex";
      let card = 0;
      const render = () => {
        banner.innerHTML = `<div class="introCard reveal">
          <div class="cardText">${CARDS[card]}</div>
          <div class="cardHint">Click for more. Esc skips</div>
        </div>`;
      };
      const uninstall = () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("pointerdown", onPtr, true);
      };
      const advance = (skip) => {
        card = skip ? CARDS.length : card + 1;
        if (card >= CARDS.length) { uninstall(); if (onDone) onDone(); return; }
        render();
      };
      const onKey = (e) => { e.preventDefault(); e.stopImmediatePropagation(); advance(e.key === "Escape"); };
      const onPtr = (e) => { e.stopImmediatePropagation(); advance(false); };
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("pointerdown", onPtr, true);
      render();
    },
    // Start screen, shown once loading completes: the crash setup, the route
    // north, the controls, and a pulsing prompt. Any key / click begins the run
    // (the game arms those listeners; the banner lets pointer events through).
    showTitle(bestLine) {
      const ctrl = (k, label) => `<div class="ctrlRow"><span class="key">${k}</span><span>${label}</span></div>`;
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      banner.className = "";
      banner.innerHTML = `
        <div class="reveal">
          <div class="scrKicker">The crash site, southern jungle</div>
          <div class="bannerTitle start titleBig">SAURIAN</div>
          <div class="titleStrap">Escape the island</div>
          <div class="route">Trail <i>&rsaquo;</i> Savannah <i>&rsaquo;</i> Pass <i>&rsaquo;</i> Desert <i>&rsaquo;</i> The boat</div>
          ${bestLine ? `<div class="scrBest">${bestLine}</div>` : ""}
          <div class="scrPrompt">${touch ? "Tap to play" : "Click to play"}</div>
        </div>
        <div class="ctrlStrip">
          ${ctrl("WASD", "Move")}
          ${ctrl("SHIFT", "Sprint")}
          ${ctrl("SPACE", "Jump")}
          ${ctrl("CLICK / J", "Strike")}
          ${ctrl("F", "Dash")}
          ${ctrl("G / RMB", "Throw")}
          ${ctrl("1–6", "Tools")}
          ${ctrl("P", "Pause")}
          ${ctrl("M", "Sound")}
        </div>`;
      banner.style.display = "flex";
    },
    hideBanner() { banner.className = ""; banner.style.display = "none"; },
  };
}
