/* Every hand-formula row is compared with the solver. Run: node test/cards.test.js */
global.FS = require('../src/solver.js');
const { SECTIONS, PRESETS, buildModel, sectionEI, sectionEA } = require('../src/presets.js');
const CARDS = require('../src/cards.js');

let pass = 0, fail = 0, worst = {};
const strip = s => s.replace(/<[^>]+>/g, '');
const { plain } = require('./plain.js');   /* the text of a formula for the messages: a fraction keeps its bar */
/* a hand value and the value of the analysis agree within the tolerance; on a half step the two can still print one
   digit apart, because the analysis carries a numerical error. Such rows are counted and listed. */
const apart = [], cnt = { hand: 0, moment: 0, shear: 0, eq: 0 };
let worstAll = 0;
const digits = (name, r) => { if (r.u !== '' && CARDS.fix(r.v, r.dec || 1) !== CARDS.fix(r.ref, r.dec || 1)) apart.push(`${name} | ${plain(r.f)}: hand ${r.v} prints ${CARDS.fix(r.v, r.dec || 1)}, analysis ${r.ref} prints ${CARDS.fix(r.ref, r.dec || 1)}`); };
function check(name, model, opt = {}) {
  const sec = opt.sec || SECTIONS[2], sol = FS.analyse(model, sectionEI(sec), sectionEA(sec));
  if (!sol.ok) { fail++; console.log(`FAIL ${name}: unstable`); return null; }
  const cards = CARDS.hand(model, sol);
  if (opt.expect && !(cards[0] && cards[0].title.includes(opt.expect))) { fail++; console.log(`FAIL ${name}: expected card "${opt.expect}", got "${cards[0] ? cards[0].title : 'none'}"`); }
  if (opt.none && cards.length) { fail++; console.log(`FAIL ${name}: expected no card, got "${cards[0].title}"`); }
  for (const c of cards) for (const r of c.rows) {
    if (r.ref === null) continue;
    const d = Math.abs(r.v - r.ref) / Math.max(1, Math.abs(r.ref)), tol = opt.tol || 1e-8;
    worst[name] = Math.max(worst[name] || 0, d); worstAll = Math.max(worstAll, d); cnt.hand++;
    if (d <= tol) pass++; else { fail++; console.log(`FAIL ${name} | ${c.title} | ${plain(r.f)}: hand ${r.v} solver ${r.ref}`); }
    digits(name, r);
    if (opt.show) console.log(`   ${plain(r.f)}  [${r.s || '-'}]  = ${CARDS.n1(r.v)} ${r.u}  (solver ${CARDS.n1(r.ref)})`);
  }
  const e = CARDS.equilibrium(model, sol);
  for (const k of ['H', 'V', 'M']) { cnt.eq++; if (Math.abs(e[k][0] + e[k][1]) < 1e-6 * Math.max(1, Math.abs(e[k][1]))) pass++; else { fail++; console.log(`FAIL ${name}: equilibrium ${k} ${e[k]}`); } }
  for (let i = 0; i < model.members.length; i++) for (const r of CARDS.insight(sol, i).rows) {
    if (r.ref === null) continue;
    cnt.moment++; worstAll = Math.max(worstAll, Math.abs(r.v - r.ref) / Math.max(1, Math.abs(r.ref)));
    if (Math.abs(r.v - r.ref) <= 1e-8 * Math.max(1, Math.abs(r.ref))) pass++; else { fail++; console.log(`FAIL ${name} insight m${i} ${plain(r.f)}: ${r.v} vs ${r.ref}`); }
    digits(name, r);
  }
  for (let i = 0; i < model.members.length; i++) for (const r of CARDS.shear(model, sol, i).rows) {
    if (r.ref === null) continue;
    cnt.shear++; worstAll = Math.max(worstAll, Math.abs(r.v - r.ref) / Math.max(1, Math.abs(r.ref)));
    if (Math.abs(r.v - r.ref) <= 1e-8 * Math.max(1, Math.abs(r.ref))) pass++; else { fail++; console.log(`FAIL ${name} shear m${i} ${plain(r.f)}: ${r.v} vs ${r.ref}`); }
    digits(name, r);
  }
  return { sol, cards };
}
const P = id => buildModel(PRESETS.find(p => p.id === id));
const show = process.argv.includes('-v');

/* all presets as shipped (true axial stiffness; portal formulas neglect it, so a looser tolerance there) */
for (const p of PRESETS) check(p.id, buildModel(p), { show });
/* portal formulas exactly, with axial shortening suppressed */
for (const sup of ['fixed', 'pin']) for (const kf of [1, 4, 0.5]) {
  let m = P('portal-g'); m.nodes[0].sup = m.nodes[3].sup = sup; m.members[0].kf = m.members[2].kf = kf;
  check(`portal-g ${sup} kf${kf}`, m, { expect: 'uniform load' });
  m = P('portal-s'); m.nodes[0].sup = m.nodes[3].sup = sup; m.members[0].kf = m.members[2].kf = kf;
  check(`portal-s ${sup} kf${kf}`, m, { expect: 'side load' });
}
/* variations */
{
  let m = P('simple-p'); m.loads[0].a = 3; check('simple mid', m, { expect: 'Simple beam, point' });
  m = P('simple-p'); m.loads[0].a = 4.35; m.loads[0].P = 37.5; check('simple off-centre', m, { expect: 'Simple beam, point' });
  m = P('simple-p'); m.nodes[1].sup = 'pin'; check('pin-pin', m, { expect: 'Simple beam, point' });
  m = P('simple-p'); m.nodes[0].sup = 'fixed'; check('propped P left fixed', m, { expect: 'Propped cantilever, point' });
  m = P('simple-p'); m.nodes[0].sup = 'roller'; m.nodes[1].sup = 'fixed'; check('propped P right fixed', m, { expect: 'Propped cantilever, point' });
  m = P('simple-p'); m.nodes[0].sup = m.nodes[1].sup = 'fixed'; check('fixed P', m, { expect: 'Fixed beam, point' });
  m = P('simple-p'); m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; check('cant P inner', m, { expect: 'Cantilever, point' });
  m = P('simple-p'); m.nodes[0].sup = 'free'; m.nodes[1].sup = 'fixed'; check('cant P right fixed', m, { expect: 'Cantilever, point' });
  m = P('simple-w'); m.nodes[1].sup = 'fixed'; m.nodes[0].sup = 'pin'; check('propped w right fixed', m, { expect: 'Propped cantilever, uniform' });
  m = P('simple-w'); m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; check('cant w', m, { expect: 'Cantilever, uniform' });
  m = P('simple-w'); m.nodes[0].sup = 'free'; m.nodes[1].sup = 'fixed'; check('cant w right', m, { expect: 'Cantilever, uniform' });
  m = P('simple-w'); m.loads.push({ id: 9, m: 0, a: 1.5, P: 12, ang: -90 }); check('simple mixed', m, { expect: 'Moments about' });
  m = P('simple-w'); m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; m.loads.push({ id: 9, m: 0, a: 4, P: 12, ang: -90 }); check('cant mixed', m, { expect: 'Cantilever, statics' });
  m = P('simple-p'); m.loads[0].ang = -60; check('inclined: no hand card', m, { none: true });
  m = P('simple-p'); m.loads[0].ang = 90; check('uplift load', m, { expect: 'Simple beam, point' });
  m = P('overhang'); m.loads[0].P = 60; check('overhang lift-off', m, { expect: 'Moments about' });
  m = P('overhang'); m.loads[0].m = 0; m.loads[0].a = 1.5; check('overhang load in span', m, { expect: 'Moments about' });
  m = P('two-span'); m.members[1].udl.on = false; check('two-span one loaded', m, { expect: 'three-moment' });
  m = P('two-span'); m.members[0].udl.w1 = m.members[0].udl.w2 = 4; check('two-span unequal w', m, { expect: 'three-moment' });
  m = P('two-span'); m.nodes[1].x = 6; check('two-span unequal L', m, { expect: 'three-moment' });
  m = P('two-span'); m.nodes[1].sup = 'free'; check('two-span middle removed', m, {});
  m = P('gerber'); m.nodes[2].hinge = false; check('gerber closed', m, { none: true });
  m = P('gerber'); check('gerber as shipped', m, { expect: 'Hung part' });
  m = P('gerber'); m.loads.push({ id: 9, m: 2, a: 1, P: 12, ang: -90 }, { id: 10, m: 1, a: 0.5, P: 7, ang: -90 }, { id: 11, m: 0, a: 2, P: 20, ang: -90 }); check('gerber with point loads', m, { expect: 'Hung part' });
  m = P('gerber'); m.members[2].udl.on = false; m.loads.push({ id: 9, m: 1, a: 1.5, P: 30, ang: -90 }); check('gerber load at the hinge, end of the arm', m, { expect: 'Hung part' });
  m = P('gerber'); m.members[2].udl.on = false; m.loads.push({ id: 9, m: 2, a: 0, P: 30, ang: -90 }); check('gerber load at the hinge, start of the hung part', m, { expect: 'Hung part' });
  m = P('gerber'); m.members[1].udl.ang = 90; m.loads.push({ id: 9, m: 2, a: 2.5, P: 9, ang: -90 }, { id: 10, m: 2, a: 1.2, P: 4, ang: 90 }); check('gerber with uplift', m, { expect: 'Hung part' });
  m = P('gerber'); m.nodes[3].sup = 'pin'; check('gerber with two pins', m, { expect: 'Hung part' });
  m = P('gerber'); m.nodes[0].sup = 'fixed'; check('gerber with a fixed end: no card', m, { none: true });
  m = buildModel({ nodes: [[0, 0, 'roller'], [2.5, 0, 'free', 1], [4, 0, 'roller'], [10, 0, 'pin']], members: [[0, 1, { w: 10 }], [1, 2, { w: 6 }], [2, 3, { w: 10 }]], loads: [[0, 1, 12], [1, 0.5, 7], [2, 2, 20]] });
  check('gerber mirrored', m, { expect: 'Hung part' });
  m = P('bent'); m.loads[0].ang = 0; check('bent side load', m, { expect: 'Cantilever frame' });
  m = P('bent'); m.loads[0].ang = -45; m.loads.push({ id: 9, m: 0, a: 2, P: 5, ang: 0 }); check('bent two loads', m, { expect: 'Cantilever frame' });
  m = P('bent'); m.members[1].udl.on = true; check('bent with udl', m, { expect: 'Cantilever frame' });
  m = P('three-hinge'); m.members[2].udl.on = false; check('3-hinge half load', m, { expect: 'Three-hinged' });
  m = P('three-hinge'); m.loads.push({ id: 9, m: 1, a: 1, P: 25, ang: -90 }); check('3-hinge + point', m, { expect: 'Three-hinged' });
  m = P('truss'); m.loads[0].P = 35; m.loads[2].m = 3; m.loads[2].a = 0; check('truss other loads', m, { expect: 'sections' });
  m = P('truss'); m.loads[1].a = 1.5; check('truss load between joints: no card', m, { none: true });
  m = P('portal-g'); m.nodes[1].hinge = true; check('portal hinged corner', m, { none: true });
  m = P('two-bay'); check('two-bay', m, { none: true });
  for (const s of SECTIONS) { m = P('fixed'); check('fixed ' + s.name, m, { sec: s, expect: 'Fixed beam, uniform' }); }
}
/* loads that vary along the member, and two point loads */
{
  const tri = (id, w1, w2, f) => { const m = P(id); Object.assign(m.members[0].udl, { on: true, w1, w2 }); if (f) f(m); return m; };
  const sup = (a, b) => m => { m.nodes[0].sup = a; m.nodes[1].sup = b; };
  let m = P('simple-t'); check('triangle as shipped', m, { expect: 'Simple beam, triangular', show });
  check('triangle mirrored', tri('simple-t', 12, 0), { expect: 'Simple beam, triangular' });
  check('triangle odd numbers', tri('simple-t', 0, 7.3, q => { q.nodes[1].x = 4.7; }), { expect: 'Simple beam, triangular' });
  check('triangle upward', tri('simple-t', 0, 12, q => { q.members[0].udl.ang = 90; }), { expect: 'Simple beam, triangular' });
  check('triangle upward mirrored', tri('simple-t', 9, 0, q => { q.members[0].udl.ang = 90; }), { expect: 'Simple beam, triangular' });
  for (const [w1, w2] of [[0, 12], [12, 0], [0, 3.5]]) {
    check(`fixed triangle ${w1}/${w2}`, tri('simple-t', w1, w2, sup('fixed', 'fixed')), { expect: 'Fixed beam, triangular' });
    check(`propped triangle, fixed left ${w1}/${w2}`, tri('simple-t', w1, w2, sup('fixed', 'roller')), { expect: 'Propped cantilever, triangular' });
    check(`propped triangle, fixed right ${w1}/${w2}`, tri('simple-t', w1, w2, sup('pin', 'fixed')), { expect: 'Propped cantilever, triangular' });
    check(`cantilever triangle, fixed left ${w1}/${w2}`, tri('simple-t', w1, w2, sup('fixed', 'free')), { expect: 'Cantilever, triangular' });
    check(`cantilever triangle, fixed right ${w1}/${w2}`, tri('simple-t', w1, w2, sup('free', 'fixed')), { expect: 'Cantilever, triangular' });
  }
  check('propped triangle upward', tri('simple-t', 12, 0, q => { sup('fixed', 'roller')(q); q.members[0].udl.ang = 90; }), { expect: 'Propped cantilever, triangular' });
  check('trapezoid on a simple beam', tri('simple-t', 5, 12), { expect: 'Moments about', show });
  check('trapezoid falling', tri('simple-t', 12, 4.5), { expect: 'Moments about' });
  check('trapezoid on a cantilever', tri('simple-t', 5, 12, sup('fixed', 'free')), { expect: 'Cantilever, statics', show });
  check('trapezoid on a cantilever, fixed right', tri('simple-t', 5, 12, sup('free', 'fixed')), { expect: 'Cantilever, statics' });
  check('trapezoid on a fixed beam: no card', tri('simple-t', 5, 12, sup('fixed', 'fixed')), { none: true });
  check('triangle and point load', tri('simple-t', 0, 12, q => { q.loads.push({ id: 9, m: 0, a: 2, P: 15, ang: -90 }); }), { expect: 'Moments about' });
  check('triangle and point load on a cantilever', tri('simple-t', 12, 0, q => { sup('fixed', 'free')(q); q.loads.push({ id: 9, m: 0, a: 6, P: 15, ang: -90 }); }), { expect: 'Cantilever, statics' });
  check('inclined triangle: no card', tri('simple-t', 0, 12, q => { q.members[0].udl.ang = -60; }), { none: true });
  m = P('simple-2p'); check('two equal loads as shipped', m, { expect: 'two equal loads', show });
  m = P('simple-2p'); m.loads[0].a = 1.25; m.loads[1].a = 4.75; m.loads[0].P = m.loads[1].P = 37.5; check('two equal loads, other numbers', m, { expect: 'two equal loads' });
  m = P('simple-2p'); m.loads[0].ang = m.loads[1].ang = 90; check('two equal loads upward', m, { expect: 'two equal loads' });
  m = P('simple-2p'); m.loads[1].a = 4.5; check('two loads, not symmetric', m, { expect: 'Moments about' });
  m = P('simple-2p'); m.loads[1].P = 30; check('two loads, not equal', m, { expect: 'Moments about' });
  m = P('simple-2p'); m.loads[0].a = m.loads[1].a = 3; check('two loads at midspan', m, { expect: 'Moments about' });
  m = P('simple-2p'); m.loads.push({ id: 9, m: 0, a: 3, P: 20, ang: -90 }); check('three loads', m, { expect: 'Moments about' });
  m = P('simple-2p'); m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; check('two loads on a cantilever', m, { expect: 'Cantilever, statics' });
  m = P('two-span'); m.members[0].udl.w1 = 0; check('two-span with a triangle: no card', m, { none: true });
  m = P('overhang'); Object.assign(m.members[1].udl, { on: true, w1: 8, w2: 0 }); check('overhang with a triangle on the arm', m, { expect: 'Moments about' });
  m = P('gerber'); m.members[2].udl.w1 = 0; m.members[0].udl.w2 = 4; m.members[1].udl.w1 = 0; check('gerber with triangles and a trapezoid', m, { expect: 'Hung part', show });
  m = P('three-hinge'); m.members[1].udl.w1 = 0; check('3-hinge with a triangle', m, { expect: 'Three-hinged' });
  m = P('three-hinge'); m.members[1].udl.w2 = 4; m.members[2].udl.on = false; check('3-hinge with a trapezoid', m, { expect: 'Three-hinged' });
  m = P('bent'); Object.assign(m.members[1].udl, { on: true, w1: 0, w2: 9 }); Object.assign(m.members[0].udl, { on: true, w1: 6, w2: 0, ang: 0 }); check('bent with two triangles', m, { expect: 'Cantilever frame', show });
  m = P('portal-g'); m.members[1].udl.w1 = 0; check('portal with a triangle: no card', m, { none: true });
  m = P('portal-g'); Object.assign(m.members[0].udl, { on: true, w1: 5, w2: 0, ang: 0 }); check('portal with wind triangle: no card', m, { none: true });
  m = P('truss'); Object.assign(m.members[0].udl, { on: true, w1: 0, w2: 5 }); check('truss with a distributed load: no card', m, { none: true });
}
if (show) console.log(worst);
/* review 03: loads that act both ways enter one by one with their signs (C26); the simple-beam moment carries its
   sign (C28); a member with a load along its axis only is not 'without load' (C33) */
{
  const { calc } = require('./lines.js');
  const solve = m => FS.analyse(m, sectionEI(SECTIONS[2]), sectionEA(SECTIONS[2]));
  const say = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL ' + what); } };
  let m = P('simple-2p'); m.loads[0].P = 30; m.loads[1].P = 30; m.loads[1].ang = 90;
  let c = CARDS.shear(m, solve(m), 0), r = c.rows[0];
  say(r.s === '10.0 \u2212 30.0 + 30.0' && Math.abs(calc(r.s) - 10) < 1e-9 && Math.abs(r.v - 10) < 1e-9 && /each enters with the sign of its direction/.test(c.text), `opposing loads: line "${r.s}", value ${r.v}`);
  m = P('simple-2p'); m.loads[0].P = 30; m.loads[1].P = 12;
  c = CARDS.shear(m, solve(m), 0); r = c.rows[0];
  say(/\u2212 42\.0$/.test(r.s) && !/both ways/.test(c.text), `loads the same way keep the sum: line "${r.s}"`);
  m = P('two-span'); m.members[0].udl.ang = 90; Object.assign(m.members[1].udl, { w1: 4, w2: 4 });
  let ins = CARDS.insight(solve(m), 0);
  say(Math.abs(ins.rows[0].v + 31.25) < 1e-9 && ins.rows[0].s.startsWith('\u2212') && Math.abs(calc(ins.rows[0].s) + 31.25) < 1e-9 && /It is negative: the load acts upward/.test(ins.text) && / \+ /.test(strip(ins.rows[1].f)) && Math.abs(ins.rows[1].v + 26.5625) < 1e-9, `upward load on a span: M0 = ${ins.rows[0].v}, M mid = ${ins.rows[1].v}`);
  ins = CARDS.insight(solve(P('two-span')), 0);
  say(Math.abs(ins.rows[0].v - 31.25) < 1e-9 && !/negative/.test(ins.text), `downward load on a span: M0 = ${ins.rows[0].v}`);
  say(plain(ins.rows[0].f) === 'M_0 = (q·L^2)/(8)' && plain(ins.rows[1].f) === 'M_mid = (M_1 + M_2)/(2) + M_0', `a formula on one line keeps its fraction: "${plain(ins.rows[1].f)}"`);
  m = P('simple-p'); m.loads[0].ang = 90; m.nodes[0].sup = 'fixed';
  ins = CARDS.insight(solve(m), 0);
  say(ins.rows[0].v < 0 && /It is negative: the load acts upward/.test(ins.text) && Math.abs(ins.rows[1].v - ins.rows[1].ref) < 1e-6, `upward point load: M0 = ${ins.rows[0].v}`);
  m = P('three-hinge'); Object.assign(m.members[0].udl, { on: true, w1: 10, w2: 10, ang: -90 });
  ins = CARDS.insight(solve(m), 0);
  say(/^No load across the member/.test(ins.text) && /changes N only/.test(ins.text), `column with a load along its axis: "${ins.text}"`);
  say(/^No load on the member/.test(CARDS.insight(solve(P('three-hinge')), 0).text), 'column without any load');
}
/* review 08. C91: on a beam that reaches left of its left support, x in "Moments about the supports" is a place measured
   from that support to the right, negative on the overhang; the note says so. C92: what the shear card says of a support
   follows from the equilibrium of the joint with the load that stands on it, not from two numbers that lie close. */
{
  const { calc } = require('./lines.js');
  const solve = m => FS.analyse(m, sectionEI(SECTIONS[2]), sectionEA(SECTIONS[2]));
  const say = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL ' + what); } };
  /* 7 m beam, A free at 0, pin at B (5 m), roller at C (7 m), 10 kN down on A: C is pulled down with 25 kN, B carries 35 kN */
  let m = P('overhang'); m.nodes[0].sup = 'free'; m.nodes[1].sup = 'pin'; m.nodes[2].sup = 'roller'; m.members.forEach(q => { q.udl.on = false; }); m.loads = [{ id: 1, m: 0, a: 0, P: 10, ang: -90 }];
  let sol = solve(m), c = CARDS.hand(m, sol)[0];
  say(c && c.title === 'Moments about the supports' && /x = place of a load, measured from B to the right: negative for a load left of B\. l = distance B to C\./.test(strip(c.note)), `left overhang: the note defines x as a signed place: "${c && strip(c.note)}"`);
  say(c && Math.abs(c.rows[0].v + 25) < 1e-9 && Math.abs(c.rows[1].v - 35) < 1e-9 && Math.abs(sol.reactions[2].Ry + 25) < 1e-7 && Math.abs(sol.reactions[1].Ry - 35) < 1e-7, `left overhang: F_Cz = ${c && c.rows[0].v}, F_Bz = ${c && c.rows[1].v}`);
  /* the line with the numbers prints sizes and puts the sign of load times place in front of the product */
  say(c && c.rows[0].s === '(−10.0 · 5.00) / 2.00' && Math.abs(calc(c.rows[0].s) + 25) < 1e-9 && c.rows[1].s === '(10.0 · 7.00) / 2.00', `left overhang: the lines with the numbers: "${c && c.rows[0].s}", "${c && c.rows[1].s}"`);
  /* the same beam as shipped (A pin, B roller, overhang to the right): every place is a distance, and the note stays as it was */
  c = CARDS.hand(P('overhang'), solve(P('overhang')))[0];
  say(c && c.title === 'Moments about the supports' && / x = distance of a load from A, l = distance A to B\./.test(strip(c.note)) && !/negative for a load left/.test(strip(c.note)), `overhang to the right: "${c && strip(c.note)}"`);
  /* C92: 3 m cantilever, 101 loads of 1000 kN at 0.01 m and 0.1 kN on A: V1 = 101 000.0 kN, the reaction 101 000.1 kN */
  m = P('cantilever'); m.loads = []; for (let i = 0; i < 101; i++) m.loads.push({ id: i + 1, m: 0, a: 0.01, P: 1000, ang: -90 }); m.loads.push({ id: 200, m: 0, a: 0, P: 0.1, ang: -90 });
  sol = solve(m); let sh = CARDS.shear(m, sol, 0), t = sh.ties.map(strip).join(' ');
  say(CARDS.n1(sh.V1) !== CARDS.n1(sol.reactions[0].Ry) && Math.abs(sh.V1 - 101000) < 1e-4 && Math.abs(sol.reactions[0].Ry - 101000.1) < 1e-4, `cantilever with a load on A: V1 = ${sh.V1}, F_Az = ${sol.reactions[0].Ry}`);
  say(/At A the shear starts with the reaction and the load on A: V1 = FAz − 0\.1 kN\./.test(t) && !/V1 = FAz\./.test(t), `cantilever with a load on A: "${t}"`);
  m.loads.pop(); sol = solve(m); sh = CARDS.shear(m, sol, 0); t = sh.ties.map(strip).join(' ');
  say(/At A the shear starts with the reaction: V1 = FAz\./.test(t) && Math.abs(sh.V1 - sol.reactions[0].Ry) < 1e-6, `cantilever without a load on A: "${t}"`);
  /* a load on the right support of a simple beam, downward and upward; the relation said holds with the numbers */
  for (const [ang, word] of [[-90, 'V2 = −FBz + 20.0 kN'], [90, 'V2 = −FBz − 20.0 kN']]) {
    m = P('simple-p'); m.loads.push({ id: 9, m: 0, a: 6, P: 20, ang }); sol = solve(m); sh = CARDS.shear(m, sol, 0); t = sh.ties.map(strip).join(' ');
    say(t.includes(`At B it ends with the reaction and the load on B: ${word}.`) && t.includes('At A the shear starts with the reaction: V1 = FAz.') && Math.abs(sh.V2 - (-sol.reactions[1].Ry + (ang < 0 ? 20 : -20))) < 1e-7, `simple beam with ${ang < 0 ? 'a downward' : 'an upward'} load on B: "${t}"`);
  }
  /* a load on the middle support of the two-span beam: the shear jumps by the reaction less the load */
  m = P('two-span'); m.loads.push({ id: 9, m: 1, a: 0, P: 20, ang: -90 }); sol = solve(m); sh = CARDS.shear(m, sol, 1); t = sh.ties.map(strip).join(' ');
  { const j = sh.V1 - FS.forcesAt(sol.mem[0], sol.mem[0].L, -1).V;
    say(t.includes(`At B the shear jumps by the reaction and the load on B: FBz − 20.0 kN = ${CARDS.n1(j)} kN.`) && Math.abs(j - (sol.reactions[1].Ry - 20)) < 1e-7, `two-span beam with a load on B: "${t}", jump ${j}, F_Bz ${sol.reactions[1].Ry}`); }
  sol = solve(P('two-span')); sh = CARDS.shear(P('two-span'), sol, 1); t = sh.ties.map(strip).join(' ');
  say(/At B the shear jumps by the reaction FBz = [\d.]+ kN\./.test(t), `two-span beam as shipped: "${t}"`);
  /* a load along the beam on a support changes nothing across it */
  m = P('simple-p'); m.loads.push({ id: 9, m: 0, a: 0, P: 20, ang: 0 }); sol = solve(m); t = CARDS.shear(m, sol, 0).ties.map(strip).join(' ');
  say(t.includes('At A the shear starts with the reaction: V1 = FAz.'), `simple beam with a load along the axis on A: "${t}"`);
}
/* every printed line of the fixed cases against exact decimal arithmetic */
{
  const { exact } = require('./exact.js');
  let n = 0;
  const one = (r, where) => { if (!r.s || r.u === '') return; const ex = exact(r.s, r.dec || 1); if (ex === null) return; n++; if (ex === CARDS.fix(r.v, r.dec || 1)) pass++; else { fail++; console.log(`FAIL ${where}: line "${r.s}" is ${ex} in exact arithmetic, printed ${CARDS.fix(r.v, r.dec || 1)}`); } };
  for (const p of PRESETS) { const m = P(p.id), sol = FS.analyse(m, sectionEI(SECTIONS[2]), sectionEA(SECTIONS[2])); if (!sol.ok) continue;
    for (const c of CARDS.hand(m, sol)) for (const r of c.rows) one(r, p.id);
    for (let i = 0; i < m.members.length; i++) { for (const r of CARDS.insight(sol, i).rows) one(r, p.id); for (const r of CARDS.shear(m, sol, i).rows) one(r, p.id); } }
  /* the fixed beam of review 04: 382.7 kN at a = 2.66 m of 6.00 m */
  const m = P('fixed'); m.members[0].udl.on = false; m.loads = [{ id: 1, m: 0, a: 2.66, P: 382.7, ang: -90 }];
  const sol = FS.analyse(m, sectionEI(SECTIONS[2]), sectionEA(SECTIONS[2]));
  for (const c of CARDS.hand(m, sol)) for (const r of c.rows) { one(r, 'fixed beam, 382.7 kN at 2.66 m'); if (r.s && /382\.7 · 2\.66 · 3\.34² \/ 6\.00²/.test(r.s)) { if (CARDS.fix(r.v, 1) === '\u2212315.4') pass++; else { fail++; console.log('FAIL fixed beam: ' + r.s + ' printed ' + CARDS.fix(r.v, 1)); } } }
  console.log(`printed lines of the examples in exact decimal arithmetic: ${n}`);
}
console.log(`${pass} passed, ${fail} failed`);
{ const rowsN = cnt.hand + cnt.moment + cnt.shear;
  console.log(`of these: ${rowsN} formula rows compared with the analysis (${cnt.hand} of the hand cards, ${cnt.moment} of the member cards for the moment, ${cnt.shear} of the member cards for the shear), ${cnt.eq} equilibrium sums, ${pass + fail - rowsN - cnt.eq} further checks`); }
console.log('largest relative deviation of a formula row from the analysis:', worstAll.toExponential(2), '(hand cards alone:', Math.max(...Object.values(worst)).toExponential(2) + ')');
console.log(`rows where the hand value and the value of the analysis print different digits: ${apart.length}`);
for (const a of apart.slice(0, 12)) console.log('   ' + a);
/* rounding: once, half away from zero, with no allowance beyond the binary arithmetic (a billionth of a display
   step): values just above and just below half steps, and the lines of reviews 03 and 04 */
for (const [x, want] of [[31.25, '31.3'], [-31.25, '\u221231.3'], [33.74997, '33.7'], [-0.04, '0.0'], [0.05, '0.1'], [12.34, '12.3'], [2.675, '2.7'],
  [1.7498, '1.7'], [64.4498, '64.4'], [45.9497, '45.9'], [-14.2496, '\u221214.2'], [999.9489, '999.9'], [999.94999, '999.9'], [0.049, '0.0'],
  [380.0 * 1.27 * 4.73 / 6.00, '380.4'], [380.45, '380.5'], [380.4499, '380.4'], [31.2499998, '31.2'], [31.24999995, '31.2'], [31.2500002, '31.3'], [0.35355, '0.4'], [-0.0499998, '0.0'],
  [10 * 5 ** 2 / 8, '31.3'], [0.1 + 0.2 + 0.05, '0.4'], [1.005 * 10, '10.1'], [-382.7 * 2.66 * 3.34 ** 2 / 6.00 ** 2, '\u2212315.4'], [315.4499999778, '315.4'], [315.45, '315.5'], [55.5 / 2, '27.8'], [27.74999953, '27.7']]) if (CARDS.n1(x) !== want) { console.log('FAIL rounding', x, CARDS.n1(x)); fail++; }

/* Loads that act upward. A load enters a formula by its size, so: the same card as for the downward load, every
   value with the opposite sign, no doubled minus, "min" where the downward card says "max", every number line
   worked out gives its row, and the card says that the load acts upward. */
{
  const { calc } = require('./lines.js');
  const P = id => buildModel(PRESETS.find(p => p.id === id));
  const flip = m => { for (const l of m.loads) l.ang = l.ang === -90 ? 90 : l.ang; for (const mb of m.members) if (mb.udl.on && mb.udl.ang === -90) mb.udl.ang = 90; return m; };
  const sup = (a, b) => m => { m.nodes[0].sup = a; m.nodes[m.nodes.length - 1].sup = b; return m; };
  const cases = [['simple-p'], ['simple-w'], ['simple-t'], ['simple-2p'], ['cantilever'], ['propped'], ['fixed'], ['two-span'], ['portal-g'], ['three-hinge'],
    ['simple-p', sup('fixed', 'fixed')], ['simple-p', sup('fixed', 'roller')], ['simple-p', m => { m.loads[0].a = 3; return m; }], ['simple-w', sup('fixed', 'free')], ['simple-t', sup('fixed', 'fixed')], ['simple-t', sup('fixed', 'free')],
    ['simple-t', sup('free', 'fixed')], ['simple-t', sup('fixed', 'roller')], ['simple-t', sup('roller', 'fixed')], ['portal-g', m => { for (const n of m.nodes) if (n.sup === 'fixed') n.sup = 'pin'; return m; }],
    ['two-span', m => { m.members[1].udl.ang = -90; m.members[1].udl.w1 = m.members[1].udl.w2 = 4; return m; }, 'mixed']];
  let n = 0;
  for (const [id, edit, kind] of cases) {
    const dn = edit ? edit(P(id)) : P(id), up = edit ? edit(flip(P(id))) : flip(P(id));
    const sec = SECTIONS[2], sd = FS.analyse(dn, sectionEI(sec), sectionEA(sec)), su = FS.analyse(up, sectionEI(sec), sectionEA(sec));
    const cd = CARDS.hand(dn, sd), cu = CARDS.hand(up, su), name = `upward ${id}${edit ? ' (changed)' : ''}`;
    if (!cu.length || cu.length !== cd.length || cu[0].title !== cd[0].title) { fail++; console.log(`FAIL ${name}: cards differ: "${cu.map(c => c.title)}" against "${cd.map(c => c.title)}"`); continue; }
    cu.forEach((c, ci) => {
      const txt = strip(c.rows.map(r => r.f + ' | ' + (r.s || '')).join(' || ') + (c.note || ''));
      if (/−\s*−|−\s*-|\+\s*−/.test(txt)) { fail++; console.log(`FAIL ${name}: doubled sign in "${txt}"`); }
      if (kind !== 'mixed' && /max/.test(txt) && !/Portal|sway/.test(c.title)) { fail++; console.log(`FAIL ${name}: "max" printed for an upward load: ${txt}`); }
      if (!/upward/.test(c.note || '') && !/statics|Moments about|Hung part|Then the main/.test(c.title)) { fail++; console.log(`FAIL ${name}: the card does not say that the load acts upward`); }
      c.rows.forEach((r, ri) => {
        const d = cd[ci].rows[ri];
        if (kind !== 'mixed' && r.u !== '' && r.u !== 'm' && Math.abs(r.v + d.v) > 1e-9 * Math.max(1, Math.abs(d.v))) { fail++; console.log(`FAIL ${name} | ${plain(r.f)}: ${r.v} is not the opposite of ${d.v}`); }
        if (r.ref !== null && Math.abs(r.v - r.ref) > 1e-8 * Math.max(1, Math.abs(r.ref))) { fail++; console.log(`FAIL ${name} | ${plain(r.f)}: hand ${r.v} solver ${r.ref}`); }
        if (r.s) { const v = calc(r.s); if (Math.abs(v - r.v) > 1e-5 * Math.max(1, Math.abs(r.v))) { fail++; console.log(`FAIL ${name} | ${plain(r.f)} | line "${r.s}" gives ${v}, row says ${r.v}`); } }
        n++;
      });
    });
  }
  console.log(`upward loads: ${cases.length} cases, ${n} rows`);
}
if (fail) console.log(`${fail} failed in all`);
process.exit(fail ? 1 : 0);
