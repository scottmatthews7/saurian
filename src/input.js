// Keyboard + pointer input. Jump/attack are edge-triggered (consume once).

export function createInput(canvas) {
  const keys = new Set();
  let jumpQueued = false;
  let attackQueued = false;
  let dashQueued = false;
  let sprintToggled = false; // Caps Lock sprint-toggle (user request). macOS only
                             // reports CapsLock keyup when the light turns OFF,
                             // so hold-detection is unreliable — toggle instead.

  const norm = (e) => e.key.toLowerCase();
  window.addEventListener("keydown", (e) => {
    const k = norm(e);
    keys.add(k);
    if (k === " ") { jumpQueued = true; e.preventDefault(); }
    if (k === "j") attackQueued = true;
    if (k === "f") dashQueued = true;
    if (k === "capslock") sprintToggled = !sprintToggled;
  });
  window.addEventListener("keyup", (e) => keys.delete(norm(e)));
  // If the window loses focus (alt-tab, devtools, a peer stealing the tab) the
  // keyup never arrives and a held movement key sticks — the raptor would run
  // forever. Clear all held keys on blur so focus returns to a neutral stance.
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 0) attackQueued = true;
  });

  return {
    keys,
    // Sprint when Shift is held OR the Caps Lock toggle is on. Moving stops /
    // exhaustion are handled by the player; this is purely the input intent.
    get sprintHeld() { return keys.has("shift") || sprintToggled; },
    consumeJump() { const v = jumpQueued; jumpQueued = false; return v; },
    consumeAttack() { const v = attackQueued; attackQueued = false; return v; },
    consumeDash() { const v = dashQueued; dashQueued = false; return v; },
    // Edge-trigger queues exposed so the touch layer can drive the same input.
    queueJump() { jumpQueued = true; },
    queueAttack() { attackQueued = true; },
    queueDash() { dashQueued = true; },
  };
}
