"""Loads dist/index.html in headless Chrome, reports script errors and saves screenshots.
usage: python3 shot.py <out-dir> [width height] [preset-id ...]   env: TAB=M|V|N|D, SCHEME=dark, FULL=1"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1500, 900)
ids = sys.argv[4:]
url = pathlib.Path(__file__).resolve().parent.parent.joinpath('dist/index.html').as_uri()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__('os').environ.get('CHROME') or None, args=['--no-sandbox'])
    import os
    pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1, color_scheme=os.environ.get('SCHEME', 'light'))
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(900)
    if not ids:
        ids = pg.eval_on_selector_all('.pre', 'els => els.map(e => e.dataset.id)')
    for i in ids:
        pg.click(f'.pre[data-id="{i}"]'); pg.wait_for_timeout(900)
        tab = os.environ.get('TAB', '')
        if tab: pg.click(f'#tab-{tab}'); pg.wait_for_timeout(900)
        pg.screenshot(path=str(out / f'{i}-{w}{"-" + tab if tab else ""}{"-dark" if os.environ.get("SCHEME") == "dark" else ""}.png'), full_page=os.environ.get('FULL') == '1')
    b.close()
print(json.dumps(errors, indent=1) if errors else 'no script errors')
