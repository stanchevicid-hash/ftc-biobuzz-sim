// Wiring layer: the code reaches devices through configuration names and hub ports, with real-world mistakes.
// Run: node tests/wiring-check.mjs
import assert from 'assert';
const RAPIER = (await import('../web/vendor/rapier/rapier.es.js')).default; await RAPIER.init();
const { Simulation } = await import('../web/js/sim.js');
const W = await import('../web/js/wiring.js');
const { DEMO_ROBOT } = await import('../web/js/robots/demo.js');
const clone = (o) => JSON.parse(JSON.stringify(o));
const pose = { x: -1.2, y: -1.0, heading: 0 };

// 1. Auto-wire: every device gets a port, the configuration uses the device names, the doctor is happy
const wired = { ...clone(DEMO_ROBOT), ...W.autoWire(DEMO_ROBOT) };
const devs = W.physicalDevices(DEMO_ROBOT);
assert.equal(Object.keys(wired.wiring.ports).length, devs.length, 'every device plugged in');
assert.ok(Object.keys(wired.wiring.ports).filter(k => k.startsWith('CH:motor')).every(k => devs.find(d => d.id === wired.wiring.ports[k]).drive), 'drive motors on the Control Hub');
assert.deepEqual(W.doctor(wired).map(r => r.level), ['pass']);
let sim = new Simulation(RAPIER, { robotCfg: wired, pose, preload: 0 });
assert.ok(sim.devices().some(d => d.name === 'frontLeft' && d.type === 'motor'), 'code sees configured names');
sim.destroy();

// 2. Cable in the wrong port: the configuration says frontLeft on port 0, but backLeft's cable is there
const swappedCables = clone(wired), P = swappedCables.wiring.ports;
const kFL = Object.keys(P).find(k => P[k] === 'frontLeft'), kBL = Object.keys(P).find(k => P[k] === 'backLeft');
[P[kFL], P[kBL]] = [P[kBL], P[kFL]];
sim = new Simulation(RAPIER, { robotCfg: swappedCables, pose, preload: 0 });
for (let i = 0; i < 30; i++) { sim.setCodeCommands({ motors: { frontLeft: { mode: 'power', p: 1 } } }); sim.tick(); }
assert.ok(Math.abs(sim.robot.motors.backLeft.duty) > 0.9 && sim.robot.motors.frontLeft.duty === 0, 'code drives frontLeft, backLeft moves');
assert.ok(W.doctor(swappedCables).some(r => r.title.includes('"frontLeft" points at')), 'doctor names the swapped cables');
sim.destroy();

// 3. Swapped motor leads: power works backwards, the encoder still reads the shaft, RUN_TO_POSITION runs away
const leads = clone(wired); leads.wiring.swapped = { lift: true };
sim = new Simulation(RAPIER, { robotCfg: leads, pose, preload: 0 });
for (let i = 0; i < 40; i++) { sim.setCodeCommands({ motors: { lift: { mode: 'position', tp: 400, vmax: 2000 } } }); sim.tick(); }
const liftPos = sim.readSensors().motors.lift.pos;
// it starts on the bottom stop, so "running away" means pushing down into the stop at full power, never reaching 400
assert.ok(liftPos < 50 && Math.abs(sim.robot.motors.lift.duty) > 0.95, `stalls against the stop: pos ${liftPos}, duty ${sim.robot.motors.lift.duty}`);
// a free-spinning motor shows it plainly: positive power, negative encoder
const fly = clone(wired); fly.wiring.swapped = { shooter: true };
sim.destroy(); sim = new Simulation(RAPIER, { robotCfg: fly, pose, preload: 0 });
for (let i = 0; i < 40; i++) { sim.setCodeCommands({ motors: { shooter: { mode: 'power', p: 0.5 } } }); sim.tick(); }
assert.ok(sim.readSensors().motors.shooter.vel < 0, 'positive power, encoder counts down');
assert.ok(W.doctor(leads).some(r => r.title.includes('power and encoder disagree')));
sim.destroy();

// 4. Color sensor (I2C) in a digital port: the plug fits, the sensor does not answer
const wrongPort = clone(wired), Q = wrongPort.wiring.ports, kC = Object.keys(Q).find(k => Q[k] === 'intakeColor');
delete Q[kC]; Q['CH:digital:5'] = 'intakeColor'; wrongPort.hubConfig['CH:digital:5'] = wrongPort.hubConfig[kC]; delete wrongPort.hubConfig[kC];
assert.ok(W.doctor(wrongPort).some(r => r.level === 'fail' && r.title.startsWith('intakeColor is in')), 'doctor: wrong kind of port');
assert.equal(W.harness(wrongPort).entries.find(e => e.name === 'intakeColor').physical, null, 'sensor does not answer');

// 5. Code asks for a name the configuration does not have
assert.ok(W.doctor(wired, [{ name: 'leftFront', type: 'motor' }]).some(r => r.title.includes('"leftFront"')));
console.log('wiring ok');
