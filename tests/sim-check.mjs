// Headless regression check of the simulation core (no browser, no Java):  node tests/sim-check.mjs
import RAPIER from '../web/vendor/rapier/rapier.es.js';
import { Simulation } from '../web/js/sim.js';
import { DEMO_ROBOT } from '../web/js/robots/demo.js';
import { START_POSES, IN, FRAME } from '../web/js/field.js';

await RAPIER.init();
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}  ${info}`); if (!ok) failed++; };
const W = ['frontLeft', 'frontRight', 'backLeft', 'backRight'], DIR = [-1, 1, -1, 1];
const mk = (pose) => new Simulation(RAPIER, { robotCfg: DEMO_ROBOT, pose, alliance: 'red', seed: 1 });
const drive = (sim, f, s, t) => {   // robot-centric powers, mecanum mixing like DemoTeleOp
  const p = [f + s, f - s, f - s, f + s];
  for (let k = 0; k < t / 0.01; k++) { sim.setCommands({ motors: Object.fromEntries(W.map((n, i) => [n, { mode: 'power', p: p[i] * DIR[i], brake: true }])) }); sim.tick(); }
};
const speed = (sim) => { const v = sim.robot.body.linvel(); return Math.hypot(v.x, v.y); };

// 1. top speed forward / sideways (datasheet: 312 rpm * pi * 104 mm = 1.70 m/s)
let sim = mk({ x: 0, y: -1.0, heading: 90 });
drive(sim, 1, 0, 1.0); const vf = speed(sim); sim.destroy();
check('forward top speed', vf > 1.45 && vf < 1.75, `${vf.toFixed(2)} m/s`);
sim = mk({ x: 0, y: -1.0, heading: 90 });
drive(sim, 0, 1, 1.0); const vs = speed(sim); sim.destroy();
check('strafe 75-92% of forward (mecanum rollers)', vs > 0.75 * vf && vs < 0.92 * vf, `${vs.toFixed(2)} m/s`);

// 2. straight line: identical motors drive straight; real (slightly different) motors curve a little, open loop
const straight = (spread) => {
  const s = new Simulation(RAPIER, { robotCfg: DEMO_ROBOT, pose: { x: 0, y: -1.2, heading: 90 }, alliance: 'red', seed: 1, noise: { motorSpreadPct: spread } });
  const h0 = s.robot.pose().heading, x0 = s.robot.body.translation().x;
  drive(s, 0.6, 0, 1.5); drive(s, 0, 0, 0.5);
  const r = [Math.abs(s.robot.pose().heading - h0), Math.abs(s.robot.body.translation().x - x0) / IN]; s.destroy(); return r;
};
const [dh, dx] = straight(0);
check('drives straight (identical motors)', dh < 1.0 && dx < 1.0, `heading ${dh.toFixed(2)} deg, sideways ${dx.toFixed(2)} in`);
const [rh, rx] = straight(1.5);
check('real motors curve a little', rh > 0.1 && rh < 10 && rx < 6, `heading ${rh.toFixed(2)} deg, sideways ${rx.toFixed(2)} in over ~1.4 m`);

// 3. starting against the wall: touching it, no creep while parked
sim = mk(START_POSES['Red - audience side']);
const y0 = sim.robot.body.translation().y;
for (let k = 0; k < 2000; k++) sim.tick();
const creep = Math.abs(sim.robot.body.translation().y - y0) / IN;
check('start touches wall, no creep', sim.scorer.touchingWall() && creep < 0.05, `creep ${creep.toFixed(3)} in / 20 s`);
// staged NECTAR must not tip the HIVEs by themselves
check('HIVEs stable with staged NECTAR', sim.field.hives.every(h => h.tips.length === 0), sim.field.hives.map(h => h.tips.length).join('/'));
sim.destroy();

// 4. shooting the 4 preloads into the raised red CELL tips the HIVE
sim = mk({ x: -1.4, y: 12.75 * IN, heading: 0 });
for (let k = 0; k < 600; k++) {
  const feed = sim.t > 1.8 && Math.floor((sim.t - 1.8) / 0.6) % 2 === 0;
  sim.setCommands({ motors: { shooter: { mode: 'velocity', tv: 2200 / 60 * 28, vpidf: [10, 3, 0, 0] } }, servos: { feeder: { pos: feed ? 1 : 0 }, hood: { pos: 0.9 } } });
  sim.tick();
}
const S = sim.scorer.breakdown(sim.t);
check('4 POLLEN tip the red HIVE', S.red.tips === 1 && sim.robot.launchers[0].shots === 4, `tips ${S.red.tips}, shots ${sim.robot.launchers[0].shots}, human-player NECTAR left ${sim.hp.red}`);
sim.destroy();

// 5. RUN_TO_POSITION accuracy (hub firmware emulation)
sim = mk({ x: 0, y: -1.2, heading: 90 });
const tpi = 537.7 / (Math.PI * 104 / 25.4), goal = Math.round(24 * tpi);
const start = W.map((n, i) => sim.robot.motors[n].pos * DIR[i]);
for (let k = 0; k < 400; k++) { sim.setCommands({ motors: Object.fromEntries(W.map((n, i) => [n, { mode: 'position', tp: (start[i] + goal) * DIR[i], vmax: 0.6 * 2377, pp: 10, vpidf: [10, 3, 0, 0], brake: true }])) }); sim.tick(); }
const moved = (sim.robot.body.translation().y + 1.2) / IN; sim.destroy();
check('RUN_TO_POSITION 24 in', Math.abs(moved - 24) < 0.8, `${moved.toFixed(2)} in`);

// 6. a second robot (defense): driving into our robot pushes it
sim = new Simulation(RAPIER, { robotCfg: DEMO_ROBOT, pose: { x: 0, y: 0, heading: 90 }, alliance: 'red', seed: 1,
  others: [{ cfg: DEMO_ROBOT, pose: { x: 0, y: -0.7, heading: 90 }, alliance: 'blue' }] });
const before = sim.robot.body.translation().y;
for (let k = 0; k < 150; k++) { sim.others[0].applyCommands({ motors: Object.fromEntries(W.map((n, i) => [n, { mode: 'power', p: 1 * DIR[i], brake: true }])) }); sim.tick(); }
const pushed = (sim.robot.body.translation().y - before) / IN; sim.destroy();
check('opponent pushes a braked robot', pushed > 3, `pushed ${pushed.toFixed(1)} in`);

// 7. the arc drawn for the driver is where the ball really flies (same drag and backspin lift), spread off
{
  const { mechCommands, predictArc } = await import('../web/js/manual.js');
  const s = new Simulation(RAPIER, { robotCfg: DEMO_ROBOT, pose: { x: -1.5, y: -1.2, heading: 0 }, alliance: 'red', seed: 1,
    noise: { shotSpeedPct: 0, shotAngleDeg: 0, motorSpreadPct: 0 } });
  s.setCommands(mechCommands({ a: true }, s.robot)); s.tick();
  for (let k = 0; k < 300; k++) { s.setCommands(mechCommands({}, s.robot)); s.tick(); }
  let arc = null, ball = null, held = new Set(s.balls.filter(b => b.held).map(b => b.id));
  for (let k = 0; k < 100 && !ball; k++) {
    arc = predictArc(s.robot);
    s.setCommands(mechCommands({ right_bumper: true }, s.robot)); s.tick();
    ball = s.balls.find(b => held.has(b.id) && !b.held);
  }
  // the arc starts at the exit one tick before the release: compare the next 40 ticks (0.4 s, ~2.5 m of flight)
  let worst = 0;
  for (let i = 1; i <= 40 && ball; i++) {
    const p = ball.body.translation(), a = arc[i]; if (!a) break;
    worst = Math.max(worst, Math.hypot(p.x - a[0], p.y - a[1], p.z - a[2]));
    s.setCommands(mechCommands({}, s.robot)); s.tick();
  }
  check("predicted arc matches the flight", ball && worst < 0.02, `largest gap ${(worst * 100).toFixed(1)} cm over 0.4 s`);
  s.destroy();
}

// 8. the HIVE frame legs are solid: the robot stops at a leg, a ball bounces off it
{
  const legX = (z) => FRAME.halfDepth * (1 - z / 43.95 / IN);   // leg's x at height z (+x leg)
  let s = mk({ x: 1.3, y: FRAME.halfWidth, heading: 180 });       // drive along the A-frame into its +x leg
  drive(s, 0.6, 0, 4);
  const x = s.robot.body.translation().x;
  check('robot stops at a HIVE frame leg', x > legX(0), `robot center ${(x / IN).toFixed(1)} in, leg base ${(legX(0) / IN).toFixed(1)} in`);
  s.destroy();
  s = mk({ x: 12 * IN, y: 1.4, heading: -90 });                   // drive across the A-frame where the leg is at bumper height
  drive(s, 0.6, 0, 4);
  const y = s.robot.body.translation().y;
  check('robot cannot cross a leg', y > FRAME.halfWidth, `robot center y ${(y / IN).toFixed(1)} in, frame at ${(FRAME.halfWidth / IN).toFixed(1)} in`);
  s.destroy();
  s = mk({ x: -1.3, y: -1.3, heading: 0 });
  const b = s.balls.find(bb => !bb.held);
  b.body.setTranslation({ x: 30 * IN, y: FRAME.halfWidth, z: 6 * IN }, true); b.body.setLinvel({ x: -3, y: 0, z: 0 }, true);
  for (let k = 0; k < 50; k++) s.tick();
  const bx = b.body.translation().x;
  check('ball bounces off a leg', bx > legX(6 * IN), `ball x ${(bx / IN).toFixed(1)} in, leg ${(legX(6 * IN) / IN).toFixed(1)} in`);
  s.destroy();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
