/* Solver checks against closed-form results. Run: node test/solver.test.js */
const FS = require('../src/solver.js');

const E = 2.1e8, I = 8356e-8, A = 53.8e-4, EI = E * I, EA = E * A;
let pass = 0, fail = 0;
function near(name, got, want, tol = 1e-6) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
}
function mk(nodes, members, loads = [], opts = {}) {
  return {
    nodes: nodes.map(([x, y, sup, hinge]) => ({ x, y, sup: sup || 'free', hinge: !!hinge })),
    members: members.map(([n1, n2, w, ang, kf, rel]) => ({
      n1, n2, EI: EI * (kf || 1), EA: opts.EA || EA, rel: rel || [0, 0],
      udl: { on: !!(Array.isArray(w) ? w[0] || w[1] : w), w1: Array.isArray(w) ? w[0] : w || 0, w2: Array.isArray(w) ? w[1] : w || 0, ang: ang === undefined ? -90 : ang } })),
    loads: loads.map(([m, a, P, ang], i) => ({ id: i, m, a, P, ang: ang === undefined ? -90 : ang })),
  };
}
const Mx = (s, mi, x, side = -1) => FS.forcesAt(s.mem[mi], x, side).M;
const Vx = (s, mi, x, side = -1) => FS.forcesAt(s.mem[mi], x, side).V;
const Nx = (s, mi, x, side = -1) => FS.forcesAt(s.mem[mi], x, side).N;
const dY = (s, mi, x) => FS.interp(s.mem[mi].smp, 'dY', x, -1);
const dX = (s, mi, x) => FS.interp(s.mem[mi].smp, 'dX', x, -1);

/* 1 simple beam, point load */
{
  const L = 6, P = 20, a = 2, b = 4;
  const s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1]], [[0, a, P]]));
  near('ss A', s.reactions[0].Ry, P * b / L);
  near('ss B', s.reactions[1].Ry, P * a / L);
  near('ss M', Mx(s, 0, a), P * a * b / L);
  near('ss V left', Vx(s, 0, a, -1), P * b / L);
  near('ss V right', Vx(s, 0, a, 1), -P * a / L);
  near('ss d', -dY(s, 0, a), P * a * a * b * b / (3 * EI * L), 1e-5);
  near('ss det', s.det.n, 0);
  const s2 = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1]], [[0, 3, P]]));
  near('ss mid M', Mx(s2, 0, 3), P * L / 4);
  near('ss mid d', -dY(s2, 0, 3), P * L ** 3 / (48 * EI), 1e-5);
}
/* 2 simple beam, UDL */
{
  const L = 6, w = 10;
  const s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, w]]));
  near('ssw A', s.reactions[0].Ry, w * L / 2);
  near('ssw M', Mx(s, 0, L / 2), w * L * L / 8);
  near('ssw d', -dY(s, 0, L / 2), 5 * w * L ** 4 / (384 * EI), 1e-5);
  near('ssw V0', Vx(s, 0, 0, 1), w * L / 2);
  near('ssw VL', Vx(s, 0, L, -1), -w * L / 2);
}
/* 3 cantilever */
{
  const L = 3, P = 10, w = 10;
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1]], [[0, L, P]]));
  near('cant M', Mx(s, 0, 0, 1), -P * L);
  near('cant V', Vx(s, 0, 1), P);
  near('cant d', -dY(s, 0, L), P * L ** 3 / (3 * EI), 1e-5);
  near('cant Mz', s.reactions[0].Mz, P * L);
  near('cant det', s.det.n, 0);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1]], [[0, 2, P]]));
  near('cant a d tip', -dY(s, 0, L), P * 4 * (3 * L - 2) / (6 * EI), 1e-5);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, w]]));
  near('cantw M', Mx(s, 0, 0, 1), -w * L * L / 2);
  near('cantw d', -dY(s, 0, L), w * L ** 4 / (8 * EI), 1e-5);
  /* fixed at the right end */
  s = FS.solve(mk([[0, 0], [L, 0, 'fixed']], [[0, 1]], [[0, 0, P]]));
  near('cantR M', Mx(s, 0, L), -P * L);
  near('cantR V', Vx(s, 0, 1), -P);
  near('cantR d', -dY(s, 0, 0), P * L ** 3 / (3 * EI), 1e-5);
}
/* 4 propped cantilever */
{
  const L = 6, w = 10, P = 20;
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'roller']], [[0, 1, w]]));
  near('prop MA', Mx(s, 0, 0, 1), -w * L * L / 8);
  near('prop B', s.reactions[1].Ry, 3 * w * L / 8);
  near('prop A', s.reactions[0].Ry, 5 * w * L / 8);
  near('prop Mfield', Mx(s, 0, 5 * L / 8), 9 * w * L * L / 128);
  near('prop det', s.det.n, 1);
  let dmax = 0;
  for (let i = 0; i < s.mem[0].smp.xs.length; i++) dmax = Math.max(dmax, -s.mem[0].smp.dY[i]);
  near('prop dmax', dmax, w * L ** 4 / (184.6 * EI), 2e-3);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'roller']], [[0, 1]], [[0, 3, P]]));
  near('propP MA', Mx(s, 0, 0, 1), -3 * P * L / 16);
  near('propP B', s.reactions[1].Ry, 5 * P / 16);
  near('propP MP', Mx(s, 0, 3), 5 * P * L / 32);
  const a = 2, b = 4;
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'roller']], [[0, 1]], [[0, a, P]]));
  near('propPa B', s.reactions[1].Ry, P * a * a * (3 * L - a) / (2 * L ** 3));
  near('propPa MA', Mx(s, 0, 0, 1), -P * a * b * (L + b) / (2 * L * L));
}
/* 5 fixed-fixed */
{
  const L = 6, w = 10, P = 20, a = 2, b = 4;
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'fixed']], [[0, 1, w]]));
  near('ff M0', Mx(s, 0, 0, 1), -w * L * L / 12);
  near('ff Mmid', Mx(s, 0, L / 2), w * L * L / 24);
  near('ff d', -dY(s, 0, L / 2), w * L ** 4 / (384 * EI), 1e-5);
  near('ff det', s.det.n, 3);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'fixed']], [[0, 1]], [[0, a, P]]));
  near('ffP MA', Mx(s, 0, 0, 1), -P * a * b * b / L ** 2);
  near('ffP MB', Mx(s, 0, L), -P * a * a * b / L ** 2);
  near('ffP MP', Mx(s, 0, a), 2 * P * a * a * b * b / L ** 3);
  near('ffP d', -dY(s, 0, a), P * a ** 3 * b ** 3 / (3 * EI * L ** 3), 1e-5);
}
/* 6 two-span continuous */
{
  const L = 5, w = 10;
  let s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller'], [2 * L, 0, 'roller']], [[0, 1, w], [1, 2, w]]));
  near('cont MB', Mx(s, 0, L), -w * L * L / 8);
  near('cont A', s.reactions[0].Ry, 3 * w * L / 8);
  near('cont B', s.reactions[1].Ry, 5 * w * L / 4);
  near('cont Mfield', Mx(s, 0, 3 * L / 8), 9 * w * L * L / 128);
  near('cont det', s.det.n, 1);
  s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller'], [2 * L, 0, 'roller']], [[0, 1, w], [1, 2]]));
  near('cont1 MB', Mx(s, 0, L), -w * L * L / 16);
  near('cont1 A', s.reactions[0].Ry, 7 * w * L / 16);
  near('cont1 B', s.reactions[1].Ry, 5 * w * L / 8);
  near('cont1 C', s.reactions[2].Ry, -w * L / 16);
}
/* 7 overhang and Gerber beam (statics) */
{
  let s = FS.solve(mk([[0, 0, 'pin'], [5, 0, 'roller'], [7, 0]], [[0, 1, 8], [1, 2]], [[1, 2, 15]]));
  near('over B', s.reactions[1].Ry, 41);
  near('over A', s.reactions[0].Ry, 14);
  near('over MB', Mx(s, 0, 5), -30);
  near('over det', s.det.n, 0);
  s = FS.solve(mk([[0, 0, 'pin'], [6, 0, 'roller'], [7.5, 0, 'free', 1], [10, 0, 'roller']], [[0, 1, 10], [1, 2, 10], [2, 3, 10]]));
  near('gerber det', s.det.n, 0);
  near('gerber C', s.reactions[3].Ry, 12.5);
  near('gerber MG', Mx(s, 2, 0, 1), 0, 1e-9);
  near('gerber MB', Mx(s, 0, 6), -(12.5 * 1.5 + 10 * 1.5 * 0.75));
  near('gerber B', s.reactions[1].Ry, (10 * 7.5 * 3.75 + 12.5 * 7.5) / 6);
}
/* 8 three-hinged frame: H = w l^2 / (8 f) */
{
  const s = FS.solve(mk([[0, 0, 'pin'], [0, 4], [4, 4, 'free', 1], [8, 4], [8, 0, 'pin']],
    [[0, 1], [1, 2, 10], [2, 3, 10], [3, 4]]));
  near('3h det', s.det.n, 0);
  near('3h H', s.reactions[0].Rx, 10 * 64 / (8 * 4));
  near('3h Hb', s.reactions[4].Rx, -20);
  near('3h V', s.reactions[0].Ry, 40);
  near('3h Mcorner', Mx(s, 1, 0, 1), -80);
}
/* 9 portal frames against the classic formulas (axial deformation suppressed) */
{
  const h = 4, L = 6, w = 15, P = 20, big = { EA: EA * 1e6 };
  for (const kf of [1, 2, 0.5]) {
    const k = (1 / kf) * (h / L);
    const fr = (sup, mw, loads) => FS.solve(mk([[0, 0, sup], [0, h], [L, h], [L, 0, sup]],
      [[0, 1, 0, -90, kf], [1, 2, mw], [2, 3, 0, -90, kf]], loads, big));
    let s = fr('fixed', w, []);
    near('pf-fixed-w Mcorner', Mx(s, 1, 0, 1), -w * L * L / (6 * (k + 2)), 1e-4);
    near('pf-fixed-w Mbase', Mx(s, 0, 0, 1), w * L * L / (12 * (k + 2)), 1e-4);
    near('pf-fixed-w H', s.reactions[0].Rx, w * L * L / (4 * h * (k + 2)), 1e-4);
    near('pf-fixed det', s.det.n, 3);
    s = fr('pin', w, []);
    near('pf-pin-w Mcorner', Mx(s, 1, 0, 1), -w * L * L / (4 * (2 * k + 3)), 1e-4);
    near('pf-pin-w H', s.reactions[0].Rx, w * L * L / (4 * h * (2 * k + 3)), 1e-4);
    near('pf-pin det', s.det.n, 1);
    s = fr('pin', 0, [[1, 0, P, 0]]);
    near('pf-pin-P HA', s.reactions[0].Rx, -P / 2, 1e-4);
    near('pf-pin-P Mcorner', Math.abs(Mx(s, 1, 0, 1)), P * h / 2, 1e-4);
    near('pf-pin-P sway', dX(s, 1, 0), P * h ** 3 / (6 * EI * kf) + P * h * h * L / (12 * EI), 1e-4);
    s = fr('fixed', 0, [[1, 0, P, 0]]);
    near('pf-fixed-P Mbase', Math.abs(Mx(s, 0, 0, 1)), P * h * (3 * k + 1) / (2 * (6 * k + 1)), 1e-4);
    near('pf-fixed-P Mcorner', Math.abs(Mx(s, 1, 0, 1)), P * h * 3 * k / (2 * (6 * k + 1)), 1e-4);
  }
}
/* 10 Pratt truss by the method of sections */
{
  const N = [[0, 0, 'pin', 1], [3, 0, 'free', 1], [6, 0, 'free', 1], [9, 0, 'free', 1], [12, 0, 'roller', 1], [3, 3, 'free', 1], [6, 3, 'free', 1], [9, 3, 'free', 1]];
  const Mb = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7], [0, 5], [4, 7], [5, 2], [7, 2]];
  const s = FS.solve(mk(N, Mb, [[0, 3, 20], [1, 3, 20], [2, 3, 20]]));
  near('truss det', s.det.n, 0);
  near('truss A', s.reactions[0].Ry, 30);
  near('truss top chord', Nx(s, 4, 1), -(30 * 6 - 20 * 3) / 3);
  near('truss bottom chord', Nx(s, 1, 1), 30 * 3 / 3);
  near('truss diagonal', Nx(s, 11, 1), (30 - 20) / Math.SQRT1_2);
  near('truss end diagonal', Nx(s, 9, 1), -30 / Math.SQRT1_2);
  near('truss M=0', s.max.M, 0, 1e-9);
  /* midspan deflection by virtual work */
  const s1 = FS.solve(mk(N, Mb, [[1, 3, 1]]));
  let d = 0;
  for (let i = 0; i < Mb.length; i++) d += Nx(s, i, 0.5) * Nx(s1, i, 0.5) * s.mem[i].L / EA;
  near('truss deflection (virtual work)', -dY(s, 1, 3), d, 1e-6);
}
/* 11 rotation invariance: inclined cantilever with a perpendicular tip load */
{
  const L = 3, P = 10, t = 30 * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t);
  const s = FS.solve(mk([[0, 0, 'fixed'], [L * c, L * sn]], [[0, 1]], [[0, L, P, -60]]));
  near('incl M', Mx(s, 0, 0, 1), -P * L);
  near('incl N', Nx(s, 0, 1), 0, 1e-9);
  near('incl d', Math.hypot(dX(s, 0, L), dY(s, 0, L)), P * L ** 3 / (3 * EI), 1e-5);
  /* axial load on a bar: N and elongation */
  const s2 = FS.solve(mk([[0, 0, 'fixed'], [L * c, L * sn]], [[0, 1]], [[0, L, P, 30]]));
  near('axial N', Nx(s2, 0, 1), P);
  near('axial M', Mx(s2, 0, 1), 0, 1e-9);
  near('axial u', Math.hypot(dX(s2, 0, L), dY(s2, 0, L)), P * L / EA, 1e-6);
}
/* 12 bent cantilever and general equilibrium */
{
  const s = FS.solve(mk([[0, 0, 'fixed'], [0, 4], [3, 4]], [[0, 1], [1, 2]], [[1, 3, 10]]));
  near('L Mz', s.reactions[0].Mz, 30);
  near('L N col', Nx(s, 0, 2), -10);
  near('L M col', Mx(s, 0, 2), -30);
  near('L M beam root', Mx(s, 1, 0, 1), -30);
  near('L det', s.det.n, 0);
  /* two-bay frame: sum of reactions equals loads, moments balance */
  const m = mk([[0, 0, 'fixed'], [0, 4], [5, 4], [5, 0, 'pin'], [10, 4], [10, 0, 'fixed']],
    [[0, 1], [1, 2, 10], [2, 3], [2, 4], [4, 5]], [[3, 2.5, 30], [1, 0, 12, 0]]);
  const t = FS.solve(m);
  let fx = 12, fy = -50 - 30, mz = -(10 * 5 * 2.5) - 30 * 7.5 - 12 * 4;
  t.reactions.forEach((r, i) => { fx += r.Rx; fy += r.Ry; mz += r.Mz + m.nodes[i].x * r.Ry - m.nodes[i].y * r.Rx; });
  near('2bay sumFx', fx, 0, 1e-7); near('2bay sumFy', fy, 0, 1e-7); near('2bay sumM', mz, 0, 1e-6);
  near('2bay det', t.det.n, 3 * 5 + 8 - 3 * 6);
  /* joint equilibrium of moments at the middle joint */
  near('2bay joint M', Mx(t, 1, 5) - Mx(t, 3, 0, 1) - Mx(t, 2, 0, 1), 0, 1e-7);
}
/* 13 mechanisms are reported */
{
  near('mech two rollers', FS.solve(mk([[0, 0, 'roller'], [6, 0, 'roller']], [[0, 1]], [[0, 3, 10]])).ok ? 1 : 0, 0);
  near('mech pin only', FS.solve(mk([[0, 0, 'pin'], [6, 0]], [[0, 1]], [[0, 3, 10]])).ok ? 1 : 0, 0);
  near('mech 4 hinges', FS.solve(mk([[0, 0, 'pin'], [0, 4, 'free', 1], [6, 4, 'free', 1], [6, 0, 'pin']], [[0, 1], [1, 2], [2, 3]], [[1, 0, 10, 0]])).ok ? 1 : 0, 0);
}
/* 14 simple beam, triangular load: zero at A, q at B, and its mirror */
{
  const L = 6, q = 12, r3 = Math.sqrt(3);
  let s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [0, q]]]));
  near('tri A', s.reactions[0].Ry, q * L / 6);
  near('tri B', s.reactions[1].Ry, q * L / 3);
  near('tri V0', Vx(s, 0, 0, 1), q * L / 6);
  near('tri VL', Vx(s, 0, L, -1), -q * L / 3);
  near('tri Mmax', Mx(s, 0, L / r3), q * L * L / (9 * r3));
  near('tri V at L/sqrt3', Vx(s, 0, L / r3), 0, 1e-9);
  near('tri M mid', Mx(s, 0, L / 2), q * L * L / 16);
  near('tri d mid', -dY(s, 0, L / 2), 5 * q * L ** 4 / (768 * EI), 1e-6);
  const xm = L * Math.sqrt(1 - Math.sqrt(8 / 15)), dm = q * xm * (7 * L ** 4 - 10 * L * L * xm * xm + 3 * xm ** 4) / (360 * L * EI);
  near('tri d max', Math.max(...Array.from(s.mem[0].smp.dY, v => -v)), dm, 1e-5);
  near('tri d max coefficient', dm / (q * L ** 4 / EI), 0.0065222, 1e-4);
  near('tri zero of V', FS.vZeros(s.mem[0], 0, L)[0], L / r3, 1e-9);
  near('tri zeros of V: one', FS.vZeros(s.mem[0], 0, L).length, 1);
  s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [q, 0]]]));
  near('tri mirror A', s.reactions[0].Ry, q * L / 3);
  near('tri mirror B', s.reactions[1].Ry, q * L / 6);
  near('tri mirror Mmax', Mx(s, 0, L - L / r3), q * L * L / (9 * r3));
  near('tri mirror zero of V', FS.vZeros(s.mem[0], 0, L)[0], L - L / r3, 1e-9);
  near('tri mirror d mid', -dY(s, 0, L / 2), 5 * q * L ** 4 / (768 * EI), 1e-6);
  /* upward */
  s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [0, q], 90]]));
  near('tri up A', s.reactions[0].Ry, -q * L / 6);
  near('tri up Mmax', Mx(s, 0, L / r3), -q * L * L / (9 * r3));
  /* uniform as two equal end values */
  s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [10, 10]]]));
  near('uni as pair M', Mx(s, 0, L / 2), 10 * L * L / 8);
  near('uni zero of V', FS.vZeros(s.mem[0], 0, L)[0], L / 2, 1e-9);
}
/* 15 cantilever, triangular load */
{
  const L = 3, q = 12;
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, [q, 0]]]));     /* high at the fixed end */
  near('cant tri R', s.reactions[0].Ry, q * L / 2);
  near('cant tri M', Mx(s, 0, 0, 1), -q * L * L / 6);
  near('cant tri Mz', s.reactions[0].Mz, q * L * L / 6);
  near('cant tri d', -dY(s, 0, L), q * L ** 4 / (30 * EI), 1e-6);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, [0, q]]]));         /* high at the free end */
  near('cant tri2 R', s.reactions[0].Ry, q * L / 2);
  near('cant tri2 M', Mx(s, 0, 0, 1), -q * L * L / 3);
  near('cant tri2 d', -dY(s, 0, L), 11 * q * L ** 4 / (120 * EI), 1e-6);
  s = FS.solve(mk([[0, 0], [L, 0, 'fixed']], [[0, 1, [q, 0]]]));         /* fixed on the right, high at the free end */
  near('cant tri3 M', Mx(s, 0, L, -1), -q * L * L / 3);
  near('cant tri3 d', -dY(s, 0, 0), 11 * q * L ** 4 / (120 * EI), 1e-6);
}
/* 16 fixed beam, triangular load: zero at A, q at B */
{
  const L = 6, q = 12;
  const s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'fixed']], [[0, 1, [0, q]]]));
  near('fix tri MA', Mx(s, 0, 0, 1), -q * L * L / 30);
  near('fix tri MB', Mx(s, 0, L, -1), -q * L * L / 20);
  near('fix tri RA', s.reactions[0].Ry, 3 * q * L / 20);
  near('fix tri RB', s.reactions[1].Ry, 7 * q * L / 20);
  near('fix tri d mid', -dY(s, 0, L / 2), q * L ** 4 / (768 * EI), 1e-6);
  near('fix tri M mid', Mx(s, 0, L / 2), q * L * L / 16 - (q * L * L / 30 + q * L * L / 20) / 2);
}
/* 17 propped cantilever, triangular load: fixed at A, roller at B */
{
  const L = 6, q = 12, r5 = Math.sqrt(5);
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'roller']], [[0, 1, [q, 0]]]));   /* high at the fixed end */
  near('prop tri RB', s.reactions[1].Ry, q * L / 10);
  near('prop tri RA', s.reactions[0].Ry, 2 * q * L / 5);
  near('prop tri MA', Mx(s, 0, 0, 1), -q * L * L / 15);
  near('prop tri Mspan', Mx(s, 0, L - L / r5), q * L * L / (15 * r5));
  near('prop tri zero of V', FS.vZeros(s.mem[0], 0, L)[0], L - L / r5, 1e-9);
  s = FS.solve(mk([[0, 0, 'fixed'], [L, 0, 'roller']], [[0, 1, [0, q]]]));       /* high at the prop */
  near('prop tri2 RB', s.reactions[1].Ry, 11 * q * L / 40);
  near('prop tri2 RA', s.reactions[0].Ry, 9 * q * L / 40);
  near('prop tri2 MA', Mx(s, 0, 0, 1), -7 * q * L * L / 120);
  const xs = L - L * (1 - Math.sqrt(0.45));
  near('prop tri2 zero of V', FS.vZeros(s.mem[0], 0, L)[0], xs, 1e-9);
  near('prop tri2 Mspan coefficient', Mx(s, 0, xs) / (q * L * L), 0.04230, 1e-3);
}
/* 18 a load from q1 to q2 is a uniform load plus a triangle; point loads on top */
{
  const L = 5, nd = [[0, 0, 'fixed'], [L, 0, 'roller'], [8, 0]];
  const a = FS.solve(mk(nd, [[0, 1, [4, 10]], [1, 2, [10, 2]]], [[0, 2, 15], [1, 3, 6]]));
  const u = FS.solve(mk(nd, [[0, 1, 4], [1, 2, 2]], [[0, 2, 15], [1, 3, 6]]));
  const t = FS.solve(mk(nd, [[0, 1, [0, 6]], [1, 2, [8, 0]]]));
  near('trap RA', a.reactions[0].Ry, u.reactions[0].Ry + t.reactions[0].Ry);
  near('trap RB', a.reactions[1].Ry, u.reactions[1].Ry + t.reactions[1].Ry);
  near('trap Mz', a.reactions[0].Mz, u.reactions[0].Mz + t.reactions[0].Mz);
  for (const x of [0.7, 2, 3.3, 5]) near('trap M ' + x, Mx(a, 0, x), Mx(u, 0, x) + Mx(t, 0, x));
  for (const x of [0.5, 1.5, 3]) { near('trap M2 ' + x, Mx(a, 1, x), Mx(u, 1, x) + Mx(t, 1, x)); near('trap V2 ' + x, Vx(a, 1, x), Vx(u, 1, x) + Vx(t, 1, x)); }
  near('trap d tip', dY(a, 1, 3), dY(u, 1, 3) + dY(t, 1, 3), 1e-6);
  near('trap sum V', a.reactions[0].Ry + a.reactions[1].Ry, (4 + 10) / 2 * 5 + (10 + 2) / 2 * 3 + 21);
  /* overhang 1-2: moment at B from the loads beyond it: trapezoid 10 -> 2 over 3 m and 6 kN at the tip */
  near('trap MB', Mx(a, 1, 0, 1), -(2 * 3 * 1.5 + 8 * 3 / 2 * 1 + 6 * 3));
}
/* 19 load along the axis that grows in a straight line: bar fixed at one end, and bar held at both ends */
{
  const L = 4, p = 9;
  let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, [0, p], 0]]));
  near('ax tri N root', Nx(s, 0, 0, 1), p * L / 2);
  near('ax tri N mid', Nx(s, 0, L / 2), p * (L * L - L * L / 4) / (2 * L));
  near('ax tri u tip', dX(s, 0, L), p * L * L / (3 * EA), 1e-6);
  near('ax tri Rx', s.reactions[0].Rx, -p * L / 2);
  s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'pin']], [[0, 1, [0, p], 0]]));
  near('ax tri held R1', s.reactions[0].Rx, -p * L / 6);
  near('ax tri held R2', s.reactions[1].Rx, -p * L / 3);
  near('ax tri held u', dX(s, 0, L), 0, 1e-12);
}
/* 20 frames: triangular wind on a column, vertical triangle on a sloping member: equilibrium of the whole */
{
  const m = mk([[0, 0, 'fixed'], [0, 4], [6, 5], [6, 0, 'pin']], [[0, 1, [8, 0], 0], [1, 2, [0, 9]], [2, 3]], [[1, 2, 10]]);
  const s = FS.solve(m), Ls = Math.hypot(6, 1);
  let fx = 8 * 4 / 2, fy = -9 * Ls / 2 - 10, mz = -(8 * 4 / 2) * (4 / 3);
  mz += -(9 * Ls / 2) * (6 * 2 / 3);
  mz += -10 * (6 * 2 / Ls);
  s.reactions.forEach((r, i) => { fx += r.Rx; fy += r.Ry; mz += r.Mz + m.nodes[i].x * r.Ry - m.nodes[i].y * r.Rx; });
  near('frame tri sumFx', fx, 0, 1e-7); near('frame tri sumFy', fy, 0, 1e-7); near('frame tri sumM', mz, 0, 1e-6);
  near('frame tri joint M', Mx(s, 0, 4) - Mx(s, 1, 0, 1), 0, 1e-7);
  near('frame tri qAt', FS.qAt(s.mem[0], 1).qy, -8 * 0.75);
  near('frame tri hasQ col', FS.hasQ(s.mem[0]) ? 1 : 0, 1);
  near('frame tri hasQ right col', FS.hasQ(s.mem[2]) ? 1 : 0, 0);
}
/* 21 zeros of the shear between point loads */
{
  const s = FS.solve(mk([[0, 0, 'pin'], [8, 0, 'roller']], [[0, 1, [0, 6]]], [[0, 2, 5], [0, 6, 5]]));
  const z = [...FS.vZeros(s.mem[0], 0, 2), ...FS.vZeros(s.mem[0], 2, 6), ...FS.vZeros(s.mem[0], 6, 8)];
  near('zeros count', z.length, 1);
  near('zero is a zero', Vx(s, 0, z[0]), 0, 1e-9);
  const pk = Mx(s, 0, z[0]);
  near('zero is the peak', Math.max(...s.mem[0].smp.M), pk, 1e-4);
  near('no sample above the peak', Math.max(...s.mem[0].smp.M) <= pk + 1e-9 ? 1 : 0, 1);
}
/* 22 a shear that only touches zero at an end is no zero inside: cantilevers under a triangle that ends in zero */
{
  for (const L of [3, 4, 6, 7.3]) for (const q of [6, 12, 0.7, 250]) {
    let s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, [q, 0]]]));
    near(`touch free end ${L} ${q}`, FS.vZeros(s.mem[0], 0, L).length, 0);
    s = FS.solve(mk([[0, 0], [L, 0, 'fixed']], [[0, 1, [0, q]]]));
    near(`touch free end, mirrored ${L} ${q}`, FS.vZeros(s.mem[0], 0, L).length, 0);
    s = FS.solve(mk([[0, 0, 'fixed'], [0, L], [3, L]], [[0, 1, [q, 0], 0], [1, 2]]));
    near(`touch at the top of a column ${L} ${q}`, FS.vZeros(s.mem[0], 0, L).length, 0);
    s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [q, 0]]]));
    near(`a true zero stays ${L} ${q}`, FS.vZeros(s.mem[0], 0, L)[0], L - L / Math.sqrt(3), 1e-9);
  }
  /* a zero close to an end is still found: the tip load on the overhang leaves a small reaction at A */
  for (const [P, x0] of [[62.25, 0.01], [62.4975, 0.0001]]) {
    const s = FS.solve(mk([[0, 0, 'pin'], [5, 0, 'roller'], [7, 0]], [[0, 1, 10], [1, 2]], [[1, 2, P]]));
    const z = FS.vZeros(s.mem[0], 0, 5);
    near(`zero ${x0} m from the end: found`, z.length, 1);
    near(`zero ${x0} m from the end: place`, z[0], x0, 1e-9);
  }
  const s2 = FS.solve(mk([[0, 0, 'fixed'], [6, 0, 'roller']], [[0, 1, 10]], [[0, 0.05, 30]]));
  near('pieces: one zero in all', FS.vZeros(s2.mem[0], 0, 0.05).length + FS.vZeros(s2.mem[0], 0.05, 6).length, 1);
}
/* A joint between two bars in one line can move across them: a mechanism, although the count n is 0. With some
   sections the hinge condensation used to leave a rounding amount of stiffness there, and the frame counted as
   stable with a displacement of 4.4e13 m (review 02, finding C01). */
{
  const SEC = [[1943, 28.5], [3891, 39.1], [8356, 53.8], [16260, 72.7], [23120, 84.5], [5696, 78.1], [25160, 149.1]];
  for (const [Iy, Ar] of SEC) {
    const m = mk([[0, 0, 'fixed'], [0, 4, 'free', 1], [4, 4, 'free', 1], [8, 4, 'free', 1], [8, 0, 'fixed']], [[0, 1], [1, 2, 10], [2, 3, 10], [3, 4]]);
    const s = FS.analyse(m, 2.1 * Iy, 21000 * Ar);
    near(`three hinges in a line, I = ${Iy}: mechanism`, s.ok ? 1 : 0, 0);
    near(`three hinges in a line, I = ${Iy}: count n`, s.det.n, 0);
    near(`three hinges in a line, I = ${Iy}: one hold is enough, at the middle joint, vertical`, (s.loose || []).length === 1 && s.loose[0].i === 2 && s.loose[0].d === 1 ? 1 : 0, 1);
    /* the same frame with rigid corners is stable and gives a sane deflection */
    const m2 = mk([[0, 0, 'fixed'], [0, 4], [4, 4, 'free', 1], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2, 10], [2, 3, 10], [3, 4]]);
    const s2 = FS.analyse(m2, 2.1 * Iy, 21000 * Ar);
    near(`rigid corners, I = ${Iy}: stable`, s2.ok && s2.max.D < 1 ? 1 : 0, 1);
  }
  /* a beam on two rollers: either roller made a pin would hold it */
  const r = FS.analyse(mk([[0, 0, 'roller'], [6, 0, 'roller']], [[0, 1]], [[0, 2, 20]]), EI, EA);
  near('two rollers: mechanism', r.ok ? 1 : 0, 0);
  near('two rollers: n = -1', r.det.n, -1);
  near('two rollers: a sideways hold at either support is enough', JSON.stringify(r.loose) === '[{"i":0,"d":0},{"i":1,"d":0}]' ? 1 : 0, 1);
  /* a bar hinged at both ends has no stiffness across its axis: exactly zero, in every row and column */
  const sb = FS.solve(mk([[0, 0, 'pin', 1], [3, 0, 'roller', 1]], [[0, 1, 10]]));
  let kmax = 0; for (const i of [1, 2, 4, 5]) for (let j = 0; j < 6; j++) kmax = Math.max(kmax, Math.abs(sb.mem[0].k[i][j]), Math.abs(sb.mem[0].k[j][i]));
  near('bar: stiffness across its axis is exactly zero', kmax, 0, 0);
  near('bar under a uniform load: midspan moment q L2 / 8', Mx(sb, 0, 1.5), 10 * 9 / 8);
}
/* A zero of V counts wherever it lies in its piece, as long as the shear has a real size on both sides (review 07,
   finding C78): the distance from a load or a support does not decide. */
{
  const s = FS.solve(mk([[0, 0, 'pin'], [5, 0, 'roller'], [7, 0]], [[0, 1, 10], [1, 2]], [[1, 2, 62.499925]]));
  const z = FS.vZeros(s.mem[0], 0, 5);
  near('reaction of 0.00003 kN at A: the zero of V 3 µm from A is found', z.length, 1);
  near('its place', z[0], 3e-6, 1e-9);
  /* 6 m beam, 100 kN/m and 92.3 kN at 2.60 m: the shear is +92.30333 before the load and +0.00333 behind it, and
     reaches zero 0.0333 mm behind the load. The moment is largest there, not at the load */
  const c = FS.solve(mk([[0, 0, 'pin'], [6, 0, 'roller']], [[0, 1, 100]], [[0, 2.6, 92.3]]));
  near('reaction at A', c.reactions[0].Ry, 300 + 92.3 * 3.4 / 6, 1e-12);
  near('shear before the load', Vx(c, 0, 2.6, -1), 92.3033333333, 1e-9);
  near('shear behind the load: still positive', Vx(c, 0, 2.6, 1), 0.0033333333, 1e-6);
  const zc = FS.vZeros(c.mem[0], 2.6, 6);
  near('one zero of V behind the load', zc.length, 1);
  near('at 2.6000333 m', zc[0], 2.6 + 0.0033333333 / 100, 1e-9);
  near('no zero of V before the load', FS.vZeros(c.mem[0], 0, 2.6).length, 0);
  near('the zero is a station of the member: its largest moment is a sample', Math.max(...c.mem[0].smp.M), Mx(c, 0, zc[0]), 1e-12);
}
/* The stations of a member hold the places that shape its lines (review 07, findings C71, C44, C45): the zeros of V,
   M and N of every piece and three steps of its own for a short piece. */
{
  /* 8 m beam on two supports, 400 kN/m down and 20 kN up at every 0.05 m: reactions 10 kN, and between two loads the
     moment is 10 s - 200 s^2: zero at both loads, +0.125 kNm half way */
  const loads = []; for (let k = 1; k < 160; k++) loads.push([0, 0.05 * k, 20, 90]);
  const s = FS.solve(mk([[0, 0, 'pin'], [8, 0, 'roller']], [[0, 1, 400]], loads));
  near('reaction of the beam with 159 upward loads', s.reactions[0].Ry, 10, 1e-9);
  near('moment half way between two loads', Mx(s, 0, 4.025), 0.125, 1e-7);
  near('the largest sample of the moment is that peak, not a zero at a load', Math.max(...Array.from(s.mem[0].smp.M, Math.abs)), 0.125, 1e-6);
  /* cantilever with a curvature that changes sign: 6 m, 1999.9 kN up at 0.5 m, 1000 kN down at 1.5 m, 500 kN up at 2 m.
     Between 0.5 and 1.5 m the moment is zero at 1.0 m: that place is a station */
  const t = FS.solve(mk([[0, 0, 'fixed'], [6, 0]], [[0, 1]], [[0, 0.5, 1999.9, 90], [0, 1.5, 1000], [0, 2, 500, 90]]));
  const xs = Array.from(t.mem[0].smp.xs), m0 = xs.filter(x => x > 0.5 && x < 1.5 && Math.abs(Mx(t, 0, x)) < 1e-6);
  near('a zero of the moment between two loads is a station', m0.length >= 1 ? 1 : 0, 1);
  /* a bar with loads along it: the zero of N between two loads is a station */
  const b = FS.solve(mk([[0, 0, 'pin', 1], [3, 0, 'roller', 1]], [[0, 1, 500, 0]], [[0, 1.52, 4.5, 180], [0, 1.53, 4.5, 180], [0, 3, 733, 180]]));
  const xb = Array.from(b.mem[0].smp.xs), n0 = xb.filter(x => x > 1.52 && x < 1.53 && Math.abs(Nx(b, 0, x)) < 1e-6);
  near('N between the two loads is 500 (1.525 - x)', Nx(b, 0, 1.522), 1.5, 1e-9);
  near('a zero of N between two loads 1 cm apart is a station', n0.length, 1);
  near('at 1.525 m', n0[0], 1.525, 1e-9);
}
/* The number of free movements of a mechanism comes from the stiffness, not from the count n: where one restraint is
   one too many elsewhere, n shows fewer (review 03, finding C25). */
{
  const an = m => FS.analyse(m, EI, EA);
  near('two rollers: one movement', an(mk([[0, 0, 'roller'], [6, 0, 'roller']], [[0, 1]], [[0, 3, 10]])).modes, 1);
  near('no support: three movements', an(mk([[0, 0], [6, 0]], [[0, 1]], [[0, 3, 10]])).modes, 3);
  near('pin and free end: one movement', an(mk([[0, 0, 'pin'], [6, 0]], [[0, 1]], [[0, 3, 10]])).modes, 1);
  /* two-bay frame A-D, D-E, B-E, E-F, C-F on three rollers, with a hinge at D: the frame slides, and column A-D swings */
  const tb = an(mk([[0, 0, 'roller'], [0, 4, 'free', 1], [5, 4], [5, 0, 'roller'], [10, 4], [10, 0, 'roller']], [[0, 1], [1, 2, 10], [3, 2], [2, 4], [5, 4]]));
  near('two-bay frame on three rollers with a hinge: count n', tb.det.n, -1);
  near('two-bay frame on three rollers with a hinge: two movements', tb.modes, 2);
  near('two-bay frame on three rollers with a hinge: no single hold is enough', (tb.loose || []).length, 0);
  /* the same frame with a pin at B: only the column swings */
  const tb2 = an(mk([[0, 0, 'roller'], [0, 4, 'free', 1], [5, 4], [5, 0, 'pin'], [10, 4], [10, 0, 'roller']], [[0, 1], [1, 2, 10], [3, 2], [2, 4], [5, 4]]));
  near('with a pin at B: count n', tb2.det.n, 0);
  near('with a pin at B: one movement', tb2.modes, 1);
  near('a stable structure has no count of movements', an(mk([[0, 0, 'pin'], [6, 0, 'roller']], [[0, 1]], [[0, 3, 10]])).modes === undefined ? 1 : 0, 1);
}
/* Deflection and slope at places between the samples: the closed line of the beam, at the largest loads the page takes
   and with the smallest stiffness (IPE 200 at half its EI). A value read between two samples is integrated from the
   sample before it; a straight line between the samples would be off in the printed digit here. */
{
  const L = 6, rot = (s, x) => -FS.interp(s.mem[0].smp, 'rot', x, -1), w = (s, x) => -dY(s, 0, x), k = 1943e-8 * E / 2 / EI, EIk = EI * k;
  const xs = []; for (let x = 0.01; x < L; x += 0.07) xs.push(x);
  /* uniform load of 500 kN/m */
  { const q = 500, s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, q, -90, k]]));
    let ew = 0, er = 0;
    for (const x of xs) { ew = Math.max(ew, Math.abs(w(s, x) - q * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EIk))); er = Math.max(er, Math.abs(rot(s, x) - q * (L ** 3 - 6 * L * x * x + 4 * x ** 3) / (24 * EIk))); }
    near('uniform load: deflection between the samples, largest error in mm', ew * 1000, 0, 1e-6);
    near('uniform load: slope between the samples, largest error in mrad', er * 1000, 0, 1e-6); }
  /* point load of 1000 kN at a = 1.23 m: both sides of the load */
  { const P = 1000, a = 1.23, b = L - a, s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, 0, -90, k]], [[0, a, P]]));
    const wl = x => (x <= a ? P * b * x * (L * L - b * b - x * x) : P * a * (L - x) * (L * L - a * a - (L - x) ** 2)) / (6 * L * EIk);
    const rl = x => (x <= a ? P * b * (L * L - b * b - 3 * x * x) : -P * a * (L * L - a * a - 3 * (L - x) ** 2)) / (6 * L * EIk);
    let ew = 0, er = 0;
    for (const x of xs.concat([a - 0.004, a + 0.004, a])) { ew = Math.max(ew, Math.abs(w(s, x) - wl(x))); er = Math.max(er, Math.abs(rot(s, x) - rl(x))); }
    near('point load: deflection between the samples, largest error in mm', ew * 1000, 0, 1e-6);
    near('point load: slope between the samples, largest error in mrad', er * 1000, 0, 1e-6); }
  /* triangular load, zero at A and 500 kN/m at B */
  { const q = 500, s = FS.solve(mk([[0, 0, 'pin'], [L, 0, 'roller']], [[0, 1, [0, q], -90, k]]));
    let ew = 0, er = 0;
    for (const x of xs) { ew = Math.max(ew, Math.abs(w(s, x) - q * x * (7 * L ** 4 - 10 * L * L * x * x + 3 * x ** 4) / (360 * L * EIk))); er = Math.max(er, Math.abs(rot(s, x) - q * (7 * L ** 4 - 30 * L * L * x * x + 15 * x ** 4) / (360 * L * EIk))); }
    near('triangular load: deflection between the samples, largest error in mm', ew * 1000, 0, 1e-5);
    near('triangular load: slope between the samples, largest error in mrad', er * 1000, 0, 1e-5); }
  /* cantilever under 500 kN/m, fixed at A */
  { const q = 500, s = FS.solve(mk([[0, 0, 'fixed'], [L, 0]], [[0, 1, q, -90, k]]));
    let ew = 0, er = 0;
    for (const x of xs) { ew = Math.max(ew, Math.abs(w(s, x) - q * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EIk))); er = Math.max(er, Math.abs(rot(s, x) - q * x * (3 * L * L - 3 * L * x + x * x) / (6 * EIk))); }
    near('cantilever: deflection between the samples, largest error in mm', ew * 1000, 0, 1e-5);
    near('cantilever: slope between the samples, largest error in mrad', er * 1000, 0, 1e-5); }
  /* an inclined cantilever: the two parts of the displacement at a place between the samples */
  { const P = 1000, c = Math.SQRT1_2, Li = 4 * Math.SQRT2, s = FS.solve(mk([[0, 0, 'fixed'], [4, 4]], [[0, 1, 0, -90, k]], [[0, Li, P]])), x = 2.345;
    /* load P straight down at the tip: across the member P c, along it P c; deflection across the member at x, shortening along it */
    const wx = P * c * x * x * (3 * Li - x) / (6 * EIk), ux = P * c * x / EA, d = Math.hypot(dX(s, 0, x), dY(s, 0, x));
    near('inclined cantilever: displacement between the samples', d, Math.hypot(wx, ux), 1e-7); }
}
/* Bars by mechanics, and the limit of members that are rigid along their axis (review 05, findings C51, C39, C55; review 06, findings C39, C65) */
{
  const an = m => FS.analyse(m, EI, EA);
  /* portal 8 m wide, 4 m high, fixed at B; A a pin, joint C hinged; 100 kN down at C. Column A-C can carry no moment at
     either end: it is a bar and shortens. The rest of the frame holds C like a spring of 1 / (8^3/(3 EI) + 8^2 4/EI) */
  const portal = (hingeA) => mk([[0, 0, 'pin', hingeA], [0, 4, 'free', 1], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [[0, 4, 100]]);
  const k = 1 / (8 ** 3 / (3 * EI) + 8 * 8 * 4 / EI), want = 100 / (EA / 4 + k);
  const a = an(portal(0)), b = an(portal(1));
  near('column on a pin with a hinged head: a bar', FS.bars(portal(0)).join() === 'true,false,false' ? 1 : 0, 1);
  near('the same with the pin marked as a hinge too', FS.bars(portal(1)).join() === 'true,false,false' ? 1 : 0, 1);
  near('settlement of C, pin at A', -a.u[4], want, 1e-9);
  near('settlement of C, pin at A marked as a hinge: the same', -b.u[4], want, 1e-9);
  near('settlement of C in mm', -a.u[4] * 1000, 0.3540, 5e-5);
  near('a column that is rigid at its head is no bar', FS.bars(mk([[0, 0, 'pin'], [0, 4], [8, 4], [8, 0, 'pin']], [[0, 1], [1, 2], [3, 2]])).join() === 'false,false,false' ? 1 : 0, 1);
  near('in a beam no member is a bar, also between a hinge and a roller', FS.bars(mk([[0, 0, 'pin'], [6, 0, 'roller'], [7.5, 0, 'free', 1], [10, 0, 'roller']], [[0, 1], [1, 2], [2, 3]])).join() === 'false,false,false' ? 1 : 0, 1);
  near('every member of a truss is a bar', FS.bars(mk([[0, 0, 'pin', 1], [3, 0, 'roller', 1], [1.5, 2, 'free', 1]], [[0, 1], [0, 2], [1, 2]])).join() === 'true,true,true' ? 1 : 0, 1);
  /* a reaction that nearly cancels: fixed portal, 15 kN/m on the 8 m beam and 47.9 kN to the right at the left corner.
     With columns rigid along their axis the horizontal reaction at A is q L^2 / (4 h (k + 2)) - P/2 with k = 0.5:
     24 - 23.95 = 0.05 kN. A single solution with a large axial stiffness gives 0.049 997 7. */
  const f = an(mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2, 15], [3, 2]], [[0, 4, 47.9, 0]]));
  near('reaction that nearly cancels: 0.05 kN', f.reactions[0].Rx, 0.05, 1e-9);
  near('its partner', f.reactions[3].Rx, -47.95, 1e-9);
  /* a load 1 cm from the end of a member, in a frame that statics alone decides: fixed at A and held nowhere else.
     15 kN/m on the 8 m beam (2 EI), 2.5 kN/m upward along the right column, 12.5 kN at 30 degrees on that column
     3.99 m below D. By statics: F_x = -12.5 cos 30, F_z = 120 - 10 - 6.25, M_y = 480 - 80 - 8 * 6.25 + 0.01 * 12.5 cos 30 */
  const det = mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0]], [[0, 1], [1, 2, 15], [2, 3, 2.5, 90]], [[2, 3.99, 12.5, 30]]);
  det.members[1].kf = 2;
  const dr = an(det).reactions[0], c30 = 12.5 * Math.cos(Math.PI / 6);
  near('load 1 cm from the end of a member, frame decided by statics: F_x', dr.Rx, -c30, 1e-8);
  near('its F_z', dr.Ry, 103.75, 1e-8);
  near('its fixing moment', dr.Mz, 350 + 0.01 * c30, 1e-8);
  /* very large loads along the columns leave no displacement behind: portal with 85 000 kN down each column and 0.1 kN
     across the left column moves as with the 0.1 kN alone */
  const big = an(mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [[0, 4, 85000], [2, 4, 85000], [0, 2, 0.1, 0]]));
  const small = an(mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [[0, 2, 0.1, 0]]));
  near('85 000 kN down each column and 0.1 kN across: largest displacement as without the column loads, in mm', big.max.D * 1000, small.max.D * 1000, 1e-6);
  const only = an(mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [[0, 4, 85000], [2, 4, 85000]]));
  near('the column loads alone: nothing moves, in mm', only.max.D * 1000, 0, 1e-7);
  /* What the analysis states of its own arithmetic (review 06, findings C39 and C65; since version 13 the members that are
     rigid along their axis are solved exactly, with their length as a condition): the largest force and moment out of
     balance in its equations and the largest change of length of a rigid member. None for a structure of bars. In the
     frames above it is the last digits of the elimination. The page calls a line zero below a hundred times that amount
     plus 1e-10 of the largest value of its kind, each line in its own unit. */
  const tr = an(mk([[0, 0, 'pin', 1], [3, 0, 'roller', 1], [1.5, 2, 'free', 1]], [[0, 1], [0, 2], [1, 2]], [[1, 2.5, 10]]));
  near('a truss with 10 kN on its apex: reaction at A', tr.reactions[0].Ry, 5, 1e-12);
  near('its reaction at B', tr.reactions[1].Ry, 5, 1e-12);
  /* a structure of bars: no rigid member, so no change of length to state; what its end forces leave out of balance at
     the joints is measured like everywhere (review 09, finding C110) */
  near('a structure of bars: no rigid member, no change of length stated', tr.err.u, 0, 1e-30);
  near('a structure of bars: what its end forces leave out of balance is measured and lies below 1e-12 kN', tr.err.F >= 0 && tr.err.F < 1e-12 && tr.err.M === 0 ? 1 : 0, 1);
  near('fixed portal: solved exactly, not in three steps', f.limit === 'exact' ? 1 : 0, 1);
  near('fixed portal: what the arithmetic left is below 1e-10 kN, 1e-10 kNm and 1e-14 m', f.err.F >= 0 && f.err.F < 1e-10 && f.err.M >= 0 && f.err.M < 1e-10 && f.err.u >= 0 && f.err.u < 1e-14 ? 1 : 0, 1);
  near('the reaction that nearly cancels differs from 0.05 kN by less than a hundred times that amount plus 1e-12 of the largest force', Math.abs(f.reactions[0].Rx - 0.05) <= 100 * f.err.F + 1e-12 * f.fmax ? 1 : 0, 1);
  /* the limit in three steps, kept for the case that the exact way fails, gives the same reaction to nine digits here */
  { const mo = mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], [[0, 1], [1, 2, 15], [3, 2]], [[0, 4, 47.9, 0]]); an(mo); const st3 = FS.stepsLimit(mo, EA, FS.bars(mo), 10);
    near('the same portal in three steps: 0.05 kN', st3.reactions[0].Rx, 0.05, 1e-9); near('and it says that it was taken in three steps', st3.limit === 'steps' ? 1 : 0, 1); }
  near('frame decided by statics: a hundred times it covers the difference of the fixing moment', Math.abs(dr.Mz - (350 + 0.01 * c30)) <= 100 * an(det).err.M + 1e-12 * 350 ? 1 : 0, 1);
  const topOf = (q, k) => Math.max(...q.mem.map(M => Math.max(...Array.from(M.smp[k], Math.abs))));
  near('85 000 kN down each column alone: moment and shear lie below a hundred times the stated uncertainty plus 1e-10 of the load (times the width for the moment)', topOf(only, 'M') <= 100 * only.err.M + 1e-10 * 85000 * 8 && topOf(only, 'V') <= 100 * only.err.F + 1e-10 * 85000 ? 1 : 0, 1);
  near('with 0.1 kN across the left column added: its shear of 0.08 kN and its moment of 0.12 kNm stand more than a hundred times above that amount', topOf(big, 'V') > 100 * (100 * big.err.F + 1e-10 * 85000) && topOf(big, 'M') > 100 * (100 * big.err.M + 1e-10 * 85000 * 8) ? 1 : 0, 1);
}
/* A zero of the shear a third of a micrometre behind a load (review 08, finding C78 again): 6 m beam with 492.3 kN/m and
   949.9 kN at 2.27 m. A = 492.3 · 3 + 949.9 · 3.73 / 6; the shear is 949.9 + 1/6000 kN before the load and 1/6000 kN behind it,
   and reaches zero 1/6000/492.3 m further on. The size of the shear beside the zero does not decide whether it counts. */
{
  const s = FS.analyse(mk([[0, 0, 'pin'], [6, 0, 'roller']], [[0, 1, 492.3]], [[0, 2.27, 949.9]]), EI, EA), M = s.mem[0], z = FS.vZeros(M, 2.27, 6), x0 = 2.27 + 1 / 6000 / 492.3;
  near('492.3 kN/m and 949.9 kN at 2.27 m: shear before the load', Vx(s, 0, 2.27, -1), 949.9 + 1 / 6000, 1e-9);
  near('  shear behind the load', Vx(s, 0, 2.27, 1), 1 / 6000, 1e-9);
  near('  one zero of the shear behind the load', z.length, 1, 0);
  near('  at 2.270000339 m', z[0], x0, 1e-10);
  near('  none before the load', FS.vZeros(M, 0, 2.27).length, 0, 0);
  near('  the zero is a station beside the two of the load', Array.from(M.smp.xs).filter(x => Math.abs(x - 2.27) < 1e-6).length, 3, 0);
  near('  the largest moment is the one at the zero', Math.max(...M.smp.M), Mx(s, 0, x0), 1e-9);
  /* a shear that is only the last digits of the arithmetic behind a load is no shear: 10 kN at 2 m of a cantilever with
     a distributed load that the load and the support take up exactly */
  const c = FS.analyse(mk([[0, 0, 'pin'], [4, 0, 'roller']], [[0, 1, 5]], [[0, 2, 20, 90]]), EI, EA);
  near('5 kN/m on 4 m and 20 kN upward at midspan: the shear is zero at both ends and jumps at the load; no zero inside', FS.vZeros(c.mem[0], 0, 2).length + FS.vZeros(c.mem[0], 2, 4).length, 0, 0);
}
/* A zero of a force that lies on a point load (review 08, finding C85). Behind a load that takes all the shear, V is zero;
   the zero of the moment or of the axial force lies on the load as well, a hair beside it in the arithmetic. The load point
   keeps its own place and its two sides: the step of the line stands at the load and is not drawn as a slope. */
{
  const two = (S, a) => { const k = Array.from(S.xs).indexOf(a); return k >= 0 && S.xs[k + 1] === a && S.xs[k + 2] !== a && S.side[k] === -1 && S.side[k + 1] === 1 ? k : -1; };
  /* cantilever of 3 m, 10 kN at 2.00 m: V = 10 before the load, 0 behind it */
  const c = FS.analyse(mk([[0, 0, 'fixed'], [3, 0]], [[0, 1]], [[0, 2, 10]]), EI, EA), S = c.mem[0].smp, k = two(S, 2);
  near('cantilever, 10 kN at 2.00 m: the load point has its two stations at 2.00 m', k >= 0 ? 1 : 0, 1);
  near('  shear kept before the load', Math.abs(S.V[k]), 10, 1e-12);
  near('  shear kept behind the load', S.V[k + 1], 0, 1e-12);
  near('  no station within a nanometre beside the load', Array.from(S.xs).filter(x => x !== 2 && Math.abs(x - 2) < 1e-9).length, 0, 0);
  /* bottom bar of a triangle of three bars, 3 m, held along its axis at its first end (the two other bars carry
     nothing): 480 kN/m to the right and 576 kN to the left at 1.80 m.
     N = 864 − 480 x up to the load, where it is zero; behind the load 576 − 480 (x − 1.8). The bar gets longer by
     u(1.8) = 480 · 1.8² / (2 EA) up to the load */
  const EAb = 598500, b = FS.analyse(mk([[0, 0, 'pin', 1], [3, 0, 'roller', 1], [1.5, 2, 'free', 1]], [[0, 1, 480, 0], [0, 2], [1, 2]], [[0, 1.8, 576, 180]]), EI, EAb), M = b.mem[0], Sb = M.smp, kb = two(Sb, 1.8);
  near('bar, 480 kN/m and 576 kN against it at 1.80 m: the load point has its two stations at 1.80 m', kb >= 0 ? 1 : 0, 1);
  near('  N kept before the load', Sb.N[kb], 0, 1e-9);
  near('  N kept behind the load', Sb.N[kb + 1], 576, 1e-9);
  near('  movement along the bar at the load [m]', Sb.dX[kb], 480 * 1.8 * 1.8 / (2 * EAb), 1e-12);
  near('  the same just behind the load', FS.interp(Sb, 'dX', 1.8 + 1e-6, -1), 480 * 1.8 * 1.8 / (2 * EAb) + 576e-6 / EAb, 1e-12);
  near('  lengthening of the whole bar [m]', Sb.dX[Sb.xs.length - 1], (864 * 1.8 - 240 * 1.8 * 1.8 + 576 * 1.2 - 240 * 1.2 * 1.2) / EAb, 1e-12);
}
/* A load on the end of its member is a load on the joint, also when its place is the length of the member but for the last
   digit: √18 m on a diagonal of 3 m by 3 m is one step of the arithmetic short of its length. */
{
  const d = mk([[0, 0, 'pin'], [3, 3, 'pin']], [[0, 1]], [[0, 4.24, 1000], [0, Math.sqrt(18), 1000]]), s = FS.analyse(d, EI, EA), M = s.mem[0];
  near('√18 and the length of the diagonal differ in their last digit', Math.sqrt(18) < M.L ? 1 : 0, 1);
  near('the load at √18 m stands on the joint', M.ll.pts[1].a, M.L, 0);
  near('shear before the joint: without the joint load', Vx(s, 0, M.L, -1), Vx(s, 0, M.L - 1e-6, -1), 1e-12);
  near('moment at the joint: zero', Mx(s, 0, M.L, -1), 0, 1e-9);
}
/* Changes that make a mechanism stable (review 07, finding C75): what FS.remedies names is tried, the fewest joints first.
   cs marks a joint that can carry a support, ch one that can carry a hinge. */
{
  const flag = (m, cs, ch) => { m.nodes.forEach((n, i) => { n.cs = cs.includes(i); n.ch = ch.includes(i); }); return m; };
  const st = (m, set) => { const c = JSON.parse(JSON.stringify(m)); for (const q of set) { if (q.sup) c.nodes[q.i].sup = q.sup; else c.nodes[q.i].hinge = false; } return FS.stable(c, EI, EA); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;
  /* beam on two rollers: it slides; a pin at either end holds it, a roller made fixed is more than needed */
  const b2 = flag(mk([[0, 0, 'roller'], [6, 0, 'roller']], [[0, 1]]), [0, 1], []);
  near('beam on two rollers: one change, a pin at A or a pin at B', same(FS.remedies(b2, EI, EA), { n: 1, sets: [[{ i: 0, sup: 'pin' }], [{ i: 1, sup: 'pin' }]] }), 1);
  /* two-bay frame on three rollers with a hinge at the head of the first column: it slides, and the first column swings about
     its head. Closing the hinge leaves the sliding, a pin at the middle support leaves the swinging; A fixed removes both */
  const tb = flag(mk([[0, 0, 'roller'], [0, 4, 'free', 1], [6, 4], [6, 0, 'roller'], [12, 4], [12, 0, 'roller']], [[0, 1], [1, 2], [3, 2], [2, 4], [5, 4]]), [0, 3, 5], [1, 2, 4]);
  const ft = FS.remedies(tb, EI, EA);
  near('two-bay frame on three rollers, hinge at D: one change, A fixed', same(ft, { n: 1, sets: [[{ i: 0, sup: 'fixed' }]] }), 1);
  near('that change makes it stable', st(tb, ft.sets[0]) ? 1 : 0, 1);
  near('the hinge closed alone does not', st(tb, [{ i: 1, close: true }]) ? 1 : 0, 0);
  near('a pin at B alone does not', st(tb, [{ i: 3, sup: 'pin' }]) ? 1 : 0, 0);
  near('the hinge closed and a pin at B together do', st(tb, [{ i: 1, close: true }, { i: 3, sup: 'pin' }]) ? 1 : 0, 1);
  /* three-hinged frame without supports, hinges at both corners and the crown: three joints have to change. With both feet
     fixed the three hinges lie on one line and the crown can still move; with a foot pinned, a corner rigid and the other
     foot fixed nothing moves */
  const th = flag(mk([[0, 0], [0, 4, 'free', 1], [4, 4, 'free', 1], [8, 4, 'free', 1], [8, 0]], [[0, 1], [1, 2], [2, 3], [4, 3]]), [0, 4], [1, 2, 3]);
  const f3 = FS.remedies(th, EI, EA);
  near('three-hinged frame without supports and with three hinges: three changes', same(f3, { n: 3, sets: [[{ i: 0, sup: 'pin' }, { i: 1, close: true }, { i: 4, sup: 'fixed' }]] }), 1);
  near('the three together make it stable', st(th, f3.sets[0]) ? 1 : 0, 1);
  near('both feet fixed alone do not: the three hinges lie on one line', st(th, [{ i: 0, sup: 'fixed' }, { i: 4, sup: 'fixed' }]) ? 1 : 0, 0);
  for (let k = 0; k < 3; k++) near(`the three without change ${k + 1} do not`, st(th, f3.sets[0].filter((q, j) => j !== k)) ? 1 : 0, 0);
  /* a structure whose supports are all fixed and whose hinges are all closed has nothing left to change */
  near('nothing to change: no set is named', same(FS.remedies(flag(mk([[0, 0, 'fixed'], [6, 0, 'fixed']], [[0, 1]]), [0, 1], []), EI, EA), { n: 4, kind: '', set: [] }), 1);
}
/* The free movements of a mechanism told apart (review 08, finding C75): FS.movements names the whole structure first
   (slides sideways, moves up and down, turns), then parts with the joints that move and the members that turn about an end.
   No movement stretches a member: the two ends of every member move the same amount along it. */
{
  const said = q => q && q.map(c => [c.kind, c.about === undefined ? '' : c.about, c.joints.map(j => `${j.i}:${Math.sign(j.dx)},${Math.sign(j.dy)}`).join(' '), c.turns.map(t => `${t.mi}@${t.about}`).join(' ')].join('|'));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;
  const rigid = (m, mv) => Math.max(0, ...mv.flatMap(c => m.members.map(q => { const a = m.nodes[q.n1], b = m.nodes[q.n2], L = Math.hypot(b.x - a.x, b.y - a.y); return Math.abs(((c.t[2 * q.n2] - c.t[2 * q.n1]) * (b.x - a.x) + (c.t[2 * q.n2 + 1] - c.t[2 * q.n1 + 1]) * (b.y - a.y)) / L); })));
  const tb = mk([[0, 0, 'roller'], [0, 4, 'free', 1], [6, 4], [6, 0, 'roller'], [12, 4], [12, 0, 'roller']], [[0, 1], [1, 2], [3, 2], [2, 4], [5, 4]]);
  const mt = FS.movements(tb, EI, EA);
  near('two-bay frame on three rollers, hinge at D: the frame slides, and A moves sideways with A-D turning about D',
    same(said(mt), ['slide||0:1,0 1:1,0 2:1,0 3:1,0 4:1,0 5:1,0|', 'part||0:1,0|0@1']), 1);
  near('neither movement stretches a member', rigid(tb, mt), 0, 1e-9);
  near('beam on two rollers: it slides', same(said(FS.movements(mk([[0, 0, 'roller'], [6, 0, 'roller']], [[0, 1]]), EI, EA)), ['slide||0:1,0 1:1,0|']), 1);
  const b1 = mk([[0, 0], [6, 0, 'roller']], [[0, 1]]), m1 = FS.movements(b1, EI, EA);
  near('beam on one roller at B: it slides and turns about B', same(said(m1), ['slide||0:1,0 1:1,0|', 'turn|1|0:0,-1|']), 1);
  near('the turn about B moves A by the distance to B and B not at all', Math.abs(m1[1].t[1]) === 1 && m1[1].t[2] === 0 && m1[1].t[3] === 0 ? 1 : 0, 1);
  const b0 = mk([[0, 0], [6, 0]], [[0, 1]]), m0 = FS.movements(b0, EI, EA);
  near('beam without supports: it slides, moves up and down and turns, no centre named', same(said(m0).map(t => t.split('|').slice(0, 2).join('|')), ['slide|', 'lift|', 'turn|-1']), 1);
  near('none of the three stretches the beam', rigid(b0, m0), 0, 1e-9);
  near('cantilever on a pin instead of the fixed support: it turns about A', same(said(FS.movements(mk([[0, 0, 'pin'], [3, 0]], [[0, 1]]), EI, EA)), ['turn|0|1:0,1|']), 1);
  /* three-hinged frame, both feet on rollers: it slides, and the feet spread while the crown goes down */
  const th = mk([[0, 0, 'roller'], [0, 4], [4, 6, 'free', 1], [8, 4], [8, 0, 'roller']], [[0, 1], [1, 2], [2, 3], [4, 3]]), m3 = FS.movements(th, EI, EA);
  near('three-hinged frame on two rollers: two movements, the first the slide', same([m3.length, m3[0].kind, m3[1].kind], [2, 'slide', 'part']), 1);
  near('neither stretches a member', rigid(th, m3), 0, 1e-9);
  near('the two are independent: the part moves the feet by different amounts', Math.abs(m3[1].t[0] - m3[1].t[8]) > 1e-6 ? 1 : 0, 1);
  near('a stable structure has no free movement', same(FS.movements(mk([[0, 0, 'pin'], [6, 0, 'roller']], [[0, 1]]), EI, EA), []), 1);
}
/* Other lengths and profiles (version 13): the fixed portal at the far corner of what the menus allow, columns of 0.50 m
   of HEB 300 under a beam of 30 m of IPE 200 with 15 kN/m. Closed formulas of the portal with fixed bases under a
   uniform load on the beam, with k = (EI_b / EI_c) (h / L):  H = q L^2 / (4 h (k + 2)),  M_base = q L^2 / (12 (k + 2)),
   M_corner = -q L^2 / (6 (k + 2)),  M_mid = q L^2 / 8 + M_corner.  The members are rigid along their axis: the exact
   limit meets the formulas; the limit in three steps of the versions before, which stiffens EA by 10, 100 and 1000,
   does not, since ten times the EA of the long beam is small beside the bending stiffness of the short columns. */
{
  const Ib = 1943, Ab = 28.5, Ic = 25160, Ac = 149.1, I0 = 8356, A0 = 53.8, h = 0.5, L = 30, q = 15;   // cm4, cm2: IPE 200, HEB 300, and IPE 300 as the section of the structure
  const build = () => { const mo = mk([[0, 0, 'fixed'], [0, h], [L, h], [L, 0, 'fixed']], [[0, 1], [1, 2, q], [3, 2]]);
    mo.members.forEach((m, i) => { m.kf = (i === 1 ? Ib : Ic) / I0; m.ka = (i === 1 ? Ab : Ac) / A0; }); return mo; };
  const k = Ib / Ic * h / L, H = q * L * L / (4 * h * (k + 2)), Mb = q * L * L / (12 * (k + 2)), Mc = -q * L * L / (6 * (k + 2));
  const mo = build(), s = FS.analyse(mo, EI, EA);
  near('far corner portal: solved exactly', s.limit === 'exact' ? 1 : 0, 1);
  near('far corner portal: H at A', s.reactions[0].Rx, H, 1e-9);
  near('far corner portal: H at B', s.reactions[3].Rx, -H, 1e-9);
  near('far corner portal: vertical reaction', s.reactions[0].Ry, q * L / 2, 1e-9);
  near('far corner portal: moment at the base', Math.abs(s.reactions[0].Mz), Mb, 1e-9);
  near('far corner portal: moment at the corner', Mx(s, 1, 0, 1), Mc, 1e-9);
  near('far corner portal: moment at midspan', Mx(s, 1, L / 2), q * L * L / 8 + Mc, 1e-9);
  near('far corner portal: axial force of the beam', Nx(s, 1, L / 2), -H, 1e-9);
  near('far corner portal: the beam keeps its length', Math.abs(s.u[3] - s.u[6]) < 1e-12 ? 1 : 0, 1);
  const m3 = build(); FS.analyse(m3, EI, EA); const s3 = FS.stepsLimit(m3, EA, FS.bars(m3), 10);
  near('far corner portal: the three steps miss H by more than a thousandth', Math.abs(s3.reactions[0].Rx - H) > 1e-3 * H ? 1 : 0, 1);
  /* a beam of two spans of 5.00 and 8.00 m with profiles of their own (IPE 300 and HEB 200), uniform load on both: the
     three-moment equation for unequal EI,  M_B (l1/EI1 + l2/EI2) = -q/8 (l1^3/EI1 + l2^3/EI2) */
  const l1 = 5, l2 = 8, kf2 = 5696 / I0, q2 = 12, tw = mk([[0, 0, 'pin'], [l1, 0, 'roller'], [l1 + l2, 0, 'roller']], [[0, 1, q2], [1, 2, q2]]);
  tw.members[1].kf = kf2; tw.members[1].ka = 78.1 / A0;
  const st = FS.analyse(tw, EI, EA), MB = -q2 / 8 * (l1 ** 3 + l2 ** 3 / kf2) / (l1 + l2 / kf2);
  near('two spans with two profiles: M at B by the three-moment equation', Mx(st, 0, l1), MB, 1e-9);
  near('two spans with two profiles: reaction at A', st.reactions[0].Ry, q2 * l1 / 2 + MB / l1, 1e-9);
  near('two spans with two profiles: reaction at C', st.reactions[2].Ry, q2 * l2 / 2 + MB / l2, 1e-9);
  /* the rotation at A of that beam: the simple span under q, less the part of M_B:  theta_A = q l1^3 / (24 EI) + M_B l1 / (6 EI), clockwise positive */
  near('two spans with two profiles: rotation at A', -FS.interp(st.mem[0].smp, 'rot', 0, 1), q2 * l1 ** 3 / (24 * EI) + MB * l1 / (6 * EI), 1e-9);
}

/* What the analysis cannot tell from zero (version 13): nilF, nilM and nilD of a result, each a floor, a hundred times
   the stated amount, and 1e-10 of the largest value of its kind. Portal 30 m by 30 m of IPE 200 with 85 loads of 1000 kN
   down each column: nothing moves by statics. Up to version 13 the joints came out 4e-12 m away from zero: the
   direction of a load down was cos(-90 deg) = 6e-17 by the machine, a push of 1e-11 kN sideways. The four directions of
   the menus are exact now, and the frame does not move at all. */
{
  const I2 = 1943 / 8356, A2 = 28.5 / 53.8, h = 30, L = 30;
  const mo = mk([[0, 0, 'fixed'], [0, h], [L, h], [L, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [...Array.from({ length: 85 }, () => [0, h, 1000]), ...Array.from({ length: 85 }, () => [2, h, 1000])]);
  mo.members.forEach(m => { m.kf = I2; m.ka = A2; });
  const s = FS.analyse(mo, EI, EA), EIm = EI * I2;
  near('long columns: the largest force is the 85 000 kN of a column', s.fmax, 85000, 1e-12);
  near('long columns: nilF', s.nilF, 1e-9 + 100 * s.err.F + 1e-10 * s.fmax, 1e-12);
  near('long columns: nilM', s.nilM, 1e-9 + 100 * s.err.M + 1e-10 * s.fmax * 30, 1e-12);
  near('long columns: nilD', s.nilD, 1e-12 + 100 * s.err.u + 1e-13 * s.fmax * 27000 / (3 * EIm) + 1e-10 * s.max.D, 1e-12);
  near('long columns: nothing moves, the largest displacement lies below nilD', s.max.D <= s.nilD ? 1 : 0, 1);
  near('long columns: with the directions exact the frame does not move by a single digit', s.max.D, 0, 1e-30);
  near('long columns: and it lies more than a thousand times below a twentieth of a millimetre, the smallest that prints', s.max.D < 5e-5 / 1000 ? 1 : 0, 1);
  const top = k => Math.max(...s.mem.map(M => Math.max(...Array.from(M.smp[k], Math.abs))));
  near('long columns: no moment and no shear above what cannot be told from zero', top('M') <= s.nilM && top('V') <= s.nilF ? 1 : 0, 1);
  /* with 0.1 kN across the left column in addition, the frame moves and its values stand far above these amounts */
  const m2 = mk([[0, 0, 'fixed'], [0, h], [L, h], [L, 0, 'fixed']], [[0, 1], [1, 2], [3, 2]], [...Array.from({ length: 85 }, () => [0, h, 1000]), ...Array.from({ length: 85 }, () => [2, h, 1000]), [0, 15, 0.1, 0]]);
  m2.members.forEach(m => { m.kf = I2; m.ka = A2; });
  const s2 = FS.analyse(m2, EI, EA), top2 = k => Math.max(...s2.mem.map(M => Math.max(...Array.from(M.smp[k], Math.abs))));
  near('long columns with 0.1 kN across one: the displacement stands above nilD', s2.max.D > 100 * s2.nilD ? 1 : 0, 1);
  near('long columns with 0.1 kN across one: the moment stands above nilM', top2('M') > 100 * s2.nilM ? 1 : 0, 1);
}

/* Review 09 (version 14). */
{
  const I2 = 1943 / 8356, A2 = 28.5 / 53.8, EI2 = EI * I2;
  const sec2 = mo => { mo.members.forEach(m => { m.kf = I2; m.ka = A2; }); return mo; };
  /* C97: a member is measured by itself. Backspan of 30 m, B fixed, overhang of 1.40 m with 6400 kN at its end,
     IPE 200: the tip moves P L^3 / (3 EI) = 1.434666 m and turns by P L^2 / (2 EI) = 1.537142 rad. That is less than a
     twentieth of the 30 m span, 1.5 m, and more than the overhang is long. Since version 15 the measure is the largest
     rotation of a member (review 10): here that of the tip of the overhang. */
  const ov = sec2(mk([[0, 0, 'pin'], [30, 0, 'fixed'], [31.4, 0]], [[0, 1], [1, 2]], [...Array.from({ length: 6 }, () => [1, 1.4, 1000]), [1, 1.4, 400]]));
  const so = FS.analyse(ov, EI, EA);
  near('C97 overhang: tip displacement', so.max.D, 6400 * 1.4 ** 3 / (3 * EI2), 1e-9);
  near('C97 overhang: tip rotation [rad]', Math.abs(FS.interp(so.mem[1].smp, 'rot', 1.4, -1)), 6400 * 1.4 ** 2 / (2 * EI2), 1e-9);
  near('C97 overhang: the tip moves less than a twentieth of the longest member', so.max.D < 30 / 20 ? 1 : 0, 1);
  near('C97 overhang: the largest rotation of the structure is that of the tip of the overhang', so.max.turn, 6400 * 1.4 ** 2 / (2 * EI2), 1e-9);
  near('C97 overhang: the member named is the overhang, and it turns far more than a twentieth of a radian', so.max.turnM === 1 && so.max.turn > 20 * FS.TURN ? 1 : 0, 1);
  /* a sway portal with pinned feet: the largest rotation is that of a column at its foot, more than the sway over the
     height (the column leans and bends); the members of a frame are rigid along their axes and are not stretched */
  const sw = FS.analyse(mk([[0, 0, 'pin'], [0, 4], [6, 4], [6, 0, 'pin']], [[0, 1], [1, 2], [3, 2]], [[0, 4, 20, 0]]), EI, EA);
  near('sway portal: a column turns most at its pinned foot, by more than the sway over its height', FS.turnOf(sw.mem[0]) > Math.abs(sw.u[3]) / 4 && FS.turnOf(sw.mem[0]) === Math.abs(sw.mem[0].smp.rot[0]) ? 1 : 0, 1);
  near('sway portal: no member of the frame is strained along its axis', Math.max(...sw.mem.map(M => FS.strainOf(M).e)) < 1e-12 ? 1 : 0, 1);

  /* C102: a force along the beam does not hide a deflection. Overhang of 0.50 m left of the fixed support B, span of 30 m
     right of it, IPE 200; 2 kN down at A: w = P L^3 / (3 EI) = 0.020423 mm, rotation P L^2 / (2 EI) = 0.061270 mrad.
     With 95 loads of 1000 kN along the beam at the far end both stay, and the amount that cannot be told from zero
     stays a thousand times below the deflection. */
  const c102 = n => sec2(mk([[0, 0], [0.5, 0, 'fixed'], [30.5, 0]], [[0, 1], [1, 2]], [[0, 0, 2], ...Array.from({ length: n }, () => [1, 30, 1000, 0])]));
  for (const n of [0, 95]) {
    const q = FS.analyse(c102(n), EI, EA);
    near(`C102 with ${n} loads along the beam: deflection at A [mm]`, -FS.interp(q.mem[0].smp, 'dY', 0, 1) * 1000, 2 * 0.5 ** 3 / (3 * EI2) * 1000, 1e-9);
    near(`C102 with ${n} loads along the beam: rotation at A [mrad]`, FS.interp(q.mem[0].smp, 'rot', 0, 1) * 1000, 2 * 0.5 ** 2 / (2 * EI2) * 1000, 1e-9);
    near(`C102 with ${n} loads along the beam: the deflection stands more than 500 times above nilD`, q.max.D > 500 * q.nilD ? 1 : 0, 1);
  }

  /* C110: what a structure of bars leaves out of balance is measured. Four panels of 30 m, 0.51 m high, IPE 200 and
     HEB 300 in turn, 999.9 kN down at midspan: the bar forces are some 59 000 kN, and their sum at a free joint misses
     zero by about a millionth of a kN. The analysis states that amount; it is not zero. */
  const nd = [], mb = [];
  for (let i = 0; i <= 4; i++) nd.push([30 * i, 0, i === 0 ? 'pin' : i === 4 ? 'roller' : 'free', 1]);
  for (let i = 0; i <= 4; i++) nd.push([30 * i, 0.51, 'free', 1]);
  for (let i = 0; i < 4; i++) mb.push([i, i + 1], [5 + i, 6 + i]);
  for (let i = 0; i <= 4; i++) mb.push([i, 5 + i]);
  for (let i = 0; i < 4; i++) mb.push(i < 2 ? [5 + i, i + 1] : [i, 6 + i]);
  const tr = mk(nd, mb, [[2, 30, 999.9]]);   /* on the joint in the middle of the bottom chord */
  tr.members.forEach((m, i) => { m.kf = (i % 2 ? 25160 : 1943) / 8356; m.ka = (i % 2 ? 149.1 : 28.5) / 53.8; });
  const st = FS.analyse(tr, EI, EA);
  if (st.ok) {
    const out = new Float64Array(3 * nd.length);
    for (const M of st.mem) for (let i = 0; i < 6; i++) { let fg = 0; for (let p = 0; p < 6; p++) fg += M.T[p][i] * M.f[p]; out[M.dofs[i]] += fg; }
    let big = 0; nd.forEach((n, i) => { if (n[2] === 'free') big = Math.max(big, Math.abs(out[3 * i]), Math.abs(out[3 * i + 1])); else if (n[2] === 'roller') big = Math.max(big, Math.abs(out[3 * i])); });
    near('C110 flat truss: every member a bar', st.bar.every(Boolean) ? 1 : 0, 1);
    near('C110 flat truss: the largest bar force is some 59 000 kN', st.fmax > 5e4 && st.fmax < 7e4 ? 1 : 0, 1);
    near('C110 flat truss: the stated amount is the largest sum of end forces at a free joint, worked out again here', st.err.F, big, 1e-9);
    near('C110 flat truss: it is measured, not zero, and far below a thousandth of a kN', st.err.F > 0 && st.err.F < 1e-3 ? 1 : 0, 1);
    near('C110 flat truss: reactions 499.95 kN each', st.reactions[0].Ry, 499.95, 1e-9);
  } else { fail++; console.log('FAIL C110 flat truss: not solved'); }
  /* C106: two states of the comparison with the second solver, each against a closed result.
     Seed 22, state 1138: a portal on one fixed support, 15 kN/m on the roof of 8 m, 2.5 kN/m upward along the right
     column of 4 m, and 12.5 kN at 30 degrees, 1 cm above the foot of that column. One support: its three reactions
     follow from the three sums of statics alone. */
  {
    const c30 = Math.cos(Math.PI / 6), po = mk([[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0]], [[0, 1], [1, 2, 15], [2, 3, 2.5, 90]], [[2, 3.99, 12.5, 30]]);
    const sp = FS.analyse(po, EI, EA), r = sp.reactions[0];
    near('C106 portal on one support: Rx = -12.5 cos 30', r.Rx, -12.5 * c30, 1e-13);
    near('C106 portal on one support: Ry = 120 - 10 - 6.25', r.Ry, 103.75, 1e-13);
    near('C106 portal on one support: M = 480 - 80 - 50 + 0.01 x 12.5 cos 30', r.Mz, 480 - 80 - 50 + 0.01 * 12.5 * c30, 1e-13);
  }
  /* Seed 26, state 2131: a beam of 18 m, roller at A, fixed at B, one section along it; 20 kN at 6 m and at 12 m,
     and 12.5 kN upward at 12.01 m. Force method: a load P at the distance b from the fixed end moves the free end of
     the cantilever by P b^2 (3L - b) / (6 EI), and a force of 1 at that end moves it by L^3 / (3 EI); so
     R_A = sum of P b^2 (3L - b) / (2 L^3) = 11.487264659 kN, whatever EI is. M_B follows from the moments about B. */
  {
    const L = 18, lds = [[6, 20], [12, 20], [12.01, -12.5]];
    const RA = lds.reduce((t, [a, P]) => t + P * (L - a) ** 2 * (3 * L - (L - a)) / (2 * L ** 3), 0), MB = RA * L - lds.reduce((t, [a, P]) => t + P * (L - a), 0);
    for (const [kf, ka, nm] of [[1, 1, 'IPE 300'], [5696 / 8356 * 4.417134831460674, 1.9090909090909092, 'the stiffness of the state']]) {
      const pb = mk([[0, 0, 'roller'], [L, 0, 'fixed']], [[0, 1]], lds.map(([a, P]) => [0, a, Math.abs(P), P > 0 ? -90 : 90]));
      pb.members[0].kf = kf; pb.members[0].ka = ka;
      const s2 = FS.analyse(pb, EI, EA);
      near(`C106 propped beam of 18 m (${nm}): R_A by the force method`, s2.reactions[0].Ry, RA, 1e-12);
      near(`C106 propped beam of 18 m (${nm}): R_B`, s2.reactions[1].Ry, 27.5 - RA, 1e-12);
      near(`C106 propped beam of 18 m (${nm}): fixing moment at B`, Math.abs(s2.reactions[1].Mz), Math.abs(MB), 1e-12);
    }
    near('C106 propped beam of 18 m: R_A = 11.487264659 kN', RA, 11.487264659, 1e-9);
  }
}

/* Review 10 (version 15): when the page says "large displacement". Two measures of a member, each read on the member
   itself: its largest rotation (turnOf, above 50 mrad) and its largest strain along its axis, |N| / EA (strainOf, above
   a twentieth). Up to version 15 the second measure was the stretch of the whole member as a share of its length;
   review 11 (C122) showed a stretch of 10 cm strained by 10 % in a member of 3 m, which that measure took for 0.33 %. */
{
  const I2 = 1943 / 8356, A2 = 28.5 / 53.8, EI2 = EI * I2, EA2 = EA * A2;
  const sec2 = mo => { mo.members.forEach(m => { m.kf = I2; m.ka = A2; }); return mo; };
  near('the two limits: a twentieth of a radian and a strain of a twentieth', FS.TURN === 0.05 && FS.STRAIN === 0.05 ? 1 : 0, 1);
  /* C97, the case of review 10: cantilever of 30 m, IPE 200, 500 kN down at 26 m, 1000 kN up at 28 m, 500 kN down at
     30 m. The moment is a triangle between 26 m and 30 m with 1000 kNm at 28 m: the tip turns by its area over EI,
     2000 / EI = 0.490160 rad, and moves by that times 2 m, 0.980320 m: less than a twentieth of the 30 m. */
  const c97 = FS.analyse(sec2(mk([[0, 0, 'fixed'], [30, 0]], [[0, 1]], [[0, 26, 500], [0, 28, 500, 90], [0, 28, 500, 90], [0, 30, 500]])), EI, EA);
  near('C97 cantilever with three loads at its end: moment at 28 m', Mx(c97, 0, 28), -1000, 1e-9);
  near('C97 cantilever: no moment at 26 m and before it', Math.abs(Mx(c97, 0, 26)) + Math.abs(Mx(c97, 0, 13)), 0, 1e-9);
  near('C97 cantilever: the tip turns by 2000 / EI = 0.490160 rad', c97.max.turn, 2000 / EI2, 1e-9);
  near('C97 cantilever: the tip moves by 4000 / EI = 0.980320 m', c97.max.D, 4000 / EI2, 1e-9);
  near('C97 cantilever: that is less than a twentieth of the length, and the rotation is ten times a twentieth of a radian', c97.max.D < 30 / 20 && c97.max.turn > 9.8 * FS.TURN && c97.max.turnM === 0 ? 1 : 0, 1);
  /* the limit of the rotation on closed results. Simple beam of 6 m, IPE 200, load at midspan: the ends turn by
     P L^2 / (16 EI), 50 mrad at P = 90.673 kN. Cantilever of 1.40 m: the tip turns by P L^2 / (2 EI), 50 mrad at 208.18 kN */
  for (const [P, over] of [[90.6, 0], [90.7, 1]]) {
    const q = FS.analyse(sec2(mk([[0, 0, 'pin'], [6, 0, 'roller']], [[0, 1]], [[0, 3, P]])), EI, EA);
    near(`simple beam of 6 m with ${P} kN at midspan: the ends turn by P L^2 / (16 EI)`, q.max.turn, P * 36 / (16 * EI2), 1e-9);
    near(`simple beam with ${P} kN: ${over ? 'above' : 'below'} 50 mrad`, q.max.turn > FS.TURN ? 1 : 0, over);
  }
  for (const [P, over] of [[208, 0], [209, 1]]) {
    const q = FS.analyse(sec2(mk([[0, 0, 'fixed'], [1.4, 0]], [[0, 1]], [[0, 1.4, P]])), EI, EA);
    near(`cantilever of 1.40 m with ${P} kN at its end: the tip turns by P L^2 / (2 EI)`, q.max.turn, P * 1.96 / (2 * EI2), 1e-9);
    near(`cantilever with ${P} kN: ${over ? 'above' : 'below'} 50 mrad`, q.max.turn > FS.TURN ? 1 : 0, over);
  }
  /* the largest rotation of a member is found at a station: the rotation runs one way between two stations, because the
     zeros of the moment are stations. Read again at 6000 places along every member of three states */
  for (const [nm, mo] of [['two spans with loads both ways', mk([[0, 0, 'pin'], [5, 0, 'roller'], [11, 0, 'roller']], [[0, 1, 12], [1, 2, [0, 30]]], [[0, 1.7, 40], [1, 2.2, 25, 90], [1, 4.4, 60]])],
    ['portal with a side load', mk([[0, 0, 'fixed'], [0, 4], [6, 4], [6, 0, 'pin']], [[0, 1, 8, 0], [1, 2, 15], [3, 2]], [[1, 2.5, 30], [0, 2, 20, 0]])],
    ['cantilever of C97', sec2(mk([[0, 0, 'fixed'], [30, 0]], [[0, 1]], [[0, 26, 500], [0, 28, 1000, 90], [0, 30, 500]]))]]) {
    const q = FS.analyse(mo, EI, EA);
    let worst = 0;
    for (const M of q.mem) { let fine = 0; for (let i = 0; i <= 6000; i++) fine = Math.max(fine, Math.abs(M.smp.fine(M.L * i / 6000).rot)); worst = Math.max(worst, (fine - FS.turnOf(M)) / (FS.turnOf(M) || 1)); }
    near(`${nm}: no place between two stations turns more than the largest station`, worst <= 1e-12 ? 1 : 0, 1);
  }
  /* C115, the case of review 10: the arm of 3 m of a bent cantilever, IPE 200, hinge at the corner B, roller at the tip
     C, 30 000 kN outward at each end of the arm. The arm is a bar: it is strained by N / EA = 5.0125 % over its whole
     length, 0.150376 m in all. Nothing turns and nothing bends. */
  const c115 = FS.analyse(sec2(mk([[0, 0, 'fixed'], [0, 4, 'free', 1], [3, 4, 'roller']], [[0, 1], [1, 2]], [...Array.from({ length: 30 }, () => [1, 0, 1000, 180]), ...Array.from({ length: 30 }, () => [1, 3, 1000, 0])])), EI, EA);
  near('C115 arm pulled at both ends: it is a bar', c115.bar[1] ? 1 : 0, 1);
  near('C115 arm: N = 30 000 kN', Nx(c115, 1, 1.5), 30000, 1e-9);
  near('C115 arm: strained by N / EA', c115.max.strain, 30000 / EA2, 1e-9);
  near('C115 arm: the strain is 0.050125, above a twentieth, over the whole arm, a stretch, and it is the arm', c115.max.strain > FS.STRAIN && Math.abs(c115.max.strain - 0.050125) < 5e-7 && c115.max.strainM === 1 && c115.max.strainSign === 1 && c115.max.strainAt[0] === 0 && Math.abs(c115.max.strainAt[1] - 3) < 1e-12 ? 1 : 0, 1);
  near('C115 arm: it is longer by N L / EA = 0.150376 m', c115.mem[1].smp.dX[c115.mem[1].smp.xs.length - 1] - c115.mem[1].smp.dX[0], 30000 * 3 / EA2, 1e-9);
  near('C115 arm: nothing turns', c115.max.turn < 1e-9 ? 1 : 0, 1);
  near('C115 arm: no moment and no shear anywhere', c115.max.M + c115.max.V < 1e-6 ? 1 : 0, 1);
  /* with 29 loads at each end the share is N / EA = 0.048454: below a twentieth */
  const c115b = FS.analyse(sec2(mk([[0, 0, 'fixed'], [0, 4, 'free', 1], [3, 4, 'roller']], [[0, 1], [1, 2]], [...Array.from({ length: 29 }, () => [1, 0, 1000, 180]), ...Array.from({ length: 29 }, () => [1, 3, 1000, 0])])), EI, EA);
  near('C115 arm with 29 000 kN: the strain is N / EA', c115b.max.strain, 29000 / EA2, 1e-9);
  near('C115 arm with 29 000 kN: below a twentieth', c115b.max.strain < FS.STRAIN ? 1 : 0, 1);
  /* C122, the case of review 11: the same arm with sixty loads of 1000 kN to the left at 1.00 m and sixty to the right
     at 1.10 m. Between them N = 60 000 kN: a strain of 60 000 / 598 500 = 10.025 % over 10 cm. The arm gets longer by
     10.025 mm, 0.334 % of its length: the measure of version 15, which stayed below its limit */
  const c122 = FS.analyse(sec2(mk([[0, 0, 'fixed'], [0, 4, 'free', 1], [3, 4, 'roller']], [[0, 1], [1, 2]], [...Array.from({ length: 60 }, () => [1, 1, 1000, 180]), ...Array.from({ length: 60 }, () => [1, 1.1, 1000, 0])])), EI, EA);
  near('C122 arm: N = 60 000 kN between the loads', Nx(c122, 1, 1.05), 60000, 1e-9);
  near('C122 arm: no axial force before and behind them', Math.abs(Nx(c122, 1, 0.5)) + Math.abs(Nx(c122, 1, 2)) < 1e-6 ? 1 : 0, 1);
  near('C122 arm: the largest strain is N / EA = 0.100251', c122.max.strain, 60000 / EA2, 1e-9);
  near('C122 arm: above a twentieth, a stretch, in the arm, between 1.00 and 1.10 m', c122.max.strain > FS.STRAIN && c122.max.strainM === 1 && c122.max.strainSign === 1 && Math.abs(c122.max.strainAt[0] - 1) < 1e-12 && Math.abs(c122.max.strainAt[1] - 1.1) < 1e-12 ? 1 : 0, 1);
  near('C122 arm: it gets longer by 10.025 mm, 0.334 % of its length, where version 15 measured', (c122.mem[1].smp.dX[c122.mem[1].smp.xs.length - 1] - c122.mem[1].smp.dX[0]) / 3, 60000 * 0.1 / EA2 / 3, 1e-9);
  near('C122 arm: nothing turns', c122.max.turn < 1e-9 ? 1 : 0, 1);
  /* the loads the other way: the stretch between them is shortened by the same strain */
  const c122b = FS.analyse(sec2(mk([[0, 0, 'fixed'], [0, 4, 'free', 1], [3, 4, 'roller']], [[0, 1], [1, 2]], [...Array.from({ length: 60 }, () => [1, 1, 1000, 0]), ...Array.from({ length: 60 }, () => [1, 1.1, 1000, 180])])), EI, EA);
  near('C122 arm pushed together: shortened by the same strain between 1.00 and 1.10 m', Math.abs(c122b.max.strain - 60000 / EA2) < 1e-9 && c122b.max.strainSign === -1 && Math.abs(c122b.max.strainAt[0] - 1) < 1e-12 && Math.abs(c122b.max.strainAt[1] - 1.1) < 1e-12 ? 1 : 0, 1);
  /* the largest strain of a member is that of its stations: a scan of the axial force at 6000 places finds no larger one */
  for (const [nm, R] of [['C115 arm', c115], ['C122 arm', c122]]) {
    let worst = 0;
    for (const M of R.mem) { if (!isFinite(M.EA)) continue; const top = FS.strainOf(M).e; for (let i = 0; i <= 6000; i++) for (const sd of [-1, 1]) worst = Math.max(worst, Math.abs(FS.forcesAt(M, M.L * i / 6000, sd).N) / M.EA - top); }
    near(`${nm}: no place of 6000 along a bar is strained more than its largest station`, worst <= 1e-12 ? 1 : 0, 1);
  }
  /* a bar held at both ends with a load along it at its middle (two bars on three pins; a straight beam has no bars):
     its length stays, one half is stretched and the other shortened, each by P / (2 EA) */
  const held = FS.analyse(sec2(mk([[0, 0, 'pin', 1], [4, 0, 'pin', 1], [4, 3, 'pin', 1]], [[0, 1], [1, 2]], [[0, 2, 100000, 0]])), EI, EA);
  near('bar held at both ends: it is a bar', held.bar[0] ? 1 : 0, 1);
  near('bar held at both ends, 100 000 kN along it at its middle: N = +P/2 before the load', Nx(held, 0, 1), 50000, 1e-9);
  near('bar held at both ends: N = -P/2 behind the load', Nx(held, 0, 3), -50000, 1e-9);
  near('bar held at both ends: each half is strained by P / (2 EA)', held.max.strain, 100000 / (2 * EA2), 1e-9);
  near('bar held at both ends: its middle moves by P L / (4 EA)', Math.abs(FS.interp(held.mem[0].smp, 'dX', 2, -1)), 100000 * 4 / (4 * EA2), 1e-9);
  near('bar held at both ends: its two ends stay where they are', Math.hypot(held.mem[0].smp.dX[0], held.mem[0].smp.dX[held.mem[0].smp.xs.length - 1]) < 1e-12 ? 1 : 0, 1);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
