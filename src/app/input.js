"use strict";

import { $ } from "./dom.js";
import { state, ui, control, togglePause } from "./game.js";

function setCommand(vector) {
  if (!canUseJoystick()) return;
  state.moveInput = { x: vector.x, y: vector.y };
  if (vector.strength) ui.hint.style.opacity = 0;
}
// The canvas element is looked up directly so this module can evaluate
// before game.js finishes: only handlers touch game state, never top-level code.
const gameCanvas = document.getElementById("gameCanvas");
const joystickBase = $("joystickBase"), joystickThumb = $("joystickThumb");
const joystickState = { pointerId: null, center: null, radius: 0, keys: new Set() };
const joystickKeys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
function canUseJoystick() { return state.mode === "combat" && !state.paused; }
function resetJoystick() {
  const pointerId = joystickState.pointerId;
  joystickState.pointerId = null;
  joystickState.center = null;
  joystickState.keys.clear();
  state.moveInput = { x: 0, y: 0 };
  joystickBase.hidden = true;
  joystickThumb.style.transform = "translate(0px, 0px)";
  joystickBase.classList.remove("active");
  if (pointerId !== null && gameCanvas.hasPointerCapture?.(pointerId)) gameCanvas.releasePointerCapture(pointerId);
}
function syncJoystick() {
  const enabled = canUseJoystick();
  gameCanvas.setAttribute?.("aria-disabled", String(!enabled));
  ui.pulse.disabled = !enabled;
  if (!enabled) resetJoystick();
}
function showJoystickVector(vector, radius) {
  joystickThumb.style.transform = "translate(" + vector.x * radius + "px, " + vector.y * radius + "px)";
  joystickBase.classList.add("active");
  setCommand(vector);
}
function moveJoystick(event) {
  if (event.pointerId !== joystickState.pointerId) return;
  if (!canUseJoystick()) { resetJoystick(); return; }
  event.preventDefault();
  const vector = control.joystickVector({ x: event.clientX, y: event.clientY }, joystickState.center, joystickState.radius);
  showJoystickVector(vector, joystickState.radius);
}
gameCanvas.addEventListener("pointerdown", event => {
  if (!canUseJoystick() || joystickState.pointerId !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  joystickState.keys.clear();
  const rect = gameCanvas.getBoundingClientRect();
  joystickState.center = { x: event.clientX, y: event.clientY };
  joystickState.radius = 36;
  joystickBase.style.left = (event.clientX - rect.left) + "px";
  joystickBase.style.top = (event.clientY - rect.top) + "px";
  joystickBase.hidden = false;
  gameCanvas.focus?.({ preventScroll: true });
  joystickState.pointerId = event.pointerId;
  gameCanvas.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
gameCanvas.addEventListener("pointermove", moveJoystick);
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) gameCanvas.addEventListener(type, event => {
  if (event.pointerId === joystickState.pointerId) resetJoystick();
});
function moveKeyboardJoystick() {
  let x = 0, y = 0;
  for (const key of joystickState.keys) { x += joystickKeys[key][0]; y += joystickKeys[key][1]; }
  const vector = control.joystickVector({ x, y }, { x: 0, y: 0 }, 1, 0);
  setCommand(vector);
}
window.addEventListener("keydown", event => {
  if (!joystickKeys[event.code] || !canUseJoystick() || joystickState.pointerId !== null) return;
  event.preventDefault();
  joystickState.keys.add(event.code);
  moveKeyboardJoystick();
});
window.addEventListener("keyup", event => {
  if (!joystickKeys[event.code] || !joystickState.keys.has(event.code)) return;
  event.preventDefault();
  joystickState.keys.delete(event.code);
  if (!canUseJoystick()) resetJoystick(); else moveKeyboardJoystick();
});
window.addEventListener("blur",()=>{resetJoystick();if(!state.paused&&["combat","docking"].includes(state.mode))togglePause();});
window.addEventListener("resize", resetJoystick);
document.addEventListener?.("visibilitychange", () => { if(document.hidden){resetJoystick();if(!state.paused&&["combat","docking"].includes(state.mode))togglePause();} });

export { resetJoystick, syncJoystick };
