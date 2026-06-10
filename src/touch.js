import { TOUCH } from "./config.js";

// On-screen touch controls for phones/tablets: a left analog joystick that
// drives the existing camera-relative WASD keys (so all movement logic is
// reused), and right-side BITE / JUMP buttons. A full-deflection stick also
// engages sprint. Only mounted when a touch device is detected.

export function isTouchDevice() {
  return ("ontouchstart" in window) ||
    (navigator.maxTouchPoints > 0) ||
    window.matchMedia("(pointer: coarse)").matches;
}

// Map a stick vector (sx, sz) where +z is "up/forward" on screen to the WASD
// key set. A dead zone avoids jitter; near-full deflection adds sprint.
function applyStick(keys, sx, sz, deadZone, sprintMag) {
  const mag = Math.hypot(sx, sz);
  keys.delete("w"); keys.delete("a"); keys.delete("s"); keys.delete("d");
  keys.delete("shift");
  if (mag < deadZone) return;
  // screen up (negative client-y, which we pass as +sz) maps to forward (W)
  if (sz > deadZone) keys.add("w");
  if (sz < -deadZone) keys.add("s");
  if (sx > deadZone) keys.add("d");
  if (sx < -deadZone) keys.add("a");
  if (mag >= sprintMag) keys.add("shift");
}

export function createTouchControls(input) {
  if (!isTouchDevice()) return { mounted: false };

  const root = document.createElement("div");
  root.id = "touchControls";
  root.innerHTML = `
    <div id="joyZone"><div id="joyBase"><div id="joyKnob"></div></div></div>
    <div id="touchBtns">
      <div class="touchBtn" id="btnRoar">ROAR</div>
      <div class="touchBtn" id="btnDash">DASH</div>
      <div class="touchBtn" id="btnJump">JUMP</div>
      <div class="touchBtn bite" id="btnBite">BITE</div>
    </div>`;
  document.body.appendChild(root);

  const joyZone = root.querySelector("#joyZone");
  const joyBase = root.querySelector("#joyBase");
  const knob = root.querySelector("#joyKnob");
  const btnJump = root.querySelector("#btnJump");
  const btnBite = root.querySelector("#btnBite");
  const btnRoar = root.querySelector("#btnRoar");
  const btnDash = root.querySelector("#btnDash");

  const radius = TOUCH.joyRadius;
  let joyId = null;       // active pointer id for the joystick
  let originX = 0, originY = 0;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function resetJoy() {
    joyId = null;
    setKnob(0, 0);
    joyBase.style.opacity = "0.35";
    applyStick(input.keys, 0, 0, TOUCH.deadZone, TOUCH.sprintMag);
  }
  resetJoy();

  joyZone.addEventListener("pointerdown", (e) => {
    joyId = e.pointerId;
    const r = joyBase.getBoundingClientRect();
    // re-centre the base under the touch for a "floating" stick feel
    originX = e.clientX; originY = e.clientY;
    joyBase.style.left = `${e.clientX - radius}px`;
    joyBase.style.top = `${e.clientY - radius}px`;
    joyBase.style.opacity = "0.7";
    joyZone.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  joyZone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const mag = Math.hypot(dx, dy);
    if (mag > radius) { dx = dx / mag * radius; dy = dy / mag * radius; }
    setKnob(dx, dy);
    // normalise to -1..1; screen-up (dy<0) is forward, so invert dy for sz
    applyStick(input.keys, dx / radius, -dy / radius, TOUCH.deadZone, TOUCH.sprintMag);
    e.preventDefault();
  });
  const endJoy = (e) => { if (e.pointerId === joyId) resetJoy(); };
  joyZone.addEventListener("pointerup", endJoy);
  joyZone.addEventListener("pointercancel", endJoy);

  // action buttons: BITE fires the attack queue, JUMP the jump queue
  const tap = (el, fn) => {
    el.addEventListener("pointerdown", (e) => {
      fn();
      el.classList.add("pressed");
      e.preventDefault();
    });
    el.addEventListener("pointerup", () => el.classList.remove("pressed"));
    el.addEventListener("pointercancel", () => el.classList.remove("pressed"));
  };
  tap(btnBite, () => input.queueAttack());
  tap(btnJump, () => input.queueJump());
  tap(btnRoar, () => input.queueRoar());
  tap(btnDash, () => input.queueDash());

  return { mounted: true, root };
}
