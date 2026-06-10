// DOM-based HUD overlay: health bar, egg counter, objective, messages.
import { JUICE } from "./config.js";

export function createHUD() {
  const el = (id) => document.getElementById(id);
  const healthFill = el("healthFill");
  const eggCount = el("eggCount");
  const carryCount = el("carryCount");
  const objective = el("objective");
  const scoreEl = el("score");
  const comboEl = el("combo");
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
  const beaconCount = el("beaconCount");

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
    setEggs(banked, target, carrying, remaining) {
      eggCount.textContent = `${banked} / ${target}`;
      carryCount.textContent = carrying > 0 ? `Carrying ${carrying} — get to the nest!` :
        (remaining > 0 ? `${remaining} eggs out there` : "All eggs found");
    },
    // Ward-beacon ring progress. Shows a flame per beacon (lit vs unlit) and
    // glows once the whole ring is lit (sanctuary).
    setBeacons(lit, total, guttering) {
      if (!beaconCount) return;
      const all = lit >= total;
      beaconCount.textContent = guttering
        ? `${"🔥".repeat(lit)}${"·".repeat(total - lit)} Beacon fading — relight!`
        : all
          ? `${"🔥".repeat(total)} Sanctuary lit`
          : `${"🔥".repeat(lit)}${"·".repeat(total - lit)} Beacons ${lit}/${total}`;
      beaconCount.classList.toggle("all", all && !guttering);
      beaconCount.classList.toggle("guttering", !!guttering);
    },
    setScore(points, combo) {
      if (scoreEl) scoreEl.textContent = points.toLocaleString();
      if (comboEl) comboEl.textContent = combo > 1 ? `Combo x${combo}` : "";
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
          <div class="titleObjective">One human, alone in a valley full of teeth.<br/>Outrun the <b>T-Rex</b>, slip the <b>raptor packs</b>, and stay alive — <b>run</b>, <b>punch</b>, <b>kick</b> and <b>dash</b> to survive the dark.</div>
          <details class="titleMore">
            <summary>More to discover &nbsp;(optional — learn as you play)</summary>
            <span class="titleFeed">Glowing <b>eggs</b> dotted across the valley are pickups — grab them on the run to keep your <b>health</b> and <b>stamina</b> up.</span><br/><span class="titleDusk">As <b>dusk</b> falls the predators grow bolder and the valley darkens — the longer you last, the deadlier it gets.</span><br/><span class="titleCursed">Some eggs glow with a <b>cursed</b> ☠ pulse — they draw <i>every</i> T-Rex straight to you. Touch one and you'd best be fast.</span><br/><span class="titleBeacon">Run through the <b>🔥 ward beacons</b> to light them — a lit beacon repels the T-Rex (and wards <b>wider at dusk</b>). They <b>burn down</b> — brush one again to relight it.</span><br/><span class="titleFeed">The T-Rex hunts the <b>herd</b> too — lead it onto a herbivore and it'll peel off. When it makes a kill it stops to <b>feed</b> (it glows <b>green</b> on the radar): rush in and strike its exposed flank for <b>double damage</b>.</span>
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
