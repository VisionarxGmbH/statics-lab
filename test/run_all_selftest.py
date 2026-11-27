"""The run of all checks (test/run_all.sh) must end with another exit status than 0 when one of its checks does.
Review 10, C120: a check that printed "474 passed, 1 failed" and ended with status 1 left the run at status 0.

This test runs the real test/run_all.sh in a folder of its own, where every check and the build are stand-ins:
small programs that print "475 passed, 0 failed" and end with status 0. One of them at a time is told to print
"474 passed, 1 failed" and to end with status 1. The run must then end with status 1 and list exactly that check
with its status. It is done for the build, for every check of both lanes (also the checks behind a pipe), for
the work the caller gives to the second lane, and for a lane that is stopped before its end. Without a failure
the run must end with status 0 and list every check with status 0.

Review 11, C120: every scheduled check must have been started, and every output must be written. A lane that is
stopped leaves the stopped check and the checks behind it without a result: the run must list them as scheduled and
without a result. A folder at the place of numeric.txt, put there after the run has begun, keeps the 18 numeric
checks from starting: the run must end with status 1 and say that 18 scheduled checks have no result and that the
output was not written. With the folder there before the run, it must stop before any check.

usage: python3 test/run_all_selftest.py"""
import os, pathlib, re, shutil, subprocess, sys, tempfile

here = pathlib.Path(__file__).resolve().parent
JS = """const me = [require('path').basename(process.argv[1]), ...process.argv.slice(2)].join(' ');
const hit = !!process.env.FAIL_AT && new RegExp(process.env.FAIL_AT).test(me);
if (hit && process.env.FAIL_HOW === 'stop') process.kill(process.ppid, 'SIGKILL');
if (hit && process.env.FAIL_HOW === 'block') { const fs = require('fs'), p = process.env.BLOCK_PATH; try { fs.unlinkSync(p); } catch (e) {} fs.mkdirSync(p); console.log('475 passed, 0 failed'); process.exit(0); }
console.log(hit ? '474 passed, 1 failed' : '475 passed, 0 failed');
process.exit(hit ? 1 : 0);
"""
PY = """import os, re, sys
me = ' '.join([os.path.basename(sys.argv[0])] + sys.argv[1:])
hit = bool(os.environ.get('FAIL_AT')) and re.search(os.environ['FAIL_AT'], me) is not None
if hit and os.environ.get('FAIL_HOW') == 'stop': os.kill(os.getppid(), 9)
print('474 passed, 1 failed' if hit else '475 passed, 0 failed')
sys.exit(1 if hit else 0)
"""
STAND_INS = ['build.js', 'test/solver.test.js', 'test/cards.test.js', 'test/fuzz.test.js', 'test/tops.test.js', 'test/sections.test.js',
             'test/independent/dump_random.js', 'test/independent/dump_configs.js', 'test/independent/compare_random.py',
             'test/independent/compare_configs.py', 'test/values.py', 'test/typed.py', 'test/menu.py', 'test/play.py', 'test/stress.py', 'test/marks.py',
             'test/run_all_selftest.py', 'test/extra.py']
# one pattern for each start of a check in test/run_all.sh: the name of the program and what it is started with
ONE = ([r'^run_all_selftest\.py$', r'^solver\.test\.js$', r'^cards\.test\.js$']
       + [rf'^fuzz\.test\.js 12000 {sd}$' for sd in (11, 12, 13, 14)] + [rf'^tops\.test\.js 2400 {sd}$' for sd in (31, 32)]
       + [rf'^dump_random\.js 3000 {sd} \S+$' for sd in (21, 22, 23, 24)] + [rf'^compare_random\.py \S+/r{sd}\.json$' for sd in (21, 22, 23, 24)]
       + [rf'^dump_random\.js 3000 {sd} \S+ 1$' for sd in (25, 26)] + [rf'^compare_random\.py \S+/f{sd}\.json$' for sd in (25, 26)]
       + [r'^dump_configs\.js \S+/c\.json$', r'^compare_configs\.py \S+/c\.json$', r'^dump_configs\.js \S+/cv\.json 5$', r'^compare_configs\.py \S+/cv\.json$']
       + [r'^sections\.test\.js$', r'^values\.py$', r'^values\.py 1280 760$', r'^values\.py 400 800$', r'^typed\.py$', r'^menu\.py$', r'^play\.py \S+$', r'^stress\.py$',
          r'^marks\.py 300 1$', r'^extra\.py$'])
BUILD = [r'^build\.js$', r'^build\.js --debug$']
STARTS = 29   # the starts of test/run_all.sh: two builds and 27 checks (a dump with its comparison is one start)

root = pathlib.Path(tempfile.mkdtemp())
try:
    for f in STAND_INS:
        q = root / f; q.parent.mkdir(parents=True, exist_ok=True); q.write_text(JS if f.endswith('.js') else PY)
    shutil.copy(here / 'run_all.sh', root / 'test' / 'run_all.sh')
    real = (root / 'test' / 'run_all.sh').read_text()
    # every program that the run starts has its stand-in: none of the real checks runs here
    started = set(re.findall(r'(?:node|python3) ((?:test/)?[\w./]+\.(?:js|py))', real))
    missing = sorted(started - set(STAND_INS))

    def go(pattern=None, how=None, before=None):
        env = dict(os.environ); env.pop('FAIL_AT', None); env.pop('FAIL_HOW', None)
        if pattern: env['FAIL_AT'] = pattern
        if how: env['FAIL_HOW'] = how
        out = root / 'out'; shutil.rmtree(out, ignore_errors=True)
        env['BLOCK_PATH'] = str(out / 'numeric.txt')
        if before: out.mkdir(parents=True); (out / before).mkdir()   # a folder at the place of an output, before the run
        r = subprocess.run(['bash', str(root / 'test' / 'run_all.sh'), str(out), 'python3 test/extra.py'], env=env, capture_output=True, text=True)
        st = (out / 'status.txt').read_text().splitlines() if (out / 'status.txt').exists() else []
        return r.returncode, st, r.stdout

    bad = []
    rc, st, _ = go()
    checks = [l for l in st[1:]]
    green = rc == 0 and len(checks) == STARTS and all(l.startswith('exit status 0: ') for l in checks) and 'lanes that reached their end: 2 of 2' in st[0]
    if not green: bad.append(('without a failure', rc, st[:3]))
    caught = 0
    for pat in ONE:
        rc, st, _ = go(pat)
        failed = [l for l in st[1:] if not l.startswith('exit status 0: ')]
        if rc == 1 and len(failed) == 1 and failed[0].startswith('exit status 1: ') and len(st) - 1 == STARTS: caught += 1
        else: bad.append((pat, rc, failed))
    built = 0
    for pat in BUILD:
        rc, st, so = go(pat)
        if rc == 1 and 'the build failed: no check was run' in so and len([l for l in st[1:] if l.startswith('exit status 1: ')]) == 1: built += 1
        else: bad.append((pat, rc, st[:3]))
    rc, st, _ = go(r'^menu\.py$', 'stop')
    left = [l for l in st[1:] if l.startswith('no result: ')]
    stopped = rc == 1 and 'lanes that reached their end: 1 of 2' in (st[0] if st else '') and 'scheduled and without a result: 5;' in st[0] and len(left) == 5 and any('menu.py' in l for l in left) and any('play.py' in l for l in left) and any('the work given by the caller' in l for l in left)
    if not stopped: bad.append(('a lane stopped before its end', rc, st[:1], left))
    # a folder at the place of numeric.txt after the run has begun (the stand-in of the second build puts it there)
    rc, st, _ = go(r'^build\.js --debug$', 'block')
    left = [l for l in st[1:] if l.startswith('no result: ')]
    blocked = rc == 1 and len(st) > 1 and 'scheduled and without a result: 18;' in st[0] and 'outputs that could not be written: 1' in st[0] and len(left) == 18 and 'output not written: numeric.txt' in st and len([l for l in st[1:] if l.startswith('exit status 0: ')]) == STARTS - 18
    if not blocked: bad.append(('a folder at the place of numeric.txt during the run', rc, st[:1], len(left)))
    # ... and before the run
    rc, st, so = go(before='numeric.txt')
    early = rc == 1 and 'cannot be written: no check was run' in so and st == []
    if not early: bad.append(('a folder at the place of numeric.txt before the run', rc, so[:200], st[:1]))
    if missing: bad.append(('programs of the run without a stand-in', missing))
    print(f'the run of all checks on stand-ins for its {len(started)} programs: without a failure it ends with status 0 and lists {len(checks)} starts, all with status 0: {"yes" if green else "NO"}')
    print(f'one check at a time ends with status 1 after printing "474 passed, 1 failed": the run ends with status 1 and lists that check alone: {caught} of {len(ONE)}')
    print(f'the build fails: the run ends with status 1 before any check: {built} of {len(BUILD)}; a lane is stopped before its end: the run ends with status 1 and lists the stopped check and the 4 behind it as scheduled and without a result: {"yes" if stopped else "NO"}')
    print(f'a folder at the place of numeric.txt after the run has begun: the run ends with status 1, lists the 18 numeric checks as scheduled and without a result and the output as not written: {"yes" if blocked else "NO"}; the folder there before the run: it stops before any check: {"yes" if early else "NO"}')
    for b in bad: print('  FAILED:', b)
finally:
    shutil.rmtree(root, ignore_errors=True)
sys.exit(1 if bad else 0)
