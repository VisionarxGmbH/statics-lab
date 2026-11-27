/* Random states of the 16 examples, solved by the page's own solver, written as JSON for comparison with the
   independent solver (indep.py). Among the edits: another length for a step of the grid of the joints (the page's own
   stretch, 0.5 to 30 m) and a profile of its own for a member (its two stiffness factors kf and ka go into the file).
   With a share as fourth argument, that share of the states starts from the far corners of what the menus allow
   (test/vary.js): each step of the grid gets, with probability 0.6, a length from the list of 13 (0.5 to 30 m), and each
   member, with probability 0.5, a profile from the seven. The list holds the lengths of the examples and the seven hold
   the section of the structure, so a draw can leave a step or a member as it was: the states are counted from what they
   end with (steps of the grid with another length than in the example: none, some, all).
   Zeros of the shear: on every piece of a member between two point loads (and its ends), from the page's own search.
   After the random states every file gets one fixed state, marked "fixed" and counted nowhere: a beam of 6 m, IPE 200,
   with 492.4 kN/m and 949.9 kN at 2.27 m. Its shear is zero 0.149 mm behind the load: the comparison uses it to try
   itself with that zero set before the load (review 10, C105).
   usage: node dump_random.js <count> <seed> <out.json> [share] */
const path = require('path'), fs = require('fs');
const SRC = path.join(__dirname, '..', '..', 'src') + path.sep;
global.FS = require(SRC + 'solver.js');
const { SECTIONS, PRESETS, buildModel, sectionEI, sectionEA, gridOf, stretch } = require(SRC + 'presets.js');
const CARDS = require(SRC + 'cards.js');
const vary = require(path.join(__dirname, '..', 'vary.js')), { LENGTHS } = vary, far = +process.argv[5] || 0;
let seed = +process.argv[3] || 7;
const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const count = +process.argv[2] || 200;
let out = [];
for (let r = 0; r <= count; r++) {
  const last = r === count;   /* the fixed state: no draw is made for it, so the random states are those of before */
  const p = last ? PRESETS.find(q => q.id === 'simple-p') : pick(PRESETS), m = buildModel(p), si = last ? 0 : Math.floor(rnd() * SECTIONS.length), sec = SECTIONS[si];
  if (last) { m.loads = [{ id: m.nid++, m: 0, a: 2.27, P: 949.9, ang: -90 }]; Object.assign(m.members[0].udl, { on: true, w1: 492.4, w2: 492.4, ang: -90 }); }
  const edits = last ? 0 : Math.floor(rnd() * 7);
  if (!last && far && rnd() < far) { vary.lengths(m, rnd, 0.6); vary.profiles(m, rnd, si, 0.5); }
  for (let e = 0; e < edits; e++) {
    const k = rnd();
    if (k < 0.22) { const n = pick(m.nodes.filter(q => q.cs)); if (n) n.sup = pick(['fixed', 'pin', 'roller', 'free']); }
    else if (k < 0.34) { const n = pick(m.nodes.filter(q => q.ch)); if (n) n.hinge = !n.hinge; }
    else if (k < 0.58) { const mi = Math.floor(rnd() * m.members.length), A = m.nodes[m.members[mi].n1], B = m.nodes[m.members[mi].n2], L = Math.hypot(B.x - A.x, B.y - A.y);
      m.loads.push({ id: m.nid++, m: mi, a: pick([0, L, L / 2, Math.round(rnd() * L * 20) / 20, Math.round(rnd() * L * 100) / 100]), P: pick([0.5, 5, 12.5, 20, 37.5, 100, 999.9]), ang: pick([-90, -90, -90, 0, 180, 90, -45, -60, 30, 15, 165, -135, 105]) }); }
    else if (k < 0.78) { const u = pick(m.members).udl, w = pick([0.5, 2.5, 8, 10, 15, 33.3]), sh = rnd();
      u.on = rnd() < 0.85; u.w1 = sh < 0.4 ? w : sh < 0.6 ? 0 : sh < 0.8 ? w : pick([1, 4, 20]); u.w2 = sh < 0.4 ? w : sh < 0.6 ? w : sh < 0.8 ? 0 : w; u.ang = pick([-90, -90, 0, 180, 90]); }
    /* two stiffness factors of a member changed apart: a pair that no section of the list has, a test of the analysis
       beyond what the page can set. Such states are marked (free) and counted apart; the runs toward the far corners
       of the menus, which stand for what the page can set, take a profile of the list here instead (review 11, C127) */
    else if (k < 0.82) { const mb = pick(m.members);
      if (far) { mb.sec = Math.floor(rnd() * SECTIONS.length); mb.kf = SECTIONS[mb.sec].I / sec.I; mb.ka = SECTIONS[mb.sec].A / sec.A; }
      else { mb.sec = null; mb.kf = pick([0.5, 1, 2, 4]); mb.ka = pick([0.5, 1, 1, 2]); } }
    else if (k < 0.86) { const mb = pick(m.members); mb.sec = Math.floor(rnd() * SECTIONS.length); mb.kf = SECTIONS[mb.sec].I / sec.I; mb.ka = SECTIONS[mb.sec].A / sec.A; }
    else if (k < 0.93) { const ax = pick(['x', 'x', 'y']), g = gridOf(m, ax); if (g.length > 1) { const i = Math.floor(rnd() * (g.length - 1)); stretch(m, ax, g[i], g[i + 1], pick(LENGTHS)); } }
    else if (m.loads.length) { const ld = pick(m.loads); ld.ang = pick([-90, 0, 180, -30, 75]); ld.P = pick([1, 20, 55.5]); }
  }
  const sol = FS.analyse(m, sectionEI(sec), sectionEA(sec)), steps = vary.steps(m, buildModel(p)), geo = steps[0] > 0;
  const rec = { preset: p.id, sec: sec.name, model: JSON.parse(JSON.stringify({ nodes: m.nodes, members: m.members.map(q => ({ n1: q.n1, n2: q.n2, kf: q.kf, ka: q.ka, udl: q.udl })), loads: m.loads })), ok: !!sol.ok, det: sol.det, limit: sol.limit || '', geo, steps, prof: vary.ownProfile(m, si) };
  /* a member whose second moment of area and area are those of no section of the list */
  rec.free = m.members.some(q => { const I = sec.I * (q.kf || 1), A = sec.A * (q.ka || 1); return !SECTIONS.some(o => Math.abs(o.I - I) <= 1e-9 * o.I && Math.abs(o.A - A) <= 1e-9 * o.A); });
  if (last) rec.fixed = 'beam of 6 m, IPE 200, 492.4 kN/m and 949.9 kN at 2.27 m';
  if (sol.ok) {
    rec.reac = sol.reactions.map(q => [q.Rx, q.Ry, q.Mz]);
    rec.mem = sol.mem.map(M => {
      const xs = [0, M.L * 0.125, M.L * 0.25, M.L * 0.4, M.L * 0.5, M.L * 0.6, M.L * 0.75, M.L * 0.9, M.L];
      for (const q of M.ll.pts) { for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - q.a) < 1e-9) xs[i] = q.a; xs.push(q.a); }
      const pts = [];
      for (const x of xs) for (const sd of [-1, 1]) { const f = FS.forcesAt(M, x, sd); pts.push([x, sd, f.N, f.V, f.M, FS.interp(M.smp, 'dX', x, sd), FS.interp(M.smp, 'dY', x, sd)]); }
      /* the zeros of the shear on every piece between two point loads; loads within a billionth of a metre stand at one place */
      const brk = [0];
      for (const a of M.ll.pts.map(q => q.a).filter(a => a > 1e-9 && a < M.L - 1e-9).sort((u, v) => u - v)) if (a - brk[brk.length - 1] > 1e-9) brk.push(a);
      brk.push(M.L);
      const zeros = [];
      for (let i = 0; i + 1 < brk.length; i++) for (const z of FS.vZeros(M, brk[i], brk[i + 1])) zeros.push(z);
      return { L: M.L, pts, dmax: FS.mostMoved(M).v, zeros, cuts: brk.slice(1, -1) };   /* dmax: the largest displacement along the member as the page finds it */
    });
    rec.max = sol.max;
    /* hand cards: value, reference, plain formula */
    const strip = s => { let t = s; for (let i = 0; i < 4; i++) t = t.replace(/<span class="fr"><span>((?:(?!<span class="fr">).)*?)<\/span><span>((?:(?!<span class="fr">).)*?)<\/span><\/span>/g, '($1)/($2)'); return t.replace(/√<span class="rt">(.*?)<\/span>/g, '√[$1]').replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, ''); };
    rec.cards = CARDS.hand(m, sol).map(c => ({ title: c.title, note: strip(c.note || ''), rows: c.rows.map(q => ({ f: strip(q.f), s: q.s, v: q.v, u: q.u, ref: q.ref, dec: q.dec || 0 })) }));
    rec.eq = CARDS.equilibrium(m, sol);
    const rw = q => ({ f: strip(q.f), s: q.s, v: q.v, u: q.u, ref: q.ref, dec: q.dec || 0 });
    rec.insight = m.members.map((_, i) => { const r = CARDS.insight(sol, i); return { kind: r.kind, text: strip(r.text), M1: r.M1, M2: r.M2, qdef: r.qdef || '', across: !!r.across, ab: !!r.ab, rows: r.rows.map(rw) }; });
    rec.shear = m.members.map((_, i) => { const r = CARDS.shear(m, sol, i); return { text: strip(r.text), V1: r.V1, V2: r.V2, x0: r.x0, ab: !!r.ab, qdef: r.qdef || '', across: !!r.across, ties: r.ties.map(strip), rows: r.rows.map(rw) }; });
  }
  out.push(rec);
}
fs.writeFileSync(process.argv[4], JSON.stringify(out));
{ const all = out; out = all.filter(q => !q.fixed); }   /* the counts are those of the random states */
console.log(out.length, 'models,', out.filter(q => q.ok).length, 'solved (rigid members exactly in', out.filter(q => q.limit === 'exact').length + ', in three steps in', out.filter(q => q.limit === 'steps').length + ');', out.filter(q => q.geo).length, 'end with a length other than that of the example,', out.filter(q => q.prof).length, 'with a member whose profile is not that of the structure,', out.filter(q => q.free).length, 'with a member whose two stiffness factors are those of no section of the list' + (far ? `; steps of the grid with another length than in the example: none in ${out.filter(q => !q.steps[0]).length} states, some in ${out.filter(q => q.steps[0] && q.steps[0] < q.steps[1]).length}, all in ${out.filter(q => q.steps[0] === q.steps[1]).length}` : ''));
