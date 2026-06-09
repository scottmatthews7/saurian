// Keyboard + pointer input. Jump/attack are edge-triggered (consume once).

export function createInput(canvas) {
  const keys = new Set();
  let jumpQueued = false;
  let attackQueued = false;

  const norm = (e) => e.key.toLowerCase();
  window.addEventListener("keydown", (e) => {
    const k = norm(e);
    keys.add(k);
    if (k === " ") { jumpQueued = true; e.preventDefault(); }
    if (k === "j") attackQueued = true;
  });
  window.addEventListener("keyup", (e) => keys.delete(norm(e)));
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 0) attackQueued = true;
  });

  return {
    keys,
    consumeJump() { const v = jumpQueued; jumpQueued = false; return v; },
    consumeAttack() { const v = attackQueued; attackQueued = false; return v; },
    // Edge-trigger queues exposed so the touch layer can drive the same input.
    queueJump() { jumpQueued = true; },
    queueAttack() { attackQueued = true; },
  };
}
