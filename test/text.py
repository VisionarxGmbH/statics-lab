"""Every text the page prints, written to one file for reading: the side panel of each example in each tab, the
labels drawn on the sheet, the menus. usage: python3 text.py <out-file> [width height]"""
import sys, pathlib, re, html
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cases import VAR, section
from playwright.sync_api import sync_playwright
out = pathlib.Path(sys.argv[1])
w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1500, 900)
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
HOOK = "(() => { const o = CanvasRenderingContext2D.prototype.fillText; window.__txt = new Set(); CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.add(String(t)); return o.call(this, t, ...a); }; })()"

def linear(src):
    """panel HTML as plain lines: fractions as (a)/(b), subscripts as _x, superscripts as ^x"""
    s = re.sub(r'<svg.*?</svg>', '[sketch] ', src, flags=re.S)
    for _ in range(3):
        s = re.sub(r'<span class="fr"><span>((?:(?!<span class="fr">).)*?)</span><span>((?:(?!<span class="fr">).)*?)</span></span>', r'(\1)/(\2)', s, flags=re.S)
    s = re.sub(r'√<span class="rt">(.*?)</span>', r'√[\1]', s)
    s = re.sub(r'<sub>(.*?)</sub>', r'_\1', s); s = re.sub(r'<sup>(.*?)</sup>', r'^\1', s)
    s = re.sub(r'<span class="ok"[^>]*>.*?</span>', ' [tick]', s)
    s = re.sub(r'</(div|p|h2|h3|li|tr|section|summary|small|details)>|<br>', '\n', s)
    s = re.sub(r'</(td|th|b)>', '  ', s)
    s = re.sub(r'<[^>]+>', '', s)
    return [re.sub(r'[ \t]+', ' ', html.unescape(l)).strip() for l in s.split('\n') if l.strip()]

L, ever = [], set()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': w, 'height': h})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(HOOK)
    pg.goto(url); pg.wait_for_timeout(700)
    L += ['##### HEADER', ' | '.join(x.strip() for x in pg.inner_text('header').split('\n') if x.strip())]
    L += ['##### RAIL', ' | '.join(x.strip() for x in pg.inner_text('#rail').split('\n') if x.strip())]
    ids = pg.eval_on_selector_all('.pre', 'els => els.map(e => e.dataset.id)')
    for i in ids:
        pg.click(f'.pre[data-id="{i}"]'); pg.wait_for_timeout(250)
        seen, canvas = set(), set()
        L.append(f'\n##### {i}')
        for q in 'MVND':
            pg.click(f'#tab-{q}'); pg.evaluate('() => { window.__txt.clear(); __lab.st.dirty = true; }'); pg.wait_for_timeout(900)
            cards = [linear(c) for c in pg.evaluate("() => [...document.querySelector('#learn').children].map(e => e.outerHTML)")]
            L.append(f'--- tab {q}' + ('' if q == 'M' else ' (cards that changed)'))
            for c in cards:
                key = '\n'.join(c)
                if key in seen: continue
                seen.add(key)
                if key in ever: L.append('   (as printed before) ' + c[0]); continue
                ever.add(key); L += ['   ' + c[0]] + ['      ' + l for l in c[1:]]
            canvas.update(pg.evaluate('() => [...window.__txt]'))
        words = sorted(t for t in canvas if re.search(r'[A-Za-zα-ωΑ-Ω]', re.sub(r'\b(kN/m|kNm|kN|mm|m|mrad|EI)\b', '', t)))
        nums = sorted(t for t in canvas if t not in words)
        L.append('--- on the sheet, words: ' + ' | '.join(words))
        L.append('--- on the sheet, numbers: ' + ' | '.join(nums))
        L.append('--- footer: ' + pg.inner_text('.foot').replace('\n', ' | '))
    # menus
    L.append('\n##### MENUS')
    def at(js): return pg.evaluate(js)
    def cxy(x, y):
        r = at("() => { const r = document.querySelector('#cv').getBoundingClientRect(); return [r.left, r.top] }"); return r[0] + x, r[1] + y
    for pid, what in (('simple-p', 'beam'), ('portal-g', 'frame'), ('truss', 'truss')):
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(900)
        g = at("() => { const g = [...__lab.HS.loads.values()][0]; return g ? [(g.hx + g.tx) / 2, (g.hy + g.ty) / 2] : null }")
        n = at("() => { const L = __lab, i = L.st.model.nodes.findIndex(n => n.cs), n = L.st.model.nodes[i], V = L.VW; return [V.ox + n.x * V.s, V.oy - n.y * V.s + (n.sup === 'pin' || n.sup === 'roller' ? 12 : 0)] }")
        j = at("() => { const L = __lab, i = L.st.model.nodes.findIndex(n => n.ch), V = L.VW; if (i < 0) return null; const n = L.st.model.nodes[i]; return [V.ox + n.x * V.s, V.oy - n.y * V.s] }")
        m = at("() => { const g = __lab.MG[__lab.MG.length > 1 ? 1 : 0]; return [g.ax * .7 + g.bx * .3, g.ay * .7 + g.by * .3] }")
        for name, pt in (('load', g), ('support', n), ('joint', j), ('member', m)):
            if not pt: continue
            pg.mouse.move(*cxy(*pt)); pg.wait_for_timeout(120)
            hint = pg.inner_text('#hint')
            pg.mouse.click(*cxy(*pt)); pg.wait_for_timeout(250)
            vis = at("() => !document.querySelector('#pop').hidden")
            txt = ' | '.join(x.strip() for x in pg.inner_text('#pop').split('\n') if x.strip()) if vis else '(no menu)'
            aria = at("() => [...document.querySelectorAll('#pop [aria-label]')].map(e => e.getAttribute('aria-label')).join(', ')") if vis else ''
            L.append(f'{what} / {name}: hint "{hint}" | menu: {txt} | labels: {aria}')
            pg.keyboard.press('Escape'); pg.mouse.move(*cxy(4, 300)); pg.wait_for_timeout(80)
        # a dimension of the drawing: its hint and what a click opens
        for k, d in enumerate(at("() => __lab.HS.dims.map(d => [(d.b[0] + d.b[2]) / 2, (d.b[1] + d.b[3]) / 2, d.ax, d.gi])")):
            if k and d[2] == 'x': continue                # the first one along x, and the one along y
            pg.mouse.move(*cxy(d[0], d[1])); pg.wait_for_timeout(120); hint = pg.inner_text('#hint'); pg.mouse.click(*cxy(d[0], d[1])); pg.wait_for_timeout(250)
            vis = at("() => !document.querySelector('#pop').hidden")
            L.append(f'{what} / dimension along {d[2]}: hint "{hint}" | menu: ' + (' | '.join(x.strip() for x in pg.inner_text('#pop').split('\n') if x.strip()) if vis else '(no menu)'))
            pg.keyboard.press('Escape'); pg.mouse.move(*cxy(4, 300)); pg.wait_for_timeout(80)
        L.append(f'{what} / window of the section: ' + ' | '.join(x.strip() for x in pg.inner_text('#secw').split('\n') if x.strip()))
    # other load cases than the examples start with: what the panel and the sheet print for them
    L.append('\n##### OTHER LOAD CASES')
    for pid, name, js, imi in VAR:
        pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(200); section(pg, name)
        pg.evaluate("() => { const L = __lab, m = L.st.model; " + js + f"; L.st.imi = {imi}; L.resolve('instant'); }}")
        L.append(f'\n### {pid}: {name}')
        canvas = set()
        for q in 'MVND':   # every tab of every case
            pg.click(f'#tab-{q}'); pg.evaluate('() => { window.__txt.clear(); __lab.st.dirty = true; }'); pg.wait_for_timeout(700)
            cards = [linear(c) for c in pg.evaluate("() => [...document.querySelector('#learn').children].map(e => e.outerHTML)")]
            L.append(f'--- tab {q}')
            for c in cards:
                key = '\n'.join(c)
                if key in ever: continue
                ever.add(key); L += ['   ' + c[0]] + ['      ' + l for l in c[1:]]
            canvas.update(pg.evaluate('() => [...window.__txt]'))
        words = sorted(t for t in canvas if re.search(r'[A-Za-zα-ωΑ-Ω]', re.sub(r'\b(kN/m|kNm|kN|mm|m|mrad|EI)\b', '', t)))
        L.append('--- on the sheet, words: ' + ' | '.join(words))
        L.append('--- on the sheet, numbers: ' + ' | '.join(sorted(t for t in canvas if t not in words)))
        L.append('--- under the drawing: ' + pg.inner_text('#mag'))
    section(pg)
    # the unstable state
    pg.click('.pre[data-id="simple-p"]'); pg.wait_for_timeout(600)
    pg.evaluate("() => { __lab.st.model.nodes[0].sup = 'roller'; }"); pg.click('#tab-M'); pg.click('#vals'); pg.click('#vals')
    L.append('\n##### ERRORS: ' + ('; '.join(errs) if errs else 'none'))
    b.close()
out.write_text('\n'.join(L) + '\n', encoding='utf-8')
print(out, len(L), 'lines;', 'script errors: ' + '; '.join(errs) if errs else 'no script errors')
sys.exit(1 if errs else 0)
