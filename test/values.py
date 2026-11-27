"""Every value that belongs on the sheet is on the sheet. For each example and each other load case, in each tab:
(1) the end values and peaks of the line of that tab and the support reactions are looked up among the texts that
    were drawn. The expected values are worked out here from the analysis (ends of every piece of a member, stationary
    values of the moment), without the drawing code, without a cut-off and without reading what the page says about a
    line that is zero: every value that prints other than 0.0, every reaction component that prints other than 0.0.
    In the deflection tab the largest and smallest deflections of a beam, its free ends and load points, the rotation at
    its supports and free ends (on a sheet of 560 px or more), and for a frame or a truss the largest displacement of
    every member that moves, are worked out on a scan of their own.
    This is a look-up of texts: a value that occurs twice on the sheet counts once, and the look-up does not say on
    which member a text stands.
(2) the page itself reports every value label that found no place (debug build): that list names the label and where
    it belonged, also in the deflection tab, and must be empty.
(3) a displacement number of a frame or a truss looks for a place that no deflected member and no load arrow runs
    through; the page reports every one that found none and stands on a line (debug build). That list must be empty too.
(4) the knob of every point load and the grip of every distributed load lie on the sheet, and no value of a load or of
    a support reaction stands on the arrow of a point load (the stretch from its point to its knob).
(5) the hint and the factor of the drawing stand at the foot of the sheet, on one line or on several, over the drawing.
    Nothing of the drawing lies under their words: no value, no dimension, no label (the boxes that the page keeps of
    all it has written and of the lines it keeps clear), and on a beam no part of the strip of a line. The words are
    taken where the browser has set them, line by line, with the words that a kept state of "Compare" puts before the
    factor: the longest that line gets. Up to version 14 the drawing left room for one line of hint,
    and at common widths the hint takes two or three: it lay on the dimension of a tall frame and on the lowest values
    of a beam.
(6) a text that is always written (the value of a load, a joint letter, a support reaction, the name of a profile, a
    dimension) looks for a free place among its own, then on a ring around its point, then for a place where it lies on
    no other text; only last it takes its first place. The page reports every such text that then lies on another text
    or on a dimension line (debug build). That list must be empty in every state and tab. Up to version 15 such a text
    took its first place at once, and the list was a report for the crowded load cases (1, 8 and 23 states and tabs at
    the three sizes).
usage: python3 values.py [width height]"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cases import VAR, section
w, h = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1500, 900)
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
HOOK = "(() => { const o = CanvasRenderingContext2D.prototype.fillText; window.__txt = new Set(); CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.add(String(t)); return o.call(this, t, ...a); }; })()"
WANT = """() => { const L = __lab, st = L.st, s = st.sol, q = st.focus, out = [], legit = [], F = L.FS.forcesAt, n1 = L.n1;
  if (!s.ok) return null;
  /* what must stand on the sheet is worked out here from the analysis. Nothing is taken from the drawing code, and what
     the page says about itself is not read either (its statement that a line is zero): for every member the values at
     the two ends of each piece between its point loads, and for the moment the stationary values inside a piece. A
     stationary value lies where the shear changes sign. The scan keeps the last place where the shear was not zero, so
     a scan place where the shear is exactly zero does not hide the change; the place is then found by halving.
     Every value that prints other than 0.0 is expected. */
  if (q !== 'D') { const all = s.mem.map(M => {
    const br = [0, ...M.ll.pts.map(p => p.a).filter(a => a > 1e-9 && a < M.L - 1e-9).sort((a, b) => a - b), M.L].filter((x, i, a) => !i || x - a[i - 1] > 1e-9), vs = [];
    for (let i = 0; i < br.length - 1; i++) {
      const a = br[i], b = br[i + 1];
      vs.push(F(M, a, 1)[q], F(M, b, -1)[q]);
      if (q === 'M') { const N = 400; let x0 = a, v0 = F(M, a, 1).V;
        for (let k = 1; k <= N; k++) { const x1 = a + (b - a) * k / N, v1 = F(M, x1, -1).V;
          if (v1 === 0) continue;
          if (v0 * v1 < 0) { let lo = x0, hi = x1, vl = v0; for (let it = 0; it < 60; it++) { const md = (lo + hi) / 2, vm = F(M, md, -1).V; if (vl * vm <= 0) hi = md; else { lo = md; vl = vm; } } vs.push(F(M, (lo + hi) / 2, -1).M); }
          x0 = x1; v0 = v1; } }
    }
    return vs; });
    const any = all.some(vs => vs.some(v => n1(v) !== '0.0'));
    for (const vs of all) {
      if (q === 'N' && st.model.truss && any && vs.every(v => n1(v) === '0.0')) { out.push('0'); continue; }   /* a zero bar carries its 0, as long as another bar carries a force */
      for (const v of vs) if (n1(v) !== '0.0') out.push(n1(v)); } }
  /* Deflection tab. The numbers are worked out here on a scan of their own, whatever the page says about a line
     without deflection: 3000 places per member through FS.interp (which integrates the line from the sample before a
     place), every top of the scan refined by halving its interval in three.
     Beam: the members are taken as one line from the left end to the right end, so that a largest or smallest value at
     a joint between two members counts too; every largest and smallest value of the deflection, every free end and
     every point load is expected where it prints other than 0.0.
     Frame and truss: a member that moves at least 16 % of the largest displacement carries the number of its point
     that moves most (every top of the scan is refined, not only the largest one: two tops can lie a rounding step
     apart); the page draws the line at 15 %, between 14 and 16 % the test asks for nothing. */
  if (q === 'D') {
    const I = L.FS.interp, NS = 3000, mm = v => n1(v * 1000), nd = st.model.nodes;
    const top = (g, a, b) => { for (let k = 0; k < 60; k++) { const u = a + (b - a) / 3, w = b - (b - a) / 3; if (g(u) < g(w)) a = u; else b = w; } return g((a + b) / 2); };
    if (L.VW.beam) {
      const seg = s.mem.map(M => { const xa = nd[M.n1].x, xb = nd[M.n2].x; return { M, xa, lo: Math.min(xa, xb), hi: Math.max(xa, xb) }; }).sort((a, b) => a.lo - b.lo);
      const w = X => { const g = seg.find(g => X <= g.hi) || seg[seg.length - 1]; return -I(g.M.smp, 'dY', Math.min(g.M.L, Math.max(0, Math.abs(X - g.xa))), -1); };
      const X = []; seg.forEach((g, gi) => { for (let k = gi ? 1 : 0; k <= NS; k++) X.push(g.lo + (g.hi - g.lo) * k / NS); });
      const Wv = X.map(w);
      for (let j = 1; j < X.length - 1; j++) { const p = Wv[j - 1], c = Wv[j], nx = Wv[j + 1];
        if ((c > p && c >= nx) || (c < p && c <= nx)) { const sg = c > p ? 1 : -1, t = sg * Math.max(sg * c, top(y => sg * w(y), X[j - 1], X[j + 1])); if (mm(t) !== '0.0') out.push(mm(t)); } }
      s.mem.forEach(M => { const wm = x => -I(M.smp, 'dY', x, -1);
        for (const [x, ni] of [[0, M.n1], [M.L, M.n2]]) if (nd[ni].sup === 'free' && mm(wm(x)) !== '0.0') out.push(mm(wm(x)));
        for (const pt of M.ll.pts) if (pt.a > 1e-9 && pt.a < M.L - 1e-9 && mm(wm(pt.a)) !== '0.0') out.push(mm(wm(pt.a))); });
      /* the rotation at every support and free end of the beam (not at a hinge, where the two sides turn apart), where it
         prints other than 0.0: on a sheet of 560 px or more. Worked out here from the slope the analysis keeps */
      if (document.querySelector('canvas').clientWidth >= 560) s.mem.forEach(M => { for (const [x, sd, ni] of [[0, 1, M.n1], [M.L, -1, M.n2]]) { const n = nd[ni], dg = st.model.members.filter(k => k.n1 === ni || k.n2 === ni).length;
        if (n.hinge || (n.sup === 'free' && dg !== 1)) continue; const th = n1(-I(M.smp, 'rot', x, sd) * 1000); if (th !== '0.0') out.push('\u03b8 = ' + th + ' mrad'); } }); }
    else { const d = (M, x) => Math.hypot(I(M.smp, 'dX', x, -1), I(M.smp, 'dY', x, -1));
      const tops = s.mem.map(M => { const h = M.L / NS, D = []; for (let k = 0; k <= NS; k++) D.push(d(M, h * k));
        let v = Math.max(D[0], D[NS]);
        for (let k = 0; k <= NS; k++) if ((k === 0 || D[k] > D[k - 1]) && (k === NS || D[k] >= D[k + 1])) v = Math.max(v, D[k], top(y => d(M, y), Math.max(0, h * (k - 1)), Math.min(M.L, h * (k + 1))));
        return { v, e: Math.max(D[0], D[NS]) }; });
      const big = Math.max(...tops.map(t => t.v));
      for (const t of tops) if (t.v >= 0.16 * big && mm(t.v) !== '0.0') out.push(mm(t.v) + ' mm');
      /* and the other way round: a number of millimetres on the sheet must be the displacement of a joint or the largest one of a member */
      for (const t of tops) legit.push(mm(t.v) + ' mm');
      s.mem.forEach(M => { legit.push(mm(d(M, 0)) + ' mm', mm(d(M, M.L)) + ' mm'); }); }
  }
  /* support reactions: every component that prints other than 0.0, without a cut-off of its own */
  const R = s.reactions;
  st.model.nodes.forEach((n, i) => { if (n.sup === 'free') return; const r = R[i];
    if (r.has[1] && n1(Math.abs(r.Ry)) !== '0.0') out.push(n1(Math.abs(r.Ry)) + ' kN'); if (r.has[0] && n1(Math.abs(r.Rx)) !== '0.0') out.push(n1(Math.abs(r.Rx)) + ' kN'); if (r.has[2] && n1(Math.abs(r.Mz)) !== '0.0') out.push(n1(Math.abs(r.Mz)) + ' kNm'); });
  return { want: [...new Set(out)], legit: q === 'D' && !L.VW.beam ? [...new Set(legit)] : null }; }"""
GEO = """() => { const L = __lab, H = L.HS, c = document.querySelector('canvas'), W = c.clientWidth, Hh = c.clientHeight, off = [], on = [];
  const cut = (x1, y1, x2, y2, b) => { let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 - b[0]], [dx, b[2] - x1], [-dy, y1 - b[1]], [dy, b[3] - y1]]) { if (p === 0) { if (q < 0) return false; continue; } const u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
    return true; };
  const loads = [...H.loads.entries()], shafts = loads.map(([id, g]) => [g.hx, g.hy, g.kx, g.ky]);
  for (const [id, g] of loads) if (g.kx < 7 || g.ky < 7 || g.kx > W - 7 || g.ky > Hh - 7) off.push('knob of ' + L.n1(L.st.model.loads.find(l => l.id === id).P) + ' kN at ' + Math.round(g.kx) + ', ' + Math.round(g.ky));
  for (const [mi, g] of H.udl.entries()) if (g.kx < 7 || g.ky < 7 || g.kx > W - 7 || g.ky > Hh - 7) off.push('grip on member ' + (mi + 1) + ' at ' + Math.round(g.kx) + ', ' + Math.round(g.ky));
  const lab = loads.map(([id, g]) => [L.n1(L.st.model.loads.find(l => l.id === id).P) + ' kN', g.lb]).concat(H.rlab);
  for (const [t, b] of lab) if (b && shafts.some(q => cut(q[0], q[1], q[2], q[3], b))) on.push(t);
  /* the words at the foot of the sheet, line by line as the browser has set them, against all that the drawing holds */
  const cr = c.getBoundingClientRect(), words = [], foot = [];
  /* the factor of the drawing with the words that a kept state of "Compare" puts before it: the longest that line gets */
  const mg = document.querySelector('#mag'), m0 = mg.textContent;
  if (!m0.startsWith('Dashed') && !m0.startsWith('In brackets')) mg.textContent = 'Dashed outline: the kept state. ' + m0;
  for (const id of ['#hint', '#mag']) { const r = document.createRange(); r.selectNodeContents(document.querySelector(id)); for (const q of r.getClientRects()) words.push([q.left - cr.left, q.top - cr.top, q.right - cr.left, q.bottom - cr.top]); }
  mg.textContent = m0;
  const hit = b => words.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
  let nb = 0;
  for (const b of L.boxes) if (hit(b)) nb++;
  if (nb) foot.push(nb + ' of the boxes of values, labels and dimensions');
  if (L.VW.beam) for (const p of L.VW.plots) if (hit([L.VW.gl, p.y, W - L.VW.gr, p.y + p.h])) foot.push('the strip of ' + p.k);
  return { off, on, foot, lines: new Set(words.map(q => Math.round(q[1]))).size, hint: document.querySelector('#hint').textContent.length }; }"""
miss, refused, online, alien, states, vals, errs, nref = [], [], [], [], 0, 0, [], 0
offs, onarrow, under, lines_ = [], [], [], set()
onstart, oncase = {}, {}     # state -> { texts: tabs }
reports = True               # whether this build reports a text set on another text (builds up to version 14 do not)
import re
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(HOOK); pg.goto(url); pg.wait_for_timeout(600)
    ids = pg.eval_on_selector_all('.pre', 'els => els.map(e => e.dataset.id)')
    for pid, name, js, imi in [(i, 'as it starts', '', -1) for i in ids] + VAR:
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(150); section(pg, name)
        if js: pg.evaluate("() => { const L = __lab, m = L.st.model; " + js + "; L.resolve('instant'); }")
        for q in 'MVND':
            pg.click(f'#tab-{q}'); pg.wait_for_timeout(420)
            pg.evaluate('() => { window.__txt.clear(); window.__drop = []; window.__online = []; window.__over = []; __lab.st.dirty = true; }'); pg.wait_for_timeout(260)
            ov = ', '.join(sorted({d['t'] + ' on ' + ' + '.join(d['on']) for d in pg.evaluate('() => window.__over')}))
            reports = reports and pg.evaluate('() => __lab.boxes.some(q => !!q.t)')
            if ov: (onstart if name == 'as it starts' else oncase).setdefault(f'{pid} / {name}', {}).setdefault(ov, []).append(q)
            want = pg.evaluate(WANT); drawn = set(pg.evaluate('() => [...window.__txt]')); drop = pg.evaluate('() => window.__drop'); onl = sorted({(d['t'], round(d['x'] / 6), round(d['y'] / 6)) for d in pg.evaluate('() => window.__online')})
            if onl: online.append(f'{pid} / {name} / tab {q}: on a line: ' + ', '.join(d[0] for d in onl))
            geo = pg.evaluate(GEO)
            if geo['off']: offs.append(f'{pid} / {name} / tab {q}: ' + ', '.join(geo['off']))
            if geo['on']: onarrow.append(f'{pid} / {name} / tab {q}: ' + ', '.join(geo['on']))
            if geo['foot']: under.append(f'{pid} / {name} / tab {q}: ' + ', '.join(geo['foot']))
            lines_.add(geo['lines'])
            if want is None: continue
            legit = want['legit']; want = want['want']
            if legit is not None:
                odd = sorted(t for t in drawn if re.fullmatch(r'[\u2212-]?\d+\.\d mm', t) and t not in legit)
                if odd: alien.append(f'{pid} / {name} / tab {q}: on the sheet without a joint or member that moves so far: ' + ', '.join(odd))
            states += 1; vals += len(want)
            gone = [v for v in want if v not in drawn]
            if gone: miss.append(f'{pid} / {name} / tab {q}: not on the sheet: ' + ', '.join(gone))
            drop = sorted({(d['t'], round(d['x'] / 6), round(d['y'] / 6)) for d in drop})   # several frames are drawn while the test waits: one entry per label
            nref += len(drop)
            if drop: refused.append(f'{pid} / {name} / tab {q}: no place for: ' + ', '.join(d[0] for d in drop))
    b.close()
print(f'{states} states, {vals} values looked up at {w} x {h}:', 'all on the sheet' if not miss else f'{len(miss)} states with a missing value')
for m in miss: print('  ' + m)
print('value labels that found no place:', 'none' if not refused else f'{nref} labels in {len(refused)} states')
for m in refused: print('  ' + m)
print('displacement numbers of a frame or a truss that stand on a line:', 'none' if not online else f'in {len(online)} states')
for m in online: print('  ' + m)
print('displacement numbers that belong to no joint and no member:', 'none' if not alien else f'in {len(alien)} states')
for m in alien: print('  ' + m)
print('knobs of loads and grips of distributed loads off the sheet:', 'none' if not offs else f'in {len(offs)} states')
for m in offs: print('  ' + m)
print('values of loads and reactions that stand on the arrow of a load:', 'none' if not onarrow else f'in {len(onarrow)} states')
for m in onarrow: print('  ' + m)
print(f'values, labels, dimensions and strips of lines under the words at the foot of the sheet (the hint and the factor of the drawing, on {" or ".join(str(n) for n in sorted(lines_))} lines at this width):', 'none' if not under else f'in {len(under)} states and tabs')
for m in under[:12]: print('  ' + m)
tabs_ = lambda d: sum(len(t) for v in d.values() for t in v.values())
if not reports: print('texts set on another text or on a dimension line: this build does not report them; the line below says nothing')
onany = {**onstart, **oncase}
print(f'texts set on another text or on a dimension line, in {4 * (len(ids) + len(VAR))} states and tabs (the examples as they start and the other load cases):', 'none' if not onany else f'in {tabs_(onany)} states and tabs')
for k, v in onany.items():
    for t, qs in v.items(): print(f'  {k} / tab {" ".join(qs)}: {t}')
if errs: print('script errors: ' + '; '.join(errs[:5]))
sys.exit(1 if miss or refused or online or alien or offs or onarrow or under or onstart or oncase or not reports or errs else 0)
