"""Interaction walk-through in headless Chrome. usage: python3 play.py <out-dir>"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
errs = []
def canvas_xy(pg, x, y):
    r = pg.evaluate("() => { const r = document.querySelector('#cv').getBoundingClientRect(); return [r.left, r.top] }")
    return r[0] + x, r[1] + y
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1500, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto(url); pg.wait_for_timeout(700)
    S = lambda name: pg.screenshot(path=str(out / f'{name}.png'))
    J = lambda js: pg.evaluate(js)
    head = lambda i=0: J(f"() => {{ const g = [...__lab.HS.loads.values()][{i}]; return [g.hx, g.hy, g.tx, g.ty, g.kx, g.ky] }}")
    # 1 probe on the simple beam
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(800)
    pg.mouse.move(*canvas_xy(pg, 620, 560)); pg.wait_for_timeout(200); S('01-probe')
    # 2 drag the load along the beam
    g = head(); x0, y0 = canvas_xy(pg, g[0], g[1] - 40)
    pg.mouse.move(x0, y0); pg.mouse.down()
    for k in range(1, 16): pg.mouse.move(x0 + k * 24, y0 + 2); pg.wait_for_timeout(16)
    pg.wait_for_timeout(120); S('02-drag-load'); pg.mouse.up(); pg.wait_for_timeout(500)
    print('after drag:', J("() => JSON.stringify(__lab.st.model.loads)"))
    # 3 drag the tail: bigger and inclined
    g = head(); kx, ky = canvas_xy(pg, g[4], g[5])
    pg.mouse.move(kx, ky); pg.mouse.down()
    for k in range(1, 11): pg.mouse.move(kx - k * 7, ky - k * 4); pg.wait_for_timeout(16)
    pg.wait_for_timeout(120); S('03-drag-tail'); pg.mouse.up(); pg.wait_for_timeout(500)
    print('after tail:', J("() => JSON.stringify(__lab.st.model.loads)"))
    S('03b-after-tail')
    # 4 click the load: pop-over, type a value
    g = head(); pg.mouse.click(*canvas_xy(pg, (g[0] + g[2]) / 2, (g[1] + g[3]) / 2)); pg.wait_for_timeout(250); S('04-load-pop')
    pg.fill('#pp-P', '35'); pg.click('button[data-ang="-90"]'); pg.wait_for_timeout(500); S('04b-load-pop-set')
    pg.keyboard.press('Escape')
    # 5 click support B: pop-over, fixed
    n = J("() => { const n = __lab.st.model.nodes[1], V = __lab.VW; return [V.ox + n.x * V.s, V.oy - n.y * V.s] }")
    pg.mouse.click(*canvas_xy(pg, n[0], n[1] + 12)); pg.wait_for_timeout(250); S('05-sup-pop')
    pg.click('button[data-sup="fixed"]'); pg.wait_for_timeout(150); S('05b-tween'); pg.wait_for_timeout(600); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(200); S('05c-propped')
    pg.click('#undo'); pg.wait_for_timeout(600); print('undo ->', J("() => __lab.st.model.nodes[1].sup"))
    # 6 member pop-over: uniform load on, add a load
    pg.mouse.click(*canvas_xy(pg, 300, J("() => __lab.VW.yB"))); pg.wait_for_timeout(250); S('06-member-pop')
    pg.click('button[data-shape="uni"]'); pg.wait_for_timeout(500); S('06a-uniform'); pg.click('button[data-shape="up"]'); pg.wait_for_timeout(500); S('06b-triangle')
    pg.fill('#pp-w1', '4'); pg.wait_for_timeout(500); S('06c-trapezoid'); pg.click('button[data-shape="down"]'); pg.wait_for_timeout(500); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(300); S('06d-triangle-down')
    print('distributed load:', J("() => JSON.stringify(__lab.st.model.members[0].udl)"))
    # 6e drag the handle of the distributed load: both ends keep their share
    h = J("() => { const g = [...__lab.HS.udl.values()][0]; return [g.kx, g.ky] }"); hx, hy = canvas_xy(pg, h[0], h[1])
    pg.mouse.move(hx, hy); pg.mouse.down()
    for k in range(1, 9): pg.mouse.move(hx + 1, hy - k * 3); pg.wait_for_timeout(16)
    pg.mouse.up(); pg.mouse.move(5, 300); pg.wait_for_timeout(400); S('06e-dragged')
    print('after drag of the handle:', J("() => JSON.stringify(__lab.st.model.members[0].udl)"))
    # 6f the Loads button: menu of a member, step to the next one, add a load
    pg.click('#loads'); pg.wait_for_timeout(250); S('06f-loads-button'); pg.click('button[data-act="add"]'); pg.wait_for_timeout(500)
    pg.click('#loads'); pg.wait_for_timeout(200); pg.click('button[data-act="add"]'); pg.wait_for_timeout(500); pg.mouse.move(5, 300); pg.wait_for_timeout(300); S('06g-two-more-loads')
    print('loads:', J("() => JSON.stringify(__lab.st.model.loads.map(l => [l.m, l.a, l.P]))"))
    # 7 tabs on a beam
    for q in 'VND': pg.click(f'#tab-{q}'); pg.wait_for_timeout(700); S(f'07-focus-{q}')
    # 8 frame: probe, hinge, stiffness, unstable
    pg.click('.pre[data-id="portal-g"]'); pg.wait_for_timeout(900)
    mg = J("() => __lab.MG.map(g => [g.ax, g.ay, g.bx, g.by])")
    bx, by = (mg[1][0] * 0.7 + mg[1][2] * 0.3), mg[1][1]
    pg.mouse.move(*canvas_xy(pg, bx, by)); pg.wait_for_timeout(250); S('08-frame-probe')
    pg.mouse.click(*canvas_xy(pg, mg[1][0], mg[1][1])); pg.wait_for_timeout(250); S('08b-joint-pop')
    pg.click('button[data-hinge="1"]'); pg.wait_for_timeout(700); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(200); S('08c-hinged')
    pg.mouse.click(*canvas_xy(pg, mg[0][0], (mg[0][1] + mg[0][3]) / 2)); pg.wait_for_timeout(250)
    pg.select_option('#pp-sec', '6'); pg.wait_for_timeout(700); S('08d-column-profile-menu'); pg.fill('#pp-len', '5.5'); pg.wait_for_timeout(700); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(200); S('08e-stiff-column-5m50')
    dm = J("() => __lab.HS.dims.map(d => [(d.b[0] + d.b[2]) / 2, (d.b[1] + d.b[3]) / 2])"); pg.mouse.click(*canvas_xy(pg, dm[0][0], dm[0][1])); pg.wait_for_timeout(300); S('08f-dimension-menu'); pg.fill('#pp-len', '10'); pg.wait_for_timeout(600); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(200)
    pg.click('#secw summary'); pg.wait_for_timeout(200); pg.click('#secw summary'); pg.wait_for_timeout(200); S('08g-span-10m')
    for q in 'VND': pg.click(f'#tab-{q}'); pg.wait_for_timeout(700); S(f'09-frame-{q}')
    # 9b Loads button on a frame: step through the members, wind triangle on a column
    pg.click('#tab-M'); pg.click('#loads'); pg.wait_for_timeout(250); print('menu:', pg.inner_text('#pop .ph b'))
    pg.click('button[data-act="next"]'); pg.wait_for_timeout(250); print('next:', pg.inner_text('#pop .ph b'))
    pg.click('button[data-act="prev"]'); pg.click('button[data-act="prev"]'); pg.wait_for_timeout(250); print('prev twice:', pg.inner_text('#pop .ph b')); S('09b-column-menu')
    pg.click('button[data-shape="down"]'); pg.wait_for_timeout(600); S('09c-wind-triangle-menu'); pg.keyboard.press('Escape'); pg.mouse.move(5, 300); pg.wait_for_timeout(300); S('09d-wind-triangle')
    pg.click('#undo'); pg.wait_for_timeout(500)
    pg.click('#tab-M')
    for i in (0, 3):
        n = J(f"() => {{ const n = __lab.st.model.nodes[{i}], V = __lab.VW; return [V.ox + n.x * V.s, V.oy - n.y * V.s] }}")
        pg.mouse.click(*canvas_xy(pg, n[0], n[1])); pg.wait_for_timeout(200); pg.click('button[data-sup="roller"]'); pg.wait_for_timeout(300); pg.keyboard.press('Escape')
    pg.mouse.move(5, 300); pg.wait_for_timeout(500); S('10-unstable')
    # 11 truss: drag a load off the joint
    pg.click('.pre[data-id="truss"]'); pg.wait_for_timeout(900)
    g = head(1); x0, y0 = canvas_xy(pg, g[0], g[1] + 30)
    pg.mouse.move(x0, y0); pg.mouse.down()
    for k in range(1, 9): pg.mouse.move(x0 + k * 9, y0 - 6); pg.wait_for_timeout(16)
    pg.mouse.up(); pg.mouse.move(5, 300); pg.wait_for_timeout(600); S('11-truss-load-between')
    pg.click('#tab-M'); pg.wait_for_timeout(700); S('11b-truss-M')
    b.close()
print(json.dumps(errs, indent=1) if errs else 'no script errors')
sys.exit(1 if errs else 0)
