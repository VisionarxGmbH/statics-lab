/* Sections (steel, E = 210 000 N/mm2): nominal dimensions in mm (depth h, width b, web tw, flange tf, root radius r),
   I about the strong axis in cm4 and A in cm2 as printed in the ArcelorMittal sales programme for sections and
   merchant bars (edition with the copyright year 2023); HEB 200 and HEB 300 stand there as HE 200 B and HE 300 B.
   test/sections.test.js works both values out from the dimensions. */
const SECTIONS = [
  { name: 'IPE 200', I: 1943, A: 28.5, dim: [200, 100, 5.6, 8.5, 12] },
  { name: 'IPE 240', I: 3891, A: 39.1, dim: [240, 120, 6.2, 9.8, 15] },
  { name: 'IPE 300', I: 8356, A: 53.8, dim: [300, 150, 7.1, 10.7, 15] },
  { name: 'IPE 360', I: 16260, A: 72.7, dim: [360, 170, 8.0, 12.7, 18] },
  { name: 'IPE 400', I: 23120, A: 84.5, dim: [400, 180, 8.6, 13.5, 21] },
  { name: 'HEB 200', I: 5696, A: 78.1, dim: [200, 200, 9, 15, 18] },
  { name: 'HEB 300', I: 25160, A: 149.1, dim: [300, 300, 11, 19, 27] },
];
const sectionEI = s => 2.1 * s.I;     /* kNm2 */
const sectionEA = s => 21000 * s.A;   /* kN */
/* What the window of the section shows beside I and A. Both follow from the values above and from the dimensions:
   the elastic section modulus W = I / (h / 2), with I worked out from the dimensions (the table cuts I to four digits;
   W is printed with four digits as well), and the mass per metre G = A x 7850 kg/m3. */
function sectionMore(s) {
  const [h, b, tw, tf, r] = s.dim, d = h - 2 * tf;
  const af = 1 - Math.PI / 4, cf = (5 / 6 - Math.PI / 4) / af, jf = (1 - 5 * Math.PI / 16) - af * cf * cf;   /* one root fillet of radius 1: area, centroid from the corner, own second moment */
  const I = ((b * h ** 3 - (b - tw) * d ** 3) / 12 + 4 * (jf * r ** 4 + af * r * r * (d / 2 - cf * r) ** 2)) / 1e4;   /* cm4 */
  return { W: I / (h / 20), G: s.A * 0.785 };   /* cm3, kg/m */
}
/* A member with a profile of its own (sec: its place in SECTIONS; null: the section of the structure) carries two
   factors on the stiffness of the section of the structure: kf on EI and ka on EA. They are set before every analysis. */
function applySections(m, si) {
  const s = SECTIONS[si];
  for (const mb of m.members) { const o = mb.sec === null || mb.sec === undefined ? null : SECTIONS[mb.sec]; mb.kf = o ? o.I / s.I : 1; mb.ka = o ? o.A / s.A : 1; }
  return m;
}

/* nodes [x, y, support, hinge]   members [n1, n2, {w, ang}]   loads [member, a, P, angle]
   w: a number is a uniform load, [w1, w2] a load that runs in a straight line from w1 at n1 to w2 at n2 */
const PRESETS = [
  { id: 'simple-p', group: 'Beams', name: 'Simple beam', sub: 'point load', focus: 'M',
    nodes: [[0, 0, 'pin'], [6, 0, 'roller']], members: [[0, 1]], loads: [[0, 2, 20]],
    tips: ['Drag the load along the beam', 'Click support B and make it fixed'] },
  { id: 'simple-w', group: 'Beams', name: 'Simple beam', sub: 'uniform load', focus: 'M',
    nodes: [[0, 0, 'pin'], [6, 0, 'roller']], members: [[0, 1, { w: 10 }]],
    tips: ['Drag the top of the load to change its size', 'Click the beam to add a point load'] },
  { id: 'simple-2p', group: 'Beams', name: 'Simple beam', sub: 'two point loads', focus: 'M',
    nodes: [[0, 0, 'pin'], [6, 0, 'roller']], members: [[0, 1]], loads: [[0, 2, 20], [0, 4, 20]],
    tips: ['Drag one load toward the middle', 'Click the beam and add a third load'] },
  { id: 'simple-t', group: 'Beams', name: 'Simple beam', sub: 'triangular load', focus: 'M',
    nodes: [[0, 0, 'pin'], [6, 0, 'roller']], members: [[0, 1, { w: [0, 12] }]], wref: 12,
    tips: ['Click the beam and turn the triangle round', 'Type a value at A: the load becomes a trapezoid'] },
  { id: 'cantilever', group: 'Beams', name: 'Cantilever', sub: 'tip load', focus: 'M',
    nodes: [[0, 0, 'fixed'], [3, 0]], members: [[0, 1]], loads: [[0, 3, 10]], pref: 10,
    tips: ['Drag the load toward the wall', 'Click the free end B and add a roller'] },
  { id: 'propped', group: 'Beams', name: 'Propped cantilever', sub: 'uniform load', focus: 'M',
    nodes: [[0, 0, 'fixed'], [6, 0, 'roller']], members: [[0, 1, { w: 10 }]],
    tips: ['Click the prop B and set it free', 'Move the mouse along the beam: for each metre M changes by V'] },
  { id: 'fixed', group: 'Beams', name: 'Fixed beam', sub: 'uniform load', focus: 'M',
    nodes: [[0, 0, 'fixed'], [6, 0, 'fixed']], members: [[0, 1, { w: 10 }]],
    tips: ['Click one end and make it a pin', 'Compare end and midspan moments'] },
  { id: 'overhang', group: 'Beams', name: 'Overhang', sub: 'cantilever end', focus: 'M',
    nodes: [[0, 0, 'pin'], [5, 0, 'roller'], [7, 0]], members: [[0, 1, { w: 8 }], [1, 2]], loads: [[1, 2, 15]], pref: 15, wref: 8,
    tips: ['Drag the point load back over the span', 'With the point load on the overhang: raise it until the reaction at A turns downward'] },
  { id: 'two-span', group: 'Beams', name: 'Two-span beam', sub: 'continuous', focus: 'M',
    nodes: [[0, 0, 'pin'], [5, 0, 'roller'], [10, 0, 'roller']], members: [[0, 1, { w: 10 }], [1, 2, { w: 10 }]],
    tips: ['Click one span and switch its load off', 'Click B and set it free'] },
  { id: 'gerber', group: 'Beams', name: 'Gerber beam', sub: 'with a hinge', focus: 'M',
    nodes: [[0, 0, 'pin'], [6, 0, 'roller'], [7.5, 0, 'free', 1], [10, 0, 'roller']],
    members: [[0, 1, { w: 10 }], [1, 2, { w: 10 }], [2, 3, { w: 10 }]],
    tips: ['Click hinge G and make it rigid', 'Switch off the load on the hung part G–C'] },

  { id: 'bent', group: 'Frames', name: 'Bent cantilever', sub: 'column and arm', focus: 'M',
    nodes: [[0, 0, 'fixed'], [0, 4], [3, 4]], members: [[0, 1], [1, 2]], loads: [[1, 3, 10]], pref: 10,
    tips: ['Drag the tail of the load to turn it', 'Drag the load onto the column'] },
  { id: 'portal-g', group: 'Frames', name: 'Portal frame', sub: 'fixed, gravity', focus: 'M',
    nodes: [[0, 0, 'fixed'], [0, 4], [8, 4], [8, 0, 'fixed']], members: [[0, 1], [1, 2, { w: 15 }], [2, 3]], wref: 15,   /* h / L = 0.5: round numbers by hand */
    tips: ['Make both bases pins and compare the corner moment', 'Click a column and give it the profile HEB 300, then the other: stiffer columns take more moment'] },
  { id: 'portal-s', group: 'Frames', name: 'Portal frame', sub: 'pinned, sway', focus: 'M',
    nodes: [[0, 0, 'pin'], [0, 4], [6, 4], [6, 0, 'pin']], members: [[0, 1], [1, 2], [2, 3]], loads: [[1, 0, 20, 0]],
    tips: ['Fix both bases and compare the sway', 'Click a corner and make it a hinge'] },
  { id: 'three-hinge', group: 'Frames', name: 'Three-hinged frame', sub: 'determinate', focus: 'M',
    nodes: [[0, 0, 'pin'], [0, 4], [4, 4, 'free', 1], [8, 4], [8, 0, 'pin']],
    members: [[0, 1], [1, 2, { w: 10 }], [2, 3, { w: 10 }], [3, 4]],
    tips: ['Click hinge G and make it rigid', 'Switch off the load on one half'] },
  { id: 'two-bay', group: 'Frames', name: 'Two-bay frame', sub: 'three columns', focus: 'M',
    nodes: [[0, 0, 'fixed'], [0, 4], [5, 4], [5, 0, 'pin'], [10, 4], [10, 0, 'fixed']],
    members: [[0, 1], [1, 2, { w: 10 }], [2, 3], [2, 4], [4, 5]], loads: [[3, 2.5, 30]], pref: 30,
    tips: ['Add a side load: click a column', 'Click the middle base and set it free'] },

  { id: 'truss', group: 'Truss', name: 'Truss', sub: 'pin-jointed', focus: 'N', truss: true,
    nodes: [[0, 0, 'pin', 1], [3, 0, 'free', 1], [6, 0, 'free', 1], [9, 0, 'free', 1], [12, 0, 'roller', 1], [3, 3, 'free', 1], [6, 3, 'free', 1], [9, 3, 'free', 1]],
    members: [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7], [0, 5], [4, 7], [5, 2], [7, 2]],
    loads: [[0, 3, 20], [1, 3, 20], [2, 3, 20]],
    cut: { top: 4, diag: 11, bot: 1 },   /* the three bars the method of sections cuts: top chord, diagonal, bottom chord */
    tips: ['Drag a load to another joint', 'Drop a downward load between two joints of a chord: that bar bends'] },
];

function buildModel(p) {
  const nodes = p.nodes.map(([x, y, sup, hinge]) => ({ x, y, sup: sup || 'free', hinge: !!hinge }));
  const deg = nodes.map(() => 0);
  const members = p.members.map(([n1, n2, o = {}]) => {
    deg[n1]++; deg[n2]++;
    const vertical = Math.abs(nodes[n1].x - nodes[n2].x) < 1e-9;
    const pair = Array.isArray(o.w) ? o.w : [o.w || 0, o.w || 0], on = pair[0] > 0 || pair[1] > 0, def = p.wref || 10;
    return { n1, n2, sec: null, kf: 1, ka: 1, rel: [0, 0], udl: { on, w1: on ? pair[0] : def, w2: on ? pair[1] : def, ang: o.ang === undefined ? (vertical ? 0 : -90) : o.ang } };
  });
  let id = 1;
  const loads = (p.loads || []).map(([m, a, P, ang]) => ({ id: id++, m, a, P, ang: ang === undefined ? -90 : ang }));
  /* node roles: supports and free ends cycle through support types; inner joints toggle a hinge */
  const ymin = Math.min(...nodes.map(n => n.y));
  nodes.forEach((n, i) => { n.cs = n.sup !== 'free' || deg[i] === 1; n.ch = !n.cs && deg[i] >= 2 && !p.truss; });
  const order = nodes.map((n, i) => i).sort((a, b) =>
    (nodes[a].y > ymin + 1e-9) - (nodes[b].y > ymin + 1e-9) || nodes[a].x - nodes[b].x || nodes[a].y - nodes[b].y);
  const letters = 'ABCDEFHJKLMNPQRSTUVW';
  let k = 0, g = 0;
  const nh = nodes.filter(n => n.hinge && n.sup === 'free').length;
  for (const i of order) {
    const n = nodes[i];
    if (p.truss) n.lbl = n.sup !== 'free' ? letters[k++] : '';
    else if (n.hinge && n.sup === 'free') n.lbl = nh > 1 ? 'G' + (++g) : 'G';
    else n.lbl = letters[k++];
  }
  return { nodes, members, loads, nid: id, pref: p.pref || 20, wref: p.wref || 10, truss: !!p.truss, cut: p.cut || null };
}

/* ---------- lengths ---------- */
/* The joints stand on a grid: their places along x and along y, kept in centimetres (rounded half away from zero, with
   the same allowance for the binary arithmetic as every typed value of the page). */
const cm = v => { const t = Math.abs(v) * 100, r = Math.floor(t + 0.5 + Math.max(1e-9, 4e-13 * t)) / 100; return v < 0 ? -r : r; };
const gridOf = (m, ax) => [...new Set(m.nodes.map(n => cm(n[ax])))].sort((a, b) => a - b);
const memLen = (m, i) => { const k = m.members[i], a = m.nodes[k.n1], b = m.nodes[k.n2]; return Math.hypot(b.x - a.x, b.y - a.y); };
/* the axis along which the length of a member is typed: none for an inclined member, whose length follows from two steps
   of the grid, and none for a member that spans more than one step */
function lenAxisOf(m, mi) {
  const k = m.members[mi], a = m.nodes[k.n1], b = m.nodes[k.n2], ax = Math.abs(a.y - b.y) < 1e-9 ? 'x' : Math.abs(a.x - b.x) < 1e-9 ? 'y' : null;
  if (!ax) return null;
  const lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]);
  return m.nodes.some(n => n[ax] > lo + 1e-9 && n[ax] < hi - 1e-9) ? null : ax;
}
/* One step of the grid, from v0 to v1, gets the length len: every joint at v1 or beyond moves along by the difference.
   A member whose length changes keeps its point loads at their share of the length: a load on a joint stays on that
   joint, a load inside stays inside, and its place is kept in centimetres like a typed one. */
function stretch(m, ax, v0, v1, len) {
  const L0 = m.members.map((k, i) => memLen(m, i)), d = len - (v1 - v0);
  for (const n of m.nodes) if (n[ax] > v1 - 1e-9) n[ax] = cm(n[ax] + d);
  m.members.forEach((k, i) => {
    /* a member that only moved along can come out a last digit longer or shorter: a load on its end joint is set on
       the length as it now stands, a load inside keeps its place */
    const L1 = memLen(m, i), same = Math.abs(L1 - L0[i]) < 1e-9;
    for (const ld of m.loads) if (ld.m === i) ld.a = ld.a <= 1e-9 ? 0 : ld.a >= L0[i] - 1e-9 ? L1 : same ? ld.a : Math.min(Math.max(cm(ld.a * L1 / L0[i]), 0.01), Math.floor((L1 - 0.01) * 100 + 1e-9) / 100);
  });
  return m;
}

/* a model kept from an earlier version of the page: one value per distributed load */
function normModel(m) {
  for (const mb of m.members) { const u = mb.udl; if (u && u.w1 === undefined) { u.w1 = u.w2 = u.w || m.wref || 10; delete u.w; } }
  return m;
}

if (typeof module !== 'undefined') module.exports = { SECTIONS, PRESETS, buildModel, normModel, sectionEI, sectionEA, sectionMore, applySections, gridOf, memLen, lenAxisOf, stretch };
