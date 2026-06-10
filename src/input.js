// Keyboard + pointer input. Jump/attack are edge-triggered (consume once).

export function createInput(canvas) {
  const keys = new Set();
  let jumpQueued = false;
  let attackQueued = false;
  let roarQueued = false;
  let dashQueued = false;

  const norm = (e) => e.key.toLowerCase();
  window.addEventListener("keydown", (e) => {
    const k = norm(e);
    keys.add(k);
    if (k === " ") { jumpQueued = true; e.preventDefault(); }
    if (k === "j") attackQueued = true;
    if (k === "q") roarQueued = true;
    if (k === "f") dashQueued = true;
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
    consumeJump() { const v = jumpQueued; jumpQueued = false; return v; },
    consumeAttack() { const v = attackQueued; attackQueued = false; return v; },
    consumeRoar() { const v = roarQueued; roarQueued = false; return v; },
    consumeDash() { const v = dashQueued; dashQueued = false; return v; },
    // Edge-trigger queues exposed so the touch layer can drive the same input.
    queueJump() { jumpQueued = true; },
    queueAttack() { attackQueued = true; },
    queueRoar() { roarQueued = true; },
    queueDash() { dashQueued = true; },
  };
}
