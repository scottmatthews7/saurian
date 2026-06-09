// DOM-based HUD overlay: health bar, egg counter, objective, messages.
import { JUICE } from "./config.js";

export function createHUD() {
  const el = (id) => document.getElementById(id);
  const healthFill = el("healthFill");
  const eggCount = el("eggCount");
  const carryCount = el("carryCount");
  const objective = el("objective");
  const banner = el("banner");
  const trexBar = el("trexFill");
  const vignette = el("vignette");
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
    onMuteClick(fn) { if (muteBtn) muteBtn.addEventListener("click", fn); },
    setMuteLabel(muted) { if (muteBtn) muteBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound"; },
    setTrex(v, max) { trexBar.style.width = `${Math.max(0, (v / max) * 100)}%`; },
    setEggs(banked, target, carrying, remaining) {
      eggCount.textContent = `${banked} / ${target}`;
      carryCount.textContent = carrying > 0 ? `Carrying ${carrying} — get to the nest!` :
        (remaining > 0 ? `${remaining} eggs out there` : "All eggs found");
    },
    setObjective(text) { objective.textContent = text; },
    showBanner(title, sub, cls) {
      banner.innerHTML = `<div class="bannerTitle ${cls}">${title}</div><div class="bannerSub">${sub}</div>`;
      banner.style.display = "flex";
    },
    hideBanner() { banner.style.display = "none"; },
  };
}
