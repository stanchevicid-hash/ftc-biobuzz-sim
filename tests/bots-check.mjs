// Bots play a 2 v 2 TeleOp on their own: both alliances must score beyond the staged balls. Run: node tests/bots-check.mjs
import assert from 'assert';
const RAPIER = (await import('../web/vendor/rapier/rapier.es.js')).default; await RAPIER.init();
const { Simulation } = await import('../web/js/sim.js'); const { Bot } = await import('../web/js/bots.js');
const { DEMO_ROBOT } = await import('../web/js/robots/demo.js'); const { START_POSES } = await import('../web/js/field.js');
const others = [['Red - far side', 'red'], ['Blue - audience side', 'blue'], ['Blue - far side', 'blue']].map(([k, a]) => ({ cfg: DEMO_ROBOT, pose: START_POSES[k], alliance: a }));
const sim = new Simulation(RAPIER, { robotCfg: DEMO_ROBOT, pose: START_POSES['Red - audience side'], alliance: 'red', others, seed: 2 });
sim.others.forEach((o, i) => { o.bot = new Bot(o.alliance, i); });
sim.scorer.startMatch(sim.t - 38);
for (let k = 0; k < 60 / 0.01; k++) { sim.setCommands({}); for (const o of sim.others) o.applyCommands(o.bot.step(sim, o)); sim.tick(); }
const S = sim.scorer.breakdown(sim.t);
assert.ok(S.red.total > 15 && S.blue.total > 15, `both score: red ${S.red.total}, blue ${S.blue.total}`);
assert.ok(S.red.tips + S.blue.tips >= 1, 'a HIVE gets tipped');
console.log(`bots ok (${S.red.total} : ${S.blue.total} after 60 s)`);
