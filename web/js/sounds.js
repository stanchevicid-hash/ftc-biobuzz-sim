// Field audio cues (Competition Manual Table 9-1), synthesized with Web Audio so no sound files ship with the simulator.
// Drive teams react to these sounds, so practising with them matters: the buzzer ends AUTO, bells start TELEOP,
// the chime at 1:00 unlocks FLOWER scoring, the train whistle marks the last 20 s.
let ctx = null, muted = false;
try { muted = localStorage.getItem('ftcsim.mute') === '1'; } catch { }
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, start, dur, { type = 'sine', gain = 0.25, attack = 0.01, release = 0.15, slideTo = null, vibrato = 0 } = {}) {
  const a = ac(), t0 = a.currentTime + start, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  if (vibrato) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 6; lg.gain.value = vibrato; l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + release); }
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
const bell = (f, at) => { tone(f, at, 1.6, { gain: 0.22, attack: 0.002, release: 1.5 }); tone(f * 2.76, at, 0.9, { gain: 0.06, attack: 0.002, release: 0.85 }); };

const CUES = {
  // bugle call: G4 C5 E5 G5 ... E5 G5
  charge() { [[392, 0], [523, 0.16], [659, 0.32], [784, 0.48], [659, 0.78], [784, 0.94]].forEach(([f, t], i) => tone(f, t, i === 5 ? 0.7 : 0.15, { type: 'square', gain: 0.09, release: 0.05 })); },
  buzzer(seconds = 1.2) { tone(110, 0, seconds, { type: 'sawtooth', gain: 0.12 }); tone(113, 0, seconds, { type: 'sawtooth', gain: 0.08 }); },
  bells() { [0, 0.45, 0.9].forEach(t => bell(1046, t)); },
  chime() { bell(784, 0); bell(1046, 0.35); },
  whistle() { tone(880, 0, 0.9, { gain: 0.1, vibrato: 18 }); tone(1108, 0, 0.9, { gain: 0.08, vibrato: 18 }); },
  foghorn() { tone(70, 0, 1.8, { type: 'sawtooth', gain: 0.18, slideTo: 62 }); },
  pickUp() {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance('Drivers, pick up your controllers. 3, 2, 1'); u.rate = 1.05; u.lang = 'en-US';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  },
};

export function cue(name, ...args) {
  if (muted) return;
  try { ac().resume?.(); CUES[name]?.(...args); } catch { /* audio blocked until the first click: just skip */ }
}
export function setMuted(m) { muted = m; try { localStorage.setItem('ftcsim.mute', m ? '1' : '0'); } catch { } if (m) window.speechSynthesis?.cancel(); }
export const isMuted = () => muted;
