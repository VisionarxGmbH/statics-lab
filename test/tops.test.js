/* Where a member moves most (FS.mostMoved) and where the deflection of a beam turns (FS.wTops), against scans of the
   line itself that share no step with the two searches.
   States: the 16 examples with random supports, hinges, stiffness, section, lengths (the page's own stretch of a step
   of the grid of the joints, 0.5 to 30 m) and profiles of single members, a distributed load in one of four
   directions on some members, and up to eight point loads on a member: across it, along it and at an angle, from 0.1 to
   1000 kN, placed to the centimetre and often 1 cm from the load before or from a joint.
   (1) Every member: the movement is read at 3000 even places and at every station; around the largest value the top is
       refined (golden section between the two neighbouring places). FS.mostMoved must not lie below it.
   (2) Every member of a beam: the slope is read at the same places; every change of its sign is a turn, refined by
       halving. Every such turn must be among those of FS.wTops, and the slope must change its sign at every turn that
       FS.wTops names. A change of sign within a billionth of the member from one of its ends is that end: a joint and
       a free end carry their own numbers on the page, and at a fixed end the slope is zero but for the last digits.
   (3) Every member: its stations are in rising order; two stand at one place only as the two sides of a point load;
       every point load inside the member has its two stations at its own place; every stored N, V and M is the value of
       the line there; the step of N and V at a load point is the sum of the loads at that place. Members with a free end
       and point loads alone are among the states: behind their last load N and V are zero, so a zero of a force lies on
       a load point.
   (4) Every state: the largest force that the analysis states (fmax) is the largest of the reaction forces and of the
       stored N and V of all members; the force it cannot tell from zero (nilF) follows from it and from the stated
       uncertainty; the largest displacement (max.D) is the largest that FS.mostMoved finds on a member, and no smaller
       than the scan of any member.
   A movement below 1e-10 mm is the last digits of the arithmetic: it is not compared, and a beam member that deflects
   less has no turns to compare.
   Run: node test/tops.test.js [states] [seed] */
global.FS = require('../src/solver.js');
const { SECTIONS, PRESETS, buildModel, sectionEI, sectionEA } = require('../src/presets.js');
const vary = require('./vary.js');

let seed = +process.argv[3] || 1, stretched = 0, profiled = 0;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const states = +process.argv[2] || 2400, SCAN = 3000, FLOOR = 1e-13;   /* FLOOR: 1e-10 mm, a movement below it is not told from zero */
let solved = 0, members = 0, inner = 0, bars = 0, barsLoaded = 0, above = 0, fail = 0, beamMembers = 0, still = 0, ends = 0, loadPoints = 0, turnsScan = 0, turnsPage = 0, close = 0, signs = 0, worst = 0;

for (let r = 0; r < states; r++) {
  const p = PRESETS[r % PRESETS.length], m = buildModel(p), sec = pick(SECTIONS);
  for (const n of m.nodes) { if (n.cs && rnd() < 0.15) n.sup = pick(['fixed', 'pin', 'roller', 'free']); if (n.ch && rnd() < 0.15) n.hinge = !n.hinge; }
  m.loads = [];
  if (rnd() < 0.5) vary.lengths(m, rnd, 0.4);   /* half of the states: each step of the grid gets a length from the list with probability 0.4, before the loads are set */
  if (vary.steps(m, buildModel(p))[0]) stretched++;   /* counted from what the state ends with */
  m.members.forEach((mb, mi) => {
    const A = m.nodes[mb.n1], B = m.nodes[mb.n2], L = Math.hypot(B.x - A.x, B.y - A.y);
    if (rnd() < 0.3) { mb.kf = pick([0.5, 1, 2, 4]); mb.ka = pick([0.5, 1, 2]); }
    const u = mb.udl, sh = rnd(), w = pick([0.5, 10, 100, 500]);
    u.on = rnd() < 0.4; u.w1 = sh < 0.5 ? w : sh < 0.67 ? 0 : sh < 0.84 ? w : pick([1, 4, 20]); u.w2 = sh < 0.5 ? w : sh < 0.67 ? w : sh < 0.84 ? 0 : w; u.ang = pick([-90, 90, 0, 180]);
    const k = rnd() < 0.45 ? 0 : 1 + Math.floor(rnd() * 8);
    let a = 0;
    for (let i = 0; i < k; i++) {
      const how = rnd();
      a = how < 0.35 && i ? Math.min(L, a + 0.01) : how < 0.45 ? pick([0.01, L - 0.01, 0, L]) : Math.round(rnd() * L * 100) / 100;
      m.loads.push({ id: m.nid++, m: mi, a, P: Math.round(10 ** (-1 + 4 * rnd()) * 10) / 10 || 0.1, ang: pick([-90, 90, 0, 180, -90, 90, 0, 180, -45, 30, 120]) });
    }
  });
  if (rnd() < 0.3) vary.profiles(m, rnd, SECTIONS.indexOf(sec), 0.4);   /* profiles of single members: their factors replace the ones above */
  if (vary.ownProfile(m, SECTIONS.indexOf(sec))) profiled++;
  let sol;
  try { sol = FS.analyse(m, sectionEI(sec), sectionEA(sec)); } catch (err) { fail++; console.log(`THROW ${p.id}: ${err.message}`); continue; }
  if (!sol.ok) continue;
  solved++;
  if (sol.limit === 'steps') { fail++; console.log(`FAIL ${p.id}: the rigid members were not solved exactly`); }
  const beam = m.nodes.every(n => Math.abs(n.y - m.nodes[0].y) < 1e-9), dMax = sol.max.D;
  /* (4) the largest values of the structure */
  {
    let fm = 0, dm = 0;
    for (const r of sol.reactions) fm = Math.max(fm, Math.abs(r.Rx), Math.abs(r.Ry));
    for (const M of sol.mem) { for (let i = 0; i < M.smp.xs.length; i++) fm = Math.max(fm, Math.abs(M.smp.N[i]), Math.abs(M.smp.V[i])); dm = Math.max(dm, FS.mostMoved(M).v); }
    const nf = 1e-9 + 100 * (sol.err ? sol.err.F : 0) + 1e-10 * fm;
    if (sol.fmax !== fm) { fail++; if (fail <= 12) console.log(`FAIL ${p.id}: the largest force is stated as ${sol.fmax} kN, the stored values and reactions give ${fm} kN`); }
    if (!(Math.abs(sol.nilF - nf) <= 1e-12 * nf) || sol.mem.some(M => M.nilF !== sol.nilF)) { fail++; if (fail <= 12) console.log(`FAIL ${p.id}: the force that cannot be told from zero is stated as ${sol.nilF}, expected ${nf}`); }
    if (sol.max.D !== dm) { fail++; if (fail <= 12) console.log(`FAIL ${p.id}: the largest displacement is stated as ${sol.max.D} m, the members give ${dm} m`); }
  }
  sol.mem.forEach((M, mi) => {
    const S = M.smp, L = M.L, xs = [...new Set([...S.xs, ...Array.from({ length: SCAN + 1 }, (_, i) => L * i / SCAN)])].sort((a, b) => a - b);
    const size = x => { const q = S.fine(x); return Math.hypot(q.dX, q.dY); };
    /* (1) the largest movement */
    members++;
    const isBar = isFinite(M.EA); if (isBar) { bars++; if (M.ll.pts.length || Math.abs(M.ll.q1x) + Math.abs(M.ll.q1y) + Math.abs(M.ll.tx) + Math.abs(M.ll.ty) > 0) barsLoaded++; }
    let bi = 0, bv = -1;
    const v = xs.map(size);
    v.forEach((q, i) => { if (q > bv) { bv = q; bi = i; } });
    let lo = xs[Math.max(0, bi - 1)], hi = xs[Math.min(xs.length - 1, bi + 1)];
    const G = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 80 && hi - lo > 1e-13 * L; k++) { const x1 = hi - G * (hi - lo), x2 = lo + G * (hi - lo); if (size(x1) > size(x2)) hi = x2; else lo = x1; }
    const scan = Math.max(bv, size((lo + hi) / 2)), top = FS.mostMoved(M), tol = 1e-9 * scan + 1e-12 * dMax + FLOOR;
    if (top.inner) inner++;
    if (top.v > scan + tol) above++;
    if (!(dMax >= scan - tol)) { fail++; if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}: the largest displacement of the structure, ${dMax} m, is below the scan of this member, ${scan} m`); }
    if (!(top.v >= scan - tol)) { fail++; worst = Math.max(worst, (scan - top.v) / (scan || 1)); if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}${isBar ? ' (bar)' : ''}: the search gives ${top.v} m at ${top.x} m, the scan ${scan} m at ${(lo + hi) / 2} m; loads ${JSON.stringify(m.loads.filter(l => l.m === mi).map(l => [l.a, l.P, l.ang]))}, udl ${JSON.stringify(m.members[mi].udl)}`); }
    if (!(Math.abs(size(top.x) - top.v) <= 1e-12 * Math.max(top.v, dMax) + 1e-20)) { fail++; console.log(`FAIL ${p.id} member ${mi}: ${top.v} m is not the movement at ${top.x} m (${size(top.x)})`); }
    /* (3) the stations: in rising order; two at one place only as the two sides of a point load; every point load inside
       the member with exactly two stations at its own place, before and after; every stored N, V, M the value of the
       line at that place and side; and the step of N and V at a load point the loads that stand there */
    {
      const bad = t => { fail++; if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}: stations: ${t}; loads ${JSON.stringify(m.loads.filter(l => l.m === mi).map(l => [l.a, l.P, l.ang]))}`); };
      const places = [...new Set(M.ll.pts.map(q => q.a).filter(a => a > 1e-9 && a < L - 1e-9))];
      if (S.xs[0] !== 0 || S.xs[S.xs.length - 1] !== L) bad(`the first and the last station are not the two ends of the member: ${S.xs[0]} and ${S.xs[S.xs.length - 1]} for a length of ${L} m`);
      for (let i = 0; i < S.xs.length; i++) {
        const f = FS.forcesAt(M, S.xs[i], S.side[i]);
        if (f.N !== S.N[i] || f.V !== S.V[i] || f.M !== S.M[i]) bad(`the values kept at ${S.xs[i]} m are not those of the line there`);
        if (i && !(S.xs[i] >= S.xs[i - 1])) bad(`not in rising order at ${S.xs[i]} m`);
        if (i && S.xs[i] === S.xs[i - 1] && !(S.side[i - 1] === -1 && S.side[i] === 1 && places.includes(S.xs[i]))) bad(`two stations at ${S.xs[i]} m that are not the two sides of a load`);
        if (i && S.xs[i] > S.xs[i - 1] && S.xs[i] - S.xs[i - 1] < 1e-9 * L) bad(`two stations ${S.xs[i] - S.xs[i - 1]} m apart at ${S.xs[i]} m`);
      }
      for (const a of places) {
        const k = S.xs.indexOf(a); loadPoints++;
        if (!(k >= 0 && S.xs[k + 1] === a && S.xs[k + 2] !== a && S.side[k] === -1 && S.side[k + 1] === 1)) { bad(`the load at ${a} m has not its two stations at its own place`); continue; }
        const here = M.ll.pts.filter(q => q.a === a), px = here.reduce((t, q) => t + q.px, 0), py = here.reduce((t, q) => t + q.py, 0), sc = 1e-9 * Math.max(1, Math.abs(px), Math.abs(py), Math.abs(S.N[k]), Math.abs(S.V[k]));
        if (!(Math.abs(Math.abs(S.N[k + 1] - S.N[k]) - Math.abs(px)) <= sc && Math.abs(Math.abs(S.V[k + 1] - S.V[k]) - Math.abs(py)) <= sc)) bad(`the step at ${a} m is N ${S.N[k + 1] - S.N[k]}, V ${S.V[k + 1] - S.V[k]}; the loads there are ${px} along and ${py} across`);
      }
    }
    /* (2) the turns of the deflection of a beam */
    if (!beam) return;
    if (Math.max(...Array.from(S.dY, Math.abs)) < FLOOR) { still++; return; }   /* a member that does not deflect: its line is the last digits of the arithmetic */
    beamMembers++;
    const sl = x => S.fine(x).rot, big = Math.max(...xs.map(x => Math.abs(sl(x)))), sg = q => (Math.abs(q) <= 1e-11 * big ? 0 : Math.sign(q)), found = [];
    let last = 0, lastX = 0;
    for (const x of xs) {
      const q = sg(sl(x));
      if (q && last && q !== last) { let a = lastX, b = x; for (let k = 0; k < 60; k++) { const xm = (a + b) / 2; if (sg(sl(xm)) === last) a = xm; else b = xm; } const xt = (a + b) / 2; if (xt > 1e-9 * L && xt < L * (1 - 1e-9)) found.push(xt); else ends++; }
      if (q) { last = q; lastX = x; }
    }
    const tops = FS.wTops(M), page = tops.map(t => t[0]);
    turnsScan += found.length; turnsPage += page.length;
    for (const x of found) if (!page.some(t => Math.abs(t - x) <= 1e-6 * L)) { fail++; if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}: the slope turns at ${x} m, FS.wTops names ${JSON.stringify(page)}; loads ${JSON.stringify(m.loads.filter(l => l.m === mi).map(l => [l.a, l.P, l.ang]))}`); }
    for (const t of page) {
      const d = 1e-7 * L, a = sg(sl(Math.max(0, t - d))), b = sg(sl(Math.min(L, t + d)));
      if (!a || !b) { close++; continue; }      /* the slope is too flat beside the turn to say: counted apart */
      if (a === b) { fail++; if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}: FS.wTops names a turn at ${t} m, the slope keeps its sign there`); }
      /* the sign that FS.wTops names for the slope before the turn is the one found here: by it the sheet tells a peak from a low point */
      signs++; if (tops.find(q => q[0] === t)[3] !== 0 - a) {   /* the deflection is counted downward, the stored rotation counter-clockwise: the slope of the line is minus that rotation */ fail++; if (fail <= 12) console.log(`FAIL ${p.id} member ${mi}: at the turn at ${t} m FS.wTops names the slope before it as ${tops.find(q => q[0] === t)[3]}, the scan finds ${0 - a}`); }
    }
  });
}
console.log(`${states} random states: ${solved} solved; ${members} members, ${bars} of them bars (${barsLoaded} with loads of their own), ${inner} with their largest movement inside the member`);
console.log(`largest movement: below the scan in ${fail ? 'some: see above' : '0'} members; above the scan by more than 1e-9 in ${above} (the search found a top that the scan of ${SCAN} places stepped over)`);
console.log(`turns of the deflection of ${beamMembers} beam members that deflect (${still} further ones move less than 1e-10 mm): ${turnsScan} found by the scan, ${turnsPage} named by the search (${ends} changes of sign at an end of a member are not counted); ${close} of the named turns lie where the slope is too flat to read its sign 1e-7 of the member beside them; at the other ${signs} the line rises or falls to the turn as the search says`);
console.log(`stations of all members: in rising order, each stored value that of the line at its place and side; ${loadPoints} places of point loads inside a member, each with its two stations at its own place and with the step of N and V that its loads make`);
console.log(`largest values of the ${solved} solved states: the largest force is the largest of the reactions and of the stored N and V; the largest displacement is the largest that a member reaches along its length, never below the scan of a member`);
console.log(`states that end with a length other than that of the example: ${stretched}; with a member whose profile is not that of the structure: ${profiled}`);
console.log(`${fail} failures`);
process.exit(fail ? 1 : 0);
