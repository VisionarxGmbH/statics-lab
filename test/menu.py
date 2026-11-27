"""The menus and the states of the page that the checks of numbers do not reach: a field shows what the page took,
a load that is switched off stays off, one step back per field or button, an unstable structure says why, a load
along the beam leaves the deflection at zero.  usage: python3 menu.py"""
import pathlib, json, sys
from playwright.sync_api import sync_playwright
from cases import VAR
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
bad, done, errs = [], 0, []
TAG = ''          # set for the checks that came with the latest version: the count of them and of their failures is printed at the end
tagged = {}       # tag -> [checks, of them failed]
def ok(cond, what):
    global done
    done += 1
    if TAG: tagged.setdefault(TAG, [0, 0])[0] += 1
    if not cond:
        bad.append(what); print('FAIL', TAG + what)
        if TAG: tagged[TAG][1] += 1
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1500, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(700)
    J = pg.evaluate
    udl = lambda: J("() => __lab.st.model.members[0].udl")
    reac = lambda: J("() => __lab.st.sol.reactions.map(r => [r.Rx, r.Ry, r.Mz].map(v => Math.round(v * 1e6) / 1e6))")
    fields = lambda: J("() => [document.querySelector('#pp-w1').value, document.querySelector('#pp-w2').value]")
    def typ(sel, v): pg.fill(sel, v); pg.wait_for_timeout(120)
    def leave(sel): pg.dispatch_event(sel, 'change'); pg.wait_for_timeout(420)   # the note of a field goes 0.3 s after the field is left

    # --- a distributed load that is typed down to zero is off, and a direction does not bring it back
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(400)
    r0 = reac()
    pg.click('#loads'); pg.wait_for_timeout(200)
    pg.click('#pop button[data-shape="uni"]'); pg.wait_for_timeout(200)
    typ('#pp-w1', '8'); typ('#pp-w2', '0'); u = udl(); ok(u['on'] and u['w1'] == 8 and u['w2'] == 0, f'triangle 8 to 0: {u}')
    typ('#pp-w1', '0'); u = udl(); ok(not u['on'] and u['w1'] == 0 and u['w2'] == 0, f'both ends zero: the load is off and holds zeros: {u}')
    ok(fields() == ['0', '0'], f'fields show 0 and 0: {fields()}')
    pg.click('#pop button[data-uang="90"]'); pg.wait_for_timeout(300); u = udl()
    ok(not u['on'] and u['ang'] == 90, f'a direction alone switches no load on: {u}'); ok(reac() == r0, 'reactions as with the point load alone')
    ok('noq' in J("() => document.querySelector('#pop').className"), 'menu shows the load as off')
    typ('#pp-w2', '5'); u = udl(); ok(u['on'] and u['w1'] == 0 and u['w2'] == 5 and u['ang'] == 90, f'a typed value switches it on, upward as chosen: {u}')
    pg.click('#pop button[data-shape="none"]'); pg.wait_for_timeout(150); u = udl(); ok(not u['on'] and fields() == ['0', '5'], f'None keeps the values in the fields: {u} {fields()}')
    pg.click('#pop button[data-uang="-90"]'); pg.wait_for_timeout(150); ok(not udl()['on'], 'direction after None: still off')
    pg.click('#pop button[data-shape="down"]'); pg.wait_for_timeout(150); u = udl(); ok(u['on'] and u['w1'] == 5 and u['w2'] == 0 and fields() == ['5', '0'], f'shape brings the last size back: {u} {fields()}')

    # --- a field that is left shows the value the page took
    for v, want in [('600', 500), ('3.14159', 3.1), ('-2', 0)]:
        typ('#pp-w1', v); leave('#pp-w1'); f = fields()[0]; m = udl()['w1']
        ok(m == want and float(f) == want, f'load typed {v}: page took {m}, field shows {f}')
    typ('#pp-w1', '8'); leave('#pp-w1')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # open the menu of the point load through the page's own picker
    box = pg.query_selector('#cv').bounding_box()
    hit = J("""() => { const L = __lab; for (let y = 60; y < 260; y += 3) for (let x = 250; x < 1150; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') return [x, y]; } return null; }""")
    ok(hit is not None, 'the point load is found on the sheet')
    pg.mouse.click(box['x'] + hit[0], box['y'] + hit[1]); pg.wait_for_timeout(300)
    # a size below the smallest load is not taken: the load keeps the value it had when the edit of the field began, and the menu says so
    typ('#pp-P', '50'); leave('#pp-P'); r50 = reac(); typ('#pp-P', '0'); P = J("() => __lab.st.model.loads[0].P"); note = J("() => { const w = document.querySelector('#pop small.lim'); return w ? w.textContent : ''; }")
    ok(P == 50 and 'From 0.1 to 1000 kN' in note and 'keeps 50.0 kN' in note and J("() => document.querySelector('#pp-P').classList.contains('bad')"), f'size 50 typed and the field confirmed, then 0 typed: the load keeps 50 kN and the menu says why: {P} {note!r}')
    ok(reac() == r50, 'the reactions are still those of 50 kN')
    leave('#pp-P'); ok(J("() => document.querySelector('#pp-P').value") == '50' and J("() => !document.querySelector('#pop small.lim')"), 'the field that is left shows 50 again, the note is gone')
    typ('#pp-P', '0.04'); ok(J("() => __lab.st.model.loads[0].P") == 50, 'size 0.04 typed: not taken'); typ('#pp-P', '0.1'); ok(J("() => __lab.st.model.loads[0].P") == 0.1 and J("() => !document.querySelector('#pop small.lim')"), 'size 0.1 typed: taken')
    # a typed value with more decimals than the page keeps: the menu says which value it takes
    lim = lambda: J("() => { const w = document.querySelector('#pop small.lim'); return w ? [w.textContent, w.className] : null; }")
    typ('#pp-P', '12.34'); n_ = lim(); ok(n_ is not None and n_[0] == 'Taken as 12.3 kN.' and 'soft' in n_[1] and J("() => __lab.st.model.loads[0].P") == 12.3 and not J("() => document.querySelector('#pp-P').classList.contains('bad')"), f'12.34 typed: taken as 12.3 kN and the menu says so: {n_}')
    typ('#pp-P', '12.3'); ok(lim() is None, '12.3 typed: no note')
    typ('#pp-a', '2.345'); n_ = lim(); ok(n_ is not None and n_[0] == 'Taken as 2.35 m.', f'place 2.345 typed: {n_}'); leave('#pp-a'); ok(lim() is None, 'the note is gone when the field is left')
    # the arrow keys step the size by whole kN
    typ('#pp-P', '20'); pg.focus('#pp-P'); pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(120); a1 = J("() => [document.querySelector('#pp-P').value, __lab.st.model.loads[0].P]")
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(120); a2 = J("() => [document.querySelector('#pp-P').value, __lab.st.model.loads[0].P]")
    ok(a1 == ['21', 21] and a2 == ['19', 19], f'arrow keys in the size field: 20 to 21, then to 19: {a1} {a2}')
    for sel, v, want, key in [('#pp-P', '2000', 1000, 'P'), ('#pp-P', '12.34', 12.3, 'P'), ('#pp-a', '5.999', 6, 'a'), ('#pp-a', '2.345', 2.35, 'a'), ('#pp-a', '99', 6, 'a')]:
        typ(sel, v); leave(sel); f = J(f"() => document.querySelector('{sel}').value"); m = J(f"() => __lab.st.model.loads[0].{key}")
        ok(abs(m - want) < 1e-9 and abs(float(f) - want) < 1e-9, f'{key} typed {v}: page took {m}, field shows {f}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # --- one step back per field or button
    pg.click('#reset'); pg.wait_for_timeout(400)
    ok(J("() => document.querySelector('#undo').disabled"), 'after Reset nothing to undo')
    pg.click('#loads'); pg.wait_for_timeout(200)
    steps = 0
    pg.click('#pop button[data-shape="uni"]'); steps += 1; pg.wait_for_timeout(120)
    typ('#pp-w1', '7'); typ('#pp-w1', '7.5'); steps += 1          # two keystrokes in one field: one step
    typ('#pp-w2', '3'); steps += 1
    pg.click('#pop button[data-uang="90"]'); steps += 1; pg.wait_for_timeout(120)
    pg.click('#pop button[data-uang="-90"]'); steps += 1; pg.wait_for_timeout(120)
    typ('#pp-w1', '9'); steps += 1                                   # the same field again after a button: a new step
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    n = 0
    while not J("() => document.querySelector('#undo').disabled") and n < 40: pg.click('#undo'); pg.wait_for_timeout(120); n += 1
    ok(n == steps, f'{steps} changes in the menu are {n} steps back')
    ok(not udl()['on'], 'after all steps back the example is as it started')

    # --- an unstable structure says what is missing and what can move
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(300)
    J("() => { __lab.st.model.nodes[0].sup = 'roller'; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn .badge')
    ok('Unstable' in t and '= −1' in t and 'sideways' in t and 'One restraint is missing' in t, f'two rollers: {t!r}')
    J("() => { __lab.st.model.nodes[0].sup = 'pin'; __lab.st.model.nodes[1].sup = 'free'; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn .badge'); ok('B can move up and down' in t and '= −1' in t, f'pin and free end: {t!r}')
    J("() => { __lab.st.model.nodes[0].sup = 'free'; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn .badge'); ok('3 restraints are missing' in t and '3 movements are free' in t and 'One change makes it stable: A fixed, or B fixed.' in t, f'no support: {t!r}')
    pg.click('.pre[data-id="portal-s"]'); pg.wait_for_timeout(300)
    J("() => { const m = __lab.st.model; for (const n of m.nodes) if (n.sup === 'free') n.hinge = true; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn .badge'); ok('Unstable' in t and 'can move sideways' in t, f'portal with pinned bases and two hinged corners: {t!r}')
    pg.click('.pre[data-id="gerber"]'); pg.wait_for_timeout(300)
    J("() => { const m = __lab.st.model; m.nodes.find(n => n.lbl === 'C').sup = 'free'; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn .badge'); ok('Unstable' in t and 'can move up and down' in t, f'Gerber beam without its end support: {t!r}')

    # --- a load along the beam: no deflection, no magnification
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(300)
    J("() => { __lab.st.model.loads[0].ang = 0; __lab.resolve('tween'); }"); pg.click('#tab-D'); pg.wait_for_timeout(1500)
    z = J("() => __lab.st.zero"); mag = pg.inner_text('#mag')
    ok(z['D'] and z['W'] and not z['N'] and mag.strip() == '', f'load along the beam: zero {z}, footer {mag!r}')
    J("() => { __lab.st.model.loads.push({ id: 99, m: 0, a: 3, P: 0.1, ang: -90 }); __lab.resolve('tween'); }"); pg.wait_for_timeout(1500)
    z = J("() => __lab.st.zero"); mag = pg.inner_text('#mag'); ok(not z['D'] and 'Deflected beam drawn' in mag, f'with a small load across: deflection is drawn: {z} {mag!r}')
    pg.click('.pre[data-id="truss"]'); pg.wait_for_timeout(600); pg.click('#tab-D'); pg.wait_for_timeout(600)
    t = pg.inner_text('#learn'); ok('δ ∝ 1/EA' in t and 'EI·w″' not in t and '1/EI' not in t, 'truss: the rules of the displacement speak of EA'); ok(pg.inner_text('#ei').startswith('EA = '), 'truss: header shows EA')
    pg.click('.pre[data-id="portal-g"]'); pg.wait_for_timeout(600); ok(pg.inner_text('#ei').startswith('EI = '), 'frame: header shows EI')

    # --- the points of review 02
    HOOK = "() => { if (!window.__t) { const o = CanvasRenderingContext2D.prototype.fillText; window.__t = new Set(); CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__t.add(String(t)); return o.call(this, t, ...a); }; } window.__t.clear(); __lab.st.dirty = true; }"
    def sheet(): J(HOOK); pg.wait_for_timeout(350); return set(J("() => [...window.__t]"))
    # a mechanism is a mechanism with every section (three-hinged frame, bases fixed, corners hinged)
    pg.click('.pre[data-id="three-hinge"]'); pg.wait_for_timeout(300)
    for i in range(7):
        pg.select_option('#sec', str(i)); pg.wait_for_timeout(120)
        J("() => { const m = __lab.st.model; for (const n of m.nodes) { if (n.sup === 'pin') n.sup = 'fixed'; if (n.sup === 'free') n.hinge = true; } __lab.resolve('tween'); }"); pg.wait_for_timeout(250)
        t = pg.inner_text('#learn .badge'); ok('Unstable' in t and 'G can move up and down' in t and 'The count is enough' in t, f'section {i}: fixed bases, three hinges in a line: {t[:90]!r}')
    pg.select_option('#sec', '2'); pg.wait_for_timeout(120)
    # zero at one end, then a value at the other: fields, load and reactions agree
    pg.click('.pre[data-id="simple-t"]'); pg.wait_for_timeout(300); pg.click('#loads'); pg.wait_for_timeout(200)
    typ('#pp-w2', '0'); typ('#pp-w1', '5'); u = udl(); r = reac()
    ok(u['on'] and u['w1'] == 5 and u['w2'] == 0 and fields() == ['5', '0'], f'0/12, then B to 0, then A to 5: {u} {fields()}')
    ok(abs(r[0][1] - 10) < 1e-6 and abs(r[1][1] - 5) < 1e-6, f'reactions 10 and 5 kN: {r}')
    # a value beyond the range: the field shows the limit at once, before it is left
    typ('#pp-w2', '10'); typ('#pp-w1', '600'); f = fields(); u = udl(); n_ = lim()
    ok(f == ['600', '10'] and u['w1'] == 500 and n_ is not None and n_[0] == 'From 0 to 500 kN/m. Taken as 500.0 kN/m.', f'600 typed: the page takes the limit and says so; the field keeps what was typed until it is left: {f} {u} {n_}')
    leave('#pp-w1'); f = fields(); ok(f == ['500', '10'], f'the field that is left shows the limit: {f}')
    eqv = J("() => document.querySelector('table.eq').innerText"); ok('1530.0' in eqv, f'equilibrium shows the load of the fields, 1530 kN: {eqv!r}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # the peak of M under a point load: V changes sign there, it is not zero
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(300); pg.click('#tab-V'); pg.wait_for_timeout(1300)
    t = sheet(); ok('V changes sign: peak of M' in t and 'V = 0: peak of M' not in t, 'point load: the mark says that V changes sign')
    pg.click('.pre[data-id="simple-w"]'); pg.wait_for_timeout(300); pg.click('#tab-V'); pg.wait_for_timeout(1300)
    t = sheet(); ok('V = 0: peak of M' in t and 'V changes sign: peak of M' not in t, 'uniform load: the mark says V = 0')
    # an inclined load: the card says that P is the part across the member, with its value
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(300); J("() => { __lab.st.model.loads[0].ang = -30; __lab.resolve('tween'); }"); pg.click('#tab-V'); pg.wait_for_timeout(400)
    t = pg.inner_text('#learn'); ok('Here P is the part of the load across the member: 10.0 kN' in t and '−3.3 kN' in t, 'load at 30 degrees: V2 = 6.7 − 10 = −3.3 kN and the card says what P is, with its value')
    # upward uniform load: the place of V = 0 is written with the size of V1
    pg.click('.pre[data-id="simple-w"]'); pg.wait_for_timeout(300); J("() => { __lab.st.model.members[0].udl.ang = 90; __lab.resolve('tween'); }"); pg.click('#tab-V'); pg.wait_for_timeout(400)
    h = J("() => document.querySelector('#learn').innerHTML"); t = pg.inner_text('#learn')
    ok('|<i>V</i><sub>1</sub>|' in h and 'The reactions at A and B point downward' in t and 'lift off' in t, 'upward load: x0 from |V1|, and the note on supports that hold both ways')
    # the kept state of a truss is shown in brackets
    pg.click('.pre[data-id="truss"]'); pg.wait_for_timeout(500); pg.click('#tab-N'); pg.wait_for_timeout(400); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { __lab.st.model.loads[1].P = 40; __lab.resolve('tween'); }"); pg.wait_for_timeout(1300)
    t = sheet(); ok('\u221260.0 (\u221240.0)' in t and '40.0 (30.0)' in t, f'truss, Compare: kept values in brackets: {sorted(x for x in t if "(" in x)}')
    ok('In brackets: the kept state' in pg.inner_text('#mag'), 'footer explains the brackets')
    pg.click('#cmp'); pg.wait_for_timeout(200)
    # a load along a chord: the axial force of that bar is drawn as a line with its two end values
    pg.click('.pre[data-id="truss"]'); pg.wait_for_timeout(500); pg.click('#tab-N'); pg.wait_for_timeout(300)
    J("() => { Object.assign(__lab.st.model.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 }); __lab.resolve('tween'); }"); pg.wait_for_timeout(1300)
    t = sheet(); ok('\u221230.0' in t and not J("() => __lab.barStyle(0)"), f'load along the first chord: end values -30.0 and 30.0 drawn, not one value')
    # the title follows the structure
    pg.click('.pre[data-id="simple-t"]'); pg.wait_for_timeout(300); J("() => { const m = __lab.st.model; m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; __lab.resolve('tween'); }"); pg.wait_for_timeout(300)
    t = pg.inner_text('#learn'); ok(t.startswith('Changed structure') and 'A fixed, B free' in t and 'Reset brings the example back' in t, f'changed supports: title {t[:70]!r}')
    pg.click('#reset'); pg.wait_for_timeout(400); t = pg.inner_text('#learn'); ok(t.startswith('Simple beam') and 'triangular load' in t[:40], 'after Reset the title of the example is back')
    # --- the probe: both values where a line steps or kinks, one value elsewhere
    def probe(pid, xw, tab='M'):
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(300); pg.click(f'#tab-{tab}'); pg.wait_for_timeout(700)
        r = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return { x: c.x, y: c.y, ox: V.ox, s: V.s, yB: V.yB }; }")
        pg.mouse.move(r['x'] + r['ox'] + xw * r['s'] + 2, r['y'] + r['yB'] + 140); pg.wait_for_timeout(300)
        return sheet()
    # since version 17 the relation of a line and its numbers stand in the row under the line: what the page wrote there (SAID)
    SAID = "() => { const r = __lab.VW.rel, o = {}; if (!r) return null; if (r.key) return { [r.key]: r.said }; for (const k in r) o[k] = r[k].said || null; return o; }"
    t = probe('simple-p', 2.0); s_ = J(SAID)
    ok({'V left', 'V right', '13.3 kN', '\u22126.7 kN', '13.3 | \u22126.7 kN'} <= t and s_['M'] == ['M′ = V = 13.3 | −6.7 kN', 'here M changes by +13.3 | −6.7 kNm per metre (left | right)'] and 'slope = V, left' not in t,
       f'probe at the point load: the shear on both sides in the box, and both in the row of the moment, M′ = V = 13.3 | −6.7 kN: {s_["M"]} {sorted(x for x in t if "left" in x or "right" in x)}')
    ok(s_['V'] == ['V′ = −q = 0.0 kN/m', 'here V steps by −20.0 kN'], f'probe at the point load of 20 kN: the row of the shear names the step of −20.0 kN: {s_["V"]}')
    t = probe('simple-w', 3.0); s_ = J(SAID)
    ok('V left' not in t and s_ == {'V': ['V′ = −q = −10.0 kN/m', 'here V changes by −10.0 kN per metre'], 'M': ['M′ = V = 0.0 kN', 'here M changes by 0.0 kNm per metre'], 'D': ['w′ = θ = 0.0 mrad', 'here w changes by 0.0 mm per metre', 'EI·w″ = −M = −45.0 kNm']},
       f'probe at midspan of the uniform load: one value in each box and in each row: {s_}')
    t = probe('two-span', 5.0, 'V'); s_ = J(SAID)
    ok({'V left', 'V right', '\u221231.3 kN', '31.3 kN'} <= t and s_['V'] == ['V′ = −q = −10.0 kN/m', 'here V steps by +62.5 kN and changes by −10.0 kN per metre'], f'probe at the inner support: the shear on both sides, and the row names the step by the reaction of 62.5 kN: {s_["V"]}')
    t = probe('gerber', 7.5, 'D'); s_ = J(SAID)
    ok(s_['D'] == ['w′ = θ = −0.6 | 0.9 mrad', 'here w changes by −0.6 | +0.9 mm per metre (left | right)', 'EI·w″ = −M = 0.0 kNm'] and 'V left' not in t, f'probe at the hinge: the rotation on both sides in the row of the deflection, the shear with one value: {s_["D"]}')
    pg.mouse.move(5, 5)
    # on a frame a point load carries the probe: the shear before and after it
    pg.click('.pre[data-id="portal-g"]'); pg.wait_for_timeout(300)
    mi = J("() => { const L = __lab, m = L.st.model, mi = m.members.findIndex(q => Math.abs(m.nodes[q.n1].y - m.nodes[q.n2].y) < 1e-9); m.loads.push({ id: 99, m: mi, a: 2, P: 15, ang: -90 }); L.resolve('instant'); return mi; }")
    pg.click('#tab-V'); pg.wait_for_timeout(700)
    r = J(f"() => {{ const c = document.querySelector('canvas').getBoundingClientRect(), g = __lab.MG[{mi}], V = __lab.VW; return {{ x: c.x + g.ax + g.ex * 2 * V.s, y: c.y + g.ay + g.ey * 2 * V.s }}; }}")
    pg.mouse.move(r['x'], r['y'] - 30); pg.wait_for_timeout(300); t = sheet()
    ok('before | after' in t and '41.6 | 26.6 kN' in t, f'frame, point load under the mouse: {sorted(x for x in t if "|" in x)}')
    pg.mouse.move(5, 5)
    # --- the points of review 03
    learn = lambda: pg.inner_text('#learn')
    def pre(pid, js='', tab='M', wait=900):
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(300)
        if js: J("() => { const L = __lab, m = L.st.model; " + js + "; L.resolve('instant'); }")
        pg.click(f'#tab-{tab}'); pg.wait_for_timeout(wait)
    # turning a large load by its tail keeps its size
    pre('simple-p', 'm.loads[0].P = 1000')
    tail = J("() => { const L = __lab; for (let y = 0; y < 320; y += 2) for (let x = 100; x < 1200; x += 2) { const h = L.pick(x, y); if (h && h.type === 'tail') return [x, y]; } return null; }")
    r = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return { x: c.x, y: c.y, hx: V.ox + 2 * V.s, hy: V.yB }; }")
    ok(tail is not None, 'the tail of the 1000 kN load is found')
    if tail:
        import math
        hx, hy = r['hx'], r['hy']; rad = math.hypot(tail[0] - hx, tail[1] - hy); a0 = math.atan2(tail[1] - hy, tail[0] - hx)
        pg.mouse.move(r['x'] + tail[0], r['y'] + tail[1]); pg.mouse.down()
        for k in range(1, 9): a = a0 + math.radians(15) * k / 8; pg.mouse.move(r['x'] + hx + rad * math.cos(a), r['y'] + hy + rad * math.sin(a)); pg.wait_for_timeout(30)
        pg.mouse.up(); pg.wait_for_timeout(300)
        ld = J("() => ({ P: __lab.st.model.loads[0].P, ang: __lab.st.model.loads[0].ang })")
        ok(ld['P'] == 1000 and ld['ang'] != -90, f'1000 kN turned by its tail at the same radius: still 1000 kN, angle {ld["ang"]}: {ld}')
    # the handle of a large distributed load: a touch leaves the load as it is, a pull changes it from there
    pre('simple-w', 'm.members[0].udl.w1 = m.members[0].udl.w2 = 300')
    hd = J("() => { const L = __lab; for (let y = 0; y < 320; y += 2) for (let x = 100; x < 1200; x += 2) { const h = L.pick(x, y); if (h && h.type === 'udl') return [x, y]; } return null; }")
    cb = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.x, c.y]; }")
    ok(hd is not None, 'the handle of the 300 kN/m load is found')
    if hd:
        pg.mouse.move(cb[0] + hd[0], cb[1] + hd[1]); pg.mouse.down(); pg.mouse.move(cb[0] + hd[0] + 1, cb[1] + hd[1] - 1); pg.wait_for_timeout(60); pg.mouse.move(cb[0] + hd[0] + 2, cb[1] + hd[1] + 1); pg.wait_for_timeout(60); pg.mouse.up(); pg.wait_for_timeout(250)
        u = udl(); ok(u['w1'] == 300 and u['w2'] == 300, f'300 kN/m, handle touched and moved by 2 px: still 300: {u}')
        pg.mouse.move(cb[0] + hd[0], cb[1] + hd[1]); pg.mouse.down()
        for k in range(1, 6): pg.mouse.move(cb[0] + hd[0], cb[1] + hd[1] + 3 * k); pg.wait_for_timeout(40)
        pg.mouse.up(); pg.wait_for_timeout(250); u = udl()
        ok(100 < u['w1'] < 300 and u['w1'] == u['w2'], f'handle pulled 15 px toward the beam: smaller, from 300 and not from the top of the drawing scale: {u}')
    # a small force in a truss bar is not a zero bar
    pre('truss', 'm.loads[0].P = 1000; m.loads[1].P = 0.5; m.loads[2].P = 1000', 'N', 1300)
    t = sheet(); ok('0.4' in t, f'truss with 1000 / 0.5 / 1000 kN: the inner diagonals show 0.4, not 0: {sorted(x for x in t if x.startswith("0"))}')
    # two movements free where the count shows one
    pre('two-bay', "m.nodes.forEach(n => { if (n.lbl === 'A' || n.lbl === 'B' || n.lbl === 'C') n.sup = 'roller'; if (n.lbl === 'D') n.hinge = true; })")
    t = pg.inner_text('#learn .badge'); ok('2 restraints are missing' in t and '2 movements are free' in t and 'The count shows only 1' in t, f'two-bay frame on three rollers with a hinge at D: {t[:150]!r}')
    # point loads that act both ways
    pre('simple-2p', 'm.loads[0].P = 30; m.loads[1].P = 30; m.loads[1].ang = 90', 'V')
    t = learn(); ok('10.0 − 30.0 + 30.0' in t and 'each enters with the sign of its direction' in t, 'loads of 30 kN down and 30 kN up: the line reads 10.0 − 30.0 + 30.0')
    # the sign in V′ = −q follows the load
    pg.mouse.move(5, 5); pre('simple-w', '', 'V', 1300); t = sheet(); s_ = J(SAID); ok(s_['V'] == ['V′ = −q', 'per metre V changes by −q'] and {'V′', '−q'} <= t and '+q' not in t, f'load downward: V′ = −q in the row under the shear line: {s_["V"]}')
    pre('simple-w', 'm.members[0].udl.ang = 90', 'V', 1300); t = sheet(); s_ = J(SAID); h = J("() => document.querySelector('#learn').innerHTML")
    ok(s_['V'] == ['V′ = +q', 'per metre V changes by +q'] and '+q' in t and '−q' not in t and '<i>V</i>′ = +<i>q</i>' in h, f'load upward: V′ = +q in the row and in the card: {s_["V"]}')
    # the simple-beam moment carries its sign
    pre('two-span', 'm.members[0].udl.ang = 90; Object.assign(m.members[1].udl, { w1: 4, w2: 4 })')
    t = learn(); ok('It is negative: the load acts upward' in t and '−31.3 kNm' in t and '−26.6 kNm' in t, 'left span loaded upward: M0 = −31.3 kNm, M at midspan −26.6 kNm')
    # a point load on a support belongs to the jump of V
    pre('simple-p', '', 'V'); ok('a point load if one stands on the support' in learn(), 'rule at a support names a load that stands on it')
    # inflection at the joint of a beam that runs through
    pre('two-span', 'm.members[1].udl.ang = 90')
    inf = J("() => __lab.st.marks.infl.map(e => [e.mi, Math.round(e.x * 100) / 100])"); ok([0, 5] in inf, f'left span down, right span up: inflection at B: {inf}')
    pre('two-span', ''); inf = J("() => __lab.st.marks.infl.map(e => [e.mi, Math.round(e.x * 100) / 100])"); ok([0, 5] not in inf and len(inf) == 2, f'both spans down: two inflection points, none at B: {inf}')
    # frame: the curvature belongs to the displacement across the member
    pre('portal-s', '', 'D'); t = learn(); ok('EI·w″ = −M' in t and 'EI·δ″' not in t and 'Displacement: how far a point moves in total' in t and 'Deflection: the part of the displacement across the member' in t, 'frame: displacement δ, deflection w, EI·w″ = −M')
    pre('simple-w', '', 'D'); ok('EI·w″ = −M' in learn() and 'δ' not in learn(), 'beam: deflection w, EI·w″ = −M, no δ')
    # N = 0 with a load along the axis at the pin
    pre('simple-p', 'm.loads[0].a = 0; m.loads[0].ang = 0', 'N', 1300); t = sheet(); ok('N = 0 in the beam: the support takes the load along the axis' in t, f'horizontal load at the pin: {sorted(x for x in t if "N = 0" in x)}')
    pre('simple-p', '', 'N', 1300); t = sheet(); ok('No load along the axis: N = 0' in t, 'no load along the axis')
    pre('simple-p', 'm.loads[0].a = 3; m.loads[0].ang = 0; m.loads.push({ id: 98, m: 0, a: 3, P: 20, ang: 180 })', 'N', 1300); t = sheet(); ok('N = 0 in the beam: the loads along the axis cancel' in t, f'two opposite loads along the axis at one place: {sorted(x for x in t if "N = 0" in x)}')
    # a stretch with V = 0
    pre('simple-2p', '', 'M', 1300); t = sheet(); ok('V = 0 from 2.00 to 4.00 m: M constant' in t and 'V = 0: peak of M' not in t, f'two equal loads: the stretch between them is marked: {sorted(x for x in t if "V = 0" in x)}')
    # the fixing moment at a support between two members
    pre('two-span', "m.nodes.find(n => n.lbl === 'B').sup = 'fixed'"); t = J("() => document.querySelector('details.signs').textContent")
    ok('where two members meet there, the difference of their two moments' in t, 'fixed support between two spans: the note on the fixing moment')
    pre('cantilever', ''); t = J("() => document.querySelector('details.signs').textContent"); ok('fixing moment: the same size.' in t, 'fixed end of a cantilever: the same size')
    # Compare keeps a force that varied along its bar
    pre('truss', "Object.assign(m.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 })", 'N', 1300); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { __lab.st.model.members[0].udl.on = false; __lab.resolve('tween'); }"); pg.wait_for_timeout(1300)
    t = sheet(); ok({'(\u221230.0)', '(30.0)', '30.0'} <= t and not any(' to ' in x for x in t), f'kept chord force that ran from −30 to 30, now 30 throughout: the kept end values stand in brackets at the two ends: {sorted(x for x in t if "(" in x)}'); pg.click('#cmp'); pg.wait_for_timeout(200)
    # the title names the place of the load only while it stands there
    pre('cantilever', ''); ok('tip load' in learn()[:40], 'cantilever as it starts: tip load')
    pre('cantilever', 'm.loads[0].a = 1.5'); t = learn(); ok('point load' in t[:40] and 'tip load' not in t[:40], f'load moved to 1.50 m: title {t[:40]!r}')
    # --- the points of review 04
    marks = lambda: J("() => __lab.st.marks.ext.map(e => [e.mi, Math.round(e.x * 1000) / 1000, Math.round(e.v * 100) / 100, !!e.jump, e.flat ? e.flat.map(v => Math.round(v * 1000) / 1000) : null])")
    # the grip of a very large distributed load moved sideways leaves the load as it is
    pre('simple-w', 'm.members[0].udl.w1 = m.members[0].udl.w2 = 500')
    hd = J("() => { const L = __lab; for (let y = 0; y < 320; y += 2) for (let x = 100; x < 1200; x += 2) { const h = L.pick(x, y); if (h && h.type === 'udl') return [x, y]; } return null; }")
    if hd:
        pg.mouse.move(cb[0] + hd[0], cb[1] + hd[1]); pg.mouse.down()
        for k in range(1, 9): pg.mouse.move(cb[0] + hd[0] + k, cb[1] + hd[1]); pg.wait_for_timeout(30)
        pg.mouse.up(); pg.wait_for_timeout(250)
    u = udl(); ok(hd is not None and u['w1'] == 500 and u['w2'] == 500, f'500 kN/m, grip moved 8 px sideways: still 500: {u}')
    # a small load: a shorter arrow never gives a larger load
    pre('simple-p', 'm.loads[0].P = 0.1')
    tail = J("() => { const L = __lab; for (let y = 0; y < 320; y += 2) for (let x = 100; x < 1200; x += 2) { const h = L.pick(x, y); if (h && h.type === 'tail') return [x, y]; } return null; }")
    r = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return { x: c.x, y: c.y, hx: V.ox + 2 * V.s, hy: V.yB }; }")
    if tail:
        pg.mouse.move(r['x'] + tail[0], r['y'] + tail[1]); pg.mouse.down()
        for k in range(1, 11): pg.mouse.move(r['x'] + tail[0], r['y'] + tail[1] + k); pg.wait_for_timeout(30)   # toward the beam: shorter
        pg.mouse.up(); pg.wait_for_timeout(250)
    P = J("() => __lab.st.model.loads[0].P"); ok(tail is not None and P == 0.1, f'0.1 kN, arrow shortened by 10 px: still 0.1 kN, not more: {P}')
    # deflection of a frame under very large column loads is shown, not taken for a rounding amount
    pre('portal-g', '')
    J("() => { const L = __lab, m = L.st.model; L.st.sec = 0; m.members.forEach(k => { k.udl.on = false; }); const cols = m.members.map((k, i) => i).filter(i => Math.abs(m.nodes[m.members[i].n1].x - m.nodes[m.members[i].n2].x) < 1e-9); for (const i of cols) Object.assign(m.members[i].udl, { on: true, w1: 500, w2: 500, ang: -90 }); m.loads = [{ id: 1, m: cols[0], a: 2, P: 0.2, ang: 0 }]; L.resolve('instant'); }")
    pg.click('#tab-D'); pg.wait_for_timeout(1300); z = J("() => ({ W: __lab.st.zero.W, D: Math.round(__lab.st.sol.max.D * 1e6) / 1000 })"); t = sheet()
    ok(not z['W'] and z['D'] == 0.093 and '0.1 mm' in t, f'portal of IPE 200 with 500 kN/m down the columns and 0.2 kN across: 0.093 mm is drawn: {z} {sorted(x for x in t if "mm" in x)}')
    J("() => { __lab.st.sec = 2; }")
    # corners, stretches and inflection points at the joints of a beam
    pre('two-span', ''); mk = marks(); ok([0, 5, -31.25, True, None] in mk, f'two-span beam: the corner of M at B is marked: {mk}')
    pre('cantilever', "m.loads = [{ id: 1, m: 0, a: 1, P: 10, ang: 90 }, { id: 2, m: 0, a: 2, P: 10, ang: -90 }]"); mk = marks(); t = sheet()
    ok(any(e[4] == [0, 1] and e[2] == -10 for e in mk) and 'V = 0 from 0.00 to 1.00 m: M constant' in t, f'cantilever, 10 kN up at 1 m and down at 2 m: the stretch from 0 to 1 m is marked: {mk}')
    pre('two-span', "m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 2.5, P: 49, ang: -90 }, { id: 2, m: 0, a: 4.95, P: 50, ang: 90 }, { id: 3, m: 1, a: 0.05, P: 50, ang: -90 }, { id: 4, m: 1, a: 2.5, P: 49, ang: 90 }]")
    inf = J("() => __lab.st.marks.infl.map(e => [e.mi, Math.round(e.x * 100) / 100])"); ok([0, 5] in inf, f'four loads around B: inflection at B although M is zero 0.1 m on both sides: {inf}')
    # the probe at a load that stands at x = 6.01 m on the second span
    pre('two-span', "m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 1.01, P: 20, ang: -90 }]", 'V', 700)
    rr = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return { x: c.x, y: c.y, ox: V.ox, s: V.s, yB: V.yB }; }")
    pg.mouse.move(rr['x'] + rr['ox'] + 6.01 * rr['s'] + 1, rr['y'] + rr['yB'] + 140); pg.wait_for_timeout(300); t = sheet(); pg.mouse.move(5, 5)
    ok({'V left', 'V right', '17.4 kN', '\u22122.6 kN'} <= t, f'probe at the load at 6.01 m: 17.4 and −2.6 kN: {sorted(x for x in t if "kN" in x and "/" not in x)}')
    # rules that name the part of a load across the member, the mean of N, the members at a support
    pre('simple-w', 'm.members[0].udl.ang = 90', 'V'); t = learn(); ok('rises under an upward one' in t and 'the part of the load across the beam' in t, 'beam, upward load: the change of V and its slope name direction and part')
    pre('portal-g', '', 'V'); t = learn(); ok('the part of the load across the member' in t and 'Where several members meet there they share the reaction' in t, 'frame: V′ with the part across the member; several members at a support share the reaction')
    pre('truss', '', 'V'); t = learn(); ok('balance the reaction and a load that stands on the joint' in t and 'also has shear at its two ends' in t, 'truss: the bars at a support balance the reaction and a load on the joint; a bar loaded across its axis has end shear')
    pre('truss', "Object.assign(m.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 })", 'D'); ok('its mean value over the bar counts' in learn(), 'truss with a load along a bar: N in the change of length is its mean value')
    pre('truss', "Object.assign(m.members[9].udl, { on: true, w1: 0, w2: 6, ang: -90 })", 'D'); ok('the number stands at that point, which is marked' in learn(), 'truss with a bar that bends: the rule says where the number stands')
    pre('portal-g', "m.nodes.forEach(n => { if (n.sup === 'free') n.hinge = true; })", 'D'); t = learn(); ok('twice the bending stiffness everywhere halves the movement' in t and 'it changes only as far as the force N in the bar changes with the stiffness' in t and 'A bar keeps its EA' in t, 'frame with a roof bar hinged at both ends: 1/EI is said of bending alone, the change of length follows the force in the bar')
    pre('portal-g', '', 'D'); ok('does not follow 1/EI' not in learn(), 'frame without such a bar: the rule stands as it is')
    # Compare: kept end values where the present force of the bar varies too
    pre('truss', "Object.assign(m.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 })", 'N', 1300); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { Object.assign(__lab.st.model.members[0].udl, { w1: 30, w2: 30 }); __lab.resolve('tween'); }"); pg.wait_for_timeout(1300)
    t = sheet(); ok('\u221260.0 (\u221230.0)' in t, f'chord load raised from 20 to 30 kN/m: the kept end value stands in brackets: {sorted(x for x in t if "(" in x)}'); pg.click('#cmp'); pg.wait_for_timeout(200)
    # the largest displacement inside a member, and the peak of a deflection between two samples
    pre('portal-s', 'm.loads[0].P = 200', 'D', 1300); t = sheet(); ok('213.2 mm' in t and '212.8 mm' in t, f'sway portal with 200 kN: 213.2 mm inside the beam and 212.8 mm at the joints: {sorted(x for x in t if "mm" in x)}')
    pre('simple-p', 'm.loads[0].P = 275; m.loads[0].a = 1.2', 'D', 1300); t = sheet(); ok('40.9' in t and '40.8' not in t, f'275 kN at 1.20 m: largest deflection 40.9 mm: {sorted(x for x in t if x.startswith("40."))}')
    # a small extremum of the other sign is written
    pre('three-hinge', "m.members[1].udl.w1 = 0; Object.assign(m.members[0].udl, { on: true, w1: 6, w2: 0, ang: 0 })", 'M', 1300); t = sheet(); ok('0.1' in t, f'three-hinged frame with the triangle: the small positive moment beside G is written: {sorted(x for x in t if x.startswith("0."))}')
    # the lower limit holds for the entry as typed; the prompts of the overhang name no place
    pre('simple-p', ''); hit2 = J("() => { const L = __lab; for (let y = 0; y < 300; y += 3) for (let x = 100; x < 1100; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') return [x, y]; } return null; }")
    pg.mouse.click(cb[0] + hit2[0], cb[1] + hit2[1]); pg.wait_for_timeout(300); typ('#pp-P', '0.06')
    ok(J("() => __lab.st.model.loads[0].P") == 20 and 'From 0.1 to 1000 kN' in (lim() or [''])[0], f'0.06 typed: not taken, the load keeps 20 kN: {lim()}'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pre('overhang', 'm.loads[0].a = 1'); ok('tip load' not in learn(), 'overhang with the load moved: no prompt speaks of a tip load')
    # --- taking a load moves nothing: a drag counts from the place of the load, not from the place of the pointer
    geo = lambda: J("() => { const L = __lab, ld = L.st.model.loads[0], g = L.HS.loads.get(ld.id); return { lb: g.lb, kx: g.kx, ky: g.ky, hx: g.hx, hy: g.hy, s: L.VW.s, a: ld.a, P: ld.P, ang: ld.ang }; }")
    def pull(x, y, dx, dy, n=8):
        pg.mouse.move(cb[0] + x, cb[1] + y); pg.mouse.down()
        for k in range(1, n + 1): pg.mouse.move(cb[0] + x + dx * k / n, cb[1] + y + dy * k / n); pg.wait_for_timeout(25)
        pg.mouse.up(); pg.wait_for_timeout(250)
    pre('simple-p', ''); g = geo(); lx, ly = g['lb'][2] - 4, (g['lb'][1] + g['lb'][3]) / 2
    ok(J(f"() => {{ const h = __lab.pick({lx}, {ly}); return !!h && h.type === 'load'; }}") and abs(lx - g['hx']) > 12, f'the number of the load takes the load, {abs(lx - g["hx"]):.0f} px beside its arrow')
    pull(lx, ly, 0, 7); g2 = geo(); ok(g2['a'] == 2 and g2['P'] == 20 and g2['ang'] == -90, f'load taken by its number and moved 7 px down: it stays at 2.00 m: {g2["a"]}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    g = geo(); lx, ly = g['lb'][2] - 4, (g['lb'][1] + g['lb'][3]) / 2
    pull(lx, ly, 30, 0); g2 = geo(); want = round(round((2 + 30 / g['s']) / 0.05) * 0.05, 2)
    ok(abs(g2['a'] - want) < 1e-9, f'taken by its number and moved 30 px to the right: the load moves by those 30 px, to {want} m: {g2["a"]}')
    pre('simple-p', 'm.loads[0].a = 2.13'); g = geo(); pull(g['hx'] + 5, g['hy'] - 30, 0, -7); g2 = geo()
    ok(g2['a'] == 2.13, f'load typed at 2.13 m, taken on its arrow and moved 7 px up: it stays at 2.13 m: {g2["a"]}')
    pre('simple-p', 'm.loads[0].P = 1'); g = geo()
    ok(J(f"() => {{ const h = __lab.pick({g['kx'] + 8}, {g['ky']}); return !!h && h.type === 'tail'; }}"), 'the knob of a 1 kN load is taken 8 px beside its centre')
    pull(g['kx'] + 8, g['ky'], 0, -8); g2 = geo(); ok(g2['ang'] == -90 and g2['P'] == 1, f'knob taken 8 px beside its centre and pulled 8 px along the arrow: direction and size stay: {g2["ang"]} deg, {g2["P"]} kN')
    pull(geo()['kx'] + 8, geo()['ky'], 0, -30); g3 = geo(); ok(g3['ang'] == -90 and g3['P'] > 1, f'pulled 30 px along the arrow: the load grows and keeps its direction: {g3["ang"]} deg, {g3["P"]} kN')
    # the number of the largest displacement inside a beam that sways stands beside the line, not on it
    pre('portal-s', 'm.loads[0].P = 200', 'D', 1300)
    pos = J("""() => { const L = __lab, o = CanvasRenderingContext2D.prototype.fillText, out = []; CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { out.push([String(t), x, y]); return o.call(this, t, x, y); };
      L.st.dirty = true; return new Promise(r => setTimeout(() => { CanvasRenderingContext2D.prototype.fillText = o; const bi = L.MG.findIndex(q => Math.abs(q.ey) < 1e-9), g = L.MG[bi], S = L.st.sol.mem[bi].smp, ex = L.VW.dAmp / L.st.ext.D; let im = 0; const d = i => Math.hypot(S.dX[i], S.dY[i]); for (let i = 1; i < S.xs.length; i++) if (d(i) > d(im)) im = i;
        const hit = out.find(e => e[0] === '213.2 mm'); r({ hit, py: g.ay + g.ey * S.xs[im] * L.VW.s - S.dY[im] * ex, px: g.ax + g.ex * S.xs[im] * L.VW.s + S.dX[im] * ex }); }, 300)); }""")
    ok(pos['hit'] is not None and abs(pos['hit'][2] - pos['py']) >= 12 and abs(pos['hit'][1] - pos['px']) < 60, f'sway portal: 213.2 mm stands {abs(pos["hit"][2] - pos["py"]) if pos["hit"] else 0:.0f} px beside the line of the beam, at its point: {pos}')
    # --- the points of review 05
    D_ = lambda: J("() => ({ zero: __lab.st.zero.D, D: Math.round(__lab.st.sol.max.D * 1e7) / 1e4 })")
    # C51 a column on a pin with a hinged head is a bar and shortens
    pre('portal-g', "m.nodes[0].sup = 'pin'; m.nodes[1].hinge = true; m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 4, P: 100, ang: -90 }]", 'D', 1300); t = sheet(); z = D_()
    ok(J("() => __lab.st.bars[0] === true") and not z['zero'] and '0.4 mm' in t and 'No displacement' not in t, f'portal, pin at A and hinge at C, 100 kN down at C: the column is a bar and C settles 0.4 mm: {z} {sorted(x for x in t if "mm" in x)}')
    # C52 Compare on, load taken away: the present state has no displacement and says so
    pre('portal-s', '', 'D', 1300); pg.click('#cmp'); pg.wait_for_timeout(200); J("() => { __lab.st.model.loads = []; __lab.resolve('tween'); }"); pg.wait_for_timeout(1500); t = sheet()
    ok('No displacement' in t and not any(x.endswith(' mm') for x in t), f'sway portal, Compare on, load deleted: no displacement number, the sheet says No displacement: {sorted(x for x in t if "mm" in x or "isplacement" in x)}')
    pg.click('#tab-N'); pg.wait_for_timeout(900); pg.click('#cmp'); pg.wait_for_timeout(200)
    # C53 a place typed 3 mm before the end of a bar stays on the bar
    pre('truss', "m.loads = [{ id: 1, m: 9, a: 2, P: 1000, ang: -90 }]", 'M', 900)
    hit3 = J("() => { const L = __lab; for (let y = 0; y < 700; y += 3) for (let x = 100; x < 1100; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') return [x, y]; } return null; }")
    pg.mouse.click(cb[0] + hit3[0], cb[1] + hit3[1]); pg.wait_for_timeout(300); typ('#pp-a', '4.24'); pg.wait_for_timeout(300)
    a_ = J("() => __lab.st.model.loads[0].a"); Mx = J("() => __lab.FS.forcesAt(__lab.st.sol.mem[9], 4.24, -1).M")
    ok(a_ == 4.24 and abs(Mx - 1.866) < 2e-3, f'4.24 m typed on the diagonal of 4.2426 m: the load stays at 4.24 m, M = 1.866 kNm there: a = {a_}, M = {Mx:.4f}')
    typ('#pp-a', '4.25'); a_ = J("() => __lab.st.model.loads[0].a"); n_ = lim(); pr = J("() => [...document.querySelectorAll('#pop button[data-at]')].map(b => [b.textContent, b.getAttribute('aria-pressed')])")
    ok(abs(a_ - 18 ** 0.5) < 1e-12 and n_ is not None and n_[0] == 'On the right joint: the member is 4.243 m long.' and pr == [['On A', 'false'], ['Right joint', 'true']], f'4.25 m typed: the load stands on the joint and the menu names it: {a_} {n_} {pr}')
    pg.click('#pop button[data-at="0"]'); pg.wait_for_timeout(300); ok(J("() => __lab.st.model.loads[0].a") == 0 and J("() => document.querySelector('#pp-a').value") == '0', 'button On A: the load stands on A')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # C54 / C09 a chord with loads along it that cancel: its inside moves, its joints do not
    pre('truss', "m.loads = [[0.09, 500, 0], [0.88, 1000, 180], [1.67, 500, 0]].map((l, i) => ({ id: 50 + i, m: 1, a: l[0], P: l[1], ang: l[2] }))", 'D', 1300); t = sheet(); tp = J("() => { const q = __lab.st.sol.mem[1]._top; return q ? [Math.round(q.x * 1e4) / 1e4, Math.round(q.v * 1e8) / 1e5] : null; }")
    ok('0.3 mm' in t and '0.4 mm' not in t and tp == [0.88, 0.34962] and 'where a point inside a loaded bar moves more than its joints' in learn(), f'chord with 500, 1000 and 500 kN along it at 0.09, 0.88 and 1.67 m: 0.3 mm at the middle load, not 0.4, and the rule names the point: {tp} {sorted(x for x in t if "mm" in x)}')
    # C44 / C45 the largest displacement is found on the line, and its dot stands there
    pre('portal-g', "L.st.sec = 0; m.members.forEach(k => { k.udl.on = false; }); m.loads = [{ id: 1, m: 1, a: 3.95, P: 40.8, ang: -90 }]", 'D', 1300); t = sheet(); tp = J("() => { const q = __lab.st.sol.mem[1]._top; return [Math.round(q.x * 1e4) / 1e4, Math.round(q.v * 1e7) / 1e4]; }")
    ok('42.7 mm' in t and abs(tp[0] - 3.9741) < 2e-4 and abs(tp[1] - 42.6534) < 2e-4, f'fixed portal, IPE 200, 40.8 kN at 3.95 m of the beam: 42.7 mm at 3.974 m: {tp}')
    pre('simple-p', "L.st.sec = 0; m.loads[0].P = 864.4; m.loads[0].a = 0.06", 'D', 1300); t = sheet(); ok('29.4' in t and '29.3' not in t, f'864.4 kN at 0.06 m, IPE 200: largest deflection 29.4 mm: {sorted(x for x in t if x.startswith("29."))}')
    # C39 very large loads along a beam leave its small deflection to be seen
    pre('two-span', "L.st.sec = 0; m.nodes[1].sup = 'free'; m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 0.33, P: 0.1, ang: -90 }]; for (let i = 0; i < 85; i++) m.loads.push({ id: 10 + i, m: 1, a: 5, P: 1000, ang: 180 })", 'D', 1300); z = D_(); t = sheet()
    ok(not z['zero'] and '0.1' in t and 'w = 0' not in t, f'10 m beam, 85 loads of 1000 kN along it at the roller and 0.1 kN across at 0.33 m: the deflection of 0.05 mm is drawn: {z}')
    J("() => { __lab.st.sec = 2; }")
    # C05 a stretch with V = 0 beside a very large moment is still marked
    pre('cantilever', "m.loads = [{ id: 1, m: 0, a: 1, P: 10, ang: 90 }, { id: 2, m: 0, a: 2, P: 10, ang: -90 }, { id: 3, m: 0, a: 0.5, P: 1000, ang: -90 }]"); mk = marks(); t = sheet()
    ok(any(e[4] == [0.5, 1] and e[2] == -10 for e in mk) and 'V = 0 from 0.50 to 1.00 m: M constant' in t, f'cantilever with 1000 kN at 0.5 m added: the stretch from 0.50 to 1.00 m with M = −10 is marked: {mk}')
    # C30 an inflection point at a joint where M, V and the load are all zero
    pre('two-span', "Object.assign(m.members[0].udl, { on: true, w1: 12, w2: 0, ang: -90 }); Object.assign(m.members[1].udl, { on: true, w1: 0, w2: 12, ang: 90 }); m.loads = [{ id: 1, m: 0, a: 2.5, P: 20, ang: 90 }, { id: 2, m: 1, a: 2.5, P: 20, ang: -90 }]")
    inf = J("() => __lab.st.marks.infl.map(e => [e.mi, Math.round(e.x * 100) / 100])"); mB = J("() => [4.5, 5].map(x => Math.round(__lab.FS.forcesAt(__lab.st.sol.mem[0], x, -1).M * 1000) / 1000)")
    ok([0, 5] in inf and mB == [-0.05, 0], f'triangles 12 to 0 down and 0 to 12 up with 20 kN up and down: M = −0.050 at 4.5 m, 0 at B, inflection point at B: {inf} {mB}')
    # C34 a load on the pin and two loads that cancel at midspan
    pre('simple-p', "m.loads = [{ id: 1, m: 0, a: 0, P: 20, ang: 0 }, { id: 2, m: 0, a: 3, P: 20, ang: 0 }, { id: 3, m: 0, a: 3, P: 20, ang: 180 }]", 'N', 900); t = sheet()
    ok('N = 0 in the beam: the support takes the load that stands on it, the other loads along the axis cancel' in t, f'20 kN on the pin and two opposite loads at midspan: the note says both: {sorted(x for x in t if "N = 0" in x)}')
    # C13 Compare: a present force that is zero does not hide the kept one
    pre('truss', "Object.assign(m.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 })", 'N', 1300); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { Object.assign(__lab.st.model.members[0].udl, { w1: 10, w2: 10 }); __lab.resolve('tween'); }"); pg.wait_for_timeout(1300); t = sheet()
    ok('0 (−30.0)' in t, f'chord load reduced from 20 to 10 kN/m: the start shows 0 with the kept −30.0 in brackets: {sorted(x for x in t if "(" in x)}'); pg.click('#cmp'); pg.wait_for_timeout(200)
    # C23 an arrow that ends shorter than it started carries no larger load
    pre('simple-p', ''); g = geo(); pg.mouse.move(cb[0] + g['kx'], cb[1] + g['ky']); pg.mouse.down()
    pg.mouse.move(cb[0] + g['kx'], cb[1] + g['ky'] + 20); pg.wait_for_timeout(40); pg.mouse.move(cb[0] + g['kx'], cb[1] + g['ky'] + 5); pg.wait_for_timeout(40); pg.mouse.up(); pg.wait_for_timeout(250)
    g2 = geo(); ok(g2['P'] <= 20 and g2['ang'] == -90, f'tail of 20 kN moved 20 px inward in one step, then back to 5 px inward: not more than 20 kN: {g2["P"]}')
    # C38 the grip of a load on an inclined bar, moved along the bar
    pre('truss', "Object.assign(m.members[9].udl, { on: true, w1: 10, w2: 10, ang: -90 })"); hd = J("() => { const g = __lab.HS.udl.get(9); return [g.kx, g.ky]; }")
    pull(hd[0], hd[1], 20, -20); u9 = J("() => __lab.st.model.members[9].udl"); ok(u9['w1'] == 10 and u9['w2'] == 10, f'10 kN/m on the 45 degree diagonal, grip moved 20 px right and 20 px up along the bar: still 10: {u9}')
    hd = J("() => { const g = __lab.HS.udl.get(9); return [g.kx, g.ky]; }"); pull(hd[0], hd[1], 0, -25); u9 = J("() => __lab.st.model.members[9].udl"); ok(u9['w1'] > 10, f'the same grip moved 25 px up: larger: {u9}')
    # C56 a load along a member: its mark opens the menu and its hint says so
    pre('truss', "Object.assign(m.members[0].udl, { on: true, w1: 20, w2: 20, ang: 180 })"); hd = J("() => { const g = __lab.HS.udl.get(0); return [g.kx, g.ky, g.par]; }")
    pg.mouse.move(cb[0] + hd[0], cb[1] + hd[1]); pg.wait_for_timeout(200); hint = pg.inner_text('#hint')
    ok(hd[2] and hint == 'Load along the member. Click: its size, shape and direction.', f'load along a chord: the hint of its mark: {hint!r}')
    pg.mouse.click(cb[0] + hd[0], cb[1] + hd[1]); pg.wait_for_timeout(300); ok(J("() => !!document.querySelector('#pp-w1') && !document.querySelector('#pop').hidden"), 'a click on the mark opens the menu of the load')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # C60 one step back after a change of section brings the section back
    pre('simple-p', ''); J("() => { __lab.st.sec = 2; document.querySelector('#sec').value = 2; __lab.resolve('instant'); }")
    g = geo(); lx, ly = g['hx'] + 5, g['hy'] - 30; pg.mouse.click(cb[0] + lx, cb[1] + ly); pg.wait_for_timeout(300); typ('#pp-P', '30'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pg.select_option('#sec', '0'); pg.wait_for_timeout(500); pg.click('#undo'); pg.wait_for_timeout(600)
    r_ = J("() => [__lab.st.model.loads[0].P, __lab.st.sec, document.querySelector('#sec').value]"); ok(r_ == [30, 2, '2'], f'20 to 30 kN, then IPE 300 to IPE 200, one step back: 30 kN on IPE 300: {r_}')
    pg.click('#undo'); pg.wait_for_timeout(500); ok(J("() => __lab.st.model.loads[0].P") == 20, 'a second step back: 20 kN')
    # C57, C58, C59 rule texts
    pre('portal-g', '', 'N'); ok('A column that stands on a support passes its axial force to it: the vertical reaction there is that force and, where a load stands on the support itself, that load.' in learn(), 'frame: what a column passes to its support')
    pre('truss', "Object.assign(m.members[9].udl, { on: true, w1: 0, w2: 6, ang: -90 })", 'D'); ok('bends it when it has a part across the bar; its part along the bar changes N only' in learn(), 'truss: which load between the joints bends a bar')
    pre('portal-g', '', 'M'); t = learn(); ok('bending pulls the dashed side of the member and presses the other' in t and 'An axial force comes on top of it' in t and 'side in tension.' not in t, 'frame: the side of the moment line is the tension side of bending alone')
    # a dip of the moment line between two peaks is a low point
    pre('simple-p', "m.loads = [[0,3,50,-90],[0,5.25,49,90],[0,1.15,10,90]].map((l, i) => ({ id: 100 + i, m: l[0], a: l[1], P: l[2], ang: l[3] })); Object.assign(m.members[0].udl, { on: true, w1: 5, w2: 10, ang: -90 })"); t = sheet()
    ok('V changes sign: low point of M' in t and 'V = 0: peak of M' in t, f'moment line with a dip of 1.2 kNm between two peaks: the dip is called a low point: {sorted(x for x in t if "of M" in x)}')
    # --- the knob of a load stays on the sheet, and the values of loads and reactions keep off the load arrows
    WH = J("() => { const c = document.querySelector('canvas'); return [c.clientWidth, c.clientHeight]; }")
    inside = lambda g: 7 <= g['kx'] <= WH[0] - 7 and 7 <= g['ky'] <= WH[1] - 7
    pre('simple-p', 'm.loads[0].P = 1000'); g = geo(); ok(inside(g), f'1000 kN on a beam: its knob lies on the sheet: {g["kx"]:.0f}, {g["ky"]:.0f}')
    pull(g['kx'], g['ky'], 0, 40); g2 = geo(); ok(100 < g2['P'] < 1000 and g2['ang'] == -90, f'its knob moved 40 px toward the beam: a smaller load: {g2["P"]}')
    pre('simple-p', 'm.loads[0].a = 6; m.loads[0].ang = 180; m.loads[0].P = 200', 'N'); g = geo()
    ok(inside(g) and g['kx'] > g['hx'] and (g['lb'][3] < g['hy'] - 1 or g['lb'][1] > g['hy'] + 1), f'200 kN on the roller B acting along the beam: knob on the sheet, value beside the arrow: {g["kx"]:.0f}, {[round(v) for v in g["lb"]]}')
    pre('simple-p', 'm.loads = [{ id: 1, m: 0, a: 0, P: 20, ang: 0 }, { id: 2, m: 0, a: 3, P: 20, ang: 0 }, { id: 3, m: 0, a: 3, P: 20, ang: 180 }]', 'N'); g = geo()
    cut = J("""() => { const H = __lab.HS, sh = [...H.loads.values()].map(g => [g.hx, g.hy, g.kx, g.ky]), lab = [...H.loads.values()].map(g => g.lb).concat(H.rlab.map(r => r[1]));
      return lab.filter(b => b && sh.some(q => Math.abs(q[1] - q[3]) < 1e-6 && b[1] < q[1] && b[3] > q[1] && b[0] < Math.max(q[0], q[2]) && b[2] > Math.min(q[0], q[2]))).length; }""")
    ok(inside(g) and cut == 0 and J("() => __lab.HS.rlab.length") == 1, f'20 kN on the pin A along the beam: knob on the sheet, the values of load and reaction beside the arrows: {g["kx"]:.0f}, values on an arrow: {cut}')
    # --- the points of review 06
    J("() => { __lab.st.sec = 2; document.querySelector('#sec').value = 2; }")
    rl_ = lambda: J("() => __lab.HS.rlab.map(r => r[0])")
    # C63 a new point load stands where the member was clicked, and the button names the place
    pre('simple-p', '')
    px = J("""() => { const L = __lab, V = L.VW; for (const dy of [4, -4, 6, -6, 0]) for (let x = Math.floor(V.ox + 2.05 * V.s); x < V.ox + 2.2 * V.s; x++) { const h = L.pick(x, V.yB + dy); if (h && h.type === 'member' && Math.abs(h.a - 2.1) < 0.012) return [x, V.yB + dy, h.a]; } return null; }""")
    ok(px is not None, 'a place on the beam at 2.10 m is found, beside the load at 2.00 m')
    if px:
        pg.mouse.click(cb[0] + px[0], cb[1] + px[1]); pg.wait_for_timeout(300)
        bt = J("() => { const b = document.querySelector('#pop button[data-act=\"add\"]'); return b ? b.textContent : null; }")
        ok(bt == 'Add point load at 2.10 m from A', f'beam clicked at 2.10 m: the button names that place: {bt!r}')
        pg.click('#pop button[data-act="add"]'); pg.wait_for_timeout(500)
        la = sorted(J("() => __lab.st.model.loads.map(l => l.a)")); ry = [round(r[1], 2) for r in reac()]; mx = J("() => Math.round(__lab.FS.forcesAt(__lab.st.sol.mem[0], 2.1, -1).M * 10) / 10")
        ok(la == [2, 2.1] and ry == [26.33, 13.67] and mx == 53.3, f'the new load stands at 2.10 m: loads at {la}, reactions {ry}, M = {mx} kNm there')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pre('simple-p', ''); pg.click('#loads'); pg.wait_for_timeout(300)
    bt = J("() => { const b = document.querySelector('#pop button[data-act=\"add\"]'); return b ? b.textContent : null; }")
    ok(bt == 'Add point load at 3.00 m from A', f'button Loads, no place chosen: the button offers the middle of the beam and names it: {bt!r}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pre('simple-p', 'm.loads[0].a = 3'); pg.click('#loads'); pg.wait_for_timeout(300)
    bt = J("() => { const b = document.querySelector('#pop button[data-act=\"add\"]'); return b ? b.textContent : null; }")
    ok(bt == 'Add point load at 1.50 m from A', f'button Loads with a load at the middle: the button offers the middle of the widest gap and names it: {bt!r}')
    pg.click('#pop button[data-act="add"]'); pg.wait_for_timeout(400); la = sorted(J("() => __lab.st.model.loads.map(l => l.a)")); ok(la == [1.5, 3], f'the load is added at the place the button named: {la}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pre('simple-p', "m.loads.push({ id: 7, m: 0, a: 2, P: 20, ang: -90 })"); t = sheet()
    ok('2 × 20.0 kN' in t and '20.0 kN' not in t, f'two loads of 20 kN at the same place: one value with their number: {sorted(x for x in t if "kN" in x and "/" not in x)}')
    g = geo(); n0 = len(errs)
    for dx, dy in [(60, -60), (30, -30), (8, -40), (0, -25), (200, 3), (-40, 40)]: pg.mouse.move(cb[0] + g['hx'] + dx, cb[1] + g['hy'] + dy); pg.wait_for_timeout(60)
    hb = J(f"() => {{ const h = __lab.pick({(g['lb'][0] + g['lb'][2]) / 2}, {(g['lb'][1] + g['lb'][3]) / 2}); return h ? [h.type, h.id] : null; }}"); pg.mouse.move(5, 5)
    ok(len(errs) == n0 and hb == ['load', 1] and J("() => __lab.HS.loads.get(7).lb === null"), f'the pointer moved over the two loads: no script error, the value takes the first of them: {hb} {errs[n0:]}')
    # C64 the probe on a load reads the place of that load, not of its neighbour 1 cm away
    pre('bent', "m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 1, P: 100, ang: 90 }, { id: 2, m: 1, a: 1.01, P: 100, ang: -90 }]", 'V', 1200)
    def onload(i):
        g = J(f"() => {{ const g = __lab.HS.loads.get({i}); return [(g.hx + g.kx) / 2, (g.hy + g.ky) / 2]; }}")
        pg.mouse.move(cb[0] + g[0], cb[1] + g[1]); pg.wait_for_timeout(400); t = sheet(); pg.mouse.move(5, 5); pg.wait_for_timeout(150); return t
    t1 = onload(1); t2 = onload(2)
    ok('x = 1.00 m' in t1 and '−1.0 kNm' in t1 and 'x = 1.01 m' not in t1 and {'0.0 kN', '100.0 kN'} <= t1, f'arm with 100 kN up at 1.00 m and 100 kN down at 1.01 m, pointer on the upward load: the probe reads 1.00 m, M = −1.0 kNm: {sorted(x for x in t1 if "x = " in x or "kNm" in x)}')
    ok('x = 1.01 m' in t2 and '0.0 kNm' in t2 and 'x = 1.00 m' not in t2, f'pointer on the downward load: the probe reads 1.01 m, M = 0.0 kNm: {sorted(x for x in t2 if "x = " in x or "kNm" in x)}')
    # C65 each line is judged in its own unit: a small axial force beside a very large moment is drawn
    pre('simple-p', "m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; m.loads = [{ id: 1, m: 0, a: 6, P: 0.1, ang: 0 }]; for (let i = 0; i < 17; i++) m.loads.push({ id: 10 + i, m: 0, a: 6, P: 1000, ang: -90 })", 'N', 1200); t = sheet()
    ok(not J("() => __lab.st.zero.N") and '0.1' in t and '102000.0 kNm' in t and not any('N = 0' in x for x in t), f'6 m cantilever with 17 000 kN at the tip (fixing moment 102 000 kNm) and 0.1 kN along it: N = 0.1 is drawn: {sorted(x for x in t if "N = 0" in x or x == "0.1")}')
    pre('simple-p', "m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; m.loads = [{ id: 1, m: 0, a: 6, P: 0.1, ang: 60 }]; for (let i = 0; i < 51; i++) m.loads.push({ id: 10 + i, m: 0, a: 0.01, P: 1000, ang: -90 })", 'N', 1200); t = sheet(); nmax = J("() => Math.max(...Array.from(__lab.st.sol.mem[0].smp.N, Math.abs))")
    ok(not J("() => __lab.st.zero.N") and abs(nmax - 0.05) < 1e-9 and '0.1' in t and not any('N = 0' in x or 'cancel' in x for x in t), f'51 000 kN at 0.01 m and 0.1 kN at 60 degrees at the tip: N = 0.05 prints 0.1 and is drawn, no note that the loads cancel: N = {nmax}')
    # C66 a fixed support between two spans: the moment line steps by its couple, no inflection point is said there
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'fixed' : 'free'; }); m.members[1].udl.ang = 90", 'M', 1200); t = sheet(); mk_ = J("() => [__lab.st.marks.infl.length, __lab.st.marks.ext.length]")
    ok(mk_ == [0, 0] and 'M = 0: inflection' not in t and {'−125.0', '125.0', '250.0 kNm'} <= t, f'A and C free, B fixed, 10 kN/m down and up: −125.0 and 125.0 at B, couple 250.0 kNm, no inflection mark: {mk_} {sorted(x for x in t if "125" in x or "250" in x or "inflection" in x)}')
    pre('two-span', "m.nodes.find(n => n.lbl === 'B').sup = 'fixed'", 'M', 1200); mk = marks()
    ok(any(e[0] == 0 and e[1] == 5 and e[2] == -31.25 for e in mk), f'two spans with the same load and B fixed: its couple is zero, the line runs through and the peak at B is marked: {mk}')
    # C67 a reaction that prints other than 0.0 is drawn
    pre('simple-p', "m.loads[0].P = 0.1; m.loads[0].a = 3"); rl = rl_(); rv = J("() => __lab.st.sol.reactions.map(r => r.Ry)")
    ok(rl == ['0.1 kN', '0.1 kN'], f'0.1 kN at midspan: both reactions of 0.05 kN are drawn as 0.1 kN: {rl} {rv}')
    # C68 Compare: the kept value at a place between two samples is worked out there, not read off a straight line
    pre('truss', "m.loads = []; Object.assign(m.members[0].udl, { on: true, w1: 0, w2: 99.9, ang: 0 })", 'N', 1300); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { __lab.st.model.loads = [{ id: 1, m: 0, a: 0.68, P: 10, ang: 0 }]; __lab.resolve('tween'); }"); pg.wait_for_timeout(1500); t = sheet()
    ok('152.2 (142.2)' in t and not any('142.1' in x for x in t), f'kept: 0 to 99.9 kN/m along the first chord; now 10 kN at 0.68 m: the kept force there is 142.2: {sorted(x for x in t if "(" in x)}'); pg.click('#cmp'); pg.wait_for_timeout(200)
    # C13 Compare: the kept force of a bar keeps its steps when the present force has none
    pre('truss', "m.loads = [[0.75, 500, 0], [1.5, 1000, 180], [2.25, 500, 0]].map((l, i) => ({ id: 50 + i, m: 1, a: l[0], P: l[1], ang: l[2] }))", 'N', 1300); pg.click('#cmp'); pg.wait_for_timeout(200)
    J("() => { __lab.st.model.loads = []; __lab.resolve('tween'); }"); pg.wait_for_timeout(1500); t = sheet()
    ok('(500.0)' in t and '(−500.0)' in t and not any(' to ' in x for x in t), f'kept: 500, 1000 and 500 kN along the second chord; now no load: the kept −500.0 and 500.0 stand in brackets at their places: {sorted(x for x in t if "(" in x)}'); pg.click('#cmp'); pg.wait_for_timeout(200)
    # C39 the size of the loads along a beam has no part in the question whether it deflects
    pre('two-span', "L.st.sec = 0; m.nodes[1].sup = 'free'; m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 0.33, P: 0.1, ang: -90 }]; for (let i = 0; i < 3300; i++) m.loads.push({ id: 10 + i, m: 1, a: 5, P: 1000, ang: 180 })", 'D', 1600); z = D_(); t = sheet()
    ok(not z['zero'] and abs(z['D'] - 0.0518) < 1e-4 and '0.1' in t and 'w = 0' not in t and '3300 × 1000.0 kN' in t, f'10 m beam, 3300 loads of 1000 kN along it at the roller and 0.1 kN across at 0.33 m: the deflection of 0.05 mm is drawn: {z}')
    # C44 two tops of the movement a rounding step apart: the larger one carries the number
    pre('truss', "L.st.sec = 0; Object.assign(m.members[0].udl, { on: true, w1: 192.8, w2: 192.8, ang: 0 }); m.loads = [{ id: 1, m: 0, a: 0.67, P: 461.7, ang: 180 }, { id: 2, m: 0, a: 3, P: 186.1, ang: 180 }]", 'D', 1300); t = sheet(); tp = J("() => { const q = __lab.st.sol.mem[0]._top; return q ? [Math.round(q.x * 1e5) / 1e5, Math.round(q.v * 1e10) / 1e7] : null; }")
    ok('0.2 mm' in t and '0.1 mm' not in t and tp == [2.03475, 0.150004], f'IPE 200 chord with 192.8 kN/m to the right and 461.7 and 186.1 kN to the left: 0.150004 mm at 2.03475 m, written 0.2 mm: {tp} {sorted(x for x in t if "mm" in x)}')
    # C45 the largest deflection between a load and the joint 4 cm away
    pre('two-span', "L.st.sec = 2; m.nodes[1].sup = 'free'; m.members.forEach(k => { k.udl.on = false; }); m.loads = [{ id: 1, m: 0, a: 4.96, P: 35, ang: -90 }]", 'D', 1300); t = sheet(); wt = J("() => (__lab.st.sol.mem[0]._wt || []).map(q => [Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e9) / 1e6])")
    ok('41.6' in t and wt == [[4.986738, 41.550098]], f'10 m beam of IPE 300, 35 kN at 4.96 m: 41.550 mm at 4.9867 m, written 41.6: {wt} {sorted(x for x in t if x.startswith("41."))}')
    J("() => { __lab.st.sec = 2; }")
    # C42 / C40 the two rules as they read now, with the numbers behind them
    pre('truss', '', 'V'); t = learn(); ok('balance the reaction and a load that stands on the joint' in t and 'A load on a pin goes straight into its reaction, and no bar gets a force from it.' in t, 'truss: the rule on a support names the load on the joint')
    pre('truss', "m.loads = [{ id: 9, m: 0, a: 0, P: 20, ang: -90 }]", 'N'); t = sheet(); nb = J("() => Math.max(...__lab.st.sol.mem.map(M => Math.max(...Array.from(M.smp.N, Math.abs))))")
    ok('N = 0 in every member' in t and rl_() == ['20.0 kN'] and nb < 1e-9, f'20 kN on the pin A of the truss: reaction 20.0 kN, no force in any bar: {rl_()} {nb}')
    c40 = "m.nodes[1].hinge = m.nodes[2].hinge = true; m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 4, P: 100, ang: 180 }, { id: 2, m: 2, a: 0, P: 100, ang: 0 }]"
    nbar = lambda: J("() => { const M = __lab.st.sol.mem[1]; return [__lab.FS.forcesAt(M, M.L / 2, -1).N, Math.hypot(__lab.st.sol.u[3 * M.n2] - __lab.st.sol.u[3 * M.n1], __lab.st.sol.u[3 * M.n2 + 1] - __lab.st.sol.u[3 * M.n1 + 1]) * 1000]; }")
    pre('portal-g', c40, 'D', 1200); t = learn(); n1_ = nbar(); pre('portal-g', c40 + "; m.members[0].sec = m.members[2].sec = 3", 'D', 1200); n2_ = nbar()
    ok('That part does not follow 1/EI: it changes only as far as the force N in the bar changes with the stiffness.' in t and 'stays as it is' not in t and abs(n1_[0] - 99.70963) < 1e-5 and abs(n2_[0] - 99.43651) < 1e-5 and abs(n1_[1] - 0.706034) < 1e-6 and abs(n2_[1] - 0.704100) < 1e-6, f'corners hinged, 100 kN outward: with columns of IPE 360 instead of IPE 300 the bar force goes from 99.70963 to 99.43651 kN and its change of length with it, and the rule says so: {n1_} {n2_}')
    # --- the points of review 07
    J("() => { __lab.st.sec = 2; document.querySelector('#sec').value = 2; }")
    # C44 a top of the movement between two loads 1 cm apart, with a top on either side of it
    pre('truss', "L.st.sec = 0; Object.assign(m.members[0].udl, { on: true, w1: 500, w2: 500, ang: 0 }); m.loads = [[0.01, 599.1, 180], [1.52, 4.5, 180], [1.53, 4.5, 180], [2.25, 49.7, 0], [2.99, 599.1, 180], [3, 183.6, 180]].map((l, i) => ({ id: 1 + i, m: 0, a: l[0], P: l[1], ang: l[2] }))", 'D', 1300); t = sheet(); tp = J("() => { const q = __lab.st.sol.mem[0]._top; return q ? [Math.round(q.x * 1e5) / 1e5, Math.round(q.v * 1e12) / 1e9] : null; }")
    ok('1.0 mm' in t and '0.9 mm' not in t and tp == [1.525, 0.950000418], f'IPE 200 chord with 500 kN/m and six loads along it: 0.950000418 mm at 1.525 m, between the loads at 1.52 and 1.53 m, written 1.0 mm: {tp} {sorted(x for x in t if "mm" in x)}')
    # C45 two turns of the deflection 14 mm apart, on either side of a zero of the moment
    pre('simple-p', "L.st.sec = 0; m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; m.loads = [[0.5, 1000, 90], [0.5, 999.9, 90], [1.5, 1000, -90], [2, 500, 90]].map((l, i) => ({ id: 1 + i, m: 0, a: l[0], P: l[1], ang: l[2] }))", 'D', 1300); t = sheet(); wt = J("() => (__lab.st.sol.mem[0]._wt || []).map(q => [Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e9) / 1e6])")
    ok('−10.2' in t and wt == [[0.992929, -10.209129], [1.007071, -10.2091]], f'6 m cantilever of IPE 200 with 1999.9 kN up at 0.5 m, 1000 kN down at 1.5 m and 500 kN up at 2 m: the slope is zero at 0.992929 and 1.007071 m, both written −10.2: {wt}')
    J("() => { __lab.st.sec = 2; }")
    # C64 the probe takes the nearest of two load arrows 7 px apart
    pre('bent', "m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 1, P: 100, ang: -90 }, { id: 2, m: 1, a: 1.05, P: 200, ang: -90 }]", 'V', 1200)
    gap = J("() => { const a = __lab.HS.loads.get(1), b = __lab.HS.loads.get(2); return Math.hypot(a.hx - b.hx, a.hy - b.hy); }")
    t1 = onload(1); t2 = onload(2)
    ok(gap < 9 and 'x = 1.05 m' in t2 and '0.0 kNm' in t2 and {'200.0 kN', '0.0 kN'} <= t2 and 'x = 1.00 m' not in t2, f'arm with 100 kN at 1.00 m and 200 kN at 1.05 m, both downward, arrows {gap:.1f} px apart; pointer on the 200 kN arrow: the probe reads 1.05 m, V = 200 | 0 kN, M = 0.0 kNm: {sorted(x for x in t2 if "x = " in x or "kN" in x)}')
    ok('x = 1.00 m' in t1 and '−10.0 kNm' in t1 and {'300.0 kN', '200.0 kN'} <= t1, f'pointer on the 100 kN arrow: the probe reads 1.00 m, V = 300 | 200 kN, M = −10.0 kNm: {sorted(x for x in t1 if "x = " in x or "kN" in x)}')
    # C66 a fixed support whose couple prints 0.0: the moment line still steps there, no inflection point across the step
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'fixed' : 'free'; }); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 0, P: 1, ang: -90 }, { id: 2, m: 0, a: 2.51, P: 2, ang: 90 }, { id: 3, m: 1, a: 2.49, P: 2, ang: -90 }, { id: 4, m: 1, a: 5, P: 1, ang: 90 }]", 'M', 1200); t = sheet()
    mb = J("() => [__lab.FS.forcesAt(__lab.st.sol.mem[0], 5, -1).M, __lab.FS.forcesAt(__lab.st.sol.mem[1], 0, 1).M, __lab.st.sol.reactions[1].Mz].map(v => Math.round(v * 1e6) / 1e6)")
    ok(mb == [-0.02, 0.02, -0.04] and J("() => __lab.st.marks.infl.length") == 0 and 'M = 0: inflection' not in t, f'B fixed, loads of 1 and 2 kN that nearly balance: M = −0.020 and +0.020 kNm beside B, couple −0.040 kNm, no inflection mark at B: {mb}')
    # C71 a line is zero only when its largest value is: the peaks between the stations count
    c71 = "m.nodes[1].hinge = m.nodes[2].hinge = true; m.members.forEach(k => k.udl.on = false); Object.assign(m.members[1].udl, { on: true, w1: 400, w2: 400, ang: -90 }); m.loads = []; for (let k = 1; k < 160; k++) m.loads.push({ id: k, m: 1, a: Math.round(5 * k) / 100, P: 20, ang: 90 })"
    pre('portal-g', c71, 'M', 1600); t = sheet(); own = J("() => Math.max(...Array.from(__lab.st.sol.mem[1].smp.M, Math.abs))"); ry = [round(r[1], 6) for r in reac()]
    ok(not J("() => __lab.st.zero.M") and abs(own - 0.125) < 1e-6 and ry == [10, 0, 0, 10] and '0.1' in t and not any('M = 0' in x for x in t), f'roof with hinged corners, 400 kN/m down and 20 kN up every 5 cm: reactions 10 and 10 kN, M = 0.125 kNm half way between two loads, drawn as 0.1: largest moment {own}, {sorted(x for x in t if "M = 0" in x or x == "0.1")}')
    # C72 the area rule of the moment across a fixed support
    pre('two-span', "m.nodes.find(n => n.lbl === 'B').sup = 'fixed'", 'M'); t = learn(); pre('two-span', '', 'M'); t0 = learn()
    ok('A fixed support between them adds a step by its fixing moment, which counts counter-clockwise: M right of B = M left of B − MBy.' in t and 'adds a step' not in t0, 'beam with a fixed support between two spans: the rule on the change of M names the step at that support and its sign; without such a support it does not')
    # C73 a typed place on a half centimetre is rounded as every printed value
    pre('cantilever', 'm.loads[0].P = 1000; m.loads[0].a = 2'); g = geo(); pg.mouse.click(cb[0] + g['hx'] + 5, cb[1] + g['hy'] - 30); pg.wait_for_timeout(300)
    typ('#pp-a', '1.005'); n_ = lim(); a_ = J("() => __lab.st.model.loads[0].a"); mz = J("() => Math.round(__lab.st.sol.reactions[0].Mz * 1e6) / 1e6")
    ok(a_ == 1.01 and n_ is not None and n_[0] == 'Taken as 1.01 m.' and abs(abs(mz) - 1010) < 1e-6, f'1.005 m typed for 1000 kN on the cantilever: taken as 1.01 m, fixing moment 1010.0 kNm: {a_} {n_} {mz}')
    typ('#pp-P', '12.35'); n_ = lim(); P_ = J("() => __lab.st.model.loads[0].P"); ok(P_ == 12.4 and n_ is not None and n_[0] == 'Taken as 12.4 kN.', f'12.35 kN typed: taken as 12.4 kN: {P_} {n_}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # C74 a column whose foot is free hangs: the rule says where its load goes
    pre('portal-g', "m.nodes.find(n => n.lbl === 'B').sup = 'free'; m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 2, a: m.nodes[m.members[2].n1].lbl === 'B' ? 0 : 4, P: 20, ang: -90 }]", 'N', 1200); t = learn()
    nB = J("() => { const M = __lab.st.sol.mem[2]; return Math.round(__lab.FS.forcesAt(M, M.L / 2, -1).N * 1e6) / 1e6; }"); rA = reac()[0]
    ok('A column whose foot is free hangs from its head: a load on it goes up the column and into the members at its head.' in t and nB == 20 and rA[1] == 20 and abs(abs(rA[2]) - 160) < 1e-6, f'portal with B free and 20 kN hung on B: the column is in 20 kN tension, A takes 20 kN and 160 kNm, and the rule says that the column hangs: N = {nB}, A = {rA}')
    pre('portal-g', '', 'N'); ok('hangs from its head' not in learn() and 'A column that stands on a support passes its axial force to it' in learn(), 'portal on its two supports: the rule speaks of columns that stand on a support only')
    # C75 what the panel names as a remedy of a mechanism makes the structure stable
    c75 = "m.nodes.forEach(n => { if (n.lbl === 'A' || n.lbl === 'B' || n.lbl === 'C') n.sup = 'roller'; if (n.lbl === 'D') n.hinge = true; })"
    pre('two-bay', c75); t = pg.inner_text('#learn .badge')
    try1 = lambda js: (pre('two-bay', c75 + '; ' + js), J("() => __lab.st.sol.ok"))[1]
    ok('2 movements are free' in t and 'One change makes it stable: A fixed.' in t and 'close' not in t and try1("m.nodes.find(n => n.lbl === 'A').sup = 'fixed'") and not try1("m.nodes.find(n => n.lbl === 'D').hinge = false") and not try1("m.nodes.find(n => n.lbl === 'B').sup = 'pin'") and try1("m.nodes.find(n => n.lbl === 'D').hinge = false; m.nodes.find(n => n.lbl === 'B').sup = 'pin'"), f'two-bay frame on three rollers with a hinge at D: the panel names A fixed, and that makes it stable; the hinge closed alone or a pin at B alone do not, both together do: {t!r}')
    pre('gerber', "m.nodes.find(n => n.lbl === 'C').sup = 'free'"); t = pg.inner_text('#learn .badge'); ok('One change makes it stable: the hinge at G closed, or a roller at C.' in t, f'Gerber beam without its support C: {t!r}')
    c3 = "m.nodes.forEach(n => { if (n.cs) n.sup = 'free'; if (n.ch) n.hinge = true; })"
    pre('three-hinge', c3); t = pg.inner_text('#learn .badge')
    try3 = lambda js: (pre('three-hinge', c3 + '; ' + js), J("() => __lab.st.sol.ok"))[1]
    a_, c_, b_ = "m.nodes.find(n => n.lbl === 'A').sup = 'pin'", "m.nodes.find(n => n.lbl === 'C').hinge = false", "m.nodes.find(n => n.lbl === 'B').sup = 'fixed'"
    ok('Three changes together make it stable: a pin at A, the hinge at C closed and B fixed.' in t and try3(a_ + '; ' + c_ + '; ' + b_) and not try3(a_ + '; ' + c_) and not try3(a_ + '; ' + b_) and not try3(c_ + '; ' + b_), f'three-hinged frame without supports and with hinges at C, G and D: the three named changes together make it stable, any two of them do not: {t!r}')
    pre('truss', "m.nodes.forEach(n => { n.sup = 'free'; })"); t = pg.inner_text('#learn .badge')
    ok('Two changes together make it stable: a roller at A and a pin at B.' in t and 'add supports' not in t, f'truss without supports: {t!r}')
    # C76 a load 3 mm before a joint and a load on the joint are two loads
    pre('truss', "m.loads = [{ id: 1, m: 9, a: 4.24, P: 1000, ang: -90 }, { id: 2, m: 9, a: Math.sqrt(18), P: 1000, ang: -90 }]"); t = sheet(); lb = J("() => [...__lab.HS.loads.values()].map(g => !!g.lb)")
    ok(lb == [True, True] and not any('×' in x for x in t), f'1000 kN at 4.24 m of the diagonal and 1000 kN on its joint: two values, not one with a number: {lb} {sorted(x for x in t if "kN" in x)}')
    # C77 a reaction that points downward and prints other than 0.0 carries its note
    pre('overhang', "m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 0.5, P: 0.5, ang: -90 }]; for (let i = 0; i < 51; i++) m.loads.push({ id: 10 + i, m: 0, a: 5, P: 1000, ang: -90 })"); t = learn(); ra = round(reac()[0][1], 6)
    ok(ra == -0.05 and 'The reaction at A points downward' in t and 'would lift off' in t, f'overhang with 51 000 kN on B and 0.5 kN beyond it: A = −0.05 kN, drawn as 0.1 kN downward, and the note on lifting off stands: {ra}')
    # C78 the moment line turns where the shear reaches zero, not at the load a hair before it
    pre('simple-p', "Object.assign(m.members[0].udl, { on: true, w1: 100, w2: 100, ang: -90 }); m.loads = [{ id: 1, m: 0, a: 2.6, P: 92.3, ang: -90 }]"); t = sheet(); mk = marks()
    ok(len(mk) == 1 and abs(mk[0][1] - 2.6) < 1e-3 and not mk[0][3] and 'V = 0: peak of M' in t and 'V changes sign: peak of M' not in t and '578.0' in t, f'100 kN/m and 92.3 kN at 2.60 m: the shear is 0.003 kN behind the load and reaches zero 0.03 mm further; the peak of 578.0 kNm is marked as a smooth one: {mk}')
    # C79 the change of length of a bar in a frame takes the mean of N
    pre('portal-g', c40 + "; Object.assign(m.members[1].udl, { on: true, w1: 20, w2: 20, ang: 0 })", 'D', 1200); t = learn()
    nn = J("() => { const M = __lab.st.sol.mem[1]; return [__lab.FS.forcesAt(M, 0, 1).N, __lab.FS.forcesAt(M, M.L, -1).N, (__lab.st.sol.u[3 * M.n2] - __lab.st.sol.u[3 * M.n1]) * 1000]; }")
    ok('with N its mean value along the bar where a load along it makes it vary' in t and abs((nn[0] + nn[1]) / 2 * 8 / 1129.8 - nn[2]) < 1e-6, f'roof bar with 20 kN/m along it: its change of length is the mean of its end forces times L/EA, and the rule says so: {nn}')
    # C82 the place the button Loads offers keeps clear of a load near the middle
    pre('simple-p', 'm.loads[0].a = 3.1'); pg.click('#loads'); pg.wait_for_timeout(300)
    bt = J("() => { const b = document.querySelector('#pop button[data-act=\"add\"]'); return b ? b.textContent : null; }"); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    ok(bt == 'Add point load at 1.55 m from A', f'button Loads with a load at 3.10 m, 10 cm from the middle of the 6 m beam: within 2 % of the length, so the middle of the widest gap is offered: {bt!r}')
    # C83, C84 the footer names the curve its factor belongs to and says when a movement is beyond the model
    pre('simple-w', '', 'D'); mag = pg.inner_text('#mag'); ok(mag.startswith('Deflected beam drawn ×') and not pg.query_selector('#learn .card.far'), f'beam: the factor under the drawing is that of the deflected beam drawn on the structure: {mag!r}')
    pre('portal-s', '', 'D'); mag = pg.inner_text('#mag'); ok(mag.startswith('Deformed shape drawn ×') and not pg.query_selector('#learn .card.far'), f'frame: {mag!r}')
    pre('simple-p', "m.nodes[0].sup = 'fixed'; m.nodes[1].sup = 'free'; m.loads = [{ id: 1, m: 0, a: 6, P: 0.1, ang: 0 }]; for (let i = 0; i < 17; i++) m.loads.push({ id: 10 + i, m: 0, a: 6, P: 1000, ang: -90 })", 'D', 1200); mag = pg.inner_text('#mag')
    far = pg.inner_text('#learn .card.far') if pg.query_selector('#learn .card.far') else ''
    ok('Member A–B turns by 17438.3 mrad at its steepest place: more than 50 mrad, a twentieth of a radian.' in far and 'stretched' not in far and 'first-order theory' in far and len(mag) < 40, f'6 m cantilever that moves 69.8 m: the panel says that this is outside the theory of the page and gives the rotation; the line under the drawing stays short: {far!r} {mag!r}')
    pre('cantilever', 'm.loads[0].P = 195', 'D', 900); a1 = bool(pg.query_selector('#learn .card.far')); d1 = J('() => __lab.st.sol.max.turn')
    pre('cantilever', 'm.loads[0].P = 194.9', 'D', 900); a0 = bool(pg.query_selector('#learn .card.far')); d0 = J('() => __lab.st.sol.max.turn')
    d0 = d0 or 0; d1 = d1 or 0
    ok(a1 and not a0 and d1 > 0.05 > d0 and abs(d1 - 195 * 9 / (2 * 17547.6)) < 1e-12, f'the card stands from 50 mrad on (3 m cantilever, IPE 300: the tip turns by P L^2 / (2 EI)): 194.9 kN {d0 * 1000:.3f} mrad without, 195 kN {d1 * 1000:.3f} mrad with: {a0} {a1}')
    # --- the points of review 08
    F_ = "const F = (mi, x, sd) => __lab.FS.forcesAt(__lab.st.sol.mem[mi], x, sd)"
    r6 = lambda v: [round(x, 6) for x in v]
    # C72 the step of the moment line at a fixed support between two spans, with its sign: M right = M left − M_By
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'fixed' : 'free'; }); m.members[1].udl.ang = 90"); t = learn()
    mb = r6(J("() => { " + F_ + "; return [F(0, 5, -1).M, F(1, 0, 1).M, __lab.st.sol.reactions[1].Mz]; }"))
    ok(mb == [-125, 125, -250] and mb[1] == mb[0] - mb[2] and 'M right of B = M left of B − MBy.' in t and 'which counts counter-clockwise' in t, f'A and C free, B fixed, 10 kN/m down on the left span and up on the right: M = −125 kNm left of B and +125 kNm right of it, fixing moment −250 kNm; the rule gives the step with its sign, 125 = −125 − (−250): {mb}')
    # C75 the free movements of a mechanism are named
    pre('two-bay', c75); t = pg.inner_text('#learn .badge')
    mv = J("() => { const L = __lab, m = JSON.parse(JSON.stringify(L.st.model)), q = L.FS.movements(m, 1e4, 1e6); return q.map(c => [c.kind, c.joints.map(j => m.nodes[j.i].lbl + ':' + Math.sign(j.dx) + ',' + Math.sign(j.dy)).join(' '), c.turns.map(t => m.nodes[m.members[t.mi].n1].lbl + m.nodes[m.members[t.mi].n2].lbl + '@' + m.nodes[t.about].lbl).join(' ')]); }")
    ok('They are: (1) the whole structure can slide sideways; (2) A can move sideways, with A–D turning about D.' in t and mv == [['slide', 'A:1,0 D:1,0 E:1,0 B:1,0 F:1,0 C:1,0', ''], ['part', 'A:1,0', 'AD@D']], f'two-bay frame on three rollers with a hinge at D: the panel names the two free movements, the frame sliding sideways and A moving sideways with A–D turning about D: {t!r} {mv}')
    pre('simple-p', "m.nodes[0].sup = 'free'; m.nodes[1].sup = 'free'"); t = pg.inner_text('#learn .badge')
    ok('3 movements are free. They are: (1) the whole beam can slide sideways; (2) it can move up and down; (3) it can turn.' in t, f'beam without supports: three movements, each named: {t!r}')
    pre('simple-p', "m.nodes[0].sup = 'roller'"); t = pg.inner_text('#learn .badge')
    ok('One restraint is missing. Nothing holds the beam sideways: it can slide.' in t and 'They are' not in t, f'beam on two rollers: one movement, said in one sentence: {t!r}')
    pre('three-hinge', c3); t = pg.inner_text('#learn .badge')
    ok('6 movements are free. They are: (1) the whole structure can slide sideways; (2) it can move up and down; (3) it can turn; and 3 more, of parts.' in t, f'three-hinged frame without supports and with three hinges: six movements, the first three named and the others counted: {t!r}')
    # C78 a zero of the shear a third of a micrometre behind a point load is the smooth peak of M, not a corner at the load
    pre('simple-p', "Object.assign(m.members[0].udl, { on: true, w1: 492.3, w2: 492.3, ang: -90 }); m.loads = [{ id: 1, m: 0, a: 2.27, P: 949.9, ang: -90 }]"); t = sheet(); mk = J("() => __lab.st.marks.ext.map(e => [e.x, e.v, !!e.jump])")
    vv = r6(J("() => { " + F_ + "; return [F(0, 2.27, -1).V, F(0, 2.27, 1).V]; }"))
    ok(len(mk) == 1 and abs(mk[0][0] - 2.270000339) < 2e-9 and not mk[0][2] and vv == [949.900167, 0.000167] and 'V = 0: peak of M' in t and 'V changes sign: peak of M' not in t and '3424.7' in t, f'492.3 kN/m and 949.9 kN at 2.27 m: V = 949.900167 | 0.000167 kN at the load and zero at 2.270000339 m; the peak of 3424.7 kNm is marked there as a smooth one: {mk} {vv}')
    # C85 a load point keeps its place and its two sides when a zero of a force falls on it
    pre('cantilever', "m.loads = [{ id: 1, m: 0, a: 1, P: 10, ang: 90 }, { id: 2, m: 0, a: 2, P: 10, ang: -90 }, { id: 3, m: 0, a: 0.5, P: 1000, ang: -90 }]", 'V')
    stn = J("() => { const S = __lab.st.sol.mem[0].smp, o = []; for (let i = 0; i < S.xs.length; i++) if (S.xs[i] === 2) o.push([S.side[i], Math.round(S.V[i] * 1e6) / 1e6]); return o; }")
    nxt = J("() => { const S = __lab.st.sol.mem[0].smp, i = S.xs.lastIndexOf(2); return [S.xs[i + 1], Math.round(S.V[i + 1] * 1e6) / 1e6]; }")
    ok(stn == [[-1, 10], [1, 0]] and nxt[0] > 2 and nxt[1] == 0, f'cantilever with 10 kN down at 2.00 m, behind it no load: the two stations at 2.00 m hold V = 10 before and 0 after the load, and the next station holds 0: {stn} {nxt}')
    pg.click('.pre[data-id="truss"]'); pg.wait_for_timeout(300); pg.select_option('#sec', label='IPE 200'); pg.wait_for_timeout(300)
    J("() => { const L = __lab, m = L.st.model; m.loads = [{ id: 1, m: 0, a: 1.8, P: 576, ang: 180 }]; Object.assign(m.members[0].udl, { on: true, w1: 480, w2: 480, ang: 0 }); L.resolve('instant'); }"); pg.click('#tab-D'); pg.wait_for_timeout(900)
    ch = J("() => { const S = __lab.st.sol.mem[0].smp, o = []; for (let i = 0; i < S.xs.length; i++) if (S.xs[i] === 1.8) o.push([S.side[i], Math.round(S.N[i] * 1e6) / 1e6, Math.round(S.dX[i] * 1e9) / 1e6, Math.round(S.dY[i] * 1e9) / 1e6, __lab.n1(Math.hypot(S.dX[i], S.dY[i]) * 1000)]); return o; }")
    ok(ch == [[-1, 0, 1.299248, -0.844511, '1.5'], [1, 576, 1.299248, -0.844511, '1.5']], f'first chord of the truss, IPE 200, 480 kN/m to the right and 576 kN to the left at 1.80 m: N steps from 0 to 576 kN at the load, which moves 1.299248 mm along and 0.844511 mm down, 1.5 mm in all: {ch}')
    pg.select_option('#sec', label='IPE 300'); pg.wait_for_timeout(200)
    # C86 in a frame the area rule holds along one member; at a joint the moments balance, and a third member steps the line
    pre('two-bay', ''); t = learn(); me = r6(J("() => { " + F_ + "; return [F(1, 5, -1).M, F(3, 0, 1).M, F(2, 0, 1).M]; }"))
    ok('Along one member the moment changes between two points by the area under the shear line. At a joint the moments balance: counted as they turn the joint, the end moments of the members that meet there add up to zero. So the line of two members in one line steps at a joint where a third member brings a moment, by that moment.' in t
       and me == [-24.768519, -23.611111, -1.157407] and abs(me[1] - me[0] - abs(me[2])) < 2e-6 and not any(e[0] == 1 and abs(e[1] - 5) < 1e-6 for e in marks()), f'two-bay frame: the roof has −24.768519 kNm left of E and −23.611111 kNm right of it, the column brings 1.157407 kNm; the rule says that the line steps there by that moment, and no mark is set at E: {me}')
    pre('portal-g', ''); t = learn(); ok('add up to zero. At a rigid corner the moment goes round the corner with the same size.' in t and 'third member' not in t, 'portal frame: no joint with three members, the rule speaks of the rigid corner')
    # the same for N: a beam held along its axis by a pin between two spans; N steps there by the reaction
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'pin' : 'roller'; }); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 5, P: 20, ang: 0 }]", 'N'); t = learn()
    nb = r6(J("() => { " + F_ + "; return [F(0, 5, -1).N, F(1, 0, 1).N, __lab.st.sol.reactions[1].Rx]; }"))
    ok(nb == [0, 20, -20] and 'N steps by what acts on the joint along the beam: N right of it = N left of it − (Fx + Px). Fx is the reaction of a support that holds the beam along its axis, a pin or a fixed support; Px is a load on the joint; both count positive to the right. A roller has no Fx: N passes it, unless a load along the beam stands on it.' in t, f'two-span beam with a pin at B, rollers at A and C and 20 kN along the beam on C: N = 0 left of B and 20 kN right of it, the reaction of B is 20 kN to the left, and the rule says that N changes at such a support: {nb}')
    pre('two-bay', '', 'N'); ok('holds the beam along its axis' not in learn(), 'frame: the rule on columns stands instead')
    # C88 the note on large displacements goes by the largest displacement along the members, also between two stations
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(300); pg.select_option('#sec', label='IPE 200'); pg.wait_for_timeout(300); far = []
    for P_ in (294.4, 294.3):
        J("(P) => { const L = __lab; L.st.model.loads = [{ id: 1, m: 0, a: 2.27, P, ang: -90 }]; L.resolve('instant'); }", P_); pg.click('#tab-D'); pg.wait_for_timeout(700)
        far.append([round(J("() => __lab.st.sol.max.D") * 1000, 6), round(J("() => __lab.FS.mostMoved(__lab.st.sol.mem[0]).x"), 6), round(J("() => Math.max(...Array.from(__lab.st.sol.mem[0].smp.dY, Math.abs))") * 1000, 6), bool(pg.query_selector('#learn .card.far'))])
    ok(far[0] == [300.012046, 2.793387, 299.997221, True] and far[1][0] < 300 and far[1][3], f'6 m beam, IPE 200, load at 2.27 m: with 294.4 kN it deflects 300.012046 mm at 2.793387 m, between two stations (largest at a station 299.997221 mm); with 294.3 kN it stays below 300 mm. The largest displacement is that of the line itself. The card stands in both states: the ends turn by far more than 50 mrad: {far}')
    pg.select_option('#sec', label='IPE 300'); pg.wait_for_timeout(200)
    # C89 Compare: a kept axial force is shown also when the present structure has none
    pre('portal-g', c40, 'N', 1200); pg.click('#cmp'); pg.wait_for_timeout(300); J("() => { __lab.st.model.loads = []; __lab.resolve('instant'); }"); pg.wait_for_timeout(700); t = sheet()
    ok('0 (99.7)' in t and J("() => __lab.st.zero.N && !__lab.st.flat.N"), f'portal with hinged corners, 100 kN outward on each corner kept, then both loads taken away: the bar shows 0 with the kept 99.7 in brackets: {sorted(x for x in t if "99" in x or x.startswith("0"))}')
    pg.click('#cmp'); pg.wait_for_timeout(400)
    pre('simple-p', "m.loads = [{ id: 1, m: 0, a: 6, P: 20, ang: 0 }]", 'M', 1200); pg.click('#cmp'); pg.wait_for_timeout(300); J("() => { __lab.st.model.loads = []; __lab.resolve('instant'); }"); pg.wait_for_timeout(1500)
    k1 = J("() => __lab.VW.plots.map(p => p.k)"); pg.click('#cmp'); pg.wait_for_timeout(1500); k0 = J("() => __lab.VW.plots.map(p => p.k)")
    ok(k1 == ['V', 'M', 'D', 'N'] and k0 == ['V', 'M', 'D'], f'beam with 20 kN along its axis kept, then unloaded: the strip of N stays on the moment tab while the state is kept, and goes when it is let go: {k1} {k0}')
    # C90 the moment line of a roof runs on through a joint where the column brings no moment
    c90 = "m.nodes.find(n => n.lbl === 'B').sup = 'free'; m.loads = []; m.members.forEach(q => { const a = m.nodes[q.n1].lbl + m.nodes[q.n2].lbl; q.udl.on = false; if (a === 'DE' || a === 'EF') Object.assign(q.udl, { on: true, w1: 10, w2: 10, ang: a === 'DE' ? -90 : 90 }); })"
    pre('two-bay', c90); inf = J("() => __lab.st.marks.infl.map(e => [e.mi, Math.round(e.x * 1e6) / 1e6])")
    ve = r6(J("() => { " + F_ + "; return [F(1, 5, -1).V, F(3, 0, 1).V, F(1, 4.99, -1).M, F(3, 0.01, 1).M, F(2, 0, 1).M]; }"))
    ok([1, 5] in inf and len(inf) == 3 and ve[:4] == [-23.161765, -23.161765, 0.231118, -0.231118] and abs(ve[4]) < 1e-9, f'two-bay frame, B free, 10 kN/m down on D–E and up on E–F: the unloaded column brings no moment, the roof moment changes sign at E (±0.231118 kNm 1 cm beside it, V = −23.161765 kN on both sides), and E is marked as an inflection point with the two others: {inf} {ve}')
    pre('two-bay', "m.loads = []; m.members.forEach(q => { const a = m.nodes[q.n1].lbl + m.nodes[q.n2].lbl; q.udl.on = false; if (a === 'DE' || a === 'EF') Object.assign(q.udl, { on: true, w1: 10, w2: 10, ang: -90 }); })"); t = sheet(); mk = marks()
    ok([1, 5.0, -25.46, True, None] in mk and '−25.5' in t, f'two-bay frame with 10 kN/m on both bays: the column in the middle brings no moment, and the peak of −25.5 kNm over it is marked as on a beam over a support: {mk}')
    # C91 a load left of the left support has a negative x in the moments about the supports
    pre('overhang', "m.nodes[0].sup = 'free'; m.nodes[1].sup = 'pin'; m.nodes[2].sup = 'roller'; m.members.forEach(q => { q.udl.on = false; }); m.loads = [{ id: 1, m: 0, a: 0, P: 10, ang: -90 }]"); t = learn(); ry = [r[1] for r in reac()]
    ok('By hand: moments about the supports' in t and 'x = place of a load, measured from B to the right: negative for a load left of B. l = distance B to C.' in t and ry == [0, 35, -25] and '(−10.0 · 5.00) / 2.00' in t, f'overhang with A free, a pin at B and a roller at C, 10 kN on A: C is pulled down with 25 kN, B carries 35 kN, and the card says that x is negative left of B: {ry}')
    pre('overhang', ''); t = learn(); ok('x = distance of a load from A, l = distance A to B.' in t and 'negative for a load left of' not in t, 'overhang as shipped: no load left of A, x stays a distance')
    # C92 the shear card states the equilibrium of the joint with the load that stands on it
    pre('cantilever', "m.loads = []; for (let i = 0; i < 101; i++) m.loads.push({ id: i + 1, m: 0, a: 0.01, P: 1000, ang: -90 }); m.loads.push({ id: 200, m: 0, a: 0, P: 0.1, ang: -90 })", 'V'); t = learn()
    v1 = r6(J("() => { " + F_ + "; return [F(0, 0, 1).V, __lab.st.sol.reactions[0].Ry]; }"))
    ok(v1 == [101000, 101000.1] and 'At A the shear starts with the reaction and the load on A: V1 = FAz − 0.1 kN.' in t and 'V1 = FAz.' not in t, f'cantilever with 101 loads of 1000 kN at 1 cm and 0.1 kN on A: V1 = 101 000.0 kN, reaction 101 000.1 kN, and the card names the load on A: {v1}')
    pre('cantilever', '', 'V'); ok('At A the shear starts with the reaction: V1 = FAz.' in learn(), 'cantilever as shipped: the shear starts with the reaction')
    # C96 the direction of a point load: steps of 15 degrees by its tail, four directions in its menu
    pre('simple-p', ''); import math
    find_tail = lambda: J("() => { const L = __lab; for (let y = 0; y < 420; y += 2) for (let x = 100; x < 1200; x += 2) { const h = L.pick(x, y); if (h && h.type === 'tail') return [x, y]; } return null; }")
    r = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return { x: c.x, y: c.y, hx: V.ox + 2 * V.s, hy: V.yB }; }"); got = []
    for turn in (22, 41, 67):                           # the knob is taken where the picker first finds it, so the turn is about that many degrees
        tail = find_tail()
        if not tail: break
        hx, hy = r['hx'], r['hy']; rad = math.hypot(tail[0] - hx, tail[1] - hy); a0 = math.atan2(tail[1] - hy, tail[0] - hx)
        pg.mouse.move(r['x'] + tail[0], r['y'] + tail[1]); pg.mouse.down()
        for k in range(1, 9): a = a0 + math.radians(turn) * k / 8; pg.mouse.move(r['x'] + hx + rad * math.cos(a), r['y'] + hy + rad * math.sin(a)); pg.wait_for_timeout(30)
        pg.mouse.up(); pg.wait_for_timeout(300); got.append(J("() => __lab.st.model.loads[0].ang"))
    ok(len(got) == 3 and all(g % 15 == 0 for g in got) and len(set(got + [-90])) == 4, f'the tail of a load turned three times by odd angles (about 22°, 41° and 67°): each time the load stands at a multiple of 15°, a new one: {got}')
    pre('simple-p', ''); hit = J("""() => { const L = __lab; for (let y = 60; y < 260; y += 3) for (let x = 250; x < 1150; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') return [x, y]; } return null; }""")
    box = pg.query_selector('#cv').bounding_box(); pg.mouse.click(box['x'] + hit[0], box['y'] + hit[1]); pg.wait_for_timeout(300)
    dirs = J("() => [...document.querySelectorAll('#pop button[data-ang]')].map(b => +b.dataset.ang)"); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    ok(dirs == [-90, 0, 90, 180], f'the menu of a point load offers four directions: down, right, up, left: {dirs}')
    # --- version 13: lengths, profiles, the window of the section, rotation, displacement and deflection
    midm = lambda mi, t=0.5: J(f"() => {{ const g = __lab.MG[{mi}], r = document.querySelector('#cv').getBoundingClientRect(); return [r.left + g.ax + (g.bx - g.ax) * {t}, r.top + g.ay + (g.by - g.ay) * {t}]; }}")
    nodes = lambda: J("() => __lab.st.model.nodes.map(n => [n.x, n.y])")
    lds = lambda: J("() => __lab.st.model.loads.map(l => [l.m, l.a])")
    note = lambda: J("() => { const w = document.querySelector('#pop small.lim'); return w ? w.textContent : ''; }")
    nundo = lambda: J("() => __lab.st.undo.length")
    dims = lambda: J("() => { const r = document.querySelector('#cv').getBoundingClientRect(); return __lab.HS.dims.map(d => ({ x: r.left + (d.b[0] + d.b[2]) / 2, y: r.top + (d.b[1] + d.b[3]) / 2, ax: d.ax, gi: d.gi, load: d.load })); }")
    poptxt = lambda: pg.inner_text('#pop').replace('\n', ' | ')
    def openm(mi, t=0.5):
        pg.keyboard.press('Escape'); pg.mouse.move(5, 5); pg.wait_for_timeout(150); x, y = midm(mi, t); pg.mouse.click(x, y); pg.wait_for_timeout(350)
    # the length of a member is typed in its menu; the loads keep their share of it
    pre('simple-p', ''); u0 = nundo(); openm(0, 0.7)
    ok(J("() => document.querySelector('#pp-len').value") == '6' and 'Add point load at 4.20 m from A' in poptxt(), f'menu of the beam: its length of 6 m can be typed: {poptxt()[:120]}')
    for v in ('1', '12', '9'): typ('#pp-len', v)
    ok(nodes() == [[0, 0], [9, 0]] and lds() == [[0, 3]] and nundo() == u0 + 1 and 'Add point load at 6.30 m from A' in poptxt(), f'length typed 1, then 12, then 9: the beam is 9 m long, the load stands at 3.00 m (2 of 6, not what the 1 m left of it), one step back, and the button offers 6.30 m: {nodes()} {lds()} {nundo() - u0}')
    leave('#pp-len'); typ('#pp-len', '0.2'); n_ = note(); ok(nodes() == [[0, 0], [9, 0]] and n_ == 'From 0.50 to 30.00 m. It stays 9.00 m.' and J("() => document.querySelector('#pp-len').classList.contains('bad')"), f'9 m confirmed, then 0.2 m typed: not taken, and the menu says why: {n_!r}')
    typ('#pp-len', '30.5'); ok(nodes() == [[0, 0], [9, 0]] and 'It stays 9.00 m' in note(), '30.5 m typed: not taken')
    typ('#pp-len', '7.256'); ok(nodes() == [[0, 0], [7.26, 0]] and lds() == [[0, 2.42]] and note() == 'Taken as 7.26 m.', f'7.256 m typed: taken as 7.26 m, the load at 2.42 m: {nodes()} {lds()} {note()!r}')
    leave('#pp-len'); ok(J("() => document.querySelector('#pp-len').value") == '7.26', 'the field that is left shows 7.26')
    t = learn(); ok('Reset brings the lengths and profiles of the example back.' in t and 'Drag the load along the beam' in t, 'after a change of length the card Try keeps its tips and names Reset')
    pg.keyboard.press('Escape'); pg.click('#undo'); pg.wait_for_timeout(400); ok(nodes() == [[0, 0], [6, 0]] and lds() == [[0, 2]] and 'Reset brings the lengths' not in learn(), f'one step back: 6 m and the load at 2 m again: {nodes()} {lds()}')
    # a step of the grid moves every joint beyond it; a column gets its height
    pre('two-bay', ''); openm(1); typ('#pp-len', '7.5')
    ok(nodes() == [[0, 0], [0, 4], [7.5, 4], [7.5, 0], [12.5, 4], [12.5, 0]] and lds() == [[3, 2.5]], f'two-bay frame, first bay 7.5 m: the middle column and the right bay move along, the load of the right bay keeps its place: {nodes()} {lds()}')
    openm(0); typ('#pp-len', '6'); ok([n[1] for n in nodes()] == [0, 6, 6, 0, 6, 0], f'left column 6 m: every column is 6 m high: {nodes()}')
    ok(J("() => __lab.st.sol.ok && __lab.st.sol.limit === 'exact'"), 'the frame is solved with its rigid members taken exactly')
    # an inclined member has no length of its own; a dimension of the drawing is typed
    pre('truss', '', 'N'); openm(9); ok(J("() => !document.querySelector('#pp-len')") and '4.24 m' in poptxt(), f'diagonal of the truss: its length is shown, not typed: {poptxt()[:60]}')
    openm(1); ok(J("() => document.querySelector('#pp-len').value") == '3', 'a chord bar: its length can be typed')
    pg.keyboard.press('Escape'); pg.mouse.move(5, 5); pg.wait_for_timeout(300); d = dims()
    ok([q['ax'] for q in d] == ['x', 'x', 'x', 'x', 'y'] and all(q['gi'] >= 0 and not q['load'] for q in d), f'truss: four dimensions along x and one along y, each a step between joints: {[(q["ax"], q["gi"]) for q in d]}')
    pg.mouse.move(d[4]['x'], d[4]['y']); pg.wait_for_timeout(250); ok(pg.inner_text('#hint') == 'Click: type this length.', 'the pointer on a dimension: the hint says that it can be typed')
    pg.mouse.click(d[4]['x'], d[4]['y']); pg.wait_for_timeout(300); ok(poptxt().startswith('Dimension') and 'Height' in poptxt() and J("() => document.querySelector('#pp-len').value") == '3', f'a click on the height of the truss opens its dimension: {poptxt()[:80]}')
    typ('#pp-len', '4.5'); pg.keyboard.press('Escape'); pg.mouse.move(5, 5); pg.wait_for_timeout(300); d = dims()
    pg.mouse.click(d[1]['x'], d[1]['y']); pg.wait_for_timeout(300); typ('#pp-len', '6'); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    cut = J("() => { const c = __lab.st.hand[0] && __lab.st.hand[0].cut; return c && [c.xa, c.xb, c.h, c.xT, c.xB]; }"); t = learn()
    ok(nodes() == [[0, 0], [3, 0], [9, 0], [12, 0], [15, 0], [3, 4.5], [9, 4.5], [12, 4.5]] and lds() == [[0, 3], [1, 6], [2, 3]] and cut == [3, 9, 4.5, 9, 3] and 'By hand: method of sections' in t and 'computed' not in t and t.count('\u2713') >= 3,
       f'truss 4.5 m high with a second panel of 6 m: the loads stay on their joints, the cut follows its panel and the three bar forces of the method of sections agree with the analysis: {nodes()} {lds()} {cut}')
    # on a beam a dimension that ends at a load leads to that load
    pre('simple-p', ''); pg.mouse.move(5, 5); pg.wait_for_timeout(250); d = dims()
    ok(len(d) == 2 and all(q['gi'] < 0 and q['load'] == 1 for q in d), f'simple beam with a load: both dimensions end at the load: {d}')
    pg.mouse.move(d[0]['x'], d[0]['y']); pg.wait_for_timeout(250); h_ = pg.inner_text('#hint'); pg.mouse.click(d[0]['x'], d[0]['y']); pg.wait_for_timeout(300)
    ok(h_ == 'Click: the place of this load.' and poptxt().startswith('Point load') and J("() => document.querySelector('#pp-a').value") == '2', f'a click on a = 2.00 m opens the menu of the load with its place: {h_!r} {poptxt()[:40]}')
    # a kept state belongs to the lengths it was kept with
    pre('simple-w', ''); pg.click('#cmp'); pg.wait_for_timeout(200); openm(0); typ('#pp-len', '8')
    ok(pg.get_attribute('#cmp', 'aria-pressed') == 'false' and J("() => __lab.st.ghost === null") and pg.inner_text('#hint').startswith('Compare is off'), f'Compare on, then another length: Compare is off and the page says so: {pg.inner_text("#hint")!r}')
    # a profile for one member; the structure keeps its section
    pre('portal-g', ''); openm(0); opts = J("() => [...document.querySelectorAll('#pp-sec option')].map(o => o.textContent)")
    ok(opts[0] == 'as the structure (IPE 300)' and opts[1:] == ['IPE 200', 'IPE 240', 'IPE 300', 'IPE 360', 'IPE 400', 'HEB 200', 'HEB 300'], f'menu of a column: profile as the structure, or one of the seven: {opts}')
    u0 = nundo(); pg.select_option('#pp-sec', '6'); pg.wait_for_timeout(500); k = J("() => { const k = __lab.st.model.members[0]; return [k.sec, k.kf, k.ka]; }")
    ok(k[0] == 6 and abs(k[1] - 25160 / 8356) < 1e-12 and abs(k[2] - 149.1 / 53.8) < 1e-12 and nundo() == u0 + 1 and J("() => __lab.st.sec") == 2, f'column A–C with HEB 300: its stiffness is that of its profile, the section of the structure stays IPE 300, one step back: {k}')
    sw = lambda: pg.inner_text('#secw summary').replace('\n', ' ')
    ok('HEB 300' in sw() and 'profile of member A' in sw(), f'while its menu is open the window shows the profile of the column: {sw()!r}')
    openm(2); pg.select_option('#pp-sec', '6'); pg.wait_for_timeout(500); pg.keyboard.press('Escape'); pg.mouse.move(5, 5); pg.wait_for_timeout(900); t = sheet()
    ok('HEB 300' in t and '\u221273.9' in t and '\u221264.0' not in t and sw().startswith('IPE 300') and 'section of the structure' in sw(), f'both columns HEB 300: their name stands beside them, the corner moment grows from 64.0 to 73.9 kNm, and the window shows IPE 300 again: {sorted(x for x in t if x.startswith("−"))} {sw()!r}')
    t = learn(); ok('17\u2009547.6 / 52\u2009836 · 4.00 / 8.00' in t and 'EIb and EIc: bending stiffness of the beam and of a column.' in t.replace('\n', ''), 'the hand card of the portal takes its stiffness ratio from the two bending stiffnesses')
    x, y = midm(0, 0.4); pg.mouse.move(x, y); pg.wait_for_timeout(300); ok('HEB 300' in sw() and 'profile of member' in sw(), f'the pointer on the column: the window shows HEB 300: {sw()!r}'); pg.mouse.move(5, 5)
    pg.select_option('#sec', '0'); pg.wait_for_timeout(400); k = J("() => { const k = __lab.st.model.members[0]; return [k.sec, k.kf]; }"); ok(k[0] == 6 and abs(k[1] - 25160 / 1943) < 1e-12, f'section of the structure IPE 200: the columns keep HEB 300: {k}')
    pg.click('#undo'); pg.click('#undo'); pg.click('#undo'); pg.wait_for_timeout(400); ok(J("() => __lab.st.model.members.every(k => k.sec === null) && __lab.st.sec === 2"), 'three steps back: no profile of its own, IPE 300')
    # the one member of a beam has the section of the structure
    pre('simple-p', ''); openm(0, 0.7); opts = J("() => [...document.querySelectorAll('#pp-sec option')].map(o => o.textContent)"); pg.select_option('#pp-sec', '6'); pg.wait_for_timeout(400)
    ok(len(opts) == 7 and J("() => __lab.st.sec === 6 && __lab.st.model.members[0].sec === null") and pg.input_value('#sec') == '6' and pg.inner_text('#ei') == 'EI = 52\u2009836 kNm\u00b2', f'simple beam: the profile in its menu is the section of the beam: {opts} {pg.inner_text("#ei")!r}')
    pg.keyboard.press('Escape'); pg.click('#undo'); pg.wait_for_timeout(300); ok(J("() => __lab.st.sec") == 2, 'one step back: IPE 300')
    # the window of the section: its values for every section. W and G as the tables of sections print them
    WG = {'IPE 200': ('194.3', '22.4'), 'IPE 240': ('324.3', '30.7'), 'IPE 300': ('557.1', '42.2'), 'IPE 360': ('903.6', '57.1'), 'IPE 400': ('1\u2009156', '66.3'), 'HEB 200': ('569.6', '61.3'), 'HEB 300': ('1\u2009678', '117.0')}
    secs = J("() => __lab.SECTIONS"); badw = []
    for i, sc in enumerate(secs):
        pg.select_option('#sec', str(i)); pg.wait_for_timeout(250)
        dd = J("() => [...document.querySelectorAll('#secw dd')].map(d => d.textContent)"); nm = pg.inner_text('#secw summary b')
        h_, b_, tw, tf, r_ = sc['dim']; g3 = lambda v: f'{v:,}'.replace(',', '\u2009'); num = lambda v: g3(int(v)) if float(v) == int(v) else g3(int(v)) + ('%.1f' % (v - int(v)))[1:]
        want = [f'{h_} \u00d7 {b_} mm', f'{tw}, {tf}, {r_} mm', f'{sc["A"]} cm2', f'{g3(sc["I"])} cm4', f'{WG[sc["name"]][0]} cm3', f'{WG[sc["name"]][1]} kg/m', f'{num(round(2.1 * sc["I"], 1))} kNm2', f'{g3(round(21000 * sc["A"]))} kN']
        if nm != sc['name'] or dd != want: badw.append((sc['name'], dd, want))
    ok(not badw and len(secs) == 7, f'the window of the section shows for each of the seven sections its dimensions, A, I, W, G, EI and EA: {badw[:1]}')
    pg.select_option('#sec', '2'); pg.wait_for_timeout(250)
    ok(J("() => document.querySelector('#secw').open") and J("() => { const s = document.querySelector('#secw svg path'); return !!s && s.getAttribute('d').startsWith('M'); }"), 'the window is open on a wide screen and draws the profile')
    # the last tab: deflection of a beam, displacement of a frame and a truss
    tabs = []
    for pid in ('simple-p', 'portal-g', 'truss'): pre(pid, '', 'D', 500); tabs.append(pg.inner_text('#tab-D').replace('\n', ''))
    ok(tabs == ['wDeflection', '\u03b4Displacement', '\u03b4Displacement'], f'the last tab is named after what it shows: {tabs}')
    # the probe of a frame: displacement, deflection and rotation of the point
    pre('portal-g', '', 'D'); x, y = midm(1, 0.3); pg.mouse.move(x, y); pg.wait_for_timeout(350); t = sheet()
    want = J("() => { const L = __lab, M = L.st.sol.mem[1], x = 2.4, dx = L.FS.interp(M.smp, 'dX', x, -1), dy = L.FS.interp(M.smp, 'dY', x, -1); return [L.n1(Math.hypot(dx, dy) * 1000) + ' mm', L.n1((dx * M.s - dy * M.c) * 1000) + ' mm', L.n1(-L.FS.interp(M.smp, 'rot', x, -1) * 1000) + ' mrad']; }")
    ok({'x = 2.40 m', '\u03b4', 'w', '\u03b8'} <= t and set(want) <= t and want == ['12.6 mm', '12.6 mm', '4.5 mrad'], f'portal, probe at 2.40 m of the beam: displacement 12.6 mm, deflection 12.6 mm, rotation 4.5 mrad: {want}')
    x, y = midm(0, 0.5); pg.mouse.move(x, y); pg.wait_for_timeout(350); t = sheet()
    want = J("() => { const L = __lab, M = L.st.sol.mem[0], x = 2, dx = L.FS.interp(M.smp, 'dX', x, -1), dy = L.FS.interp(M.smp, 'dY', x, -1); return [L.n1((dx * M.s - dy * M.c) * 1000) + ' mm', L.n1(-L.FS.interp(M.smp, 'rot', x, -1) * 1000) + ' mrad', dx > 0]; }")
    ok(set(want[:2]) <= t and want[0].startswith('\u2212') == (not want[2]), f'probe on the left column: its deflection counts toward its dashed side, the right: {want}')
    pre('truss', '', 'D'); x, y = midm(1, 0.5); pg.mouse.move(x, y); pg.wait_for_timeout(350); t = sheet()
    ok('\u03b4' in t and 'w' not in t and '\u03b8' not in t, 'probe on a bar of the truss: its displacement alone')
    pg.mouse.move(5, 5)
    # the rotation at the supports of a beam stands on its deflection line
    th = lambda: sorted(x for x in sheet() if x.startswith('\u03b8 = ') and x.endswith(' mrad'))   # the labels of the rotation; the note of a turn of the line (θ = 0: …) is no such label
    wantth = lambda: J("() => { const L = __lab, m = L.st.model, out = []; L.st.sol.mem.forEach(M => { for (const [x, sd, ni] of [[0, 1, M.n1], [M.L, -1, M.n2]]) { const n = m.nodes[ni], dg = m.members.filter(k => k.n1 === ni || k.n2 === ni).length; if (n.hinge || (n.sup === 'free' && dg !== 1)) continue; const v = L.n1(-L.FS.interp(M.smp, 'rot', x, sd) * 1000); if (v !== '0.0') out.push('\u03b8 = ' + v + ' mrad'); } }); return [...new Set(out)].sort(); }")
    got = []
    for pid in ('simple-p', 'cantilever', 'overhang', 'two-span', 'gerber', 'fixed'):
        pre(pid, '', 'D', 1300); pg.mouse.move(5, 5); a_ = th(); b_ = wantth()
        if a_ != b_: got.append((pid, a_, b_))
    pre('simple-p', '', 'D', 1300); pg.mouse.move(5, 5); a_ = th()
    ok(not got and a_ == ['\u03b8 = 2.5 mrad', '\u03b8 = \u22122.0 mrad'], f'tab deflection of six beams: the rotation of every support and free end that prints other than 0.0 stands on the sheet, none at a fixed end or a hinge; simple beam: 2.5 and −2.0 mrad: {got} {a_}')
    pre('simple-p', '', 'M', 1100); pg.mouse.move(5, 5); ok(not th(), 'tab moment: no rotation on the sheet')
    t = learn(); ok('\u03b8' not in t.split('Signs and axes')[1].split('Reading')[0].split('By hand')[1], 'tab moment: the hand card has no row for the rotation')
    pre('simple-p', '', 'D', 1100); t = learn().replace('\n', ' ')
    ok('\u03b8A = ' in t and '2.5 mrad\u2713' in t and '\u22122.0 mrad\u2713' in t and '20.0 · 2.00 · 4.00 · (6.00 + 4.00) / (6 · 17\u2009547.6 · 6.00) · 10³' in t and 'Rotation: the slope of the deflection line, in mrad' in t, 'tab deflection: the hand card has the two rotations with their lines, and the rule names the rotation')
    ok(t.rstrip().endswith('No load factors, no strength or deflection checks: a design to a standard comes after this.'), 'the panel ends with what the page is: statics only')
    # what the analysis cannot tell from zero, with long members: 85 loads of 1000 kN down each column of a portal 30 m high and 30 m wide, IPE 200.
    # By statics nothing moves; the joints come out of the arithmetic some 1e-12 m from zero. The sheet says that nothing moves and draws no number
    pre('portal-g', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); L.stretch(m, 'y', 0, 4, 30); L.stretch(m, 'x', 0, 8, 30); m.loads = []; for (let i = 0; i < 85; i++) m.loads.push({ id: 10 + i, m: 0, a: 30, P: 1000, ang: -90 }, { id: 200 + i, m: 2, a: 0, P: 1000, ang: -90 })", 'D', 1500); t = sheet()
    z = J("() => ({ zero: __lab.st.zero.D, D: __lab.st.sol.max.D, nil: __lab.st.sol.nilD, N: Math.max(...__lab.st.sol.mem.map(M => Math.max(...Array.from(M.smp.N, Math.abs)))), M: Math.max(...__lab.st.sol.mem.map(M => Math.max(...Array.from(M.smp.M, Math.abs)))), nilM: __lab.st.sol.nilM, zM: __lab.st.zero.M })")
    ok(z['zero'] and z['zM'] and 'No displacement' in t and z['D'] <= z['nil'] and z['M'] <= z['nilM'] and abs(z['N'] - 85000) < 1e-6 and not any(x.endswith(' mm') for x in t), f"portal 30 m high and wide, IPE 200, 85 loads of 1000 kN down each column: the columns carry 85 000 kN, nothing bends and nothing moves, and the sheet says so: {z} {sorted(x for x in t if 'mm' in x or 'isplacement' in x)}")
    # --- the points of review 09
    rule = lambda key: next((l for l in learn().split('\n') if key in l), '')
    marks = lambda: J("() => __lab.st.marks.ext.map(e => [e.mi, Math.round(e.x * 1e6) / 1e6, Math.round(e.v * 1e6) / 1e6, !!e.jump, !!e.low, !!e.flat])")
    # C78 a load along the beam on a zero of the shear starts a piece and makes no step: the peak stays a smooth one
    pre('simple-w', "m.loads = [{ id: 1, m: 0, a: 3, P: 20, ang: 0 }]", 'M', 1100); t = sheet(); mk_ = marks()
    vb = J("() => { const F = __lab.FS.forcesAt, M = __lab.st.sol.mem[0]; return [F(M, 3, -1).V, F(M, 3, 1).V, F(M, 3, -1).M, F(M, 3, -1).N, F(M, 3, 1).N].map(v => Math.round(v * 1e6) / 1e6); }")
    ok(mk_ == [[0, 3, 45, False, False, False]] and vb[:3] == [0, 0, 45] and abs(vb[3] - vb[4]) == 20 and 'V = 0: peak of M' in t and not any('V changes sign' in x for x in t), f'6 m beam with 10 kN/m and 20 kN along the beam at midspan: V = 0 on both sides of the load, N steps by 20 kN, and the peak of 45.0 kNm is marked as a smooth one, “V = 0: peak of M”: {mk_} {vb} {sorted(x for x in t if "peak" in x or "changes" in x)}')
    pre('simple-p', "m.loads = [{ id: 1, m: 0, a: 3, P: 20, ang: -90 }]", 'M', 1100); t = sheet(); mk_ = marks()
    ok(len(mk_) == 1 and mk_[0][3] and 'V changes sign: peak of M' in t, f'the same beam with 20 kN across it at midspan: the shear steps there, and the peak is a corner: {mk_}')
    # C97 a member is measured by itself: by its largest rotation (version 15)
    pre('overhang', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); const g = L.gridOf(m, 'x'); L.stretch(m, 'x', g[1], g[2], 1.4); L.stretch(m, 'x', g[0], g[1], 30); m.nodes.find(n => n.lbl === 'B').sup = 'fixed'; m.loads = []; for (let i = 0; i < 6; i++) m.loads.push({ id: 10 + i, m: 1, a: 1.4, P: 1000, ang: -90 }); m.loads.push({ id: 99, m: 1, a: 1.4, P: 400, ang: -90 })", 'D', 1200)
    z = J("() => ({ D: Math.round(__lab.st.sol.max.D * 1e6) / 1e6, turn: Math.round(__lab.st.sol.max.turn * 1e6) / 1e6, turnM: __lab.st.sol.max.turnM, th: Math.round(Math.abs(__lab.FS.interp(__lab.st.sol.mem[1].smp, 'rot', __lab.st.sol.mem[1].L, -1)) * 1e6) / 1e6 })")
    far = pg.inner_text('#learn .card.far') if pg.query_selector('#learn .card.far') else ''
    ok(z['D'] == 1.434666 and z['th'] == 1.537142 and z['D'] < 1.5 and z['turnM'] == 1 and z['turn'] == 1.537142 and 'Member B–C turns by 1537.1 mrad at its steepest place' in far, f'backspan of 30 m, B fixed, 6400 kN at the end of an overhang of 1.40 m, IPE 200: the tip moves 1.434666 m and turns 1.537142 rad, less than a twentieth of the 30 m span and more than the overhang is long; the card stands, names the overhang and gives its rotation: {z} {far[:90]!r}')
    pre('overhang', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); const g = L.gridOf(m, 'x'); L.stretch(m, 'x', g[1], g[2], 1.4); L.stretch(m, 'x', g[0], g[1], 30); m.nodes.find(n => n.lbl === 'B').sup = 'fixed'; m.loads = [{ id: 1, m: 1, a: 1.4, P: 208, ang: -90 }]", 'D', 1000)
    z = J("() => ({ D: __lab.st.sol.max.D, turn: __lab.st.sol.max.turn })"); a0 = bool(pg.query_selector('#learn .card.far'))
    pre('overhang', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); const g = L.gridOf(m, 'x'); L.stretch(m, 'x', g[1], g[2], 1.4); L.stretch(m, 'x', g[0], g[1], 30); m.nodes.find(n => n.lbl === 'B').sup = 'fixed'; m.loads = [{ id: 1, m: 1, a: 1.4, P: 209, ang: -90 }]", 'D', 1000)
    z1 = J("() => ({ D: __lab.st.sol.max.D, turn: __lab.st.sol.max.turn })"); a1 = bool(pg.query_selector('#learn .card.far'))
    z['turn'] = z.get('turn') or 0; z1['turn'] = z1.get('turn') or 0
    ok(not a0 and a1 and z['turn'] < 0.05 < z1['turn'] and abs(z['turn'] - 208 * 1.96 / (2 * 4080.3)) < 1e-12 and abs(z1['turn'] - 209 * 1.96 / (2 * 4080.3)) < 1e-12, f'the same overhang with 208 kN turns by 49.96 mrad at its end (P L^2 / (2 EI)) and has no card; with 209 kN it turns by 50.20 mrad and has it: {z} {a0} {z1} {a1}')
    # C98 the probe stands on a station of its own kind and reads there
    pre('simple-p', "L.st.sec = 2; Object.assign(m.members[0].udl, { on: true, w1: 492.3, w2: 492.3, ang: -90 }); m.loads = [{ id: 1, m: 0, a: 2.27, P: 949.9, ang: -90 }]", 'M', 1100)
    c = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 2.27 * V.s, c.y + V.yB + 140]; }")
    pa = []
    for dx in (-2, 0, 2): pg.mouse.move(c[0] + dx, c[1]); pg.wait_for_timeout(250); pa.append(J("() => __lab.st.probeAt"))
    J(HOOK); pg.mouse.move(c[0] + 1, c[1]); pg.wait_for_timeout(350); t = set(J("() => [...window.__t]")); pg.mouse.move(5, 5)
    ok(all(q == {'mi': 0, 'a': 2.27, 'kind': 'load'} for q in pa) and '949.9 kN' in t and 'V left' in t and 'V right' in t, f'492.3 kN/m and 949.9 kN at 2.27 m: the peak lies 0.3 micrometres behind the load, on the same pixel; the probe stands on the load, says so in its record, and reads the two sides of the load at the load: {pa} {sorted(x for x in t if "kN" in x and "V" in x or x.startswith("V "))}')
    pre('simple-w', '', 'M', 1100)
    c = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 3 * V.s + 1, c.y + V.yB + 140]; }")
    J(HOOK); pg.mouse.move(*c); pg.wait_for_timeout(350); t = set(J("() => [...window.__t]")); q = J("() => __lab.st.probeAt"); pg.mouse.move(5, 5)
    q = q or {}
    ok(q.get('mi') == 0 and abs(q.get('a', 9) - 3) < 1e-9 and q.get('kind') == 'peak' and 'V left' not in t and '45.0 kNm' in t, f'6 m beam with 10 kN/m: at midspan the probe stands on the marked peak and reads one value of V there, zero: {q} {sorted(x for x in t if x.startswith("V") or "kNm" in x)}')
    # C99, C100 the rule on the rotation: a hinge, and members with different EI
    pre('gerber', '', 'D'); r_ = rule('Rotation'); th = J("() => { const s = __lab.st.sol, m = __lab.st.model, gi = m.nodes.findIndex(n => n.hinge), I = __lab.FS.interp; const a = s.mem.find(M => M.n2 === gi), b = s.mem.find(M => M.n1 === gi); return [-I(a.smp, 'rot', a.L, -1) * 1000, -I(b.smp, 'rot', 0, 1) * 1000].map(v => Math.round(v * 1e6) / 1e6); }")
    ok('Along a stretch without a hinge θ changes by the area under M/EI: Δθ = −∫ M/EI dx.' in r_ and 'At a hinge the two sides turn by their own amounts: θ steps there' in r_ and 'This beam has one EI' in r_ and th == [-0.587687, 0.931989], f'Gerber beam: θ is −0.587687 mrad left of the hinge and +0.931989 mrad right of it; the rule holds along a stretch without a hinge and says that θ steps at a hinge: {th} {r_[-150:]!r}')
    pre('two-span', "m.members[1].sec = 6", 'D'); r_ = rule('Rotation')
    ok('The members of this beam have different EI: each stretch counts with its own.' in r_ and 'This beam has one EI' not in r_ and 'hinge the two sides' not in r_, f'two-span beam with HEB 300 on the right span: the rule says that each stretch counts with its own EI, and names no hinge: {r_[-120:]!r}')
    pre('simple-w', '', 'D'); r_ = rule('Rotation'); ok('This beam has one EI: the area under the moment line, divided by EI.' in r_ and 'different EI' not in r_, f'simple beam: one EI: {r_[-90:]!r}')
    pre('three-hinge', '', 'D'); r_ = rule('Rotation'); ok('At a hinge every member has a θ of its own.' in r_, f'three-hinged frame: the rule on the rotation names the hinge: {r_[-70:]!r}')
    pre('portal-g', '', 'D'); r_ = rule('Rotation'); ok('hinge' not in r_ and 'every member that ends there has the same θ' in r_, 'portal frame: no hinge, the rule speaks of the rigid joint alone')
    # two members of 5 m in one line, IPE 200 then IPE 300, fixed at the left end, 1 kN down at the free end: the rotation of the free end
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'A' ? 'fixed' : 'free'; }); m.members.forEach(k => k.udl.on = false); m.members[0].sec = 0; m.members[1].sec = 2; m.loads = [{ id: 1, m: 1, a: 5, P: 1, ang: -90 }]", 'D')
    th = J("() => Math.round(-__lab.FS.interp(__lab.st.sol.mem[1].smp, 'rot', 5, -1) * 1e9) / 1e6")
    ok(th == 9.902849, f'cantilever of two members of 5 m, IPE 200 then IPE 300, 1 kN at the free end: its rotation is 1000 (37.5 / 4080.3 + 12.5 / 17 547.6) = 9.902849 mrad, each stretch with its own EI: {th}')
    # C101 the axial force at a joint, with its sign
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'A' ? 'pin' : 'roller'; }); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 5, P: 20, ang: 0 }]", 'N', 1000)
    nb = J("() => { const F = __lab.FS.forcesAt, s = __lab.st.sol; return [F(s.mem[0], 5, -1).N, F(s.mem[1], 0, 1).N, s.reactions[1].Rx, s.reactions[0].Rx].map(v => Math.round(v * 1e6) / 1e6); }"); r_ = rule('steps by what acts')
    ok([abs(v) if v == 0 else v for v in nb] == [20, 0, 0, -20] and 'N right of it = N left of it − (Fx + Px)' in r_ and 'A roller has no Fx: N passes it, unless a load along the beam stands on it.' in r_, f'two-span beam with a pin at A and rollers at B and C, 20 kN to the right on B: N = +20 kN left of B and 0 right of it; the roller has no reaction along the beam, and the rule gives 0 = 20 − (0 + 20): {nb} {r_[:90]!r}')
    # C102 a force along the beam hides no deflection and no rotation that prints
    pre('overhang', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); const g = L.gridOf(m, 'x'); L.stretch(m, 'x', g[1], g[2], 30); L.stretch(m, 'x', g[0], g[1], 0.5); m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'fixed' : 'free'; }); m.loads = [{ id: 1, m: 0, a: 0, P: 2, ang: -90 }]; for (let i = 0; i < 95; i++) m.loads.push({ id: 10 + i, m: 1, a: 30, P: 1000, ang: 0 })", 'D', 1400); t = sheet()
    z = J("() => ({ zero: __lab.st.zero.W, w: Math.round(__lab.st.sol.max.D * 1e9) / 1e6, th: Math.round(-__lab.FS.interp(__lab.st.sol.mem[0].smp, 'rot', 0, 1) * 1e9) / 1e6, below: __lab.st.sol.nilD < __lab.st.sol.max.D / 500, N: Math.round(__lab.st.sol.fmax) })")
    ok(not z['zero'] and z['w'] == 0.020423 and z['th'] == -0.06127 and z['below'] and z['N'] == 95000 and 'θ = −0.1 mrad' in t and 'w = 0' not in t, f'overhang of 0.50 m left of the fixed support B and 30 m right of it, IPE 200, 2 kN on A and 95 loads of 1000 kN along the beam: the deflection of 0.020423 mm and the rotation of −0.061270 mrad stay, the line is drawn and carries θ = −0.1 mrad: {z} {sorted(x for x in t if "mrad" in x or "= 0" in x)}')
    # C103 Compare: the kept axial force of a frame bar that bends now
    pre('portal-g', "L.st.sec = 2; m.nodes[1].hinge = true; m.nodes[2].hinge = true; m.members.forEach(k => k.udl.on = false); Object.assign(m.members[1].udl, { on: true, w1: 10, w2: 10, ang: 0 })", 'N', 1200)
    pg.click('#cmp'); pg.wait_for_timeout(200); J("() => { const m = __lab.st.model; Object.assign(m.members[1].udl, { on: true, w1: 5, w2: 5, ang: -90 }); __lab.resolve('tween'); }"); pg.wait_for_timeout(1500); t = sheet()
    nn = J("() => { const F = __lab.FS.forcesAt, M = __lab.st.sol.mem[1], G = __lab.st.ghost.mem[1]; return [F(M, 0, 1).N, F(M, 8, -1).N, F(G, 0, 1).N, F(G, 8, -1).N].map(v => Math.round(v * 1e6) / 1e6); }")
    ok([abs(v) if v == 0 else v for v in nn] == [0, 0, 40, -40] and '(40.0)' in t and '(−40.0)' in t, f'portal with hinged corners: 10 kN/m to the right along the roof kept (+40 and −40 kN at its ends), then 5 kN/m down on it: the roof has no axial force now, and the two kept values stand in brackets at its ends: {nn} {sorted(x for x in t if "(" in x)}')
    pg.click('#cmp'); pg.wait_for_timeout(200)
    # C104 the choice in the menu of a single member is the section of the header, and says so
    pre('simple-w', "L.st.sec = 2", 'D'); pg.select_option('#sec', '2'); pg.wait_for_timeout(300); pg.click('#loads'); pg.wait_for_timeout(300); pt = pg.inner_text('#pop')
    pg.select_option('#pp-sec', '0'); pg.wait_for_timeout(500); e1 = J("() => [__lab.st.sec, document.querySelector('#sec').value, Math.round(__lab.st.sol.max.D * 1e6) / 1e3]"); pg.keyboard.press('Escape'); pg.click('#reset'); pg.wait_for_timeout(600)
    e2 = J("() => [__lab.st.sec, document.querySelector('#sec').value, Math.round(__lab.st.sol.max.D * 1e6) / 1e3]")
    ok('Section' in pt and 'Profile' not in pt and 'The same choice as “Section” in the header. It stays when the example is reset or another one is picked.' in pt and e1 == [0, '0', 41.357] and e2 == e1, f'simple beam: the menu of its one member names the choice “Section” and says that it is that of the header and stays; IPE 200 chosen there: 41.357 mm, and after Reset the same: {e1} {e2}')
    pg.select_option('#sec', '2'); pg.wait_for_timeout(300)
    pre('portal-g', '', 'M'); pg.mouse.click(*midm(0)); pg.wait_for_timeout(300); pt = pg.inner_text('#pop'); pg.keyboard.press('Escape')
    ok('Profile' in pt and 'as the structure (IPE 300)' in pt and 'The same choice as' not in pt, 'frame: the menu of a member offers its own profile, as before')
    # C109 a place typed as the rounded length of an inclined member lies inside it, and the menu says so
    pre('truss', "m.loads = [{ id: 1, m: 9, a: 2, P: 20, ang: -90 }]", 'M')
    hit = J("() => { const L = __lab; for (let y = 0; y < 700; y += 3) for (let x = 100; x < 1100; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.x + x, c.y + y]; } } return null; }")
    pg.mouse.click(*hit); pg.wait_for_timeout(300); got = []
    for v in ('4.24', '4.25', '4.2'): typ('#pp-a', v); pg.wait_for_timeout(150); got.append([J("() => Math.round(__lab.st.model.loads[0].a * 1e6) / 1e6"), note()])
    pg.keyboard.press('Escape')
    ok(got == [[4.24, 'Inside the member, 2.6 mm before the right joint: the member is 4.243 m long. The button puts the load on the joint.'], [4.242641, 'On the right joint: the member is 4.243 m long.'], [4.2, '']], f'diagonal of 4.2426 m: 4.24 typed lies inside, 2.6 mm before the joint, and the menu says so and points to the button; 4.25 stands on the joint; the length is given as 4.243 m: {got}')
    # the value of a horizontal reaction beside a member stands below the member (not raised by a review)
    # the box of the value, with its margin of 3 px, begins below the axis of the beam; in version 13 the value of the fixed support lay on the axis
    below = lambda txt: J("(t) => { const L = __lab, r = L.HS.rlab.find(q => q[0] === t); return r && r[1] ? [r[1][1], r[1][3], Math.max(...L.MG.map(g => Math.max(g.ay, g.by)))] : null; }", txt)
    pre('overhang', "L.st.sec = 0; m.members.forEach(k => k.udl.on = false); L.stretch(m, 'x', 5, 7, 30); L.stretch(m, 'x', 0, 5, 0.5); m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'fixed' : 'free'; }); m.loads = [{ id: 1, m: 0, a: 0, P: 2, ang: -90 }]; for (let i = 0; i < 95; i++) m.loads.push({ id: 10 + i, m: 1, a: 30, P: 1000, ang: 0 })", 'D', 1400)
    r_ = below('95000.0 kN')
    ok(r_ is not None and r_[0] > r_[2] + 1, f'fixed support B between two members with a reaction of 95 000 kN along the beam: its value stands below the beam, clear of the line of the beam: {r_}')
    pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'B' ? 'pin' : 'roller'; }); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 1, a: 5, P: 20, ang: 0 }]", 'N', 1000)
    r_ = below('20.0 kN')
    ok(r_ is not None and r_[0] > r_[2] + 1, f'pin B between two spans with a reaction of 20 kN along the beam: its value stands below the beam: {r_}')
    # --- the points of review 10 (version 15)
    TAG = '[review 10] '
    # C111 the probe at a joint with a load on it shows both sides, whichever member holds the load
    got = []
    for where in ('m: 1, a: 0', 'm: 0, a: 5'):
        pre('two-span', "m.nodes.forEach(n => { n.sup = n.lbl === 'A' ? 'pin' : 'roller'; }); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, " + where + ", P: 20, ang: 0 }]", 'N', 1000)
        c = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 5 * V.s + 1, c.y + V.yB + 140]; }")
        J(HOOK); pg.mouse.move(*c); pg.wait_for_timeout(350); t = set(J("() => [...window.__t]")); q = J("() => __lab.st.probeAt") or {}; pg.mouse.move(5, 5)
        nb = J("() => { const F = __lab.FS.forcesAt, s = __lab.st.sol; return [F(s.mem[0], 5, -1).N, F(s.mem[1], 0, 1).N].map(v => Math.round(v * 1e6) / 1e6); }")
        got.append([{'N left', 'N right', '20.0 kN', '0.0 kN'} <= t, [abs(v) if v == 0 else v for v in nb], q.get('kind'), abs(q.get('a', 9) - 5) < 1e-9 and q.get('mi') == 0])
    ok(got == [[True, [20, 0], 'load', True]] * 2, f'two spans of 5 m, pin at A, rollers at B and C, 20 kN to the right on B: the probe at B shows N left = 20.0 kN and N right = 0.0 kN, with the load held at the start of B–C and with it held at the end of A–B: {got}')
    # C112 a typed length: what stays follows from the field at the end, not from the keys on the way
    res = []
    for how in ('typed', 'pasted'):
        pre('simple-p', ''); pg.click('#cmp'); pg.wait_for_timeout(200); u0 = nundo(); openm(0, 0.7)
        if how == 'typed': pg.click('#pp-len'); pg.keyboard.press('Control+a'); pg.keyboard.type('35', delay=60)
        else: pg.fill('#pp-len', '35')
        pg.wait_for_timeout(200); n_ = note(); pg.keyboard.press('Tab'); pg.wait_for_timeout(450)
        res.append([nodes(), lds(), J("() => Math.round(__lab.st.sol.max.M * 10) / 10"), J("() => !!__lab.st.ghost && document.querySelector('#cmp').getAttribute('aria-pressed') === 'true'"), nundo() - u0, J("() => document.querySelector('#pp-len').value"), n_])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        if J("() => !!__lab.st.ghost"): pg.click('#cmp'); pg.wait_for_timeout(150)
    ok(res[0] == res[1] == [[[0, 0], [6, 0]], [[0, 2]], 26.7, True, 0, '6', 'From 0.50 to 30.00 m. It stays 6.00 m.'], f'6 m beam with 20 kN at 2 m and Compare on: 35 typed key by key (it passes through 3 m) and 35 pasted leave the same: 6 m, the load at 2 m, M = 26.7 kNm, Compare kept, no step back, the field shows 6: {res}')
    pre('simple-p', ''); u0 = nundo(); openm(0, 0.7); pg.click('#pp-len'); pg.keyboard.press('Control+a'); pg.keyboard.type('3.5', delay=60); pg.wait_for_timeout(250); a_ = [nodes(), lds(), nundo() - u0]
    ok(a_ == [[[0, 0], [3.5, 0]], [[0, 1.17]], 1], f'3.5 typed key by key passes through 3: the beam is 3.5 m long and the load stands at 1.17 m, its share of the 6 m, with one step back: {a_}')
    pg.keyboard.press('Control+a'); pg.keyboard.type('6', delay=60); pg.keyboard.press('Tab'); pg.wait_for_timeout(450); a_ = [nodes(), lds(), nundo() - u0]; pg.keyboard.press('Escape')
    ok(a_ == [[[0, 0], [6, 0]], [[0, 2]], 0], f'then 6 typed and the field left: the beam is as before the edit, and there is no step back left: {a_}')
    # the same rule in the fields of a load and of a distributed load
    pre('simple-p', ''); u0 = nundo()
    hit = J("() => { const L = __lab; for (let y = 0; y < 700; y += 3) for (let x = 100; x < 1100; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.x + x, c.y + y]; } } return null; }")
    pg.mouse.click(*hit); pg.wait_for_timeout(300)
    typ('#pp-P', '50'); typ('#pp-P', '0'); n_ = note(); P1 = J("() => __lab.st.model.loads[0].P"); leave('#pp-P'); f1 = J("() => document.querySelector('#pp-P').value")
    ok(P1 == 20 and n_ == 'From 0.1 to 1000 kN. The load keeps 20.0 kN.' and f1 == '20' and nundo() == u0, f'20 kN load: 50 typed and, in the same edit, 0: the load is as before the edit, the menu says that it keeps 20.0 kN, the field left shows 20, no step back: {P1} {n_!r} {f1} {nundo() - u0}')
    typ('#pp-P', '50'); typ('#pp-P', ''); P2 = J("() => __lab.st.model.loads[0].P"); typ('#pp-a', '4'); typ('#pp-a', ''); a2 = J("() => __lab.st.model.loads[0].a")
    ok(P2 == 20 and a2 == 2, f'a size typed and the field emptied, a place typed and the field emptied: 20 kN at 2 m as before: {P2} {a2}')
    pg.keyboard.press('Escape'); pre('simple-w', ''); u0 = nundo(); pg.click('#loads'); pg.wait_for_timeout(300)
    typ('#pp-w1', '25'); w_a = udl()['w1']; typ('#pp-w1', ''); w_b = [udl()['w1'], udl()['on']]; leave('#pp-w1'); f1 = fields()[0]; pg.keyboard.press('Escape')
    ok(w_a == 25 and w_b == [10, True] and f1 == '10' and nundo() == u0, f'10 kN/m: 25 typed, then the field emptied: 10 kN/m as before the edit, the field left shows 10, no step back: {w_a} {w_b} {f1}')
    # C113 a load at a flat angle to its member bends it: the hint does not call it a load along the member
    pre('truss', "L.stretch(m, 'y', 0, 3, 0.75); m.loads = []; Object.assign(m.members[9].udl, { on: true, w1: 100, w2: 100, ang: 0 })", 'V', 1200)
    UG = "(mi) => { const L = __lab, u = L.HS.udl.get(mi), M = L.st.sol.mem[mi], F = L.FS.forcesAt, c = document.querySelector('canvas').getBoundingClientRect(); return { k: [c.x + u.kx, c.y + u.ky], par: u.par, axial: u.axial, L: Math.round(M.L * 1e6) / 1e6, V: [F(M, 0, 1).V, F(M, M.L, -1).V, F(M, M.L / 2, -1).M, F(M, 0, 1).N - F(M, M.L, -1).N].map(v => Math.round(v * 1e3) / 1e3) }; }"
    g = J(UG, 9); pg.mouse.move(*g['k']); pg.wait_for_timeout(300); h1 = pg.inner_text('#hint'); pg.mouse.move(5, 5)
    ok(g['par'] and not g.get('axial') and g['L'] == 3.092329 and g['V'][:3] == [37.5, -37.5, 28.991] and h1 == 'Load at a flat angle to the member: it also bends it. Click: its size, shape and direction.', f'truss 0.75 m high, 100 kN/m to the right on a diagonal of 3.09 m (14 degrees to the load): the part across is 24.254 kN/m, the end shears are +37.5 and −37.5 kN, the moment at its middle 28.991 kNm, and the hint says that the load also bends the member: {g} {h1!r}')
    pre('simple-w', "Object.assign(m.members[0].udl, { on: true, w1: 10, w2: 10, ang: 0 })", 'N', 1100)
    g = J(UG, 0); pg.mouse.move(*g['k']); pg.wait_for_timeout(300); h2 = pg.inner_text('#hint'); pg.mouse.move(5, 5)
    ok(g['par'] and g['V'] == [0, 0, 0, 60] and h2 == 'Load along the member. Click: its size, shape and direction.', f'10 kN/m along a beam of 6 m: no shear, no moment, N changes by 60 kN, and the hint calls it a load along the member: {g} {h2!r}')
    # C114 a kink of the moment line belongs to a point load across the member
    pre('simple-w', "m.loads = [{ id: 1, m: 0, a: 3, P: 20, ang: 0 }]", 'M', 1100); r_ = rule('kink'); t = learn()
    sl = J("() => { const F = __lab.FS.forcesAt, M = __lab.st.sol.mem[0]; return [F(M, 3, -1).V, F(M, 3, 1).V].map(v => Math.round(v * 1e6) / 1e6); }")
    ok('q: the part of the load across the beam. Uniform load: parabola. Triangular load: cubic curve. The line has a kink where the forces across the axis at one place do not cancel: point loads and a support reaction there, an inclined force with its part across. Forces that cancel, and a force along the axis, make none.' in r_ and 'Point load: kink.' not in t and [abs(v) for v in sl] == [0, 0], f'tab moment, 10 kN/m with 20 kN along the beam at midspan: the slope of M is the same on both sides of the load, and the rule gives the kink to a point load across the member and none to a load along it: {sl} {r_!r}')
    pre('portal-g', '', 'M', 1000); r_ = rule('kink'); ok('q: the part of the load across the member.' in r_ and 'The line has a kink where the forces across the axis at one place do not cancel' in r_, f'frame, tab moment: the same rule with the part of the load across the member: {r_!r}')
    # C97 (review 10) a short stretch that turns far on a long member: the card goes by the rotation
    pre('cantilever', "L.st.sec = 0; L.stretch(m, 'x', 0, 3, 30); m.members.forEach(k => k.udl.on = false); m.loads = [{ id: 1, m: 0, a: 26, P: 500, ang: -90 }, { id: 2, m: 0, a: 28, P: 1000, ang: 90 }, { id: 3, m: 0, a: 30, P: 500, ang: -90 }]", 'D', 1300); pg.mouse.move(5, 5); t = sheet()
    z = J("() => { const s = __lab.st.sol; return { D: Math.round(s.max.D * 1e6) / 1e6, turn: Math.round(s.max.turn * 1e6) / 1e6, turnM: s.max.turnM, strain: s.max.strain }; }")
    far = pg.inner_text('#learn .card.far') if pg.query_selector('#learn .card.far') else ''
    ok(z == {'D': 0.98032, 'turn': 0.49016, 'turnM': 0, 'strain': 0} and z['D'] < 30 / 20 and 'Member A–B turns by 490.2 mrad at its steepest place: more than 50 mrad, a twentieth of a radian.' in far and 'stretched' not in far and 'θ = 490.2 mrad' in t, f'cantilever of 30 m, IPE 200, 500 kN down at 26 m, 1000 kN up at 28 m, 500 kN down at 30 m: the tip moves 0.98032 m, less than a twentieth of the length, and turns by 490.2 mrad: the card stands and gives that rotation, which also stands at the tip on the sheet: {z} {far[:120]!r}')
    # C115 a bar that is only stretched: the card says stretched, and names no rotation
    c115 = []
    for k_ in (30, 29):
        pre('bent', "L.st.sec = 0; m.nodes[1].hinge = true; m.nodes[2].sup = 'roller'; m.members.forEach(k => k.udl.on = false); m.loads = []; for (let i = 0; i < %d; i++) { m.loads.push({ id: 10 + i, m: 1, a: 0, P: 1000, ang: 180 }); m.loads.push({ id: 100 + i, m: 1, a: 3, P: 1000, ang: 0 }); }" % k_, 'D', 1300)
        z = J("() => { const s = __lab.st.sol, F = __lab.FS.forcesAt; return [Math.round(s.max.strain * 1e6) / 1e6, s.max.strainM, s.max.turn < 1e-9, !!s.bar[1], Math.round(F(s.mem[1], 1.5, -1).N * 1e6) / 1e6, s.max.M + s.max.V < 1e-6]; }")
        c115.append([z, pg.inner_text('#learn .card.far') if pg.query_selector('#learn .card.far') else ''])
    ok(c115[0][0] == [0.050125, 1, True, True, 30000, True] and 'Member B–C is stretched by 5.0 % over its whole length: its strain N/EA is more than 5 %, a twentieth.' in c115[0][1] and 'turns' not in c115[0][1] and 'bent' not in c115[0][1]
       and c115[1][0] == [0.048454, 1, True, True, 29000, True] and c115[1][1] == '', f'arm of 3 m of the bent cantilever, IPE 200, hinge at B, roller at C, pulled by 30 000 kN at both ends: it is a bar, N = 30 000 kN, strained by 5.0125 % over its whole length, nothing turns or bends; the card says stretched and names no rotation. With 29 000 kN (4.8454 %) there is no card: {c115}')
    # C116 the place of zero shear on the card of a member: a peak or a low point, as the mark on the sheet
    PORT = "L.st.sec = 2; m.nodes.forEach(n => { if (n.sup && n.sup !== 'free') n.sup = 'fixed'; }); m.loads = []; m.members.forEach(k => k.udl.on = false); Object.assign(m.members[0].udl, { on: true, w1: 40, w2: 40, ang: 0 }); Object.assign(m.members[2].udl, { on: true, w1: 40, w2: 40, ang: 180 }); Object.assign(m.members[1].udl, { on: true, w1: %s, w2: %s, ang: -90 })"
    def roof(w, tab):
        pre('portal-g', PORT % (w, w), tab, 1200); pg.mouse.move(*midm(1, 0.31)); pg.wait_for_timeout(400)
        tx = next((x.inner_text() for x in pg.query_selector_all('#learn .card') if 'how its shear line is built' in x.inner_text()), '').replace('\n', ' ')
        v = J("() => { const F = __lab.FS.forcesAt, M = __lab.st.sol.mem[1]; return [F(M, 0, 1).M, F(M, 4, -1).M, F(M, 4, -1).V, M.L].map(v => Math.round(v * 1e4) / 1e4); }"); pg.mouse.move(5, 5); return tx, v
    tx, v = roof(1.5, 'V'); mk_ = [e for e in marks() if e[0] == 1]
    ok(v == [-17.0667, -5.0667, 0, 8] and 'there V = 0 and M has a low point: its size is larger on both sides.' in tx and 'M has its peak' not in tx and mk_ == [[1, 4, -5.066667, False, True, False]],
       f'portal of 8 m by 4 m, fixed feet, 40 kN/m inward on each column and 1.5 kN/m on the roof: the roof has −17.0667 kNm at its ends and −5.0667 kNm at 4 m, where V = 0; the card of the roof calls that a low point, as the record of the marks does: {v} {mk_} {tx[-170:]!r}')
    _, v2 = roof(2.5, 'V'); w0 = 1.5 + (0 - v[1]) * (2.5 - 1.5) / (v2[1] - v[1]); tx0, v0 = roof(repr(w0), 'V')
    ok(abs(v0[1]) < 0.05 and v0[0] < -1 and 'there V = 0 and the moment line turns.' in tx0 and 'peak' not in tx0.split('measured from')[-1] and 'low point' not in tx0, f'the same portal with {w0:.4f} kN/m on the roof: the moment at 4 m prints 0.0, and the card says that the moment line turns there, without calling it a peak or a low point: {v0} {tx0[-120:]!r}')
    pre('simple-w', '', 'V', 1000); tx = next((x.inner_text() for x in pg.query_selector_all('#learn .card') if 'how its shear line is built' in x.inner_text()), '').replace('\n', ' ')
    ok('there V = 0 and M has its peak.' in tx, f'simple beam with a uniform load: the card says that M has its peak where V = 0: {tx[-120:]!r}')
    TAG = ''
    TAG = '[not raised by the review] '
    # the foot of the sheet: the hint and the factor of the drawing lie over the drawing, on one line or several. Nothing of the
    # drawing lies under their words: at 21 widths, on a beam, a tall frame and a wide frame, with "Compare" off and on
    FOOT = """() => { const L = __lab, c = document.querySelector('canvas'), cr = c.getBoundingClientRect(), words = [], hi = document.querySelector('#hint'), mg = document.querySelector('#mag');
      for (const el of [hi, mg]) { const r = document.createRange(); r.selectNodeContents(el); for (const q of r.getClientRects()) words.push([q.left - cr.left, q.top - cr.top, q.right - cr.left, q.bottom - cr.top]); }
      const hit = b => words.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
      let n = L.boxes.filter(hit).length;
      if (L.VW.beam) for (const p of L.VW.plots) if (hit([L.VW.gl, p.y, c.clientWidth - L.VW.gr, p.y + p.h])) n++;
      return [n, new Set(words.map(q => Math.round(q[1]))).size, hi.textContent.length > 100, mg.textContent.startsWith('Dashed') || mg.textContent.startsWith('In brackets')]; }"""
    under, rows_, seen = [], set(), 0
    for w_ in list(range(1000, 2001, 50)) + [400]:
        pg.set_viewport_size({'width': w_, 'height': 900 if w_ > 400 else 800}); pg.wait_for_timeout(250)
        for pid in ('two-span', 'bent', 'portal-g'):
            pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(250); pg.click('#tab-D'); pg.wait_for_timeout(450)
            for cmp_ in (False, True):
                if cmp_: pg.click('#cmp'); pg.wait_for_timeout(120); J("() => { const m = __lab.st.model; if (m.loads.length) m.loads[0].P += 5; else m.members.forEach(k => { if (k.udl.on) k.udl.w1 += 1; }); __lab.resolve('instant'); }"); pg.wait_for_timeout(350)
                pg.mouse.move(w_ // 2, 12); pg.wait_for_timeout(120); r_ = J(FOOT); seen += 1; rows_.add(r_[1])
                if r_[0] or not r_[2] or r_[3] != cmp_: under.append((w_, pid, cmp_, r_))
    ok(not under and seen == 132 and max(rows_) >= 3, f'the foot of the sheet at 21 widths from 1000 to 2000 px and at 400 px, on a beam, the bent cantilever and the portal, with “Compare” off and on: the hint and the factor take {min(rows_)} to {max(rows_)} lines, and nothing of the drawing lies under their words in any of the {seen} sheets: {under[:4]}')
    # texts on other texts. The rectangles are those of the texts as the sheet draws them, read from the drawing calls:
    # nothing here asks the page what it placed where
    POS = """() => { if (!window.__p) { const o = CanvasRenderingContext2D.prototype.fillText; window.__p = []; CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...a) { const w = this.measureText(String(t)).width, al = this.textAlign, x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x; window.__p.push([String(t), x0, y - 6, x0 + w, y + 6]); return o.call(this, t, x, y, ...a); }; } window.__p.length = 0; __lab.st.dirty = true; }"""
    def rects():
        J(POS); pg.wait_for_timeout(350); out = {}
        for t, x0, y0, x1, y1 in J("() => window.__p"): out[(t, round(x0), round(y0))] = (t, x0, y0, x1, y1)
        return list(out.values())
    meet = lambda a, b: a[1] < b[3] and a[3] > b[1] and a[2] < b[4] and a[4] > b[2]
    case = lambda pid, start: next(v[2] for v in VAR if v[0] == pid and v[1].startswith(start))
    # the value of a load on the right of the right column and the line of the heights beside it
    res = []
    for w_, h_ in ((1500, 900), (1280, 760)):
        pg.set_viewport_size({'width': w_, 'height': h_}); pg.wait_for_timeout(250)
        for what, js in (('40 kN/m', case('portal-g', 'feet fixed, 40 kN/m inward on each column')), ('10 to 40 kN/m', "m.members.forEach(k => k.udl.on = false); Object.assign(m.members[2].udl, {on: true, w1: 10, w2: 40, ang: 180})"), ('1000 kN/m', "m.members.forEach(k => k.udl.on = false); Object.assign(m.members[2].udl, {on: true, w1: 1000, w2: 1000, ang: 180})")):
            pre('portal-g', js, 'M', 900); r_ = rects(); dx_ = J("() => __lab.VW.dimX"); xr_ = J("() => __lab.VW.ox + __lab.VW.x1 * __lab.VW.s")
            val = [q for q in r_ if q[0].endswith('kN/m') and q[1] > xr_]; dim = [q for q in r_ if q[0] == '4.00 m']
            res.append((w_, what, len(val), len(dim), [round(q[3] - dx_, 1) for q in val], any(meet(a, d) for a in val for d in dim)))
    ok(all(r[2] >= 1 and r[3] == 1 and max(r[4]) <= -5 and not r[5] for r in res), f'portal with a distributed load to the left on the right column (40 kN/m, 10 to 40 kN/m, 1000 kN/m) at 1500 and 1280 px: the value of the load ends left of the line of the heights and does not meet its number: {res}')
    # the names of the profiles of a truss with two profiles
    pre('truss', case('truss', 'top chord and diagonals with the profile HEB 200'), 'M', 900); nm = [q for q in rects() if q[0] == 'HEB 200']
    ok(len(nm) >= 4 and not any(meet(a, b_) for i, a in enumerate(nm) for b_ in nm[i + 1:]), f'truss with HEB 200 on the top chord and the diagonals at 1280 px: {len(nm)} names of profiles on the sheet, none on another: {[[round(v) for v in q[1:]] for q in nm]}')
    pg.set_viewport_size({'width': 1500, 'height': 900}); pg.wait_for_timeout(250)
    TAG = ''
    # --- the points of review 11 (version 16)
    TAG = '[review 11] '
    HITLOAD = "() => { const L = __lab; for (let y = 0; y < 700; y += 3) for (let x = 100; x < 1100; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.x + x, c.y + y]; } } return null; }"
    def loadmenu(): pg.mouse.click(*J(HITLOAD)); pg.wait_for_timeout(300)
    def keys(sel, v): pg.click(sel); pg.keyboard.press('Control+a'); pg.keyboard.type(v, delay=40); pg.wait_for_timeout(120)
    far_ = lambda: pg.inner_text('#learn .card.far').replace('\n', ' ') if pg.query_selector('#learn .card.far') else ''
    # C121 a number typed with an exponent: the keys on the way do not change what the field holds
    out = []
    for sel, v in (('#pp-P', '9000e-1'), ('#pp-a', '25e-1')):
        for how in ('typed', 'set'):
            pre('simple-p', "m.loads[0].a = 2; m.loads[0].P = 20"); loadmenu()
            if how == 'typed': keys(sel, v)
            else: typ(sel, v)
            pg.keyboard.press('Tab'); pg.wait_for_timeout(200)
            out.append(J("() => { const l = __lab.st.model.loads[0]; return [l.P, l.a, Math.round(__lab.st.sol.max.M * 10) / 10]; }") + [pg.input_value(sel)])
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    ok(out[0] == out[1] == [900, 2, 1200, '900'] and out[2] == out[3] == [20, 2.5, 29.2, '2.5'], f'6 m beam with 20 kN at 2 m: 9000e-1 typed key by key into the size gives 900 kN and M = 1200.0 kNm, as the same entry set in one piece; 25e-1 typed into the place gives 2.50 m and M = 29.2 kNm: {out}')
    pre('simple-p', "m.loads[0].a = 2; m.loads[0].P = 20"); loadmenu(); keys('#pp-P', '9000'); mid = [pg.input_value('#pp-P'), J("() => __lab.st.model.loads[0].P"), note()]
    leave('#pp-P'); aft = [pg.input_value('#pp-P'), J("() => __lab.st.model.loads[0].P")]
    keys('#pp-a', '25'); mid2 = [pg.input_value('#pp-a'), J("() => __lab.st.model.loads[0].a"), note()]; leave('#pp-a'); aft2 = [pg.input_value('#pp-a'), J("() => __lab.st.model.loads[0].a")]; pg.keyboard.press('Escape')
    ok(mid == ['9000', 1000, 'From 0.1 to 1000 kN. Taken as 1000.0 kN.'] and aft == ['1000', 1000] and mid2[:2] == ['25', 6] and mid2[2].startswith('On B') and aft2 == ['6', 6], f'a size and a place beyond the limit: while the field is typed in it keeps the keys (9000, 25), the page takes the limit (1000 kN, the joint B) and says so; the field shows the value taken when it is left: {mid} {aft} {mid2} {aft2}')
    pre('simple-w', ''); pg.click('#loads'); pg.wait_for_timeout(300); keys('#pp-w1', '600'); midw = [pg.input_value('#pp-w1'), udl()['w1'], note()]; leave('#pp-w1'); aftw = [pg.input_value('#pp-w1'), udl()['w1']]
    keys('#pp-w1', '250e-1'); pg.keyboard.press('Tab'); pg.wait_for_timeout(250); expw = [pg.input_value('#pp-w1'), udl()['w1']]; pg.keyboard.press('Escape')
    ok(midw == ['600', 500, 'From 0 to 500 kN/m. Taken as 500.0 kN/m.'] and aftw == ['500', 500] and expw == ['25', 25], f'the value of a distributed load: 600 typed stays in the field while the page takes 500 kN/m and says so; 250e-1 typed key by key gives 25 kN/m: {midw} {aftw} {expw}')
    # C122 a short stretch of a bar that is strained far: the card goes by the largest strain of a member and names the stretch
    ARM = "L.st.sec = 0; m.nodes[1].hinge = true; m.nodes[2].sup = 'roller'; m.members.forEach(k => k.udl.on = false); m.loads = []; for (let i = 0; i < %d; i++) { m.loads.push({ id: 10 + i, m: 1, a: 1, P: 1000, ang: %d }); m.loads.push({ id: 200 + i, m: 1, a: 1.1, P: 1000, ang: %d }); }"
    c122 = []
    for n_, a1_, a2_ in ((60, 180, 0), (60, 0, 180), (29, 180, 0)):
        pre('bent', ARM % (n_, a1_, a2_), 'N', 1200)
        z = J("() => { const s = __lab.st.sol, S = s.mem[1].smp, r = v => Math.round(v * 1e6) / 1e6; return [r(s.max.strain), s.max.strainM, s.max.strainSign, s.max.strainAt.map(r), s.max.turn < 1e-9, r((S.dX[S.xs.length - 1] - S.dX[0]) / 3)]; }")
        c122.append([z, far_()])
    ok(c122[0][0] == [0.100251, 1, 1, [1, 1.1], True, 0.003342] and 'Member B–C is stretched by 10.0 % between 1.00 and 1.10 m from B: its strain N/EA is more than 5 %, a twentieth.' in c122[0][1] and 'turns' not in c122[0][1]
       and c122[1][0] == [0.100251, 1, -1, [1, 1.1], True, -0.003342] and 'Member B–C is shortened by 10.0 % between 1.00 and 1.10 m from B' in c122[1][1]
       and c122[2][0][:4] == [0.048454, 1, 1, [1, 1.1]] and c122[2][1] == '', f'arm of 3 m, IPE 200, sixty loads of 1000 kN to the left at 1.00 m and sixty to the right at 1.10 m: N = 60 000 kN between them, a strain of 10.0251 % over 10 cm, while the arm gets longer by 0.3342 % of its length; the card names the stretch. With the loads the other way it says shortened. With 29 loads each (4.8454 %) there is no card: {c122}')
    # C123 Compare: the kept axial forces of a member that was a bar stay on the sheet when a hinge is closed
    pre('portal-g', "m.loads = []; m.members.forEach(k => k.udl.on = false); m.nodes.forEach(n => { if (n.lbl === 'C' || n.lbl === 'D') n.hinge = true; }); Object.assign(m.members[1].udl, { on: true, w1: 10, w2: 10, ang: 0 })", 'N', 900)
    pg.click('#cmp'); pg.wait_for_timeout(250); num = lambda t: sorted(x for x in t if any(ch.isdigit() for ch in x) and 'm' not in x and 'kN' not in x)
    t0 = num(sheet())
    J("() => { const L = __lab, m = L.st.model; Object.assign(m.members[1].udl, { on: true, w1: 5, w2: 5, ang: -90 }); L.resolve('instant'); }"); pg.wait_for_timeout(300); t1 = num(sheet())
    J("() => { const L = __lab, m = L.st.model; m.nodes.forEach(n => { if (n.lbl === 'C') n.hinge = false; }); L.resolve('instant'); }"); pg.wait_for_timeout(300); t2 = num(sheet())
    on_ = J("() => !!__lab.st.ghost && document.querySelector('#cmp').getAttribute('aria-pressed') === 'true'"); pg.click('#cmp'); pg.wait_for_timeout(200)
    ok(t0 == ['40.0', '−40.0'] and '(40.0)' in t1 and '(−40.0)' in t1 and '(40.0)' in t2 and '(−40.0)' in t2 and '−3.9 (0)' in t2 and on_, f'portal with both corners hinged, 10 kN/m along the roof kept (N from +40 to −40 kN), then 5 kN/m downward and the hinge at C closed: “Compare” stays on, the roof carries −3.9 kN, and the kept +40.0 and −40.0 stay on the sheet in brackets: {t0} {t1} {t2}')
    # C114 (left open by review 11) two loads at one place that cancel make no step and no kink: the rules speak of the forces at one place together
    pre('simple-w', "m.loads = [{ id: 1, m: 0, a: 3, P: 20, ang: 90 }, { id: 2, m: 0, a: 3, P: 20, ang: -90 }]", 'M', 1100); rm = rule('kink')
    z = J("() => { const s = __lab.st.sol, F = __lab.FS.forcesAt, M = s.mem[0]; return [F(M, 3, -1).V, F(M, 3, 1).V, F(M, 3, -1).M].map(v => Math.round(v * 1e6) / 1e6); }")
    pg.click('#tab-V'); pg.wait_for_timeout(900); rv = rule('leave no step'); cd = next((x.inner_text().replace('\n', ' ') for x in pg.query_selector_all('#learn .card') if 'how its shear line is built' in x.inner_text()), '')
    ok(z == [0, 0, 45] and 'The line has a kink where the forces across the axis at one place do not cancel: point loads and a support reaction there, an inclined force with its part across. Forces that cancel, and a force along the axis, make none.' in rm
       and 'Where point loads stand at one place the shear steps by their sum across the beam, an inclined load with its part across. Loads that cancel there leave no step.' in rv
       and 'Loads at one place count together: V steps by their sum there, and not at all where they cancel.' in cd, f'6 m beam with 10 kN/m and 20 kN upward and 20 kN downward at midspan: V is 0 on both sides of them and M = 45.0 kNm runs through smoothly; the rules on the kink and on the step, and the card of the member, speak of the forces at one place together: {z} {rm[-150:]!r} {rv[-120:]!r} {cd[:200]!r}')
    pre('simple-p', '', 'V', 900); cd1 = next((x.inner_text().replace('\n', ' ') for x in pg.query_selector_all('#learn .card') if 'how its shear line is built' in x.inner_text()), '')
    ok('Point load: V steps by P at the load' in cd1 and 'count together' not in cd1, f'one point load: the card of the member says that V steps by P at the load, without the sentence on loads at one place: {cd1[:160]!r}')
    # C130 a load value and a reaction in a crowded sheet: both can be read
    pre('truss', "L.st.sec = 0; " + case('truss', 'IPE 200, first bottom chord with 500 kN/m to the right and six loads'), 'N', 1100); r_ = rects()
    a_ = [q for q in r_ if q[0] == '500.0 kN/m']; b_ = [q for q in r_ if q[0] == '158.9 kN']
    ok(len(a_) == 1 and len(b_) == 1 and not any(meet(a_[0], q) for q in r_ if q is not a_[0]) and not any(meet(b_[0], q) for q in r_ if q is not b_[0]), f'truss with 500 kN/m along the first bottom chord and six loads on it, tab axial force at 1500 px: the value 500.0 kN/m and the reaction 158.9 kN each stand clear of every other text: {a_} {b_}')
    TAG = '[version 16] '
    # the button for the light and the dark sheet: as the computer has it until it is used, then as chosen, and kept
    TH = "() => [document.querySelector('#theme').getAttribute('aria-pressed'), document.documentElement.dataset.theme || null, getComputedStyle(document.body).backgroundColor, (JSON.parse(localStorage.getItem('statics-lab') || '{}').theme) || null]"
    th0 = J(TH); pg.click('#theme'); pg.wait_for_timeout(400); th1 = J(TH); pg.reload(); pg.wait_for_timeout(900); th2 = J(TH); pg.click('#theme'); pg.wait_for_timeout(400); th3 = J(TH)
    ok(th0[:3] == ['false', None, 'rgb(255, 255, 255)'] and th1 == ['true', 'dark', 'rgb(15, 19, 23)', 'dark'] and th2 == th1 and th3 == ['false', 'light', 'rgb(255, 255, 255)', 'light'], f'button “Dark”: the page starts as the computer has it (light), turns dark on a click, is dark again after the page is loaded anew, and turns light on the next click: {th0} {th1} {th2} {th3}')
    TAG = '[version 17] '
    # the relation of each line in a row under its strip, in words too; the rows end above the foot of the sheet
    GEO = "() => { const V = __lab.VW, f = document.querySelector('.foot').getBoundingClientRect(), c = document.querySelector('canvas').getBoundingClientRect(); return { rows: V.rows, plots: (V.plots || []).map(p => [p.k, p.y, p.h, V.rel && V.rel[p.k] ? V.rel[p.k].y : null]), foot: f.top - c.top, dimY: V.dimY, rowY: V.rowY || null }; }"
    pg.mouse.move(5, 5); pre('simple-w', 'L.st.sec = 2', 'M'); s_ = J(SAID); g_ = J(GEO)   # IPE 300 again, after the states of review 11
    ok(g_['rows'] and s_ == {'V': ['V′ = −q', 'per metre V changes by −q'], 'M': ['M′ = V', 'per metre M changes by V'], 'D': ['w′ = θ', 'per metre w changes by θ', 'EI·w″ = −M']},
       f'simple beam, mouse off the sheet: under each line its relation and the same in words: {s_}')
    ok(all(q[3] is not None and q[1] + q[2] < q[3] - 9 and q[3] + 12 <= (g_['plots'][i + 1][1] if i + 1 < len(g_['plots']) else g_['foot']) for i, q in enumerate(g_['plots'])), f'each row stands under its strip, above the next strip and above the foot of the sheet: {g_}')
    pre('simple-p', 'm.loads = [{ id: 1, m: 0, a: 2, P: 20, ang: -45 }]', 'N'); s_ = J(SAID); g_ = J(GEO)
    ok(g_['rows'] and s_['N'] == ['N′ = −n', 'per metre N changes by −n', '+ tension, − compression'] and len(g_['plots']) == 4 and min(q[2] for q in g_['plots']) >= 50, f'inclined load, four lines: the row of N, and no strip lower than 50 px: {s_["N"]} {[round(q[2]) for q in g_["plots"]]}')
    # the pieces of a row are written on the sheet as the page says it wrote them
    t = probe('two-span', 3.4); s_ = J(SAID)
    ok(s_ == {'V': ['V′ = −q = −10.0 kN/m', 'here V changes by −10.0 kN per metre'], 'M': ['M′ = V = −15.3 kN', 'here M changes by −15.3 kNm per metre'], 'D': ['w′ = θ = −1.0 mrad', 'here w changes by −1.0 mm per metre', 'EI·w″ = −M = −6.0 kNm']}
       and {'M′', 'V′', 'w′', 'EI·w″', '−q', '−M', 'θ', '−10.0 kN/m', '−15.3 kN', '−15.3 kNm', '−1.0 mrad', '−1.0 mm', '−6.0 kNm', ' per metre', ' changes by '} <= t, f'two-span beam at 3.40 m: the three rows with the numbers of the place, piece by piece on the sheet: {s_}')
    # the number behind a relation is the number of the line it names, and the rate at which the line changes there:
    # at 30 places of four beams, against the box of the line named and against the line itself read 1 mm before and behind
    FD = "(h) => { const L = __lab, a = L.st.probeAt, M = L.st.sol.mem[a.mi], x = a.a; if (a.kind !== 'place' || x < 0.02 || x > M.L - 0.02) return null; const f = q => L.FS.forcesAt(M, q, -1), w = q => -L.FS.interp(M.smp, 'dY', q, -1); return { dV: (f(x + h).V - f(x - h).V) / (2 * h), dM: (f(x + h).M - f(x - h).M) / (2 * h), dw: (w(x + h) - w(x - h)) / (2 * h) * 1000 }; }"
    num = lambda v: float(v.replace('\u2212', '-'))
    worst, n_, links = 0.0, 0, []
    for pid, js in (('simple-t', ''), ('two-span', 'm.members[1].udl.ang = 90'), ('gerber', 'm.loads = [{ id: 1, m: 1, a: 0.75, P: 30, ang: -90 }]'), ('overhang', '')):
        pre(pid, js, 'M'); r = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + V.x0 * V.s, (V.x1 - V.x0) * V.s, c.y + V.yB + 140]; }")
        for k in range(30):
            pg.mouse.move(r[0] + r[1] * (k + 0.37) / 30, r[2]); pg.wait_for_timeout(90); rd = J("() => __lab.st.probeRead"); fd = J(FD, 0.001)
            if not rd or not fd: continue
            R = rd['rows']
            if R['M']['rel']['left'] != R['V']['left'] or R['M']['rel']['right'] != R['V']['right'] or num(R['D']['rel']['minusM']) != -num(R['M']['left']): links.append((pid, k, R['M'], R['V'], R['D']))
            if R['V']['rel']['right'] is None and R['M']['rel']['right'] is None and R['D']['rel']['right'] is None:
                n_ += 1; worst = max(worst, abs(num(R['V']['rel']['left']) - fd['dV']), abs(num(R['M']['rel']['left']) - fd['dM']), abs(num(R['D']['rel']['left']) - fd['dw']))
    ok(not links, f'four beams, 30 places each: the number behind M′ = V is the shear of the box of V, on both sides where it has two, and the number behind EI·w″ = −M is the moment of the box of M with the other sign: {links[:3]}')
    ok(n_ >= 90 and worst <= 0.0501, f'at {n_} of these places, away from loads and joints: the numbers behind V′, M′ and w′ are the change of V, M and w per metre there, read from the lines 1 mm before and behind the place; largest difference {worst:.4f} (a number printed with one decimal: up to 0.05)')
    # the triangle on the line of the open tab: over its base the line changes by the number at its upright
    pg.mouse.move(5, 5); t = probe('simple-w', 1.5); rd = J("() => __lab.st.probeRead"); tr = rd.get('tri')
    ok(tr == {'key': 'M', 'base': 1, 'change': '15.0', 'unit': 'kNm', 'side': 'right'} and rd['rows']['M']['rel']['left'] == '15.0' and {'1 m', '+15.0 kNm'} <= t, f'simple beam under 10 kN/m at 1.50 m, tab moment: a triangle with a base of 1 m and an upright of +15.0 kNm, the shear there: {tr}')
    t = probe('simple-w', 5.9); tr = J("() => __lab.st.probeRead").get('tri')
    ok(tr == {'key': 'M', 'base': 1, 'change': '−29.0', 'unit': 'kNm', 'side': 'left'}, f'at 5.90 m, 10 cm before the end: the triangle stands to the left, where it has its base of 1 m, with the shear of −29.0 kN there: {tr}')
    pre('simple-w', 'm.nodes[1].x = 1.5', 'M'); g = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 0.9 * V.s, c.y + V.yB + 140]; }")
    pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(300); rd = J("() => __lab.st.probeRead") or {}; tr = rd.get('tri')
    ok(tr == {'key': 'M', 'base': 0.5, 'change': '−0.8', 'unit': 'kNm', 'side': 'right'} and rd['rows']['M']['rel']['left'] == '−1.5', f'a beam of 1.50 m under 10 kN/m at 0.90 m, where neither side has 1 m of beam: the base is 0.5 m and the upright half the shear of −1.5 kN, printed −0.8 kNm: {tr}')
    pg.mouse.move(5, 5)
    t = probe('simple-w', 3.0, 'V'); tr = J("() => __lab.st.probeRead").get('tri')
    ok(tr == {'key': 'V', 'base': 1, 'change': '−10.0', 'unit': 'kN', 'side': 'right'}, f'tab shear: the triangle on the shear line, −10.0 kN over 1 m: {tr}')
    # a frame and a truss: one row under the structure for the open tab, with the numbers of the place under the mouse
    pg.mouse.move(5, 5); pre('portal-g', '', 'M'); s0 = J(SAID); g_ = J(GEO)
    c_ = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), g = __lab.MG[1]; return [c.x + g.ax + (g.bx - g.ax) * 0.3, c.y + g.ay + (g.by - g.ay) * 0.3]; }")
    pg.mouse.move(c_[0], c_[1]); pg.wait_for_timeout(300); t = sheet(); s1 = J(SAID); rd = J("() => __lab.st.probeRead")
    ok(s0 == {'M': ['M′ = V', 'per metre along a member M changes by V']} and s1 == {'M': ['M′ = V = 24.0 kN', 'here M changes by +24.0 kNm per metre']} and rd['rows']['V']['left'] == '24.0' and rd['rel'] == {'key': 'M', 'of': 'V', 'left': '24.0', 'right': None} and '24.0 kN' in t,
       f'portal frame, tab moment: the row M′ = V under the structure; with the mouse on the beam at 2.40 m the shear of that place, 24.0 kN, stands in it: {s0} {s1}')
    ok(g_['rows'] and g_['rowY'] - 12 >= g_['dimY'] + 6 and g_['rowY'] + 12 <= g_['foot'], f'the row of a frame stands under the dimension of the structure and above the foot of the sheet: {g_["dimY"]:.0f} {g_["rowY"]:.0f} {g_["foot"]:.0f}')
    pg.mouse.move(5, 5); pg.click('#tab-V'); pg.wait_for_timeout(700); sv = J(SAID); pg.click('#tab-N'); pg.wait_for_timeout(700); sn = J(SAID); pg.click('#tab-D'); pg.wait_for_timeout(700); sd_ = J(SAID)
    ok(sv == {'V': ['V′ = −q', 'per metre along a member V changes by −q']} and sn == {'N': ['N′ = −n', 'per metre along a member N changes by −n', '+ tension, − compression']} and sd_ == {'D': ['w′ = θ', 'per metre along a member w changes by θ', 'EI·w″ = −M']}, f'portal frame, the rows of the tabs shear, axial force and displacement: {sv} {sn} {sd_}')
    pre('truss', '', 'N'); sn = J(SAID); pg.click('#tab-M'); pg.wait_for_timeout(700); sm = J(SAID); pg.click('#tab-D'); pg.wait_for_timeout(700); sd_ = J(SAID)
    ok(sn == {'N': ['N′ = −n', 'per metre along a member N changes by −n', '+ tension, − compression']} and sm is None and sd_ is None, f'truss: the row of N in the tab of the axial force, no row in the tabs moment and displacement: {sn} {sm} {sd_}')
    # with rows no strip of a beam is lower than 50 px; where the sheet is too low for that it has no rows
    low_ = []
    for vw, vh in ((1280, 720), (1366, 768), (1536, 864), (1920, 1080), (1100, 640), (1100, 560)):
        pg.set_viewport_size({'width': vw, 'height': vh}); pg.wait_for_timeout(250)
        for pid, js in (('two-span', ''), ('simple-p', 'm.loads = [{ id: 1, m: 0, a: 2, P: 20, ang: -45 }]')):
            for q in 'MVND':
                pre(pid, js, q, 500); g_ = J(GEO)
                if g_['rows'] and (min(x[2] for x in g_['plots']) < 50 or any(x[3] is None for x in g_['plots']) or g_['plots'][-1][3] + 12 > g_['foot']): low_.append((vw, vh, pid, q, [round(x[2]) for x in g_['plots']]))
                if not g_['rows'] and vh >= 864: low_.append((vw, vh, pid, q, 'no rows'))
    pg.set_viewport_size({'width': 1500, 'height': 900}); pg.wait_for_timeout(250)
    ok(not low_, f'windows from 1100 x 560 to 1920 x 1080, two-span beam and a beam with an inclined load, four tabs: where the sheet has rows every strip is 50 px high or more and the last row ends above the foot; a window of 864 px or more has rows: {low_[:4]}')
    TAG = '[version 18] '
    # --- the 3D view (version 18): the structure as a body beside the sheet, and the member cut open at the place of the probe
    V3S = "() => __lab.V3.state"
    GEO3 = "() => { const a = document.querySelector('#stage').getBoundingClientRect(), b = document.querySelector('#v3').getBoundingClientRect(); return [Math.round(a.width), Math.round(b.width), Math.round(b.height), document.querySelector('.app').hasAttribute('data-v3'), getComputedStyle(document.querySelector('#learn')).display, document.querySelector('#v3d').getAttribute('aria-pressed'), Math.round(document.querySelector('header').getBoundingClientRect().height)]; }"
    pg.mouse.move(5, 5); pre('simple-w', 'L.st.sec = 2', 'M'); g0 = J(GEO3); pg.click('#v3d'); pg.wait_for_timeout(900); s3 = J(V3S); g3 = J(GEO3)
    ok(s3['on'] and not s3['failed'] and s3['ok'] and s3['tris'] > 1000 and s3['cut'] is None and len(s3['views']) == 1 and s3['labels'] == ['A', 'B'] and g3[0] >= 560 and g3[1] >= 380 and g3[2] >= 300 and g3[3] and g3[4] == 'none' and g3[5] == 'true' and g0[4] != 'none' and g0[5] == 'false' and g3[6] == g0[6],
       f'button “3D” on a simple beam: the body stands beside the sheet in the place of the cards, drawn with {s3["tris"]} triangles, with the letters of the joints; the sheet keeps {g3[0]} px, the header its height: {g0} {g3}')
    # the colours go by the largest normal stress of the structure, the bent shape by the factor of the sheet
    want = J("() => { const L = __lab, s = L.SECTIONS[L.st.sec], W = L.sectionMore(s).W; let m = 0; for (const M of L.st.sol.mem) for (let i = 0; i < M.smp.xs.length; i++) m = Math.max(m, Math.abs(M.smp.N[i]) * 10 / s.A + Math.abs(M.smp.M[i]) * 1e3 / W); return [m, L.VW.dAmp / L.st.ext.D / L.VW.s, W]; }")
    ok(abs(s3['smax'] - want[0]) < 1e-9 and abs(s3['smax'] - 45.0e3 / want[2]) < 1e-9 and f'{want[2]:.1f}' == '557.1' and f'{s3["smax"]:.1f}' == '80.8' and abs(s3['mag'] - want[1]) < 1e-9 * want[1], f'6 m beam of IPE 300 under 10 kN/m: the largest normal stress is M/W = 45.0 kNm / 557.1 cm³ = 80.8 N/mm², with the W of the window of the section, and the bent shape has the factor of the sheet: {s3["smax"]:.4f} {s3["mag"]:.3f} {want}')
    # the probe on the sheet cuts the member there: the two edge stresses are N/A − M/W and N/A + M/W of the forces at that place
    EXACT = "() => { const L = __lab, c = L.V3.state.cut, M = L.st.sol.mem[c.mi], mb = L.st.model.members[c.mi], s = L.SECTIONS[mb.sec === null || mb.sec === undefined ? L.st.sec : mb.sec], f = L.FS.forcesAt(M, c.a, c.a <= 1e-9 ? 1 : -1), sn = f.N * 10 / s.A, sm = f.M * 1e3 / L.sectionMore(s).W; return { N: f.N, M: f.M, top: sn - sm, bot: sn + sm, W: L.sectionMore(s).W }; }"
    g = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 2 * V.s, c.y + V.yB + 140]; }")
    pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(500); s3 = J(V3S); ex = J(EXACT)
    ok(s3['cut'] == {'mi': 0, 'a': 2} and len(s3['views']) == 2 and abs(s3['info']['M'] - 40) < 1e-9 and abs(s3['info']['top'] - ex['top']) < 1e-9 and abs(s3['info']['bot'] - ex['bot']) < 1e-9 and abs(ex['bot'] - 40e3 / ex['W']) < 1e-9
       and s3['labels'] == ['A', 'B', 'σ = 0', 'σ = −71.8 N/mm², compression', 'σ = +71.8 N/mm², tension'], f'the probe at 2.00 m: the beam is cut there, M = 40.0 kNm, and the body of the stress has −71.8 N/mm² at the top and +71.8 at the bottom (40.0 kNm / 557.1 cm³), with the fibre of no stress between: {s3["info"]} {s3["labels"]}')
    # the cut stays when the mouse leaves the sheet, so that the view can be turned; the button closes it
    c3 = J("() => { const r = document.querySelector('#cv3').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.25, r.y + r.height * 0.8]; }")
    pg.mouse.move(c3[0], c3[1]); pg.wait_for_timeout(300); st1 = J(V3S)
    pg.mouse.down(); pg.mouse.move(c3[0] + 80, c3[1] - 40, steps=4); pg.mouse.up(); pg.wait_for_timeout(200); st2 = J(V3S)
    pg.mouse.wheel(0, -300); pg.wait_for_timeout(200); st3 = J(V3S); pg.mouse.move(c3[0], c3[2]); pg.mouse.wheel(0, -300); pg.wait_for_timeout(200); st4 = J(V3S)
    pg.mouse.dblclick(c3[0], c3[1]); pg.wait_for_timeout(250); st5 = J(V3S)
    ok(st1['cut'] == {'mi': 0, 'a': 2} and abs(st2['cam']['yaw'] - (0.6 - 0.64)) < 1e-6 and abs(st2['cam']['pitch'] - (0.26 - 0.32)) < 1e-6 and st3['cam']['zoom'] > 1.3 and st3['cam']['zd'] == 1 and st4['cam']['zd'] > 1.3 and st4['cam']['zoom'] == st3['cam']['zoom'] and st5['cam'] == {'yaw': 0.6, 'pitch': 0.26, 'zoom': 1, 'zd': 1, 'px': 0, 'py': 0} and st5['cut'] == {'mi': 0, 'a': 2},
       f'with the mouse on the 3D view the cut stays; a drag of 80 px and 40 px turns the view by 0.64 and 0.32, the wheel brings the part of the view under it nearer, a double click brings the start view back: {st2["cam"]} {st3["cam"]} {st4["cam"]}')
    pg.click('#v3x'); pg.wait_for_timeout(300); st6 = J(V3S); ok(st6['cut'] is None and len(st6['views']) == 1 and st6['labels'] == ['A', 'B'], f'“Close the cut”: the view shows the structure alone again: {st6["cut"]} {st6["labels"]}')
    # a member of a frame with an axial force, and a bar of a truss
    pre('portal-g', '', 'M'); c_ = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), g = __lab.MG[1]; return [c.x + g.ax + (g.bx - g.ax) * 0.3, c.y + g.ay + (g.by - g.ay) * 0.3]; }")
    pg.mouse.move(c_[0], c_[1]); pg.wait_for_timeout(500); s3 = J(V3S); ex = J(EXACT)
    ok(s3['cut']['mi'] == 1 and abs(s3['info']['top'] - ex['top']) < 1e-9 and abs(s3['info']['bot'] - ex['bot']) < 1e-9 and abs(s3['info']['N'] - ex['N']) < 1e-9 and {'σ = −70.5 N/mm², compression', 'σ = +61.6 N/mm², tension', 'σ = 0'} <= set(s3['labels']),
       f'portal frame, the beam at 2.40 m with N = −24.0 kN and M = 36.8 kNm: −4.5 − 66.1 = −70.5 N/mm² at the top and −4.5 + 66.1 = +61.6 at the bottom: {s3["info"]}')
    pre('truss', '', 'N'); c_ = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), g = __lab.MG[3]; return [c.x + (g.ax + g.bx) / 2, c.y + (g.ay + g.by) / 2]; }")
    pg.mouse.move(c_[0], c_[1]); pg.wait_for_timeout(500); s3 = J(V3S); ex = J(EXACT)
    ok(s3['cut']['mi'] == 3 and abs(s3['info']['top'] - ex['top']) < 1e-9 and abs(ex['top'] - 30 * 10 / 53.8) < 1e-9 and [x for x in s3['labels'] if x.startswith('σ')] == ['σ = +5.6 N/mm², tension'], f'truss, a bottom chord with N = 30.0 kN: the same stress at every fibre, N/A = 30.0 kN / 53.8 cm² = +5.6 N/mm², written once: {[x for x in s3["labels"] if x.startswith("σ")]}')
    # tab shear: the cut shows the shear stress τ = V·S/(I·t); S is worked out here from the dimensions of the IPE 300 and
    # is half its plastic section modulus of 628.4 cm³
    import math
    S_ = (150 * 10.7 * (150 - 5.35) + 7.1 * 139.3 ** 2 / 2 + 2 * (1 - math.pi / 4) * 15 ** 2 * (139.3 - (5 / 6 - math.pi / 4) / (1 - math.pi / 4) * 15)) / 1000
    pg.mouse.move(5, 5); pre('simple-w', '', 'V'); g = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 1 * V.s, c.y + V.yB + 140]; }")
    pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(500); s3 = J(V3S)
    ok(s3['info']['kind'] == 'tau' and abs(s3['info']['S'] - S_) < 1e-9 and abs(S_ - 628.4 / 2) < 0.05 and abs(s3['info']['V'] - 20) < 1e-9 and abs(s3['info']['tau'] - 20 * S_ / (8356 * 7.1) * 100) < 1e-9 and abs(s3['tmax'] - 30 * S_ / (8356 * 7.1) * 100) < 1e-9 and [x for x in s3['labels'] if x[0] in 'στ'] == ['τ = 10.6 N/mm²'],
       f'tab shear, the beam cut at 1.00 m with V = 20.0 kN: the body of the shear stress, largest at the middle of the web with V·S/(I·t) = 20.0 · {S_:.1f} / (8356 · 7.1) · 100 = 10.6 N/mm²; S = {S_:.2f} cm³ is half the plastic modulus of 628.4 cm³; the largest of the beam is 15.9 N/mm² at the supports: {s3["info"]["tau"]:.4f} {s3["tmax"]:.4f} {s3["labels"]}')
    # every example in every tab with the 3D view on and the probe on a member: a picture, and no script error
    bad3 = []
    for pid in [x[0] for x in J("() => [...document.querySelectorAll('.pre')].map(e => [e.dataset.id])")]:
        pg.mouse.move(5, 5); pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(200)
        for q in 'MVND':
            pg.click(f'#tab-{q}'); pg.wait_for_timeout(250)
            c_ = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), V = __lab.VW, g = __lab.MG[0]; return V.beam ? [c.x + V.ox + (V.x0 + 0.37 * (V.x1 - V.x0)) * V.s, c.y + V.yB + 140] : [c.x + g.ax + (g.bx - g.ax) * 0.37, c.y + g.ay + (g.by - g.ay) * 0.37]; }")
            pg.mouse.move(c_[0], c_[1]); pg.wait_for_timeout(250); z = J(V3S)
            if z['failed'] or not z['ok'] or z['tris'] < 300 or z['cut'] is None or len(z['views']) != 2 or not any(x.startswith('τ' if q == 'V' else 'σ') for x in z['labels']): bad3.append((pid, q, z['failed'], z['tris'], z['cut']))
    ok(not bad3 and not errs, f'the 16 examples in four tabs with the 3D view on and the probe on a member: each is drawn and cut, with its stress written, and the page reports no script error: {bad3[:4]} {errs[:2]}')
    # a mechanism is drawn as it stands, without a cut; the choice of the 3D view is kept
    pg.mouse.move(5, 5); pre('simple-p', "m.nodes[0].sup = 'roller'", 'M'); z = J(V3S)
    ok(z['ok'] is False and z['cut'] is None and z['tris'] > 300 and z['labels'] == ['A', 'B'], f'a beam on two rollers, a mechanism: the 3D view draws it as it stands, without colours of stress and without a cut: {z["ok"]} {z["tris"]}')
    pg.reload(); pg.wait_for_timeout(1200); z1 = J(V3S); pg.click('#v3d'); pg.wait_for_timeout(400); z2 = J(V3S); g2 = J(GEO3); pg.reload(); pg.wait_for_timeout(900); z3 = J(V3S)
    ok(z1['on'] and not z2['on'] and g2[4] != 'none' and g2[5] == 'false' and not z3['on'], f'the 3D view is on again after the page is loaded anew; a click on “3D” brings the cards back, and that is kept too: {z1["on"]} {z2["on"]} {g2[4]} {z3["on"]}')
    TAG = '[version 19] '
    # --- the turn of the deflection line (version 19): where the rotation is zero the line turns; a flat dashed tangent marks the
    # place and a note says so. The largest deflection lies there, not under the largest moment
    NOTE = lambda r: sorted(x for x in r if x[0].startswith('θ = 0: '))
    AT = "(xs) => { const V = __lab.VW, p = V.plots.find(q => q.k === 'D'), c = document.querySelector('canvas').getBoundingClientRect(); return { x: xs.map(x => V.ox + x * V.s), y0: p.y, y1: p.y + p.h, cx: c.x, cy: c.y }; }"
    near = lambda n, x: n[1] - 40 <= x <= n[3] + 40
    free_ = lambda n, r: not any(meet(n, x) for x in r if x is not n)
    pg.mouse.move(5, 5); pre('simple-p', 'L.st.sec = 2; m.loads = [{ id: 1, m: 0, a: 2, P: 20, ang: -90 }]', 'M'); r_ = rects(); n_ = NOTE(r_); a_ = J(AT, [2.734, 2.0, 2.75]); t_ = {x[0] for x in r_}
    ok(len(n_) == 1 and n_[0][0] == 'θ = 0: peak of w' and near(n_[0], a_['x'][0]) and a_['y0'] <= n_[0][2] and n_[0][4] <= a_['y1'] and free_(n_[0], r_) and {'4.4', '4.1', '26.7'} <= t_,
       f'simple beam of 6 m, 20 kN at 2.00 m, tab moment: the note “θ = 0: peak of w” stands once, in the strip of the deflection at the turn at 2.73 m and on no other text; the line carries 4.4 mm there and 4.1 mm under the load, where the moment has its peak of 26.7 kNm: {n_} {a_}')
    pg.mouse.move(a_['cx'] + a_['x'][2], a_['cy'] + (a_['y0'] + a_['y1']) / 2); pg.wait_for_timeout(450); s_ = J(SAID); pr_ = J("() => __lab.st.probeRead && __lab.st.probeRead.rows.D")
    ok(s_ and s_['D'] and s_['D'][:2] == ['w′ = θ = 0.0 mrad', 'here w changes by 0.0 mm per metre'] and pr_ and pr_['left'] == '4.4' and pr_['unit'] == 'mm', f'the probe beside that turn, at 2.75 m: the row of the deflection reads w′ = θ = 0.0 mrad, and w is 4.4 mm, the largest of the line: {s_ and s_["D"]} {pr_}')
    n4_ = NOTE(rects()); x5_ = J(AT, [5.0])['x'][0]; pg.mouse.move(a_['cx'] + x5_, a_['cy'] + (a_['y0'] + a_['y1']) / 2); pg.wait_for_timeout(450); n5_ = NOTE(rects())
    ok(n4_ == [] and len(n5_) == 1 and n5_[0][0] == 'θ = 0: peak of w', f'while the probe stands at that turn its box takes the place and the note is left out; with the probe at 5.00 m the note stands again: {n4_} {n5_}')
    pg.mouse.move(a_['cx'] + a_['x'][1], a_['cy'] + (a_['y0'] + a_['y1']) / 2); pg.wait_for_timeout(450); s_ = J(SAID); pr_ = J("() => __lab.st.probeRead && __lab.st.probeRead.rows")
    ok(s_ and s_['D'] and s_['D'][:2] == ['w′ = θ = 1.0 mrad', 'here w changes by +1.0 mm per metre'] and pr_ and pr_['D']['left'] == '4.1' and pr_['M']['left'] == '26.7',
       f'the probe under the load, at the peak of the moment (26.7 kNm): the line still falls there by 1.0 mm per metre (θ = P·a·b·(b − a) / (3·EI·L) = 1.0 mrad), and w is 4.1 mm: {s_ and s_["D"]}')
    pg.mouse.move(5, 5); pg.click('#tab-D'); pg.wait_for_timeout(900); n2_ = NOTE(rects()); pg.click('#tab-V'); pg.wait_for_timeout(900); n3_ = NOTE(rects())
    ok(len(n2_) == 1 and n2_[0][0] == 'θ = 0: peak of w' and n3_ == [], f'the note stands in the tabs moment and deflection, and not in the tab shear: {n2_} {n3_}')
    pg.click('#tab-D'); pg.wait_for_timeout(500); t_ = pg.inner_text('#learn')
    ok('Where the rotation changes sign the deflection line turns: a peak, or a low point between two peaks. That is often not the place of the largest moment.' in t_, 'tab deflection of a beam: the rules say that the line turns where the rotation changes sign, and that this is often not the place of the largest moment')
    pre('simple-p', 'L.st.sec = 2; L.st.vals = false; m.loads = [{ id: 1, m: 0, a: 2, P: 20, ang: -90 }]', 'M'); r_ = rects(); n_ = NOTE(r_)
    ok(len(n_) == 1 and '4.4' not in {x[0] for x in r_}, f'with the values of the lines switched off the note still stands: {n_}')
    pre('simple-p', 'L.st.sec = 2; L.st.vals = true; m.loads = [{ id: 1, m: 0, a: 1, P: 20, ang: -90 }, { id: 2, m: 0, a: 5, P: 20, ang: -90 }, { id: 3, m: 0, a: 3, P: 18, ang: 90 }]', 'D'); r_ = rects(); n_ = NOTE(r_); a_ = J(AT, [1.444, 3.0, 4.556]); t_ = {x[0] for x in r_}
    ok([x[0] for x in n_] == ['θ = 0: low point of w', 'θ = 0: peak of w'] and near(n_[0], a_['x'][1]) and (near(n_[1], a_['x'][0]) or near(n_[1], a_['x'][2])) and all(free_(x, r_) for x in n_) and {'0.5', '0.3'} <= t_,
       f'two loads of 20 kN down at 1 m and 5 m and 18 kN up at 3 m: the line has two peaks of 0.5 mm and between them a low point of 0.3 mm on the same side of the axis; “peak of w” stands once at a peak, “low point of w” at 3.00 m, on no other text: {n_} {a_}')
    got_ = {}
    for pid_ in ('cantilever', 'two-span', 'overhang', 'fixed', 'gerber'):
        pre(pid_, 'L.st.sec = 2', 'D'); got_[pid_] = [x[0] for x in NOTE(rects())]
    ok(got_ == {'cantilever': [], 'two-span': ['θ = 0: peak of w'], 'overhang': ['θ = 0: peak of w'], 'fixed': ['θ = 0: peak of w'], 'gerber': ['θ = 0: peak of w']},
       f'the cantilever has no turn (its largest deflection is at the free end, where θ is not zero) and no note; the two-span beam, the overhang, the fixed beam and the Gerber beam say “peak of w” once: {got_}')
    pre('portal-g', '', 'D'); n_ = NOTE(rects()); t_ = pg.inner_text('#learn')
    ok(n_ == [] and 'Where the rotation changes sign' not in t_, f'a frame carries no such note and its rules stay as they were: {n_}')
    # --- the words of the cut view stand outside the body of the stress (version 19): no edge of the body runs through them
    WR = lambda z: {t: (x, y, hw) for t, x, y, hw in (z['wrote'] or [])}
    pre('simple-w', 'L.st.sec = 2', 'M'); pg.click('#v3d'); pg.wait_for_timeout(900)
    g = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 2 * V.s, c.y + V.yB + 150]; }"); pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(700); z = J(V3S); w_ = WR(z); bd = z['body']
    top_, bot_, nul_ = w_.get('σ = −71.8 N/mm², compression'), w_.get('σ = +71.8 N/mm², tension'), w_.get('σ = 0')
    ok(bd and top_ and bot_ and nul_ and top_[1] + 8 <= bd[1] and bot_[1] - 8 >= bd[3] and bd[1] + 8 < nul_[1] < bd[3] - 8 and nul_[0] - nul_[2] > bd[0],
       f'simple beam cut at 2.00 m: the stress of the top fibre is written above the body of the stress, that of the bottom fibre under it, and “σ = 0” between the two, before the cut face: body {bd}, words {z["wrote"]}')
    c3 = J("() => { const r = document.querySelector('#cv3').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.25]; }")
    pg.mouse.move(c3[0], c3[1]); pg.wait_for_timeout(200); pg.mouse.down(); pg.mouse.move(c3[0] - 120, c3[1] + 30, steps=4); pg.mouse.up(); pg.wait_for_timeout(300); z2 = J(V3S); w2 = WR(z2); b2 = z2['body']
    ok(z2['cam']['yaw'] != z['cam']['yaw'] and b2 != bd and w2['σ = −71.8 N/mm², compression'][1] + 8 <= b2[1] and w2['σ = +71.8 N/mm², tension'][1] - 8 >= b2[3],
       f'after the view is turned the two words stand above and under the body again: body {b2}, words {z2["wrote"]}')
    pg.mouse.dblclick(c3[0], c3[1]); pg.wait_for_timeout(300)
    pg.click('#tab-V'); pg.wait_for_timeout(500); pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(700); z = J(V3S); w_ = WR(z); bd = z['body']; tk = [k for k in w_ if k.startswith('τ = ')]
    ok(bd and len(tk) == 1 and w_[tk[0]][0] - w_[tk[0]][2] >= bd[2] - 5 and bd[1] < w_[tk[0]][1] < bd[3], f'the same cut in the tab shear: “{tk and tk[0]}” stands beside the body of the shear stress, at its height: body {bd}, words {z["wrote"]}')
    pre('portal-g', '', 'M'); c_ = J("() => { const c = document.querySelector('#cv').getBoundingClientRect(), g = __lab.MG[0]; return [c.x + (g.ax + g.bx) / 2, c.y + (g.ay + g.by) / 2]; }")
    pg.mouse.move(c_[0], c_[1]); pg.wait_for_timeout(800); z = J(V3S); w_ = WR(z); bd = z['body']; sg = sorted((v[1], k) for k, v in w_.items() if k.startswith('σ = ') and k != 'σ = 0')
    ok(bd and len(sg) == 2 and sg[1][0] + 8 <= bd[1] and sg[1][0] - sg[0][0] >= 17, f'a column of the portal cut at its middle: the body stands on the cut face, and the two words stand above it, one over the other: body {bd}, words {z["wrote"]}')
    pg.mouse.move(5, 5); pg.click('#v3d'); pg.wait_for_timeout(300)
    pre('simple-p', 'L.st.sec = 2', 'M')
    TAG = '[version 20] '
    # --- the body of the stress at the cut keeps one size (version 20): along the member and while a load changes only its
    # numbers change; the framing of the cut view stays the same, also near the start of the member and where there is no stress
    same_ = lambda a, b: a and b and all(abs(x - y) <= 0.5 for x, y in zip(a, b))
    def cut_(xm, wait=700):
        g = J("(x) => { const c = document.querySelector('#cv').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + x * V.s, c.y + V.yB + 150]; }", xm)
        pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(wait); z = J(V3S); return z['body'], [w[0] for w in (z['wrote'] or [])], z
    pg.mouse.move(5, 5); pre('simple-w', 'L.st.sec = 2', 'M'); pg.click('#v3d'); pg.wait_for_timeout(900)
    b1, w1, _ = cut_(2.0); b2, w2, _ = cut_(0.3); b3, w3, _ = cut_(4.5)
    ok(same_(b1, b2) and same_(b1, b3) and 'σ = −71.8 N/mm², compression' in w1 and 'σ = −15.3 N/mm², compression' in w2 and 'σ = −60.6 N/mm², compression' in w3,
       f'simple beam under 10 kN/m cut at 2.00 m, at 0.30 m and at 4.50 m: the body of the stress has the same size and place in the view of the cut, and its numbers are −71.8, −15.3 and −60.6 N/mm²: {b1} {b2} {b3} {w2} {w3}')
    b0, w0, _ = cut_(0.0)
    ok(b0 is None and w0 == ['σ = 0.0 N/mm²'], f'the cut at the support, where the moment is zero: no body, and the stress is written as 0.0: {b0} {w0}')
    cut_(2.0); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    J("() => { const L = __lab, u = L.st.model.members[0].udl; u.w1 = u.w2 = 20; L.resolve(); }"); pg.wait_for_timeout(110); zm = J(V3S); pg.wait_for_timeout(900); ze = J(V3S)
    ok(zm['cut'] and same_(b1, zm['body']) and same_(b1, ze['body']) and 'σ = −143.6 N/mm², compression' in [w[0] for w in ze['wrote']],
       f'the load is doubled while the cut stays at 2.00 m: the body keeps its size while the sheet moves to the new state and after it, and its number becomes −143.6 N/mm²: {zm["body"]} {ze["body"]} {[w[0] for w in ze["wrote"]]}')
    pre('simple-w', 'L.st.sec = 2', 'V'); t1, v1, _ = cut_(2.0); t2, v2, _ = cut_(0.5); t3, v3, _ = cut_(3.0)
    ok(same_(t1, t2) and v1 == ['τ = 5.3 N/mm²'] and v2 == ['τ = 13.2 N/mm²'] and v3 == ['τ = 0.0 N/mm²'] and t3 and t3[2] < t1[2] - 20 and abs(t3[0] - t1[0]) <= 2 and abs(t3[1] - t1[1]) <= 2,
       f'the same beam in the tab shear, cut at 2.00 m and at 0.50 m: the body of the shear stress has the same size, with 5.3 and 13.2 N/mm²; at 3.00 m, where the shear is zero, there is no body and the cut face stands in the same place: {t1} {t2} {t3} {v3}')
    pg.mouse.move(5, 5); pg.click('#v3d'); pg.wait_for_timeout(300)
    pre('simple-p', 'L.st.sec = 2', 'M')
    TAG = ''
    b.close()
    # a narrow sheet: no rotation labels on it, and the window of the section starts folded
    pn = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox']); pg = pn.new_page(viewport={'width': 400, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(700); J = pg.evaluate
    pg.click('#tab-D'); pg.wait_for_timeout(1200); J(HOOK); pg.wait_for_timeout(350); t = set(J("() => [...window.__t]"))
    ok(not any(x.startswith('\u03b8 = ') and x.endswith(' mrad') for x in t) and not J("() => document.querySelector('#secw').open") and pg.inner_text('#secw summary b') == 'IPE 300', f'sheet of 400 px: no rotation labels, the window of the section is folded and names the section')
    pg.click('#secw summary'); pg.wait_for_timeout(300); ok(J("() => document.querySelector('#secw').open && document.querySelectorAll('#secw dd').length === 8"), 'a click unfolds it')
    TAG = '[not raised by the review] '
    hit, seen_ = [], []
    def chips(r):
        """the relations in the corners of the strips, each written in three coloured pieces: [text, box] with the other texts of the sheet"""
        out = []
        for i in range(len(r) - 2):
            if r[i][0] in ('M′', 'V′', 'EI·w″') and r[i + 1][0] == ' = ' and abs(r[i][2] - r[i + 2][2]) < 0.5:
                out.append(([r[i][0] + ' = ' + r[i + 2][0], r[i][1], r[i][2], r[i + 2][3], r[i][4]], r[:i] + r[i + 3:]))
        return out + [(x, [y for y in r if y is not x]) for x in r if x[0] == '+ tension, − compression']
    for pid in ('fixed', 'simple-t', 'two-span'):
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(250)
        for q in 'MV':
            pg.click(f'#tab-{q}'); pg.wait_for_timeout(700); r_ = rects()
            ch_, n0 = chips(r_), len(seen_)
            seen_ += [c_[0] for c_, _ in ch_]
            for c_, rest in ch_: hit += [(pid, q, c_[0], x[0]) for x in rest if meet(c_, x)]
    ok(not hit and len(seen_) >= 12 and {'M′ = V', 'V′ = −q', 'EI·w″ = −M'} <= set(seen_), f'sheet of 400 px, fixed beam, triangular load and two spans, tabs moment and shear: the relation written at the top of a line (M′ = V and the others, {len(seen_)} of them) lies on no value: {hit}')
    TAG = '[version 17] '
    # a narrow sheet has no rows: the relation stands in the corner of its strip, and its number in the box of the probe
    pg.click('.pre[data-id="simple-w"]'); pg.wait_for_timeout(300); pg.click('#tab-M'); pg.wait_for_timeout(700); r_ = [c_[0] for c_, _ in chips(rects())]
    g = J("() => { const c = document.querySelector('canvas').getBoundingClientRect(), V = __lab.VW; return [c.x + V.ox + 1.5 * V.s, c.y + V.yB + 150, V.rows]; }")
    pg.mouse.move(g[0], g[1]); pg.wait_for_timeout(300); J(HOOK); pg.wait_for_timeout(350); t = set(J("() => [...window.__t]"))
    ok(g[2] is False and {'M′ = V', 'V′ = −q'} <= set(r_) and {'M′ = V', 'V′ = −q', '15.0 kN', '−10.0 kN/m'} <= t and 'slope = V' not in t, f'sheet of 400 px: no rows; M′ = V and V′ = −q in the corners of their strips, and in the box of the probe with 15.0 kN and −10.0 kN/m: {sorted(x for x in t if "′" in x)}')
    TAG = '[version 18] '
    pg.mouse.move(5, 5); pg.click('#v3d'); pg.wait_for_timeout(900); z = J("() => __lab.V3.state")
    gz = J("() => { const a = document.querySelector('#stage').getBoundingClientRect(), b = document.querySelector('#v3').getBoundingClientRect(); return [Math.round(a.bottom), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }")
    ok(z['on'] and not z['failed'] and z['tris'] > 1000 and gz[1] >= gz[0] and gz[2] >= 380 and gz[3] >= 300, f'sheet of 400 px: the 3D view stands under the sheet, {gz[2]} px wide and {gz[3]} px high: {gz}')
    pg.click('#v3d'); pg.wait_for_timeout(300)
    TAG = ''
    pn.close()
print('; '.join(errs) if errs else 'no script errors')
r10, own = tagged.get('[review 10] ', [0, 0]), tagged.get('[not raised by the review] ', [0, 0])
r11, v16, v17, v18 = tagged.get('[review 11] ', [0, 0]), tagged.get('[version 16] ', [0, 0]), tagged.get('[version 17] ', [0, 0]), tagged.get('[version 18] ', [0, 0])
v19, v20 = tagged.get('[version 19] ', [0, 0]), tagged.get('[version 20] ', [0, 0])
print(f'checks added for review 10: {r10[0]}, of them failed: {r10[1]}')
print(f'checks added with version 15 beside the review: {own[0]}, of them failed: {own[1]}')
print(f'checks added for review 11: {r11[0]}, of them failed: {r11[1]}')
print(f'checks added for the functions of version 16: {v16[0]}, of them failed: {v16[1]}')
print(f'checks added for the functions of version 17: {v17[0]}, of them failed: {v17[1]}')
print(f'checks added for the functions of version 18: {v18[0]}, of them failed: {v18[1]}')
print(f'checks added for the functions of version 19: {v19[0]}, of them failed: {v19[1]}')
print(f'checks added for the functions of version 20: {v20[0]}, of them failed: {v20[1]}')
print(f'{done - len(bad)} of {done} checks of menus and states passed')
sys.exit(1 if bad or errs else 0)
