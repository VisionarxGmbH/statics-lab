/* Hand formulas, equilibrium and member rules. Pure functions of (model, solution).
   A row is { f: formula (HTML), s: substitution with exact operands or null, v: hand value, u: unit, ref: solver value or null }. */
const CARDS = (() => {
  const S = typeof FS !== 'undefined' ? FS : require('./solver.js');
  const E9 = 1e-9;
  /* rounding half away from zero, done once. The only allowance is for the binary arithmetic: a value within a
     billionth of a display step of a half step is on it (31.25 is printed as 31.3; 315.449 999 98 as 315.4) */
  const fix = (x, d) => {
    const t = Math.abs(x) * 10 ** d, r = Math.floor(t + 0.5 + Math.max(1e-9, 4e-13 * t)) / 10 ** d;
    return (x < 0 && r > 0 ? '\u2212' : '') + r.toFixed(d);
  };
  const n1 = x => fix(x, 1), n2 = x => fix(x, 2);
  const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  /* operands of a substitution: the line is shown only when every operand is exact as printed */
  let exact = true;
  const X1 = x => { if (Math.abs(x * 10 - Math.round(x * 10)) > 1e-8) exact = false; return n1(x); };
  const X2 = x => { if (Math.abs(x * 100 - Math.round(x * 100)) > 1e-8) exact = false; return n2(x); };
  const XE = x => { if (Math.abs(x * 100 - Math.round(x * 100)) > 1e-8) exact = false; const [a, b] = (Math.round(x * 100) / 100).toFixed(2).split('.'); return grp(a) + (b === '00' ? '' : '.' + b.replace(/0$/, '')); };
  /* a stiffness ratio: two decimals, three where it needs them (0.125) */
  const XK = x => { if (Math.abs(x * 1000 - Math.round(x * 1000)) > 1e-8) exact = false; const s = (Math.round(x * 1000) / 1000).toFixed(3); return s.endsWith('0') ? s.slice(0, -1) : s; };
  const sub = f => { exact = true; const s = f(); return exact ? s : null; };
  /* the value of a printed line: plain arithmetic of the numbers as they stand in it (· / + −, brackets, powers, a root, a sine) */
  function lineValue(t) {
    const src = t.replace(/(\d)[\u2009\u202f ](?=\d{3}(?!\d))/g, '$1').replace(/\s+/g, '');
    let i = 0;
    const eat = c => (src.startsWith(c, i) ? (i += c.length, true) : false);
    const pow = v => { for (;;) { if (eat('²')) v = v * v; else if (eat('³')) v = v * v * v; else if (eat('⁴')) v = v * v * v * v; else return v; } };
    const num = () => { const m = /^\d+(\.\d+)?/.exec(src.slice(i)); if (!m) throw new Error('number'); i += m[0].length; return parseFloat(m[0]); };
    const close = v => { if (!eat(')')) throw new Error(')'); return v; };
    const atom = () => { if (eat('(')) return pow(close(expr())); if (eat('√')) return pow(Math.sqrt(eat('(') ? close(expr()) : num())); if (eat('sin')) { const v = num(); if (!eat('°')) throw new Error('°'); return pow(Math.sin(v * Math.PI / 180)); } return pow(num()); };
    const unary = () => (eat('\u2212') || eat('-') ? -unary() : atom());
    const term = () => { let v = unary(); for (;;) { if (eat('·') || eat('*')) v *= unary(); else if (eat('/')) v /= unary(); else return v; } };
    function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('\u2212') || eat('-')) v -= term(); else return v; } }
    try { const v = expr(); return i === src.length && isFinite(v) ? v : null; } catch (_) { return null; }
  }
  /* a row with a printed line shows that line worked out: its value is taken from the line, so line and result cannot print apart */
  const row = (f, s, v, u, ref, x) => {
    if (s) { const lv = lineValue(s); if (lv !== null && Math.abs(lv - v) <= 1e-6 * Math.max(1, Math.abs(v))) v = lv; }
    return Object.assign({ f, s, v, u, ref: ref === undefined ? null : ref }, x || {});
  };
  /* one product of a sum of moments: the sign comes from force times lever arm, both are printed as magnitudes */
  const prod = (t, e, first) => (t.F * e < 0 ? (first ? '−' : ' − ') : (first ? '' : ' + ')) + `${t.t()} · ${X2(Math.abs(e))}`;
  /* a signed value inside a running sum: "+ 12.5" or "− 12.5" */
  /* a value that prints as 0.0 has no sign: a rounding amount below zero must not turn "− 0.0" into "+ 0.0" */
  const neg = v => v < 0 && n1(v) !== '0.0';
  const plus = v => (neg(v) ? '− ' : '+ ') + X1(Math.abs(v)), minus = v => (neg(v) ? '+ ' : '− ') + X1(Math.abs(v));
  /* a negative value behind an operator stands in brackets */
  const par = v => (neg(v) ? `(${X1(v)})` : X1(v));

  /* letters for the dimension chain of the drawing */
  const hd = (v0, v1, s) => ({ h: true, v0: Math.min(v0, v1), v1: Math.max(v0, v1), s }), vd = (v0, v1, s) => ({ h: false, v0: Math.min(v0, v1), v1: Math.max(v0, v1), s });
  /* formula markup */
  const V = (s, i) => `<i>${s}</i>` + (i ? `<sub>${i}</sub>` : '');
  const fr = (a, b) => `<span class="fr"><span>${a}</span><span>${b}</span></span>`;
  const p2 = s => s + '<sup>2</sup>', p3 = s => s + '<sup>3</sup>', p4 = s => s + '<sup>4</sup>';
  /* one letter per quantity on the whole page: q distributed load, P point load, F support reaction, w deflection (the
     movement of a point across its member), θ rotation (the slope w′ of the deflection line, positive clockwise),
     δ displacement (how far a point moves in total) */
  const P = V('P'), a_ = V('a'), b_ = V('b'), L_ = V('L'), w_ = V('q'), EI = V('EI'), h_ = V('h'), k_ = V('k'), l_ = V('l'), f_ = V('f');
  const D = '·', MN = '−';
  /* a row that belongs to the deflection line: the page shows it on that tab only */
  const TH = l => V('θ', l), rowD = (f, s, v, u, ref) => row(f, s, v, u, ref, { tab: 'D' });
  /* support reactions are forces F, named by the support letter and the axis: F_Ax counts positive to the right,
     F_Az positive upward (against the load) */
  const RZ = l => V('F', l + 'z'), RX = l => V('F', l + 'x');

  function gather(model) {
    const pts = [], udl = [];
    for (const ld of model.loads) {
      const m = model.members[ld.m], A = model.nodes[m.n1], B = model.nodes[m.n2];
      const L = Math.hypot(B.x - A.x, B.y - A.y), t = Math.min(Math.max(ld.a, 0), L) / L, r = ld.ang * Math.PI / 180;
      let Fx = ld.P * Math.cos(r), Fy = ld.P * Math.sin(r);
      if (Math.abs(Fx) < 1e-9 * ld.P) Fx = 0;
      if (Math.abs(Fy) < 1e-9 * ld.P) Fy = 0;
      pts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, Fx, Fy, P: ld.P, m: ld.m, a: t * L, L });
    }
    /* a distributed load is taken by its resultant. A load that runs from w1 to w2 counts as two parts: a uniform
       load, the smaller value, and a triangle, the difference, with its resultant a third of the length from the high end */
    model.members.forEach((m, i) => {
      const u = m.udl;
      if (!u || !u.on || !(u.w1 > 0 || u.w2 > 0)) return;
      const A = model.nodes[m.n1], B = model.nodes[m.n2], L = Math.hypot(B.x - A.x, B.y - A.y), r = u.ang * Math.PI / 180;
      let dx = Math.cos(r), dy = Math.sin(r);
      if (Math.abs(dx) < 1e-9) dx = 0;
      if (Math.abs(dy) < 1e-9) dy = 0;
      const lo = Math.min(u.w1, u.w2), d = Math.abs(u.w2 - u.w1), split = lo > E9 && d > E9, at = t => [A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t];
      const part = (kind, w, W, t, hi) => {
        const [xc, yc] = at(t), [xh, yh] = at(hi === 2 ? 1 : 0);
        udl.push({ m: i, kind, w, wx: w * dx, wy: w * dy, W, Fx: W * dx, Fy: W * dy, L, xc, yc, hi, xh, yh, split, x1: Math.min(A.x, B.x), x2: Math.max(A.x, B.x) });
      };
      if (lo > E9) part('u', lo, lo * L, 0.5, 0);
      if (d > E9) part('t', d, d * L / 2, u.w2 > u.w1 ? 2 / 3 : 1 / 3, u.w2 > u.w1 ? 2 : 1);
    });
    return { pts, udl, tri: udl.some(u => u.kind === 't'), split: udl.some(u => u.split), vertical: pts.every(p => !p.Fx) && udl.every(u => !u.wx) };
  }
  /* the resultant of a distributed load as it is printed in a sum, and the sentence that explains it */
  const res = u => `${X1(u.w)} ${D} ${X2(u.L)}` + (u.kind === 't' ? ' / 2' : '');
  const upNote = G => (G.pts.some(p => p.Fy > 0) || G.udl.some(u => u.Fy > 0) ? ' An upward load counts negative in the sums.' : '');
  const resNote = G => (G.udl.some(u => u.kind === 'u') ? ` A uniform load acts as ${w_}${D}${L_} at its centre.` : '')
    + (G.tri ? ` A triangular load acts as ${w_}${D}${L_}/2 at a third of its length from its high end.` : '')
    + (G.split ? ' A load that runs from one value to another is split into a uniform load, the smaller value, and a triangle, the difference.' : '');

  function equilibrium(model, sol) {
    const G = gather(model);
    let oi = model.nodes.findIndex(n => n.sup !== 'free');
    if (oi < 0) oi = 0;
    const ox = model.nodes[oi].x, oy = model.nodes[oi].y;
    let lx = 0, ly = 0, lm = 0, rx = 0, ry = 0, rm = 0;
    for (const p of G.pts) { lx += p.Fx; ly += p.Fy; lm += (p.x - ox) * p.Fy - (p.y - oy) * p.Fx; }
    for (const u of G.udl) { lx += u.Fx; ly += u.Fy; lm += (u.xc - ox) * u.Fy - (u.yc - oy) * u.Fx; }
    sol.reactions.forEach((r, i) => { const n = model.nodes[i]; rx += r.Rx; ry += r.Ry; rm += r.Mz + (n.x - ox) * r.Ry - (n.y - oy) * r.Rx; });
    return { about: model.nodes[oi].lbl || '', H: [rx, lx], V: [ry, ly], M: [rm, lm] };
  }

  /* ---------- beams ---------- */
  function beamCtx(model, sol) {
    const y0 = model.nodes[0].y;
    if (model.nodes.some(n => Math.abs(n.y - y0) > E9)) return null;
    if (sol.mem.some(M => M.c < 1 - 1e-9)) return null;
    const mem = sol.mem.slice().sort((p, q) => p.x1 - q.x1);
    const find = (x, side) => {
      for (const M of mem) if (side < 0 ? (x > M.x1 + E9 && x <= M.x2 + E9) : (x >= M.x1 - E9 && x < M.x2 - E9)) return M;
      return side < 0 ? mem[0] : mem[mem.length - 1];
    };
    const at = (x, side = -1) => { const M = find(x, side), xl = Math.min(Math.max(x - M.x1, 0), M.L); return S.forcesAt(M, xl, xl <= E9 ? 1 : xl >= M.L - E9 ? -1 : side); };
    const defl = x => { const M = find(x, -1); return -S.interp(M.smp, 'dY', Math.min(Math.max(x - M.x1, 0), M.L), -1); };
    const maxM = (xa, xb) => { let m = -Infinity; for (const M of mem) for (let i = 0; i < M.smp.xs.length; i++) { const x = M.x1 + M.smp.xs[i]; if (x >= xa - E9 && x <= xb + E9) m = Math.max(m, M.smp.M[i]); } return m; };
    const minM = (xa, xb) => { let m = Infinity; for (const M of mem) for (let i = 0; i < M.smp.xs.length; i++) { const x = M.x1 + M.smp.xs[i]; if (x >= xa - E9 && x <= xb + E9) m = Math.min(m, M.smp.M[i]); } return m; };
    /* the rotation: the slope of the deflection line, positive clockwise */
    const rot = (x, side = -1) => { const M = find(x, side), xl = Math.min(Math.max(x - M.x1, 0), M.L); return -S.interp(M.smp, 'rot', xl, xl <= E9 ? 1 : xl >= M.L - E9 ? -1 : side); };
    return { mem, at, defl, rot, maxM, minM };
  }

  function singleSpan(model, sol, G, B) {
    const M0 = B.mem[0], L = M0.L, EIv = M0.EI, x1 = M0.x1, x2 = M0.x2;
    const iA = M0.n1, iB = M0.n2, nA = model.nodes[iA], nB = model.nodes[iB], R = sol.reactions;
    const simple = s => s === 'pin' || s === 'roller';
    const pts = G.pts.map(p => ({ x: p.x, P: -p.Fy })), du = G.udl;
    /* load case: one point load, one uniform load, one triangle, two point loads */
    const lc = pts.length === 1 && !du.length ? 'P' : !pts.length && du.length === 1 ? (du[0].kind === 'u' ? 'w' : 't') : pts.length === 2 && !du.length ? '2P' : null;
    const lA = nA.lbl, lB = nB.lbl, mm = 1000, mr = 1000, xm = (x1 + x2) / 2;
    /* a load enters a formula with its size. When it acts upward every formula changes its sign, and what was the
       largest value is the smallest: ps leads a term that is positive under a downward load, ng one that is negative */
    const ld0 = lc === 'P' || lc === '2P' ? pts[0].P : lc ? -du[0].wy : 0, up = ld0 < 0, sv = up ? -1 : 1, ps = up ? MN : '', ng = up ? '' : MN, mx = up ? 'min' : 'max';
    const Pd = lc === 'P' ? Math.abs(pts[0].P) : 0, w = lc === 'w' || lc === 't' ? Math.abs(du[0].wy) : 0;
    const kf = model.members[M0.i].kf || 1;
    const tail = c => {
      const d = c.rows.some(r => r.f.includes('<i>w</i>') || r.f.includes('θ'));
      c.note = (c.note || '') + (up ? ` The load acts upward: ${lc === 'P' || lc === '2P' ? P : w_} is its size, and the forces, moments and deflections have the opposite sign.` : '')
        + (d && kf !== 1 ? ` This beam has a profile of its own: ${EI} = ${XE(EIv)} kNm².` : '');
      c.note = c.note.trim();
      return [c];
    };
    /* triangle: its high end and its zero end, and where the shear is zero */
    const hiB = lc === 't' && du[0].hi === 2, [iH, iL, lH, lL] = hiB ? [iB, iA, lB, lA] : [iA, iB, lA, lB];
    const zr = lc === 't' ? S.vZeros(M0, 0, L)[0] : undefined, Mzr = zr === undefined ? null : S.forcesAt(M0, zr, -1).M, x0_ = V('x', '0');

    if (simple(nA.sup) && simple(nB.sup)) {
      if (lc === 'P') {
        const a = pts[0].x - x1, b = L - a, mid = Math.abs(a - b) < 1e-9, xp = pts[0].x;
        return tail({ title: 'Simple beam, point load', dim: [hd(x1, xp, 'a'), hd(xp, x2, 'b')], rows: [
          row(`${RZ(lA)} = ${ps}${fr(P + D + b_, L_)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(b)} / ${X2(L)}`), sv * Pd * b / L, 'kN', R[iA].Ry),
          row(`${RZ(lB)} = ${ps}${fr(P + D + a_, L_)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)} / ${X2(L)}`), sv * Pd * a / L, 'kN', R[iB].Ry),
          mid ? row(`${V('M', mx)} = ${ps}${fr(P + D + L_, '4')}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(L)} / 4`), sv * Pd * L / 4, 'kNm', B.at(xp).M)
            : row(`${V('M', 'P')} = ${ps}${fr(P + D + a_ + D + b_, L_)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)} ${D} ${X2(b)} / ${X2(L)}`), sv * Pd * a * b / L, 'kNm', B.at(xp).M),
          mid ? row(`${V('w', mx)} = ${ps}${fr(P + D + p3(L_), '48' + D + EI)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(L)}³ / (48 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pd * L ** 3 / (48 * EIv) * mm, 'mm', B.defl(xp) * mm)
            : row(`${V('w', 'P')} = ${ps}${fr(P + D + p2(a_) + D + p2(b_), '3' + D + EI + D + L_)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)}² ${D} ${X2(b)}² / (3 ${D} ${XE(EIv)} ${D} ${X2(L)}) ${D} 10³`), sv * Pd * a * a * b * b / (3 * EIv * L) * mm, 'mm', B.defl(xp) * mm),
          ...(mid ? [rowD(`${TH(lA)} = ${MN}${TH(lB)} = ${ps}${fr(P + D + p2(L_), '16' + D + EI)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(L)}² / (16 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pd * L * L / (16 * EIv) * mr, 'mrad', B.rot(x1, 1) * mr)]
            : [rowD(`${TH(lA)} = ${ps}${fr(`${P}${D}${a_}${D}${b_}${D}(${L_} + ${b_})`, '6' + D + EI + D + L_)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)} ${D} ${X2(b)} ${D} (${X2(L)} + ${X2(b)}) / (6 ${D} ${XE(EIv)} ${D} ${X2(L)}) ${D} 10³`), sv * Pd * a * b * (L + b) / (6 * EIv * L) * mr, 'mrad', B.rot(x1, 1) * mr),
              rowD(`${TH(lB)} = ${ng}${fr(`${P}${D}${a_}${D}${b_}${D}(${L_} + ${a_})`, '6' + D + EI + D + L_)}`, sub(() => `${ng}${X1(Pd)} ${D} ${X2(a)} ${D} ${X2(b)} ${D} (${X2(L)} + ${X2(a)}) / (6 ${D} ${XE(EIv)} ${D} ${X2(L)}) ${D} 10³`), -sv * Pd * a * b * (L + a) / (6 * EIv * L) * mr, 'mrad', B.rot(x2, -1) * mr)]),
        ] });
      }
      if (lc === 'w') {
        return tail({ title: 'Simple beam, uniform load', dim: [hd(x1, x2, 'L')], rows: [
          row(`${RZ(lA)} = ${RZ(lB)} = ${ps}${fr(w_ + D + L_, '2')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)} / 2`), sv * w * L / 2, 'kN', R[iA].Ry),
          row(`${V('M', mx)} = ${ps}${fr(w_ + D + p2(L_), '8')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / 8`), sv * w * L * L / 8, 'kNm', B.at((x1 + x2) / 2).M),
          row(`${V('w', mx)} = ${ps}${fr('5' + D + w_ + D + p4(L_), '384' + D + EI)}`, sub(() => `${ps}5 ${D} ${X1(w)} ${D} ${X2(L)}⁴ / (384 ${D} ${XE(EIv)}) ${D} 10³`), sv * 5 * w * L ** 4 / (384 * EIv) * mm, 'mm', B.defl((x1 + x2) / 2) * mm),
          rowD(`${TH(lA)} = ${MN}${TH(lB)} = ${ps}${fr(w_ + D + p3(L_), '24' + D + EI)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}³ / (24 ${D} ${XE(EIv)}) ${D} 10³`), sv * w * L ** 3 / (24 * EIv) * mr, 'mrad', B.rot(x1, 1) * mr),
        ] });
      }
      if (lc === 't') {
        const x0 = L / Math.sqrt(3);
        return tail({ title: 'Simple beam, triangular load', dim: [hd(x1, x2, 'L')],
          note: `${w_} = load at the high end ${lH}, zero at ${lL}. ${x0_} is measured from ${lL}: there V = 0 and M has its peak. The largest deflection lies just beside midspan and is 0.2 % more than ${V('w', 'mid')}.`, rows: [
            row(`${RZ(lL)} = ${ps}${fr(w_ + D + L_, '6')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)} / 6`), sv * w * L / 6, 'kN', R[iL].Ry),
            row(`${RZ(lH)} = ${ps}${fr(w_ + D + L_, '3')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)} / 3`), sv * w * L / 3, 'kN', R[iH].Ry),
            row(`${x0_} = ${fr(L_, '√3')}`, sub(() => `${X2(L)} / √3`), x0, 'm', zr === undefined ? null : hiB ? zr : L - zr, { dec: 2 }),
            row(`${V('M', mx)} = ${ps}${fr(w_ + D + p2(L_), '9' + D + '√3')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / (9 ${D} √3)`), sv * w * L * L / (9 * Math.sqrt(3)), 'kNm', Mzr),
            row(`${V('w', 'mid')} = ${ps}${fr('5' + D + w_ + D + p4(L_), '768' + D + EI)}`, sub(() => `${ps}5 ${D} ${X1(w)} ${D} ${X2(L)}⁴ / (768 ${D} ${XE(EIv)}) ${D} 10³`), sv * 5 * w * L ** 4 / (768 * EIv) * mm, 'mm', B.defl(xm) * mm),
            /* the rotations at the two ends: 7/360 at the zero end of the load, 1/45 at its high end; the left end turns clockwise */
            ...[[lL, iL, 7, 360], [lH, iH, 1, 45]].map(([lbl, i, nu, de]) => { const sg = (i === iA ? 1 : -1) * sv, sn = sg < 0 ? MN : '';
              return rowD(`${TH(lbl)} = ${sn}${fr((nu === 1 ? '' : nu + D) + w_ + D + p3(L_), de + D + EI)}`, sub(() => `${sn}${nu === 1 ? '' : nu + ' ' + D + ' '}${X1(w)} ${D} ${X2(L)}³ / (${de} ${D} ${XE(EIv)}) ${D} 10³`), sg * nu * w * L ** 3 / (de * EIv) * mr, 'mrad', (i === iA ? B.rot(x1, 1) : B.rot(x2, -1)) * mr); }),
          ] });
      }
      if (lc === '2P') {
        const [pa, pb] = pts[0].x <= pts[1].x ? pts : [pts[1], pts[0]], a = pa.x - x1, Pv = Math.abs(pa.P);
        if (Math.abs(pa.P - pb.P) > 1e-9 || Math.abs(a - (x2 - pb.x)) > 1e-9 || a < 1e-9 || a > L / 2 - 1e-9) return null;
        return tail({ title: 'Simple beam, two equal loads', dim: [hd(x1, pa.x, 'a'), hd(pb.x, x2, 'a')], note: 'a = distance of each load from its support. Between the loads V = 0 and M is constant.', rows: [
          row(`${RZ(lA)} = ${RZ(lB)} = ${ps}${P}`, null, sv * Pv, 'kN', R[iA].Ry),
          row(`${V('M', mx)} = ${ps}${P}${D}${a_}`, sub(() => `${ps}${X1(Pv)} ${D} ${X2(a)}`), sv * Pv * a, 'kNm', B.at(xm).M),
          row(`${V('w', mx)} = ${ps}${fr(`${P}${D}${a_}${D}(3${p2(L_)} ${MN} 4${p2(a_)})`, '24' + D + EI)}`, sub(() => `${ps}${X1(Pv)} ${D} ${X2(a)} ${D} (3 ${D} ${X2(L)}² ${MN} 4 ${D} ${X2(a)}²) / (24 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pv * a * (3 * L * L - 4 * a * a) / (24 * EIv) * mm, 'mm', B.defl(xm) * mm),
          rowD(`${TH(lA)} = ${MN}${TH(lB)} = ${ps}${fr(`${P}${D}${a_}${D}(${L_} ${MN} ${a_})`, '2' + D + EI)}`, sub(() => `${ps}${X1(Pv)} ${D} ${X2(a)} ${D} (${X2(L)} ${MN} ${X2(a)}) / (2 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pv * a * (L - a) / (2 * EIv) * mr, 'mrad', B.rot(x1, 1) * mr),
        ] });
      }
      return null;
    }
    const fA = nA.sup === 'fixed', fB = nB.sup === 'fixed';
    if (fA && fB) {
      if (lc === 'w') {
        return tail({ title: 'Fixed beam, uniform load', dim: [hd(x1, x2, 'L')], rows: [
          row(`${V('M', lA)} = ${V('M', lB)} = ${ng}${fr(w_ + D + p2(L_), '12')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 12`), -sv * w * L * L / 12, 'kNm', B.at(x1, 1).M),
          row(`${V('M', 'mid')} = ${ps}${fr(w_ + D + p2(L_), '24')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / 24`), sv * w * L * L / 24, 'kNm', B.at((x1 + x2) / 2).M),
          row(`${V('w', mx)} = ${ps}${fr(w_ + D + p4(L_), '384' + D + EI)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}⁴ / (384 ${D} ${XE(EIv)}) ${D} 10³`), sv * w * L ** 4 / (384 * EIv) * mm, 'mm', B.defl((x1 + x2) / 2) * mm),
        ] });
      }
      if (lc === 'P') {
        const a = pts[0].x - x1, b = L - a, xp = pts[0].x;
        return tail({ title: 'Fixed beam, point load', dim: [hd(x1, xp, 'a'), hd(xp, x2, 'b')], rows: [
          row(`${V('M', lA)} = ${ng}${fr(P + D + a_ + D + p2(b_), p2(L_))}`, sub(() => `${ng}${X1(Pd)} ${D} ${X2(a)} ${D} ${X2(b)}² / ${X2(L)}²`), -sv * Pd * a * b * b / L ** 2, 'kNm', B.at(x1, 1).M),
          row(`${V('M', lB)} = ${ng}${fr(P + D + p2(a_) + D + b_, p2(L_))}`, sub(() => `${ng}${X1(Pd)} ${D} ${X2(a)}² ${D} ${X2(b)} / ${X2(L)}²`), -sv * Pd * a * a * b / L ** 2, 'kNm', B.at(x2, -1).M),
          row(`${V('M', 'P')} = ${ps}${fr('2' + D + P + D + p2(a_) + D + p2(b_), p3(L_))}`, sub(() => `${ps}2 ${D} ${X1(Pd)} ${D} ${X2(a)}² ${D} ${X2(b)}² / ${X2(L)}³`), sv * 2 * Pd * a * a * b * b / L ** 3, 'kNm', B.at(xp).M),
          row(`${V('w', 'P')} = ${ps}${fr(P + D + p3(a_) + D + p3(b_), '3' + D + EI + D + p3(L_))}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)}³ ${D} ${X2(b)}³ / (3 ${D} ${XE(EIv)} ${D} ${X2(L)}³) ${D} 10³`), sv * Pd * a ** 3 * b ** 3 / (3 * EIv * L ** 3) * mm, 'mm', B.defl(xp) * mm),
        ] });
      }
      if (lc === 't') {
        const ML = hiB ? B.at(x1, 1).M : B.at(x2, -1).M, MH = hiB ? B.at(x2, -1).M : B.at(x1, 1).M;
        return tail({ title: 'Fixed beam, triangular load', dim: [hd(x1, x2, 'L')], note: `${w_} = load at the high end ${lH}, zero at ${lL}.`, rows: [
          row(`${V('M', lL)} = ${ng}${fr(w_ + D + p2(L_), '30')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 30`), -sv * w * L * L / 30, 'kNm', ML),
          row(`${V('M', lH)} = ${ng}${fr(w_ + D + p2(L_), '20')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 20`), -sv * w * L * L / 20, 'kNm', MH),
          row(`${RZ(lL)} = ${ps}${fr('3' + D + w_ + D + L_, '20')}`, sub(() => `${ps}3 ${D} ${X1(w)} ${D} ${X2(L)} / 20`), sv * 3 * w * L / 20, 'kN', R[iL].Ry),
          row(`${RZ(lH)} = ${ps}${fr('7' + D + w_ + D + L_, '20')}`, sub(() => `${ps}7 ${D} ${X1(w)} ${D} ${X2(L)} / 20`), sv * 7 * w * L / 20, 'kN', R[iH].Ry),
          row(`${V('w', 'mid')} = ${ps}${fr(w_ + D + p4(L_), '768' + D + EI)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}⁴ / (768 ${D} ${XE(EIv)}) ${D} 10³`), sv * w * L ** 4 / (768 * EIv) * mm, 'mm', B.defl(xm) * mm),
        ] });
      }
      return null;
    }
    if (!fA && !fB) return null;
    /* one fixed end: cantilever or propped cantilever; a is measured from the fixed end */
    const iF = fA ? iA : iB, iO = fA ? iB : iA, lF = fA ? lA : lB, lO = fA ? lB : lA, xF = fA ? x1 : x2, xO = fA ? x2 : x1;
    const Mfix = fA ? B.at(x1, 1).M : B.at(x2, -1).M, oth = model.nodes[iO].sup;
    /* the rotation at the other end O: at the free end of a cantilever fixed on the left the line falls to the right, a
       clockwise turn (cs = 1 under a downward load); the prop of a propped cantilever turns the other way. cn and pn
       are the marks in front of the two formulas */
    const thO = fA ? B.rot(x2, -1) : B.rot(x1, 1), cs = (fA ? 1 : -1) * sv, cn = cs < 0 ? MN : '', pn = cs < 0 ? '' : MN;
    if (oth === 'free') {
      if (lc === 'P') {
        const a = Math.abs(pts[0].x - xF), tip = Math.abs(a - L) < 1e-9;
        return tail({ title: 'Cantilever, point load', dim: [hd(xF, pts[0].x, tip ? 'L' : 'a')], note: tip ? '' : 'a = distance of the load from the fixed end.', rows: [
          row(`${RZ(lF)} = ${ps}${P}`, null, sv * Pd, 'kN', R[iF].Ry),
          row(`${V('M', lF)} = ${ng}${P}${D}${tip ? L_ : a_}`, sub(() => `${ng}${X1(Pd)} ${D} ${X2(a)}`), -sv * Pd * a, 'kNm', Mfix),
          tip ? row(`${V('w', mx)} = ${ps}${fr(P + D + p3(L_), '3' + D + EI)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(L)}³ / (3 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pd * L ** 3 / (3 * EIv) * mm, 'mm', B.defl(xO) * mm)
            : row(`${V('w', 'tip')} = ${ps}${fr(P + D + p2(a_) + D + `(3${L_} ${MN} ${a_})`, '6' + D + EI)}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)}² ${D} (3 ${D} ${X2(L)} ${MN} ${X2(a)}) / (6 ${D} ${XE(EIv)}) ${D} 10³`), sv * Pd * a * a * (3 * L - a) / (6 * EIv) * mm, 'mm', B.defl(xO) * mm),
          rowD(`${TH(lO)} = ${cn}${fr(P + D + p2(tip ? L_ : a_), '2' + D + EI)}`, sub(() => `${cn}${X1(Pd)} ${D} ${X2(a)}² / (2 ${D} ${XE(EIv)}) ${D} 10³`), cs * Pd * a * a / (2 * EIv) * mr, 'mrad', thO * mr),
        ] });
      }
      if (lc === 'w') {
        return tail({ title: 'Cantilever, uniform load', dim: [hd(x1, x2, 'L')], rows: [
          row(`${RZ(lF)} = ${ps}${w_}${D}${L_}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}`), sv * w * L, 'kN', R[iF].Ry),
          row(`${V('M', lF)} = ${ng}${fr(w_ + D + p2(L_), '2')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 2`), -sv * w * L * L / 2, 'kNm', Mfix),
          row(`${V('w', mx)} = ${ps}${fr(w_ + D + p4(L_), '8' + D + EI)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}⁴ / (8 ${D} ${XE(EIv)}) ${D} 10³`), sv * w * L ** 4 / (8 * EIv) * mm, 'mm', B.defl(xO) * mm),
          rowD(`${TH(lO)} = ${cn}${fr(w_ + D + p3(L_), '6' + D + EI)}`, sub(() => `${cn}${X1(w)} ${D} ${X2(L)}³ / (6 ${D} ${XE(EIv)}) ${D} 10³`), cs * w * L ** 3 / (6 * EIv) * mr, 'mrad', thO * mr),
        ] });
      }
      if (lc === 't') {
        const atFix = Math.abs(du[0].xh - xF) < E9;
        return tail({ title: 'Cantilever, triangular load', dim: [hd(x1, x2, 'L')], note: `${w_} = load at the high end, here the ${atFix ? 'fixed end ' + lF : 'free end ' + lO}.`, rows: [
          row(`${RZ(lF)} = ${ps}${fr(w_ + D + L_, '2')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)} / 2`), sv * w * L / 2, 'kN', R[iF].Ry),
          atFix ? row(`${V('M', lF)} = ${ng}${fr(w_ + D + p2(L_), '6')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 6`), -sv * w * L * L / 6, 'kNm', Mfix)
            : row(`${V('M', lF)} = ${ng}${fr(w_ + D + p2(L_), '3')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 3`), -sv * w * L * L / 3, 'kNm', Mfix),
          atFix ? row(`${V('w', mx)} = ${ps}${fr(w_ + D + p4(L_), '30' + D + EI)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}⁴ / (30 ${D} ${XE(EIv)}) ${D} 10³`), sv * w * L ** 4 / (30 * EIv) * mm, 'mm', B.defl(xO) * mm)
            : row(`${V('w', mx)} = ${ps}${fr('11' + D + w_ + D + p4(L_), '120' + D + EI)}`, sub(() => `${ps}11 ${D} ${X1(w)} ${D} ${X2(L)}⁴ / (120 ${D} ${XE(EIv)}) ${D} 10³`), sv * 11 * w * L ** 4 / (120 * EIv) * mm, 'mm', B.defl(xO) * mm),
          rowD(`${TH(lO)} = ${cn}${fr(w_ + D + p3(L_), (atFix ? '24' : '8') + D + EI)}`, sub(() => `${cn}${X1(w)} ${D} ${X2(L)}³ / (${atFix ? 24 : 8} ${D} ${XE(EIv)}) ${D} 10³`), cs * w * L ** 3 / ((atFix ? 24 : 8) * EIv) * mr, 'mrad', thO * mr),
        ] });
      }
      /* several loads on a cantilever: statics only */
      let sP = 0, sM = 0;
      const tm = [];
      pts.forEach(p => { const e = Math.abs(p.x - xF); sP += p.P; sM += p.P * e; tm.push({ F: p.P, t: () => X1(Math.abs(p.P)), e }); });
      du.forEach(u => { const F = -u.Fy, e = Math.abs(u.xc - xF); sP += F; sM += F * e; tm.push({ F, t: () => res(u), e }); });
      return [{ title: 'Cantilever, statics', note: 'x = distance of each load from the fixed end.' + upNote(G) + resNote(G), rows: [
        row(`${RZ(lF)} = Σ ${P}`, null, sP, 'kN', R[iF].Ry),
        row(`${V('M', lF)} = ${MN}Σ ${P}${D}${V('x')}`, tm.length <= 3 ? sub(() => `${MN}(${tm.map((t, i) => prod(t, t.e, i === 0)).join('')})`) : null, -sM, 'kNm', Mfix),
      ] }];
    }
    if (!simple(oth)) return null;
    if (lc === 't') {
      const atFix = Math.abs(du[0].xh - xF) < E9, note = `${w_} = load at the high end, here the ${atFix ? 'fixed end ' + lF : 'prop ' + lO}.`;
      if (atFix) return tail({ title: 'Propped cantilever, triangular load', dim: [hd(x1, x2, 'L')], note, rows: [
        row(`${RZ(lO)} = ${ps}${fr(w_ + D + L_, '10')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)} / 10`), sv * w * L / 10, 'kN', R[iO].Ry),
        row(`${RZ(lF)} = ${ps}${fr('2' + D + w_ + D + L_, '5')}`, sub(() => `${ps}2 ${D} ${X1(w)} ${D} ${X2(L)} / 5`), sv * 2 * w * L / 5, 'kN', R[iF].Ry),
        row(`${V('M', lF)} = ${ng}${fr(w_ + D + p2(L_), '15')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 15`), -sv * w * L * L / 15, 'kNm', Mfix),
        row(`${V('M', 'span')} = ${ps}${fr(w_ + D + p2(L_), '15' + D + '√5')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / (15 ${D} √5)`), sv * w * L * L / (15 * Math.sqrt(5)), 'kNm', Mzr),
        rowD(`${TH(lO)} = ${pn}${fr(w_ + D + p3(L_), '120' + D + EI)}`, sub(() => `${pn}${X1(w)} ${D} ${X2(L)}³ / (120 ${D} ${XE(EIv)}) ${D} 10³`), -cs * w * L ** 3 / (120 * EIv) * mr, 'mrad', thO * mr),
      ] });
      return tail({ title: 'Propped cantilever, triangular load', dim: [hd(x1, x2, 'L')], note, rows: [
        row(`${RZ(lO)} = ${ps}${fr('11' + D + w_ + D + L_, '40')}`, sub(() => `${ps}11 ${D} ${X1(w)} ${D} ${X2(L)} / 40`), sv * 11 * w * L / 40, 'kN', R[iO].Ry),
        row(`${RZ(lF)} = ${ps}${fr('9' + D + w_ + D + L_, '40')}`, sub(() => `${ps}9 ${D} ${X1(w)} ${D} ${X2(L)} / 40`), sv * 9 * w * L / 40, 'kN', R[iF].Ry),
        row(`${V('M', lF)} = ${ng}${fr('7' + D + w_ + D + p2(L_), '120')}`, sub(() => `${ng}7 ${D} ${X1(w)} ${D} ${X2(L)}² / 120`), -sv * 7 * w * L * L / 120, 'kNm', Mfix),
        rowD(`${TH(lO)} = ${pn}${fr(w_ + D + p3(L_), '80' + D + EI)}`, sub(() => `${pn}${X1(w)} ${D} ${X2(L)}³ / (80 ${D} ${XE(EIv)}) ${D} 10³`), -cs * w * L ** 3 / (80 * EIv) * mr, 'mrad', thO * mr),
      ] });
    }
    if (lc === 'w') {
      return tail({ title: 'Propped cantilever, uniform load', dim: [hd(x1, x2, 'L')], rows: [
        row(`${RZ(lO)} = ${ps}${fr('3' + D + w_ + D + L_, '8')}`, sub(() => `${ps}3 ${D} ${X1(w)} ${D} ${X2(L)} / 8`), sv * 3 * w * L / 8, 'kN', R[iO].Ry),
        row(`${RZ(lF)} = ${ps}${fr('5' + D + w_ + D + L_, '8')}`, sub(() => `${ps}5 ${D} ${X1(w)} ${D} ${X2(L)} / 8`), sv * 5 * w * L / 8, 'kN', R[iF].Ry),
        row(`${V('M', lF)} = ${ng}${fr(w_ + D + p2(L_), '8')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 8`), -sv * w * L * L / 8, 'kNm', Mfix),
        row(`${V('M', 'span')} = ${ps}${fr('9' + D + w_ + D + p2(L_), '128')}`, sub(() => `${ps}9 ${D} ${X1(w)} ${D} ${X2(L)}² / 128`), sv * 9 * w * L * L / 128, 'kNm', up ? B.minM(x1, x2) : B.maxM(x1, x2)),
        rowD(`${TH(lO)} = ${pn}${fr(w_ + D + p3(L_), '48' + D + EI)}`, sub(() => `${pn}${X1(w)} ${D} ${X2(L)}³ / (48 ${D} ${XE(EIv)}) ${D} 10³`), -cs * w * L ** 3 / (48 * EIv) * mr, 'mrad', thO * mr),
      ] });
    }
    if (lc === 'P') {
      const a = Math.abs(pts[0].x - xF), b = L - a, xp = pts[0].x;
      return tail({ title: 'Propped cantilever, point load', dim: [hd(xF, xp, 'a'), hd(xp, xO, 'b')], note: `a from the fixed end ${lF}, b to the prop ${lO}.`, rows: [
        row(`${RZ(lO)} = ${ps}${fr(P + D + p2(a_) + D + `(3${L_} ${MN} ${a_})`, '2' + D + p3(L_))}`, sub(() => `${ps}${X1(Pd)} ${D} ${X2(a)}² ${D} (3 ${D} ${X2(L)} ${MN} ${X2(a)}) / (2 ${D} ${X2(L)}³)`), sv * Pd * a * a * (3 * L - a) / (2 * L ** 3), 'kN', R[iO].Ry),
        row(`${V('M', lF)} = ${ng}${fr(P + D + a_ + D + b_ + D + `(${L_} + ${b_})`, '2' + D + p2(L_))}`, sub(() => `${ng}${X1(Pd)} ${D} ${X2(a)} ${D} ${X2(b)} ${D} (${X2(L)} + ${X2(b)}) / (2 ${D} ${X2(L)}²)`), -sv * Pd * a * b * (L + b) / (2 * L * L), 'kNm', Mfix),
        row(`${V('M', 'P')} = ${RZ(lO)}${D}${b_}`, null, sv * Pd * a * a * (3 * L - a) / (2 * L ** 3) * b, 'kNm', B.at(xp).M),
        rowD(`${TH(lO)} = ${pn}${fr(P + D + p2(a_) + D + b_, '4' + D + EI + D + L_)}`, sub(() => `${pn}${X1(Pd)} ${D} ${X2(a)}² ${D} ${X2(b)} / (4 ${D} ${XE(EIv)} ${D} ${X2(L)}) ${D} 10³`), -cs * Pd * a * a * b / (4 * EIv * L) * mr, 'mrad', thO * mr),
      ] });
    }
    return null;
  }

  function twoSpan(model, sol, G, B) {
    if (B.mem.length !== 2 || G.pts.length || G.tri) return null;
    const [m1, m2] = B.mem, nd = [m1.n1, m1.n2, m2.n2];
    if (m1.n2 !== m2.n1) return null;
    const ns = nd.map(i => model.nodes[i]);
    if (ns.some(n => n.sup !== 'pin' && n.sup !== 'roller') || ns[1].hinge) return null;
    if (model.members.some(m => m.rel[0] || m.rel[1]) || Math.abs(m1.EI - m2.EI) > 1e-9 * m1.EI) return null;
    const wOf = M => { const u = G.udl.find(q => q.m === M.i); return u ? -u.wy : 0; };
    const w1 = wOf(m1), w2 = wOf(m2), L1 = m1.L, L2 = m2.L, R = sol.reactions;
    if (!w1 && !w2) return null;
    const [lA, lB, lC] = ns.map(n => n.lbl);
    const MB = -(w1 * L1 ** 3 + w2 * L2 ** 3) / (8 * (L1 + L2)), ref = B.at(m1.x2, -1).M;
    /* loads enter with their size; an upward load turns the sign of its term */
    const upN = ` ${w_} is the size of a load; one that acts upward enters with the opposite sign.`;
    if (Math.abs(L1 - L2) < 1e-9 && Math.abs(w1 - w2) < 1e-9) {
      const up = w1 < 0, sv = up ? -1 : 1, ps = up ? MN : '', ng = up ? '' : MN, w = Math.abs(w1), L = L1;
      return [{ title: 'Two equal spans, uniform load', dim: [hd(m1.x1, m1.x2, 'L'), hd(m2.x1, m2.x2, 'L')], note: up ? upN.trim() : '', rows: [
        row(`${V('M', lB)} = ${ng}${fr(w_ + D + p2(L_), '8')}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / 8`), -sv * w * L * L / 8, 'kNm', ref),
        row(`${RZ(lA)} = ${RZ(lC)} = ${ps}${fr('3' + D + w_ + D + L_, '8')}`, sub(() => `${ps}3 ${D} ${X1(w)} ${D} ${X2(L)} / 8`), sv * 3 * w * L / 8, 'kN', R[nd[0]].Ry),
        row(`${RZ(lB)} = ${ps}${fr('5' + D + w_ + D + L_, '4')}`, sub(() => `${ps}5 ${D} ${X1(w)} ${D} ${X2(L)} / 4`), sv * 5 * w * L / 4, 'kN', R[nd[1]].Ry),
        row(`${V('M', 'span')} = ${ps}${fr('9' + D + w_ + D + p2(L_), '128')}`, sub(() => `${ps}9 ${D} ${X1(w)} ${D} ${X2(L)}² / 128`), sv * 9 * w * L * L / 128, 'kNm', up ? B.minM(m1.x1, m1.x2) : B.maxM(m1.x1, m1.x2)),
      ] }];
    }
    const W1 = V('q', '1'), W2 = V('q', '2'), La = V('L', '1'), Lb = V('L', '2');
    /* the sign of the first loaded span is taken out of the bracket */
    const s1 = Math.sign(w1), s2 = Math.sign(w2), s0 = s1 || s2, lead = s0 < 0 ? '' : MN, op = s1 * s2 < 0 ? MN : '+', a1 = Math.abs(w1), a2 = Math.abs(w2);
    const t1 = s => (s < 0 ? MN : ''), t2 = s => (s < 0 ? MN : '+');
    return [{ title: 'Two spans, three-moment equation', dim: [hd(m1.x1, m1.x2, 'L₁'), hd(m2.x1, m2.x2, 'L₂')], note: 'Span 1 on the left, span 2 on the right; an unloaded span has q = 0.' + (s1 < 0 || s2 < 0 ? upN : ''), rows: [
      row(`${V('M', lB)} = ${lead}${fr(`${W1}${D}${p3(La)} ${op} ${W2}${D}${p3(Lb)}`, `8${D}(${La} + ${Lb})`)}`,
        sub(() => `${lead}(${X1(a1)} ${D} ${X2(L1)}³ ${op} ${X1(a2)} ${D} ${X2(L2)}³) / (8 ${D} (${X2(L1)} + ${X2(L2)}))`), MB, 'kNm', ref),
      row(`${RZ(lA)} = ${t1(s1)}${fr(W1 + D + La, '2')} + ${fr(V('M', lB), La)}`, null, w1 * L1 / 2 + MB / L1, 'kN', R[nd[0]].Ry),
      row(`${RZ(lC)} = ${t1(s2)}${fr(W2 + D + Lb, '2')} + ${fr(V('M', lB), Lb)}`, null, w2 * L2 / 2 + MB / L2, 'kN', R[nd[2]].Ry),
      row(`${RZ(lB)} = ${t1(s1)}${W1}${D}${La} ${t2(s2)} ${W2}${D}${Lb} ${MN} ${RZ(lA)} ${MN} ${RZ(lC)}`, null, w1 * L1 + w2 * L2 - (w1 * L1 / 2 + MB / L1) - (w2 * L2 / 2 + MB / L2), 'kN', R[nd[1]].Ry),
    ] }];
  }

  /* any beam on two simple supports without hinges: moments about each support */
  function twoSupports(model, sol, G, B) {
    const sup = model.nodes.map((n, i) => ({ n, i })).filter(o => o.n.sup !== 'free');
    if (sup.length !== 2 || sup.some(o => o.n.sup === 'fixed') || model.nodes.some(n => n.hinge)) return null;
    if (model.members.some(m => m.rel[0] || m.rel[1])) return null;
    sup.sort((p, q) => p.n.x - q.n.x);
    const [A, Bn] = sup, l = Bn.n.x - A.n.x, tm = [];
    let sB = 0, sA = 0;
    for (const p of G.pts) { const x = p.x - A.n.x, F = -p.Fy; sB += F * x; sA += F * (l - x); tm.push({ F, t: () => X1(Math.abs(F)), x }); }
    for (const u of G.udl) { const x = u.xc - A.n.x, F = -u.Fy; sB += F * x; sA += F * (l - x); tm.push({ F, t: () => res(u), x }); }
    if (!tm.length) return null;
    const term = (t, e, first) => prod(t, e, first);
    const line = arm => tm.length <= 3 ? sub(() => `(${tm.map((t, i) => term(t, arm(t.x), i === 0)).join('')}) / ${X2(l)}`) : null;
    const x_ = V('x');
    /* x is a place, not a distance: measured from the left support to the right, so that a load on an overhang left of it
       has a negative x (and turns the other way about that support). Said where the beam reaches left of the support */
    const leftOver = model.nodes.some(n => n.x < A.n.x - E9);
    return [{ title: 'Moments about the supports', note: (leftOver ? `x = place of a load, measured from ${A.n.lbl} to the right: negative for a load left of ${A.n.lbl}. l = distance ${A.n.lbl} to ${Bn.n.lbl}.` : `x = distance of a load from ${A.n.lbl}, l = distance ${A.n.lbl} to ${Bn.n.lbl}.`) + upNote(G) + resNote(G), rows: [
      row(`${RZ(Bn.n.lbl)} = ${fr(`Σ ${P}${D}${x_}`, l_)}`, line(x => x), sB / l, 'kN', sol.reactions[Bn.i].Ry),
      row(`${RZ(A.n.lbl)} = ${fr(`Σ ${P}${D}(${l_} ${MN} ${x_})`, l_)}`, line(x => l - x), sA / l, 'kN', sol.reactions[A.i].Ry),
    ] }];
  }

  /* Gerber beam: three simple supports and one hinge. The part with one support hangs on the hinge;
     it is solved first and its end force then loads the tip of the main beam. */
  function gerber(model, sol, G, B) {
    if (model.members.some(m => m.rel[0] || m.rel[1])) return null;
    const sup = model.nodes.map((n, i) => ({ n, i })).filter(o => o.n.sup !== 'free'), hg = model.nodes.filter(n => n.hinge);
    if (sup.length !== 3 || sup.some(o => o.n.sup === 'fixed') || hg.length !== 1 || hg[0].sup !== 'free') return null;
    sup.sort((p, q) => p.n.x - q.n.x);
    const xg = hg[0].x, right = sup[1].n.x < xg - E9 && xg < sup[2].n.x - E9, left = sup[0].n.x < xg - E9 && xg < sup[1].n.x - E9;
    if (right === left) return null;
    const sg = right ? 1 : -1, Sn = right ? sup[2] : sup[0], Bn = sup[1], An = right ? sup[0] : sup[2];
    const l2 = Math.abs(Sn.n.x - xg), c = Math.abs(xg - Bn.n.x), l1 = Math.abs(Bn.n.x - An.n.x);
    const ld = G.pts.map(p => ({ F: -p.Fy, x: p.x, t: () => X1(Math.abs(p.Fy)) })).concat(G.udl.map(u => ({ F: -u.Fy, x: u.xc, t: () => res(u) })));
    const hung = ld.filter(t => sg * (t.x - xg) > E9), main = ld.filter(t => sg * (t.x - xg) <= E9);
    const eG = t => sg * (t.x - xg), eB = t => sg * (t.x - Bn.n.x), eA = t => sg * (t.x - An.n.x), arm = main.filter(t => eB(t) > E9);
    const sum = (list, e) => list.reduce((s, t) => s + t.F * (e ? e(t) : 1), 0);
    const Sv = sum(hung, eG) / l2, Gv = sum(hung) - Sv, MB = -(Gv * c + sum(arm, eB)), Bv = (sum(main, eA) + Gv * (l1 + c)) / l1, Av = sum(main) + Gv - Bv;
    const terms = (list, e) => list.map((t, i) => prod(t, e(t), i === 0)).join('');
    const few = list => list.length > 0 && list.length <= 2;
    const [lS, lG, lB, lA] = [Sn.n.lbl, hg[0].lbl, Bn.n.lbl, An.n.lbl], l1_ = V('l', '1'), l2_ = V('l', '3'), c_ = V('l', '2'), e_ = i => V('e', i), R = sol.reactions;
    return [{ title: `Hung part ${lG}–${lS} first`, dim: [hd(An.n.x, Bn.n.x, 'l₁'), hd(Bn.n.x, xg, 'l₂'), hd(xg, Sn.n.x, 'l₃')],
      note: `Part ${lG}–${lS} hangs on the hinge and is a simple beam. ${RZ(lG)} is the force in the hinge. ${e_(lG)} = distance of a load from ${lG}, ${l2_} = ${lG} to ${lS}.` + upNote(G) + (G.tri ? resNote(G) : ''), rows: [
        row(`${RZ(lS)} = ${fr(`Σ ${P}${D}${e_(lG)}`, l2_)}`, few(hung) ? sub(() => `(${terms(hung, eG)}) / ${X2(l2)}`) : null, Sv, 'kN', R[Sn.i].Ry),
        row(`${RZ(lG)} = Σ ${P} ${MN} ${RZ(lS)}`, sub(() => `${X1(sum(hung))} ${minus(Sv)}`), Gv, 'kN', right ? B.at(xg, 1).V : -B.at(xg, -1).V),
      ] }, { title: `Then the main beam ${lA}–${lB}`,
      note: `The hinge force ${RZ(lG)} loads the tip of the main beam. Lever arms ${e_(lB)} and ${e_(lA)} about ${lB} and ${lA}; ${l1_} = ${lA} to ${lB}, ${c_} = ${lB} to ${lG}, the arm. In ${V('M', lB)} only the loads between ${lB} and ${lG} count.`, rows: [
        row(`${V('M', lB)} = ${MN}(${RZ(lG)}${D}${c_} + Σ ${P}${D}${e_(lB)})`, arm.length <= 2 ? sub(() => `${MN}(${X1(Gv)} ${D} ${X2(c)}${arm.map(t => prod(t, eB(t), false)).join('')})`) : null, MB, 'kNm', B.at(Bn.n.x).M),
        row(`${RZ(lB)} = ${fr(`Σ ${P}${D}${e_(lA)} + ${RZ(lG)}${D}(${l1_} + ${c_})`, l1_)}`, few(main) ? sub(() => `(${terms(main, eA)} ${plus(Gv)} ${D} ${X2(l1 + c)}) / ${X2(l1)}`) : null, Bv, 'kN', R[Bn.i].Ry),
        row(`${RZ(lA)} = Σ ${P} + ${RZ(lG)} ${MN} ${RZ(lB)}`, sub(() => `${X1(sum(main))} ${plus(Gv)} ${minus(Bv)}`), Av, 'kN', R[An.i].Ry),
      ] }];
  }

  function beamCards(model, sol, G) {
    const B = beamCtx(model, sol);
    if (!B) return null;
    if (!G.vertical || (!G.pts.length && !G.udl.length)) return [];
    let c = null;
    if (model.members.length === 1) c = singleSpan(model, sol, G, B);
    if (!c) c = twoSpan(model, sol, G, B);
    if (!c) c = twoSupports(model, sol, G, B);
    if (!c) c = gerber(model, sol, G, B);
    return c || [];
  }

  /* ---------- frames ---------- */
  const inside = (col, x) => (col.s > 0 ? 1 : -1) * x;   /* left column: tension inside positive */

  function portalCard(model, sol, G) {
    if (model.nodes.length !== 4 || model.members.length !== 3) return null;
    if (model.nodes.some(n => n.hinge) || model.members.some(m => m.rel[0] || m.rel[1])) return null;
    const beams = sol.mem.filter(M => Math.abs(M.s) < E9), cols = sol.mem.filter(M => Math.abs(M.c) < E9);
    if (beams.length !== 1 || cols.length !== 2 || beams[0].c < 0) return null;
    const b = beams[0], top = M => (M.s > 0 ? M.n2 : M.n1), base = M => (M.s > 0 ? M.n1 : M.n2);
    const cL = cols.find(M => top(M) === b.n1), cR = cols.find(M => top(M) === b.n2);
    if (!cL || !cR || Math.abs(cL.L - cR.L) > E9 || Math.abs(cL.EI - cR.EI) > 1e-9 * cL.EI) return null;
    const nL = model.nodes[base(cL)], nR = model.nodes[base(cR)], sup = nL.sup;
    if (sup !== nR.sup || (sup !== 'fixed' && sup !== 'pin')) return null;
    if (model.nodes[b.n1].sup !== 'free' || model.nodes[b.n2].sup !== 'free') return null;
    const h = cL.L, L = b.L, k = (b.EI / cL.EI) * (h / L), R = sol.reactions;
    const Mc = S.forcesAt(b, 0, 1).M, Mb = inside(cL, S.forcesAt(cL, cL.s > 0 ? 0 : cL.L, cL.s > 0 ? 1 : -1).M);
    const dim = [hd(b.x1, b.x2, 'L'), vd(nL.y, model.nodes[b.n1].y, 'h')];
    /* the stiffness ratio: from the bending stiffness of the beam and of a column, each with the profile it has */
    const kRow = row(`${k_} = ${fr(V('EI', 'b'), V('EI', 'c'))}${D}${fr(h_, L_)}`, sub(() => `${XE(b.EI)} / ${XE(cL.EI)} ${D} ${X2(h)} / ${X2(L)}`), k, '', null, { dec: Math.abs(k * 100 - Math.round(k * 100)) < 1e-6 ? 2 : Math.abs(k) >= 0.1 ? 3 : Math.abs(k) >= 0.01 ? 4 : 5 });   /* three digits that count: a short stiff column under a long beam has k = 0.00129 */
    const bc = ` ${V('EI', 'b')} and ${V('EI', 'c')}: bending stiffness of the beam and of a column.`;
    const note = 'Classic portal formulas; they neglect axial shortening.', push = ` The right base pushes back: ${RX(nR.lbl)} = ${MN}${RX(nL.lbl)}.`;
    if (!G.pts.length && G.udl.length === 1 && G.udl[0].kind === 'u' && G.udl[0].m === b.i && !G.udl[0].wx) {
      const ws = -G.udl[0].wy, up = ws < 0, sv = up ? -1 : 1, ps = up ? MN : '', ng = up ? '' : MN, w = Math.abs(ws), mid = S.forcesAt(b, L / 2, -1).M;
      const upN = up ? ` The load acts upward: ${w_} is its size, and the forces, moments and deflections have the opposite sign.` : '';
      if (sup === 'fixed') return [{ title: 'Portal, fixed bases, uniform load', dim, note: note + push + bc + upN, rows: [kRow,
        row(`${V('M', 'corner')} = ${ng}${fr(w_ + D + p2(L_), `6${D}(${k_} + 2)`)}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / (6 ${D} (${XK(k)} + 2))`), -sv * w * L * L / (6 * (k + 2)), 'kNm', Mc),
        row(`${V('M', 'base')} = ${ps}${fr(w_ + D + p2(L_), `12${D}(${k_} + 2)`)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / (12 ${D} (${XK(k)} + 2))`), sv * w * L * L / (12 * (k + 2)), 'kNm', Mb),
        row(`${RX(nL.lbl)} = ${ps}${fr(w_ + D + p2(L_), `4${D}${h_}${D}(${k_} + 2)`)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / (4 ${D} ${X2(h)} ${D} (${XK(k)} + 2))`), sv * w * L * L / (4 * h * (k + 2)), 'kN', R[base(cL)].Rx),
        row(`${V('M', 'mid')} = ${ps}${fr(w_ + D + p2(L_), '8')} + ${V('M', 'corner')}`, sub(() => `${ps}${X1(w * L * L / 8)} ${plus(-sv * w * L * L / (6 * (k + 2)))}`), sv * (w * L * L / 8 - w * L * L / (6 * (k + 2))), 'kNm', mid),
      ] }];
      return [{ title: 'Portal, pinned bases, uniform load', dim, note: note + push + bc + upN, rows: [kRow,
        row(`${V('M', 'corner')} = ${ng}${fr(w_ + D + p2(L_), `4${D}(2${k_} + 3)`)}`, sub(() => `${ng}${X1(w)} ${D} ${X2(L)}² / (4 ${D} (2 ${D} ${XK(k)} + 3))`), -sv * w * L * L / (4 * (2 * k + 3)), 'kNm', Mc),
        row(`${RX(nL.lbl)} = ${ps}${fr(w_ + D + p2(L_), `4${D}${h_}${D}(2${k_} + 3)`)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(L)}² / (4 ${D} ${X2(h)} ${D} (2 ${D} ${XK(k)} + 3))`), sv * w * L * L / (4 * h * (2 * k + 3)), 'kN', R[base(cL)].Rx),
        row(`${V('M', 'mid')} = ${ps}${fr(w_ + D + p2(L_), '8')} + ${V('M', 'corner')}`, sub(() => `${ps}${X1(w * L * L / 8)} ${plus(-sv * w * L * L / (4 * (2 * k + 3)))}`), sv * (w * L * L / 8 - w * L * L / (4 * (2 * k + 3))), 'kNm', mid),
      ] }];
    }
    if (!G.udl.length && G.pts.length === 1 && !G.pts[0].Fy && Math.abs(G.pts[0].y - model.nodes[b.n1].y) < E9) {
      const Pv = Math.abs(G.pts[0].Fx), sway = Math.abs(S.interp(b.smp, 'dX', 0, 1)) * 1000;
      if (sup === 'pin') return [{ title: 'Portal, pinned bases, side load', dim, note: note + ` ${V('δ', 'sway')} = sideways displacement of the beam. ${V('EI', 'c')} and ${V('EI', 'b')}: bending stiffness of a column and of the beam.`, rows: [
        row(`|${RX(nL.lbl)}| = |${RX(nR.lbl)}| = ${fr(P, '2')}`, sub(() => `${X1(Pv)} / 2`), Pv / 2, 'kN', Math.abs(R[base(cL)].Rx)),
        row(`|${V('M', 'corner')}| = ${fr(P + D + h_, '2')}`, sub(() => `${X1(Pv)} ${D} ${X2(h)} / 2`), Pv * h / 2, 'kNm', Math.abs(Mc)),
        row(`${V('δ', 'sway')} = ${fr(P + D + p3(h_), '6' + D + V('EI', 'c'))} + ${fr(P + D + p2(h_) + D + L_, '12' + D + V('EI', 'b'))}`, null, (Pv * h ** 3 / (6 * cL.EI) + Pv * h * h * L / (12 * b.EI)) * 1000, 'mm', sway),
      ] }];
      return [{ title: 'Portal, fixed bases, side load', dim, note: note + bc, rows: [kRow,
        row(`|${V('M', 'base')}| = ${fr(`${P}${D}${h_}${D}(3${k_} + 1)`, `2${D}(6${k_} + 1)`)}`, sub(() => `${X1(Pv)} ${D} ${X2(h)} ${D} (3 ${D} ${XK(k)} + 1) / (2 ${D} (6 ${D} ${XK(k)} + 1))`), Pv * h * (3 * k + 1) / (2 * (6 * k + 1)), 'kNm', Math.abs(Mb)),
        row(`|${V('M', 'corner')}| = ${fr(`${P}${D}${h_}${D}3${k_}`, `2${D}(6${k_} + 1)`)}`, sub(() => `${X1(Pv)} ${D} ${X2(h)} ${D} 3 ${D} ${XK(k)} / (2 ${D} (6 ${D} ${XK(k)} + 1))`), Pv * h * 3 * k / (2 * (6 * k + 1)), 'kNm', Math.abs(Mc)),
      ] }];
    }
    return null;
  }

  function threeHinge(model, sol, G) {
    const sup = model.nodes.map((n, i) => ({ n, i })).filter(o => o.n.sup !== 'free');
    if (sup.length !== 2 || sup.some(o => o.n.sup !== 'pin') || Math.abs(sup[0].n.y - sup[1].n.y) > E9) return null;
    const hg = model.nodes.filter(n => n.hinge && n.sup === 'free');
    if (hg.length !== 1 || model.nodes.some(n => n.hinge && n.sup !== 'free') || model.members.some(m => m.rel[0] || m.rel[1])) return null;
    if (sol.det.n !== 0 || !G.vertical || (!G.pts.length && !G.udl.length)) return null;
    sup.sort((p, q) => p.n.x - q.n.x);
    const [A, B] = sup, g = hg[0], l = B.n.x - A.n.x, f = g.y - A.n.y, xg = g.x - A.n.x;
    if (f < 1e-6 || xg < 1e-6 || xg > l - 1e-6) return null;
    const ld = G.pts.map(p => ({ F: -p.Fy, x: p.x - A.n.x })).concat(G.udl.map(u => ({ F: -u.Fy, x: u.xc - A.n.x })));
    let sF = 0, sM = 0, left = 0;
    for (const t of ld) { sF += t.F; sM += t.F * t.x; if (t.x < xg - E9) left += t.F * (xg - t.x); }
    const Av = sF - sM / l, M0 = Av * xg - left, H = M0 / f;
    const ws = G.udl.length ? -G.udl[0].wy : 0, w = Math.abs(ws), ps = ws < 0 ? MN : '';
    const cover = G.udl.reduce((s, u) => s + (u.x2 - u.x1), 0);
    const std = !G.pts.length && !G.tri && G.udl.every(u => Math.abs(-u.wy - ws) < E9) && Math.abs(cover - l) < E9 && Math.abs(xg - l / 2) < E9;
    const M0_ = V('M', '0,' + g.lbl), lA = A.n.lbl, fx = RX(lA);
    const rows = std ? [
      row(`${M0_} = ${ps}${fr(w_ + D + p2(l_), '8')}`, sub(() => `${ps}${X1(w)} ${D} ${X2(l)}² / 8`), M0, 'kNm'),
      row(`${fx} = ${fr(M0_, f_)} = ${ps}${fr(w_ + D + p2(l_), '8' + D + f_)}`, sub(() => `${ps}${X1(w)} ${D} ${X2(l)}² / (8 ${D} ${X2(f)})`), H, 'kN', sol.reactions[A.i].Rx),
    ] : [
      row(`${M0_} = ${RZ(lA)}${D}${V('x', g.lbl)} ${MN} Σ ${P}${D}${V('e')}`, null, M0, 'kNm'),
      row(`${fx} = ${fr(M0_, f_)}`, null, H, 'kN', sol.reactions[A.i].Rx),
    ];
    const col = sol.mem.find(M => (M.n1 === A.i || M.n2 === A.i) && Math.abs(M.c) < E9 && !M.ll.pts.length && !S.hasQ(M));
    if (col) {
      const up = col.n1 === A.i, tn = model.nodes[up ? col.n2 : col.n1];
      rows.push(row(`${V('M', tn.lbl)} = ${MN}${fx}${D}${h_}`, sub(() => `${H < 0 ? '' : MN}${X1(Math.abs(H))} ${D} ${X2(col.L)}`), -H * col.L, 'kNm', inside(col, S.forcesAt(col, up ? col.L : 0, up ? -1 : 1).M)));
    }
    const tail = `f = height of ${g.lbl} above the supports${col ? ', h = height of the column' : ''}. No moment passes the hinge, so ${fx}${D}f = ${M0_}. The other base pushes back with the same force.`;
    return [{ title: 'Three-hinged frame', dim: [vd(A.n.y, g.y, 'f')], rows, note: std
      ? `${M0_} = moment at ${g.lbl} of a simple beam with the same span and load; l = distance ${lA} to ${B.n.lbl}, ${tail}` + (ws < 0 ? ` The load acts upward: ${w_} is its size, and the forces, moments and deflections have the opposite sign.` : '')
      : `${M0_} = moment at ${g.lbl} of a simple beam with the same loads: ${RZ(lA)} times its distance ${V('x', g.lbl)} to ${g.lbl}, minus every load left of ${g.lbl} times its distance e to ${g.lbl}; ${tail}` + upNote(G) + (G.tri ? resNote(G) : '') }];
  }

  /* one fixed support, no other support: reactions straight from the loads */
  function treeCard(model, sol, G) {
    const sup = model.nodes.map((n, i) => ({ n, i })).filter(o => o.n.sup !== 'free');
    if (sup.length !== 1 || sup[0].n.sup !== 'fixed' || sol.det.n !== 0) return null;
    const A = sup[0], lA = A.n.lbl, R = sol.reactions[A.i], tm = [];
    let sx = 0, sy = 0, sm = 0;
    const add = (Fx, Fy, x, y, txt, mag) => { const m = -((x - A.n.x) * Fy - (y - A.n.y) * Fx); sx += Fx; sy += Fy; sm += m; tm.push({ txt, e: m / mag }); };
    for (const p of G.pts) add(p.Fx, p.Fy, p.x, p.y, () => X1(p.P), p.P);
    for (const u of G.udl) add(u.Fx, u.Fy, u.xc, u.yc, () => res(u), u.W);
    if (!tm.length) return null;
    const rows = [];
    if (Math.abs(sy) > E9) rows.push(row(`${RZ(lA)} = Σ ${V('P', 'z')}`, null, -sy, 'kN', R.Ry));
    if (Math.abs(sx) > E9) rows.push(row(`${RX(lA)} = ${MN}Σ ${V('P', 'x')}`, null, -sx, 'kN', R.Rx));
    const MR = V('M', lA + 'y');
    rows.push(row(`${MR} = Σ ${P}${D}${V('e')}`, tm.length <= 3 ? sub(() => tm.map((t, i) => (t.e < 0 ? (i ? ` ${MN} ` : MN) : (i ? ' + ' : '')) + `${t.txt()} ${D} ${X2(Math.abs(t.e))}`).join('')) : null, sm, 'kNm', R.Mz));
    return [{ title: 'Cantilever frame, statics', note: `${V('P', 'x')} and ${V('P', 'z')} are the parts of a load to the right and downward, e its lever arm about ${lA}. ${MR} is the fixing moment of the support about the y axis, the curved arrow at ${lA}; it counts positive counter-clockwise. The moment line starts at ${lA} with the same size.` + (G.tri ? resNote(G) : ''), rows }];
  }

  /* The cut of the method of sections, from the three bars it goes through (model.cut: top, diag, bot) and the places of
     their joints as they are now: xa to xb the panel, h the distance of the chords, xT the joint of the bottom chord
     where the diagonal ends (the moments about it give the top chord), xB that of the top chord (for the bottom chord).
     None where the panel is no longer two level chords with one diagonal between them. */
  function cutOf(model) {
    const q = model.cut;
    if (!q) return null;
    const N = i => model.nodes[i], t = model.members[q.top], d = model.members[q.diag], b = model.members[q.bot];
    if (!t || !d || !b || Math.abs(N(t.n1).y - N(t.n2).y) > E9 || Math.abs(N(b.n1).y - N(b.n2).y) > E9) return null;
    const onT = [d.n1, d.n2].find(i => i === t.n1 || i === t.n2), onB = [d.n1, d.n2].find(i => i === b.n1 || i === b.n2);
    if (onT === undefined || onB === undefined || onT === onB) return null;
    const xa = Math.min(N(b.n1).x, N(b.n2).x), xb = Math.max(N(b.n1).x, N(b.n2).x), h = N(t.n1).y - N(b.n1).y;
    if (h < E9 || Math.abs(Math.min(N(t.n1).x, N(t.n2).x) - xa) > E9 || Math.abs(Math.max(N(t.n1).x, N(t.n2).x) - xb) > E9) return null;
    if (Math.abs(N(onT).x - xa) > E9 || Math.abs(N(onB).x - xb) > E9) return null;   /* the diagonal falls to the right: the sign of its formula */
    return { top: q.top, diag: q.diag, bot: q.bot, xa, xb, h, xT: N(onB).x, xB: N(onT).x };
  }
  function trussCard(model, sol, G) {
    const c = cutOf(model);
    if (!c || G.udl.length || !G.vertical || !G.pts.length) return null;
    if (G.pts.some(p => p.a > 1e-6 && p.a < p.L - 1e-6)) return null;
    const sup = model.nodes.map((n, i) => ({ n, i })).filter(o => o.n.sup !== 'free');
    if (sup.length !== 2 || sup.map(o => o.n.sup).sort().join() !== 'pin,roller') return null;   /* no horizontal thrust */
    sup.sort((p, q) => p.n.x - q.n.x);
    const xA = sup[0].n.x, l = sup[1].n.x - xA, ld = G.pts.map(p => ({ F: -p.Fy, x: p.x }));
    const Av = ld.reduce((s, t) => s + t.F * (sup[1].n.x - t.x), 0) / l;
    const M0 = x => Av * (x - xA) - ld.reduce((s, t) => s + (t.x < x - E9 ? t.F * (x - t.x) : 0), 0);
    const V0 = Av - ld.reduce((s, t) => s + (t.x <= c.xa + E9 ? t.F : 0), 0);
    const dg = sol.mem[c.diag], sin = c.h / dg.L, deg = Math.asin(sin) * 180 / Math.PI;
    const N = i => S.forcesAt(sol.mem[i], sol.mem[i].L / 2, -1).N, M0_ = V('M', '0'), V0_ = V('V', '0');
    /* each chord force needs the simple-beam moment at its own end of the panel */
    const end = x => (Math.abs(x - c.xa) < E9 ? 'left' : 'right'), Mt = V('M', '0,' + end(c.xT)), Mb = V('M', '0,' + end(c.xB));
    return [{ title: 'Method of sections', cut: c, dim: [vd(sup[0].n.y, sup[0].n.y + c.h, 'h')], note: `Cut through the marked panel. ${M0_} and ${V0_}: moment and shear of a simple beam with the same loads; left and right are the two ends of the panel, α is the slope of the diagonal. Each chord force follows from moments about the joint where the other two cut bars meet.`, rows: [
      row(`${V('N', 'top')} = ${MN}${fr(Mt, h_)}`, sub(() => `${MN}${par(M0(c.xT))} / ${X2(c.h)}`), -M0(c.xT) / c.h, 'kN', N(c.top)),
      row(`${V('N', 'bottom')} = ${fr(Mb, h_)}`, sub(() => `${X1(M0(c.xB))} / ${X2(c.h)}`), M0(c.xB) / c.h, 'kN', N(c.bot)),
      row(`${V('N', 'diagonal')} = ${fr(V0_, 'sin α')}`, sub(() => `${X1(V0)} / sin ${X1(deg)}°`), V0 / sin, 'kN', N(c.diag)),
    ] }];
  }

  function hand(model, sol) {
    if (!sol || !sol.ok) return [];
    const G = gather(model);
    const cards = beamCards(model, sol, G) || portalCard(model, sol, G) || threeHinge(model, sol, G) || treeCard(model, sol, G) || trussCard(model, sol, G) || [];
    const c0 = cards.find(c => c.rows.some(r => r.f.includes('<i>F</i>')));
    if (c0) c0.note = `${V('F')} = support reaction, the orange arrow.` + (c0.note ? ' ' + c0.note : '');
    return cards;
  }

  /* how the moment line of one member is built from its end moments and its own load */
  function insight(sol, mi) {
    const M = sol.mem[mi], L = M.L, F = x => S.forcesAt(M, x, x <= 0 ? 1 : -1);
    const M1 = F(0).M, M2 = F(L).M, q1 = -M.ll.q1y, q2 = -M.ll.q2y, a1 = Math.abs(q1), a2 = Math.abs(q2);
    const pts = M.ll.pts.filter(p => Math.abs(p.py) > E9 && p.a > E9 && p.a < L - E9), hasQ = a1 > E9 || a2 > E9, uni = Math.abs(q1 - q2) < E9, tri = !uni && (a1 < E9 || a2 < E9);
    const m1 = V('M', '1'), m2 = V('M', '2'), m0 = V('M', '0'), qa_ = V('q', '1'), qb_ = V('q', '2');
    if (!pts.length && !hasQ) {
      const Vc = F(L / 2).V;
      const along = Math.abs(M.ll.q1x) > E9 || Math.abs(M.ll.q2x) > E9 || M.ll.pts.some(p => Math.abs(p.px) > E9 && p.a > E9 && p.a < L - E9);
      return { kind: 'none', text: along ? 'No load across the member: V constant, M a straight line. The load along the member changes N only.' : 'No load on the member: V constant, M a straight line.', M1, M2, rows: [
        row(`${m2} = ${m1} + ${V('V')}${D}${L_}`, null, M1 + Vc * L, 'kNm', M2)] };
    }
    if (!pts.length) {
      /* the midspan moment of a simple beam: q·L²/8, and (q1 + q2)·L²/16 for a load that runs in a straight line */
      const up = q1 + q2 < 0, m0v = (a1 + a2) * L * L / 16, m0s = up ? -m0v : m0v, lead = up ? MN : '';
      const f0 = uni ? fr(w_ + D + p2(L_), '8') : tri ? fr(w_ + D + p2(L_), '16') : fr(`(${qa_} + ${qb_})${D}${p2(L_)}`, '16');
      const s0 = () => (uni ? `${X1(a1)} ${D} ${X2(L)}² / 8` : tri ? `${X1(Math.max(a1, a2))} ${D} ${X2(L)}² / 16` : `(${X1(a1)} + ${X1(a2)}) ${D} ${X2(L)}² / 16`);
      const text = (uni ? 'Uniform load: a parabola hung from the end moments.' : `${tri ? 'Triangular load' : 'Load that runs from one value to another'}: a cubic curve hung from the end moments.`)
        + ` ${m0} is the midspan moment of a simple beam with this load.` + (up ? ` It is negative: the load acts ${Math.abs(M.s) < E9 ? 'upward' : 'away from the dashed side'}.` : '');
      return { kind: uni ? 'udl' : 'tri', qdef: uni ? 'uni' : tri ? 'tri' : 'ends', across: Math.abs(M.ll.q1x) > E9 || Math.abs(M.ll.q2x) > E9, text, M1, M2, rows: [
        row(`${m0} = ${lead}${f0}`, sub(() => lead + s0()), m0s, 'kNm'),
        row(`${V('M', 'mid')} = ${fr(`${m1} + ${m2}`, '2')} + ${m0}`, sub(() => `(${X1(M1)} ${plus(M2)}) / 2 ${plus(m0s)}`), (M1 + M2) / 2 + m0s, 'kNm', F(L / 2).M)] };
    }
    if (pts.length === 1 && !hasQ) {
      const a = pts[0].a, b = L - a, Pz = -pts[0].py;
      return { kind: 'point', ab: true, text: `Point load: a triangle hung from the end moments. ${m0} is the moment under the load of a simple beam.` + (Pz < 0 ? ` It is negative: the load acts ${Math.abs(M.s) < E9 ? 'upward' : 'away from the dashed side'}.` : '') + (Math.abs(pts[0].px) > E9 ? ' Here P is the part of the load across the member.' : ''), M1, M2, rows: [
        row(`${m0} = ${Pz < 0 ? MN : ''}${fr(P + D + a_ + D + b_, L_)}`, sub(() => `${Pz < 0 ? MN : ''}${X1(Math.abs(Pz))} ${D} ${X2(a)} ${D} ${X2(b)} / ${X2(L)}`), Pz * a * b / L, 'kNm'),
        row(`${V('M', 'P')} = ${m1} + (${m2} ${MN} ${m1})${D}${fr(a_, L_)} + ${m0}`, null, M1 + (M2 - M1) * a / L + Pz * a * b / L, 'kNm', F(a).M)] };
    }
    return { kind: 'mixed', text: 'Several loads: the end moments give the closing line; add the simple-beam moment of each load.', M1, M2, rows: [] };
  }

  /* how the shear line of one member follows from its loads, and its moment line from the shear */
  function shear(model, sol, mi) {
    const M = sol.mem[mi], L = M.L, F = x => S.forcesAt(M, x, x <= 0 ? 1 : -1);
    const V1 = F(0).V, V2 = F(L).V, M1 = F(0).M, M2 = F(L).M, q1 = -M.ll.q1y, q2 = -M.ll.q2y, qm = (q1 + q2) / 2, a1 = Math.abs(q1), a2 = Math.abs(q2), qh = Math.max(a1, a2);
    const pts = M.ll.pts.filter(p => Math.abs(p.py) > E9 && p.a > E9 && p.a < L - E9), hasQ = a1 > E9 || a2 > E9, uni = Math.abs(q1 - q2) < E9, tri = !uni && (a1 < E9 || a2 < E9), sP = pts.reduce((t, p) => t - p.py, 0);
    const v1 = V('V', '1'), v2 = V('V', '2'), m1 = V('M', '1'), m2 = V('M', '2'), qa_ = V('q', '1'), qb_ = V('q', '2'), x0_ = V('x', '0'), sg = t => (t < 0 ? '+' : MN), rows = [];
    let text, x0 = 0, ab = false, turn = null;
    /* what the moment does where the shear is zero: the shear before that place and the moment there. The page calls it a
       peak or a low point by the rule of the marks on the sheet (review 10, C116: a low point was called a peak) */
    const turnAt = xr => ({ V: S.forcesAt(M, xr / 2, -1).V, M: F(xr).M });
    if (!pts.length && !hasQ) {
      text = 'No load across the member: V is constant. It is the slope of the moment line.';
      rows.push(row(`${V('V')} = ${fr(`${m2} ${MN} ${m1}`, L_)}`, sub(() => `(${X1(M2)} ${minus(M1)}) / ${X2(L)}`), (M2 - M1) / L, 'kN', F(L / 2).V));
    } else {
      const many = pts.length > 1, way = qm < 0 ? 'rises' : 'falls', area = ' The moment changes by the area under V';
      text = !pts.length ? (uni ? `Uniform load: V ${way} by q on every metre, a straight line.${area}.`
        : `${tri ? 'Triangular load' : 'Load that runs from one value to another'}: on every metre V ${way} by the load there. The line is a parabola, ${tri ? 'flat where the load is zero' : 'steepest where the load is highest'}.${area}.`)
        : hasQ ? `V ${way} by ${uni ? 'q' : 'the load'} on every metre and steps by P at a point load.${area}.`
          : many ? `Point loads: V steps by P at each load and is constant between them.${area}.` : `Point load: V steps by P at the load and is constant on both sides.${area}: one rectangle on each side.`;
      if (pts.some(p => Math.abs(p.px) > E9)) text += pts.length === 1 ? ` Here P is the part of the load across the member: ${X1(Math.abs(pts[0].py))} kN.` : ' Here P is the part of a load across the member.';
      /* loads at one place act together: the step there is their sum, and none where they cancel (review 11, C114) */
      if (pts.some((p, i) => pts.some((r, j) => j > i && Math.abs(p.a - r.a) < E9))) text += ' Loads at one place count together: V steps by their sum there, and not at all where they cancel.';
      /* the whole distributed load on the member: q·L, q·L/2 for a triangle, the mean value times L otherwise */
      const qF = uni ? `${w_}${D}${L_}` : tri ? fr(w_ + D + L_, '2') : `${fr(`${qa_} + ${qb_}`, '2')}${D}${L_}`;
      const qS = () => (uni ? `${X1(a1)} ${D} ${X2(L)}` : tri ? `${X1(qh)} ${D} ${X2(L)} / 2` : `(${X1(a1)} + ${X1(a2)}) / 2 ${D} ${X2(L)}`);
      /* point loads that act both ways: P is a size, so each load enters with the sign of its direction */
      const mixed = pts.some(p => p.py > E9) && pts.some(p => p.py < -E9), ord = pts.slice().sort((x, y) => x.a - y.a), few = ord.length <= 4;
      const pF = !pts.length ? '' : !mixed ? ` ${sg(sP)} ${many ? 'Σ ' : ''}${P}` : few ? ord.map((p, i) => ` ${p.py > 0 ? '+' : MN} ${V('P', String(i + 1))}`).join('') : ` ${MN} Σ ${P}`;
      const pS = () => { if (!pts.length) return ''; if (!mixed) return ` ${sg(sP)} ${X1(Math.abs(sP))}`; if (!few) { exact = false; return ''; } return ord.map(p => ` ${p.py > 0 ? '+' : MN} ${X1(Math.abs(p.py))}`).join(''); };
      if (mixed) text += few ? ' The loads act both ways: each enters with the sign of its direction, in their order along the member.' : ' The loads act both ways: in Σ P a load that acts the other way counts negative.';
      rows.push(row(`${v2} = ${v1}${hasQ ? ` ${sg(qm)} ${qF}` : ''}${pF}`,
        sub(() => `${X1(V1)}${hasQ ? ` ${sg(qm)} ${qS()}` : ''}${pS()}`), V1 - qm * L - sP, 'kN', V2));
      const zr = pts.length ? [] : S.vZeros(M, 0, L);
      if (!pts.length && uni && zr.length === 1) {
        /* uniform load with V = 0 inside: the triangle of V up to that point gives the moment there */
        const xr = zr[0], xh = V1 / q1;
        rows.push(row(`${x0_} = ${fr(V1 < 0 ? `|${v1}|` : v1, w_)}`, sub(() => `${X1(Math.abs(V1))} / ${X1(a1)}`), xh, 'm', xr, { dec: 2 }));
        rows.push(row(`${V('M')}(${x0_}) = ${m1} + ${fr(`${v1}${D}${x0_}`, '2')}`, sub(() => `${X1(M1)} ${plus(V1)} ${D} ${X2(xh)} / 2`), M1 + V1 * xh / 2, 'kNm', F(xr).M));
        x0 = 1; turn = turnAt(xr);
      } else if (!pts.length && tri && zr.length === 1) {
        /* triangle with V = 0 inside. Measured from the zero end of the load, V = Vz ∓ q·x²/(2L); up to the zero of V
           the area under this parabola is two thirds of Vz·x0 */
        const z = a1 < E9 ? 1 : 2, Vz = z === 1 ? V1 : V2, Mz = z === 1 ? M1 : M2, vz = z === 1 ? v1 : v2, xr = zr[0], xh = Math.sqrt(2 * Math.abs(Vz) * L / qh);
        rows.push(row(`${x0_} = √<span class="rt">2${D}${Vz < 0 ? `|${vz}|` : vz}${D}${L_} / ${w_}</span>`, sub(() => `√(2 ${D} ${X1(Math.abs(Vz))} ${D} ${X2(L)} / ${X1(qh)})`), xh, 'm', z === 1 ? xr : L - xr, { dec: 2 }));
        rows.push(row(`${V('M')}(${x0_}) = ${z === 1 ? m1 : m2} ${z === 1 ? '+' : MN} ${fr('2', '3')}${D}${vz}${D}${x0_}`, sub(() => `${X1(Mz)} ${z === 1 ? plus(Vz) : minus(Vz)} ${D} 2 / 3 ${D} ${X2(xh)}`), Mz + (z === 1 ? 1 : -1) * 2 / 3 * Vz * xh, 'kNm', F(xr).M));
        x0 = z; turn = turnAt(xr);
      } else if (!pts.length && uni) {
        rows.push(row(`${m2} = ${m1} + ${fr(`${v1} + ${v2}`, '2')}${D}${L_}`, sub(() => `${X1(M1)} + (${X1(V1)} ${plus(V2)}) / 2 ${D} ${X2(L)}`), M1 + (V1 + V2) / 2 * L, 'kNm', M2));
      } else if (!pts.length) {
        /* the area under a parabolic V over the whole member */
        const qF2 = tri ? fr(w_ + D + p2(L_), a1 < E9 ? '6' : '3') : fr(`(2${D}${qa_} + ${qb_})${D}${p2(L_)}`, '6');
        const qS2 = () => (tri ? `${X1(qh)} ${D} ${X2(L)}² / ${a1 < E9 ? 6 : 3}` : `(2 ${D} ${X1(a1)} + ${X1(a2)}) ${D} ${X2(L)}² / 6`);
        rows.push(row(`${m2} = ${m1} + ${v1}${D}${L_} ${sg(qm)} ${qF2}`, sub(() => `${X1(M1)} ${plus(V1)} ${D} ${X2(L)} ${sg(qm)} ${qS2()}`), M1 + V1 * L - (2 * q1 + q2) * L * L / 6, 'kNm', M2));
      } else if (!many && !hasQ) {
        const a = pts[0].a, b = L - a, mp = V('M', 'P');
        rows.push(row(`${mp} = ${m1} + ${v1}${D}${a_}`, sub(() => `${X1(M1)} ${plus(V1)} ${D} ${X2(a)}`), M1 + V1 * a, 'kNm', F(a).M));
        rows.push(row(`${m2} = ${mp} + ${v2}${D}${b_}`, sub(() => `${X1(M1 + V1 * a)} ${plus(V2)} ${D} ${X2(b)}`), M1 + V1 * a + V2 * b, 'kNm', M2));
        ab = true;
      } else {
        const br = [0, ...pts.map(p => p.a), L];
        let ar = 0;
        for (let i = 0; i < br.length - 1; i++) { const a = br[i], b = br[i + 1]; ar += (b - a) * (S.forcesAt(M, a, 1).V + 4 * S.forcesAt(M, (a + b) / 2, -1).V + S.forcesAt(M, b, -1).V) / 6; }
        rows.push(row(`${m2} = ${m1} + area of ${V('V')}`, null, M1 + ar, 'kNm', M2));
      }
    }
    /* where the shear meets a support reaction: the equilibrium of the joint across the beam. With the reaction F and the
       load that stands on the joint itself (Pj, counted upward) the shear starts with V1 = F + Pj at the left end of a beam
       and ends with V2 = -(F + Pj) at its right end; over a support between two members it jumps by F + Pj. The sentence
       says "= the reaction" only where no load across the beam stands on the joint; with one, the load is named. Which
       of the two it is follows from the loads of the model, not from a comparison of numbers. The numbers only decide
       whether the sentence is said at all: the sum must close to a millionth. */
    const ties = [], R = sol.reactions, cnt = i => model.members.reduce((n, m) => n + (m.n1 === i) + (m.n2 === i), 0), near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    if (M.c > 1 - E9) {
      const a = model.nodes[M.n1], b = model.nodes[M.n2];
      /* the loads that stand on a joint, their part upward */
      const onJoint = ni => model.loads.reduce((t, ld) => {
        const q = model.members[ld.m], A = model.nodes[q.n1], B = model.nodes[q.n2], Lq = Math.hypot(B.x - A.x, B.y - A.y), at = Math.min(Math.max(ld.a, 0), Lq);
        const fy = ld.P * Math.sin(ld.ang * Math.PI / 180);
        return t + ((at < 1e-9 && q.n1 === ni) || (at > Lq - 1e-9 && q.n2 === ni) ? (Math.abs(fy) < 1e-9 * ld.P ? 0 : fy) : 0);
      }, 0);
      const withLoad = (lbl, Pj, flip) => `${flip ? MN : ''}${RZ(lbl)} ${(Pj < 0) !== flip ? MN : '+'} ${n1(Math.abs(Pj))} kN`;
      if (a.sup !== 'free' && a.lbl && cnt(M.n1) === 1) {
        const Pj = onJoint(M.n1);
        if (near(V1, R[M.n1].Ry + Pj)) ties.push(Pj ? `At ${a.lbl} the shear starts with the reaction and the load on ${a.lbl}: ${v1} = ${withLoad(a.lbl, Pj, false)}.` : `At ${a.lbl} the shear starts with the reaction: ${v1} = ${RZ(a.lbl)}.`);
      }
      if (a.sup !== 'free' && a.lbl && cnt(M.n1) === 2) {
        const pm = sol.mem.find(Q => Q !== M && Q.n2 === M.n1 && Q.c > 1 - E9), j = pm ? V1 - S.forcesAt(pm, pm.L, -1).V : NaN, Pj = onJoint(M.n1);
        if (pm && near(j, R[M.n1].Ry + Pj)) ties.push(Pj ? `At ${a.lbl} the shear jumps by the reaction and the load on ${a.lbl}: ${withLoad(a.lbl, Pj, false)} = ${n1(j)} kN.` : `At ${a.lbl} the shear jumps by the reaction ${RZ(a.lbl)} = ${n1(j)} kN.`);
      }
      if (b.sup !== 'free' && b.lbl && cnt(M.n2) === 1) {
        const Pj = onJoint(M.n2);
        if (near(V2, -R[M.n2].Ry - Pj)) ties.push(Pj ? `At ${b.lbl} it ends with the reaction and the load on ${b.lbl}: ${v2} = ${withLoad(b.lbl, Pj, true)}.` : `At ${b.lbl} it ends with the reaction: ${v2} = ${MN}${RZ(b.lbl)}.`);
      }
    }
    return { text, rows, V1, V2, x0, turn, ab, qdef: !hasQ ? '' : uni ? 'uni' : tri ? 'tri' : 'ends', across: Math.abs(M.ll.q1x) > E9 || Math.abs(M.ll.q2x) > E9, ties };
  }

  return { hand, equilibrium, insight, shear, gather, n1, n2, fix, lineValue };
})();
if (typeof module !== 'undefined') module.exports = CARDS;
