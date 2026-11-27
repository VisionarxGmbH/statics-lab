"""Check 4: the page's solver against the independent solver on random states of the 16 examples
(supports, hinges, point loads at any angle and at member ends, distributed loads in four directions,
stiffness factors, profiles of single members, lengths from 0.5 to 30 m, seven sections).
Both take the members that are rigid along their axis exactly, each in its own way: the page by elimination of the
conditions, this solver from their singular vectors (indep.solve, axial='exact').  Compared: mechanism or not, degree n, reactions, N V M at 9 stations
and beside every point load (both sides), displacements there, the largest displacement of every member and of the
state, places where V = 0: on every piece of a member between two point loads, or a load and an end, one to one
within that piece (review 10, C105: a zero is never paired with one on the other side of a load), and the largest N,
V and M of the state as the page reports them.
Each difference is set against a scale of its own unit: a force (a reaction force, N, V) against the largest force of
the state, a moment (a fixing moment, M) against its largest moment, each at least 1; a displacement against the
largest displacement of the state, at least 0.001 mm.
Every scale is worked out by this solver alone (review 10, C117): the largest force and the largest moment from its
own reactions and its own member forces (own_max: at its stations on both sides, the moment also at its own zeros of
V), the largest displacement from its own search along every member (largest), which does not read the places where
the page found its own. Nothing that the page reports sets a scale: a largest value reported too high cannot widen a
tolerance. The page's largest N, V and M are compared with those values like any other number.
The reactions of each solver are also added to the loads of the state (balance): the forces, and the moments about
the first joint. These three sums are checks of equilibrium and no more. They show what a solver's own reactions leave
out of balance. They do not see an error that is in balance with itself (two redundant reactions wrong by amounts that
cancel), and they say nothing of a displacement: they do not tell which solver carries such a difference.
The page's sums vanish to the last digits. Those of this solver do not always: it cuts a member at every point load,
and where two loads stand 1 cm apart, or a load 1 cm from a joint, the piece of 1 cm costs it digits (up to 1e-7 of
the largest force in the states of the checks). Where this solver's own reactions miss equilibrium, its values are no
reference to more digits than that: the amount widens the tolerance of the state.
Where the supports of a state have three reaction components in all, statics alone gives the reactions (by_statics):
there each solver is set against those values, and a difference in a reaction has its owner.
A state fails when a force, a moment, a displacement or a largest displacement differs by more than its tolerance:
1e-7 of the scale plus ten times what this solver's own reactions leave out of balance in that state; or when a zero
of V has no partner within 1e-4 of the member. A state in which the page's reactions leave more than 1e-9 out of
balance, or differ by more than that from the reactions that statics alone gives, fails too.
At the end the check is tried on itself: in a copy of one solved state one recorded value at a time is made wrong by
four times the tolerance of that state (a reaction, a fixing moment, a force, a moment, a displacement, the largest
displacement of a member, the largest V, N and M of the state; the largest displacement of the state doubled, a zero
of V moved on a member without a point load inside, and one on a member with a point load inside), and each of these
copies must fail. Two more: with the three largest forces of the record set to 1e9, a shear wrong by four times the
tolerance must still measure four times the tolerance (the scales do not come from the record); and on a fixed state
that the dump adds to every file (beam of 6 m, 492.4 kN/m and 949.9 kN at 2.27 m, where V is zero 0.149 mm behind the
load) that zero is set as far before the load: the copy must fail.
usage: python3 compare_random.py <dump.json>"""
import sys, json, math, copy
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import indep as I
import numpy as np

TOL_F = 1e-7; TOL_D = 1e-7; TOL_EQ = 1e-9


def balance(mo, reac, scaleF, scaleM):
    """what the reactions and the loads of a state leave out of balance, by statics alone: the larger of the two sums of
    the forces as a share of the largest force, and the sum of the moments about the first joint as a share of the
    moments that are added (the sum of their sizes; in a truss the forces times their lever arms, with no bending
    moment to compare with), or of the largest moment of the state where that is larger. A distributed load from w1
    to w2 is two triangles: w1 L / 2 at a third and w2 L / 2 at two thirds of the member."""
    N = mo['nodes']; x0, y0 = N[0]['x'], N[0]['y']; S = [0.0, 0.0, 0.0, 0.0]
    def add(px, py, fx, fy): S[0] += fx; S[1] += fy; S[2] += (px - x0) * fy - (py - y0) * fx; S[3] += abs((px - x0) * fy) + abs((py - y0) * fx)
    def on(m, t): a = N[m['n1']]; b = N[m['n2']]; return a['x'] + (b['x'] - a['x']) * t, a['y'] + (b['y'] - a['y']) * t
    def length(m): a = N[m['n1']]; b = N[m['n2']]; return math.hypot(b['x'] - a['x'], b['y'] - a['y'])
    for l in mo['loads']:
        m = mo['members'][l['m']]; c = math.cos(math.radians(l['ang'])); sn = math.sin(math.radians(l['ang']))
        add(*on(m, l['a'] / length(m)), l['P'] * c, l['P'] * sn)
    for m in mo['members']:
        u = m['udl']
        if not u or not u.get('on', True): continue
        L = length(m); c = math.cos(math.radians(u['ang'])); sn = math.sin(math.radians(u['ang']))
        for w, t in ((u['w1'], 1 / 3), (u['w2'], 2 / 3)): add(*on(m, t), w * L / 2 * c, w * L / 2 * sn)
    for n, r in zip(N, reac): add(n['x'], n['y'], float(r[0]), float(r[1])); S[2] += float(r[2]); S[3] += abs(float(r[2]))
    return max(abs(S[0]), abs(S[1])) / scaleF, abs(S[2]) / max(scaleM, S[3])


def by_statics(mo):
    """the reactions of a state from the three sums of statics alone (forces along x and y, moments about the first
    joint), where its supports have three reaction components in all: a fixed support three, a pin two, a roller one
    (across its track, along y). None where the supports have another number of components, or where the three do not
    hold the structure as one body. Per joint [Rx, Ry, Mz], as the page records them."""
    N = mo['nodes']; comp = [(i, k) for i, n in enumerate(N) for k in {'fixed': (0, 1, 2), 'pin': (0, 1), 'roller': (1,)}.get(n.get('sup') or 'free', ())]
    if len(comp) != 3: return None
    x0, y0 = N[0]['x'], N[0]['y']; S = [0.0, 0.0, 0.0]
    def add(px, py, fx, fy): S[0] += fx; S[1] += fy; S[2] += (px - x0) * fy - (py - y0) * fx
    def on(m, t): a = N[m['n1']]; b = N[m['n2']]; return a['x'] + (b['x'] - a['x']) * t, a['y'] + (b['y'] - a['y']) * t
    def length(m): a = N[m['n1']]; b = N[m['n2']]; return math.hypot(b['x'] - a['x'], b['y'] - a['y'])
    for l in mo['loads']:
        m = mo['members'][l['m']]; add(*on(m, l['a'] / length(m)), l['P'] * math.cos(math.radians(l['ang'])), l['P'] * math.sin(math.radians(l['ang'])))
    for m in mo['members']:
        u = m['udl']
        if not u or not u.get('on', True): continue
        L = length(m)
        for w, t in ((u['w1'], 1 / 3), (u['w2'], 2 / 3)): add(*on(m, t), w * L / 2 * math.cos(math.radians(u['ang'])), w * L / 2 * math.sin(math.radians(u['ang'])))
    A = np.zeros((3, 3))
    for j, (i, k) in enumerate(comp):
        if k == 0: A[0, j] = 1; A[2, j] = -(N[i]['y'] - y0)
        elif k == 1: A[1, j] = 1; A[2, j] = N[i]['x'] - x0
        else: A[2, j] = 1
    if np.linalg.cond(A) > 1e8: return None
    r = np.linalg.solve(A, -np.array(S)); out = [[0.0, 0.0, 0.0] for _ in N]
    for j, (i, k) in enumerate(comp): out[i][k] = float(r[j])
    return out


def largest(R, mi):
    """the largest displacement along member mi, by this solver alone: 96 even places and its own stations, then every top
    of that row that reaches nine tenths of the best is refined between its neighbours (ternary search, 60 steps). A top
    that the row shows a little lower than another can be the higher one between its places: so all of them are refined"""
    m = R.mem[mi]; L = m['L']
    xs = []
    for x in sorted(list(m['stations']) + [L * k / 96 for k in range(97)]):   # an even place that is a station but for its last digit is that station
        if xs and x - xs[-1] < 1e-9 * L: continue
        xs.append(x)
    f = lambda x: math.hypot(*I.disp(R, mi, x, -1)[:2])
    v = [f(x) for x in xs]; best = max(v); out = best
    for k in range(len(xs)):
        if v[k] < best * 0.9: continue
        if (k > 0 and v[k - 1] > v[k]) or (k < len(xs) - 1 and v[k + 1] > v[k]): continue
        lo = xs[max(k - 1, 0)]; hi = xs[min(k + 1, len(xs) - 1)]
        for _ in range(60):
            a = lo + (hi - lo) / 3; b = hi - (hi - lo) / 3
            if f(a) < f(b): lo = a
            else: hi = b
        out = max(out, f((lo + hi) / 2))
    return out


def own_max(R, n):
    """the largest N, V and M of a state by this solver alone: at its stations on both sides (N and V run one way between
    two stations: the distributed load of a member acts one way), the moment also at its own zeros of V"""
    N = V = M = 0.0
    for mi in range(n):
        st = R.mem[mi]['stations']
        for k, x in enumerate(st):
            for sd in ((1,) if k == 0 else (-1,) if k == len(st) - 1 else (-1, 1)):
                a = I.at(R, mi, x, sd); N = max(N, abs(a[0])); V = max(V, abs(a[1])); M = max(M, abs(a[2]))
        for _, Mv in I.extremes(R, mi)[0]: M = max(M, abs(Mv))
    return N, V, M


def judge(rec, cache=None):
    """one state: ('mech' | 'det' | 'both mechanisms' | 'ok', problems, measures). cache keeps the independent solution
    of the state, so that the controls do not solve it again"""
    mo = rec['model']; EI, EA = I.section(rec['sec'])
    if cache is None or 'R' not in cache:
        for m in mo['members']:
            if m['udl'] is not None and not m['udl']['on']: m['udl'] = None
    mine_n = I.determinacy(mo); d = rec['det']
    if (mine_n[0], mine_n[1], mine_n[2], mine_n[3], mine_n[4]) != (d['n'], d['m'], d['r'], d['j'], d['c']): return 'det', [(mine_n, d)], {}
    mech = cache['mech'] if cache and 'mech' in cache else I.is_mechanism(mo, EI, EA)
    if cache is not None: cache['mech'] = mech
    if mech == rec['ok']: return 'mech', ['page ok=%s, mine mechanism=%s, n=%d' % (rec['ok'], mech, d['n'])], {}
    if not rec['ok']: return 'both mechanisms', [], {}
    if cache and 'R' in cache: R = cache['R']
    else:
        R = I.solve(mo, EI, EA, 'exact')
        if cache is not None: cache['R'] = R
    problems = []
    # forces and moments each against a scale of their own unit (review 07, finding C80); the scales are this solver's
    # own (review 10, finding C117): its reactions and the largest N, V and M of its members
    if cache and 'own' in cache: own = cache['own']
    else:
        own = own_max(R, len(mo['members']))
        if cache is not None: cache['own'] = own
    scaleF = max(1.0, max(abs(float(v)) for r in R.reac for v in r[:2]), own[0], own[1])
    scaleM = max(1.0, max(abs(float(r[2])) for r in R.reac), own[2])
    if cache is not None: cache['scales'] = (scaleF, scaleM)
    # the largest N, V and M of the state as the page reports them, against those values
    dtopF = max(abs(rec['max']['N'] - own[0]), abs(rec['max']['V'] - own[1])) / scaleF; dtopM = abs(rec['max']['M'] - own[2]) / scaleM
    dr = max(abs(a - b) for r1, r2 in zip(R.reac, rec['reac']) for a, b in zip(r1[:2], r2[:2])) / scaleF
    drm = max(abs(r1[2] - r2[2]) for r1, r2 in zip(R.reac, rec['reac'])) / scaleM
    # displacements are compared relative to the largest one of the state; where nothing moves (loads on supports or along
    # rigid members) both solvers return rounding amounts of 1e-13 m and less: the scale is then a thousandth of a millimetre
    if cache and 'tops' in cache: tops = cache['tops']
    else:
        tops = [largest(R, mi) for mi in range(len(mo['members']))]
        if cache is not None: cache['tops'] = tops
    dn = dm = dd = dt = 0.0; nz = 0; zc = [0, 0]; dscale = max(max(tops), 1e-6)
    if len(rec['mem']) != len(mo['members']): return 'ok', ['members: the record holds %d, the model has %d' % (len(rec['mem']), len(mo['members']))], {}
    for mi, M in enumerate(rec['mem']):
        # The length of the member is that between its joints, worked out here: the record's own length is checked
        # against it and used for nothing (review 11, C125: with the length of the record set to 60 m for a beam of 6 m
        # the allowance for a zero of V grew tenfold and a zero 3 mm off passed).
        ja, jb = mo['nodes'][mo['members'][mi]['n1']], mo['nodes'][mo['members'][mi]['n2']]; Lm = math.hypot(jb['x'] - ja['x'], jb['y'] - ja['y'])
        if abs(M['L'] - Lm) > 1e-9 * max(1.0, Lm): problems.append('length of member %d: the record holds %.9g m, its joints are %.9g m apart' % (mi, M['L'], Lm))
        # The readings that must be there (review 11, C126: a record without any reading of a member passed, because only
        # the readings found were compared): at nine places of the member and at every point load on it, from this
        # solver's own length and the loads of the model, on both sides; but for the two sides that lie outside the member.
        need = [f * Lm for f in (0, 0.125, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1)] + [min(max(l['a'], 0.0), Lm) for l in mo['loads'] if l['m'] == mi]
        lack = [(x, sd) for x in need for sd in (-1, 1) if not ((x <= 1e-12 and sd < 0) or (x >= Lm - 1e-12 and sd > 0)) and not any(abs(x - q[0]) <= 1e-9 * max(1.0, Lm) and q[1] == sd for q in M['pts'])]
        if lack: problems.append('readings missing on member %d: %d of the %d places and sides that are compared, the first at %.6g m on side %+d' % (mi, len(lack), 2 * len(need) - 2, lack[0][0], lack[0][1]))
        for x, sd, N, V, Mo, dX, dY in M['pts']:
            if (x <= 1e-12 and sd < 0) or (x >= Lm - 1e-12 and sd > 0): continue   # outside the member: not used by the page
            a = I.at(R, mi, x, sd); dn = max(dn, abs(a[0] - N), abs(a[1] - V)); dm = max(dm, abs(a[2] - Mo))
            dx, dy, _ = I.disp(R, mi, x, sd); dd = max(dd, abs(dx - dX), abs(dy - dY))
        dt = max(dt, abs(tops[mi] - M['dmax']))        # the largest displacement of the member: the page's search against this solver's own
        pk, _ = I.extremes(R, mi)
        # Zeros of V inside the pieces of the member, between two point loads or a load and an end: this solver's own
        # (extremes) against the page's, one to one, on every member. A peak that this solver puts on a station is a
        # change of sign at a point load: it is held by the two shear values beside the load, which are compared above.
        # Not compared: a zero within a thousandth of the member length from an end of the member, and a zero within a
        # millionth of the member length from a point load. At an end V can touch zero (triangular load, zero end
        # without shear): a rounding amount in this solver's end shear then moves the root into the member by
        # sqrt(2 L V0 / q), about 0.3 mm in seed 22 state 315. Beside a point load the last digits decide on which side
        # of the load the zero falls. Such a zero needs no partner; every other zero does, within 1e-4 of the member
        # and on the same piece: between the same two stations of this solver (review 10, C105: a partner was taken
        # from the other side of a load, where the shear is another by the size of the load).
        st = R.mem[mi]['stations']
        band = lambda x: x < 1e-3 * Lm or x > (1 - 1e-3) * Lm or any(abs(x - q) < 1e-6 * Lm for q in st[1:-1])
        piece = lambda x: sum(1 for q in st[1:-1] if q < x)          # the number of load points before x
        zs = sorted(x for x, _ in pk if not any(abs(x - q) < 5e-10 for q in st)); pz = sorted(M['zeros'])
        used = set(); lone = []
        for z in zs:
            k = min((j for j in range(len(pz)) if j not in used and piece(pz[j]) == piece(z)), key=lambda j: abs(pz[j] - z), default=None)
            if k is not None and abs(pz[k] - z) <= 1e-4 * Lm:
                used.add(k)
                if not band(z): zc[0] += 1; zc[1] += len(st) > 2
            elif not band(z): lone.append(('second solver', z))
        lone += [('page', pz[j]) for j in range(len(pz)) if j not in used and not band(pz[j])]
        if lone: nz += 1; problems.append('zeros of V member %d: without a partner %s; second solver %s page %s' % (mi, lone, zs, pz))
    dn /= scaleF; dm /= scaleM; dd /= dscale; dt /= dscale
    dx = abs(max(tops) - rec['max']['D']) / dscale       # the largest displacement of the state
    # The reactions of each solver against the loads of the state: the three sums show what a solver's own reactions
    # leave out of balance, and no more. They do not tell which solver carries a difference that is in balance with
    # itself, and they say nothing of a displacement (see the head of this file). With the rigid members taken exactly
    # by both, the two agree to about 1e-9 wherever this solver's own reactions balance the loads; where they do not,
    # this solver is no reference to more digits: the tolerance of a state is 1e-7 plus ten times that amount.
    eqp = max(balance(mo, rec['reac'], scaleF, scaleM)); eqi = max(balance(mo, R.reac, scaleF, scaleM)); tol = TOL_F + 10 * eqi
    if cache is not None: cache['tol'] = tol
    if eqp > TOL_EQ: problems.append('reactions of the page against the loads: %.2e out of balance' % eqp)
    # three reaction components: statics alone gives them, and each solver is set against those values
    ex = by_statics(mo); st3 = None
    if ex is not None:
        off = lambda rr: max(max(max(abs(float(a[0]) - b[0]), abs(float(a[1]) - b[1])) / scaleF, abs(float(a[2]) - b[2]) / scaleM) for a, b in zip(rr, ex))
        st3 = (off(rec['reac']), off(R.reac))
        if st3[0] > TOL_EQ: problems.append('reactions of the page against those that statics alone gives: %.2e' % st3[0])
    if dr > tol or drm > tol or dn > tol or dm > tol or dd > tol or dt > tol or dx > tol or dtopF > tol or dtopM > tol:
        problems.append('reac %.2e rmom %.2e nv %.2e m %.2e disp %.2e dmax of a member %.2e, of the state %.2e; largest N, V of the state %.2e, largest M %.2e; tolerance %.2e' % (dr, drm, dn, dm, dd, dt, dx, dtopF, dtopM, tol))
    nread = sum(1 for mi, M in enumerate(rec['mem']) for q in M['pts'])
    return 'ok', problems, dict(reac=dr, rmom=drm, nv=dn, m=dm, disp=dd, dmax=max(dt, dx), zeros=nz, eqp=eqp, eqi=eqi, tol=tol, zc=zc, st3=st3, topF=dtopF, topM=dtopM, nread=nread)


allrecs = json.load(open(sys.argv[1]))
recs = [r for r in allrecs if not r.get('fixed')]; fixed = [r for r in allrecs if r.get('fixed')]   # the fixed state of the last control is no random state
n_ok = n_mech = 0; bad = []; worst = dict(reac=0, rmom=0, nv=0, m=0, disp=0, dmax=0, zeros=0); eq = dict(eqp=0.0, eqi=0.0, tol=0.0); loose = 0; top = (0.0, None, None)
nread_all = 0
mech_diff = []; det_diff = []; ctl = None; ctl2 = None; zall = [0, 0]; s3 = [0, 0.0, 0.0]; tops_ = [0.0, 0.0]
for ri, rec in enumerate(recs):
    cache = {}
    kind, problems, ms = judge(rec, cache)
    if kind == 'det': det_diff.append((ri, rec['preset']) + problems[0]); continue
    if kind == 'mech': mech_diff.append((ri, rec['preset'], problems[0])); continue
    if kind == 'both mechanisms': n_mech += 1; continue
    n_ok += 1; nread_all += ms['nread']
    for k in worst: worst[k] = max(worst[k], ms[k]) if k != 'zeros' else worst[k] + ms[k]
    for k in eq: eq[k] = max(eq[k], ms[k])
    zall[0] += ms['zc'][0]; zall[1] += ms['zc'][1]; tops_ = [max(tops_[0], ms['topF']), max(tops_[1], ms['topM'])]
    if ms['st3']: s3 = [s3[0] + 1, max(s3[1], ms['st3'][0]), max(s3[2], ms['st3'][1])]
    if ms['tol'] > 2 * TOL_F: loose += 1
    big = max(ms[k] for k in ('reac', 'rmom', 'nv', 'm', 'disp', 'dmax'))
    if big > top[0]: top = (big, (ri, rec['preset'], ms['eqp'], ms['eqi']), ms['st3'])
    for pr in problems: bad.append((ri, rec['preset'], pr))
    # the state for the controls: the first one that passes, has a fixing moment, a member without point loads inside whose
    # shear is zero somewhere away from its ends, and moves
    away = lambda mi, M: [z for z in M['zeros'] if all(abs(z - q) > 1e-2 * M['L'] for q in cache['R'].mem[mi]['stations'])]
    if ctl is None and not problems and any(abs(r[2]) > 1 for r in rec['reac']) and max(cache['tops']) > 1e-4:
        zm = [mi for mi, M in enumerate(rec['mem']) if len(cache['R'].mem[mi]['stations']) == 2 and away(mi, M)]
        if zm: ctl = (ri, rec, cache, zm[0])
    # the state for the ninth control: the first one that passes and has a member with a point load inside whose shear is
    # zero inside a piece, away from the loads and the ends
    if ctl2 is None and not problems:
        zl = [mi for mi, M in enumerate(rec['mem']) if len(cache['R'].mem[mi]['stations']) > 2 and away(mi, M)]
        if zl: ctl2 = (ri, rec, cache, zl[0], rec['mem'][zl[0]]['zeros'].index(away(zl[0], rec['mem'][zl[0]])[0]))
print('%d states: %d solved by both, %d mechanisms by both' % (len(recs), n_ok, n_mech))
steps3 = sum(1 for r in recs if r.get('limit') == 'steps')
print('rigid members solved exactly by the page in %d states, in three steps in %d' % (sum(1 for r in recs if r.get('limit') == 'exact'), steps3))
print('mechanism classified differently: %d' % len(mech_diff))
for x in mech_diff[:20]: print('   ', x)
print('degree of indeterminacy counted differently: %d' % len(det_diff))
for x in det_diff[:10]: print('   ', x)
print('largest relative differences (reac, nv: forces against the largest force; rmom, m: moments against the largest moment; disp, dmax: against the largest displacement):', {k: ('%.2e' % v if k != 'zeros' else v) for k, v in worst.items()})
print('every scale is the second solver\'s own; the largest N and V of a state as the page reports them differ from the second solver\'s by at most %.2e of the largest force, the largest M by at most %.2e of the largest moment' % tuple(tops_))
print('equilibrium of the reactions with the loads of the state (forces as a share of the largest force, moments about the first joint as a share of the moments added): the page leaves at most %.2e out of balance, the second solver at most %.2e' % (eq['eqp'], eq['eqi']))
print('states whose supports have three reaction components, where statics alone gives the reactions: %d; largest difference of a reaction from those values: the page %.2e, the second solver %.2e' % tuple(s3))
if top[1]: print('the state with the largest difference (state %d, %s): the page leaves %.2e out of balance there, the second solver %.2e' % top[1] + ('; three reaction components: from the reactions that statics alone gives, the page differs by %.2e, the second solver by %.2e' % top[2] if top[2] else '; more than three reaction components: the sums do not say which of the two carries the difference'))
print('tolerance of a state: 1e-7 of its scale + 10 x what the second solver leaves out of balance in it; above 2e-7 in %d states, largest %.2e' % (loose, eq['tol']))
print('zeros of V compared one to one within the piece of a member between two point loads or a load and an end: %d, of them %d on members with a point load inside' % tuple(zall))
print('readings of members in the records of the states solved by both: %d (place, side, N, V, M and two displacements each); a state fails when a reading at one of the nine places of a member or beside a point load is missing, or when the length of a member in the record is not that between its joints' % nread_all)
free = sum(1 for r in recs if r.get('free'))
print('states with a member whose two stiffness factors are those of no section of the list (the bending and the axial stiffness changed apart: a test of the analysis beyond what the page can set): %d of %d; the other %d states have sections of the list only' % (free, len(recs), len(recs) - free))
print('states beyond tolerance: %d' % len(bad))
for x in bad[:20]: print('   ', x)
# ---- the check tried on itself: one recorded value of a state that passes is made wrong; the state must then fail
missed = []
if ctl is None: missed.append('no state fit for the controls')
else:
    ri, rec, cache, zmi = ctl; T4 = 4 * cache['tol']
    sF, sM = cache['scales']; sD = max(max(cache['tops']), 1e-6)     # the scales of the state: the second solver's own
    kR = max(range(len(rec['reac'])), key=lambda i: abs(rec['reac'][i][1])); kM = max(range(len(rec['reac'])), key=lambda i: abs(rec['reac'][i][2]))
    mT = max(range(len(rec['mem'])), key=lambda i: rec['mem'][i]['dmax'])
    def inner(c):                                       # a recorded point that the comparison uses
        M = c['mem'][mT]
        return next(q for q in M['pts'] if not ((q[0] <= 1e-12 and q[1] < 0) or (q[0] >= M['L'] - 1e-12 and q[1] > 0)))
    def c_reac(c): c['reac'][kR][1] += T4 * sF
    def c_rmom(c): c['reac'][kM][2] += T4 * sM
    def c_force(c): inner(c)[3] += T4 * sF
    def c_moment(c): inner(c)[4] += T4 * sM
    def c_disp(c): inner(c)[6] += T4 * sD
    def c_top(c): c['mem'][mT]['dmax'] *= 1 + T4
    def c_max(c): c['max']['D'] *= 2
    def c_zero(c): c['mem'][zmi]['zeros'][0] += 4e-4 * c['mem'][zmi]['L']
    def c_maxV(c): c['max']['V'] += T4 * sF
    def c_maxN(c): c['max']['N'] += T4 * sF
    def c_maxM(c): c['max']['M'] += T4 * sM
    def c_none(c): c['mem'][mT]['pts'] = []                                             # C126: every reading of a member
    def c_len(c): c['mem'][zmi]['L'] *= 10                                             # C125: the length of a member in the record
    controls = [('a reaction force by four times the tolerance', c_reac), ('a fixing moment by four times the tolerance', c_rmom), ('a shear force by four times the tolerance', c_force), ('a moment by four times the tolerance', c_moment),
                ('a displacement by four times the tolerance', c_disp), ('the largest displacement of a member by four times the tolerance', c_top), ('the largest displacement of the state doubled', c_max), ('a zero of V moved by 4e-4 of the member', c_zero),
                ('the largest shear force of the state by four times the tolerance', c_maxV), ('the largest axial force of the state by four times the tolerance', c_maxN), ('the largest moment of the state by four times the tolerance', c_maxM),
                ('every reading of a member taken out of the record', c_none), ('the length of a member in the record ten times too large', c_len)]
    caught = 0; total = len(controls)
    for name, change in controls:
        c = copy.deepcopy(rec); change(c)
        kind, problems, _ = judge(c, cache)
        if kind == 'ok' and problems: caught += 1
        else: missed.append(name)
    # a zero of V on a member with a point load inside, in a state that has one
    n9 = ''; total += 1
    if ctl2 is None: missed.append('no state with a zero of V on a member with a point load inside')
    else:
        r2, rec2, cache2, m2, k2 = ctl2
        c = copy.deepcopy(rec2); c['mem'][m2]['zeros'][k2] += 4e-4 * c['mem'][m2]['L']
        kind, problems, _ = judge(c, cache2)
        if kind == 'ok' and problems: caught += 1
        else: missed.append('a zero of V on a member with a point load inside moved by 4e-4 of the member')
        n9 = '; a zero of V on a member with a point load inside, in state %d (%s), member %d, at %.6f m of %s m' % (r2, rec2['preset'], m2, rec2['mem'][m2]['zeros'][k2], ('%.6f' % rec2['mem'][m2]['L']).rstrip('0').rstrip('.'))
        # C126: the reading just behind a point load inside that member taken out of the record
        total += 1
        la = next(q for q in cache2['R'].mem[m2]['stations'][1:-1])
        c = copy.deepcopy(rec2); c['mem'][m2]['pts'] = [q for q in c['mem'][m2]['pts'] if not (abs(q[0] - la) <= 1e-9 and q[1] > 0)]
        kind, problems, _ = judge(c, cache2)
        # where that load stands on one of the nine places the record holds the reading twice, and both are taken out
        gone = len(rec2['mem'][m2]['pts']) - len(c['mem'][m2]['pts'])
        if kind == 'ok' and gone >= 1 and any(pr.startswith('readings missing on member %d:' % m2) for pr in problems): caught += 1
        else: missed.append('the reading behind a point load taken out of the record')
        # C125: the same zero moved, with the length of that member in the record ten times too large: the zero must
        # still be reported, with the allowance of the length between the joints
        total += 1
        c = copy.deepcopy(rec2); c['mem'][m2]['zeros'][k2] += 4e-4 * c['mem'][m2]['L']; c['mem'][m2]['L'] *= 10
        kind, problems, _ = judge(c, cache2)
        if kind == 'ok' and any('zeros of V' in pr for pr in problems) and any('length of member' in pr for pr in problems): caught += 1
        else: missed.append('a zero of V moved by 4e-4 of the member, with the length of the member in the record ten times too large')
    # the scales do not come from the record (C117): the three largest forces of the record set to 1e9, and a shear wrong
    # by four times the tolerance. The state fails, and the shear still measures four times the tolerance
    total += 1
    c = copy.deepcopy(rec); c_force(c)
    for k in ('N', 'V', 'M'): c['max'][k] = 1e9
    kind, problems, ms = judge(c, cache)
    if kind == 'ok' and problems and ms['nv'] > 3.9 * cache['tol']: caught += 1
    else: missed.append('a shear force by four times the tolerance, with the largest N, V and M of the record set to 1e9 (measured %.2e, tolerance %.2e)' % (ms.get('nv', 0), cache['tol']))
    nS = '; with the largest N, V and M of the record set to 1e9 a shear wrong by four times the tolerance measures %.2f times the tolerance' % (ms.get('nv', 0) / cache['tol'])
    print('the check tried on itself (state %d, %s): %d recorded values made wrong one at a time, %d of them fail the check%s%s' % (ri, rec['preset'], total, caught, n9, nS))
# the fixed state (C105): its zero of V behind the load, set as far before the load, must fail
if len(fixed) != 1: missed.append('the fixed state of the dump: %d found' % len(fixed))
else:
    f = fixed[0]; cache = {}
    kind, problems, ms = judge(f, cache)
    M0 = f['mem'][0]; load = M0['cuts'][0] if M0.get('cuts') else None
    zf = [z for z in M0['zeros'] if load is not None and 0 < z - load < 1e-3]
    if kind != 'ok' or problems: missed.append('the fixed state does not pass as it stands: %s %s' % (kind, problems[:1]))
    elif len(zf) != 1: missed.append('the fixed state: no single zero of V just behind its load: %s' % M0['zeros'])
    else:
        z = zf[0]; c = copy.deepcopy(f); c['mem'][0]['zeros'][c['mem'][0]['zeros'].index(z)] = 2 * load - z
        kind2, problems2, _ = judge(c, cache)
        hit = kind2 == 'ok' and any('zeros of V' in pr for pr in problems2)
        if not hit: missed.append('the zero of V of the fixed state set before its load')
        vb = I.at(cache['R'], 0, 2 * load - z, -1)[1]
        print('the fixed state (%s): passes as it stands, with V = 0 at %.9f m, %.6f mm behind the load at %s m; that zero set as far before the load, at %.9f m, where V = %.3f kN: the check %s' % (f['fixed'], z, (z - load) * 1000, ('%.6f' % load).rstrip('0').rstrip('.'), 2 * load - z, vb, 'fails' if hit else 'PASSES'))
for x in missed: print('    not caught:', x)
sys.exit(1 if bad or mech_diff or det_diff or missed or steps3 else 0)
