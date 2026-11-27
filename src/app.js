/* ---------- helpers and state ---------- */
const $ = (s, r = document) => r.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage'), learnEl = $('#learn'), pop = $('#pop'), hintEl = $('#hint'), magEl = $('#mag');
const n1 = CARDS.n1, n2 = CARDS.n2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
/* a value the page keeps (a typed size or place) is rounded once, half away from zero, with the same allowance for the binary
   arithmetic as a printed value (CARDS.fix): 1.005 typed is 1.01, though the machine holds it as 1.00499999999999989 */
const rnd = (v, d) => { const p = 10 ** d, t = Math.abs(v) * p, r = Math.floor(t + 0.5 + Math.max(1e-9, 4e-13 * t)) / p; return v < 0 ? -r : r; };
const r1 = v => rnd(v, 1), r2 = v => rnd(v, 2);
const UI = 'Geist, "Segoe UI", system-ui, sans-serif', MATH = '"STIX Two Text", Cambria, "Times New Roman", serif';
/* w: the deflection of a beam, across its axis. On a frame and a truss the last tab shows the displacement δ, how far a
   point moves in total; the deflection w of a member is the part of it across that member */
const UNIT = { M: 'kNm', V: 'kN', N: 'kN', D: 'mm' }, SYM = { M: 'M', V: 'V', N: 'N', D: 'w' };
const CHIP = { V: 'V′ = −q', M: 'M′ = V', D: 'EI·w″ = −M', N: '+ tension, − compression' };
/* the row of a relation under a line: its height, and the height a strip of a beam must keep for the sheet to have rows */
const ROWH = 24, ROWMIN = 50;
const SUP = ['fixed', 'pin', 'roller', 'free'], SUPNAME = { fixed: 'fixed', pin: 'pin', roller: 'roller', free: 'free' };
const HINT = 'Click a member: loads, length, profile. Drag a load; drag its tail to size and turn it. Click supports and joints to change them.';

const st = { pid: PRESETS[0].id, model: null, focus: 'M', sec: 2, vals: true, sol: null, prev: null, tw0: -1e9, grow0: 0, tf: 1, gf: 1, fid: 0,
  hover: null, sel: null, drag: null, down: null, mouse: null, undo: [], ext: null, tgt: null, zero: {}, pw: { V: 1, M: 1.9, D: 1, N: 0 },
  marks: { ext: [], infl: [] }, hand: [], imi: -1, dirty: true, cache: [], learn: '', ghost: null, theme: null, signs: true, secOpen: !matchMedia('(max-width:760px), (max-height:800px)').matches, secHTML: '' };
let W = 0, H = 0, dpr = 1, C = {}, VW = null, MG = [], HS = { loads: new Map(), udl: new Map(), rlab: [], dims: [] }, boxes = [], texts = [], LATE = [];
const preset = () => PRESETS.find(p => p.id === st.pid);
const rgba = (c, a) => { const m = c.match(/[\d.]+/g); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; };
/* a bar: neither end can carry a moment (FS.bars). In a beam no member is singled out */
const isBar = mi => !!(st.bars && st.bars[mi]);
/* a bar is drawn as a bar, with one value, only while nothing acts on it between its joints */
const barStyle = mi => { const M = st.sol.mem[mi]; return isBar(mi) && !FS.hasQ(M) && Math.abs(M.ll.q1x) < 1e-12 && Math.abs(M.ll.q2x) < 1e-12 && !M.ll.pts.some(p => p.a > 1e-9 && p.a < M.L - 1e-9); };
/* the profile a member has of its own; none: it has the section of the structure */
const ownSec = mb => (mb.sec === null || mb.sec === undefined ? null : SECTIONS[mb.sec]);
const memName = mi => { const m = st.model.members[mi], a = st.model.nodes[m.n1].lbl, b = st.model.nodes[m.n2].lbl; return a && b ? `Member ${a}–${b}` : (st.model.truss ? 'Bar' : 'Member'); };

/* ---------- lengths ---------- */
/* A length that can be typed is one step of the grid of the joints (gridOf, stretch: with the examples): the length of a
   member that lies along x or y, or a dimension of the drawing between two joints. */
const LMIN = 0.5, LMAX = 30;
const lenAxis = (mi, m = st.model) => lenAxisOf(m, mi);

function readColors() {
  const p = document.createElement('i');
  p.style.display = 'none'; document.body.appendChild(p);
  for (const k of ['bg', 'panel', 'ink', 'mute', 'line', 'grid', 'grid2', 'load', 'cM', 'cV', 'cT', 'cC', 'ok', 'bad']) { p.style.color = `var(--${k})`; C[k] = getComputedStyle(p).color; }
  p.remove(); st.dirty = true;
}

/* ---------- model, solve, scales ---------- */
function resolve(mode) {
  const m = st.model, s = SECTIONS[st.sec], now = performance.now(), sol = FS.analyse(applySections(m, st.sec), sectionEI(s), sectionEA(s));
  st.prev = mode === 'tween' && st.sol && st.sol.ok && sol.ok && st.sol.mem.length === sol.mem.length ? st.sol : null;
  if (st.prev) st.tw0 = now;
  if (mode === 'grow' || (mode === 'tween' && sol.ok && st.sol && !st.sol.ok)) st.grow0 = now;
  st.sol = sol; st.cache = []; st.bars = FS.bars(m);
  /* a kept state belongs to the lengths it was kept with: its lines would not lie on members of another length */
  if (st.ghost && st.ghost.mem.some((G, i) => Math.abs(G.L - memLen(m, i)) > 1e-9)) { st.ghost = null; $('#cmp').setAttribute('aria-pressed', false); hintEl.textContent = 'Compare is off: the kept state belongs to the lengths it was kept with.'; }
  targets();
  if (mode === 'grow' || !st.ext) st.ext = nominal();
  st.hand = sol.ok ? CARDS.hand(m, sol) : [];
  showEI(); renderLearn(); renderSec(); st.dirty = true;
}

function targets() {
  const s = st.sol, t = { M: [0, 0], V: [0, 0], N: [0, 0], W: [0, 0], D: 0 }, marks = { ext: [], infl: [] };
  if (s.ok) {
    for (const M of s.mem) {
      const S = M.smp;
      for (let i = 0; i < S.xs.length; i++) {
        for (const k of ['M', 'V', 'N']) { const v = S[k][i]; if (v < t[k][0]) t[k][0] = v; if (v > t[k][1]) t[k][1] = v; }
        const w = -S.dY[i]; if (w < t.W[0]) t.W[0] = w; if (w > t.W[1]) t.W[1] = w;
      }
    }
    t.D = s.max.D;
    const own = { M: Math.max(-t.M[0], t.M[1]), V: Math.max(-t.V[0], t.V[1]), N: Math.max(-t.N[0], t.N[1]) };
    if (st.ghost) {   /* the kept state must fit on the sheet too */
      for (const M of st.ghost.mem) { const S = M.smp; for (let i = 0; i < S.xs.length; i++) { for (const k of ['M', 'V', 'N']) { const v = S[k][i]; if (v < t[k][0]) t[k][0] = v; if (v > t[k][1]) t[k][1] = v; } const w = -S.dY[i]; if (w < t.W[0]) t.W[0] = w; if (w > t.W[1]) t.W[1] = w; } }
      t.D = Math.max(t.D, st.ghost.max.D);
    }
    /* zero: the line of the present state is zero everywhere (its numbers, marks and notes). Each line is judged in its
       own units and against what the analysis can tell from zero (FS lines: nilF, nilM, nilD): a floor, a hundred times
       the amount the analysis states for that kind of value (FS.analyse, err), and the last digits of the arithmetic,
       1e-10 of the largest value of its kind. Only where the rigid limit was taken in three steps (FS.stepsLimit, the
       fallback) a displacement also has 1e-9 of the shortening that the stiffest of the three solutions alone would
       have left in the rigid members. A line with a value that prints other than 0.0
       is never zero. flat: nothing of that kind is to be drawn at all, the kept state of "Compare" included */
    let art = 0;
    for (const M of s.mem) if (M.EAr) { let nm = 0; for (const v of M.smp.N) nm = Math.max(nm, Math.abs(v)); art += nm * M.L / M.EAr; }
    const nil = { V: s.nilF, N: s.nilF, M: s.nilM, W: s.nilD + 1e-9 * art };
    st.zero = {};
    for (const k of ['M', 'V', 'N']) st.zero[k] = own[k] <= nil[k] && n1(own[k]) === '0.0';
    /* a rotation that prints other than 0.0 mrad is a value of the deflection line: the line is then not zero (review 09, C102) */
    let rotMax = 0; for (const M of s.mem) for (const v of M.smp.rot) rotMax = Math.max(rotMax, Math.abs(v));
    st.zero.W = st.zero.D = s.max.D <= nil.W && n1(s.max.D * 1000) === '0.0' && n1(rotMax * 1000) === '0.0';
    s.zeroQ = { ...st.zero };
    const gz = st.ghost ? st.ghost.zeroQ || {} : null;
    st.flat = {};
    for (const k of ['M', 'V', 'N', 'W', 'D']) st.flat[k] = st.zero[k] && (!gz || gz[k] !== false);
    for (const k of ['M', 'V', 'N']) if (st.flat[k]) t[k] = [0, 0];
    if (!st.zero.M) {
      /* The marks are read from the lines themselves, piece by piece between the point loads, not from the samples.
         Members that follow one another in one line through a joint without a hinge are read as one line (a beam over
         several spans, a roof over a column that brings no moment into it). Inside a piece V is a parabola at most: its zeros are known (FS.vZeros). Between two of them the
         moment runs one way, so it changes sign at most once there: that place is found by halving.
         - V changes sign, inside a piece, across a point load or across a joint: the moment line turns there. From plus to
           minus M is largest, from minus to plus smallest; where that is the smaller size of M (a dip between two peaks of
           the same sign) the mark says low point, not peak. Marked when the moment there prints other than 0.0.
         - a piece with V = 0 throughout: a stretch of constant M, marked as a stretch; no peak is said across it.
         - M changes sign: inflection point, marked when the moment prints other than 0.0 on both sides of it before it
           comes back to zero. None is said across a stretch with M = 0, and none at a hinge. */
      /* the sign of a value: none where the analysis cannot tell it from zero (nil); a value that prints other than 0.0 always has its sign */
      const tv = nil.V, tm = nil.M, shown = v => n1(v) !== '0.0', sgn = (v, t) => (Math.abs(v) <= t && !shown(v) ? 0 : v > 0 ? 1 : -1);
      const next = new Map(), follows = new Set();
      st.model.nodes.forEach((nd, ni) => {
        if (nd.hinge) return;   /* at a hinge M = 0 and the two parts turn freely: the line ends there */
        if ((nd.sup || 'free') === 'fixed' && sgn(s.reactions[ni].Mz, tm)) return;   /* a fixed support that takes a couple: the moment line steps there by that couple, and the two sides are two lines, however small the couple (a change of sign across a step is no inflection point). Only where the analysis cannot tell the couple from zero the line runs through as over a roller */
        const at = [];
        st.model.members.forEach((q, i) => { if (q.n1 === ni) at.push([i, 0]); if (q.n2 === ni) at.push([i, 1]); });
        /* a member that ends here and one that starts here, rigid and in one line, are one line. Where further members meet
           them at the joint (a column under a roof), the line runs on only when they bring no moment into it: M is then the
           same on both sides of the joint. Where they bring one, the moment line steps and the two sides are two lines */
        for (const [e, ke] of at) for (const [b, kb] of at) {
          if (ke !== 1 || kb !== 0) continue;
          const Me = s.mem[e], Mb = s.mem[b];
          if (Me.rel[1] || Mb.rel[0] || Math.abs(Me.c * Mb.s - Me.s * Mb.c) > 1e-9 || Me.c * Mb.c + Me.s * Mb.s < 0) continue;   /* rigid and in one line */
          if (at.length > 2 && sgn(FS.forcesAt(Me, Me.L, -1).M - FS.forcesAt(Mb, 0, 1).M, tm)) continue;
          next.set(e, b); follows.add(b);
        }
      });
      const seen = new Set();
      const line = m0 => {
        let vs = 0, vgap = false, ms = 0, mgap = false, big = false, pend = null, prev = -1;
        for (let mi = m0; mi !== undefined && !seen.has(mi); prev = mi, mi = next.get(mi)) {
          seen.add(mi);
          const M = s.mem[mi], F = (x, sd) => FS.forcesAt(M, x, sd), br = [0], flats = [];
          for (const q of M.ll.pts.map(pt => pt.a).sort((u, w) => u - w)) if (q > 1e-9 && q < M.L - 1e-9 && q - br[br.length - 1] > 1e-9) br.push(q);
          br.push(M.L);
          let flat = null;
          for (let i = 0; i < br.length - 1; i++) {
            const cut = [br[i], ...FS.vZeros(M, br[i], br[i + 1]), br[i + 1]];
            let vzero = true;
            for (let j = 0; j < cut.length - 1; j++) {
              const c = cut[j], d = cut[j + 1], mc = F(c, 1).M, md = F(d, -1).M;
              /* the start of a member inside a line is the joint: it is named as the end of the member before */
              const here = !i && !j && prev >= 0 ? { mi: prev, x: s.mem[prev].L } : { mi, x: c };
              const sv = sgn(F((c + d) / 2, -1).V, tv);
              if (sv) {
                vzero = false;
                /* a corner of the moment line only where the shear steps: at the start of a piece (a point load, a joint) and
                   with a shear just before it that differs from the shear just behind it. A point load along the member
                   starts a piece too, and a zero of the shear can fall on it: that turn is a smooth one (review 09, C78) */
                const vBefore = j ? null : c > 1e-9 ? F(c, -1).V : prev >= 0 ? FS.forcesAt(s.mem[prev], s.mem[prev].L, -1).V : null;
                if (vs && vs !== sv && !vgap && shown(mc)) marks.ext.push({ ...here, v: mc, jump: vBefore !== null && Math.abs(F(c, 1).V - vBefore) > tv, low: vs > 0 ? mc < 0 : mc > 0 });
                vs = sv; vgap = false;
              }
              const sc = sgn(mc, tm), sd = sgn(md, tm);
              if (!sc && !sd && !sgn(F((c + d) / 2, -1).M, tm)) { mgap = true; big = false; pend = null; continue; }   /* M = 0 along this piece */
              for (const [q, x0, val] of [[sc, c, mc], [sd, d, md]]) if (q) {
                if (ms && ms !== q && !mgap) {   /* the sign has changed since the last clear value: at c where M is zero there (a kink), else between c and d */
                  let w = here;
                  if (x0 === d && sc) { let lo = c, hi = d; for (let k = 0; k < 60; k++) { const xm = (lo + hi) / 2; if (sgn(F(xm, -1).M, 0) === sc) lo = xm; else hi = xm; } w = { mi, x: (lo + hi) / 2 }; }
                  pend = big ? w : null; big = false;
                }
                ms = q; mgap = false;
                if (shown(val)) { big = true; if (pend) { marks.infl.push(pend); pend = null; } }
              }
            }
            if (vzero) { vgap = true; if (flat && Math.abs(flat[1] - br[i]) < 1e-9) flat[1] = br[i + 1]; else { flat = [br[i], br[i + 1]]; flats.push(flat); } } else flat = null;
          }
          for (const f of flats) { const xm = (f[0] + f[1]) / 2, v = F(xm, -1).M; if (f[1] - f[0] > 1e-6 * M.L && shown(v)) marks.ext.push({ mi, x: xm, v, jump: false, flat: f }); }
        }
      };
      s.mem.forEach((M, mi) => { if (!follows.has(mi)) line(mi); });
      s.mem.forEach((M, mi) => { if (!seen.has(mi)) line(mi); });
    }
  } else { st.zero = { M: true, V: true, N: true, W: true, D: true }; st.flat = { ...st.zero }; }
  st.tgt = t; st.marks = marks;
}

function nominal() {   /* full-scale values: a diagram fills 80 % of its room */
  const t = st.tgt, f = 1.25, e = {};
  for (const k of ['M', 'V', 'N', 'W']) {
    let lo = t[k][0] * f, hi = t[k][1] * f;
    const span = hi - lo;
    if (span < 1e-12) { lo = -1; hi = 1; } else { hi = Math.max(hi, 0.14 * span); lo = Math.min(lo, -0.14 * span); }
    e[k] = [lo, hi];
  }
  e.D = t.D > 1e-12 ? t.D * f : 1;
  return e;
}

function stepExt(dt) {   /* scales ease to their target; while a load is dragged they hold, so the diagram visibly grows */
  const nom = nominal(), k = 1 - Math.exp(-dt / 120), hold = st.drag && st.drag.live;
  let moving = false;
  const go = (cur, want, need, up) => {
    if (hold) return up ? Math.max(cur, need) : Math.min(cur, need);
    const nx = cur + (want - cur) * k;
    if (Math.abs(want - nx) < 2e-3 * Math.abs(want)) return want;
    moving = true; return nx;
  };
  for (const key of ['M', 'V', 'N', 'W']) { const c = st.ext[key]; c[0] = go(c[0], nom[key][0], st.tgt[key][0], false); c[1] = go(c[1], nom[key][1], st.tgt[key][1], true); }
  st.ext.D = go(st.ext.D, nom.D, st.tgt.D, true);
  return moving;
}
/* the strip of N is left out while there is no axial force to show: none now and none in the kept state of "Compare" */
const pwTarget = q => (q === 'N' && st.focus !== 'N' && st.flat.N ? 0 : q === st.focus ? 1.9 : 1);
function stepPW(dt) {
  const k = 1 - Math.exp(-dt / 90);
  let moving = false;
  for (const q of ['V', 'M', 'D', 'N']) { const want = pwTarget(q), c = st.pw[q]; if (Math.abs(want - c) < 0.004) st.pw[q] = want; else { st.pw[q] = c + (want - c) * k; moving = true; } }
  return moving;
}

function series(mi) {   /* what is drawn this frame: the solution, blended from the previous one and grown from zero */
  const S = st.sol.mem[mi].smp, g = st.gf, e = st.prev ? st.tf : 1;
  if (g >= 1 && e >= 1) return S;
  const n = S.xs.length;
  let c = st.cache[mi];
  if (!c || c.n !== n) c = st.cache[mi] = { n, N: new Float64Array(n), V: new Float64Array(n), M: new Float64Array(n), dX: new Float64Array(n), dY: new Float64Array(n), rot: S.rot };
  if (c.fid === st.fid) return c;
  c.fid = st.fid; c.xs = S.xs; c.side = S.side;
  const P = e < 1 ? st.prev.mem[mi].smp : null;
  for (const k of ['N', 'V', 'M', 'dX', 'dY']) { const a = S[k], o = c[k]; for (let i = 0; i < n; i++) o[i] = (P ? lerp(FS.interp(P, k, S.xs[i], S.side[i]), a[i], e) : a[i]) * g; }
  return c;
}

/* ---------- view ---------- */
const X = x => VW.ox + x * VW.s, Y = y => VW.oy - y * VW.s;
function layout() {
  const nd = st.model.nodes;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const n of nd) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const beam = y1 - y0 < 1e-9, small = W < 560, low = H < 620, v = { beam, x0, x1, y0, y1, small };
  if (beam) {
    v.gl = small ? 46 : 68; v.gr = small ? 22 : 40;
    v.s = (W - v.gl - v.gr) / (x1 - x0); v.ox = v.gl - x0 * v.s;
    v.yB = low ? 110 : 130; v.oy = v.yB + y0 * v.s; v.dimY = v.yB + (low ? 88 : 100);
    v.amp = 0; v.dAmp = 20;
    /* the lines end above the foot of the sheet: the hint and the factor of the drawing stand there, on one line or on
       several (st.footH, measured for the longest hint at this width) */
    /* under each strip a row for the relation of its line (V′ = −q, M′ = V, w′ = θ): relRows. A narrow or a low sheet
       has no room for rows; there the relation stands in the corner of its strip and its number in the box of the probe */
    /* rows where they leave every strip its height: with the strips the sheet is going to show (three, or four with N),
       a strip of weight 1 keeps ROWMIN px or more. Decided on the strips it is going to show, not on those in motion */
    const top = v.dimY + 22, foot = Math.max(small ? 72 : 32, (st.footH || 0) + 13), kt = ['V', 'M', 'D', 'N'].filter(q => pwTarget(q) > 0.03);
    v.rows = !small && (H - foot - ROWH - top - (ROWH + 6) * (kt.length - 1)) / kt.reduce((a, q) => a + pwTarget(q), 0) >= ROWMIN;
    const rowH = v.rows ? ROWH : 0, gap = v.rows ? ROWH + 6 : 10, bot = H - foot - rowH, ks = ['V', 'M', 'D', 'N'].filter(q => st.pw[q] > 0.03);
    const unit = (bot - top - gap * (ks.length - 1)) / ks.reduce((a, q) => a + st.pw[q], 0);
    let yy = top;
    v.plots = ks.map(q => { const p = { k: q, y: yy, h: Math.max(8, unit * st.pw[q]) }; yy += p.h + gap; return p; });
  } else {
    const amp = clamp(Math.min(W, H) * 0.11, 40, 92), bw = x1 - x0, bh = y1 - y0;
    /* on a narrow sheet a truss takes nearly the full width: its bars carry their values on themselves */
    const tight = small && st.model.truss, pl = tight ? 44 : Math.max(amp + 44, small ? 62 : 128), pt = Math.max(amp, 100) + 36;
    /* below the structure: its supports, their reactions and the line of the dimensions, and under that the foot of the
       sheet with the hint. The dimensions keep clear of the hint however many lines it takes at this width */
    /* a sheet with the room keeps one row under the structure, above the hint: the relation of the open tab (frameRow) */
    v.rows = !small && H >= 520;
    const rowH = v.rows ? ROWH : 0;
    v.rowY = H - Math.max(32, (st.footH || 0) + 13) - rowH + 3 + ROWH / 2;
    const dimOff = small ? 86 : 98, pb = Math.max(small ? 114 : 126, dimOff + (st.footH || 0) + 18) + rowH;
    const fit = right => Math.min(bw > 0 ? (W - pl - right) / bw : 1e9, (H - pt - pb) / bh, 200);
    /* right of the structure: the line of the heights. A distributed load whose figure stands on the right of its member
       writes its value beyond the figure; the line of the heights stands clear of that value and the sheet leaves the
       room. The reach of each value is taken at the smallest scale the sheet can get, so it holds at the scale it gets */
    let dimR = amp + 36;
    if (!small) {
      const far = udlRight(nd), sLow = fit(Math.max(dimR, ...far.map(q => q.wide)) + 88), sHigh = fit(dimR + 88);
      for (const q of far) dimR = Math.max(dimR, (q.x - x1) * sLow + (q.L * sHigh < 170 ? q.wide : q.L * sLow >= 170 ? q.ends : Math.max(q.wide, q.ends)));
    }
    const pr = tight ? 40 : small ? amp + 34 : dimR + 88;
    v.s = fit(pr);
    v.ox = pl + (W - pl - pr - bw * v.s) / 2 - x0 * v.s; v.oy = pt + (H - pt - pb - bh * v.s) / 2 + y1 * v.s;
    v.amp = amp; v.dAmp = clamp(Math.min(W, H) * 0.05, 18, 38);
    v.dimY = v.oy - y0 * v.s + dimOff; v.dimX = v.ox + x1 * v.s + dimR;
  }
  VW = v;
  MG = st.model.members.map(m => {
    const a = nd[m.n1], b = nd[m.n2], ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y), len = Math.hypot(bx - ax, by - ay), ex = (bx - ax) / len, ey = (by - ay) / len;
    return { ax, ay, bx, by, len, ex, ey, zx: -ey, zy: ex, L: Math.hypot(b.x - a.x, b.y - a.y) };
  });
}
/* the distributed loads whose figure stands on the right of their member (drawUdls): the rightmost point of the member
   and how far the value reaches from there, with the one text of a short member (wide) and with the texts at the two
   ends of a long one (ends): the depth of the figure, the gap, the text, and the room that the line of the heights keeps */
function udlRight(nd) {
  const out = [];
  ctx.save(); ctx.font = `600 13px ${UI}`;
  for (const mb of st.model.members) {
    const u = mb.udl, top = Math.max(u.w1, u.w2);
    if (!u.on || !(top > 0)) continue;
    const a = nd[mb.n1], b = nd[mb.n2], L = Math.hypot(b.x - a.x, b.y - a.y), ex = (b.x - a.x) / L, ey = -(b.y - a.y) / L, zx = -ey, zy = ex;
    const r = u.ang * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r), par = Math.abs(ex * dy - ey * dx) < 0.25, ux = par ? zx * (zx * dx + zy * dy > 0 ? -1 : 1) : -dx;
    if (!(ux > 0.7)) continue;
    const tw = t => ctx.measureText(t).width, one = tw(`${n1(top)} kN/m`), both = u.w1 !== u.w2 && u.w1 && u.w2, depth = (par ? 24 : udlH(top)) + 26;
    out.push({ x: Math.max(a.x, b.x), L, wide: depth + (both ? tw(`${n1(u.w1)} to ${n1(u.w2)} kN/m`) : one), ends: depth + (both && !par ? Math.max(tw(`${n1(u.w1)} kN/m`), tw(`${n1(u.w2)} kN/m`)) : both ? tw(`${n1(u.w1)} to ${n1(u.w2)} kN/m`) : one) });
  }
  ctx.restore();
  return out;
}
const deg = i => st.model.members.reduce((n, m) => n + (m.n1 === i) + (m.n2 === i), 0);
function memberDir(i) {   /* screen direction from a node into its member; several members: the ground is below */
  if (deg(i) !== 1) return { x: 0, y: -1 };
  const mi = st.model.members.findIndex(m => m.n1 === i || m.n2 === i), g = MG[mi], sg = st.model.members[mi].n1 === i ? 1 : -1;
  return { x: g.ex * sg, y: g.ey * sg };
}

/* ---------- drawing primitives ---------- */
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function head(x, y, ux, uy, hl, hw, open) {
  ctx.beginPath(); ctx.moveTo(x - ux * hl - uy * hw / 2, y - uy * hl + ux * hw / 2); ctx.lineTo(x, y); ctx.lineTo(x - ux * hl + uy * hw / 2, y - uy * hl - ux * hw / 2);
  if (open) ctx.stroke(); else { ctx.closePath(); ctx.fill(); }
}
function put(txt, x, y, o = {}) {   /* text with a paper halo; refused when it would cover an earlier label */
  ctx.save();
  ctx.font = o.font || `600 13px ${UI}`;
  const w = ctx.measureText(txt).width, h = o.h || 15;
  let xa = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
  if (o.strict && (xa < 3 || xa + w > W - 3 || y < 9 || y > H - 9)) { ctx.restore(); return false; }
  xa = clamp(xa, 3, W - w - 3); y = clamp(y, 9, H - 9);
  const b = [xa - 3, y - h / 2 - 1, xa + w + 3, y + h / 2 + 1];
  if (!o.force && boxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) { ctx.restore(); return false; }
  if (o.clear && o.clear.some(q => segRect(q[0], q[1], q[2], q[3], b[0], b[1], b[2], b[3]))) { ctx.restore(); return false; }   /* a line runs through this place */
/*DEBUG*/ if (window.__over && o.force) { const on = boxes.filter(q => q.t && xa < q[2] - (q.pad || 0) && xa + w > q[0] + (q.pad || 0) && y - 6 < q[3] - (q.pad || 0) && y + 6 > q[1] + (q.pad || 0)).map(q => q.t); if (on.length) window.__over.push({ t: txt, x: Math.round(xa), y: Math.round(y), on }); }
  boxes.push(b); texts.push(b);
/*DEBUG*/ b.t = txt; b.pad = 3;
  ctx.setLineDash([]); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = C.bg;
  if (o.segs) { let xx = xa; for (const g of o.segs) { ctx.strokeText(g[0], xx, y + 0.5); ctx.fillStyle = g[1]; ctx.fillText(g[0], xx, y + 0.5); xx += ctx.measureText(g[0]).width; } }
  else { ctx.strokeText(txt, xa, y + 0.5); ctx.fillStyle = o.col || C.ink; ctx.fillText(txt, xa, y + 0.5); }
  ctx.restore();
  return b;
}
function tryAll(txt, cands, o = {}) {   /* first free place of several: as it is given, then moved into the sheet where it sticks out of it */
  for (const strict of [true, false])
    for (const c of cands) { const b = put(txt, c[0], c[1], { ...o, align: c[2], strict }); if (b) return b; }
  return false;
}
/* whether a text set at a place would lie on another text (the lines that are kept clear do not count here) */
function onText(txt, c, o = {}) {
  ctx.save(); ctx.font = o.font || `600 13px ${UI}`;
  const w = ctx.measureText(txt).width, h = o.h || 15; ctx.restore();
  const xa = clamp(c[2] === 'left' ? c[0] : c[2] === 'right' ? c[0] - w : c[0] - w / 2, 3, W - w - 3), y = clamp(c[1], 9, H - 9);
  return texts.some(q => xa - 3 < q[2] && xa + w + 3 > q[0] && y - h / 2 - 1 < q[3] && y + h / 2 + 1 > q[1]);
}
/* A text that is always written: the value of a load, a joint letter, a reaction. It takes the first free place of its
   own; a text that names lines (o.clear) first looks for one that none of them runs through. Where none is free it goes
   on a ring around its point with a hairline back to it (o.ring). Where that fails too it takes the first of its places
   where it lies on no other text, and only last its first place (review 11, C130: 500.0 kN/m stood on a reaction) */
function putAny(txt, cands, o = {}) {
  const b = (o.clear && o.clear.length && tryAll(txt, cands, o)) || tryAll(txt, cands, { ...o, clear: null })
    || (o.ring && ringPut(txt, o.ring[0], o.ring[1], { ...o, clear: null, strict: true }));
  if (b) return b;
  const c = cands.find(q => !onText(txt, q, o)) || cands[0];
/*DEBUG*/ if (window.__forced) window.__forced.push({ t: txt, x: Math.round(c[0]), y: Math.round(c[1]) });
  return put(txt, c[0], c[1], { ...o, clear: null, align: c[2], force: true });
}
/* no room beside its point: a value moves out on a ring around it, and a hairline leads back to the point */
function ringPut(txt, cx, cy, o = {}) {
  for (const r of [28, 42, 58, 76, 96]) for (let k = 0; k < 12; k++) {
    const a = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * Math.PI / 6 - Math.PI / 2, b = put(txt, cx + r * Math.cos(a), cy + r * Math.sin(a), { ...o, align: 'center' });
    if (b) {
      const ex = clamp(cx, b[0], b[2]), ey = clamp(cy, b[1], b[3]);
      ctx.save(); ctx.setLineDash([]); ctx.globalAlpha *= 0.55; ctx.strokeStyle = o.col || C.ink; ctx.lineWidth = 1; line(cx, cy, ex, ey);
      ctx.fillStyle = o.col || C.ink; ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
      return b;
    }
  }
  return false;
}
/* does the stretch from (x1, y1) to (x2, y2) pass through the box l, t, r, b */
function segRect(x1, y1, x2, y2, l, t, r, b) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const u = q / p;
    if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; }
  }
  return true;
}
const block = (x0, y0, x1, y1) => boxes.push([Math.min(x0, x1) - 2, Math.min(y0, y1) - 2, Math.max(x0, x1) + 2, Math.max(y0, y1) + 2]);
function runs(xs, vals) {   /* pieces of one sign; a crossing of zero closes one piece and opens the next */
  const out = [];
  let cur = null;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], v = vals[i], sg = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (!cur) { cur = { sg, p: [x, v] }; continue; }
    if (sg !== 0 && cur.sg !== 0 && sg !== cur.sg) {
      const px = cur.p[cur.p.length - 2], pv = cur.p[cur.p.length - 1];
      if (x > px) { const xz = px + (x - px) * pv / (pv - v); cur.p.push(xz, 0); out.push(cur); cur = { sg, p: [xz, 0, x, v] }; } else { out.push(cur); cur = { sg, p: [x, v] }; }
    } else { if (cur.sg === 0) cur.sg = sg; cur.p.push(x, v); }
  }
  if (cur) out.push(cur);
  return out;
}
function drawRun(g, r, k, col, o = {}) {   /* one hatched piece of a state line along a base line g */
  const p = r.p, n = p.length / 2, s = VW.s;
  if (n < 2) return;
  const bx = x => g.ax + g.ex * x * s, by = x => g.ay + g.ey * x * s, xa = p[0], xb = p[2 * n - 2];
  const tip = i => [bx(p[2 * i]) + g.zx * p[2 * i + 1] * k, by(p[2 * i]) + g.zy * p[2 * i + 1] * k];
  const trace = (eL, eR) => { if (eL) ctx.moveTo(bx(xa), by(xa)); for (let i = 0; i < n; i++) { const t = tip(i); if (i || eL) ctx.lineTo(t[0], t[1]); else ctx.moveTo(t[0], t[1]); } if (eR) ctx.lineTo(bx(xb), by(xb)); };
  ctx.beginPath(); trace(true, true); ctx.closePath(); ctx.fillStyle = rgba(col, o.fill === undefined ? 0.13 : o.fill); ctx.fill();
  if (o.hatch !== false) {
    ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1; ctx.beginPath();
    const step = 7 / s;
    let j = 0;
    for (let x = Math.ceil(xa / step + 1e-9) * step; x < xb; x += step) {
      while (j < n - 2 && p[2 * j + 2] < x) j++;
      const x0 = p[2 * j], x1 = p[2 * j + 2], v = x1 > x0 ? p[2 * j + 1] + (p[2 * j + 3] - p[2 * j + 1]) * (x - x0) / (x1 - x0) : p[2 * j + 1];
      ctx.moveTo(bx(x), by(x)); ctx.lineTo(bx(x) + g.zx * v * k, by(x) + g.zy * v * k);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = col; ctx.lineWidth = o.lw || 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); trace(o.endL !== false, o.endR !== false); ctx.stroke();
  /* sign mark in the middle of a large piece */
  if (o.sign !== false && (xb - xa) * s > 34) {
    let im = 0;
    for (let i = 1; i < n; i++) if (Math.abs(p[2 * i + 1]) > Math.abs(p[2 * im + 1])) im = i;
    const vm = p[2 * im + 1];
    if (Math.abs(vm * k) > 30) {
      let xm = p[2 * im];
      if ((xm - xa) * s < 14 || (xb - xm) * s < 14) xm = xa + (xb - xa) * (xm - xa < xb - xm ? 0.28 : 0.72);
      let j2 = 0;
      while (j2 < n - 2 && p[2 * j2 + 2] < xm) j2++;
      const x0 = p[2 * j2], x1 = p[2 * j2 + 2], vv = x1 > x0 ? p[2 * j2 + 1] + (p[2 * j2 + 3] - p[2 * j2 + 1]) * (xm - x0) / (x1 - x0) : vm;
      if (Math.abs(vv * k) > 26) {
        const cx = bx(xm) + g.zx * vv * k * 0.5, cy = by(xm) + g.zy * vv * k * 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 3.6, cy); ctx.lineTo(cx + 3.6, cy); if (vm > 0) { ctx.moveTo(cx, cy - 3.6); ctx.lineTo(cx, cy + 3.6); } ctx.stroke();
      }
    }
  }
}
function keyPts(M, key) {   /* points worth a number: ends, loads, the peak where the shear is zero */
  const L = M.L, out = [], F = (x, sd) => FS.forcesAt(M, x, sd)[key], br = [0];
  for (const p of M.ll.pts) if (p.a > 1e-9 && p.a < L - 1e-9 && Math.abs(br[br.length - 1] - p.a) > 1e-9) br.push(p.a);
  br.push(L);
  if (key === 'M') {
    for (const b of br) out.push({ x: b, side: b === 0 ? 1 : -1, v: F(b, b === 0 ? 1 : -1) });
    /* the peak where V = 0. Less than 2 px beside an end of its piece it carries no number of its own when it prints as that end does */
    for (let i = 0; i < br.length - 1; i++) for (const xs of FS.vZeros(M, br[i], br[i + 1])) {
      const v = F(xs, -1), px = VW ? 2 / VW.s : 0;
      if ((xs - br[i] < px && n1(F(br[i], 1)) === n1(v)) || (br[i + 1] - xs < px && n1(F(br[i + 1], -1)) === n1(v))) continue;
      out.push({ x: xs, side: -1, v });
    }
  } else for (let i = 0; i < br.length - 1; i++) {
    const va = F(br[i], 1), vb = F(br[i + 1], -1);
    if (Math.abs(va - vb) < 1e-6 * Math.max(1, Math.abs(va)) && n1(va) === n1(vb)) out.push({ x: (br[i] + br[i + 1]) / 2, side: -1, v: va });   /* one value for a piece that is level, also in print */
    else { out.push({ x: br[i], side: 1, v: va, edge: true }); out.push({ x: br[i + 1], side: -1, v: vb, edge: true }); }   /* the two ends of a sloping piece */
  }
  return out;
}
const qCol = (key, v) => (key === 'M' ? C.cM : key === 'V' ? C.cV : key === 'N' ? (v >= 0 ? C.cT : C.cC) : C.ink);
function placeLabels(L) {
  /* the larger value first; values that are the same to a millionth of the largest, as at the two sides of a symmetric
     frame, keep the order in which they were named: the last digits of the analysis do not decide the places */
  const first = l => (l.pr >= 1e9 ? 1 : 0), size = l => l.pr - first(l) * 1e9;   /* the forces of truss bars are named with 1e9 added: they are set first */
  const top = L.reduce((t, l) => Math.max(t, Math.abs(size(l))), 0) || 1, rank = l => first(l) * 1e7 + Math.round(size(l) / top * 1e6);
  L.sort((a, b) => rank(b) - rank(a));
  const done = [];
  for (const l of L) {
    if (done.some(d => d.t === l.t && dist(d.x, d.y, l.x, l.y) < 58)) continue;
    /* on a narrow sheet the values are set a size smaller, so that they find room */
    const o = { col: l.col, align: l.align, strict: true, font: VW.small ? `600 11.5px ${UI}` : undefined, h: VW.small ? 13 : 15 };
    let b = null;
    const beside = q => { for (const [dx, dy] of l.alt || [[0, 0]]) if ((b = put(l.t, l.x + dx, l.y + dy, q))) return true; return false; };
    /* no room beside its point: the value moves out on a ring around it (ringPut) */
    const [cx, cy] = l.at || [l.x, l.y];
    const ring = q => !!(b = ringPut(l.t, cx, cy, q));
    /* a number that names its lines (l.clear) first looks for a place none of them runs through: beside its point, then
       on the ring; only when there is none it stands where no other number stands */
    const free = l.clear ? { ...o, clear: l.clear } : null;
    let lined = false;
    if (!(free && (beside(free) || ring(free)))) { lined = !!free; beside(o) || ring(o); }
    if (b) done.push(l);
/*DEBUG*/ if (window.__online && lined && b) window.__online.push({ t: l.t, x: Math.round(l.x), y: Math.round(l.y) });
/*DEBUG*/ if (window.__drop && done[done.length - 1] !== l) window.__drop.push({ t: l.t, x: Math.round(l.x), y: Math.round(l.y), who: l.who || '' });
  }
}

/* ---------- sheet ---------- */
function drawGrid() {
  const s = VW.s;
  let minor = 0.25;
  for (const c of [0.25, 0.5, 1, 2, 5, 10]) { minor = c; if (c * s >= 20) break; }
  const major = minor < 1 ? 1 : minor * 5, px = minor * s;
  ctx.lineWidth = 1;
  const vert = (step, col) => { ctx.strokeStyle = col; ctx.beginPath(); for (let x = Math.ceil((0 - VW.ox) / s / step) * step; X(x) < W; x += step) { const xx = Math.round(X(x)) + 0.5; ctx.moveTo(xx, 0); ctx.lineTo(xx, H); } ctx.stroke(); };
  const horz = (stepPx, col, y0) => { ctx.strokeStyle = col; ctx.beginPath(); for (let y = y0 - Math.ceil(y0 / stepPx) * stepPx; y < H; y += stepPx) { const yy = Math.round(y) + 0.5; ctx.moveTo(0, yy); ctx.lineTo(W, yy); } ctx.stroke(); };
  const yRef = VW.beam ? VW.yB : Y(0);
  vert(minor, C.grid); horz(px, C.grid, yRef); vert(major, C.grid2); horz(major * s, C.grid2, yRef);
}

/* a bar counts as a zero bar when its force prints as 0.0; a force that the kept state of Compare let vary along the bar */
const zeroN = v => n1(v) === '0.0';
const varies = S => { let a = Infinity, b = -Infinity; for (const v of S.N) { if (v < a) a = v; if (v > b) b = v; } return b - a > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) || n1(a) !== n1(b); };
/* a load with a part along its member */
/* where the loads with a part along the member stand: on a joint whose support holds along the axis (sup), or elsewhere (other) */
const axialWhere = () => { let sup = false, other = false;
  for (const M of st.sol.mem) { const k = st.model.members[M.i], holds = n => FS.RXN[st.model.nodes[n].sup || 'free'].includes(0);
    if (Math.abs(M.ll.q1x) > 1e-9 || Math.abs(M.ll.q2x) > 1e-9) other = true;
    for (const p of M.ll.pts) if (Math.abs(p.px) > 1e-9) { if ((p.a < 1e-9 && holds(k.n1)) || (p.a > M.L - 1e-9 && holds(k.n2))) sup = true; else other = true; } }
  return { sup, other }; };
/* why a beam with loads along its axis has N = 0: the support takes what stands on it; what stands elsewhere cancels */
const noAxialNote = () => { const w = axialWhere(); return !w.sup && !w.other ? 'No load along the axis: N = 0' : w.sup && w.other ? 'N = 0 in the beam: the support takes the load that stands on it, the other loads along the axis cancel' : w.sup ? 'N = 0 in the beam: the support takes the load along the axis' : 'N = 0 in the beam: the loads along the axis cancel'; };
/* C27: q is the size of a load, so the sign in V′ = −q follows the load: − toward the dashed side (downward on a beam), + the other way */
const qSign = () => { let dn = false, up = false; if (st.sol.ok) for (const M of st.sol.mem) { const a = M.ll.q1y + M.ll.q2y; if (a < -1e-9) dn = true; else if (a > 1e-9) up = true; } return up && dn ? '∓' : up ? '+' : '−'; };
/* where a member moves most, and the turns of the deflection of a beam member: found by the analysis (FS.mostMoved, FS.wTops) */
const mostMoved = M => FS.mostMoved(M), wTops = M => FS.wTops(M);
const ghostStyle = () => { ctx.strokeStyle = rgba(C.ink, 0.62); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; ctx.setLineDash([5, 4]); };
function drawFrameDiagram() {
  const key = st.focus;
  if (key === 'D' || st.flat[key]) return;
  const [lo, hi] = st.ext[key], k = VW.amp / Math.max(-lo, hi), nmax = Math.max(-st.tgt.N[0], st.tgt.N[1]) || 1;
  st.sol.mem.forEach((M, mi) => {
    const S = series(mi), g = MG[mi];
    if (key === 'N' && barStyle(mi)) {
      const v = S.N[S.xs.length >> 1], z = zeroN(M.smp.N[S.xs.length >> 1]);
      ctx.lineCap = 'round';
      if (z) { ctx.strokeStyle = C.mute; ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]); line(g.ax, g.ay, g.bx, g.by); ctx.setLineDash([]); } else { ctx.strokeStyle = v >= 0 ? C.cT : C.cC; ctx.lineWidth = 3 + 7 * Math.min(1, Math.abs(v) / nmax); line(g.ax, g.ay, g.bx, g.by); }
      return;
    }
    for (const r of runs(S.xs, S[key])) drawRun(g, r, k, qCol(key, r.sg));
  });
  if (st.ghost) st.ghost.mem.forEach((G, mi) => {
    if (key === 'N' && barStyle(mi) && !varies(G.smp)) return;
    const S = G.smp, g = MG[mi];
    ghostStyle(); ctx.beginPath();
    for (let i = 0; i < S.xs.length; i++) { const d = S.xs[i] * VW.s, px = g.ax + g.ex * d + g.zx * S[key][i] * k, py = g.ay + g.ey * d + g.zy * S[key][i] * k; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke(); ctx.setLineDash([]);
  });
  VW.k = k;
}
function frameLabels() {
  const key = st.focus, L = [];
  if (key === 'D') return deflLabels();
  /* Compare on a truss: the kept axial forces stand in brackets also where the present force is zero. The same holds
     for a bar of a frame, which carries one number. Nothing is written only where neither state has a value to show */
  /* ... and for a bar of a frame that bends now, under a load across it: its line of N is drawn like that of a truss bar
     with a load, and the kept values stand in brackets at its ends and steps (review 09, C103) */
  /* ... and for a member that was a bar when the state was kept and is none now, after a hinge was closed: the kept
     state carries its own bars (setGhost), so its values stay on the sheet (review 11, C123) */
  const keptOn = mi => key === 'N' && !!st.ghost && !!st.ghost.mem[mi] && (st.model.truss || !!(st.bars && st.bars[mi]) || !!(st.ghost.bars0 && st.ghost.bars0[mi]));
  if (st.flat[key]) return;
  const big = Math.max(-st.tgt[key][0], st.tgt[key][1]), k = VW.k;
  st.sol.mem.forEach((M, mi) => {
    const g = MG[mi], S = series(mi);
    if (key === 'N' && barStyle(mi)) {
      const v = M.smp.N[S.xs.length >> 1], zero = zeroN(v), t0 = zero ? '0' : n1(v), one = x => (zeroN(x) ? '0' : n1(x));
      /* the kept force stands in brackets behind the present one; a kept force that varied along the bar has its values at its own places (below) */
      const G = st.ghost && st.ghost.mem[mi], GN = G && G.smp.N, tg = !G || varies(G.smp) ? t0 : one(GN[GN.length >> 1]);
      if (G && varies(G.smp)) keptPts(G, mi, [], L);
      L.push({ t: tg === t0 ? t0 : `${t0} (${tg})`, x: (g.ax + g.bx) / 2 - g.zx * 14, y: (g.ay + g.by) / 2 - g.zy * 14, pr: Math.abs(v) + 1e9, col: zero ? C.mute : qCol('N', v),
        alt: [[0, 0], [g.ex * 18, g.ey * 18], [-g.ex * 18, -g.ey * 18], [g.zx * 28, g.zy * 28], [g.zx * 28 + g.ex * 18, g.zy * 28 + g.ey * 18], [g.zx * 28 - g.ex * 18, g.zy * 28 - g.ey * 18], [g.ex * 9, g.ey * 9], [-g.ex * 9, -g.ey * 9]] });   /* along the bar, then on its other side */
      return;
    }
    const pts = keyPts(M, key), kept = keptOn(mi);
    if (kept) keptPts(st.ghost.mem[mi], mi, pts, L);
    for (const kp of pts) {
      /* Compare on a truss: the kept axial force at the same place stands in brackets, as on the bars drawn with one value.
         It is worked out from the end forces and the loads of the kept member, not read between its samples */
      const Gk = kept && st.ghost.mem[mi], tk = Gk ? (v => (zeroN(v) ? '0' : n1(v)))(FS.forcesAt(Gk, Math.min(kp.x, Gk.L), kp.side).N) : '', none = n1(kp.v) === '0.0', tp = none ? '0' : n1(kp.v);
      /* a value is written when it prints other than 0.0, however small beside the largest; a present zero is written where the kept value is not zero */
      if (none && !(Gk && tk !== '0')) continue;
      const vd = FS.interp(S, key, kp.x, kp.side), sg = kp.v >= 0 ? 1 : -1, nud = kp.x < 1e-9 ? 10 : kp.x > M.L - 1e-9 ? -10 : 0, d = kp.x * VW.s + nud;
      /* other places when the first is taken: along the member, a value beside a step staying on its own side, and last just across the member */
      const dirs = kp.x < 1e-9 ? [1] : kp.x > M.L - 1e-9 ? [-1] : kp.edge ? [kp.side] : [1, -1], alt = [[0, 0]];
      for (const a of [26, 58]) for (const sd of dirs) alt.push([g.ex * a * sd - g.zx * sg * 6, g.ey * a * sd - g.zy * sg * 6]);
      alt.push([-g.zx * (vd * k + sg * 24), -g.zy * (vd * k + sg * 24)]);
      for (const a of [26, 58]) for (const sd of dirs) alt.push([g.ex * a * sd - g.zx * (vd * k + sg * 24), g.ey * a * sd - g.zy * (vd * k + sg * 24)]);   /* across the member and along it */
      if (kp.x < 1e-9 || kp.x > M.L - 1e-9) alt.push([-g.ex * 36 * dirs[0], -g.ey * 36 * dirs[0]]);   /* last, for a value at an end of the member: just beyond that end */
      L.push({ t: Gk && tk !== tp ? `${tp} (${tk})` : tp, x: g.ax + g.ex * d + g.zx * (vd * k + sg * 12), y: g.ay + g.ey * d + g.zy * (vd * k + sg * 12), pr: Math.abs(kp.v), col: qCol(key, kp.v), alt });
    }
  });
  placeLabels(L);
}
/* Compare on a truss: the values of a kept axial force at the places of the kept line that the present line does not
   name, a step under a load that is gone for one. Each stands in brackets on the dashed line */
function keptPts(G, mi, pts, L) {
  const g = MG[mi], k = VW.k;
  for (const kp of keyPts(G, 'N')) {
    if (n1(kp.v) === '0.0' || pts.some(p => Math.abs(p.x - kp.x) < 1e-6 && p.side === kp.side)) continue;
    /* an end value stands a little inside the bar, clear of a load arrow on the joint */
    const inw = Math.min(30, 0.28 * G.L * VW.s), sg = kp.v >= 0 ? 1 : -1, d = kp.x * VW.s + (kp.x < 1e-9 ? inw : kp.x > G.L - 1e-9 ? -inw : kp.edge ? kp.side * 16 : 0), alt = [[0, 0]];
    for (const a of [26, 52]) for (const sd of kp.edge ? [kp.side] : [1, -1]) alt.push([g.ex * a * sd, g.ey * a * sd]);
    L.push({ t: `(${n1(kp.v)})`, x: g.ax + g.ex * d + g.zx * (kp.v * k + sg * 12), y: g.ay + g.ey * d + g.zy * (kp.v * k + sg * 12), pr: Math.abs(kp.v) * 0.5, col: C.mute, alt });
  }
}
function deflLabels() {
  if (st.zero.D) return;
  const ex = VW.dAmp / st.ext.D, s = st.sol, nodes = new Map(), L = [], lim = 0.15 * s.max.D;
  /* the lines a number must not stand on: the deflected members and the arrows of the point loads */
  const lines = [];
  s.mem.forEach((M, mi) => { const S = M.smp, g = MG[mi], n = S.xs.length; let qx = 0, qy = 0;
    for (let i = 0; i < n; i = i === n - 1 ? n : Math.min(i + 4, n - 1)) { const px = g.ax + g.ex * S.xs[i] * VW.s + S.dX[i] * ex, py = g.ay + g.ey * S.xs[i] * VW.s - S.dY[i] * ex; if (i) lines.push([qx, qy, px, py]); qx = px; qy = py; } });
  for (const ld of st.model.loads) { const g = HS.loads.get(ld.id); if (g) lines.push([g.hx, g.hy, g.kx, g.ky]); }
  ctx.font = VW.small ? `600 11.5px ${UI}` : `600 13px ${UI}`;
  /* places around a point, the side it moves to first; mx, my: direction of the movement on the sheet */
  const around = (tw, mx, my) => [[[0, -20], [tw / 2 + 6, -17], [tw / 2 + 12, 0], [tw / 2 + 6, 17], [0, 20], [-tw / 2 - 6, 17], [-tw / 2 - 12, 0], [-tw / 2 - 6, -17]],
    [[0, -32], [tw / 2 + 16, -24], [tw / 2 + 24, 0], [tw / 2 + 16, 24], [0, 32], [-tw / 2 - 16, 24], [-tw / 2 - 24, 0], [-tw / 2 - 16, -24]]]   /* a near ring, then a wider one */
    .flatMap(ring => ring.map(o => ({ o, f: (Math.sign(o[0]) * mx + Math.sign(o[1]) * my) / Math.hypot(Math.sign(o[0]), Math.sign(o[1])) - (o[1] > 0 ? 0.01 : 0) })).sort((a, b) => b.f - a.f).map(q => q.o));
  s.mem.forEach((M, mi) => {
    const S = M.smp, n = S.xs.length, g = MG[mi], d = i => Math.hypot(S.dX[i], S.dY[i]), top = mostMoved(M), dp = top.v;
    if (dp < lim) return;
    /* the larger of its two joints; the point inside the member carries a number of its own when it prints other than that joint */
    const e = d(0) > d(n - 1) ? 0 : n - 1, ni = e ? M.n2 : M.n1;
    if (top.inner && n1(dp * 1000) !== n1(d(e) * 1000)) {
      const u = dp || 1, px = g.ax + g.ex * top.x * VW.s + top.dX * ex, py = g.ay + g.ey * top.x * VW.s - top.dY * ex, t = `${n1(dp * 1000)} mm`, tw = ctx.measureText(t).width;
      /* the point of the member the number belongs to, at the place found: a dot with a rim, so that it shows on the line */
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); ctx.strokeStyle = C.bg; ctx.lineWidth = 1.5; ctx.stroke();
      /* the number stands beside the line: on the side the point moves to; where the point moves along its member
         (a beam that sways), away from the dashed side. Then the other side, then a little along the member */
      const tx = top.dX / u, ty = -top.dY / u, sd = tx * g.zx + ty * g.zy, k = Math.abs(sd) > 0.3 ? Math.sign(sd) : -1, nx = k * g.zx, ny = k * g.zy, r = Math.abs(nx) * (tw / 2 + 9) + Math.abs(ny) * 17;
      const alt = [[0, 0], [-2 * nx * r, -2 * ny * r], [g.ex * 34, g.ey * 34], [-g.ex * 34, -g.ey * 34], [-2 * nx * r + g.ex * 34, -2 * ny * r + g.ey * 34], [-2 * nx * r - g.ex * 34, -2 * ny * r - g.ey * 34]];
      L.push({ t, x: px + nx * r, y: py + ny * r, at: [px, py], pr: dp, col: C.ink, alt, clear: lines });
      if (d(e) >= lim && d(e) > 0.5 * dp && !nodes.has(ni)) nodes.set(ni, { dx: S.dX[e], dy: S.dY[e] });   /* its joint keeps its own number when that is of the same order */
    } else if (!nodes.has(ni)) nodes.set(ni, { dx: S.dX[e], dy: S.dY[e] });
  });
  for (const [ni, q] of nodes) {
    const nd = st.model.nodes[ni], mag = Math.hypot(q.dx, q.dy), u = mag || 1, t = `${n1(mag * 1000)} mm`, tw = ctx.measureText(t).width;
    if (n1(mag * 1000) === '0.0') continue;   /* a joint that does not move carries no number */
    /* around the joint as it has moved, on the side it moves to first, at a place no member and no load arrow runs through */
    L.push({ t, x: X(nd.x) + q.dx * ex, y: Y(nd.y) - q.dy * ex, pr: mag, col: C.ink, alt: around(tw, q.dx / u, -q.dy / u), clear: lines });
  }
  placeLabels(L);
}

function drawAxes() {   /* the axes of the sheet: x to the right, z down, y toward the reader */
  const sm = VW.small, a = sm ? 22 : VW.beam ? 28 : 34, ox = sm ? 22 : VW.beam ? 24 : 30, oy = sm ? 16 : 22, d = a * 0.36;
  ctx.save(); ctx.strokeStyle = C.mute; ctx.fillStyle = C.mute; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.setLineDash([]);
  line(ox, oy, ox + a, oy); head(ox + a + 6, oy, 1, 0, 7, 6, false);
  line(ox, oy, ox, oy + a); head(ox, oy + a + 6, 0, 1, 7, 6, false);
  line(ox, oy, ox - d, oy + d); head(ox - d - 4, oy + d + 4, -0.7071, 0.7071, 7, 6, false);
  ctx.font = `italic 15px ${MATH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('x', ox + a + 14, oy - 1); ctx.fillText('z', ox + 1, oy + a + 15); ctx.fillText('y', ox - d - 7, oy + d + 14);
  ctx.restore();
  block(ox - d - 14, oy - 9, ox + a + 20, oy + a + 24);
}

function drawStructure() {
  const m = st.model, ok = st.sol.ok, fD = st.focus === 'D' && ok && !st.zero.D;
  ctx.lineCap = 'round';
  /* selection and hover behind the members */
  const hm = st.hover && st.hover.type === 'member' ? st.hover.mi : -1, sm = st.sel && st.sel.kind === 'member' ? st.sel.mi : -1;
  for (const mi of [hm, sm]) if (mi >= 0 && MG[mi]) { const g = MG[mi]; ctx.strokeStyle = rgba(C.load, mi === sm ? 0.3 : 0.16); ctx.lineWidth = 13; line(g.ax, g.ay, g.bx, g.by); }
  /* the member that the card "how its line is built" speaks of */
  if (ok && m.members.length > 1 && st.cardMi >= 0 && st.cardMi !== hm && st.cardMi !== sm && MG[st.cardMi]) { const g = MG[st.cardMi]; ctx.strokeStyle = rgba(st.focus === 'V' ? C.cV : C.cM, 0.2); ctx.lineWidth = 11; line(g.ax, g.ay, g.bx, g.by); }
  const names = [];   /* the names of profiles written so far */
  m.members.forEach((mb, mi) => {
    const g = MG[mi];
    if (!(ok && !VW.beam && st.focus === 'N' && !st.zero.N && barStyle(mi))) {
      ctx.strokeStyle = fD ? rgba(C.ink, 0.3) : C.ink; ctx.lineWidth = fD ? 2.2 : VW.beam ? 4 : 3.4; line(g.ax, g.ay, g.bx, g.by);
    }
    if (!VW.beam && (isBar(mi) ? ok && !barStyle(mi) : !m.truss)) { ctx.strokeStyle = C.mute; ctx.lineWidth = 1; ctx.setLineDash([5, 4]); line(g.ax + g.ex * 7 + g.zx * 5.5, g.ay + g.ey * 7 + g.zy * 5.5, g.bx - g.ex * 7 + g.zx * 5.5, g.by - g.ey * 7 + g.zy * 5.5); ctx.setLineDash([]); }
    /* the name of a profile of its own, beside the member: under a member that lies flat, beside one that stands, clear
       of its line, and only where the member is long enough on the sheet to carry it (a column of 0.5 m under a beam of
       30 m is a few pixels high). A name never lies on another name: it takes the other side of its member, and is left
       out where that is taken too; the window and the menu name the profile of every member */
    if (ownSec(mb) && Math.hypot(g.bx - g.ax, g.by - g.ay) >= (Math.abs(g.zx) > 0.5 ? 30 : 70)) {
      const up = Math.abs(g.zx) > 0.5, off = up ? 11 : 15, t = ownSec(mb).name;
      ctx.font = `600 13px ${UI}`; const w = ctx.measureText(t).width;
      for (const sg of [1, -1]) {
        const x = (g.ax + g.bx) / 2 + g.zx * off * sg, y = (g.ay + g.by) / 2 + g.zy * off * sg + (VW.beam ? 2 : 0), al = up ? (g.zx * sg > 0 ? 'left' : 'right') : 'center';
        const xa = clamp(al === 'left' ? x : al === 'right' ? x - w : x - w / 2, 3, W - w - 3), bx = [xa - 3, y - 8.5, xa + w + 3, y + 8.5];
        if (names.some(q => bx[0] < q[2] && bx[2] > q[0] && bx[1] < q[3] && bx[3] > q[1])) continue;
        names.push(put(t, x, y, { col: C.mute, force: true, align: al })); break;
      }
    }
  });
  /* deflected line */
  if (ok && !st.flat.D) {
    const ex = VW.dAmp / st.ext.D;
    ctx.strokeStyle = fD ? C.ink : rgba(C.mute, 0.75); ctx.lineWidth = fD ? 3.2 : 1.3; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (!st.zero.D) st.sol.mem.forEach((M, mi) => { const S = series(mi), g = MG[mi]; for (let i = 0; i < S.xs.length; i++) { const px = g.ax + g.ex * S.xs[i] * VW.s + S.dX[i] * ex, py = g.ay + g.ey * S.xs[i] * VW.s - S.dY[i] * ex; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } });
    ctx.stroke(); ctx.setLineDash([]);
    if (st.ghost && st.focus === 'D' && !VW.beam) { ghostStyle(); ctx.beginPath(); st.ghost.mem.forEach((G, mi) => { const S = G.smp, g = MG[mi]; for (let i = 0; i < S.xs.length; i++) { const px = g.ax + g.ex * S.xs[i] * VW.s + S.dX[i] * ex, py = g.ay + g.ey * S.xs[i] * VW.s - S.dY[i] * ex; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } }); ctx.stroke(); ctx.setLineDash([]); }
    if ((fD || st.focus === 'M') && st.gf >= 1 && !st.prev && !st.zero.D) for (const e of st.marks.infl) {
      const M = st.sol.mem[e.mi], g = MG[e.mi], dx = FS.interp(M.smp, 'dX', e.x, -1), dy = FS.interp(M.smp, 'dY', e.x, -1);
      ctx.beginPath(); ctx.arc(g.ax + g.ex * e.x * VW.s + dx * ex, g.ay + g.ey * e.x * VW.s - dy * ex, 4, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.cM; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }
  /* method of sections: the cut */
  if (st.hand[0] && st.hand[0].cut && !VW.beam) {
    const c = st.hand[0].cut, xc = X((c.xa + c.xb) / 2);
    ctx.strokeStyle = C.load; ctx.lineWidth = 1.6; ctx.setLineDash([7, 5]); line(xc, Y(VW.y1) - 26, xc, Y(VW.y0) + 26); ctx.setLineDash([]);
    put('cut', xc, Y(VW.y1) - 36, { col: C.load, force: true });
  }
  m.nodes.forEach((n, i) => drawSupport(i));
  m.nodes.forEach((n, i) => {
    const x = X(n.x), y = Y(n.y), d = deg(i), hov = (st.hover && st.hover.type === 'joint' && st.hover.i === i) || (st.sel && st.sel.kind === 'joint' && st.sel.i === i);
    if (hov) { ctx.fillStyle = rgba(C.load, 0.2); ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); }
    if (n.hinge) { ctx.beginPath(); ctx.arc(x, y, m.truss ? 4.6 : 5.6, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke(); } else if (d >= 2 && !VW.beam) { ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); }
  });
}
function drawSupport(i) {
  const n = st.model.nodes[i], x = X(n.x), y = Y(n.y), hov = st.hover && st.hover.type === 'sup' && st.hover.i === i;
  ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  if (n.sup === 'free') { if (hov || (st.sel && st.sel.kind === 'sup' && st.sel.i === i)) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.load; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); ctx.setLineDash([]); } return; }
  if (hov || (st.sel && st.sel.kind === 'sup' && st.sel.i === i)) { ctx.fillStyle = rgba(C.load, 0.18); ctx.beginPath(); ctx.arc(x, y + (n.sup === 'fixed' ? 0 : 12), 23, 0, 7); ctx.fill(); }
  if (n.sup === 'fixed') {
    const d = memberDir(i), px = -d.y, py = d.x;
    ctx.lineWidth = 3; line(x - px * 16, y - py * 16, x + px * 16, y + py * 16);
    ctx.lineWidth = 1.2; ctx.beginPath();
    for (let t = -14; t <= 14; t += 7) { const sx = x + px * t, sy = y + py * t; ctx.moveTo(sx, sy); ctx.lineTo(sx - d.x * 8 + px * 5, sy - d.y * 8 + py * 5); }
    ctx.stroke(); return;
  }
  const by = y + 18, gy = n.sup === 'roller' ? by + 8 : by;
  ctx.lineWidth = 2; ctx.fillStyle = C.bg; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 11, by); ctx.lineTo(x + 11, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (n.sup === 'roller') for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(x + dx, by + 4, 3, 0, 7); ctx.fill(); ctx.stroke(); }
  line(x - 17, gy, x + 17, gy);
  ctx.lineWidth = 1.2; ctx.beginPath(); for (let t = -14; t <= 14; t += 7) { ctx.moveTo(x + t, gy); ctx.lineTo(x + t - 5, gy + 7); } ctx.stroke();
}

function drawDims() {
  const m = st.model;
  ctx.strokeStyle = C.mute; ctx.lineWidth = 1; ctx.lineCap = 'butt';
  const dims = (st.sol.ok && st.hand[0] && st.hand[0].dim) || [];
  /* a dimension can be clicked. Between two joints it is a step of the grid, and its length can be typed. One that
     ends at a point load belongs to that load: the click opens the menu of the load, where its place is typed */
  const ldAt = new Map();
  if (VW.beam) for (const ld of m.loads) { const mb = m.members[ld.m], x = r2(m.nodes[mb.n1].x + (m.nodes[mb.n2].x - m.nodes[mb.n1].x) * ld.a / MG[ld.m].L); if (!ldAt.has(x)) ldAt.set(x, ld.id); }
  const chain = (vals, at, horizontal) => {
    vals = [...new Set(vals.map(v => r2(v)))].sort((a, b) => a - b);
    if (vals.length < 2) return;
    const ax = horizontal ? 'x' : 'y', grid = gridOf(m, ax);
    const P = v => (horizontal ? [X(v), at] : [at, Y(v)]), a = P(vals[0]), b = P(vals[vals.length - 1]);
    ctx.strokeStyle = C.mute; ctx.lineWidth = 1; ctx.lineCap = 'butt'; ctx.setLineDash([]);
    line(a[0], a[1], b[0], b[1]);
    if (horizontal) block(a[0], at - 4, b[0], at + 4); else block(at - 4, a[1], at + 4, b[1]);   /* later labels keep off the dimension line */
/*DEBUG*/ boxes[boxes.length - 1].t = '(dimension line)'; boxes[boxes.length - 1].pad = 5;
    vals.forEach(v => { const p = P(v); if (horizontal) { line(p[0], at - 5, p[0], at + 5); line(p[0] - 3, at + 3, p[0] + 3, at - 3); } else { line(at - 5, p[1], at + 5, p[1]); line(at - 3, p[1] + 3, at + 3, p[1] - 3); } });
    for (let i = 0; i < vals.length - 1; i++) {
      const p = P(vals[i]), q = P(vals[i + 1]), len = Math.abs(horizontal ? q[0] - p[0] : q[1] - p[1]), t = n2(vals[i + 1] - vals[i]);
      const dm = dims.find(d => !!d.h === horizontal && Math.abs(d.v0 - vals[i]) < 1e-6 && Math.abs(d.v1 - vals[i + 1]) < 1e-6), nm = dm ? dm.s + ' = ' : '';
      const gi = grid.indexOf(vals[i]), step = gi >= 0 && grid[gi + 1] === vals[i + 1], di = HS.dims.length, on = st.hover && st.hover.type === 'dim' && st.hover.di === di;
      const col = on ? C.load : dm ? C.ink : C.mute;
      HS.dims.push({ b: horizontal ? [p[0] + 2, at - 22, q[0] - 2, at + 9] : [at - 9, q[1] + 2, at + 76, p[1] - 2], ax, gi: step ? gi : -1, load: step ? 0 : ldAt.get(vals[i + 1]) || ldAt.get(vals[i]) || 0 });
      if (horizontal) { if (len > 36) put(len > (dm ? 92 : 64) ? nm + t + ' m' : len > 66 ? nm + t : t, (p[0] + q[0]) / 2, at - 10, { col, font: `13px ${UI}`, force: true }); } else if (len > 24) put(nm + t + ' m', at + 8, (p[1] + q[1]) / 2, { col, font: `13px ${UI}`, align: 'left', force: true });
    }
  };
  const xs = m.nodes.map(n => n.x);
  if (VW.beam) for (const ld of m.loads) { const mb = m.members[ld.m]; xs.push(m.nodes[mb.n1].x + (m.nodes[mb.n2].x - m.nodes[mb.n1].x) * ld.a / MG[ld.m].L); }
  chain(xs, VW.dimY, true);
  if (!VW.beam && !VW.small) chain(m.nodes.map(n => n.y), VW.dimX, false);
}

/* height of a point above the line of member mi, measured along the direction the load figure is drawn in (g.ux, g.uy):
   the point is the member point below it plus that height times the direction */
const udlHeight = (mi, g, x, y) => { const e = MG[mi], den = e.ex * g.uy - e.ey * g.ux; return Math.abs(den) < 1e-9 ? 0 : (e.ex * (y - g.my) - e.ey * (x - g.mx)) / den; };
const loadLen = P => clamp(64 * (P / st.model.pref) ** 0.55, 26, 128), lenToP = len => st.model.pref * (clamp(len, 26, 128) / 64) ** (1 / 0.55);
const udlH = w => clamp(14 + 26 * (Math.abs(w) / st.model.wref) ** 0.6, 16, 62), hToW = h => (h <= 15 ? 0.5 : st.model.wref * ((Math.min(h, 62) - 14) / 26) ** (1 / 0.6));
function drawUdls() {
  const m = st.model;
  m.members.forEach((mb, mi) => {
    const u = mb.udl;
    if (!u.on || !(Math.max(u.w1, u.w2) > 0)) return;
    /* the load figure is true to scale along the member: its height at each end is the share of the high value */
    const g = MG[mi], r = u.ang * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r), top = Math.max(u.w1, u.w2), h = udlH(top), par = Math.abs(g.ex * dy - g.ey * dx) < 0.25;
    const sd = g.zx * dx + g.zy * dy > 0 ? -1 : 1, ux = par ? g.zx * sd : -dx, uy = par ? g.zy * sd : -dy;
    const f1 = u.w1 / top, f2 = u.w2 / top, uni = u.w1 === u.w2, share = t => f1 + (f2 - f1) * t, at = (t, d) => [g.ax + (g.bx - g.ax) * t + ux * d, g.ay + (g.by - g.ay) * t + uy * d];
    const hov = (st.hover && st.hover.type === 'udl' && st.hover.mi === mi) || (st.drag && st.drag.type === 'udl' && st.drag.mi === mi);
    ctx.strokeStyle = C.load; ctx.fillStyle = C.load; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    const nA = Math.max(2, Math.round(g.len / 26)), ga = ctx.globalAlpha;
    /* where the state line of this tab lies on the side of the load figure, the arrows of the load step back */
    if (!VW.beam && VW.k && !par && st.sol.ok && st.focus !== 'D' && !(st.focus === 'N' && barStyle(mi))) { const sl = Math.sign(ux * g.zx + uy * g.zy), S = series(mi)[st.focus]; if (S.some(v => v * sl * VW.k > 6)) ctx.globalAlpha = ga * 0.4; }
    if (!par) {
      const c1 = at(0, h * f1), c2 = at(1, h * f2);
      ctx.fillStyle = rgba(C.load, 0.08); ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(g.bx, g.by); ctx.fill();
      ctx.fillStyle = C.load; line(c1[0], c1[1], c2[0], c2[1]);
      for (let i = 0; i <= nA; i++) { const t = i / nA, d = h * share(t), [px, py] = at(t, 0); if (d < 11) continue; line(px + ux * d, py + uy * d, px + ux * 7, py + uy * 7); head(px + ux * 2.5, py + uy * 2.5, dx, dy, 6.5, 6, false); }
    } else for (let i = 0; i < nA; i++) { const t = (i + 0.5) / nA, k = share(t), [px, py] = at(t, 12); if (k < 0.2) continue; line(px - dx * (11 * k - 3), py - dy * (11 * k - 3), px + dx * 3, py + dy * 3); head(px + dx * 8, py + dy * 8, dx, dy, 6.5, 6, false); }
    ctx.globalAlpha = ga;
    /* one handle on the top edge: in the middle of a uniform load, nearer the high end otherwise; it keeps clear of point loads */
    const t0 = par || uni ? 0.5 : u.w2 > u.w1 ? 0.75 : 0.25, busy = t => m.loads.some(l => l.m === mi && Math.abs(l.a / g.L - t) * g.len < 17);
    const th = [0, -0.1, 0.1, -0.2, 0.2, 0.3, -0.3].map(d => t0 + d).find(t => t > 0.04 && t < 0.96 && !busy(t)) || t0, [mx, my] = at(th, 0), [kx, ky] = at(th, par ? 24 : h * share(th));
    ctx.fillStyle = hov ? C.load : C.bg; ctx.strokeStyle = C.load; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(kx - 5, ky - 5, 10, 10); ctx.fill(); ctx.stroke();
    HS.udl.set(mi, { kx, ky, mx, my, ux, uy, par, axial: Math.abs(g.ex * dy - g.ey * dx) < 1e-9, f: 1 / share(th) }); block(kx - 6, ky - 6, kx + 6, ky + 6);
    /* the value of the load. On a beam it is written at once; on a frame it waits until the values of the state lines
       are placed and then takes the first free place along its edge, so that it never pushes one of them off the sheet */
    const side = Math.abs(ux) > 0.7, say = (txt, c) => {
      c = c.map(q => [q[0], q[1], 'center']);
      if (!VW.beam) LATE.push([txt, c, [kx, ky]]);
      else if (!onText(txt, c[0], { col: C.load })) put(txt, c[0][0], c[0][1], { col: C.load, force: true });
      else putAny(txt, c.slice(1), { col: C.load, ring: [kx, ky] });   /* another value stands there already: the next free place */
    };
    ctx.font = `600 13px ${UI}`;
    if (uni || par || g.len < 170) {
      const txt = uni || !(u.w1 && u.w2) ? `${n1(top)} kN/m` : `${n1(u.w1)} to ${n1(u.w2)} kN/m`, tw = ctx.measureText(txt).width;
      const row = (px, py, sg) => [0, 46, -46, 92, -92].map(d => [px + sg * ux * (15 + (side ? tw / 2 - 4 : 0)) + g.ex * d, py + sg * uy * 15 + g.ey * d]);
      /* a load along its member stands beside it: where no place beyond its figure is free, its value goes to the other side of the member */
      say(txt, par ? row(kx, ky, 1).concat(row(mx, my, -1)) : row(kx, ky, 1));
      return;
    }
    /* a load that varies: its value at each end where it is not zero */
    for (const [t, w, sg] of [[0, u.w1, 1], [1, u.w2, -1]]) {
      if (!w) continue;
      const txt = `${n1(w)} kN/m`, tw = ctx.measureText(txt).width;
      say(txt, [0, 40, 80, 120].map(d => { const ti = t + sg * (d + (side ? 24 : 0)) / g.len, [cx, cy] = at(ti, h * share(ti)); return side ? [cx + ux * (13 + tw / 2), cy] : [cx + g.ex * sg * (tw / 2 + 1), cy + uy * 13 + g.ey * sg * (tw / 2 + 1)]; }));
    }
  });
}
function loadGeom(ld) {
  /* the arrow normally arrives at its point; when its shaft would lie on a member it leaves the point instead.
     Its knob stays on the sheet: an arrow that would run out of the sheet is drawn shorter, and where there is no room
     for the shortest arrow on its side of the point, it takes the other side */
  const g = MG[ld.m], d = ld.a / g.L * g.len, hx = g.ax + g.ex * d, hy = g.ay + g.ey * d, r = ld.ang * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r);
  const room = sg => {   /* from the point to the border of the sheet, 9 px inside it, along the arrow (sg 1) or against it (sg -1) */
    const ux = sg * dx, uy = sg * dy;
    let t = Infinity;
    if (ux > 1e-9) t = Math.min(t, (W - 9 - hx) / ux); else if (ux < -1e-9) t = Math.min(t, (9 - hx) / ux);
    if (uy > 1e-9) t = Math.min(t, (H - 9 - hy) / uy); else if (uy < -1e-9) t = Math.min(t, (9 - hy) / uy);
    return t;
  };
  let len = loadLen(ld.P), pull = st.drag && st.drag.type === 'tail' && st.drag.id === ld.id ? st.drag.pull : undefined;
  if (pull === undefined) {
    pull = [0.4, 0.85].some(f => MG.some(q => segDist(hx - dx * len * f, hy - dy * len * f, q.ax, q.ay, q.bx, q.by) < 6));
    if (!pull && room(-1) < 26 && room(1) - 10 >= 26) pull = true; else if (pull && room(1) - 10 < 26 && room(-1) >= 26) pull = false;
  }
  len = Math.max(14, Math.min(len, pull ? room(1) - 10 : room(-1)));
  const sg = pull ? 1 : -1, tx = hx + sg * dx * len, ty = hy + sg * dy * len;
  return { hx, hy, dx, dy, tx, ty, len, pull, sg, kx: tx + (pull ? dx * 10 : 0), ky: ty + (pull ? dy * 10 : 0) };
}
function drawLoads() {
  /* the values of the loads keep off the arrows: all arrows are known before the first value is set */
  const G = st.model.loads.map(loadGeom), shafts = G.map(g => [g.hx, g.hy, g.kx, g.ky]), axes = MG.map(q => [q.ax, q.ay, q.bx, q.by]);
  /* loads of the same size and direction at one point of the structure lie on top of each other: the first carries one
     value with their number, as in 3 x 20.0 kN. The point is the place on the member or the joint, not the place on the
     screen: a load 3 mm before a joint and a load on the joint are two loads with two values */
  const spot = ld => { const mm = st.model.members[ld.m], Lm = MG[ld.m].L; return ld.a <= 1e-9 ? `j${mm.n1}` : ld.a >= Lm - 1e-9 ? `j${mm.n2}` : `m${ld.m}@${ld.a.toFixed(6)}`; };
  const twin = new Map(), tkey = (ld, g) => `${spot(ld)}|${Math.round(g.kx)}|${Math.round(g.ky)}|${ld.ang}|${ld.P}`;
  st.model.loads.forEach((ld, li) => { const k = tkey(ld, G[li]); if (!twin.has(k)) twin.set(k, []); twin.get(k).push(li); });
  st.model.loads.forEach((ld, li) => {
    const tw_ = twin.get(tkey(ld, G[li])), many = tw_[0] === li ? tw_.length : 0;
    const g = G[li], on = (st.hover && (st.hover.type === 'load' || st.hover.type === 'tail') && st.hover.id === ld.id) || (st.drag && st.drag.id === ld.id) || (st.sel && st.sel.kind === 'load' && st.sel.id === ld.id);
    if (on) { ctx.strokeStyle = rgba(C.load, 0.2); ctx.lineWidth = 12; ctx.lineCap = 'round'; line(g.hx + g.sg * g.dx * 10, g.hy + g.sg * g.dy * 10, g.tx, g.ty); }
    ctx.strokeStyle = C.load; ctx.fillStyle = C.load; ctx.lineWidth = 3; ctx.lineCap = 'butt';
    if (g.pull) { line(g.hx + g.dx * 3, g.hy + g.dy * 3, g.tx - g.dx * 9, g.ty - g.dy * 9); head(g.tx, g.ty, g.dx, g.dy, 13, 11, false); } else { line(g.tx, g.ty, g.hx - g.dx * 11, g.hy - g.dy * 11); head(g.hx - g.dx * 2, g.hy - g.dy * 2, g.dx, g.dy, 13, 11, false); }
    const tOn = (st.hover && st.hover.type === 'tail' && st.hover.id === ld.id) || (st.drag && st.drag.type === 'tail' && st.drag.id === ld.id);
    ctx.beginPath(); ctx.arc(g.kx, g.ky, 5.5, 0, 7); ctx.fillStyle = tOn ? C.load : C.bg; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    const txt = many > 1 ? `${many} \u00d7 ${n1(ld.P)} kN` : `${n1(ld.P)} kN`;
    ctx.font = `600 13px ${UI}`;
    const tw = ctx.measureText(txt).width, e = Math.abs(g.dx) * tw / 2 + Math.abs(g.dy) * 8, lx = g.kx + g.sg * g.dx * (11 + e), ly = g.ky + g.sg * g.dy * (11 + e);
    const sx = (g.hx + g.tx) / 2, sy = (g.hy + g.ty) / 2;
    const beside = Math.abs(g.dx) > Math.abs(g.dy) ? [[g.kx, g.ky - 16, 'center'], [g.kx, g.ky + 17, 'center'], [sx, sy - 14, 'center'], [sx, sy + 15, 'center']] : [[g.kx + 12, g.ky, 'left'], [g.kx - 12, g.ky, 'right'], [sx + 10, sy, 'left'], [sx - 10, sy, 'right']];
    const onLine = MG.some(q => segDist(lx, ly, q.ax, q.ay, q.bx, q.by) < 9);   /* the place ahead of the arrow lies on a member */
    /* the value keeps off the arrows: beside its own arrow first; without room there it moves out on a ring around the middle of the arrow, with a hairline back to it */
    const cands = onLine ? beside.concat([[lx, ly, 'center']]) : [[lx, ly, 'center']].concat(beside);
    g.lb = many ? tryAll(txt, cands, { col: C.load, clear: shafts }) || ringPut(txt, sx, sy, { col: C.load, clear: shafts.concat(axes), strict: true }) || putAny(txt, cands, { col: C.load }) : null;
    HS.loads.set(ld.id, g);
    if (st.drag && st.drag.live && st.drag.id === ld.id && !VW.beam) {
      const mg = MG[ld.m];
      put(st.drag.type === 'load' ? `${n2(ld.a)} m` : `${Math.round(ld.ang)}\u00b0`, g.hx + mg.zx * 18, g.hy + mg.zy * 18, { col: C.mute, font: `13px ${UI}`, force: true });
    }
  });
}
function drawReactions() {
  /* a reaction is drawn when it prints other than 0.0, by the rounding of every other value */
  const R = st.sol.reactions, shown = v => n1(Math.abs(v)) !== '0.0', todo = [];
  const sty = () => { ctx.strokeStyle = C.load; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); };
  ctx.globalAlpha = clamp(st.gf * 1.3, 0, 1);
  st.model.nodes.forEach((n, i) => {
    if (n.sup === 'free') return;
    const r = R[i], x = X(n.x), y = Y(n.y), d = n.sup === 'fixed' ? memberDir(i) : { x: 0, y: -1 }, wall = Math.abs(d.x) > 0.7;
    if (n.sup === 'fixed') block(x - (wall ? 10 : 18), y - (wall ? 18 : 4), x + (wall ? 10 : 18), y + (wall ? 18 : 10)); else block(x - 18, y + 2, x + 18, y + (n.sup === 'roller' ? 34 : 26));
    const off = n.sup === 'pin' ? 22 : n.sup === 'roller' ? 30 : wall ? 4 : 12;
    let rxSide = 0;
    if (r.has[1] && shown(r.Ry)) {
      const xr = x + (wall ? d.x * 9 : 0), y1 = y + off + 5, y2 = y + off + 38;
      sty(); line(xr, y1 + 1, xr, y2 - 1); if (r.Ry > 0) head(xr, y1, 0, -1, 9, 9, true); else head(xr, y2, 0, 1, 9, 9, true);
      block(xr - 5, y1, xr + 5, y2);
      todo.push([`${n1(Math.abs(r.Ry))} kN`, wall ? [[xr, y2 + 13, 'center'], [xr + 11, y2 - 10, 'left'], [xr - 11, y2 - 10, 'right']] : [[xr + 11, y2 - 10, 'left'], [xr - 11, y2 - 10, 'right'], [xr, y2 + 13, 'center']], [xr, (y1 + y2) / 2]]);
    }
    if (r.has[0] && shown(r.Rx)) {
      let xa, xb, yy;
      const d1 = deg(i) === 1 ? memberDir(i) : null;
      let near = wall ? 15 : 23, far = wall ? 52 : 60;
      rxSide = wall ? -d.x : d1 && Math.abs(d1.x) > 0.5 ? -Math.sign(d1.x) : r.Rx > 0 ? -1 : 1;
      /* a member that leaves the joint along the arrow, as at a support between two spans: the arrow and its value stay
         below the member. A fixed support there has its ground line on the axis: its arrow goes below that line and starts
         further out, so that the letter of the joint keeps its place between the two */
      const along = st.model.members.some((mb, mi) => (mb.n1 === i || mb.n2 === i) && Math.abs(MG[mi].ex) > 0.7 && Math.sign(MG[mi].ex * (mb.n1 === i ? 1 : -1)) === rxSide);
      if (along && n.sup === 'fixed' && !wall) { near += 17; far += 17; }
      /* the arrow stays on the sheet: where its side of the support is short of room it is drawn shorter */
      const lim = (rxSide < 0 ? x : W - x) - 8;
      if (far > lim) { far = Math.max(lim, near + 14); near = Math.min(near, Math.max(far - 22, wall ? 12 : 14)); }
      xa = x + rxSide * (r.Rx > 0 === rxSide < 0 ? far : near); xb = x + rxSide * (r.Rx > 0 === rxSide < 0 ? near : far); yy = y + (n.sup === 'fixed' ? (wall ? 0 : along ? 12 : 2) : 10);
      sty(); line(xa, yy, xb, yy); head(xb, yy, Math.sign(xb - xa), 0, 9, 9, true);
      block(xa, yy - 5, xb, yy + 5);
      /* above the arrow (not where a member runs there); beyond its end; below it, clear of the support; below the support; on the other side of the support */
      const out = rxSide > 0 ? 'left' : 'right', c = [[(xa + xb) / 2, yy - 12, 'center'], [x + rxSide * (far + 8), yy, out], [x + rxSide * near, yy + 17, out], [(xa + xb) / 2, y + (n.sup === 'roller' ? 46 : 38), 'center']];
      if (along) c.shift();
      if (!wall) c.push([x - rxSide * 24, yy + 5, rxSide > 0 ? 'right' : 'left']);
      todo.push([`${n1(Math.abs(r.Rx))} kN`, c, [(xa + xb) / 2, yy]]);
    }
    if (r.has[2] && shown(r.Mz)) {
      const sd = wall ? d.x : (rxSide ? -rxSide : -1), cx = x + sd * (wall ? 44 : 36), cy = y + (wall ? 28 : 30), q = Math.PI / 4, ccw = r.Mz > 0, ae = ccw ? 3 * q : q;
      sty(); ctx.beginPath(); if (ccw) ctx.arc(cx, cy, 11, q, 3 * q, true); else ctx.arc(cx, cy, 11, 3 * q, q, false); ctx.stroke();
      head(cx + 11 * Math.cos(ae), cy + 11 * Math.sin(ae), ccw ? Math.sin(ae) : -Math.sin(ae), ccw ? -Math.cos(ae) : Math.cos(ae), 8, 8, true);
      block(cx - 13, cy - 13, cx + 13, cy + 13);
      todo.push([`${n1(Math.abs(r.Mz))} kNm`, [[cx + sd * 18, cy, sd > 0 ? 'left' : 'right'], [cx, cy + 28, 'center'], [cx, cy - 25, 'center'], [cx - sd * 18, cy, sd > 0 ? 'right' : 'left']], [cx, cy]]);
    }
  });
  /* the value of a reaction first looks for a place that no load arrow runs through: beside its arrow, then on a ring
     around it, where it also keeps off the members; only when there is none it stands where no other value stands */
  const shafts = [...HS.loads.values()].map(g => [g.hx, g.hy, g.kx, g.ky]), lines = shafts.concat(MG.map(q => [q.ax, q.ay, q.bx, q.by]));
  for (const t of todo) {
    const b = (shafts.length && (tryAll(t[0], t[1], { col: C.load, clear: shafts }) || ringPut(t[0], t[2][0], t[2][1], { col: C.load, clear: lines, strict: true }))) || putAny(t[0], t[1], { col: C.load });
    HS.rlab.push([t[0], b]);
  }
  ctx.globalAlpha = 1;
}
function drawLetters() {
  const m = st.model, f = { font: `600 14px ${UI}` };
  let cx = 0, cy = 0;
  m.nodes.forEach(n => { cx += X(n.x) / m.nodes.length; cy += Y(n.y) / m.nodes.length; });
  m.nodes.forEach((n, i) => {
    if (!n.lbl) return;
    const x = X(n.x), y = Y(n.y), base = VW.beam || n.y < VW.y0 + 1e-9, d = memberDir(i);
    let c;
    if (base && (n.sup === 'pin' || n.sup === 'roller')) c = [[x - 29, y + 11], [x + 29, y + 11], [x - 19, y - 15], [x + 19, y - 15]];
    else if (base && n.sup === 'fixed' && Math.abs(d.x) > 0.7) c = [[x - d.x * 20, y - 28], [x - d.x * 20, y + 30], [x + d.x * 14, y - 16]];
    else if (base && n.sup === 'fixed') c = [[x - 28, y + 21], [x + 28, y + 21], [x - 20, y - 16], [x + 20, y - 16]];
    else if (VW.beam) c = n.sup === 'free' && deg(i) === 1 ? [[x - d.x * 15, y + 2], [x, y + 19]] : [[x, y + 19], [x, y - 17]];
    else { const u = Math.hypot(x - cx, y - cy) || 1, ux = (x - cx) / u, uy = (y - cy) / u; c = [[x + ux * 21, y + uy * 21], [x + ux * 21, y - uy * 21], [x - ux * 21, y + uy * 21]]; }
    putAny(n.lbl, c.map(q => [q[0], q[1], 'center']), { ...f, ring: [x, y] });
  });
}

/* ---------- stacked lines of a beam ---------- */
/* The relation of each line stands in a row under its strip, each symbol in the colour of its line: the load q orange,
   V teal, M violet. Behind it the same in words: by so much the line changes for each metre along the beam. With the
   mouse on the beam the number of that place stands behind the symbols, in the colour of the line it is read from
   (drawProbe): the number behind M′ = V is the shear there, the one the box in the strip of V shows. The row of the
   deflection has two relations: w′ = θ, and EI·w″ = −M, which ties its curvature to the moment.
   A row keeps the whole width of the strips, and no other text is set into it */
const EQ = () => [' = ', C.mute];
const REL = {
  V: sg => [['V′', C.cV], EQ(), [`${sg || qSign()}q`, C.load]],
  M: () => [['M′', C.cM], EQ(), ['V', C.cV]],
  D: () => [['w′', C.ink], EQ(), ['θ', C.ink]],
  N: () => [['N′', C.cT], EQ(), ['−n', C.load]],
  K: () => [['EI·w″', C.ink], EQ(), ['−M', C.cM]],
};
/* The pieces of the row of a line, in groups: the relation, the same in words, and for the deflection the second relation.
   d: the numbers of a place ({ a, b, two }: just before and just after it, two where they are two values; m: −M there;
   step: by how much the line itself steps there, at a point load or a support).
   o.along: the row of a frame speaks of a member; o.sides: how the two values of a place are called there */
function relRow(key, d, o = {}) {
  const bold = `600 14px ${UI}`, plain = `13px ${UI}`, strong = `600 13px ${UI}`, it = `italic 16px ${MATH}`, sym = SYM[key], un = { V: 'kN/m', M: 'kN', D: 'mrad', N: 'kN/m' }[key], per = { V: 'kN', M: 'kNm', D: 'mm', N: 'kN' }[key];
  const own = { V: C.cV, M: C.cM, D: C.ink, N: C.cT }[key], col = { V: C.load, M: C.cV, D: C.ink, N: C.load }[key], sgn = x => (x > 0 && n1(x) !== '0.0' ? '+' : '') + n1(x), w = t => [t, C.mute, plain];
  const main = REL[key](key === 'V' && d ? (d.a > 1e-9 || (Math.abs(d.a) <= 1e-9 && d.b > 1e-9) ? '+' : '−') : null);
  if (d) main.push(EQ(), [d.two ? `${n1(d.a)} | ${n1(d.b)} ${un}` : `${n1(d.a)} ${un}`, col, bold, 1]);
  /* in words: by so much the line changes for each metre; at a point load or a support, by how much it steps there */
  const rate = d && [[`${d.two ? `${sgn(d.a)} | ${sgn(d.b)}` : sgn(d.a)} ${per}`, col, strong], w(` per metre${d.two ? ` (${o.sides || 'left | right'})` : ''}`)];
  const say = !d ? [w(`per metre${o.along ? ' along a member' : ''} `), [sym, own, it], w(' changes by '), [key === 'V' ? `${qSign()}q` : key === 'M' ? 'V' : key === 'D' ? 'θ' : '−n', col, it]]
    : d.step ? [w('here '), [sym, own, it], w(' steps by '), [`${sgn(d.step)} kN`, C.load, strong], ...(d.two || n1(d.a) !== '0.0' ? [w(' and changes by '), ...rate] : [])]
      : [w('here '), [sym, own, it], w(' changes by '), ...rate];
  const groups = [{ segs: main, pr: 0 }, { segs: say, pr: 2 }];
  if (key === 'D') { const k = REL.K(); if (d) k.push(EQ(), [`${n1(d.m)} kNm`, C.cM, bold, 1]); groups.push({ segs: k, pr: 1 }); }
  if (key === 'N' && !d) groups.push({ segs: [w('+ tension, − compression')], pr: 3 });
  return groups;
}
/* writes the groups of a row from x, as many as its room takes: the words go first, then the second relation. A number
   stands on a tint of its colour. Returns what it wrote, piece by piece (for the checks) */
function drawRel(groups, x, y, font, room) {
/*DEBUG*/ window.__row = 1;
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  const GAP = 24, wOf = g => { ctx.font = g[2] || font; return ctx.measureText(g[0]).width + (g[3] ? 12 : 0); };
  let use = groups.slice();
  const width = () => use.reduce((t, G) => t + G.segs.reduce((q, g) => q + wOf(g), 0), 0) + GAP * (use.length - 1);
  while (use.length > 1 && width() > room) { const worst = Math.max(...use.map(G => G.pr)); use = use.filter(G => G.pr !== worst); }
  let xx = x;
  use.forEach((G, i) => {
    if (i) xx += GAP;
    for (const g of G.segs) {
      ctx.font = g[2] || font;
      const tw = ctx.measureText(g[0]).width;
      if (g[3]) { ctx.fillStyle = C.bg; ctx.beginPath(); ctx.roundRect(xx, y - 10, tw + 12, 20, 6); ctx.fill(); ctx.fillStyle = rgba(g[1], 0.16); ctx.fill(); xx += 6; }
      else { ctx.lineWidth = 4; ctx.strokeStyle = C.bg; ctx.strokeText(g[0], xx, y + 0.5); }
      ctx.fillStyle = g[1]; ctx.fillText(g[0], xx, y + 0.5); xx += tw + (g[3] ? 6 : 0);
    }
  });
  ctx.restore();
/*DEBUG*/ window.__row = 0;
  return use.map(G => G.segs.map(g => g[0]).join(''));
}
/* the band of a row: kept clear of every other text */
function rowBand(x, y, room, name) {
  const b = [x - 3, y - ROWH / 2 + 1, x + room + 3, y + ROWH / 2 - 1];
  boxes.push(b); texts.push(b);
/*DEBUG*/ b.t = name; b.pad = 3;
}
function rowBands() {   /* before any note or value of the lines is placed */
  VW.rel = {};
  if (!VW.rows) return;
  const x = X(VW.x0), room = X(VW.x1) - x;
  for (const p of VW.plots) {
    if (p.h <= 40 || st.pw[p.k] < 0.6) continue;
    const y = p.y + p.h + 3 + ROWH / 2;
    rowBand(x, y, room, `row of ${SYM[p.k]}`);
    VW.rel[p.k] = { x, y, font: `italic ${st.focus === p.k ? 19 : 17}px ${MATH}`, room };
  }
}
function rowTexts() {   /* over the lines that link the strips; with the probe on the beam it writes the rows itself, with its numbers */
  if (probeTarget()) return;
  for (const k in VW.rel) { const r = VW.rel[k]; ctx.globalAlpha = clamp(st.pw[k] * 1.5 - 0.3, 0, 1); r.said = drawRel(relRow(k, null), r.x, r.y, r.font, r.room); }
  ctx.globalAlpha = 1;
}
/* A frame and a truss carry their lines on the members. The relation of the open tab stands in one row under the
   structure; with the mouse on a member the numbers of that place stand in it (drawProbe). A truss has the row of N */
function frameRow(d, probe) {
  if (!probe) VW.rel = null;
  const key = st.focus;
  if (!VW.rows || !st.sol.ok || (st.model.truss ? key !== 'N' : st.zero[key])) return;
  const x = 16, y = VW.rowY, room = W - 2 * x, font = `italic 19px ${MATH}`;
  if (!probe) { rowBand(x, y, room, `row of ${SYM[key]}`); if (probeTarget()) return; }
  VW.rel = { key, x, y, font, room, said: drawRel(relRow(key, d, { along: true, sides: 'before | after' }), x, y, font, room) };
}
function drawPlots() {
  VW.pi = {};
  for (const p of VW.plots) {
    const key = p.k, ek = key === 'D' ? 'W' : key, [lo, hi] = st.ext[ek], pad = p.h > 84 ? 18 : p.h > 50 ? 13 : 4;
    const sc = Math.max(0, p.h - 2 * pad) / (hi - lo), y0 = p.y + pad - lo * sc, foc = st.focus === key, col = qCol(key, 1);
    VW.pi[key] = { y0, sc, p };
    ctx.globalAlpha = clamp(st.pw[key] * 1.5 - 0.3, 0, 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (p.h > 40) {
      ctx.font = `italic 500 ${foc ? 27 : 22}px ${MATH}`; ctx.fillStyle = col; ctx.fillText(SYM[key], VW.small ? 8 : 14, p.y + p.h / 2 - 9);
      ctx.font = `13px ${UI}`; ctx.fillStyle = C.mute; ctx.fillText(UNIT[key], VW.small ? 8 : 14, p.y + p.h / 2 + 13);
    }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'; line(X(VW.x0), y0, X(VW.x1), y0);
    if (!st.zero[ek]) {
      const val = (mi, last) => { const S = series(mi), i = last ? S.xs.length - 1 : 0; return key === 'D' ? -S.dY[i] : S[key][i]; };
      const same = (a, b) => Math.abs(val(a, true) - val(b, false)) < 1e-6 * Math.max(-lo, hi);
      st.sol.mem.forEach((M, mi) => {
        const S = series(mi), g = { ax: MG[mi].ax, ay: y0, ex: 1, ey: 0, zx: 0, zy: 1 };
        let vals = S[key];
        if (key === 'D') { vals = new Float64Array(S.xs.length); for (let i = 0; i < vals.length; i++) vals[i] = -S.dY[i]; }
        const prv = st.sol.mem.findIndex(q => q.n2 === M.n1), nxt = st.sol.mem.findIndex(q => q.n1 === M.n2);
        const contL = prv >= 0 && same(prv, mi), contR = nxt >= 0 && same(mi, nxt);
        for (const r of runs(S.xs, vals)) {
          const o = key === 'D' ? { hatch: false, fill: 0.07, lw: 2.4, sign: false } : {};
          if (contL && r.p[0] <= 1e-9) o.endL = false;
          if (contR && r.p[r.p.length - 2] >= M.L - 1e-9) o.endR = false;
          drawRun(g, r, sc, qCol(key, r.sg), o);
        }
      });
    }
    if (st.ghost) st.ghost.mem.forEach((G, mi) => {
      const S = G.smp, ax = MG[mi].ax;
      ghostStyle(); ctx.beginPath();
      for (let i = 0; i < S.xs.length; i++) { const px = ax + S.xs[i] * VW.s, py = y0 + (key === 'D' ? -S.dY[i] : S[key][i]) * sc; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
    });
    if (st.zero[ek] && p.h > 40) put(key === 'N' ? noAxialNote() : `${SYM[key]} = 0`, (X(VW.x0) + X(VW.x1)) / 2, y0 - 12, { col: C.mute, font: `13px ${UI}`, force: true });
  }
  ctx.globalAlpha = 1;
  rowBands();
  let turnNote = null;   /* what the marks of the turns of the deflection say: written after the numbers of the lines */
  /* why the lines look as they do: links between them */
  if (st.gf >= 1 && !st.prev && !(st.drag && st.drag.live)) {
    const pv = VW.pi.V, pm = VW.pi.M, pd = VW.pi.D;
    ctx.lineWidth = 1; ctx.strokeStyle = C.mute; ctx.setLineDash([3, 3]);
    let first = true;
    const said = {};   /* under a point load the shear jumps through zero; elsewhere it is zero */
    if (pv && pm && (st.focus === 'M' || st.focus === 'V')) for (const e of st.marks.ext) {
      const x = MG[e.mi].ax + e.x * VW.s, ym = pm.y0 + e.v * pm.sc, kind = e.flat ? 2 : +!!e.jump + (e.low ? 3 : 0);
      if (e.flat) {   /* V = 0 over a stretch: the moment keeps its value there, the stretch is marked on both lines */
        const xa = MG[e.mi].ax + e.flat[0] * VW.s, xb = MG[e.mi].ax + e.flat[1] * VW.s;
        line(xa, pv.y0, xa, ym); line(xb, pv.y0, xb, ym); ctx.setLineDash([]);
        ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = C.cV; line(xa, pv.y0, xb, pv.y0); ctx.strokeStyle = C.cM; line(xa, ym, xb, ym); ctx.restore();
        const x0b = st.sol.mem[e.mi].x1 - VW.x0;
        put(`V = 0 from ${n2(x0b + e.flat[0])} to ${n2(x0b + e.flat[1])} m: M constant`, xa + 8, VW.rows ? pm.p.y + 8 : (pv.p.y + pv.p.h + pm.p.y) / 2, { col: C.mute, font: `13px ${UI}`, align: 'left' });
        ctx.setLineDash([3, 3]);
        continue;
      }
      line(x, pv.y0, x, ym); ctx.setLineDash([]);
      for (const [yy, c] of [[pv.y0, C.cV], [ym, C.cM]]) { ctx.beginPath(); ctx.arc(x, yy, 3.6, 0, 7); ctx.fillStyle = c; ctx.fill(); }
      /* what the mark says, once for each kind: beside its line, on the other side when that place is taken, then a line lower or higher */
      /* with rows under the lines the gap between the two strips belongs to the row of V: the note stands at the top of the strip of M, or at the foot of that of V */
      if (!said[kind]) { const txt = `${e.jump ? 'V changes sign' : 'V = 0'}: ${e.low ? 'low point' : 'peak'} of M`, yc = VW.rows ? pm.p.y + 8 : (pv.p.y + pv.p.h + pm.p.y) / 2, up = VW.rows ? pv.p.y + pv.p.h - 8 - yc : -19;
        for (const [dx, dy, al, strict] of [[8, 0, 'left', true], [-8, 0, 'right', true], [8, 19, 'left', true], [-8, 19, 'right', true], [8, up, 'left', true], [-8, up, 'right', true], [8, 0, 'left', false], [8, 19, 'left', false], [8, up, 'left', false]])
          if ((said[kind] = !!put(txt, x + dx, yc + dy, { col: C.mute, font: `13px ${UI}`, align: al, strict }))) break; }
      ctx.setLineDash([3, 3]);
    }
    first = true;
    if (pm && pd && !st.zero.W && (st.focus === 'M' || st.focus === 'D')) for (const e of st.marks.infl) {
      const x = MG[e.mi].ax + e.x * VW.s, yd = pd.y0 - FS.interp(st.sol.mem[e.mi].smp, 'dY', e.x, -1) * pd.sc;
      line(x, pm.y0, x, yd); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, pm.y0, 3.6, 0, 7); ctx.fillStyle = C.cM; ctx.fill();
      ctx.beginPath(); ctx.arc(x, yd, 4, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = C.mute;
      if (first) { put('M = 0: inflection', x + 8, VW.rows ? pd.p.y + 8 : pd.p.y - 5, { col: C.mute, font: `13px ${UI}`, align: 'left' }); first = false; }
      ctx.setLineDash([3, 3]);
    }
    /* Where the rotation is zero the deflection line turns: its tangent lies flat there, drawn as a short dashed line
       with a dot. The deflection is largest there, and that is often not the place of the largest moment. What the mark
       says is written once for a peak and once for a low point (a dip between two peaks on the same side of the axis),
       at the largest of each kind: inside the bow of the line, beside the turn, or under the number of the turn, at the
       first of these places where no line and no text is. The words stay inside the strip of the deflection: under it
       stand the next strip or the words at the foot of the sheet. While the probe stands within 150 px of that turn its
       box and its triangle take the place: the words are left out then, and the row of the line reads θ = 0 */
    if (pd && pd.p.h >= 46 && !st.zero.W && (st.focus === 'M' || st.focus === 'D')) {
      const tops = [], segs = [];
      st.sol.mem.forEach((M, mi) => {
        const xs = M.smp.xs, ax = MG[mi].ax;
        for (let i = 1; i < xs.length; i++) segs.push([ax + xs[i - 1] * VW.s, pd.y0 - M.smp.dY[i - 1] * pd.sc, ax + xs[i] * VW.s, pd.y0 - M.smp.dY[i] * pd.sc]);
        for (const [xv, bv, , before] of wTops(M)) if (n1(bv * 1000) !== '0.0') tops.push({ x: ax + xv * VW.s, y: pd.y0 + bv * pd.sc, w: bv, low: bv * before < 0 });
      });
      tops.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
      ctx.lineWidth = 1; ctx.strokeStyle = C.mute;
      for (const t of tops) { ctx.setLineDash([3, 3]); line(t.x - 26, t.y, t.x + 26, t.y); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(t.x, t.y, 3.2, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); }
      turnNote = () => { const said = {}, probe = probeTarget() ? st.mouse.x : null;
        for (const t of tops) { const kind = t.low ? 'low point' : 'peak', up = t.w > 0 ? -1 : 1;   /* up: from the turn toward the axis */
          if (said[kind]) continue;
          if (probe !== null && Math.abs(probe - t.x) < 150) { said[kind] = true; continue; }
          for (const [dx, dy, al] of [[0, up * 15, 'center'], [34, 0, 'left'], [-34, 0, 'right'], [34, up * 15, 'left'], [-34, up * 15, 'right'], [0, up * -29, 'center'], [14, up * -29, 'left'], [-14, up * -29, 'right']]) {
            if (t.y + dy - 9 < pd.p.y || t.y + dy + 9 > pd.p.y + pd.p.h) continue;
            if ((said[kind] = !!put(`θ = 0: ${kind} of w`, t.x + dx, t.y + dy, { col: C.mute, font: `13px ${UI}`, align: al, strict: true, clear: segs }))) break; } } };
    }
    ctx.setLineDash([]);
  }
  /* the relation of each line sits in its top right corner; it steps aside for a value that stands there, along the top
     edge of its strip, and is left out where the edge is full: it never lies on a value */
  const chips = () => {
    if (VW.rows) return;   /* the relations stand in the rows under the strips */
    for (const p of VW.plots) {
      if (p.h <= 40) continue;
      const xr = W - VW.gr, y = p.y + 10;
      ctx.globalAlpha = clamp(st.pw[p.k] * 1.5 - 0.3, 0, 1);
      const segs = p.k === 'N' ? null : p.k === 'D' ? REL.K() : REL[p.k]();
      tryAll(segs ? segs.map(g => g[0]).join('') : CHIP[p.k], [[xr, y, 'right'], [xr - 64, y, 'right'], [xr - 128, y, 'right'], [X(VW.x0) + 6, y, 'left'], [xr - 192, y, 'right'], [X(VW.x0) + 70, y, 'left'], [xr - 256, y, 'right']], { font: `italic ${st.focus === p.k ? 16 : 14}px ${MATH}`, col: C.mute, segs });
    }
    ctx.globalAlpha = 1;
  };
  if (!st.vals) { rowTexts(); if (turnNote) turnNote(); return chips(); }
  for (const p of VW.plots) {
    const key = p.k, ek = key === 'D' ? 'W' : key, pi = VW.pi[key], L = [];
    if (st.zero[ek] || p.h < 46) continue;
    const xL = X(VW.x0), xR = X(VW.x1);
    /* a value at an end of the beam stands inside it; a value beside a step (sd) stands on its own side of the step; a value whose place is taken moves a little along the line */
    const add = (x, v, vd, txt, pr, sd = 0) => { const sg = v >= 0 ? 1 : -1, aL = x < xL + 16, aR = x > xR - 16;
      if (L.some(l => l.t === txt && Math.abs(l.x0 - x) < 4 && l.sd === sd)) return;   /* two places less than 4 px apart that print the same: one number */
      L.push({ x0: x, sd, t: txt, x: aL ? xL + 3 : aR ? xR - 3 : x + sd * 4, align: aL ? 'left' : aR ? 'right' : sd < 0 ? 'right' : sd > 0 ? 'left' : 'center', y: pi.y0 + vd * pi.sc + sg * 11, pr, col: qCol(key, v), alt: (aL || aR ? [[0, 0]] : sd ? [[0, 0], [sd * 30, 0]] : [[0, 0], [-30, 0], [30, 0]]).concat(Math.abs(vd * pi.sc) > 30 ? (aL || aR ? [[0, -sg * 24]] : sd ? [[0, -sg * 24], [sd * 30, -sg * 24]] : [[0, -sg * 24], [-30, -sg * 24], [30, -sg * 24]]) : []) }); };
    st.sol.mem.forEach((M, mi) => {
      const S = series(mi), x1 = MG[mi].ax;
      if (key === 'D') {
        /* every largest value, free end and load point whose deflection prints other than 0.0 carries its number */
        const xs = M.smp.xs, w = i => -M.smp.dY[i], n = xs.length, shown = v => n1(v * 1000) !== '0.0';
        for (const [xv, bv, i] of wTops(M)) if (shown(bv)) add(x1 + xv * VW.s, bv, -S.dY[i], n1(bv * 1000), Math.abs(bv));
        for (const [i, ni] of [[0, M.n1], [n - 1, M.n2]]) if (st.model.nodes[ni].sup === 'free' && shown(w(i))) add(x1 + xs[i] * VW.s, w(i), -S.dY[i], n1(w(i) * 1000), Math.abs(w(i)) * 0.99);
        for (const p of M.ll.pts) { const b = -FS.interp(M.smp, 'dY', p.a, -1); if (p.a > 1e-9 && p.a < M.L - 1e-9 && shown(b)) add(x1 + p.a * VW.s, b, -FS.interp(S, 'dY', p.a, -1), n1(b * 1000), Math.abs(b) * 0.98); }
        /* The rotation θ at the supports and at the free ends, while this tab is open (not on a narrow sheet, where the
           probe and the hand formulas show it): where it prints other than 0.0.
           It stands beside the line: at a support on the side where the line leaves the axis, across the axis from it;
           at a free end across the line from the value of the deflection. A joint between two members is named once. */
        if (st.focus === 'D' && !VW.small) for (const [i, ni, sd] of [[0, M.n1, 1], [n - 1, M.n2, -1]]) {
          const nd = st.model.nodes[ni], th = -FS.interp(M.smp, 'rot', xs[i], sd), free = nd.sup === 'free';
          if (nd.hinge || (free && deg(ni) !== 1) || (sd === 1 && deg(ni) > 1) || n1(th * 1000) === '0.0') continue;
          /* the side of the joint on which the line runs below the axis, where there is a member on that side */
          const side = deg(ni) === 1 ? sd : th > 0 ? 1 : -1, below = th * side > 0, x = x1 + xs[i] * VW.s, aL = x < xL + 16, aR = x > xR - 16, t = `θ = ${n1(th * 1000)} mrad`;
          if (free) {   /* on the line of the value of the deflection, inside it: beyond the end of the line there is no room, and above it the line itself runs */
            ctx.font = VW.small ? `600 11.5px ${UI}` : `600 13px ${UI}`;
            const off = 3 + (shown(w(i)) ? ctx.measureText(n1(w(i) * 1000)).width + 12 : 0), sg = w(i) >= 0 ? 1 : -1;
            L.push({ x0: x, sd: 0, t, x: aL ? xL + off : xR - off, align: aL ? 'left' : 'right', y: pi.y0 - S.dY[i] * pi.sc + sg * 11, pr: 0, col: C.mute, alt: [[0, 0], [0, sg * 16]] });
          } else L.push({ x0: x, sd: 0, t, x: aL ? xL + 3 : aR ? xR - 3 : x + side * 5, align: aL ? 'left' : aR ? 'right' : side > 0 ? 'left' : 'right', y: pi.y0 + (below ? -13 : 13), pr: 0, col: C.mute, alt: [[0, 0], [0, below ? -15 : 15], [0, below ? 28 : -28]] });
        }
        return;
      }
      for (const kp of keyPts(M, key)) if (n1(kp.v) !== '0.0') add(x1 + kp.x * VW.s, kp.v, FS.interp(S, key, kp.x, kp.side), n1(kp.v), Math.abs(kp.v), kp.edge ? kp.side : 0);
    });
    placeLabels(L);
  }
  rowTexts(); if (turnNote) turnNote(); chips();
}

/* ---------- probe ---------- */
function panel(lines, x, y) {   /* small readout: [label, value, colour] */
  ctx.font = `600 13px ${UI}`;
  const wl = Math.max(...lines.map(l => ctx.measureText(l[0]).width)), wv = Math.max(...lines.map(l => ctx.measureText(l[1]).width)), w = wl + wv + 28, h = lines.length * 19 + 10;
  x = clamp(x, 4, W - w - 4); y = clamp(y, 4, H - h - 4);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => { const yy = y + 15 + i * 19; ctx.font = `${l[3] ? 600 : 400} 13px ${UI}`; ctx.textAlign = 'left'; ctx.fillStyle = l[2] || C.mute; ctx.fillText(l[0], x + 9, yy); ctx.font = `600 13px ${UI}`; ctx.textAlign = 'right'; ctx.fillStyle = l[3] ? (l[2] || C.ink) : C.ink; ctx.fillText(l[1], x + w - 9, yy); });
}
/* a small text of the probe on a paper ground, over what is drawn there */
function tag(txt, x, y, col, font, align = 'center') {
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.setLineDash([]);
  const w = ctx.measureText(txt).width, xa = clamp(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, 5, W - w - 5);
  ctx.globalAlpha = 0.9; ctx.fillStyle = C.bg; ctx.beginPath(); ctx.roundRect(xa - 4, y - 9, w + 8, 18, 5); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = col; ctx.fillText(txt, xa, y + 0.5); ctx.restore();
}
/* What the probe reads now: on a beam the place under the mouse, on a frame a member and the place on it. Nothing while
   a load is dragged, while a menu is open and while the mouse is elsewhere. The rows of the relations ask it too: with the
   probe on, the probe writes them */
function probeTarget() {
  if (!st.sol.ok || !st.mouse || st.drag || !pop.hidden) return null;
  /* on a frame a point load under the mouse puts the probe at the load, on its member */
  const ld = st.hover && st.hover.type === 'load' && !VW.beam ? st.model.loads.find(l => l.id === st.hover.id) : null;
  const h = ld ? { type: 'member', mi: ld.m, a: ld.a, load: true } : st.hover;
  if (h && h.type !== 'member') return null;
  if (VW.beam) { const mx = st.mouse.x; return mx < X(VW.x0) - 14 || mx > X(VW.x1) + 14 || st.mouse.y < VW.yB - 12 ? null : { beam: true }; }
  return h || null;
}
function drawProbe() {
  st.probeRead = null;
  const h = probeTarget();
  if (!h) return;
  if (VW.beam) {
    const mx = st.mouse.x;
    let xw = clamp(Math.round((mx - VW.ox) / VW.s / 0.05) * 0.05, VW.x0, VW.x1);
    /* The places the probe stands on when the mouse is within 6 px of one: joints, point loads and marked peaks. A point
       load and a peak carry their member and their own place on it: the values are read at that place and at no
       neighbour (review 09, C98: a peak 0.3 micrometres behind a load was read at the load). Of several on the same
       pixel (within a hundredth of one) a point load is taken first, then a joint, then a peak: the two sides of a load
       say most, and the peak has its mark and its number on the line. */
    const keys = st.model.nodes.map(n => ({ x: n.x, rank: 1 }));
    /* a load on a joint stands on the joint: the probe reads the two sides of the joint there, whichever of the two members
       holds the load. Only a load inside a member carries that member and its place */
    st.sol.mem.forEach(M => { for (const p of M.ll.pts) keys.push(p.a > 1e-9 && p.a < M.L - 1e-9 ? { x: M.x1 + p.a, M, a: p.a, rank: 0 } : { x: M.x1 + p.a, rank: 0 }); });
    for (const e of st.marks.ext) { const Me = st.sol.mem[e.mi]; keys.push({ x: Me.x1 + e.x, M: Me, a: e.x, rank: 2 }); }
    let key = null;
    { let near = 6; for (const k of keys) near = Math.min(near, Math.abs(X(k.x) - mx));
      if (near < 6) for (const k of keys) if (Math.abs(X(k.x) - mx) <= near + 0.01 && (!key || k.rank < key.rank)) key = k; }
    if (key) xw = key.x;
    const mem = st.sol.mem.slice().sort((a, b) => a.x1 - b.x1), M = key && key.M ? key.M : mem.find(q => xw <= q.x2 + 1e-9) || mem[mem.length - 1];
    const xl = key && key.M ? key.a : clamp(xw - M.x1, 0, M.L);
    st.probeAt = { mi: M.i, a: xl, kind: key ? ['load', 'joint', 'peak'][key.rank] : 'place' };   /* for the checks */
    /* what the probe reads here, quantity by quantity and side by side, as it prints it (for the checks and for the
       comparison of one version with the next: review 11, C129) */
    st.probeRead = { mi: M.i, a: xl, x: xw - VW.x0, rows: {} };
    const sd = xl <= 1e-9 ? 1 : -1;
    const f = FS.forcesAt(M, xl, sd), w = -FS.interp(M.smp, 'dY', xl, sd), phi = -FS.interp(M.smp, 'rot', xl, sd), px = X(xw), last = VW.plots[VW.plots.length - 1];
    /* just after the point: on the same member, or at the start of the next one. At a point load, a support or a hinge a line steps or kinks there */
    const Mn = sd === 1 ? null : xl < M.L - 1e-9 ? M : mem[mem.indexOf(M) + 1] || null, xr = Mn === M ? xl : 0;
    const g = Mn ? FS.forcesAt(Mn, xr, 1) : null, phiR = Mn ? -FS.interp(Mn.smp, 'rot', xr, 1) : phi;
    const two = (a, b) => Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) || n1(a) !== n1(b);
    ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 1; line(px + 0.5, VW.yB - 6, px + 0.5, last.y + last.h);
    put(`x = ${n2(xw - VW.x0)} m`, px, VW.dimY + 13, { font: `600 13px ${UI}`, force: true });
    const right = px < W - 190;
    for (const p of VW.plots) {
      const key = p.k, pi = VW.pi[key];
      const v = key === 'D' ? w : f[key], vR = key === 'D' || !g ? v : g[key], yy = pi.y0 + v * pi.sc, yR = pi.y0 + vR * pi.sc, col = qCol(key, v);
      const q0 = FS.qAt(M, xl), q1 = Mn ? FS.qAt(Mn, xr) : q0, qy = q0.qy, qR = q1.qy, slope = key === 'M' ? f.V : key === 'V' ? qy : key === 'D' ? phi : null;
      const sR = !g ? slope : key === 'M' ? g.V : key === 'V' ? qR : key === 'D' ? phiR : null;
      const sf = key === 'D' ? 1000 : 1;
      /* what the relation of the line names at this place, just before and just after it: −q or +q for the shear, V for the
         moment, θ for the deflection (with −M for its curvature), −n for the axial force */
      const d = key === 'N' ? { a: 0 - q0.qx, b: 0 - q1.qx } : { a: slope * sf, b: sR * sf };
      d.two = two(d.a, d.b); if (key === 'D') d.m = 0 - f.M;
      if ((key === 'V' || key === 'N') && two(v, vR)) d.step = vR - v;
      st.probeRead.rows[key] = { unit: UNIT[key], left: n1(key === 'D' ? v * 1000 : v), right: two(v, vR) ? n1(key === 'D' ? vR * 1000 : vR) : null,
        rel: { of: { V: 'q', M: 'V', D: 'θ', N: 'n' }[key], unit: { V: 'kN/m', M: 'kN', D: 'mrad', N: 'kN/m' }[key], left: n1(d.a), right: d.two ? n1(d.b) : null, ...(key === 'D' ? { minusM: n1(d.m) } : {}), ...(d.step ? { step: n1(d.step) } : {}) } };
      const rel = VW.rel && VW.rel[key];
      if (rel) rel.said = drawRel(relRow(key, d), rel.x, rel.y, rel.font, rel.room);
      if (p.h < 46) continue;
      if (slope !== null && !st.zero[key === 'D' ? 'W' : key]) {   /* the tangent: one half on each side, so that a kink shows both slopes */
        const m = slope * pi.sc / VW.s, dx = 46 / Math.hypot(1, m), mr = sR * pi.sc / VW.s, dr = 46 / Math.hypot(1, mr);
        ctx.save(); ctx.beginPath(); ctx.rect(0, p.y - 4, W, p.h + 8); ctx.clip(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; line(px - dx, yy - m * dx, px, yy); line(px, yR, px + dr, yR + mr * dr); ctx.restore();
      }
      /* what the slope means, on the line of the open tab: a triangle on the tangent. Over its base, 1 m where the line has
         the room, the line changes by its height, and that number is the value of the line the relation names: V for the
         moment, q for the shear, θ for the deflection (in mm per metre) */
      let tri = null;   /* where the triangle stands: the box of the values keeps off it */
      if (key === st.focus && VW.rows && p.h >= 110 && slope !== null && !st.zero[key === 'D' ? 'W' : key]) {
        /* on each side the longest base, from 1 m down, that the beam has there and whose far corner stays inside the strip;
           the triangle stands to the right, and to the left where its base is longer there (near the right end) */
        const base = (dir, sl, y0) => [1, 0.5, 0.2, 0.1].find(q => q <= (dir > 0 ? X(VW.x1) - px : px - X(VW.x0)) / VW.s + 1e-9 && y0 + sl * pi.sc * q * dir >= p.y + 3 && y0 + sl * pi.sc * q * dir <= p.y + p.h - 3) || 0;
        const dR = base(1, sR, yR), dL = base(-1, slope, yy), toR = dR >= dL, sl = toR ? sR : slope, y0t = toR ? yR : yy, dir = toR ? 1 : -1, d = toR ? dR : dL;
        const rise = d ? sl * pi.sc * d * dir : 0;
        if (d && Math.abs(rise) >= 7) {
          const xb = px + dir * d * VW.s, cv = key === 'M' ? C.cV : key === 'V' ? C.load : C.ink, chg = sl * d * (key === 'D' ? 1000 : 1), un = key === 'M' ? 'kNm' : key === 'V' ? 'kN' : 'mm';
          ctx.save(); ctx.beginPath(); ctx.rect(0, p.y - 4, W, p.h + 8); ctx.clip();
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; line(px, y0t, xb, y0t + rise);
          ctx.strokeStyle = C.mute; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); line(px, y0t, xb, y0t); ctx.setLineDash([]);
          ctx.strokeStyle = cv; ctx.lineWidth = 2.4; line(xb, y0t, xb, y0t + rise); ctx.restore();
          /* the base carries its length across the base from the triangle, the upright what the line changes by over it */
          tag(`${d === 1 ? '1' : d} m`, (px + xb) / 2, y0t + (rise > 0 ? -11 : 11), C.mute, `13px ${UI}`);
          tag(`${chg > 0 && n1(chg) !== '0.0' ? '+' : ''}${n1(chg)} ${un}`, xb + dir * 8, y0t + rise / 2, cv, `600 13px ${UI}`, toR ? 'left' : 'right');
          tri = { toR, rise, y: y0t, d, chg: n1(chg), unit: un };
          st.probeRead.tri = { key, base: d, change: n1(chg), unit: un, side: toR ? 'right' : 'left' };
        }
      }
      const stepV = two(v, vR), dot = (y, c) => { ctx.beginPath(); ctx.arc(px, y, 4.5, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = C.bg; ctx.lineWidth = 1.5; ctx.stroke(); };
      dot(yy, col); if (stepV) dot(yR, qCol(key, vR));
      const val = x => `${n1(key === 'D' ? x * 1000 : x)} ${UNIT[key]}`;
      const lines = stepV ? [[`${SYM[key]} left`, val(v), col, 1], [`${SYM[key]} right`, val(vR), qCol(key, vR), 1]] : [[SYM[key], val(v), col, 1]];
      const snOf = v => (key === 'M' ? 'M′ = V' : key === 'V' ? (v > 1e-9 ? 'V′ = +q' : 'V′ = −q') : key === 'D' ? 'w′ = θ' : null), su = key === 'M' ? 'kN' : key === 'V' ? 'kN/m' : 'mrad';
      /* what the relation names stands in the row under the strip; on a sheet without rows, in the box */
      if (!rel && slope !== null && two(slope * sf, sR * sf)) lines.push([`${snOf(slope)}, left`, `${n1(slope * sf)} ${su}`], [`${snOf(sR)}, right`, `${n1(sR * sf)} ${su}`]);
      else if (!rel && slope !== null) lines.push([snOf(slope), `${n1(slope * sf)} ${su}`]);
      ctx.font = `600 13px ${UI}`;
      const pw = Math.max(...lines.map(l => ctx.measureText(l[0]).width)) + Math.max(...lines.map(l => ctx.measureText(l[1]).width)) + 28, ph = lines.length * 19 + 10;
      /* beside the place; with a triangle on the line, on the other side of the place from it */
      if (tri) panel(lines, tri.toR ? px - 14 - pw : px + 14, clamp(yy - ph / 2, p.y, p.y + p.h - ph));
      else panel(lines, right ? px + 12 : px - 12 - pw, clamp(yy - ph / 2, p.y, p.y + p.h - ph));
    }
    return;
  }
  if (!h) return;
  const M = st.sol.mem[h.mi], g = MG[h.mi];
  let xl = clamp(h.a, 0, M.L);
  /* on a load the probe stands at that load, at its place as the member holds it; on the member the nearest point load within 6 px catches it */
  { let near = h.load ? 1e-6 : 6 / VW.s; const x0 = xl; for (const p of M.ll.pts) if (Math.abs(p.a - x0) < near) { near = Math.abs(p.a - x0); xl = p.a; } }
  const sd = xl <= 1e-9 ? 1 : -1, f = FS.forcesAt(M, xl, sd), f2 = sd === -1 && xl < M.L - 1e-9 ? FS.forcesAt(M, xl, 1) : f;
  const two = (a, b) => Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) || n1(a) !== n1(b), both = (k, u) => (two(f[k], f2[k]) ? `${n1(f[k])} | ${n1(f2[k])} ${u}` : `${n1(f[k])} ${u}`);
  const dx = FS.interp(M.smp, 'dX', xl, sd), dy = FS.interp(M.smp, 'dY', xl, sd), bx = g.ax + g.ex * xl * VW.s, by = g.ay + g.ey * xl * VW.s, key = st.focus;
  if (key !== 'D' && VW.k && !st.zero[key] && !(key === 'N' && barStyle(h.mi))) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; line(bx, by, bx + g.zx * f[key] * VW.k, by + g.zy * f[key] * VW.k); }
  ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); ctx.strokeStyle = C.bg; ctx.lineWidth = 1.5; ctx.stroke();
  const step = two(f.N, f2.N) || two(f.V, f2.V);
  /* δ: how far the point moves in total. On a member that bends also w, the part of it across the member (positive toward
     the dashed side), and θ, the slope of its deflection line (positive clockwise). A bar drawn as a bar has δ alone */
  const bend = barStyle(h.mi) ? [] : [['w', `${n1((dx * M.s - dy * M.c) * 1000)} mm`, C.ink, false], ['θ', `${n1(-FS.interp(M.smp, 'rot', xl, sd) * 1000)} mrad`, C.ink, false]];
  st.probeRead = { mi: h.mi, a: xl, x: xl, rows: { N: { unit: 'kN', left: n1(f.N), right: two(f.N, f2.N) ? n1(f2.N) : null }, V: { unit: 'kN', left: n1(f.V), right: two(f.V, f2.V) ? n1(f2.V) : null }, M: { unit: 'kNm', left: n1(f.M), right: null },
    D: { unit: 'mm', left: n1(Math.hypot(dx, dy) * 1000), right: null }, ...(bend.length ? { w: { unit: 'mm', left: bend[0][1].replace(' mm', ''), right: null }, th: { unit: 'mrad', left: bend[1][1].replace(' mrad', ''), right: null } } : {}) } };
  /* the relation of the open tab at this place, in the row under the structure: V before and after a load for the moment,
     the load across the member for the shear and along it for the axial force, θ and −M for the deflection */
  { const q = FS.qAt(M, xl), th = -FS.interp(M.smp, 'rot', xl, sd) * 1000;
    const d = key === 'M' ? { a: f.V, b: f2.V } : key === 'V' ? { a: q.qy, b: q.qy } : key === 'N' ? { a: 0 - q.qx, b: 0 - q.qx } : bend.length ? { a: th, b: th, m: 0 - f.M } : null;
    if (d) { d.two = two(d.a, d.b); if ((key === 'V' || key === 'N') && two(f[key], f2[key])) d.step = f2[key] - f[key];
      st.probeRead.rel = { key, of: { V: 'q', M: 'V', D: 'θ', N: 'n' }[key], left: n1(d.a), right: d.two ? n1(d.b) : null, ...(key === 'D' ? { minusM: n1(d.m) } : {}), ...(d.step ? { step: n1(d.step) } : {}) }; }
    frameRow(d, true); }
  panel([[memName(h.mi), `x = ${n2(xl)} m`], ...(step ? [['at the load', 'before | after']] : []), ['N', both('N', 'kN'), qCol('N', f.N), key === 'N'], ['V', both('V', 'kN'), C.cV, key === 'V'], ['M', `${n1(f.M)} kNm`, C.cM, key === 'M'], ['δ', `${n1(Math.hypot(dx, dy) * 1000)} mm`, C.ink, key === 'D'], ...bend], st.mouse.x + 18, st.mouse.y + 18);
}

function draw() {
  layout(); st.fid++;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.setLineDash([]); ctx.globalAlpha = 1;
  boxes = []; texts = []; LATE = []; HS = { loads: new Map(), udl: new Map(), rlab: [], dims: [] }; VW.k = 0;
  const ok = st.sol.ok;
  drawGrid(); drawAxes();
  if (ok && !VW.beam) frameRow();
  if (ok && !VW.beam) drawFrameDiagram();
  drawStructure(); drawDims(); drawUdls(); drawLoads();
  if (ok) drawReactions();
  drawLetters();
  if (ok && VW.beam) drawPlots();
  if (ok && !VW.beam && st.vals) { ctx.globalAlpha = st.prev ? clamp((st.tf - 0.5) * 2, 0, 1) : clamp((st.gf - 0.6) * 2.5, 0, 1); frameLabels(); ctx.globalAlpha = 1; }
  for (const l of LATE) putAny(l[0], l[1], { col: C.load, ring: l[2] });
  if (ok && !VW.beam && st.zero[st.focus === 'D' ? 'D' : st.focus]) put(st.focus === 'D' ? 'No displacement' : st.focus === 'N' ? 'N = 0 in every member' : st.model.truss ? `${st.focus} = 0: bars carry axial force only` : `${st.focus} = 0 in every member`, W / 2, 26, { col: C.mute, font: `14px ${UI}`, force: true });
  drawProbe();
  if (!ok) { ctx.font = `600 15px ${UI}`; const t = 'Unstable: the structure is a mechanism', w = ctx.measureText(t).width + 28; const by = H - 86; ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, by, w, 34, 9); ctx.fillStyle = C.bad; ctx.fill(); ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W / 2, by + 17.5); }
  const mag = ok && !st.flat.D ? VW.dAmp / st.ext.D / VW.s : 0;
  const bars = ok && st.focus === 'N' && !VW.beam && st.model.members.some((q, i) => barStyle(i));
  const mt = (st.ghost && ok ? (bars ? 'In brackets: the kept state. ' : 'Dashed outline: the kept state. ') : '') + (mag ? `${VW.beam ? 'Deflected beam' : 'Deformed shape'} drawn ×${mag >= 100 ? Math.round(mag / 10) * 10 : mag >= 10 ? Math.round(mag) : mag >= 1 ? r1(mag) : +mag.toPrecision(2)}` : '');
  if (magEl.textContent !== mt) magEl.textContent = mt;
}

/* ---------- side panel ---------- */
const RULES = {
  M: [['<i>M</i>′ = <i>V</i>', 'For each metre the moment changes by the shear there: the slope of the moment line is <i>V</i>.'], ['Δ<i>M</i>', 'Between two points the moment changes by the area under the shear line.'], ['<i>M</i>″ = −<i>q</i>', 'Uniform load: parabola. Triangular load: cubic curve. The line has a kink where the forces across the axis at one place do not cancel: point loads and a support reaction there, an inclined force with its part across. Forces that cancel, and a force along the axis, make none.'], ['<i>M</i> = 0', 'At a pin or roller end, a hinge and a free end.']],
  V: [['<i>V</i>′ = −<i>q</i>', 'Uniform load: sloping line. Triangular load: parabola. No load: constant.'], ['Δ<i>V</i>', 'Between two points the shear falls by the load between them. Where forces across the axis act at one place the shear steps by their sum: point loads there, an inclined one with its part across. Loads that cancel leave no step.'], ['<i>V</i> = 0', 'Where the shear changes sign the moment line turns: a peak, or a low point between two peaks.']],
  N: [['<i>N</i> &gt; 0', 'Tension.'], ['<i>N</i> &lt; 0', 'Compression.'], ['Δ<i>N</i>', 'Only the part of a load along the member changes N.']],
  /* a beam: the deflection w and its slope, the rotation θ */
  D: [['<i>w</i>', 'Deflection: how far the beam moves across its axis. Positive downward.'], ['<i>EI</i>·<i>w</i>″ = −<i>M</i>', 'The curvature follows the moment.'],
    ['θ = <i>w</i>′', 'Rotation: the slope of the deflection line, in mrad (1 mrad = 1 mm per metre). Positive where the line falls to the right, a clockwise turn. Along a stretch without a hinge θ changes by the area under <i>M</i>/<i>EI</i>: Δθ = −∫ <i>M</i>/<i>EI</i> d<i>x</i>.'],
    ['θ = 0', 'Where the rotation changes sign the deflection line turns: a peak, or a low point between two peaks. That is often not the place of the largest moment.'],
    ['<i>M</i> = 0', 'Where the moment changes sign: inflection point, the curve changes side.'], ['<i>w</i> = 0', 'Where a support holds. A fixed end also keeps its slope: θ = 0.'], ['<i>w</i> ∝ 1/<i>EI</i>', 'Twice the stiffness everywhere, half the deflection.']],
  /* a frame: the displacement δ of a point, and the deflection w of a member, which is the part of δ across it */
  DF: [['δ', 'Displacement: how far a point moves in total. This is the number on the drawing.'], ['<i>w</i>', 'Deflection: the part of the displacement across the member, positive toward the dashed side.'],
    ['<i>EI</i>·<i>w</i>″ = −<i>M</i>', 'The curvature of the deflection line follows the moment.'],
    ['θ = <i>w</i>′', 'Rotation: the slope of the deflection line, in mrad (1 mrad = 1 mm per metre). Positive clockwise. A rigid joint turns as one piece: every member that ends there has the same θ.'],
    ['<i>M</i> = 0', 'Where the moment changes sign: inflection point, the curve changes side.'], ['δ = 0', 'At a pin and a fixed end. A roller holds its joint only across its track. A fixed end also keeps its slope: θ = 0.'], ['δ ∝ 1/<i>EI</i>', 'Twice the stiffness everywhere, half the displacement.']],
  /* a truss moves because its bars change length: the stiffness that counts is EA */
  DT: [['δ', 'Displacement: how far a joint moves in total.'], ['Δ<i>L</i> = <i>N</i>·<i>L</i> / <i>EA</i>', 'Every bar changes its length: a pulled bar grows, a pressed bar shortens. The joints move by what these changes add up to.'], ['δ = 0', 'Where a support holds.'], ['δ ∝ 1/<i>EA</i>', 'Twice the area of every bar, half the displacement.']],
};
const QTITLE = { M: 'Reading the moment line', V: 'Reading the shear line', N: 'Reading the axial force', D: 'Reading the deflection line', DF: 'Reading the displacements' };
/* sketches of the sign convention: tension in the colour of tension, compression in the colour of compression */
const SVG = b => `<svg viewBox="0 0 84 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const TXT = (x, y, t) => `<text x="${x}" y="${y}" font-family="STIX Two Text,Cambria,serif" font-style="italic" font-size="13" fill="currentColor" stroke="none">${t}</text>`;
const SK = {
  M: SVG('<path d="M22 11Q42 25 62 11" stroke="var(--cC)" stroke-width="2.4"/><path d="M22 21Q42 35 62 21" stroke="var(--cT)" stroke-width="2.4"/><path d="M22 11V21M62 11V21"/><path d="M16 28A12 12 0 0 1 16 4M68 28A12 12 0 0 0 68 4"/><path d="M19.5 4L13 .8V7.2ZM64.5 4L71 .8V7.2Z" fill="currentColor" stroke="none"/>'),
  V: SVG('<path d="M30 10H54V30H30Z"/><path d="M22 33V12M62 7V28"/><path d="M22 6.5L18.5 13.5H25.5ZM62 33.5L58.5 26.5H65.5Z" fill="currentColor" stroke="none"/>'),
  N: SVG('<path d="M30 13H54V27H30Z"/><path d="M30 20H14M54 20H70"/><path d="M8 20L15 16.5V23.5ZM76 20L69 16.5V23.5Z" fill="currentColor" stroke="none"/>'),
  A: SVG('<path d="M30 9H62M30 9V29M30 9L20 19"/><path d="M68.5 9L61.5 5.5V12.5ZM30 35.5L26.5 28.5H33.5ZM15.5 23.5L22.1 21.9L17.1 16.9Z" fill="currentColor" stroke="none"/>' + TXT(72, 13, 'x') + TXT(36, 37, 'z') + TXT(6, 33, 'y')),
};
function signsHTML(bm, truss) {
  const q = st.focus, Fz = '<i>F</i><sub>z</sub>', Fx = '<i>F</i><sub>x</sub>';
  const brief = truss ? '+N: tension' : q === 'M' ? (bm ? '+M: bending pulls the bottom' : '+M: bending pulls the dashed side') : q === 'V' ? '+V: left end up, right end down' : q === 'N' ? '+N: tension' : bm ? 'w: positive downward' : 'δ: how far a point moves';
  const one = (k, sym, t) => `<div class="sg">${SK[k]}<p><b>${sym}</b>${t}</p></div>`;
  let h = '';
  if (!truss) {
    h += one('M', '+<i>M</i>', bm ? 'the piece sags: bending pulls the bottom and presses the top' : 'bending pulls the dashed side of the member and presses the other');
    h += one('V', '+<i>V</i>', bm ? 'on a piece of the beam the force points up at its left end, down at its right end' : 'seen with the dashed side below: up at the left end of a piece, down at its right end');
  }
  h += one('N', '+<i>N</i>', 'the piece is pulled: tension. Negative: compression');
  h += one('A', '<i>x</i>, <i>z</i>', bm ? 'x along the beam, z down, y toward you' : 'x to the right, z down, y toward you');
  /* one meaning per letter: loads by their size, a moment named after a support is the bending moment there */
  const fn = st.model.nodes.find(n => n.sup === 'fixed' && n.lbl), My = '<i>M</i><sub>y</sub>';
  const note = (truss ? '' : 'The moment line is drawn on the side that bending pulls. ')
    + (bm ? `The deflection <i>w</i> counts positive downward, the reactions ${Fz} upward.` : `Reactions: ${Fx} positive to the right, ${Fz} upward${fn ? `, fixing moment ${My} counter-clockwise` : ''}.`)
    + (truss ? '' : bm ? ' The rotation θ is the slope of the deflection line: positive where the line falls to the right.' : ' The rotation θ is the slope of the deflection line of a member: positive clockwise.')
    + (truss ? '' : ` In formulas <i>q</i> and <i>P</i> are the sizes of the loads; in <i>V</i>′ and <i>M</i>″, <i>q</i> is the part of the load across the member${fn ? `; <i>M</i><sub>${fn.lbl}</sub> is the bending moment at ${fn.lbl}. The curved arrow at a fixed support is its fixing moment: ${st.model.nodes.some((n, i) => n.sup === 'fixed' && st.model.members.filter(k => k.n1 === i || k.n2 === i).length > 1) ? 'the same size where one member ends at the support; where two members meet there, the difference of their two moments' : 'the same size'}` : ''}.`);
  return `<details class="card signs"${st.signs ? ' open' : ''}><summary><h3>Signs and axes</h3><span>${brief}</span></summary><div class="sgs">${h}</div><p class="note">${note}</p></details>`;
}
const fixd = (v, d) => CARDS.fix(v, d);   /* one rounding rule for every printed number */
const rowHTML = r => {
  const num = v => (r.dec ? CARDS.fix(v, r.dec) : n1(v)), val = r.u === '' ? fixd(r.v, r.dec || 2) : `${num(r.v)} ${r.u}`, ok = r.ref !== null && Math.abs(r.v - r.ref) <= 5e-4 * Math.max(1, Math.abs(r.ref));
  return `<div class="row"><div class="f">${r.f}</div><div class="v">${val}${r.ref === null ? '' : ok ? '<span class="ok" title="Equals the computed value">✓</span>' : `<span class="no">computed ${num(r.ref)}</span>`}</div>${r.s ? `<div class="s">= ${r.s}</div>` : ''}</div>`;
};
/* why a structure is a mechanism: the count, and what a single support would have to hold */
function unstableHTML(s, m, bm) {
  const d = s.det, L = s.loose || [], what = bm ? 'beam' : 'structure', held = k => m.nodes.some(n => FS.RXN[n.sup || 'free'].includes(k));
  const names = a => { const l = [...new Set(a.map(o => o.i))].map(i => m.nodes[i].lbl); return l.some(x => !x) ? '' : l.length === 1 ? l[0] : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]; };
  const lx = L.filter(o => o.d === 0), ly = L.filter(o => o.d === 1);
  const k = Math.max(1, s.modes || 0, -d.n), move = lx.length && !held(0) ? `Nothing holds the ${what} sideways: it can slide.` : ly.length && !held(1) ? `Nothing holds the ${what} vertically.`
    : lx.length && !ly.length ? `${names(lx) || 'A joint'} can move sideways.` : ly.length && !lx.length ? `${names(ly) || 'A joint'} can move up and down.`
      : L.length ? `${names(L) || 'A joint'} can move.` : '';
  /* k independent movements are free: that many restraints are missing. The count n shows fewer when a restraint elsewhere is one too many */
  const need = k === 1 ? 'One restraint is missing' : `${k} restraints are missing`, over = k + d.n;
  const lack = d.n < 0 && k === -d.n ? `${need}${k > 1 ? `: ${k} movements are free` : ''}. `
    : d.n < 0 ? `${need}: ${k} movements are free. The count shows only ${-d.n}, because ${over === 1 ? 'one restraint elsewhere is' : `${over} restraints elsewhere are`} more than needed. `
      : `The count is enough, but the supports and hinges are placed so that ${k === 1 ? 'a part can still move' : `${k} movements are still free`}. `;
  /* which movements are free: said one by one where the single sentence above does not say it (two or more movements, or one
     that no single hold at a joint stops). FS.movements chooses them: the whole structure as one body first, then parts. */
  const said = move || (() => {
    const mv = movements(m);
    if (!mv || !mv.length) return '';
    const nm = i => m.nodes[i].lbl, list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    const one = (q, first) => {
      const it = first ? `the whole ${what}` : 'it';
      if (q.kind === 'slide') return `${it} can slide sideways`;
      if (q.kind === 'lift') return `${it} can move up and down`;
      if (q.kind === 'turn') return `${it} can turn${q.about >= 0 && nm(q.about) ? ` about ${nm(q.about)}` : ''}`;
      if (q.joints.some(j => !nm(j.i))) return `a part of the ${what} can move`;
      const dir = q.joints.every(j => !j.dy) ? ' sideways' : q.joints.every(j => !j.dx) ? ' up and down' : '';
      const tn = q.turns.filter(t => nm(m.members[t.mi].n1) && nm(m.members[t.mi].n2)).map(t => `${nm(m.members[t.mi].n1)}–${nm(m.members[t.mi].n2)} turning about ${nm(t.about)}`);
      return `${list(q.joints.map(j => nm(j.i)))} can move${dir}${q.joints.length > 1 ? ' together' : ''}${tn.length && tn.length <= 2 ? `, with ${list(tn)}` : ''}`;
    };
    const body = mv.filter(q => q.kind !== 'part'), parts = mv.filter(q => q.kind === 'part'), all = body.map((q, i) => one(q, i === 0)).concat(parts.map(q => one(q, false)));
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    /* more than four are not all spelled out: the first three, and how many more (movements of parts: the whole structure comes first) */
    const show = all.length > 4 ? all.slice(0, 3) : all;
    return all.length === 1 ? cap(all[0]) + '.' : `They are: ${show.map((t, i) => `(${i + 1}) ${t}`).join('; ')}${all.length > show.length ? `; and ${all.length - show.length} more, of parts` : ''}.`;
  })();
  /* what makes it stable is tried, not guessed: see remedies */
  const fix = remedies(m), cure = fix.n === 1 ? `One change makes it stable: ${fix.list.join(', or ')}.` : fix.n === 2 ? `Two changes together make it stable: ${fix.list.join(', or ')}.`
    : fix.n === 3 ? `Three changes together make it stable: ${fix.list[0]}.` : `More than three changes are needed.${fix.all ? ` It is stable with ${fix.all}.` : ''}`;
  return `<div class="badge bad"><b>Unstable: a mechanism</b><span>${lack}${said} ${cure}</span>`
    + `<span class="m"><i>n</i> = 3<i>m</i> + <i>r</i> − 3<i>j</i> − <i>c</i> = 3·${d.m} + ${d.r} − 3·${d.j} − ${d.c} = ${d.n < 0 ? '−' + -d.n : d.n}</span><small>m members, r reactions, j joints, c hinge conditions</small></div>`;
}
/* Changes that make an unstable structure stable, as FS.remedies has tried them: here they get their words. The result is
   kept until supports, hinges, section or example change. */
const mechKey = m => JSON.stringify([m.nodes.map(n => [n.sup || 'free', !!n.hinge, n.x, n.y]), m.members.map(k => (k.sec === undefined ? null : k.sec))]) + '|' + st.sec + '|' + st.pid;
/* the free movements of a mechanism, as FS.movements tells them apart; kept like the remedies */
function movements(m) {
  const key = mechKey(m);
  if (movements.key !== key) { const sec = SECTIONS[st.sec]; movements.key = key; movements.val = FS.movements(JSON.parse(JSON.stringify(m)), sectionEI(sec), sectionEA(sec)); }
  return movements.val;
}
function remedies(m) {
  const key = mechKey(m);
  if (remedies.key === key) return remedies.val;
  const sec = SECTIONS[st.sec], f = FS.remedies(m, sectionEI(sec), sectionEA(sec)), nm = i => m.nodes[i].lbl || `joint ${i + 1}`;
  const txt = q => q.close ? `the hinge at ${nm(q.i)} closed` : q.sup === 'fixed' ? `${nm(q.i)} fixed` : `a ${q.sup} at ${nm(q.i)}`;
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  let val;
  if (f.n < 4) val = { n: f.n, list: f.sets.map(set => list(set.map(txt))) };
  else {
    const sup = f.set.filter(q => q.sup).map(q => nm(q.i)), hin = f.set.filter(q => q.close).map(q => nm(q.i));
    val = { n: 4, all: [sup.length ? `${list(sup)} fixed` : '', hin.length ? `the hinge${hin.length > 1 ? 's' : ''} at ${list(hin)} closed` : ''].filter(Boolean).join(' and ') };
  }
  remedies.key = key; remedies.val = val;
  return val;
}
function renderLearn() {
  const p = preset(), s = st.sol, m = st.model, q = st.focus, bm = VW_beam();
  st.cardMi = -1;
  /* an example whose supports, hinges or kind of loads were changed is no longer what its name says */
  const b0 = buildModel(p), sg = mm => JSON.stringify(mm.nodes.map(n => [n.sup, !!n.hinge]));
  const lg = mm => JSON.stringify([mm.loads.map(l => l.m + ':' + l.ang).sort(), mm.members.map(k => (k.udl.on ? [Math.sign(k.udl.w1), Math.sign(k.udl.w2), k.udl.w1 === k.udl.w2, k.udl.ang] : 0))]);
  const sCh = sg(m) !== sg(b0), lCh = lg(m) !== lg(b0);
  const sups = m.nodes.filter(n => n.cs && n.lbl).map(n => `${n.lbl} ${SUPNAME[n.sup]}`).join(', '), hgs = m.truss ? '' : m.nodes.filter(n => n.hinge && n.lbl).map(n => n.lbl).join(', ');
  let h = sCh ? `<div><h2>Changed structure</h2><div class="sub">from “${p.name}”: ${sups}${hgs ? `; hinge at ${hgs}` : ''}</div></div>`
    : `<div><h2>${p.name}</h2><div class="sub">${lCh ? 'loads changed' : subOf(p, m)}</div></div>`;
  if (!s.ok) h += unstableHTML(s, m, bm) + signsHTML(bm, m.truss);
  else {
    const d = s.det;
    h += `<div class="badge ${d.n ? 'ind' : 'det'}"><b>${d.n ? `Statically indeterminate, degree ${d.n}` : 'Statically determinate'}</b><span>${d.n ? 'Equilibrium is not enough: stiffness decides how the forces are shared.' : 'Equilibrium alone gives every force.'}</span>`
      + `<span class="m"><i>n</i> = 3<i>m</i> + <i>r</i> − 3<i>j</i> − <i>c</i> = 3·${d.m} + ${d.r} − 3·${d.j} − ${d.c} = ${d.n}</span><small>m members, r reactions, j joints, c hinge conditions</small></div>`;
    /* C83, C97, C115, C122: first-order theory holds for small rotations and small strains. Each member is measured by
       itself: where it turns somewhere by more than 50 mrad, a twentieth of a radian (FS.turnOf), or where it is
       strained along its axis somewhere by more than a twentieth, 5 % (FS.strainOf), the page says so, names the member,
       says which of the two it is and where. A short overhang beside a long span counts, and so does a short stretch of
       a long member that turns far, or that is pulled apart, while the member as a whole moves little */
    { const nameOf = mi => { const k = m.members[mi], la = m.nodes[k.n1].lbl, lb = m.nodes[k.n2].lbl; return la && lb ? `Member ${la}–${lb}` : m.truss ? 'A bar' : 'A member'; };
      const turns = s.max.turn > FS.TURN, long = s.max.strain > FS.STRAIN;
      /* where the strain is: over the whole member, on a stretch of it (between two loads), or at one place */
      const where = () => { const k = m.members[s.max.strainM], la = m.nodes[k.n1].lbl, [x0, x1] = s.max.strainAt, L = s.mem[s.max.strainM].L, from = la ? ` from ${la}` : ' from its start';
        return x1 - x0 > L - 1e-6 ? 'over its whole length' : x1 - x0 > 1e-6 ? `between ${n2(x0)} and ${n2(x1)} m${from}` : `at ${n2(x0)} m${from}`; };
      if (turns || long) h += `<section class="card far"><h3>Large displacement</h3><p class="note">`
        + (turns ? `${nameOf(s.max.turnM)} turns by ${n1(s.max.turn * 1000)} mrad at its steepest place: more than 50 mrad, a twentieth of a radian. ` : '')
        + (long ? `${nameOf(s.max.strainM)} is ${s.max.strainSign > 0 ? 'stretched' : 'shortened'} by ${n1(s.max.strain * 100)} % ${where()}: its strain N/EA is more than 5 %, a twentieth. ` : '')
        + `The first-order theory of this page holds for small displacements and rotations only: these values lie outside it.</p></section>`; }
    h += signsHTML(bm, m.truss && st.zero.M);
    for (const c of st.hand) h += `<section class="card"><h3>By hand: ${c.title.charAt(0).toLowerCase() + c.title.slice(1)}</h3>${c.rows.filter(r => !r.tab || r.tab === q).map(rowHTML).join('')}${c.note ? `<p class="note">${c.note}</p>` : ''}</section>`;
    if (!st.zero.M && (m.members.length > 1 || q === 'V')) {
      let mi = st.imi;
      /* the member with the largest moment; among members that carry the same one, as in a symmetric frame, the first:
         the last digits of the analysis do not decide which member the card shows */
      if (!(mi >= 0 && mi < m.members.length)) { const mx = s.mem.map(M => { let v = 0; for (const w of M.smp.M) v = Math.max(v, Math.abs(w)); return v; }), top = Math.max(...mx); mi = mx.findIndex(v => v >= top * (1 - 1e-6)); }
      st.cardMi = mi;
      const mb = m.members[mi], l1 = m.nodes[mb.n1].lbl, l2 = m.nodes[mb.n2].lbl, cname = l1 && l2 ? memName(mi) : `The marked ${m.truss ? 'bar' : 'member'}`, at1 = l1 ? ` at ${l1}` : ' at its start', at2 = l2 ? ` at ${l2}` : ' at its end', more = m.members.length > 1 ? ' Point at another member to see its rule.' : '';
      const ab = ` a and b are the distances of the load from ${l1 || 'the start'} and ${l2 || 'the end'}.`;
      /* what q stands for; a load that is not square to the member counts with its part across it */
      const qdef = r => (r.qdef === 'tri' ? ` q is ${r.across ? 'the part across the member of ' : ''}the load at the high end.` : r.qdef === 'ends' ? ` q<sub>1</sub> and q<sub>2</sub> are ${r.across ? 'the parts across the member of ' : ''}the load${at1} and${at2}.`
        : r.qdef === 'uni' && r.across ? ' q is the part of the load across the member.' : '');
      if (q === 'V') {
        const r = CARDS.shear(m, s, mi);
        h += `<section class="card"><h3>${cname}: how its shear line is built</h3><p>${r.text}</p>${r.rows.map(rowHTML).join('')}<p class="note">V<sub>1</sub> = ${n1(r.V1)} kN${at1} and V<sub>2</sub> = ${n1(r.V2)} kN${at2} are the shear at its two ends.`
          + `${qdef(r)}${r.x0 ? ` x<sub>0</sub> is measured from ${r.x0 === 2 ? l2 || 'its end' : l1 || 'its start'}: there V = 0 and ${n1(r.turn.M) === '0.0' ? 'the moment line turns' : (r.turn.V > 0 ? r.turn.M < 0 : r.turn.M > 0) ? 'M has a low point: its size is larger on both sides' : 'M has its peak'}.` : ''}${r.ab ? ab : ''}${r.ties.length ? ' ' + r.ties.join(' ') : ''}${more}</p></section>`;
      } else {
        const ins = CARDS.insight(s, mi);
        h += `<section class="card"><h3>${cname}: how its moment line is built</h3><p>${ins.text}</p>${ins.rows.map(rowHTML).join('')}<p class="note">M<sub>1</sub> = ${n1(ins.M1)} kNm${at1} and M<sub>2</sub> = ${n1(ins.M2)} kNm${at2} are its end moments.${qdef(ins)}${ins.ab ? ab : ''}${more}</p></section>`;
      }
    }
  }
  const rules = (q === 'D' ? (m.truss ? RULES.DT : bm ? RULES.D : RULES.DF) : RULES[q]).map(r => r.slice());
  /* The area rule holds along a member. Where the line passes a fixed support between two members of a beam it steps by the
     fixing moment of that support, with its sign: M right = M left − M_y (M_y counts counter-clockwise, M positive when the
     beam sags). In a frame the rule is said for one member; at a joint the moments balance, and where a third member comes
     in, the line of the two others steps by the moment that it brings. */
  if (q === 'M') {
    const ra = rules.find(r => r[0].startsWith('Δ')), fx = m.nodes.filter((n, i) => n.sup === 'fixed' && deg(i) > 1).map(n => n.lbl || '');
    if (ra && bm && fx.length) ra[1] = 'Between two points the moment changes by the area under the shear line. A fixed support between them adds a step by its fixing moment, which counts counter-clockwise: '
      + (fx.length === 1 && fx[0] ? `<i>M</i> right of ${fx[0]} = <i>M</i> left of ${fx[0]} − <i>M</i><sub>${fx[0]}y</sub>.` : '<i>M</i> right of it = <i>M</i> left of it − its fixing moment.');
    if (ra && !bm && !m.truss) ra[1] = 'Along one member the moment changes between two points by the area under the shear line. At a joint the moments balance: counted as they turn the joint, the end moments of the members that meet there'
      + (fx.length ? ' and the fixing moment of a support there' : '') + ' add up to zero.'
      + (m.nodes.some((n, i) => deg(i) > 2) ? ' So the line of two members in one line steps at a joint where a third member brings a moment, by that moment.' : ' At a rigid corner the moment goes round the corner with the same size.');
  }
  if (q === 'M') rules.push(['tension side', bm ? 'The line is drawn on the side that bending puts in tension.' : 'The line is drawn on the side that bending puts in tension. An axial force comes on top of it: under a large compression both sides of a member can be pressed.']);
  if (q === 'V') rules.splice(2, 0, ['at a support', bm ? 'The shear jumps by what acts there: the support reaction, and a point load if one stands on the support.'
    : m.truss ? 'At a support the joint is in equilibrium: the forces of the bars that meet there balance the reaction and a load that stands on the joint. A load on a pin goes straight into its reaction, and no bar gets a force from it. A bar without a load across it carries axial force only. A bar loaded across its axis between its joints also has shear at its two ends, and that goes into the joints.'
      : 'Where one member ends at a support, its shear takes up the part of the reaction across it, and of a point load on the support. Where several members meet there they share the reaction and a load on the joint: the joint as a whole is in equilibrium.']);
  if (q === 'V') { const rd = rules.find(r => r[0].startsWith('Δ')); if (rd) rd[1] = bm ? 'Between two points the shear changes by the load across the beam between them: it falls under a downward load and rises under an upward one. Where point loads stand at one place the shear steps by their sum across the beam, an inclined load with its part across. Loads that cancel there leave no step.'
    : 'Between two points the shear changes by the part of the load across the member between them: it falls under a load toward the dashed side and rises under one away from it. Where point loads stand at one place the shear steps by the sum of their parts across the member. Loads that cancel there leave no step.'; }
  /* C27: q is a size; the sign of the slope follows the direction of the load */
  if (q === 'V') { rules[0][0] = `<i>V</i>′ = ${qSign()}<i>q</i>`; rules[0][1] = (bm ? '<i>q</i> is here the part of the load across the beam, per metre. A downward load makes the shear fall by it, an upward one makes it rise: <i>V</i>′ = −<i>q</i> or +<i>q</i>. A load along the beam leaves V as it is.' : '<i>q</i> is here the part of the load across the member, per metre of the member. Toward the dashed side it makes the shear fall, away from it rise: <i>V</i>′ = −<i>q</i> or +<i>q</i>.') + ' ' + rules[0][1]; }
  if (q === 'M') { const r2_ = rules.find(r => r[0].includes('″')); if (r2_) { r2_[0] = `<i>M</i>″ = ${qSign()}<i>q</i>`; r2_[1] = (bm ? '<i>q</i>: the part of the load across the beam. ' : '<i>q</i>: the part of the load across the member. ') + r2_[1]; if (qSign() !== '−') r2_[1] += bm ? ' Under an upward load the curve bends the other way: <i>M</i>″ = +<i>q</i>.' : ' Under a load away from the dashed side the curve bends the other way: <i>M</i>″ = +<i>q</i>.'; } }
  if (q === 'V') rules.push(['+', bm ? 'Positive shear is drawn below the axis, like the moment.' : 'Positive shear is drawn on the dashed side.']);
  /* a vertical member whose lower end no support holds and no other member meets: it hangs from its head */
  const hangs = !bm && !m.truss && m.members.some(k => { const p = m.nodes[k.n1], r = m.nodes[k.n2]; if (Math.abs(p.x - r.x) > 1e-9) return false; const lo = p.y < r.y ? k.n1 : k.n2; return (m.nodes[lo].sup || 'free') === 'free' && deg(lo) === 1; });
  /* a beam: N steps at a joint by what acts on the joint along the beam, with its sign (review 09, C101) */
  if (q === 'N' && bm) rules.push(['at a joint', 'N steps by what acts on the joint along the beam: <i>N</i> right of it = <i>N</i> left of it − (<i>F</i><sub>x</sub> + <i>P</i><sub>x</sub>). <i>F</i><sub>x</sub> is the reaction of a support that holds the beam along its axis, a pin or a fixed support; <i>P</i><sub>x</sub> is a load on the joint; both count positive to the right. A roller has no <i>F</i><sub>x</sub>: N passes it, unless a load along the beam stands on it.']);
  /* a beam: what the rule on the rotation needs for this beam (review 09, C99 and C100): one EI or several along it, a hinge or none */
  if (q === 'D' && bm) { const rt = rules.find(r => r[0].startsWith('θ'));
    if (rt) { const eis = s.ok ? s.mem.map(M => M.EI) : m.members.map(k => k.kf || 1), one = eis.every(v => Math.abs(v - eis[0]) <= 1e-9 * eis[0]), hinge = m.nodes.some((n, i) => n.hinge && deg(i) > 1);
      rt[1] += one ? ' This beam has one <i>EI</i>: the area under the moment line, divided by <i>EI</i>.' : ' The members of this beam have different <i>EI</i>: each stretch counts with its own.';
      if (hinge) rt[1] += ' At a hinge the two sides turn by their own amounts: θ steps there, and the rule holds on either side of it.'; } }
  if (q === 'D' && !bm && !m.truss && m.nodes.some((n, i) => n.hinge && deg(i) > 1)) { const rt = rules.find(r => r[0].startsWith('θ')); if (rt) rt[1] += ' At a hinge every member has a θ of its own.'; }
  if (q === 'N') rules.push(m.truss ? ['joints', 'Loads at the joints: every bar carries axial force only.'] : bm ? ['+', 'Positive values are drawn below the axis.'] : ['columns', 'A column that stands on a support passes its axial force to it: the vertical reaction there is that force and, where a load stands on the support itself, that load.' + (hangs ? ' A column whose foot is free hangs from its head: a load on it goes up the column and into the members at its head.' : '')]);
  if (q === 'D' && m.truss && s.ok && !st.zero.M) { rules.push(['loaded bar', 'A load between the joints of a bar bends it when it has a part across the bar; its part along the bar changes N only. For the deflection <i>w</i> across the bar: <i>EI</i>·<i>w</i>″ = −<i>M</i>.']); const ra = rules.find(r => r[0].includes('1/<i>EA</i>')); if (ra) ra[1] = 'Twice the area of every bar, half the movement of the joints. The bending of the loaded bar between its joints follows 1/<i>EI</i> instead.'; }
  /* a bar with a load between its joints, across or along it: a point inside it can move more than its joints */
  if (q === 'D' && m.truss && s.ok && s.mem.some(M => FS.hasQ(M) || Math.abs(M.ll.q1x) > 1e-9 || Math.abs(M.ll.q2x) > 1e-9 || M.ll.pts.some(p => p.a > 1e-9 && p.a < M.L - 1e-9))) rules[0][1] = 'Displacement: how far a point moves in total. The numbers stand at the joints; where a point inside a loaded bar moves more than its joints, the number stands at that point, which is marked.';
  /* a load along a bar makes N vary along it: the change of length follows its mean value */
  if (q === 'D' && m.truss && s.ok && s.mem.some(M => Math.abs(M.ll.q1x) > 1e-9 || Math.abs(M.ll.q2x) > 1e-9 || M.ll.pts.some(p => Math.abs(p.px) > 1e-9 && p.a > 1e-9 && p.a < M.L - 1e-9))) { const rl = rules.find(r => r[0].startsWith('Δ')); if (rl) rl[1] += ' Under a load along a bar N varies: its mean value over the bar counts.'; }
  /* a bar hinged at both ends inside a frame keeps its EA: the deflection then follows 1/EI only roughly */
  const hasBar = !bm && !m.truss && s.ok && !!st.bars && st.bars.some(Boolean);
  if (q === 'D' && hasBar) { const re = rules.find(r => r[0].includes('1/<i>EI</i>')); if (re) re[1] = 'Where only bending moves the structure, twice the bending stiffness everywhere halves the movement. Here a bar also changes its length by <i>N</i>·<i>L</i>/<i>EA</i>, with <i>N</i> its mean value along the bar where a load along it makes it vary. That part does not follow 1/<i>EI</i>: it changes only as far as the force <i>N</i> in the bar changes with the stiffness.'; }
  if (q === 'D' && !bm) { const r0 = rules.find(r => r[0] === 'δ = 0'); if (r0 && m.truss) r0[1] = 'At a pin. A roller holds its joint only across its track: along it the joint moves.'; }
  if ((q === 'N' || q === 'D') && !m.truss && !bm) rules.push(['<i>EA</i> → ∞', 'Frame members are taken as axially rigid, as in hand calculation.' + (hasBar ? ' A bar keeps its <i>EA</i>: a member whose two ends carry no moment.' : '')]);
  h += `<section class="card q" style="--c:var(--${q === 'M' ? 'cM' : q === 'V' ? 'cV' : q === 'N' ? 'cT' : 'ink'})"><h3>${q === 'D' && !bm ? QTITLE.DF : QTITLE[q]}</h3>${rules.map(r => `<div class="rule"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')}</section>`;
  if (s.ok) {
    const e = CARDS.equilibrium(m, s), chk = (a, u) => `<td>${n1(a[0])}</td><td>${n1(a[1])}</td><td>${u}${Math.abs(a[0] + a[1]) < 1e-6 * Math.max(1, Math.abs(a[1])) ? '<span class="ok">✓</span>' : ''}</td>`;
    h += `<section class="card"><h3>Equilibrium: reactions and loads cancel</h3><table class="eq"><tr><th></th><th>Reactions</th><th>Loads</th><th></th></tr>`
      + `<tr><td>Σ <i>F</i><sub>x</sub> →</td>${chk(e.H, 'kN')}</tr><tr><td>Σ <i>F</i><sub>z</sub> ↑</td>${chk(e.V, 'kN')}</tr><tr><td>Σ <i>M</i>${e.about ? ' about ' + e.about : ''} ↺</td>${chk(e.M, 'kNm')}</tr></table><p class="note">Counted as the arrows show: to the right, upward, counter-clockwise.${(() => { const dn = m.nodes.filter((n, i) => (n.sup === 'pin' || n.sup === 'roller') && s.reactions[i].Ry < 0 && n1(Math.abs(s.reactions[i].Ry)) !== '0.0').map(n => n.lbl).filter(Boolean); return dn.length ? ` ${dn.length > 1 ? `The reactions at ${dn.slice(0, -1).join(', ')} and ${dn[dn.length - 1]} point` : `The reaction at ${dn[0]} points`} downward: a support here holds both ways. A bearing that only rests on its seat would lift off.` : ''; })()}</p></section>`;
  }
  /* lengths or profiles other than those of the example: it is still what its name says, and Reset brings it back */
  const gCh = m.nodes.some((n, i) => Math.abs(n.x - b0.nodes[i].x) > 1e-9 || Math.abs(n.y - b0.nodes[i].y) > 1e-9) || m.members.some(k => ownSec(k));
  h += `<section class="card"><h3>Try</h3><ul class="try">${(sCh || lCh ? ['Reset brings the example back as it started.'] : gCh ? p.tips.concat(['Reset brings the lengths and profiles of the example back.']) : p.tips).map(t => `<li>${t}</li>`).join('')}</ul></section>`;
  /* what the page is, and what it is not */
  h += '<p class="note scope">Statics only: equilibrium and elastic bending, first-order theory, steel with <span class="nb"><i>E</i> = 210\u2009000 N/mm<sup>2</sup></span>. No load factors, no strength or deflection checks: a design to a standard comes after this.</p>';
  if (h !== st.learn) { st.learn = h; learnEl.innerHTML = h; }
}
learnEl.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('signs')) { st.signs = e.target.open; st.learn = ''; persist(); } }, true);
/* the sub-title of an example; 'tip load' only while the load stands at the free end */
function subOf(p, m) {
  if (p.sub !== 'tip load') return p.sub;
  const l = m.loads[0], k = l && m.members[l.m], L = k ? Math.hypot(m.nodes[k.n2].x - m.nodes[k.n1].x, m.nodes[k.n2].y - m.nodes[k.n1].y) : 0;
  return l && m.nodes[k.n2].sup === 'free' && Math.abs(l.a - L) < 0.005 ? p.sub : 'point load';
}
const VW_beam = () => { const ys = st.model.nodes.map(n => n.y); return Math.max(...ys) - Math.min(...ys) < 1e-9; };

/* ---------- the window of the section ---------- */
/* A small window in the corner: the profile drawn to scale and its values. It shows the section of the structure; while
   the pointer is on a member with a profile of its own, or the menu of such a member is open, it shows that profile. */
const secEl = $('#secw'), g3 = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
function secSVG(sc) {
  const [h, b, tw, tf, r] = sc.dim, k = 76 / Math.max(h, b), H = h * k, B = b * k, T = tf * k, R = r * k, f = v => +v.toFixed(2);
  const x0 = 34 + (76 - B) / 2, y0 = 27 + (76 - H) / 2, xl = x0 + B / 2 - tw * k / 2, xr = xl + tw * k, yb = y0 + H, arc = (x, y) => `A${f(R)} ${f(R)} 0 0 0 ${f(x)} ${f(y)}`;
  const shape = `M${f(x0)} ${f(y0)}H${f(x0 + B)}V${f(y0 + T)}H${f(xr + R)}${arc(xr, y0 + T + R)}V${f(yb - T - R)}${arc(xr + R, yb - T)}H${f(x0 + B)}V${f(yb)}H${f(x0)}V${f(yb - T)}H${f(xl - R)}${arc(xl, yb - T - R)}V${f(y0 + T + R)}${arc(xl - R, y0 + T)}H${f(x0)}Z`;
  const xd = f(x0 - 13), yd = f(y0 - 12), ym = f(y0 + H / 2), tx = (x, y, t, o = '') => `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" font-size="12" fill="currentColor" stroke="none"${o}>${t}</text>`;
  return `<svg viewBox="0 0 128 112" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round">`
    + `<path d="${shape}" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.6"/>`
    + `<path d="M${f(x0 - 9)} ${ym}H${f(x0 + B + 9)}" stroke-dasharray="7 2 1.5 2"/>` + tx(x0 + B + 15, y0 + H / 2 + 4, '<tspan font-style="italic">y</tspan>')
    + `<path d="M${xd} ${f(y0)}V${f(yb)}M${f(x0 - 17)} ${f(y0)}H${f(x0 - 3)}M${f(x0 - 17)} ${f(yb)}H${f(x0 - 3)}"/>` + tx(x0 - 19, y0 + H / 2, `<tspan font-style="italic">h</tspan> = ${h}`, ` transform="rotate(-90 ${f(x0 - 19)} ${f(y0 + H / 2)})"`)
    + `<path d="M${f(x0)} ${yd}H${f(x0 + B)}M${f(x0)} ${f(y0 - 16)}V${f(y0 - 3)}M${f(x0 + B)} ${f(y0 - 16)}V${f(y0 - 3)}"/>` + tx(x0 + B / 2, y0 - 17, `<tspan font-style="italic">b</tspan> = ${b}`)
    + '</svg>';
}
function renderSec() {
  if (!secEl || !st.model) return;
  const m = st.model, mi = st.sel && st.sel.kind === 'member' ? st.sel.mi : st.hover && st.hover.type === 'member' ? st.hover.mi : -1, own = mi >= 0 && m.members[mi] ? ownSec(m.members[mi]) : null;
  const sc = own || SECTIONS[st.sec], more = sectionMore(sc), fmt = v => { const [a, b] = v.toFixed(1).split('.'); return g3(a) + (b === '0' ? '' : '.' + b); };
  const who = own ? `profile of ${memName(mi).replace(/^M/, 'm').replace(/^B/, 'b')}` : m.members.length > 1 ? 'section of the structure' : 'section of the beam';
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`, I = t => `<i>${t}</i>`;
  const h = `<summary><b>${sc.name}</b><span>${who}</span></summary><div class="sb">${secSVG(sc)}<dl>`
    + row(`${I('h')} \u00d7 ${I('b')}`, `${sc.dim[0]} \u00d7 ${sc.dim[1]} mm`) + row(`${I('t')}<sub>w</sub>, ${I('t')}<sub>f</sub>, ${I('r')}`, `${sc.dim[2]}, ${sc.dim[3]}, ${sc.dim[4]} mm`)
    + row(I('A'), `${sc.A} cm<sup>2</sup>`) + row(`${I('I')}<sub>y</sub>`, `${g3(sc.I)} cm<sup>4</sup>`)
    + row(`${I('W')}<sub>y</sub>`, `${more.W >= 1000 ? g3(Math.round(more.W)) : fixd(more.W, 1)} cm<sup>3</sup>`) + row(I('G'), `${fixd(more.G, 1)} kg/m`)
    + row(I('EI'), `${fmt(sectionEI(sc))} kNm<sup>2</sup>`) + row(I('EA'), `${fmt(sectionEA(sc))} kN`)
    + `</dl></div><small>${I('E')} = <span class="nb">210\u2009000 N/mm<sup>2</sup></span>. ${I('A')}, ${I('I')}<sub>y</sub>: ArcelorMittal sales programme for sections (2023). ${I('W')}<sub>y</sub> = ${I('I')}<sub>y</sub> / (${I('h')}/2), with ${I('I')}<sub>y</sub> from the dimensions before it is rounded. Mass <span class="nb">${I('G')} = ${I('A')} \u00b7 7\u2009850 kg/m<sup>3</sup></span>.</small>`;   /* a number with its unit is not cut at the end of a line */
  if (h !== st.secHTML) { st.secHTML = h; secEl.innerHTML = h; }
  if (secEl.open !== st.secOpen) secEl.open = st.secOpen;
}
if (secEl) secEl.addEventListener('toggle', () => { if (secEl.open !== st.secOpen) { st.secOpen = secEl.open; persist(); } });

/* ---------- pointer ---------- */
const segDist = (x, y, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, t = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1); return dist(x, y, x1 + dx * t, y1 + dy * t); };
function pick(x, y) {
  const m = st.model;
  if (!VW || !m) return null;
  /* of several things of a kind within reach the nearest is taken, not the first in the list: two load arrows can
     stand a few pixels apart. Loads that lie on top of each other are equally near: the first of them is taken */
  let hit = null;
  for (const ld of m.loads) { const g = HS.loads.get(ld.id), d = g ? dist(x, y, g.kx, g.ky) : 99; if (d < 12 && (!hit || d < hit.d)) hit = { id: ld.id, d }; }
  if (hit) return { type: 'tail', id: hit.id };
  for (const [mi, g] of HS.udl) { const d = dist(x, y, g.kx, g.ky); if (d < 12 && (!hit || d < hit.d)) hit = { mi, d }; }
  if (hit) return { type: 'udl', mi: hit.mi };
  const nodeAt = i => { const n = m.nodes[i], px = X(n.x), py = Y(n.y); if (n.cs) return dist(x, y, px, n.sup === 'pin' || n.sup === 'roller' ? py + 12 : py) < (n.sup === 'free' ? 13 : 21); return n.ch && dist(x, y, px, py) < 12; };
  for (const ld of m.loads) {
    const g = HS.loads.get(ld.id);
    if (!g) continue;
    const near = m.nodes.some((n, i) => (n.cs || n.ch) && dist(g.hx, g.hy, X(n.x), Y(n.y)) < 14), cut = near ? 15 : 0;
    const d = segDist(x, y, g.hx + g.sg * g.dx * cut, g.hy + g.sg * g.dy * cut, g.tx, g.ty);
    if (d < 9 && (!hit || d < hit.d)) hit = { id: ld.id, d };
  }
  if (hit) return { type: 'load', id: hit.id };
  /* the value of a load takes its load; g.lb is null for a load whose value its twin at the same point carries */
  for (const ld of m.loads) { const g = HS.loads.get(ld.id); if (g && g.lb && x > g.lb[0] && x < g.lb[2] && y > g.lb[1] && y < g.lb[3]) return { type: 'load', id: ld.id }; }
  for (let i = 0; i < m.nodes.length; i++) if (nodeAt(i)) { const n = m.nodes[i], d = dist(x, y, X(n.x), Y(n.y)); if (!hit || d < hit.d) hit = { i, d }; }
  if (hit) return m.nodes[hit.i].cs ? { type: 'sup', i: hit.i } : { type: 'joint', i: hit.i };
  let best = null;
  MG.forEach((g, mi) => { const d = segDist(x, y, g.ax, g.ay, g.bx, g.by); if (d < 11 && (!best || d < best.d)) best = { type: 'member', mi, d, a: clamp(((x - g.ax) * g.ex + (y - g.ay) * g.ey) / g.len, 0, 1) * g.L }; });
  if (best) return best;
  /* a dimension of the drawing: one that can be typed, or one that leads to its load */
  const di = HS.dims.findIndex(q => (q.gi >= 0 || q.load) && x > q.b[0] && x < q.b[2] && y > q.b[1] && y < q.b[3]);
  return di < 0 ? null : { type: 'dim', di, ax: HS.dims[di].ax, gi: HS.dims[di].gi, load: HS.dims[di].load };
}
const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function setHover(h) {
  const key = h ? h.type + (h.id ?? h.mi ?? h.i ?? h.di) : '', old = st.hover ? st.hover.type + (st.hover.id ?? st.hover.mi ?? st.hover.i ?? st.hover.di) : '';
  st.hover = h;
  const m = st.model;
  cv.style.cursor = !h ? 'default' : h.type === 'tail' || h.type === 'load' ? 'grab' : h.type === 'udl' && !(HS.udl.get(h.mi) || {}).par ? 'ns-resize' : h.type === 'member' ? 'crosshair' : 'pointer';
  if (key !== old) {
    let t = HINT;
    if (h) { const n = h.i !== undefined ? m.nodes[h.i] : null;
      t = h.type === 'dim' ? (h.gi >= 0 ? 'Click: type this length.' : 'Click: the place of this load.') : h.type === 'tail' ? 'Drag: size and direction of the load.' : h.type === 'load' ? 'Drag the load along the members. Click to type a value.' : h.type === 'udl' ? (HS.udl.get(h.mi) && HS.udl.get(h.mi).par ? (HS.udl.get(h.mi).axial ? 'Load along the member. Click: its size, shape and direction.' : 'Load at a flat angle to the member: it also bends it. Click: its size, shape and direction.') : 'Drag: size of the distributed load. Click: its shape and values.')
        : h.type === 'sup' ? (n.sup === 'free' ? `End ${n.lbl}: click to add a support.` : `Support ${n.lbl}: ${SUPNAME[n.sup]}. Click to change it.`)
          : h.type === 'joint' ? `Joint ${n.lbl}: ${n.hinge ? 'hinge' : 'rigid'}. Click to change it.` : `Click the ${isBar(h.mi) ? 'bar' : 'member'}: loads, ${lenAxis(h.mi) ? 'length, ' : ''}profile.`; }
    hintEl.textContent = t;
    const mi = h && h.type === 'member' ? h.mi : -1;
    if (mi >= 0 && mi !== st.imi) { st.imi = mi; renderLearn(); }
    renderSec();
  }
  st.dirty = true;
}
/* one step back holds the structure and the section: a change of section is a step like any other */
function pushUndo() { st.undo.push(JSON.stringify({ model: st.model, sec: st.sec })); if (st.undo.length > 60) st.undo.shift(); $('#undo').disabled = false; }
function doDrag(x, y) {
  const m = st.model, d = st.drag;
  /* a load is taken by its arrow, its number or its knob, seldom at the exact point: the drag counts from the place
     of the load, so that taking it moves nothing */
  if (d.ox !== undefined) { x += d.ox; y += d.oy; }
  if (d.type === 'load') {
    const ld = m.loads.find(l => l.id === d.id);
    let best = null;
    MG.forEach((g, mi) => { const t = clamp(((x - g.ax) * g.ex + (y - g.ay) * g.ey) / g.len, 0, 1), dd = dist(x, y, g.ax + g.ex * g.len * t, g.ay + g.ey * g.len * t) - (mi === ld.m ? 16 : 0); if (!best || dd < best.d) best = { mi, t, d: dd }; });
    const L = MG[best.mi].L, mag = 7 / VW.s;
    /* no movement along its member: the load stays where it is, also at a typed place off the steps of the drag */
    if (best.mi === d.m0 && Math.abs(best.t * L - d.a0) * VW.s < 3) { ld.m = d.m0; ld.a = d.a0; resolve('instant'); return; }
    let a = Math.round(best.t * L / 0.05) * 0.05;
    if (a < mag) a = 0; else if (L - a < mag) a = L; else if (Math.abs(a - L / 2) < mag * 0.8) a = L / 2;
    ld.m = best.mi; ld.a = a === L ? L : r2(a);
  } else if (d.type === 'tail') {
    const ld = m.loads.find(l => l.id === d.id), g = HS.loads.get(d.id), sg = d.pull ? -1 : 1, vx = (g.hx - x) * sg, vy = (g.hy - y) * sg, len = Math.hypot(vx, vy) - (d.pull ? 10 : 0);
    if (len < 10) return;
    let ang = Math.round(Math.atan2(-vy, vx) * 180 / Math.PI / 15) * 15;
    if (ang <= -180) ang += 360;
    /* the size follows the change of the radius since the knob was pressed (len0 and P0 are taken then, not at the first
       movement): turning the arrow at the same radius leaves the load as it is, also where the arrow is drawn at its
       longest or shortest length, and an arrow that ends shorter than it started never carries a larger load */
    const dl = len - d.len0, eff = d.len0 + Math.sign(dl) * Math.max(0, Math.abs(dl) - 5);
    ld.ang = ang;
    if (eff === d.len0) ld.P = d.P0;
    else {   /* steps of 0.1 below 1 kN, of 0.5 below 10 kN, of 1 above; a shorter arrow never gives a larger load, a longer one never a smaller */
      const raw = clamp(d.P0 * (eff / d.len0) ** (1 / 0.55), 0.1, 1000), st_ = raw < 1 ? 0.1 : raw < 10 ? 0.5 : 1, P = clamp(r1(Math.round(raw / st_) * st_), 0.1, 1000);
      ld.P = eff < d.len0 ? Math.min(P, d.P0) : Math.max(P, d.P0);
    }
  } else if (d.type === 'udl') {
    const g = HS.udl.get(d.mi), u = m.members[d.mi].udl;
    if (!g || g.par) return;
    /* the handle sets the high value in steps of 0.5; the other end keeps its share */
    /* like the tail of a point load: the size follows the change of the height of the load figure since the grip was
       pressed (h0 is taken then). The height is measured the way the figure is drawn: from the member line to the
       pointer along the direction of the load. A movement along the member, upright or inclined, leaves it as it is */
    const hn = udlHeight(d.mi, g, x, y) * d.f;
    const dh = hn - d.h0, eff = d.h0 + Math.sign(dh) * Math.max(0, Math.abs(dh) - 3);
    const rawT = eff <= 15 ? 0.1 : clamp(d.top * ((eff - 14) / (d.h0 - 14)) ** (1 / 0.6), 0.1, 500), stT = rawT < 1 ? 0.1 : 0.5, rT = clamp(r1(Math.round(rawT / stT) * stT), 0.1, 500);
    const top = eff === d.h0 ? d.top : eff < d.h0 ? Math.min(rT, d.top) : Math.max(rT, d.top);
    u.w1 = r1(d.w1 * top / d.top); u.w2 = r1(d.w2 * top / d.top);
  }
  resolve('instant');
}
cv.addEventListener('pointerdown', e => {
  if (e.button) return;
  const [x, y] = pos(e), h = pick(x, y);
  closePop();
  st.down = { x, y, h, moved: false }; st.mouse = { x, y };
  if (h && (h.type === 'tail' || (h.type === 'udl' && !HS.udl.get(h.mi).par) || h.type === 'load')) { try { cv.setPointerCapture(e.pointerId); } catch (_) {} st.drag = { type: h.type, id: h.id, mi: h.mi, live: false, pull: h.type === 'tail' ? HS.loads.get(h.id).pull : undefined };
    /* what a drag starts from is taken now, at the press: the place of the load, the radius of its arrow, the height of the load figure */
    if (h.type === 'udl') { const u = st.model.members[h.mi].udl, g = HS.udl.get(h.mi); Object.assign(st.drag, { w1: u.w1, w2: u.w2, top: Math.max(u.w1, u.w2), f: g.f, ox: g.kx - x, oy: g.ky - y, h0: Math.max(16, udlHeight(h.mi, g, g.kx, g.ky) * g.f) }); }
    if (h.type === 'load') { const ld = st.model.loads.find(l => l.id === h.id), g = HS.loads.get(h.id); Object.assign(st.drag, { ox: g.hx - x, oy: g.hy - y, a0: ld.a, m0: ld.m }); }
    if (h.type === 'tail') { const ld = st.model.loads.find(l => l.id === h.id), g = HS.loads.get(h.id); Object.assign(st.drag, { ox: g.kx - x, oy: g.ky - y, len0: Math.hypot(g.hx - g.kx, g.hy - g.ky) - (g.pull ? 10 : 0), P0: ld.P }); }
    cv.style.cursor = h.type === 'udl' ? 'ns-resize' : 'grabbing'; }
  st.dirty = true;
});
cv.addEventListener('pointermove', e => {
  const [x, y] = pos(e);
  st.mouse = { x, y };
  if (st.down && dist(x, y, st.down.x, st.down.y) > 4) st.down.moved = true;
  if (st.drag) { if (!st.drag.live) { if (!st.down.moved) return; st.drag.live = true; pushUndo(); } doDrag(x, y); return; }
  setHover(pick(x, y));
});
function endPointer(e) {
  const [x, y] = pos(e), d = st.drag, dn = st.down;
  st.drag = null; st.down = null;
  if (d) {
    if (!d.live) openPop(d.type === 'udl' ? { kind: 'member', mi: d.mi, a: MG[d.mi].L / 2, auto: true } : { kind: 'load', id: d.id }, x, y); else persist();
    setHover(pick(x, y)); return;
  }
  if (!dn || dn.moved || !dn.h) return;
  const h = dn.h, m = st.model;
  if (h.type === 'sup') openPop({ kind: 'sup', i: h.i }, x, y); else if (h.type === 'joint') openPop({ kind: 'joint', i: h.i }, x, y); else if (h.type === 'member') openPop({ kind: 'member', mi: h.mi, a: h.a }, x, y);
  else if (h.type === 'udl') openPop({ kind: 'member', mi: h.mi, a: MG[h.mi].L / 2, auto: true }, x, y);   /* the mark of a load along the member: its menu */
  else if (h.type === 'dim') openPop(h.gi >= 0 ? { kind: 'dim', ax: h.ax, gi: h.gi } : { kind: 'load', id: h.load }, x, y);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', () => { st.drag = null; st.down = null; st.dirty = true; });
cv.addEventListener('pointerleave', () => { if (!st.drag) { st.mouse = null; setHover(null); } });
cv.addEventListener('touchstart', e => { const t = e.touches[0], r = cv.getBoundingClientRect(), h = pick(t.clientX - r.left, t.clientY - r.top); if (h && (h.type === 'tail' || h.type === 'udl' || h.type === 'load')) e.preventDefault(); }, { passive: false });

/* ---------- pop-over: exact values ---------- */
function closePop() { if (!pop.hidden) { pop.hidden = true; st.sel = null; st.dirty = true; renderSec(); } }
function openPop(sel, x, y) {
  const m = st.model;
  st.sel = sel; st.popUndo = null;
  if (sel.kind === 'load') {
    const ld = m.loads.find(l => l.id === sel.id), mb = m.members[ld.m], from = m.nodes[mb.n1].lbl;
    pop.innerHTML = `<div class="ph"><b>Point load</b><button data-act="close" aria-label="Close">×</button></div>`
      + `<label>Size<input id="pp-P" type="number" inputmode="decimal" step="1" min="0" max="1000" value="${ld.P}"><span>kN</span></label>`
      + `<label>${from ? 'From ' + from : 'Position'}<input id="pp-a" type="number" inputmode="decimal" step="0.1" min="0" max="${r2(MG[ld.m].L)}" value="${r2(ld.a)}"><span>m</span></label>`
      + `<div class="seg txt" role="group" aria-label="On a joint">${[0, 1].map(k => `<button data-at="${k}" aria-pressed="${ld.a === (k ? MG[ld.m].L : 0)}">${(t => (t.startsWith('the ') ? t[4].toUpperCase() + t.slice(5) : 'On ' + t))(endName(ld.m, k))}</button>`).join('')}</div>`
      + `<div class="seg" role="group" aria-label="Direction">${[[-90, '↓', 'down'], [0, '→', 'right'], [90, '↑', 'up'], [180, '←', 'left']].map(a => `<button data-ang="${a[0]}" aria-label="${a[2]}" aria-pressed="${ld.ang === a[0]}">${a[1]}</button>`).join('')}</div>`
      + '<button class="wide del" data-act="del">Delete load</button>';
  } else if (sel.kind === 'sup') {
    const n = m.nodes[sel.i];
    pop.innerHTML = `<div class="ph"><b>${n.sup === 'free' ? 'End' : 'Support'} ${n.lbl}</b><button data-act="close" aria-label="Close">\u00d7</button></div>`
      + `<div class="seg txt" role="group" aria-label="Support type">${[['fixed', 'Fixed'], ['pin', 'Pin'], ['roller', 'Roller'], ['free', 'Free']].map(k => `<button data-sup="${k[0]}" aria-pressed="${n.sup === k[0]}">${k[1]}</button>`).join('')}</div>`;
  } else if (sel.kind === 'dim') {
    const g = gridOf(m, sel.ax);
    pop.innerHTML = `<div class="ph"><b>Dimension</b><button data-act="close" aria-label="Close">\u00d7</button></div>`
      + lenField(sel.ax === 'x' ? 'Length' : 'Height', g[sel.gi + 1] - g[sel.gi])
      + '<small>The joints beyond it move along. Point loads keep their share of the length.</small>';
  } else if (sel.kind === 'joint') {
    const n = m.nodes[sel.i];
    pop.innerHTML = `<div class="ph"><b>Joint ${n.lbl}</b><button data-act="close" aria-label="Close">\u00d7</button></div>`
      + `<div class="seg txt" role="group" aria-label="Joint type">${[[0, 'Rigid'], [1, 'Hinge']].map(k => `<button data-hinge="${k[0]}" aria-pressed="${+n.hinge === k[0]}">${k[1]}</button>`).join('')}</div>`;
  } else {
    const mb = m.members[sel.mi], u = mb.udl, sh = shapeOf(u), la = m.nodes[mb.n1].lbl, lb = m.nodes[mb.n2].lbl, flip = MG[sel.mi].ex < -0.5;
    /* where a new point load will stand: the place of the click on the member, in steps of 5 cm, also where a load stands
       already. A menu opened without a place (button "Loads", the arrows to the next member) offers the middle of the
       member, or of its widest gap when a load stands there. The button names the place */
    if (sel.a0 === undefined) { const Lm = MG[sel.mi].L, a0 = sel.auto ? freeSpot(sel.mi, Lm / 2) : clamp(Math.round(sel.a / 0.05) * 0.05, 0, Lm); sel.a0 = a0 >= Lm - 1e-9 ? Lm : r2(a0); }
    /* the pictures of the two triangles follow the member as it lies on the sheet */
    const ico = k => `<svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true"><path d="${SHP[flip && k !== 'uni' ? (k === 'up' ? 'down' : 'up') : k]}" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const shapes = [['none', 'None', 'no distributed load'], ['uni', ico('uni'), 'uniform'], ['up', ico('up'), `triangle, high at ${lb || 'the end'}`], ['down', ico('down'), `triangle, high at ${la || 'the start'}`]];
    const val = (id, lbl, v) => `<label class="q">${lbl}<input id="${id}" type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${v}"><span>kN/m</span></label>`;
    /* the length of a member along x or y is typed here; that of an inclined member follows from the two dimensions of the drawing */
    const lax = lenAxis(sel.mi);
    pop.innerHTML = `<div class="ph"><b>${memName(sel.mi)}</b>${lax ? '' : `<span>${n2(MG[sel.mi].L)} m</span>`}${m.members.length > 1 ? '<button data-act="prev" aria-label="Previous member">‹</button><button data-act="next" aria-label="Next member">›</button>' : ''}<button data-act="close" aria-label="Close">×</button></div>`
      + (lax ? lenField('Length', MG[sel.mi].L) : '')
      + `<button class="wide" data-act="add">${addText(sel)}</button>`
      + '<div>Distributed load</div>'
      + `<div class="seg" role="group" aria-label="Shape of the distributed load">${shapes.map(k => `<button data-shape="${k[0]}" aria-label="${k[2]}" title="${k[2]}" aria-pressed="${sh === k[0]}">${k[1]}</button>`).join('')}</div>`
      + val('pp-w1', la ? 'At ' + la : 'At the start', u.w1) + val('pp-w2', lb ? 'At ' + lb : 'At the end', u.w2)
      + (Math.abs(MG[sel.mi].ey) > 1e-6 ? '<small class="q">kN/m: per metre of the member\u2019s length</small>' : '')
      + `<div class="seg q" role="group" aria-label="Direction of the distributed load">${[[-90, '\u2193', 'down'], [0, '\u2192', 'right'], [90, '\u2191', 'up'], [180, '\u2190', 'left']].map(a => `<button data-uang="${a[0]}" aria-label="${a[2]}" aria-pressed="${u.ang === a[0]}">${a[1]}</button>`).join('')}</div>`
      /* the profile: of this member where the structure has several; the one member of a beam has the section of the structure */
      /* several members: the profile of this member. One member: the choice is the section of the structure, the same as in
         the header; it is named so, and the note says that Reset leaves it (review 09, C104) */
      + `<label class="sel">${m.members.length > 1 ? 'Profile' : 'Section'}<select id="pp-sec">${m.members.length > 1 ? `<option value=""${ownSec(mb) ? '' : ' selected'}>as the structure (${SECTIONS[st.sec].name})</option>` : ''}${SECTIONS.map((q, i) => `<option value="${i}"${(m.members.length > 1 ? mb.sec === i : st.sec === i) ? ' selected' : ''}>${q.name}</option>`).join('')}</select></label>`
      + (m.members.length > 1 ? '' : '<small>The same choice as “Section” in the header. It stays when the example is reset or another one is picked.</small>');
  }
  pop.hidden = false; pop.classList.toggle('mem', sel.kind === 'member' && m.members.length > 1); pop.classList.toggle('noq', sel.kind === 'member' && !m.members[sel.mi].udl.on);
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = clamp(x + 16, 8, Math.max(8, W - pw - 8)) + 'px'; pop.style.top = clamp(y + 16, 8, Math.max(8, H - ph - 8)) + 'px';
  st.dirty = true; renderSec();
}
/* the length a menu stands for: of its member, or of its step of the grid */
const lenNow = s => { if (s.kind === 'member') return memLen(st.model, s.mi); const g = gridOf(st.model, s.ax); return g[s.gi + 1] - g[s.gi]; };
/* the field of a length, and what the button of a new point load says */
const lenField = (lbl, v) => `<label>${lbl}<input id="pp-len" type="number" inputmode="decimal" step="0.5" min="${LMIN}" max="${LMAX}" value="${r2(v)}"><span>m</span></label>`;
const addText = sel => `Add point load at ${n2(sel.a0)} m from ${endName(sel.mi, 0)}`;
/* A typed length. Every value typed into the field is applied to the structure as it stood when the edit of the field
   began (st.editBase), not to what the value before it left: typing 12 passes through 1, and the loads must not keep
   the rounding of that step. While the field holds no length the page takes (nothing, or a value outside the limits) the
   structure is the one from the start of the edit: 35 typed key by key passes through 3, and that 3 must not stay
   (review 10, C112). So what an edit leaves follows from the structure before it and from what the field holds at the
   end, not from the keys on the way. v: the length to apply, or null for none. */
function typeLength(inp, v) {
  const m = st.model, s = st.sel;
  popUndo('pp-len');
  const b = JSON.parse(st.editBase);
  if (v !== null) {
    const len = clamp(rnd(v, 2), LMIN, LMAX);
    let ax, v0, v1;
    if (s.kind === 'member') { const k = b.members[s.mi]; ax = lenAxis(s.mi, b); v0 = Math.min(b.nodes[k.n1][ax], b.nodes[k.n2][ax]); v1 = Math.max(b.nodes[k.n1][ax], b.nodes[k.n2][ax]); }
    else { const g = gridOf(b, s.ax); ax = s.ax; v0 = g[s.gi]; v1 = g[s.gi + 1]; }
    stretch(b, ax, v0, v1, len);
    taken(inp, v, len, 'm', 2);
  }
  b.nodes.forEach((n, i) => { m.nodes[i].x = n.x; m.nodes[i].y = n.y; });
  b.loads.forEach((l, i) => { m.loads[i].a = l.a; });
  if (st.lenA0) {   /* the place the button offers for a new load keeps its share of the length too */
    const [a0, L0] = st.lenA0, L1 = memLen(m, s.mi);
    s.a0 = a0 >= L0 - 1e-9 ? L1 : a0 <= 1e-9 ? 0 : Math.min(r2(a0 * L1 / L0), L1);
    const bt = pop.querySelector('[data-act="add"]'); if (bt) bt.textContent = addText(s);
  }
  keptBack();
}
/* A kept state of "Compare" that an entry on the way dropped comes back when the structure has the lengths it was kept with again */
function keptBack() {
  const g = st.editGhost, m = st.model;
  if (g && !st.ghost && g.mem.length === m.members.length && g.mem.every((G, i) => Math.abs(G.L - memLen(m, i)) <= 1e-9)) { st.ghost = g; $('#cmp').setAttribute('aria-pressed', true); if (hintEl.textContent.startsWith('Compare is off')) hintEl.textContent = ''; }
}
/* one step back per field and per button: typing in one field is one step. popBase: the structure as it stood when
   that step began. editBase: the structure as it stood when the edit of a field began: at its first key, and again each
   time the field is confirmed or left. A field that holds nothing the page takes leaves the structure as it was then;
   editGhost is the kept state of "Compare" of that moment, lenA0 the place the button offered for a new load */
const beginEdit = () => { const s = st.sel; st.editBase = JSON.stringify(st.model); st.editGhost = st.ghost; st.lenA0 = s && s.kind === 'member' ? [s.a0, memLen(st.model, s.mi)] : null; };
const popUndo = key => { if (st.popUndo !== key) { pushUndo(); st.popUndo = key; st.popBase = JSON.stringify(st.model); beginEdit(); } };
/* a field is left with the structure as it stood before it was touched: there is nothing to step back to */
const dropStep = key => { if (st.popUndo === key && st.popBase === JSON.stringify(st.model) && st.undo.length && JSON.parse(st.undo[st.undo.length - 1]).sec === st.sec) { st.undo.pop(); $('#undo').disabled = !st.undo.length; st.popUndo = null; } };
/* shape of a distributed load: none, uniform, triangle high at the end, triangle high at the start, or two values */
const SHP = { uni: 'M3 13H21V4H3Z', up: 'M3 13H21V4Z', down: 'M3 13H21L3 4Z' };
const shapeOf = u => (!u.on ? 'none' : u.w1 === u.w2 ? 'uni' : !u.w1 ? 'up' : !u.w2 ? 'down' : 'mix');
const syncShape = u => { for (const b of pop.querySelectorAll('[data-shape]')) b.setAttribute('aria-pressed', b.dataset.shape === shapeOf(u)); pop.classList.toggle('noq', !u.on); };
function openMember(mi) {   /* the menu of a member, opened at its middle */
  const g = MG[mi];
  if (st.imi !== mi) { st.imi = mi; renderLearn(); }
  openPop({ kind: 'member', mi, a: g.L / 2, auto: true }, (g.ax + g.bx) / 2, (g.ay + g.by) / 2);
}
/* the place a menu offers when none was clicked: a, or the middle of the widest gap when a load stands at a.
   'At a' means within 2 % of the member length, at least 5 cm: two arrows closer than that stand on each other on the sheet.
   So a load at 3.10 m of a 6 m beam (clearance 0.12 m) sends the offer from the middle to 1.55 m. The field of the menu takes any other place. */
function freeSpot(mi, a) {
  const L = MG[mi].L, at = st.model.loads.filter(l => l.m === mi).map(l => l.a).sort((p, q) => p - q);
  if (!at.some(v => Math.abs(v - a) < Math.max(0.05, 0.02 * L))) return a;
  const br = [0, ...at, L];
  let best = a, gap = 0;
  for (let i = 0; i < br.length - 1; i++) if (br[i + 1] - br[i] > gap + 1e-9) { gap = br[i + 1] - br[i]; best = (br[i] + br[i + 1]) / 2; }
  return Math.round(best / 0.05) * 0.05;
}
/* how the menu of a load names an end of its member: by the letter of the joint; a joint without a letter (truss) by
   where it lies on the member: left or right, lower or upper */
const endName = (mi, k) => { const m = st.model.members[mi], a = st.model.nodes[k ? m.n2 : m.n1], b = st.model.nodes[k ? m.n1 : m.n2];
  return a.lbl ? a.lbl : Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? (a.x < b.x ? 'the left joint' : 'the right joint') : (a.y < b.y ? 'the lower joint' : 'the upper joint'); };
/* the note under a field whose entry the page does not take */
function limit(inp, text, soft) {
  let w = pop.querySelector('small.lim');
  if (w && (!text || w.previousElementSibling !== inp.closest('label'))) { w.remove(); w = null; }
  inp.classList.toggle('bad', !!text && !soft);
  if (!text) return;
  if (!w) { w = document.createElement('small'); inp.closest('label').after(w); }
  w.className = soft ? 'q lim soft' : 'q lim'; w.textContent = text; w.dataset.leave = '';
}
/* a typed value with more decimals than the page keeps: the menu says which value it takes */
const taken = (inp, typed, used, unit, d = 1) => limit(inp, Math.abs(typed - used) > 1e-9 ? `Taken as ${d === 2 ? n2(used) : n1(used)} ${unit}.` : '', true);
pop.addEventListener('input', e => {
  const m = st.model, s = st.sel, v = parseFloat(e.target.value);
  if (!s || (s.kind !== 'load' && s.kind !== 'member' && s.kind !== 'dim')) return;
  if (e.target.id === 'pp-len') {
    /* a length outside the limits is not taken, and an empty field is no length: the structure is the one from before the
       field was touched, also where a digit on the way was a length of its own, and the menu says what it stays */
    const out = isFinite(v) && (v < LMIN - 1e-12 || v > LMAX + 1e-12);
    if (!isFinite(v) || out) { typeLength(e.target, null); limit(e.target, out ? `From ${n2(LMIN)} to ${n2(LMAX)} m. It stays ${n2(lenNow(s))} m.` : ''); }
    else { limit(e.target, ''); typeLength(e.target, v); }
  } else if (s.kind === 'dim') return;
  else if (s.kind === 'load') {
    const ld = m.loads.find(l => l.id === s.id);
    popUndo(e.target.id);
    /* an empty field, and a size below the smallest load, are not taken: the load is as it stood when the edit of the
       field began, and for a size the menu says so, until the field holds a value the page takes */
    const low = e.target.id === 'pp-P' && isFinite(v) && v < 0.1 - 1e-12;
    if (!isFinite(v) || low) {
      const b0 = JSON.parse(st.editBase).loads.find(l => l.id === s.id);
      if (b0) { if (e.target.id === 'pp-P') ld.P = b0.P; if (e.target.id === 'pp-a') ld.a = b0.a; }
      limit(e.target, low ? `From 0.1 to 1000 kN. The load keeps ${n1(ld.P)} kN.` : '');
      if (e.target.id === 'pp-a') for (const b of pop.querySelectorAll('button[data-at]')) b.setAttribute('aria-pressed', ld.a === (+b.dataset.at ? MG[ld.m].L : 0));
      resolve('instant'); persist(); return;
    }
    limit(e.target, '');
    /* While a field is typed in, the page never writes into it: what the field holds is what was typed, until it is
       confirmed or left (review 11, C121: 9000 on the way to 9000e-1 was replaced by the limit 1000, and the keys
       that followed made 1000e-1 of it, 100 kN for 900). A value above the limit loads the limit, and the menu says so */
    if (e.target.id === 'pp-P') { ld.P = Math.min(r1(v), 1000); if (v > 1000) limit(e.target, `From 0.1 to 1000 kN. Taken as ${n1(ld.P)} kN.`, true); else taken(e.target, v, ld.P, 'kN'); }
    if (e.target.id === 'pp-a') {
      /* a place typed inside the member stays inside it, also a few millimetres before its end. The end itself is typed as
         the length of the member or more, or chosen with the button of its joint; the menu then names the joint */
      const L = MG[ld.m].L;
      ld.a = v >= L - 1e-9 ? L : v <= 0 ? 0 : Math.min(r2(v), L);
      /* the length of an inclined member is shown rounded (4.24 m for 4.2426 m). A place typed as that rounded length lies
         inside the member, a few millimetres before the joint: the menu says so and points to the button (review 09, C109) */
      const Lt = Math.abs(L - r2(L)) > 1e-9 ? L.toFixed(3) : n2(L);
      if (ld.a === L || ld.a === 0) limit(e.target, `On ${endName(ld.m, ld.a ? 1 : 0)}${ld.a ? `: the member is ${Lt} m long` : ''}.`, true);
      else if (L - ld.a < 0.01 - 1e-9 && n2(ld.a) === n2(L)) limit(e.target, `Inside the member, ${n1((L - ld.a) * 1000)} mm before ${endName(ld.m, 1)}: the member is ${Lt} m long. The button puts the load on the joint.`, true);
      else taken(e.target, v, ld.a, 'm', 2);
      for (const b of pop.querySelectorAll('button[data-at]')) b.setAttribute('aria-pressed', ld.a === (+b.dataset.at ? L : 0));
    }
  } else {
    const u = m.members[s.mi].udl, k = e.target.id === 'pp-w1' ? 'w1' : e.target.id === 'pp-w2' ? 'w2' : '';
    if (!k) return;
    popUndo(e.target.id);
    if (!isFinite(v)) { const u0 = JSON.parse(st.editBase).members[s.mi].udl; u[k] = u0[k]; u.on = u0.on; limit(e.target, ''); syncShape(u); resolve('instant'); persist(); return; }   /* an empty field: the value from before it was touched */
    u[k] = clamp(r1(v), 0, 500); u.on = !!(u.w1 || u.w2);   /* zero at both ends: no load, and the fields say so */
    if (v > 500 || v < 0) limit(e.target, `From 0 to 500 kN/m. Taken as ${n1(u[k])} kN/m.`, true); else taken(e.target, v, u[k], 'kN/m');
    syncShape(u);
  }
  resolve('instant'); persist();
});
/* a field that is left shows the value the page took: limits and rounding are not silent */
pop.addEventListener('change', e => {
  const m = st.model, s = st.sel, t = e.target;
  if (s && s.kind === 'member' && t.id === 'pp-sec') {   /* one step back per choice */
    pushUndo(); st.popUndo = null;
    if (m.members.length > 1) m.members[s.mi].sec = t.value === '' ? null : +t.value; else { st.sec = +t.value; $('#sec').value = st.sec; }
    resolve('tween'); persist(); return;
  }
  if (!s || t.tagName !== 'INPUT') return;
  if (s.kind === 'load') { const ld = m.loads.find(l => l.id === s.id); if (ld && t.id === 'pp-P') t.value = ld.P; if (ld && t.id === 'pp-a') t.value = r2(ld.a); }
  /* the note goes a moment after the field is left, not at once: a field is often left by a click on a button of the
     menu, and a line that vanishes under the pointer would move that button away before the click is done */
  t.classList.remove('bad');
  const w = pop.querySelector('small.lim');
  if (w) { const k = String(performance.now()); w.dataset.leave = k; setTimeout(() => { if (w.isConnected && w.dataset.leave === k) w.remove(); }, 300); }
  if (s.kind === 'member') { const u = m.members[s.mi].udl; if (t.id === 'pp-w1') t.value = u.w1; if (t.id === 'pp-w2') t.value = u.w2; }
  if (t.id === 'pp-len') t.value = r2(lenNow(s));
  dropStep(t.id);
  beginEdit();   /* the field is confirmed or left: what it holds now is where its next edit starts from */
});
pop.addEventListener('focusout', e => { if (e.target.tagName === 'INPUT' && e.target.type === 'number') dropStep(e.target.id); });
pop.addEventListener('click', e => {
  const b = e.target.closest('button'), m = st.model, s = st.sel, step = () => popUndo('b' + (st.popN = (st.popN || 0) + 1));
  if (!b || !s) return;
  if (b.dataset.act === 'close') return closePop();
  if (b.dataset.act === 'del') { pushUndo(); m.loads = m.loads.filter(l => l.id !== s.id); closePop(); resolve('tween'); return persist(); }
  if (b.dataset.act === 'prev' || b.dataset.act === 'next') { const n = m.members.length; return openMember((s.mi + (b.dataset.act === 'next' ? 1 : n - 1)) % n); }
  if (b.dataset.act === 'add') { pushUndo(); m.loads.push({ id: m.nid++, m: s.mi, a: s.a0, P: m.pref, ang: -90 }); closePop(); resolve('tween'); return persist(); }
  if (b.dataset.shape !== undefined) {
    step();
    const u = m.members[s.mi].udl, top = Math.max(u.w1, u.w2) || m.wref, k = b.dataset.shape;
    if (k === 'none') u.on = false; else { u.on = true; u.w1 = k === 'up' ? 0 : top; u.w2 = k === 'down' ? 0 : top; }
    $('#pp-w1').value = u.w1; $('#pp-w2').value = u.w2; pop.classList.toggle('noq', !u.on);
  }
  if (b.dataset.ang !== undefined) { step(); m.loads.find(l => l.id === s.id).ang = +b.dataset.ang; }
  if (b.dataset.at !== undefined) { step(); const ld = m.loads.find(l => l.id === s.id), f = pop.querySelector('#pp-a'); ld.a = +b.dataset.at ? MG[ld.m].L : 0; if (f) { f.value = r2(ld.a); limit(f, ''); } }   /* onto the joint at that end of its member */
  if (b.dataset.uang !== undefined) { step(); m.members[s.mi].udl.ang = +b.dataset.uang; }   /* the direction alone switches no load on */
  if (b.dataset.sup !== undefined) { step(); m.nodes[s.i].sup = b.dataset.sup; }
  if (b.dataset.hinge !== undefined) { step(); m.nodes[s.i].hinge = b.dataset.hinge === '1'; }
  for (const o of b.parentNode.children) o.setAttribute('aria-pressed', o === b);
  resolve('tween'); persist();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') closePop();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); undo(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && st.sel.kind === 'load' && e.target.tagName !== 'INPUT') { e.preventDefault(); pushUndo(); st.model.loads = st.model.loads.filter(l => l.id !== st.sel.id); closePop(); resolve('tween'); persist(); }
});

/* ---------- controls ---------- */
function undo() {
  if (!st.undo.length) return;
  closePop();
  const old = st.model.members.length;
  const back = JSON.parse(st.undo.pop()); st.model = back.model; $('#undo').disabled = !st.undo.length;
  if (back.sec !== st.sec) { st.sec = back.sec; $('#sec').value = st.sec; showEI(); }
  resolve(st.model.members.length === old ? 'tween' : 'grow'); persist();
}
function setGhost(g) {   /* keep the present lines as dashed outlines while the structure is changed */
  if (g) g.bars0 = (st.bars || []).slice();   /* which members are bars in the kept state: its hinges may be closed later */
  st.ghost = g; $('#cmp').setAttribute('aria-pressed', !!g);
  if (st.sol) { targets(); st.dirty = true; }
}
/* the last tab: the deflection of a beam, the displacements of a frame or a truss */
function nameTabs() { const t = $('#tab-D'), h = VW_beam() ? '<i>w</i>Deflection' : '<i>\u03b4</i>Displacement'; if (t && t.innerHTML !== h) t.innerHTML = h; }
function setFocus(q) {
  st.focus = q; nameTabs();
  for (const t of document.querySelectorAll('.tab')) { t.setAttribute('aria-selected', t.dataset.q === q); t.tabIndex = t.dataset.q === q ? 0 : -1; }
  renderLearn(); st.dirty = true; persist();
}
function loadPreset(id, keepFocus) {
  V3.clear(); st.pid = id; st.model = buildModel(preset()); st.undo = []; $('#undo').disabled = true; st.imi = -1; st.ext = null; st.prev = null; st.hover = null; st.sol = null; st.ghost = null; $('#cmp').setAttribute('aria-pressed', false);
  closePop();
  if (!keepFocus) st.focus = preset().focus;
  for (const b of document.querySelectorAll('.pre')) { const on = b.dataset.id === id; b.setAttribute('aria-current', on); if (on && b.scrollIntoView && matchMedia('(max-width:1180px)').matches) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  resolve('grow'); setFocus(st.focus);
  for (const q of ['V', 'M', 'D', 'N']) st.pw[q] = pwTarget(q);
  hintEl.textContent = HINT;
}
function thumb(p) {
  const xs = p.nodes.map(n => n[0]), ys = p.nodes.map(n => n[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const bw = x1 - x0 || 1, bh = y1 - y0, s = Math.min(74 / bw, bh ? 20 / bh : 1e9), ox = 48 - (x0 + x1) / 2 * s, oy = bh ? 31 : 21, PX = x => ox + x * s, PY = y => oy - (y - y0) * s;
  let o = '';
  for (const [a, b, q = {}] of p.members) {
    const A = p.nodes[a], B = p.nodes[b], ax = PX(A[0]), ay = PY(A[1]), bx = PX(B[0]), by = PY(B[1]);
    o += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;
    const w = Array.isArray(q.w) ? q.w : [q.w || 0, q.w || 0];
    if (w[0] && w[0] === w[1]) o += `<path d="M${ax} ${ay - 6}H${bx}" stroke="var(--load)" stroke-width="3.4" stroke-dasharray="1.8 3.2"/>`;
    else if (w[0] || w[1]) o += `<path d="M${ax} ${ay - 3.5}L${bx} ${by - 3.5}L${bx} ${by - 3.5 - 9 * w[1] / Math.max(w[0], w[1])}L${ax} ${ay - 3.5 - 9 * w[0] / Math.max(w[0], w[1])}Z" fill="var(--load)" fill-opacity=".55"/>`;
  }
  for (const [x, y, sup, hinge] of p.nodes) {
    const px = PX(x), py = PY(y);
    if (sup === 'pin' || sup === 'roller') o += `<path d="M${px} ${py}l-4.5 7h9z" fill="var(--bg)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` + (sup === 'roller' ? `<path d="M${px - 5} ${py + 9.6}h10" stroke="currentColor" stroke-width="1.5"/>` : '');
    if (sup === 'fixed') o += bh && y === y0 ? `<path d="M${px - 6} ${py}h12" stroke="currentColor" stroke-width="3.6"/>` : `<path d="M${px} ${py - 7}v14" stroke="currentColor" stroke-width="3.6"/>`;
    if (hinge) o += `<circle cx="${px}" cy="${py}" r="2.4" fill="var(--bg)" stroke="currentColor" stroke-width="1.4"/>`;
  }
  for (const [mi, a, , ang = -90] of p.loads || []) {
    const [n1i, n2i] = p.members[mi], A = p.nodes[n1i], B = p.nodes[n2i], L = Math.hypot(B[0] - A[0], B[1] - A[1]), hx = PX(A[0] + (B[0] - A[0]) * a / L), hy = PY(A[1] + (B[1] - A[1]) * a / L), r = ang * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r);
    const tx = p.truss ? hx + dx * 3 : hx - dx * 14, ty = p.truss ? hy + dy * 3 : hy - dy * 14, ex = tx + dx * 7, ey = ty + dy * 7, fx = ex + dx * 5.5, fy = ey + dy * 5.5;
    o += `<path d="M${tx} ${ty}L${ex} ${ey}" stroke="var(--load)" stroke-width="2"/><path d="M${fx} ${fy}L${ex - dy * 3.2} ${ey + dx * 3.2}L${ex + dy * 3.2} ${ey - dx * 3.2}z" fill="var(--load)"/>`;
  }
  return `<svg viewBox="0 0 96 ${bh ? 46 : 40}" aria-hidden="true">${o}</svg>`;
}
function buildChrome() {
  let h = '', grp = '';
  for (const p of PRESETS) { if (p.group !== grp) { grp = p.group; h += `<h2>${grp}</h2>`; } h += `<button class="pre" data-id="${p.id}">${thumb(p)}<b>${p.name}</b><span>${p.sub}</span></button>`; }
  $('#rail').innerHTML = h;
  $('#rail').addEventListener('click', e => { const b = e.target.closest('.pre'); if (b) { loadPreset(b.dataset.id); persist(); } });
  $('#sec').innerHTML = SECTIONS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
  $('#sec').addEventListener('change', e => { closePop(); pushUndo(); st.sec = +e.target.value; showEI(); resolve('tween'); persist(); });
  for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => setFocus(t.dataset.q));
  $('.tabs').addEventListener('keydown', e => { const i = ['M', 'V', 'N', 'D'].indexOf(st.focus), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { setFocus(['M', 'V', 'N', 'D'][(i + d + 4) % 4]); $('#tab-' + st.focus).focus(); } });
  $('#vals').addEventListener('click', () => { st.vals = !st.vals; $('#vals').setAttribute('aria-pressed', st.vals); st.dirty = true; persist(); });
  $('#theme').addEventListener('click', () => { setTheme(darkNow() ? 'light' : 'dark'); persist(); });
  $('#v3d').addEventListener('click', () => { V3.toggle(); showEI(); persist(); });
  $('#undo').addEventListener('click', undo);
  $('#loads').addEventListener('click', () => {   /* the member menu without having to find the member first */
    if (!pop.hidden && st.sel && st.sel.kind === 'member') return closePop();
    const m = st.model;
    let mi = st.imi >= 0 && st.imi < m.members.length ? st.imi : m.members.findIndex(q => q.udl.on);
    if (mi < 0) mi = m.loads.length ? m.loads[0].m : 0;
    openMember(mi);
  });
  $('#cmp').addEventListener('click', () => { setGhost(st.ghost ? null : st.sol && st.sol.ok ? st.sol : null); });
  $('#reset').addEventListener('click', () => { loadPreset(st.pid, true); persist(); });
}
function showEI() {
  const s = SECTIONS[st.sec], fmt = v => { const [a, b] = v.toFixed(1).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + (b === '0' ? '' : '.' + b); };
  $('#sec').value = st.sec;
  /* a truss moves by EA; EI is shown with it only while one of its bars is bent by a load between its joints, and only
     where the row of the header has room for both. The header keeps its height whatever the structure carries: the
     sheet under it does not jump when a bar starts to bend (the window of the section gives both values) */
  const tr = st.model && st.model.truss, ea = `EA = ${fmt(sectionEA(s))} kN`, ei = `EI = ${fmt(sectionEI(s))} kNm\u00b2`;
  const el = $('#ei'), hd = el.closest('header'), set = t => { if (el.textContent !== t) el.textContent = t; };
  set(tr ? ea : ei);
  if (tr && st.zero.M === false) { const h0 = hd.offsetHeight; set(`${ea} \u00b7 ${ei}`); if (hd.offsetHeight > h0) set(ea); }
}
function persist() { try { localStorage.setItem('statics-lab', JSON.stringify({ pid: st.pid, v3: V3.on, focus: st.focus, sec: st.sec, vals: st.vals, signs: st.signs, secOpen: st.secOpen, theme: st.theme })); } catch (_) {} }
/* Light or dark sheet. Until the button is used the page is as the computer has it; then it is as chosen, and the choice
   is kept with the other settings. The colours of the drawing are read again from the style sheet */
const darkNow = () => (st.theme ? st.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function setTheme(t) {
  st.theme = t === 'dark' || t === 'light' ? t : null;
  if (st.theme) document.documentElement.dataset.theme = st.theme; else delete document.documentElement.dataset.theme;
  $('#theme').setAttribute('aria-pressed', darkNow());
  readColors();
}

/* ---------- loop and start ---------- */
/* The room that the foot of the sheet takes at this width: the longest hint and the longest line on the factor of the
   drawing (that of a kept state of "Compare" with a small factor), on as many lines as they need. The drawing keeps that room free (layout), so the hint never lies on a line
   or a dimension, whatever it says at the moment. Measured again when the size of the sheet changes and when the fonts
   have come. Up to version 14 the drawing left room for one line, and the hint takes two and three lines at common
   widths. */
function footRoom() {
  const foot = hintEl.parentElement, h0 = hintEl.textContent, m0 = magEl.textContent;
  hintEl.textContent = HINT; magEl.textContent = 'Dashed outline: the kept state. Deflected beam drawn ×0.00017';
  const r = foot.offsetHeight;
  hintEl.textContent = h0; magEl.textContent = m0;
  return r;
}
function resize() {
  const r = stage.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  st.footH = footRoom();
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); st.dirty = true;
  if (st.sol) draw();
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(64, now - last);
  last = now;
  if (st.sol && W) {
    let anim = false;
    st.tf = st.prev ? ease((now - st.tw0) / 340) : 1;
    if (st.prev) { anim = true; if (st.tf >= 1) st.prev = null; }
    st.gf = ease((now - st.grow0) / 560); if (st.gf < 1) anim = true;
    if (stepExt(dt)) anim = true;
    if (stepPW(dt)) anim = true;
    if (anim || st.dirty || st.wasAnim) { st.dirty = false; st.wasAnim = anim; draw(); V3.mark(); }
    V3.tick();
  }
  requestAnimationFrame(frame);
}
function start(d) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('statics-lab') || '{}'); } catch (_) {}
  const src = d && d.pid ? d : saved;
  if (typeof src.sec === 'number' && SECTIONS[src.sec]) st.sec = src.sec;
  if (typeof src.vals === 'boolean') st.vals = src.vals;
  if (typeof saved.signs === 'boolean') st.signs = saved.signs;
  if (typeof saved.secOpen === 'boolean') st.secOpen = saved.secOpen;
  buildChrome(); setTheme(saved.theme); if (saved.v3 === true) V3.set(true); showEI(); $('#vals').setAttribute('aria-pressed', st.vals);
  new ResizeObserver(resize).observe(stage); resize();
  loadPreset(PRESETS.some(p => p.id === src.pid) ? src.pid : PRESETS[0].id);
  if ('MVND'.includes(src.focus || '-')) setFocus(src.focus);
  if (d && d.model && d.model.members && d.model.members.length === st.model.members.length) { st.model = normModel(d.model); resolve('grow'); }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { $('#theme').setAttribute('aria-pressed', darkNow()); readColors(); });
  addEventListener('resize', showEI);   /* the room of the header's row changes with the window */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { st.footH = footRoom(); st.dirty = true; });
  requestAnimationFrame(frame);
}
start({});
/*DEBUG*/ window.__lab = { st, pick, targets, resolve, keyPts, barStyle, n1, FS, SECTIONS, sectionMore, gridOf, stretch, get VW() { return VW; }, get MG() { return MG; }, get HS() { return HS; }, get boxes() { return boxes; }, V3 };
