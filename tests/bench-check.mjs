// Test bench on the demo robot: each test must run and give believable numbers. Run: node tests/bench-check.mjs
import assert from 'assert';
const RAPIER = (await import('../web/vendor/rapier/rapier.es.js')).default; await RAPIER.init();
const B = await import('../web/js/bench.js'); const { DEMO_ROBOT } = await import('../web/js/robots/demo.js');

const s = await B.shooterTest(RAPIER, DEMO_ROBOT, { distIn: 42, rpm: 3000, hood: 0.7, shots: 3 });
assert.equal(s.rows.length, 3, 'fires every preloaded ball');
assert.ok(s.spinUp > 0.5 && s.spinUp < 4, 'flywheel spin-up ' + s.spinUp);
assert.ok(s.rows.every(r => r.rpmAfter < r.rpmBefore), 'each shot slows the flywheel');
assert.ok(s.rows.filter(r => r.hit).length >= 2, 'known-good setting scores');
const i = await B.intakeTest(RAPIER, DEMO_ROBOT, { balls: 5, power: 0.3 });
assert.equal(i.held, 4, 'intake fills to capacity');
const d = await B.driveTest(RAPIER, DEMO_ROBOT, {});
assert.ok(d.forward.vmax > 1.4 && d.forward.vmax < 1.8, 'forward speed ' + d.forward.vmax);
assert.ok(d.strafe.vmax > 0.75 * d.forward.vmax, 'strafe speed');
const j = await B.jointTest(RAPIER, DEMO_ROBOT, 'hood', {});
assert.ok(Math.abs(j.qTop - j.qEnd) < 0.05, 'servo holds');
console.log('bench ok');
