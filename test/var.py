"""One example with a change applied to its model, as a screenshot.
usage: python3 var.py <out.png> <width> <height> <preset-id> "<js on m = model>" [tab] [js after]   env: SCHEME=dark"""
import sys, pathlib, os
from playwright.sync_api import sync_playwright
out, w, h, pid, js = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
tab = sys.argv[6] if len(sys.argv) > 6 else 'M'
after = sys.argv[7] if len(sys.argv) > 7 else ''
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/debug.html').as_uri()
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1, color_scheme=os.environ.get('SCHEME', 'light'))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600)
    pg.click(f'.pre[data-id="{pid}"]'); pg.wait_for_timeout(300)
    pg.evaluate("() => { const L = __lab, m = L.st.model; " + js + "; L.resolve('grow'); }")
    pg.click(f'#tab-{tab}'); pg.wait_for_timeout(1100)
    if after: pg.evaluate("() => { " + after + " }"); pg.wait_for_timeout(500)
    pg.screenshot(path=out)
    b.close()
print('; '.join(errs) if errs else 'no script errors')
