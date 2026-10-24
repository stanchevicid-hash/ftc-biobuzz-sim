// Bot drivers for the other robots: collect POLLEN, shoot into their own HIVE's upper CELL, park at the end.
// They send the same physical commands a TeleOp would (wheels, intake, flywheel, hood, feeder), so they obey the same physics.
import { HIVE, IN, ZONES, FLOWERS, qRotate, upCellSign } from './field.js';

const clamp = (v, a) => Math.max(-a, Math.min(a, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const v3 = (v) => [v.x, v.y, v.z];

/** wheel powers for a robot-frame motion: vx right, vy forward, w counter-clockwise (same mixing as manual driving) */
export function mix(robot, vx, vy, w) {
  const ws = robot.wheels.map(wh => {
    const v = [vx - w * wh.pos[1], vy + w * wh.pos[0]], c = wh.fwd[0] * wh.d[0] + wh.fwd[1] * wh.d[1];
    return (wh.d[0] * v[0] + wh.d[1] * v[1]) / (c || 1);
  });
  const mx = Math.max(1, ...ws.map(Math.abs));
  return Object.fromEntries(robot.wheels.map((wh, i) => [wh.motor, { mode: 'power', p: ws[i] / mx * (wh.motorDir ?? 1), brake: true }]));
}

export class Bot {
  constructor(alliance, index) { this.alliance = alliance; this.index = index; this.state = 'shoot'; this.target = null; this.stuck = 0; this.skip = new Map(); this.backUntil = 0; }

  /** field pose of the robot: position and the heading of its forward (+Y robot) axis */
  pose(robot) {
    const q = robot.body.rotation(), p = robot.body.translation(), f = qRotate(q, [0, 1, 0]), r = qRotate(q, [1, 0, 0]);
    return { x: p.x, y: p.y, h: Math.atan2(f[1], f[0]), f, r };
  }
  /** P controller to a field pose; returns wheel commands and whether it has arrived */
  driveTo(robot, tx, ty, th, maxP = 0.75) {
    const P = this.pose(robot), ex = tx - P.x, ey = ty - P.y, dist = Math.hypot(ex, ey);
    const fwd = ex * P.f[0] + ey * P.f[1], right = ex * P.r[0] + ey * P.r[1], eh = wrap(th - P.h);
    // a floor on the power: near the target a pure P term is too weak to beat the drivetrain's static friction
    const p = dist > 0.015 ? Math.max(0.14, Math.min(maxP, dist * 2.4)) : 0, k = p / Math.max(dist, 1e-6);
    const w = Math.abs(eh) > 0.01 ? Math.sign(eh) * Math.max(0.12, Math.min(0.8, Math.abs(eh) * 2.2)) : 0;
    return { cmd: mix(robot, clamp(right * k, maxP), clamp(fwd * k, maxP), w), arrived: dist < 0.04 && Math.abs(eh) < 0.03, dist, eh };
  }

  shootSpot(sim) {
    const h = sim.field.hives.find(x => x.alliance === this.alliance), up = upCellSign(h), q = h.body.rotation(), p = v3(h.body.translation());
    const open = qRotate(q, [up * HIVE.cellOuter, 0, (HIVE.cellZ0 + HIVE.cellZ1) / 2]);   // same aim point as the Test bench
    return { x: p[0] + open[0] + up * 42 * IN, y: p[1] + open[1], h: up > 0 ? Math.PI : 0 };
  }

  nearestBall(sim, P) {
    const claims = (sim.botClaims ||= new Map());
    let best = null, bd = Infinity;
    for (const b of sim.balls) {
      if (b.held || (b.type !== 'pollen' && b.color !== this.alliance) || (this.skip.get(b) ?? 0) > sim.t) continue;   // POLLEN, or own NECTAR from the human player
      const claimed = claims.get(b); if (claimed && claimed !== this) continue;
      const p = b.body.translation(); if (p.z > 0.06 || Math.abs(p.x) > 1.8 || Math.abs(p.y) > 1.8) continue;
      if (FLOWERS.some(f => Math.hypot(p.x - f.x, p.y - f.y) < 0.12)) continue;          // inside a FLOWER: not reachable
      const d = Math.hypot(p.x - P.x, p.y - P.y); if (d < bd) { bd = d; best = b; }
    }
    if (this.target && this.target !== best) claims.delete(this.target);
    if (best) claims.set(best, this);
    return best;
  }

  step(sim, robot) {
    const cfg = robot.cfg, L = (cfg.launchers || [])[0], P = this.pose(robot);
    const H = robot.holders.find(h => h.id === L?.holder) || robot.holders.find(h => h.intake) || robot.holders[0];
    const held = H ? H.balls.length : 0, left = 150 - (sim.t - (sim.scorer.matchStart ?? sim.t));
    const out = { motors: {}, servos: {} };
    const intake = (on) => { if (H?.intake) out.motors[H.intake.device] = { mode: 'power', p: on ? 1 : 0, brake: true }; };
    const flywheel = (rpm) => { if (L) out.motors[L.flywheel] = rpm ? { mode: 'velocity', tv: rpm / 60 * robot.motors[L.flywheel].m.ticks, brake: false } : { mode: 'power', p: 0, brake: false }; };
    if (L?.hood) out.servos[L.hood.device] = { pos: 0.7 };
    if (L) out.servos[L.feed.device] = { pos: 0 };

    // backing off after getting stuck
    if (sim.t < this.backUntil) { Object.assign(out.motors, mix(robot, 0, -0.5, 0.3)); return out; }

    if (left < 15) this.state = 'park';
    else if (this.state === 'seek' && held >= Math.min(3, H?.capacity ?? 3)) this.state = 'shoot';
    else if (this.state === 'shoot' && held === 0) this.state = 'seek';

    let move = null;
    if (this.state === 'park') {
      const z = ZONES.loading[this.alliance];
      move = this.driveTo(robot, (z[0] + z[1]) / 2 + (this.index % 2 ? 0.12 : -0.12), (z[2] + z[3]) / 2, this.alliance === 'red' ? -Math.PI / 2 : Math.PI / 2, 0.6);
      intake(false); flywheel(0);
    } else if (this.state === 'shoot') {
      // one robot per alliance at the shooting spot; a partner waits beside it
      const spots = (sim.botSpot ||= {}), owner = spots[this.alliance];
      if (!owner || owner === this || owner.state !== 'shoot') spots[this.alliance] = this;
      const s = this.shootSpot(sim), mine = spots[this.alliance] === this;
      move = mine ? this.driveTo(robot, s.x, s.y, s.h, 0.7) : this.driveTo(robot, s.x, s.y + (s.y > 0 ? -0.6 : 0.6), s.h, 0.7);
      if (!mine) move.dist = 1;
      flywheel(3000); intake(false);
      const load = cfg.motors.find(m => m.name === L?.flywheel)?.load, wheelRpm = Math.abs(load?.omega ?? 0) * 60 / (2 * Math.PI);
      const still = Math.hypot(robot.body.linvel().x, robot.body.linvel().y) < 0.03;
      if (L && still && move.dist < 0.04 && Math.abs(move.eh) < 0.03 && Math.abs(wheelRpm - 3000 / (load?.ratio ?? 1)) < 60) out.servos[L.feed.device] = { pos: 1 };
      if (held === 0 && !H) this.state = 'seek';
    } else {
      const b = this.nearestBall(sim, P); this.target = b;
      flywheel(0); intake(true);
      if (!b) { if (held) this.state = 'shoot'; move = { cmd: mix(robot, 0, 0, 0), dist: 0 }; }   // nothing loose: wait for the human player
      else {
        const p = b.body.translation(), face = Math.atan2(p.y - P.y, p.x - P.x);
        move = this.driveTo(robot, p.x, p.y, face, 0.6);
      }
    }
    Object.assign(out.motors, move.cmd);
    // stuck: wants to move but does not; back off and give up on that ball for a while
    const v = robot.body.linvel(), moving = Math.hypot(v.x, v.y) > 0.05;
    this.stuck = move.dist > 0.15 && move.dist < 1 && !moving ? this.stuck + 1 : 0;
    if (this.stuck > 120) { this.stuck = 0; this.backUntil = sim.t + 0.7; if (this.target) this.skip.set(this.target, sim.t + 8); }
    return out;
  }
}
