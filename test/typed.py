"""An entry typed key by key must leave the page as the same entry pasted in one piece does.
Review 10, C112: 35 typed into the length of a 6 m beam passes through 3, a length the page takes. Version 14 kept
that 3 m when the 35 was refused; pasted, the same entry left 6 m.

For every example the menu of its first member is opened with "Compare" on, and each entry of a list is put into
the length field twice: typed key by key, and set in one piece. Then the field is left. The two states must be the
same: the joints, the places and sizes of the loads, the distributed load, the largest moment, whether "Compare" is
still on, the number of steps back, and what the field shows. The same is done for the size and for the place of the
first point load and for the first value of the distributed load of the first member. The lists hold entries the page
takes, entries it refuses (outside the limits, empty, not a number) and entries that pass through a value of the
other kind.

Review 11, C121: a number written with an exponent passes through other numbers on the way: 9000e-1 through 9000,
which is above the limit of a load. Version 15 wrote the limit into the field at that key, and the keys that followed
made 1000e-1 of it: 100 kN for 900. The lists hold such entries for every field, among them entries whose digits on
the way lie above a limit, below one, and on a joint.
usage: python3 typed.py"""
import pathlib, json, sys
from playwright.sync_api import sync_playwright
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
LEN = ['35', '3.5', '12', '100', '0.3', '60', '', '2.', '35e-1', '3e1', '1e2', '5e-1', '300e-1']
SIZE = ['0', '1500', '0.04', '12.34', '', '50', '9000e-1', '15e2', '5e-2', '1e1', '12345e-2']
PLACE = ['25e-1', '2.5', '25', '0', '', '1.234', '600e-2', '1e-1', '99', '10e-1']
LOAD = ['25', '600', '', '7.77', '6000e-1', '250e-1', '1e3', '5e-1']
STATE = """() => { const L = __lab, m = L.st.model, s = L.st.sol, r = v => Math.round(v * 1e6) / 1e6;
  return { nodes: m.nodes.map(n => [r(n.x), r(n.y)]), loads: m.loads.map(l => [l.m, r(l.a), l.P]), udl: m.members.map(k => [k.udl.on, k.udl.w1, k.udl.w2]),
           M: s.ok ? Math.round(s.max.M * 1e4) / 1e4 : null, compare: !!L.st.ghost && document.querySelector('#cmp').getAttribute('aria-pressed') === 'true', undo: L.st.undo.length }; }"""
PICK = "() => { const L = __lab; for (let y = 0; y < 700; y += 3) for (let x = 60; x < 1150; x += 3) { const h = L.pick(x, y); if (h && h.type === 'load') { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.x + x, c.y + y]; } } return null; }"
errs, bad, n = [], [], {'length': 0, 'size of a point load': 0, 'place of a point load': 0, 'value of a distributed load': 0}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1500, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600); J = pg.evaluate
    ids = J("() => [...document.querySelectorAll('.pre')].map(e => e.dataset.id)")

    def session(pid, kind, sel, v, how):
        """one entry: the example as it starts, "Compare" on, the menu open, the entry made, the field left"""
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(110); pg.click('#cmp'); pg.wait_for_timeout(50)
        if kind in ('size of a point load', 'place of a point load'):
            hit = J(PICK)
            if hit is None: return None
            pg.mouse.click(*hit)
        else: pg.click('#loads')
        pg.wait_for_timeout(110)
        if not pg.query_selector(sel): pg.keyboard.press('Escape'); return None
        if how == 'typed':
            pg.click(sel); pg.keyboard.press('Control+a')
            if v == '': pg.keyboard.press('Delete')
            else: pg.keyboard.type(v, delay=12)
        else: pg.fill(sel, v)
        pg.wait_for_timeout(50); pg.keyboard.press('Tab'); pg.wait_for_timeout(70)
        z = J(STATE); z['field'] = pg.input_value(sel) if pg.query_selector(sel) else None
        pg.keyboard.press('Escape'); pg.wait_for_timeout(30)
        return z

    for pid in ids:
        for kind, sel, vals in (('length', '#pp-len', LEN), ('size of a point load', '#pp-P', SIZE), ('place of a point load', '#pp-a', PLACE), ('value of a distributed load', '#pp-w1', LOAD)):
            for v in vals:
                a = session(pid, kind, sel, v, 'typed')
                if a is None: break                     # this example has no such field
                c = session(pid, kind, sel, v, 'pasted'); n[kind] += 1
                if json.dumps(a, sort_keys=True) != json.dumps(c, sort_keys=True): bad.append((pid, kind, v, a, c))
    b.close()
print(f'entries typed key by key against the same entries set in one piece, with "Compare" on, on {len(ids)} examples: {n["length"]} pairs in the field of a length, {n["size of a point load"]} in the size of a point load, {n["place of a point load"]} in the place of a point load, {n["value of a distributed load"]} in a value of a distributed load; pairs that leave different states: {len(bad)}')
EXP = sum(1 for L_ in (LEN, SIZE, PLACE, LOAD) for v in L_ if 'e' in v)
print(f'of the {len(LEN) + len(SIZE) + len(PLACE) + len(LOAD)} entries of the lists, written with an exponent: {EXP}')
for pid, kind, v, a, c in bad[:10]: print(f'  {pid}, {kind}, {v!r}:'); print('    typed ', json.dumps(a)[:300]); print('    pasted', json.dumps(c)[:300])
print('; '.join(errs[:5]) if errs else 'no script errors')
sys.exit(1 if bad or errs else 0)
