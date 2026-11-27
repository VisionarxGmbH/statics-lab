"""What a new version shows where the version before showed something else: the probe and "Compare".
A correction of one control can change what the page shows elsewhere (version 14 corrected the probe at a peak and
lost one side of a joint with a load on it; review 10 found it). This program reads, in the same states and with the
mouse at the same places, what a build writes on the sheet, and sets it against the record of the version before:
- the probe of 16 beam states, in the moment tab and in the deflection tab, every 9 pixels along the beam;
- the sheet of 18 states with "Compare" on after a change of the state, in all four tabs.

What is kept of a place of the probe (review 11, C129: the record of version 15 kept the texts of the sheet as a set, so
that two values that changed sides gave the same record):
- the member and the station the probe stands on, and what it stands on (a load, a joint, a peak, a place);
- every reading as one record: quantity, side (left, right, or one where the line has one value), value and unit. A
  reading is taken as the page pairs it: the label of a line of a box with the value written on that line, and the
  relation of a row under a line with the number written behind it.
The quantities are named alike for every version, so that a reading that moved from the box into a row (version 17)
is still the same reading: V, M, w, N; V′ (the load, with its sign), M′ (the shear), w′ (the rotation).
What only the later version reads (N′, −M of the curvature, the step of a line) is counted apart.

What is kept of a sheet with "Compare" on: every text with the place it is written at, but for the relations of the
lines (V′ = −q and the others: in the corner of a strip up to version 16, in a row under it from version 17). The texts
are compared as they are counted; the places are compared apart, and only then is it said whether two drawings agree. A
version that moves the lines on the sheet differs in the places of every sheet and can still agree in every text.

Every difference is listed with what only the earlier version read and what only this one reads. It is a report to be
read, not a pass or fail: a correction shows up here as a difference, and so does a fault.

usage: python3 versions.py <record of the earlier version .json>            compare the present build with the record
       python3 versions.py --record <out.json> [debug.html]                 write the record of a build
       python3 versions.py --control                                        the control: the two sides of the shear exchanged"""
import pathlib, sys, json, re
from collections import Counter
from playwright.sync_api import sync_playwright
# every text the sheet writes, with its place, its alignment and the number of the drawing it belongs to
HOOK = """() => { if (!window.__d) { const o = CanvasRenderingContext2D.prototype.fillText; window.__d = [];
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...a) {
    let s = String(t); if (window.__swap) s = s === 'V left' ? 'V right' : s === 'V right' ? 'V left' : s;
    window.__d.push([s, Math.round(x), Math.round(y), this.textAlign, __lab.st.fid, window.__row ? 1 : 0]); return o.call(this, t, x, y, ...a); }; }
  window.__d.length = 0; }"""
LAST = "() => { const d = window.__d, f = Math.max(...d.map(q => q[4])); return d.filter(q => q[4] === f).map(q => [q[0], q[1], q[2], q[3], q[5]]); }"
# the relation of a line as the versions up to 16 wrote it into the corner of its strip; from version 17 it stands in a row
OLDREL = ('V′ = −q', 'V′ = +q', 'V′ = ∓q', 'M′ = V', 'EI·w″ = −M', '+ tension, − compression')
PROBE = [(pid, '') for pid in ('simple-p', 'simple-w', 'simple-2p', 'simple-t', 'cantilever', 'propped', 'fixed', 'overhang', 'two-span', 'gerber')] + [
    ('two-span', "m.loads = [{ id: 1, m: 1, a: 0, P: 30, ang: -90 }]"), ('two-span', "m.loads = [{ id: 1, m: 0, a: 5, P: 30, ang: -90 }, { id: 2, m: 1, a: 2.5, P: 20, ang: -90 }]"),
    ('gerber', "m.loads = [{ id: 1, m: 1, a: 1.5, P: 30, ang: -90 }]"), ('overhang', "m.loads = [{ id: 1, m: 1, a: 0, P: 15, ang: -90 }, { id: 2, m: 1, a: 2, P: 15, ang: -90 }]"),
    ('simple-p', "m.loads = [{ id: 1, m: 0, a: 0, P: 20, ang: -90 }, { id: 2, m: 0, a: 6, P: 20, ang: -90 }, { id: 3, m: 0, a: 3, P: 20, ang: 0 }]"),
    ('cantilever', "m.loads = [{ id: 1, m: 0, a: 1, P: 10, ang: 90 }, { id: 2, m: 0, a: 2, P: 10, ang: -90 }]")]
HC = "m.nodes[1].hinge = m.nodes[2].hinge = true; m.members.forEach(k => k.udl.on = false); "
KEPT = [('truss', '', "m.loads[1].P = 40"), ('truss', "Object.assign(m.members[0].udl, {on: true, w1: 20, w2: 20, ang: 180})", "m.members[0].udl.on = false"),
        ('truss', "m.loads = [[0.75, 500, 0], [1.5, 1000, 180], [2.25, 500, 0]].map((l, i) => ({id: 50 + i, m: 1, a: l[0], P: l[1], ang: l[2]}))", "m.loads = []"),
        ('truss', "Object.assign(m.members[9].udl, {on: true, w1: 0, w2: 6, ang: -90})", "m.members[9].udl.on = false"),
        ('truss', '', "Object.assign(m.members[9].udl, {on: true, w1: 0, w2: 6, ang: -90})"),
        ('truss', "Object.assign(m.members[0].udl, {on: true, w1: 20, w2: 20, ang: 180})", "Object.assign(m.members[0].udl, {on: true, w1: 5, w2: 5, ang: -90})"),
        ('portal-g', HC + "m.loads = [{id: 1, m: 0, a: 4, P: 100, ang: 180}, {id: 2, m: 2, a: 0, P: 100, ang: 0}]", "m.loads = []"),
        ('portal-g', HC + "Object.assign(m.members[1].udl, {on: true, w1: 10, w2: 10, ang: 0})", "Object.assign(m.members[1].udl, {on: true, w1: 5, w2: 5, ang: -90})"),
        ('portal-g', HC + "Object.assign(m.members[1].udl, {on: true, w1: 5, w2: 5, ang: -90})", "Object.assign(m.members[1].udl, {on: true, w1: 10, w2: 10, ang: 0})"),
        ('portal-g', '', "m.members[1].udl.w1 = m.members[1].udl.w2 = 30"), ('portal-s', '', "m.loads = []"), ('portal-s', '', "m.loads[0].P = 60"),
        ('three-hinge', '', "Object.assign(m.members[0].udl, {on: true, w1: 6, w2: 0, ang: 0})"), ('two-bay', '', "m.loads = []"), ('bent', '', "m.loads.forEach(l => { l.P *= 2; })"),
        ('simple-p', "m.loads = [{id: 1, m: 0, a: 6, P: 20, ang: 0}]", "m.loads = []"), ('two-span', '', "m.members[1].udl.ang = 90"), ('gerber', '', "m.members[2].udl.w1 = 0")]

# the quantities every version names: [label of a line of a box] -> quantity, and the relation of a row -> quantity
LABEL = {'slope = V': 'M′', 'M′ = V': 'M′', 'slope = +q': 'V′', 'slope = −q': 'V′', 'V′ = +q': 'V′', 'V′ = −q': 'V′', 'θ = w′': 'w′', 'w′ = θ': 'w′', 'V': 'V', 'M': 'M', 'w': 'w', 'N': 'N'}
ROW = re.compile(r'^(V′|M′|w′|N′|EI·w″) = (\S+) = (−?[\d.]+)(?: \| (−?[\d.]+))? (kN/m|kNm|kN|mrad)$')
STEP = re.compile(r'^here (\S+) steps by ([+−]?[\d.]+) kN')
COMMON = ('V', 'M', 'w', 'N', 'V′', 'M′', 'w′')
def unit(v):
    a, _, u = v.rpartition(' ')
    return [a, u]
def sign(q, sym, val):
    """the load is written −q or +q with its direction: kept with a reading of V′ that is not zero"""
    return [sym] if q == 'V′' and val != '0.0' else []
def readings(d, rows):
    """the readings of one place: [quantity, side, value, unit]; and the texts of boxes and rows that are no reading"""
    out, odd = [], []
    for i in range(1, len(d)):
        if d[i][3] == 'right' and d[i - 1][3] == 'left' and d[i][2] == d[i - 1][2]:   # a line of a box: its label and its value
            lab, val = d[i - 1][0], d[i][0]
            base, _, side = lab.partition(', ') if ', ' in lab else lab.partition(' ') if lab.split(' ')[-1] in ('left', 'right') else (lab, '', '')
            if base in LABEL and side in ('', 'left', 'right'):
                out.append([LABEL[base], side or 'one'] + unit(val) + sign(LABEL[base], base.split(' = ')[-1], unit(val)[0]))
            else: odd.append(f'{lab}: {val}')
    for k, said in (rows or {}).items():
        for g in said or []:
            m, s = ROW.match(g), STEP.match(g)
            if m:
                q = '−M of the curvature' if m.group(1) == 'EI·w″' else m.group(1)
                if m.group(4) is None: out.append([q, 'one', m.group(3), m.group(5)] + sign(q, m.group(2), m.group(3)))
                else: out += [[q, 'left', m.group(3), m.group(5)] + sign(q, m.group(2), m.group(3)), [q, 'right', m.group(4), m.group(5)] + sign(q, m.group(2), m.group(4))]
            elif s: out.append([f'step of {s.group(1)}', 'one', s.group(2), 'kN'])
            elif not g.startswith(('here ', 'per metre ', '+ tension')): odd.append(f'row of {k}: {g}')
    return sorted(out), odd

def read(url, swap=False, states=None):
    """what a build writes: {'probe': {state tab place: {at, x, read, odd}}, 'kept': {state tab: [[text, x, y] ...]}}"""
    probe, kept, errs = {}, {}, []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1500, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(500)
        if swap: pg.evaluate("() => { window.__swap = true; }")
        for si, (pid, js) in enumerate(PROBE):
            if states is not None and si not in states: continue
            pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(250)
            if js: pg.evaluate("() => { const L = __lab, m = L.st.model; " + js + "; L.resolve('grow'); }")
            for tab in 'MD':
                pg.click(f'#tab-{tab}'); pg.wait_for_timeout(900)
                # the places go by the length along the beam, so that a change of the scale of the drawing does not move them
                g = pg.evaluate("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + V.x0 * V.s, (V.x1 - V.x0) * V.s, c.y + V.yB + 140]; }")
                for k in range(-1, 101):
                    pg.evaluate(HOOK); pg.mouse.move(g[0] + g[1] * k / 99, g[2])
                    try: pg.wait_for_function("() => window.__d.length > 0", timeout=1500)   # the sheet has been drawn again
                    except Exception: pass
                    d = pg.evaluate("() => window.__d.length ? (" + LAST + ")() : []")
                    on = [q[0] for q in d if q[0].startswith('x = ')]
                    at = pg.evaluate("() => { const a = __lab.st.probeAt; return a ? [a.mi, Math.round(a.a * 1e6) / 1e6, a.kind] : null; }") if on else None
                    rows = pg.evaluate("() => { const r = __lab.VW.rel; if (!r || r.key) return null; const o = {}; for (const k in r) o[k] = r[k].said || null; return o; }") if on else None
                    rd, odd = readings(d, rows) if on else ([], [])
                    probe[f'{si} {pid}{" changed" if js else ""}, tab {tab}, place {k} of 99'] = {'at': at, 'x': on[0] if on else None, 'read': rd, 'odd': odd}
                pg.mouse.move(5, 5)
        pg.close()
        for si, (pid, js, then) in enumerate(KEPT):
            if states is not None: break
            pg = b.new_page(viewport={'width': 1500, 'height': 900}); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(url); pg.wait_for_timeout(400)
            pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(250)
            if js: pg.evaluate("() => { const L = __lab, m = L.st.model; " + js + "; L.resolve('grow'); }"); pg.wait_for_timeout(900)
            pg.click('#cmp'); pg.wait_for_timeout(200)
            pg.evaluate("() => { const L = __lab, m = L.st.model; " + then + "; L.resolve('tween'); }"); pg.wait_for_timeout(1300)
            for tab in 'MVND':
                pg.click(f'#tab-{tab}'); pg.wait_for_timeout(700); pg.evaluate(HOOK); pg.evaluate("() => __lab.resolve('none')"); pg.wait_for_timeout(350)
                # the relations of the lines are left out here, in the corner of a strip (up to version 16) and in a row (from
                # version 17): they are no values of a state, and the menu test reads the rows
                kept[f'{si} {pid}, tab {tab}'] = sorted(q[:3] for q in pg.evaluate(LAST) if not q[4] and q[0] not in OLDREL)
            pg.close()
        b.close()
    return {'format': 2, 'probe': probe, 'kept': kept, 'errors': errs}

def show(r): return f'{r[0]} {r[1]}: {r[2]} {r[3]}' + (f' (as {r[4]})' if len(r) > 4 else '')
def compare(A, B, names=('the earlier version', 'this one')):
    """the places of the probe whose common readings differ, with what each side alone reads; what only B reads; the sheets"""
    dp, new, moved = [], Counter(), 0
    for k, a in A['probe'].items():
        b = B['probe'].get(k, {'at': None, 'x': None, 'read': [], 'odd': []})
        ra, rb = [tuple(r) for r in a['read'] if r[0] in COMMON], [tuple(r) for r in b['read'] if r[0] in COMMON]
        for r in b['read']:
            if r[0] not in COMMON: new[r[0]] += 1
        la, lb = Counter(ra), Counter(rb)
        if la != lb or a['at'] != b['at'] or a['x'] != b['x'] or a['odd'] != b['odd']:
            dp.append((k, [show(r) for r in sorted((la - lb).elements())] + ([f'stands on {a["at"]}, {a["x"]}'] if (a['at'], a['x']) != (b['at'], b['x']) else []) + [o for o in a['odd'] if o not in b['odd']],
                       [show(r) for r in sorted((lb - la).elements())] + ([f'stands on {b["at"]}, {b["x"]}'] if (a['at'], a['x']) != (b['at'], b['x']) else []) + [o for o in b['odd'] if o not in a['odd']]))
    dk, dpos = [], 0
    for k, a in A['kept'].items():
        b = B['kept'].get(k, [])
        ca, cb = Counter(q[0] for q in a), Counter(q[0] for q in b)
        if ca != cb: dk.append((k, sorted((ca - cb).elements()), sorted((cb - ca).elements())))
        elif Counter(tuple(q) for q in a) != Counter(tuple(q) for q in b): dpos += 1
    return dp, new, dk, dpos

here = pathlib.Path(__file__).resolve().parent
build = here.parent.joinpath('dist/debug.html').as_uri()
if sys.argv[1] == '--record':
    url = pathlib.Path(sys.argv[3]).resolve().as_uri() if len(sys.argv) > 3 else build
    r = read(url); pathlib.Path(sys.argv[2]).write_text(json.dumps(r, ensure_ascii=False, sort_keys=True))
    n = sum(len(q['read']) for q in r['probe'].values())
    print('record written:', len(r['probe']), 'places of the probe with', n, 'readings,', len(r['kept']), 'sheets with Compare on;', 'script errors: ' + '; '.join(r['errors'][:3]) if r['errors'] else 'no script errors')
    sys.exit(1 if r['errors'] else 0)
if sys.argv[1] == '--control':
    # The control of the comparison itself: the same build read twice, the second time with the labels of the two sides of
    # the shear exchanged on the sheet ("V left" written where the page writes "V right", and the other way round). The
    # comparison must name every place where the shear has two values, and no other place. States 0 and 8: the simple
    # beam with a point load and the two-span beam.
    A = read(build, states=(0, 8)); B = read(build, swap=True, states=(0, 8))
    two = [k for k, a in A['probe'].items() if any(r[0] == 'V' and r[1] == 'left' for r in a['read'])]
    dp, new, dk, dpos = compare(A, B)
    found = [k for k, a, c in dp]
    ok = sorted(found) == sorted(two) and len(two) > 0 and all(any(x.startswith('V left') for x in a) and any(x.startswith('V right') for x in a) for k, a, c in dp)
    print(f'control, the two sides of the shear exchanged on the sheet: the shear has two values at {len(two)} of {len(A["probe"])} places of the two states; the comparison names {len(found)} places, {"the same ones" if sorted(found) == sorted(two) else "NOT the same ones"}')
    if dp: print(f'  for one: {dp[0][0]}: only the build as it is: {dp[0][1]}; only the exchanged one: {dp[0][2]}')
    errs = A['errors'] + B['errors']
    print('script errors: ' + '; '.join(errs[:3]) if errs else 'no script errors')
    sys.exit(0 if ok and not errs else 1)
A = json.loads(pathlib.Path(sys.argv[1]).read_text())
if A.get('format') != 2: sys.exit('this record was written before the readings were kept one by one (format 2): write it anew with --record from the build of that version')
B = read(build)
dp, new, dk, dpos = compare(A, B)
nA, nB = sum(len([r for r in q['read'] if r[0] in COMMON]) for q in A['probe'].values()), sum(len([r for r in q['read'] if r[0] in COMMON]) for q in B['probe'].values())
print(f'the probe at {len(A["probe"])} places of {len(PROBE)} beam states, this build against the record of the earlier version: {nA} readings there and {nB} here (member, station, quantity, side, value, unit); {len(dp)} places differ')
for k, a, c in dp: print(f'  {k}: only the earlier version: {a[:8]}; only this one: {c[:8]}')
print('readings that only this build has: ' + ('; '.join(f'{k}: {v}' for k, v in sorted(new.items())) if new else 'none'))
print(f'the sheet of {len(KEPT)} states with Compare on, in four tabs, {len(A["kept"])} sheets: the texts of {len(dk)} differ; of the {len(A["kept"]) - len(dk)} others, {dpos} have a text at another place')
for k, a, c in dk: print(f'  {k}: only the earlier version: {a[:10]}; only this one: {c[:10]}')
print('script errors: ' + '; '.join(B['errors'][:3]) if B['errors'] else 'no script errors')
sys.exit(1 if B['errors'] else 0)
