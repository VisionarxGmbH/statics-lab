"""The marks of the drawings against a scan of their own: peaks and corners of M where the shear changes sign,
stretches with V = 0, inflection points where M changes sign. Random loads on the ten beam examples (up to four point
loads, also 5 and 10 cm from the end of a member, upward and downward; uniform and triangular loads either way) and on the
five frames and the truss (loads in the four directions; there every member is a line of its own). In one state of
three the steps of the grid of the joints get other lengths (0.5 to 30 m, set as the page sets a typed length) and
members get a profile of their own.
The scan does not use the code of the page that finds the marks: it walks along the beam through forcesAt, keeps the
last sign that was clearly not zero, and finds a change by halving the interval. In a frame the scan walks along every
member, and on through a joint into the member that continues it in one line when the two are rigidly joined and the
moment is the same on both sides of the joint (a roof over a column that brings no moment). Expected is a mark at
- every place where V changes sign (inside a piece, at a point load, at a joint where the beam runs through) and at
  every stretch with V = 0, where the moment there prints other than 0.0;
- every place where M changes sign, where the moment prints other than 0.0 on both sides of it before it comes back
  to zero; none at a hinge and none across a stretch with M = 0.
A fixed support between two members takes a couple: the moment line steps there, and the scan starts a new line at it
whenever that couple is more than a rounding amount (no peak and no inflection point is said across the step, however
small the step). In one state of five of a beam with a support between two members, one such support is fixed for
that state; in a part of these states the loads are 0.1 to 2 kN, so that the couple is small.
Marks and expected places are matched one to one, each mark once: by the place (within 2 mm); a peak also by its kind,
which the scan works out from values alone (a corner where the shear clearly has opposite signs on the two sides of a
load or joint, a smooth turn where it changes sign inside a piece, and also at a load or joint where the shear does
not step: a load along the member, or a joint that brings no force across it; a peak where the size of M is larger than 1 mm to
either side, a low point where it is smaller) and by its moment (within a millionth of the largest moment); a stretch
with V = 0 by its member, its two ends and its moment. Where the scan cannot tell the kind (the shear beside the load
is a rounding amount, or the moment line crosses zero within that millimetre) either kind is accepted.
The comparison is tried on itself in every state: the marks of the page are made wrong in five ways, one at a time
(corner and smooth turn exchanged, peak and low point exchanged, every moment set to 999 999 kNm, one mark doubled,
one mark moved by 5 mm), and each must then differ from the scan.
usage: python3 marks.py [states per example] [seed]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
JS = """([pid, n, seed, beam]) => { const L = __lab, st = L.st, F = L.FS.forcesAt, n1 = L.n1; let sd = seed >>> 0;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }, pick = a => a[Math.floor(rnd() * a.length)];
  const out = { cases: 0, peaks: 0, flats: 0, infl: 0, most: 0, fixed: 0, built: 0, tiny: 0, varied: 0, along: 0, bad: [], through: 0, kinds: 0, lows: 0, ctl: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] };
  const sup0 = st.model.nodes.map(q => q.sup), xy0 = st.model.nodes.map(q => [q.x, q.y]);
  const LEN = [0.5, 0.8, 1, 1.6, 2.75, 3.5, 4.2, 6, 7.25, 9, 12.4, 18, 30];
  /* supports between two members of a beam: one of them is fixed in one state of five */
  const inner = beam ? st.model.nodes.map((q, i) => i).filter(i => (sup0[i] || 'free') !== 'free' && st.model.members.some(k => k.n1 === i) && st.model.members.some(k => k.n2 === i)) : [];
  for (let it = 0; it < n; it++) {
    const m = st.model;
    m.nodes.forEach((q, i) => { q.sup = sup0[i]; q.x = xy0[i][0]; q.y = xy0[i][1]; });
    m.members.forEach(k => { k.sec = null; }); m.loads = [];
    /* other lengths and profiles in one state of three (not in the built states of the two-span beam) */
    let vary = !(pid === 'two-span' && it < 36) && rnd() < 1 / 3;
    if (vary) { for (const ax of ['x', 'y']) for (let i = L.gridOf(m, ax).length - 2; i >= 0; i--) if (rnd() < 0.5) { const g = L.gridOf(m, ax); L.stretch(m, ax, g[i], g[i + 1], pick(LEN)); }
      m.members.forEach(k => { if (rnd() < 0.3) k.sec = Math.floor(rnd() * L.SECTIONS.length); }); }
    const len = mi => { const k = m.members[mi], a = m.nodes[k.n1], b = m.nodes[k.n2]; return Math.hypot(b.x - a.x, b.y - a.y); };
    let fx = -1; if (inner.length && rnd() < 0.2) { fx = pick(inner); m.nodes[fx].sup = 'fixed'; }
    const small = fx >= 0 && rnd() < 0.4;   /* small point loads and no distributed load: moments and couples near the rounding step */
    const dirs = beam ? [-90, -90, 90] : [-90, -90, 90, 0, 180], along = beam && rnd() < 0.25;   /* in one state of four of a beam a load along it stands where a uniform load has its zero of the shear, if there is one */
    m.members.forEach(k => { k.udl.on = !small && rnd() < (beam ? 0.5 : 0.35); k.udl.ang = pick(dirs); k.udl.w1 = pick([0, 5, 10, 10]); k.udl.w2 = pick([0, 5, 10, 10]); if (!k.udl.w1 && !k.udl.w2) k.udl.on = false; });
    const nl = Math.floor(rnd() * 5);
    for (let i = 0; i < nl; i++) { const mi = Math.floor(rnd() * m.members.length), Lm = len(mi);
      const a = rnd() < 0.25 ? pick([0.05, Lm - 0.05, 0.1, Lm - 0.1]) : Math.round(rnd() * Lm / 0.05) * 0.05;
      m.loads.push({ id: 100 + i, m: mi, a: Math.min(Math.max(Math.round(a * 100) / 100, 0), Lm), P: small ? pick([0.1, 0.5, 1, 2]) : pick([5, 10, 20, 49, 50, 50]), ang: pick(dirs) }); }
    /* the first 36 states of the two-span beam are built, not drawn: B fixed and loads that nearly balance about it, so that
       the couple of the support is small (0.04 kNm and more: some print 0.0, some do not). With A and C free the two
       spans are cantilevers from B; with A and C held the couple follows from the stiffness */
    if (pid === 'two-span' && it < 36) {
      const d = [0.01, 0.02, 0.03][it % 3], P = [1, 2, 5][Math.floor(it / 3) % 3], free = it % 2 === 0, turn = it >= 18 ? 90 : -90;
      fx = m.nodes.findIndex(q => q.lbl === 'B');
      m.nodes.forEach((q, i) => { q.sup = i === fx ? 'fixed' : free ? 'free' : sup0[i]; });
      m.members.forEach(k => { k.udl.on = false; });
      m.loads = [{ id: 1, m: 0, a: 0, P, ang: turn }, { id: 2, m: 0, a: 2.5 + d, P: 2 * P, ang: -turn }, { id: 3, m: 1, a: 2.5 - d, P: 2 * P, ang: turn }, { id: 4, m: 1, a: 5, P, ang: -turn }];
      out.built++;
    }
    L.resolve('instant');
    /* a load along the beam at a place where the shear is zero inside a member: it starts a piece there and makes no step
       of the shear, so the peak stays a smooth one (review 09, C78). The place is that of the mark of the page; the scan
       below finds the zero and its kind by itself */
    if (along && st.sol.ok) { const e = st.marks.ext.find(q => !q.flat && !q.jump && q.x > 0.05 && q.x < st.sol.mem[q.mi].L - 0.05); if (e) { m.loads.push({ id: 900, m: e.mi, a: e.x, P: pick([5, 20, 50]), ang: pick([0, 180]) }); L.resolve('instant'); if (st.sol.ok) out.along++; } }
    const s = st.sol; if (!s.ok) continue;
    /* varied: counted from what the state ends with, a joint at another place than in the example or a member with a profile other than that of the structure */
    const other = m.nodes.some((q, i) => Math.abs(q.x - xy0[i][0]) > 1e-9 || Math.abs(q.y - xy0[i][1]) > 1e-9) || m.members.some(k => k.sec !== null && k.sec !== undefined && k.sec !== st.sec);
    out.cases++; if (fx >= 0) out.fixed++; if (other) out.varied++;
    if (fx >= 0 && Math.abs(s.reactions[fx].Mz) > 1e-9 && n1(s.reactions[fx].Mz) === '0.0') out.tiny++;
    const top = k => Math.max(...s.mem.map(M => Math.max(...Array.from(M.smp[k], Math.abs)))), ownV = top('V'), ownM = top('M');
    /* the sign of a value: none where it is a rounding amount of the scan (1e-7 of the largest shear, 1e-6 of the largest
       moment, each in its own unit) and prints 0.0; a value that prints other than 0.0 always has its sign */
    const tv = 1e-7 * Math.max(1, ownV), tm = 1e-6 * ownM, sg = (v, t) => (Math.abs(v) <= t && n1(v) === '0.0' ? 0 : v > 0 ? 1 : -1);
    const exp = { peak: [], flat: [], infl: [] };
    const order = s.mem.map((M, i) => i); if (beam) order.sort((a, b) => s.mem[a].x1 - s.mem[b].x1);
    /* the lines the scan walks along. A beam: its members from left to right. A frame or a truss: every member, and on
       into the member that continues it in one line through a joint without a hinge, when neither end is hinged and
       the moment does not step there (no fixed support with a couple, no further member that brings a moment) */
    const lines = [];
    if (beam) lines.push(order);
    else {
      const nxt = new Map(), fol = new Set(), seen = new Set();
      m.nodes.forEach((nd, ni) => {
        if (nd.hinge || (nd.sup === 'fixed' && Math.abs(s.reactions[ni].Mz) > 1e-9 * Math.max(1, ownM))) return;
        m.members.forEach((qe, e) => { if (qe.n2 !== ni) return; m.members.forEach((qb, b) => { if (qb.n1 !== ni) return;
          const A = s.mem[e], B = s.mem[b];
          if (A.rel[1] || B.rel[0] || Math.abs(A.c * B.s - A.s * B.c) > 1e-9 || A.c * B.c + A.s * B.s < 0) return;
          if (sg(F(A, A.L, -1).M - F(B, 0, 1).M, tm)) return;
          nxt.set(e, b); fol.add(b); }); });
      });
      s.mem.forEach((M, i) => { if (fol.has(i) || seen.has(i)) return; const ln = []; for (let k = i; k !== undefined && !seen.has(k); k = nxt.get(k)) { seen.add(k); ln.push(k); } lines.push(ln); });
      s.mem.forEach((M, i) => { if (!seen.has(i)) { seen.add(i); lines.push([i]); } });
      out.through += lines.filter(ln => ln.length > 1).length;
    }
    /* the place of a point along its line, and the moment at a place of a line */
    const off = new Map(); lines.forEach((ln, li) => { let d = beam ? 0 : li * 1000; for (const mi of ln) { off.set(mi, beam ? s.mem[mi].x1 : d); d += s.mem[mi].L; } });
    const lineOf = mi => lines.find(ln => ln.includes(mi));
    const Mat = (mi, pos, side) => { const ln = lineOf(mi), a0 = off.get(ln[0]), end = off.get(ln[ln.length - 1]) + s.mem[ln[ln.length - 1]].L;
      if (pos < a0 - 1e-12 || pos > end + 1e-12) return null;
      let k = ln[0]; for (const q of ln) { const o = off.get(q); if (side < 0 ? pos > o + 1e-12 : pos >= o - 1e-12) k = q; }
      return F(s.mem[k], Math.min(Math.max(pos - off.get(k), 0), s.mem[k].L), side).M; };
    /* peak or low point, from values alone: the size of M at the place against the size 1 mm to either side. null: not told */
    const lowOf = (mi, x, Mv) => { const pos = off.get(mi) + x, l = Mat(mi, pos - 1e-3, -1), r = Mat(mi, pos + 1e-3, 1); if (l === null || r === null) return null;
      const a = Math.abs(Mv), d = 1e-12 * Math.max(1, ownM); return a > Math.abs(l) + d && a > Math.abs(r) + d && l * Mv > 0 && r * Mv > 0 ? false : a < Math.abs(l) - d && a < Math.abs(r) - d && l * Mv > 0 && r * Mv > 0 ? true : null; };
    let lv = null, lm = null, piece = 0, gap = false;   /* last clear sign of V and of M with its place; gap: a stretch with V = 0 lies between */
    let big = false, pend = null;                       /* has M printed other than 0.0 since its last change of sign; a change that waits for that on its far side */
    const raw = v => (v > 0 ? 1 : v < 0 ? -1 : 0), halve = (M, key, x0, x1, t) => { let lo = x0, hi = x1, sl = sg(F(M, x0, 1)[key], t); for (let q = 0; q < 70; q++) { const md = (lo + hi) / 2, sm = raw(F(M, md, -1)[key]); if (sm === 0 || sm !== sl) hi = md; else lo = md; } return (lo + hi) / 2; };
    lines.forEach(ln => ln.forEach((mi, oi) => { const M = s.mem[mi], prev = oi ? ln[oi - 1] : -1;
      if (!beam && !oi) { lv = null; gap = false; }     /* in a frame or a truss every line starts anew */
      if ((!beam && !oi) || (beam && m.nodes[m.members[mi].n1].hinge)) { lm = null; big = false; pend = null; }   /* no inflection point is said of a hinge: the line starts again */
      { const nd = m.nodes[m.members[mi].n1]; if (beam && oi && nd.sup === 'fixed' && Math.abs(s.reactions[m.members[mi].n1].Mz) > 1e-9 * Math.max(1, ownM)) { lv = null; gap = false; lm = null; big = false; pend = null; } }   /* the line steps by the couple of a fixed support, however small it is: a new line starts. Only a couple that is a rounding amount (a billionth of the largest moment) leaves the line whole */
      const br = [0, ...M.ll.pts.map(p => p.a).filter(a => a > 1e-9 && a < M.L - 1e-9).sort((a, b) => a - b), M.L].filter((x, i, a) => !i || x - a[i - 1] > 1e-9);
      let fl = null;   /* a stretch with V = 0 that runs over neighbouring pieces of the member is one stretch */
      for (let i = 0; i < br.length - 1; i++) { const a = br[i], b = br[i + 1], N = 233; piece++; let zero = true, mzero = true;
        /* where a change of sign falls on the start of this piece: the load point, or the joint as the end of the member before */
        const here = () => (i || prev < 0 ? [mi, a] : [prev, s.mem[prev].L]);
        for (let k = 0; k <= N; k++) { const x = k === N ? b : a + (b - a) * k / N, f = F(M, x, k ? -1 : 1), sv = sg(f.V, tv), sm = sg(f.M, tm);   /* the last place is the end of the piece itself, not a sum that can pass it by a rounding amount */
          if (sv) { zero = false;
            /* the kind of the turn: inside a piece a smooth one; at the start of a piece a corner when the shear right
               beside the load or joint clearly has the other sign already (k = 0), else not told */
            /* at the start of a piece: no step of the shear there (the values just before and just behind differ by no more than
               the rounding amount of the scan): a smooth turn; a clear other sign right behind it: a corner; else not told */
            if (lv && lv.s !== sv && !gap) { if (lv.piece === piece) { const xr = halve(M, 'V', lv.x, x, tv); exp.peak.push([mi, xr, F(M, xr, -1).M, xr - a > 1e-6 ? false : null]); } else { const h = here(), vb = i ? F(M, a, -1).V : prev >= 0 ? F(s.mem[prev], s.mem[prev].L, -1).V : null, flat = vb !== null && Math.abs(F(M, a, 1).V - vb) <= tv; exp.peak.push([h[0], h[1], F(M, a, 1).M, flat ? false : k === 0 ? true : null]); } }
            lv = { s: sv, x, piece }; gap = false; }
          if (sm) { mzero = false;
            if (lm && lm.s !== sm) { pend = big ? (lm.piece === piece ? [mi, halve(M, 'M', lm.x, x, tm)] : here()) : null; big = false; }
            lm = { s: sm, x, piece }; }
          if (n1(f.M) !== '0.0') { big = true; if (pend) { exp.infl.push(pend); pend = null; } } }
        if (zero) { gap = true; if (fl && Math.abs(fl[2] - a) < 1e-9) fl[2] = b; else { fl = [mi, a, b]; exp.flat.push(fl); } } else fl = null;
        if (mzero) { lm = null; big = false; pend = null; }   /* a stretch with M = 0: no inflection point is said across it */
      } }));
    for (const f of exp.flat) f.push(F(s.mem[f[0]], (f[1] + f[2]) / 2, -1).M);
    for (const pk of exp.peak) pk.push(lowOf(pk[0], pk[1], pk[2]));
    const near = (a, b) => Math.abs(a - b) < 2e-3, shown = v => n1(v) !== '0.0', tolM = 1e-6 * Math.max(1, ownM);
    /* the same place can be named from either side of a joint: places are compared along the line */
    const at = e => off.get(e.mi) + e.x, ax = p => off.get(p[0]) + p[1];
    const ep = exp.peak.filter(p => shown(p[2])), ef = exp.flat.filter(f => shown(f[3]));
    /* marks of the page against the expected ones, one to one: a list of what differs */
    const compare = got => {
      const d = [], gp = got.ext.filter(e => !e.flat), gf = got.ext.filter(e => e.flat), gi = got.infl, used = new Set();
      for (const p of ep) {
        const k = gp.findIndex((e, i) => !used.has(i) && near(at(e), ax(p)));
        if (k < 0) { d.push('peak not marked at x = ' + ax(p).toFixed(3) + ' m, M = ' + p[2].toFixed(3)); continue; }
        used.add(k); const e = gp[k];
        if (p[3] !== null && !!e.jump !== p[3]) d.push('kind of the turn at x = ' + ax(p).toFixed(3) + ' m: page ' + (e.jump ? 'corner' : 'smooth') + ', scan ' + (p[3] ? 'corner' : 'smooth'));
        if (p[4] !== null && !!e.low !== p[4]) d.push('peak or low point at x = ' + ax(p).toFixed(3) + ' m: page ' + (e.low ? 'low point' : 'peak') + ', scan ' + (p[4] ? 'low point' : 'peak'));
        if (!(Math.abs(e.v - p[2]) <= tolM)) d.push('moment of the mark at x = ' + ax(p).toFixed(3) + ' m: page ' + e.v + ', scan ' + p[2]);
      }
      gp.forEach((e, i) => { if (!used.has(i)) d.push('mark without a peak at x = ' + at(e).toFixed(3) + ' m'); });
      const uf = new Set();
      for (const f of ef) {
        const k = gf.findIndex((e, i) => !uf.has(i) && e.mi === f[0] && near(e.flat[0], f[1]) && near(e.flat[1], f[2]));
        if (k < 0) { d.push('stretch not marked from ' + f[1] + ' to ' + f[2] + ' m of member ' + f[0] + ', M = ' + f[3].toFixed(3)); continue; }
        uf.add(k);
        if (!(Math.abs(gf[k].v - f[3]) <= tolM)) d.push('moment of the stretch of member ' + f[0] + ': page ' + gf[k].v + ', scan ' + f[3]);
      }
      gf.forEach((e, i) => { if (!uf.has(i)) d.push('stretch mark without a stretch, ' + e.flat + ' of member ' + e.mi); });
      const ui = new Set();
      for (const p of exp.infl) {
        const k = gi.findIndex((e, i) => !ui.has(i) && near(at(e), ax(p)));
        if (k < 0) d.push('inflection point not marked at x = ' + ax(p).toFixed(3) + ' m'); else ui.add(k);
      }
      gi.forEach((e, i) => { if (!ui.has(i)) d.push('inflection mark without a change of sign at x = ' + at(e).toFixed(3) + ' m'); });
      return d;
    };
    const tag = () => JSON.stringify({ pid, fixed: fx, xy: vary ? m.nodes.map(q => [q.x, q.y]) : 0, sec: vary ? m.members.map(k => k.sec) : 0, loads: m.loads.map(l => [l.m, l.a, l.P, l.ang]), udl: m.members.map(k => (k.udl.on ? [k.udl.w1, k.udl.w2, k.udl.ang] : 0)) });
    const say = t => { if (out.bad.length < 12) out.bad.push(t + ' ' + tag()); else out.bad.length++; };
    const real = st.marks;
    out.peaks += ep.length; out.flats += ef.length; out.infl += exp.infl.length; out.most = Math.max(out.most, real.ext.length, real.infl.length);
    out.kinds += ep.filter(p => p[3] !== null).length; out.lows += ep.filter(p => p[4] !== null).length;
    for (const t of compare(real)) say(t);
    /* the comparison tried on itself: the marks of the page made wrong in five ways; each must then differ from the scan.
       [states where the change touches something the scan tells, states where the comparison then differs] */
    const copy = () => ({ ext: real.ext.map(e => ({ ...e })), infl: real.infl.map(e => ({ ...e })) });
    const ctl = (i, applies, change) => { if (!applies) return; out.ctl[i][0]++; const c = copy(); change(c); if (compare(c).length) out.ctl[i][1]++; else say('not noticed by the comparison: control ' + (i + 1)); };
    const first = c => c.ext.find(e => !e.flat) || c.infl[0];
    ctl(0, ep.some(p => p[3] !== null), c => { for (const e of c.ext) if (!e.flat) e.jump = !e.jump; });
    ctl(1, ep.some(p => p[4] !== null), c => { for (const e of c.ext) if (!e.flat) e.low = !e.low; });
    ctl(2, ep.length + ef.length > 0, c => { for (const e of c.ext) e.v = 999999; });
    ctl(3, real.ext.some(e => !e.flat) || real.infl.length > 0, c => { const e = first(c); (c.ext.includes(e) ? c.ext : c.infl).push({ ...e }); });
    ctl(4, real.ext.some(e => !e.flat) || real.infl.length > 0, c => { const e = first(c); e.x += e.x > 5e-3 ? -5e-3 : 5e-3; });
  }
  return out; }"""
tot = {'cases': 0, 'peaks': 0, 'flats': 0, 'infl': 0, 'fixed': 0, 'built': 0, 'tiny': 0, 'varied': 0, 'along': 0, 'through': 0, 'kinds': 0, 'lows': 0}; bad = []; nbad = 0; errs = []; most = 0; ctl = [[0, 0] for _ in range(5)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1500, 'height': 900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600)
    BEAMS = ['simple-p', 'simple-w', 'simple-2p', 'simple-t', 'cantilever', 'propped', 'fixed', 'overhang', 'two-span', 'gerber']
    for k, pid in enumerate(BEAMS + ['bent', 'portal-g', 'portal-s', 'three-hinge', 'two-bay', 'truss']):
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(250)
        r = pg.evaluate(JS, [pid, n, seed * 1000 + k, pid in BEAMS])
        for q in tot: tot[q] += r[q]
        most = max(most, r['most']); nbad += len(r['bad']); bad += [x for x in r['bad'] if x]
        for i in range(5): ctl[i][0] += r['ctl'][i][0]; ctl[i][1] += r['ctl'][i][1]
    b.close()
print(f"{tot['cases']} states of the 16 examples with random loads: {tot['peaks']} peaks and corners of M, {tot['flats']} stretches with V = 0 and {tot['infl']} inflection points expected; most marks of one kind in a state: {most}")
print(f"of these states, with a fixed support between two members of a beam: {tot['fixed']}; among them {tot['built']} built with loads that nearly balance about the support; the couple of the support is real and prints 0.0 in {tot['tiny']}")
print(f"of these states, with other lengths or profiles than the example starts with: {tot['varied']}")
print(f"of these states, with a load along a beam put on a zero of the shear, where the peak stays a smooth one: {tot['along']}")
print(f"matched one to one by place; of the {tot['peaks']} peaks the scan tells the kind of turn (corner or smooth) for {tot['kinds']} and peak or low point for {tot['lows']}, and each moment is compared; lines of a frame that run through a joint into the next member: {tot['through']}")
print('marks that differ from the scan:', nbad)
names = ['corner and smooth turn exchanged', 'peak and low point exchanged', 'every moment set to 999 999 kNm', 'one mark doubled', 'one mark moved by 5 mm']
print('the comparison tried on itself, states where the change is noticed of states where it touches a mark the scan tells: ' + '; '.join(f'{nm} {c[1]} of {c[0]}' for nm, c in zip(names, ctl)))
if any(c[0] == 0 or c[1] != c[0] for c in ctl): nbad += 1
for x in bad[:12]: print('  ' + x)
if errs: print('script errors: ' + '; '.join(errs[:3]))
sys.exit(1 if nbad or errs else 0)
