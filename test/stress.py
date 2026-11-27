"""Random use of the page in headless Chrome; any script error fails. usage: python3 stress.py [seed]"""
import sys, pathlib, random, json
from playwright.sync_api import sync_playwright
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
errs, acts = [], 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': random.choice([1500, 1280, 900, 720, 420]), 'height': random.choice([900, 760, 640])})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(500)
    ids = pg.eval_on_selector_all('.pre', 'els => els.map(e => e.dataset.id)')
    for pid in ids:
        pg.evaluate(f"() => document.querySelector('.pre[data-id=\"{pid}\"]').click()"); pg.wait_for_timeout(120)
        for step in range(34):
            r = pg.evaluate("() => { const r = document.querySelector('#cv').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] }")
            k = random.random(); acts += 1
            hs = pg.evaluate("""() => { const L = __lab, V = L.VW, o = []; for (const g of L.HS.loads.values()) o.push([g.kx, g.ky], [(g.hx + g.tx) / 2, (g.hy + g.ty) / 2]); for (const g of L.HS.udl.values()) o.push([g.kx, g.ky]);
                for (const n of L.st.model.nodes) o.push([V.ox + n.x * V.s, V.oy - n.y * V.s + (n.sup === 'pin' || n.sup === 'roller' ? 12 : 0)]); for (const g of L.MG) o.push([(g.ax + g.bx) / 2, (g.ay + g.by) / 2], [g.ax * .8 + g.bx * .2, g.ay * .8 + g.by * .2]); for (const d of L.HS.dims) o.push([(d.b[0] + d.b[2]) / 2, (d.b[1] + d.b[3]) / 2]); return o }""")
            x, y = random.choice(hs) if hs and k < 0.8 else (random.random() * r[2], random.random() * r[3])
            px, py = r[0] + x, r[1] + y
            if py > pg.viewport_size['height'] - 2 or py < 0: continue
            if k < 0.3:
                pg.mouse.move(px, py); pg.mouse.down()
                for i in range(5): pg.mouse.move(px + random.uniform(-160, 160), py + random.uniform(-120, 120))
                pg.mouse.up()
            elif k < 0.7:
                pg.mouse.click(px, py); pg.wait_for_timeout(30)
                btns = pg.query_selector_all('#pop:not([hidden]) button')
                if btns and random.random() < 0.85:
                    try: random.choice(btns).click(timeout=500)
                    except Exception: pass
                for sel, val in (('#pp-P', random.choice(['0', '7.5', '250', '', '-3'])), ('#pp-a', random.choice(['0', '1.23', '99', ''])), ('#pp-w1', random.choice(['3', '', '0', '40', '-2'])), ('#pp-w2', random.choice(['3', '', '0', '12.5'])), ('#pp-len', random.choice(['0.5', '1', '2.37', '8', '30', '0.1', '44', '', '12.345']))):
                    el = pg.query_selector(sel)
                    if el and random.random() < 0.5:
                        try: el.fill(val, timeout=500)
                        except Exception: pass
                sl = pg.query_selector('#pop:not([hidden]) #pp-sec')
                if sl and random.random() < 0.4:
                    try: sl.select_option(index=random.randrange(7), timeout=500)
                    except Exception: pass
                if random.random() < 0.6: pg.keyboard.press('Escape')
            elif k < 0.78: pg.click(f"#tab-{random.choice('MVND')}")
            elif k < 0.8: pg.evaluate("() => document.querySelector('#loads').click()")
            elif k < 0.86: pg.evaluate("() => document.querySelector('#undo').click()")
            elif k < 0.9: pg.select_option('#sec', str(random.randrange(7)))
            elif k < 0.92: pg.click('#vals')
            elif k < 0.94: pg.evaluate("() => document.querySelector('#secw summary').click()")
            else: pg.mouse.move(px, py)
            if random.random() < 0.25: pg.wait_for_timeout(random.choice([20, 90, 400]))
        bad = pg.evaluate("""() => { const s = __lab.st.sol; if (!s.ok) return null; for (const M of s.mem) for (const k of ['N','V','M','dX','dY']) for (const v of M.smp[k]) if (!isFinite(v)) return k; return null }""")
        if bad: errs.append(f'{pid}: non-finite {bad}')
    b.close()
print(f'{acts} random actions on {len(ids)} structures:', json.dumps(errs[:8], indent=1) if errs else 'no script errors')
sys.exit(1 if errs else 0)
