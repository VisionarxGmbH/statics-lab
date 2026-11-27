/* Random edits of every preset: the solver must stay in equilibrium, every hand row must match, nothing may throw.
   Among the edits: another length for a step of the grid of the joints (the page's own stretch, 0.5 to 30 m) and a
   profile of its own for a member, as the menus of the page set them.
   Run: node test/fuzz.test.js [rounds] */
global.FS = require('../src/solver.js');
const { SECTIONS, PRESETS, buildModel, sectionEI, sectionEA, gridOf, stretch, memLen } = require('../src/presets.js');
const CARDS = require('../src/cards.js');
const vary = require('./vary.js'), { LENGTHS } = vary;

let seed = +process.argv[3] || 12345, stretched = 0, profiled = 0, rot = 0, exactLimit = 0;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const rounds = +process.argv[2] || 4000;
let solved = 0, unstable = 0, rows = 0, cards = {}, fail = 0, lines = 0;
const W = { hand: 0, member: 0, sums: 0, joints: 0, cover: 0 };   /* the largest difference of each kind that was met */
/* The analysis says what it cannot tell from zero: for a force nilF, for a moment nilM, for a displacement nilD (FS
   lines): a floor, a hundred times the amount it states for that kind of value (FS.analyse, err) and, for the last
   digits of the arithmetic, 1e-10 of the largest value of its kind in the structure (the largest force; for a moment
   that force times the longest member; for a displacement the deflection that force would give the longest member as a
   cantilever of the smallest bending stiffness). The page calls a line zero below these amounts. Measured here: the
   difference between a hand value and the analysis as a share of that amount, each row in its own unit; it must stay
   below 1, so that a value which is zero by hand is zero for the page. The last digits are measured against the
   structure, not against the row: a shear that is zero by hand comes out of the analysis with the last digits of the
   largest force. Up to draft H this measure took 1e-12 of the value of the row for the last digits; with the lengths
   that can be typed since version 13 a truss 0.5 m high with a panel of 18 m meets its bar forces to 1.6e-12 of their
   size, more than that, and far less than what the page takes for zero. A row in metres, the place where a shear is
   zero, and a row in mrad, a rotation, have no such amount: they are counted apart and held by the row comparison */
const UNC = { kN: 'F', kNm: 'M', mm: 'u' };
let covered = 0, places = 0, others = 0;   /* rows set against the uncertainty; rows in metres (a place along a member); rows in another unit */
const cover = (q, sol) => { const k = UNC[q.u]; if (q.ref === null) return; if (!k) { if (q.u === 'm') places++; else if (q.u === 'mrad') rot++; else others++; return; } covered++; const f = q.u === 'mm' ? 1e-3 : 1, d = Math.abs(q.v - q.ref) * f, nil = k === 'F' ? sol.nilF : k === 'M' ? sol.nilM : sol.nilD, c = d / nil; if (!(nil > 0)) { fail++; console.log('FAIL: no amount for ' + k); } if (c > W.cover) { W.cover = c; W.coverRow = `${plain(q.f)} = ${q.v} ${q.u} (analysis ${q.ref}), difference ${d}${q.u === 'mm' ? ' m' : ' ' + q.u}, not told from zero below ${nil}, stated ${sol.err[k]}, largest force ${sol.fmax}`; } if (c > 1) { fail++; console.log(`FAIL uncertainty: ${plain(q.f)}: difference ${d}, not told from zero below ${nil}, stated ${sol.err[k]}, value ${q.ref}, largest force ${sol.fmax}, line ${q.s}, lengths ${sol.mem.map(M => M.L)}`); } };
const { plain } = require('./plain.js');   /* the text of a formula for the messages: a fraction keeps its bar */
/* the line "with the numbers" is arithmetic: worked out as it is printed, it must give the value of its row */
const { calc } = require('./lines.js');
const { exact } = require('./exact.js');
let exactN = 0, apart = 0, withRef = 0;
/* a hand value and the value of the analysis agree within the tolerance; on a half step they can still print one digit apart */
const digits = q => { if (q.ref === null || q.u === '') return; withRef++; if (CARDS.fix(q.v, q.dec || 1) !== CARDS.fix(q.ref, q.dec || 1)) apart++; };
const line = (q, where) => {
  if (!q.s) return;
  lines++;
  let v;
  try { v = calc(q.s); } catch (err) { fail++; console.log(`FAIL ${where} | ${plain(q.f)} | line "${q.s}": ${err.message}`); return; }
  if (!(Math.abs(v - q.v) <= 1e-5 * Math.max(1, Math.abs(q.v)))) { fail++; console.log(`FAIL ${where} | ${plain(q.f)} | line "${q.s}" gives ${v}, row says ${q.v}`); }
  /* the printed value is the line worked out and rounded once: the digits agree */
  else if (q.u !== '' && CARDS.fix(v, q.dec || 1) !== CARDS.fix(q.v, q.dec || 1)) { fail++; console.log(`FAIL ${where} | ${plain(q.f)} | line "${q.s}" gives ${v}: prints ${CARDS.fix(v, q.dec || 1)}, the row prints ${CARDS.fix(q.v, q.dec || 1)}`); }
  /* the decimal reference: the line in exact fractions, rounded half away from zero, must give the printed digits */
  else if (q.u !== '') { let ex; try { ex = exact(q.s, q.dec || 1); } catch (err) { fail++; console.log(`FAIL ${where} | line "${q.s}": ${err.message}`); return; }
    if (ex !== null) { exactN++; if (ex !== CARDS.fix(q.v, q.dec || 1)) { fail++; console.log(`FAIL ${where} | ${plain(q.f)} | line "${q.s}": exact arithmetic prints ${ex}, the row prints ${CARDS.fix(q.v, q.dec || 1)}`); } } }
};

for (let r = 0; r < rounds; r++) {
  const p = pick(PRESETS), m = buildModel(p), sec = pick(SECTIONS);
  const edits = Math.floor(rnd() * 5);
  for (let e = 0; e < edits; e++) {
    const k = rnd();
    if (k < 0.25) { const n = pick(m.nodes.filter(q => q.cs)); if (n) n.sup = pick(['fixed', 'pin', 'roller', 'free']); }
    else if (k < 0.35) { const n = pick(m.nodes.filter(q => q.ch)); if (n) n.hinge = !n.hinge; }
    else if (k < 0.6) { const mi = Math.floor(rnd() * m.members.length), A = m.nodes[m.members[mi].n1], B = m.nodes[m.members[mi].n2], L = Math.hypot(B.x - A.x, B.y - A.y);
      m.loads.push({ id: m.nid++, m: mi, a: pick([0, L, L / 2, Math.round(rnd() * L * 20) / 20]), P: pick([5, 12.5, 20, 37.5, 100]), ang: pick([-90, -90, -90, 0, 180, 90, -45, -60, 30]) }); }
    else if (k < 0.75) { const u = pick(m.members).udl, w = pick([2.5, 8, 10, 15]), sh = rnd();   /* uniform, triangle up, triangle down, from one value to another */
      u.on = !u.on; u.w1 = sh < 0.5 ? w : sh < 0.67 ? 0 : sh < 0.84 ? w : pick([1, 4, 20]); u.w2 = sh < 0.5 ? w : sh < 0.67 ? w : sh < 0.84 ? 0 : w; u.ang = pick([-90, -90, 0, 180, 90]); }
    else if (k < 0.8) { const mb = pick(m.members); mb.sec = null; mb.kf = pick([0.5, 1, 2, 4]); mb.ka = pick([0.5, 1, 1, 2]); }   /* two factors on the stiffness of a member */
    else if (k < 0.85) { const mb = pick(m.members); mb.sec = Math.floor(rnd() * SECTIONS.length); mb.kf = SECTIONS[mb.sec].I / sec.I; mb.ka = SECTIONS[mb.sec].A / sec.A; }   /* a profile of its own, as the page sets it */
    else if (k < 0.93) { const ax = pick(['x', 'x', 'y']), g = gridOf(m, ax); if (g.length > 1) { const i = Math.floor(rnd() * (g.length - 1)); stretch(m, ax, g[i], g[i + 1], pick(LENGTHS)); m.geo = true; } }   /* another length */
    else if (m.loads.length) { const ld = pick(m.loads); ld.ang = pick([-90, 0, 180, -30]); ld.P = pick([1, 20, 55.5]); }
  }
  /* counted from what the state ends with: a step set to the length it had, a member given the profile of the structure do not count */
  if (vary.steps(m, buildModel(p))[0]) stretched++;
  if (vary.ownProfile(m, SECTIONS.indexOf(sec))) profiled++;
  /* after a stretch every load stands on its member: at a joint, or at least a centimetre inside */
  for (const ld of m.loads) { const L = memLen(m, ld.m); if (!(ld.a === 0 || ld.a === L || (ld.a >= 0.01 - 1e-12 && ld.a <= L - 0.01 + 1e-9))) { fail++; console.log(`FAIL ${p.id}: a load at ${ld.a} m on a member of ${L} m`); } }
  let sol;
  try {
    sol = FS.analyse(m, sectionEI(sec), sectionEA(sec));
    if (!sol.ok) { unstable++; if (sol.det.n < 0 === false && false) {} continue; }
    solved++;
    if (sol.limit === 'exact') exactLimit++; else if (sol.limit === 'steps') { fail++; console.log(`FAIL ${p.id}: the rigid members were not solved exactly: the limit was taken in three steps`); }
    if (sol.det.n < 0) { fail++; console.log(`FAIL ${p.id}: solved with n = ${sol.det.n}`); }
    const e = CARDS.equilibrium(m, sol);
    /* each sum in its own unit: a sum of forces against the largest sum of the load forces (at least 1 kN); a sum of moments against
       that force times the largest dimension of the structure, or the sum of the load moments where that is larger */
    const xs_ = m.nodes.map(n => n.x), ys_ = m.nodes.map(n => n.y), size = Math.max(Math.max(...xs_) - Math.min(...xs_), Math.max(...ys_) - Math.min(...ys_));
    const scaleF = Math.max(1, Math.abs(e.H[1]), Math.abs(e.V[1])), scaleM = Math.max(scaleF * size, Math.abs(e.M[1])), scl = k => (k === 'M' ? scaleM : scaleF);
    for (const k of ['H', 'V', 'M']) W.sums = Math.max(W.sums, Math.abs(e[k][0] + e[k][1]) / scl(k));
    for (const k of ['H', 'V', 'M']) if (Math.abs(e[k][0] + e[k][1]) > 1e-7 * scl(k)) { fail++; console.log(`FAIL ${p.id}: equilibrium ${k} ${e[k]}`); }
    /* joint equilibrium of the member end forces against reactions */
    const res = m.nodes.map(() => [0, 0, 0]);
    sol.mem.forEach(M => { const f = M.f, c = M.c, s = M.s;
      res[M.n1][0] += f[0] * c - f[1] * s; res[M.n1][1] += f[0] * s + f[1] * c; res[M.n1][2] += f[2];
      res[M.n2][0] += f[3] * c - f[4] * s; res[M.n2][1] += f[3] * s + f[4] * c; res[M.n2][2] += f[5]; });
    sol.reactions.forEach((q, i) => { const d = [res[i][0] - q.Rx, res[i][1] - q.Ry, res[i][2] - q.Mz], sc = [scaleF, scaleF, scaleM]; W.joints = Math.max(W.joints, ...d.map((v, k) => Math.abs(v) / sc[k])); if (d.some((v, k) => Math.abs(v) > 1e-7 * sc[k])) { fail++; console.log(`FAIL ${p.id}: joint ${i} out of balance ${d}`); } });
    for (const c of CARDS.hand(m, sol)) { cards[c.title] = (cards[c.title] || 0) + 1;
      for (const q of c.rows) { line(q, p.id + ' | ' + c.title); digits(q); if (q.ref === null) continue; rows++; cover(q, sol); W.hand = Math.max(W.hand, Math.abs(q.v - q.ref) / Math.max(1, Math.abs(q.ref))); if (Math.abs(q.v - q.ref) > 1e-6 * Math.max(1, Math.abs(q.ref))) { fail++; console.log(`FAIL ${p.id} | ${c.title} | ${plain(q.f)}: ${q.v} vs ${q.ref}  ${JSON.stringify({ nodes: m.nodes.map(n => n.sup + (n.hinge ? 'h' : '')), loads: m.loads, udl: m.members.map(x => x.udl.on ? x.udl.w1 + '/' + x.udl.w2 + '@' + x.udl.ang : 0), kf: m.members.map(x => x.kf) })}`); } } }
    for (let i = 0; i < m.members.length; i++) for (const q of CARDS.insight(sol, i).rows) { line(q, p.id + ' insight m' + i); digits(q); if (q.ref === null) continue; rows++; cover(q, sol); W.member = Math.max(W.member, Math.abs(q.v - q.ref) / Math.max(1, Math.abs(q.ref))); if (Math.abs(q.v - q.ref) > 1e-6 * Math.max(1, Math.abs(q.ref))) { fail++; console.log(`FAIL ${p.id} insight m${i}: ${q.v} vs ${q.ref}`); } }
    for (let i = 0; i < m.members.length; i++) for (const q of CARDS.shear(m, sol, i).rows) { line(q, p.id + ' shear m' + i); digits(q); if (q.ref === null) continue; rows++; cover(q, sol); W.member = Math.max(W.member, Math.abs(q.v - q.ref) / Math.max(1, Math.abs(q.ref))); if (Math.abs(q.v - q.ref) > 1e-6 * Math.max(1, Math.abs(q.ref))) { fail++; console.log(`FAIL ${p.id} shear m${i} ${plain(q.f)}: ${q.v} vs ${q.ref}`); } }
    for (const M of sol.mem) for (const a of ['N', 'V', 'M', 'dX', 'dY']) for (const v of M.smp[a]) if (!isFinite(v)) { fail++; console.log(`FAIL ${p.id}: non-finite ${a}`); break; }
  } catch (err) { fail++; console.log(`THROW ${p.id}: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }
  if (fail > 12) break;
}
console.log(`${rounds} random models: ${solved} solved, ${unstable} mechanisms, ${rows} formula rows checked, ${lines} lines "with the numbers" worked out, ${exactN} of them also in exact decimal arithmetic, ${fail} failures`);
console.log(`rows where the hand value and the value of the analysis print different digits: ${apart} of ${withRef}`);
/* measured, each as a share of its scale: every row, of the hand cards and of the member cards alike, against max(1, |value of the analysis|); a sum of forces and the forces at a joint against the largest sum of the load forces (at least 1 kN); a sum of moments and the moments at a joint against that force times the largest dimension of the structure, or against the sum of the load moments where that is larger */
console.log(`largest differences: hand rows ${W.hand.toExponential(2)}, member rows ${W.member.toExponential(2)}, equilibrium sums ${W.sums.toExponential(2)}, joints ${W.joints.toExponential(2)}; limits: rows 1e-6, sums and joints 1e-7`);
console.log(`largest difference between a hand value and the analysis, as a share of what the analysis cannot tell from zero for that kind of value (a floor + 100 x the amount it states + 1e-10 of the largest value of its kind; for a displacement also 1e-13 of F L^3 / (3 EI)): ${W.cover.toFixed(3)}; limit 1; this covers ${covered} of the ${rows} rows (forces, moments, deflections). There is no such amount for a place along a member or for a rotation: the ${places} rows in metres and the ${rot} rows in mrad${others ? ` and ${others} rows in another unit` : ''} are held by the row comparison alone`);
console.log(`members that are rigid along their axis: solved exactly, with their length as a condition, in ${exactLimit} states; in three steps in 0 (the other solved states are structures of bars alone)`);
console.log(`the row with that largest share: ${W.coverRow}`);
console.log(`states that end with a length other than that of the example: ${stretched}; with a member whose profile is not that of the structure: ${profiled}`);
console.log('hand cards met:', Object.entries(cards).map(([k, v]) => `${k} ×${v}`).join('; '));
process.exit(fail ? 1 : 0);
