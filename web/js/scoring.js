// BIOBUZZ scoring, Competition Manual section 10.5 / Table 10-2.
import { HIVE, FLOWER, ZONES, FIELD_HALF, IN, qRotate, qConj, upCellSign, inPentagon } from './field.js';

export const POINTS = { leave: 3, autoPark: 5, teleopPark: 5, tip: 20, cell: 2, bottomNectar: 5, flower: 2, garden: 1 };
export const AUTO_S = 30, TRANSITION_S = 8, TELEOP_S = 120;

const arr = (o) => [o.x, o.y, o.z];

export class Scorer {
  constructor(sim) { this.sim = sim; this.reset(); }
  reset() {
    this.auto = { leave: false, park: false };
    this.teleopPark = false;
    this.tipBase = this.sim.field.hives.map(h => h.tips.length);
    this.matchStart = null;
  }
  startMatch(t) { this.reset(); this.matchStart = t; }

  footprintBounds() {
    const pts = this.sim.robot.footprint();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  }
  touchingWall() {
    const [x0, x1, y0, y1] = this.footprintBounds(), e = 0.006;
    return x0 < -FIELD_HALF + e || x1 > FIELD_HALF - e || y0 < -FIELD_HALF + e || y1 > FIELD_HALF - e;
  }
  inLoadingZone(alliance) {
    const [x0, x1, y0, y1] = this.footprintBounds(), z = ZONES.loading[alliance];
    return x1 >= z[0] && x0 <= z[1] && y1 >= z[2] && y0 <= z[3];
  }
  endAuto() { const a = this.sim.alliance; this.auto.leave = !this.touchingWall(); this.auto.park = this.inLoadingZone(a); }
  endMatch() { this.teleopPark = this.inLoadingZone(this.sim.alliance); }

  /** live breakdown; robot items count for the simulated robot's alliance only */
  breakdown(t) {
    const S = { red: zero(), blue: zero() }, sim = this.sim;
    const elapsed = this.matchStart == null ? Infinity : t - this.matchStart;
    // tips (each HIVE belongs to its alliance; only LAUNCHING into the upward cell may cause it)
    sim.field.hives.forEach((h, i) => {
      for (const tt of h.tips.slice(this.tipBase[i])) {
        const rel = this.matchStart == null ? Infinity : tt - this.matchStart;
        if (rel <= AUTO_S + TRANSITION_S) S[h.alliance].autoTips++; else S[h.alliance].teleopTips++;
      }
    });
    const free = sim.balls.filter(b => !b.held);
    // elements remaining in the upward-facing cell
    for (const h of sim.field.hives) {
      const up = upCellSign(h), q = h.body.rotation(), p = arr(h.body.translation());
      for (const b of free) {
        const l = qRotate(qConj(q), sub(arr(b.body.translation()), p));
        if (l[0] * up > HIVE.cellInner && l[0] * up < HIVE.cellOuter && inPentagon(l[1], l[2])) S[h.alliance].cell++;
      }
    }
    // flowers: stack between the top ring and the middle ring
    S.flowers = [];
    for (const f of sim.field.flowers) {
      const inside = free.map(b => ({ b, p: arr(b.body.translation()) }))
        .filter(({ b, p }) => Math.hypot(p[0] - f.x, p[1] - f.y) < FLOWER.innerR + 0.5 * IN && p[2] + b.r > FLOWER.midZ && p[2] - b.r < FLOWER.topZ)
        .sort((a, b) => a.p[2] - b.p[2]);
      const nectar = inside.filter(x => x.b.type === 'nectar');
      const owner = nectar.length ? nectar[nectar.length - 1].b.color : null;
      if (owner) S[owner].flowerElems += inside.length;
      if (nectar.length) S[nectar[0].b.color].bottomNectar++;
      S.flowers.push({ id: f.id, owner, count: inside.length });
    }
    // gardens: at least partially inside the 2 in x 23 in zone
    for (const a of ['red', 'blue']) {
      const z = ZONES.garden[a];
      for (const b of free) { const p = arr(b.body.translation()); if (p[0] + b.r >= z[0] && p[0] - b.r <= z[1] && p[1] + b.r >= z[2] && p[1] - b.r <= z[3]) S[a].garden++; }
    }
    const me = sim.alliance;
    S[me].leave = this.auto.leave; S[me].autoPark = this.auto.park; S[me].teleopPark = this.teleopPark;
    for (const a of ['red', 'blue']) {
      const s = S[a];
      s.auto = (s.leave ? POINTS.leave : 0) + (s.autoPark ? POINTS.autoPark : 0) + s.autoTips * POINTS.tip;
      s.total = s.auto + (s.teleopPark ? POINTS.teleopPark : 0) + s.teleopTips * POINTS.tip + s.cell * POINTS.cell
        + s.bottomNectar * POINTS.bottomNectar + s.flowerElems * POINTS.flower + s.garden * POINTS.garden;
      s.tips = s.autoTips + s.teleopTips;
    }
    S.elapsed = elapsed;
    return S;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const zero = () => ({ leave: false, autoPark: false, teleopPark: false, autoTips: 0, teleopTips: 0, cell: 0, bottomNectar: 0, flowerElems: 0, garden: 0, auto: 0, total: 0, tips: 0 });
