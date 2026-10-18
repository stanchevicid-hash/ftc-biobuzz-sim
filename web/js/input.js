// Gamepads (browser Gamepad API, "standard" mapping) and keyboard -> FTC gamepad1/gamepad2 fields.
const keys = new Set();
window.addEventListener('keydown', e => { if (!isTyping(e)) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); } });
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function isTyping(e) { const t = e.target; return t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable); }

const empty = () => ({ left_stick_x: 0, left_stick_y: 0, right_stick_x: 0, right_stick_y: 0, left_trigger: 0, right_trigger: 0, connected: false });

/** keyboard layout used as gamepad1 when no physical gamepad is assigned */
export const KEY_HELP = 'WASD left stick, arrows right stick (left/right turns), hold Shift for 40% stick, I J K L d-pad, 1 2 3 4 for A B X Y, Q E bumpers, Z C triggers, Enter start, Backspace back.';

function fromKeyboard() {
  const g = empty(), k = (c) => keys.has(c) ? 1 : 0;
  g.left_stick_x = k('KeyD') - k('KeyA');
  g.left_stick_y = k('KeyS') - k('KeyW');
  g.right_stick_x = k('ArrowRight') - k('ArrowLeft');
  g.right_stick_y = k('ArrowDown') - k('ArrowUp');
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) for (const a of ['left_stick_x', 'left_stick_y', 'right_stick_x', 'right_stick_y']) g[a] *= 0.4;   // precise driving
  g.left_trigger = k('KeyZ'); g.right_trigger = k('KeyC');
  Object.assign(g, { a: !!k('Digit1'), b: !!k('Digit2'), x: !!k('Digit3'), y: !!k('Digit4'), left_bumper: !!k('KeyQ'), right_bumper: !!k('KeyE'),
    dpad_up: !!k('KeyI'), dpad_down: !!k('KeyK'), dpad_left: !!k('KeyJ'), dpad_right: !!k('KeyL'), start: !!k('Enter'), back: !!k('Backspace'), connected: true });
  return g;
}

function fromPad(p) {
  const g = empty(), dz = (v) => Math.abs(v) < 0.06 ? 0 : v, b = (i) => !!p.buttons[i]?.pressed, a = (i) => p.buttons[i]?.value ?? 0;
  g.left_stick_x = dz(p.axes[0] ?? 0); g.left_stick_y = dz(p.axes[1] ?? 0);       // up is negative, as in the SDK
  g.right_stick_x = dz(p.axes[2] ?? 0); g.right_stick_y = dz(p.axes[3] ?? 0);
  g.left_trigger = a(6); g.right_trigger = a(7);
  Object.assign(g, { a: b(0), b: b(1), x: b(2), y: b(3), left_bumper: b(4), right_bumper: b(5), back: b(8), start: b(9),
    left_stick_button: b(10), right_stick_button: b(11), dpad_up: b(12), dpad_down: b(13), dpad_left: b(14), dpad_right: b(15),
    guide: b(16), touchpad: b(17), connected: true });
  return g;
}

/** assignment: which physical source feeds gamepad1/gamepad2: 'pad0', 'pad1', 'keyboard', 'none' */
export const assignment = { g1: 'auto', g2: 'auto' };

export function readGamepads() {
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
  const src = (sel, i) => {
    if (sel === 'keyboard') return fromKeyboard();
    if (sel === 'none') return empty();
    if (sel === 'auto') return pads[i] ? fromPad(pads[i]) : (i === 0 ? fromKeyboard() : empty());
    const p = pads[+sel.replace('pad', '')]; return p ? fromPad(p) : empty();
  };
  return [src(assignment.g1, 0), src(assignment.g2, 1)];
}
export function padNames() { return (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean).map(p => p.id); }

/** rumble feedback from the OpMode */
export function rumble(i, durationMs) {
  const p = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected)[i];
  p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: Math.min(durationMs, 5000), strongMagnitude: 1, weakMagnitude: 1 }).catch(() => {});
}
export const keyboardState = keys;
