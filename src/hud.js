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
  const duskFill = el("duskFill");
  const duskIcon = el("duskIcon");
  const duskLabel = el("duskLabel");
  const duskTint = el("duskTint");
  const hitFlashEl = el("hitFlash");
  const popups = el("popups");
  const muteBtn = el("muteBtn");

  return {
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
    setMuteLabel(muted) { if (muteBtn) muteBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound"; },
    setTrex(v, max) { trexBar.style.width = `${Math.max(0, (v / max) * 100)}%`; },
    // Dash charge: fraction 0 (just used) .. 1 (ready); pulses READY when full.
    setDash(fraction) {
      if (!dashBar) return;
      const f = Math.max(0, Math.min(1, fraction));
      dashBar.style.width = `${f * 100}%`;
      if (dashReady) dashReady.classList.toggle("on", f >= 1);
    },
    // Time-of-day indicator. `factor` is the dusk factor (0 full day .. 1 deepest
    // dusk). The bar shows daylight *remaining* (depletes as dusk falls); the icon
    // and label flip to a dusk look past the midpoint; the screen edges warm amber.
    setDusk(factor) {
      const f = Math.max(0, Math.min(1, factor));
      if (duskFill) duskFill.style.width = `${(1 - f) * 100}%`;
      if (duskTint) duskTint.style.opacity = `${f}`;
      const isDusk = f >= 0.5;
      if (duskIcon) duskIcon.textContent = isDusk ? "🌆" : "☀️";
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
    // Objective pill with a compass arrow rotated toward a screen-space heading
    // (radians, 0 = up). Used to guide the player to the nearest egg / nest.
    setGuide(text, headingRad) {
      const arrow = headingRad == null ? "" :
        `<span style="display:inline-block;transform:rotate(${headingRad}rad);margin-right:8px">⬆</span>`;
      objective.innerHTML = `${arrow}${text}`;
    },
    showBanner(title, sub, cls) {
      banner.innerHTML = `<div class="bannerTitle ${cls}">${title}</div><div class="bannerSub">${sub}</div>`;
      banner.style.display = "flex";
    },
    // Rich title screen: animated title, objective, a controls grid, best stats,
    // and a pulsing prompt. Shown before the first input starts the run.
    showTitle(bestLine) {
      const ctrl = (k, label) => `<div class="ctrlRow"><span class="key">${k}</span><span>${label}</span></div>`;
      banner.innerHTML = `
        <div class="titleCard">
          <div class="bannerTitle start titleBig">SAURIAN</div>
          <div class="titleTag">SURVIVAL</div>
          <div class="titleObjective"><b>Survive</b> the primeval valley as long as you can — the predators want you dead.<br/>Run, <b>punch</b>, <b>kick</b>, <b>dash</b>; eat <b>eggs</b> and <b>meat</b> to restore health and stamina.</div>
          <details class="titleMore">
            <summary>More to discover &nbsp;(optional — learn as you play)</summary>
            <span class="titleDusk">As <b>dusk</b> falls the predators grow bolder — but every second survived pays <b>double</b>.</span><br/><span class="titleGold"><b>Golden eggs</b> glow far out in the wilds — a big heal, a full stamina refill, and triple score.</span><br/><span class="titleFeed">The T-Rex hunts the <b>herd</b> too — lead it onto a herbivore and it'll peel off. When it makes a kill it stops to <b>feed</b> (it glows <b>green</b> on the radar): rush in and strike its exposed flank for <b>double damage</b>.</span>
          </details>
          <div class="controls">
            ${ctrl("WASD", "Move")}
            ${ctrl("SHIFT", "Sprint")}
            ${ctrl("SPACE", "Jump")}
            ${ctrl("CLICK / J", "Punch / Kick")}
            ${ctrl("F", "Dash")}
            ${ctrl("P", "Pause")}
            ${ctrl("M", "Mute")}
          </div>
          ${bestLine ? `<div class="titleBest">${bestLine}</div>` : ""}
          <div class="titlePrompt">Press any key or click to begin</div>
        </div>`;
      banner.style.display = "flex";
      // Expanding "More to discover" must not also start the run (the start
      // listeners fire on any pointerdown). Swallow the toggle interaction.
      const more = banner.querySelector(".titleMore > summary");
      if (more) {
        const swallow = (e) => e.stopPropagation();
        more.addEventListener("pointerdown", swallow);
        more.addEventListener("click", swallow);
      }
    },
    hideBanner() { banner.style.display = "none"; },
  };
}
