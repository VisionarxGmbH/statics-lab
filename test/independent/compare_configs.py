"""Stable or mechanism: every arrangement of supports and hinges of the 16 examples, with every section, as the page
says it (dump_configs.js) against the independent solver, which tests the rank of the stiffness matrix without
condensing the hinges. The file names the profile of a member that has one of its own; this solver works out the
stiffness of that member from its own table, for each of the seven sections of the structure (review 10, C118), and
classifies the arrangement with each of the seven.
For every mechanism also the changes that the page names to make it stable. Each named set is applied to the
mechanism's own model, with its lengths and its profiles, and that model is tested by this solver (review 10, C119:
the sets were looked up in a table by example, supports and hinges, which in the run with varied lengths held another
model). The fewest joints that have to change are found on the same model by trying every set of changes, and so is
whether a weaker support would do.
The free movements that the page tells apart (FS.movements) are checked against the free movements of the independent
solver, which come from the singular vectors of its stiffness matrix. Two kinds of check, reported apart:
- a movement of the whole structure (it slides sideways, moves up and down, turns about a joint) is built here from the
  words alone, the kind and the centre, and must lie in that space;
- a movement of a part is not built from the words: the words name its joints, their direction and the members that
  turn, not how far each joint moves. Here the movement that the page worked out is taken joint by joint: it must lie
  in that space, and what the page records of it is set against it (the joints named are the joints that move, in the
  directions said; the members said to turn are those with one end that moves and one that stays, and that end moves
  across the member).
The movements of one mechanism must be independent of each other and as many as the independent solver counts.
What the panel shows of them is counted too. Where one hold at a joint stops the mechanism, the panel says it in one
sentence that names those joints (FS.loose): that list is set against the one free movement of the independent solver,
which must move exactly those joints in those directions. Elsewhere the panel writes the movements one by one, up to
four; of more than four it writes the first three and counts the others.
usage: python3 compare_configs.py <dump.json>"""
import sys, json, pathlib, itertools
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import indep as I

recs = json.load(open(sys.argv[1]))
names = list(I.SECTIONS)
bad = []; n = 0; mech = 0; huge = 0; nm = 0; more = 0; own = 0
def with_section(mo, g):
    """the model under the section g of the structure: a member with a profile of its own gets its two factors from this
    solver's table of sections, any other member has the section of the structure"""
    c = dict(mo); c['members'] = []
    for m in mo['members']:
        q = dict(m)
        if m.get('sec'): q['kf'] = I.SECTIONS[m['sec']][0] / I.SECTIONS[g][0]; q['ka'] = I.SECTIONS[m['sec']][1] / I.SECTIONS[g][1]
        else: q['kf'] = 1.0; q['ka'] = 1.0
        c['members'].append(q)
    return c
is_mech = []                                           # per arrangement: a mechanism by the independent solver
tested = {}
def mech_of(ri, nodes):
    """is the model of arrangement ri a mechanism with these supports and hinges: the arrangement's own lengths and
    profiles, tested by the independent solver (IPE 300 as the section of the structure)"""
    k = (ri, tuple(x['sup'] for x in nodes), tuple(bool(x['hinge']) for x in nodes))
    if k not in tested:
        mo = with_section(recs[ri]['model'], 'IPE 300'); mo['nodes'] = nodes
        tested[k] = I.is_mechanism(mo, *I.section('IPE 300'))
    return tested[k]
for ri, rec in enumerate(recs):
    mo = rec['model']
    if any(any(m.get('rel') or [0, 0]) for m in mo['members']): raise SystemExit('a member release in the model: not covered by the independent solver')
    if any('kf' in m or 'ka' in m for m in mo['members']): raise SystemExit('the file holds stiffness factors of the page: they are worked out here')
    for m in mo['members']: m['udl'] = None
    own += any(m.get('sec') for m in mo['members'])
    mine = [I.is_mechanism(with_section(mo, s), *I.section(s)) for s in names]
    if any(x != mine[0] for x in mine): bad.append((ri, rec['preset'], 'independent solver differs between sections', mine))
    for si, s in enumerate(names):
        n += 1
        if rec['ok'][si] == mine[si]:
            sup = [x['sup'] for x in mo['nodes']]; hg = [i for i, x in enumerate(mo['nodes']) if x['hinge']]
            bad.append((ri, rec['preset'], s, 'page: %s, independent: %s' % ('stable' if rec['ok'][si] else 'mechanism', 'mechanism' if mine[si] else 'stable'), sup, hg))
        if rec['ok'][si] and rec['big'][si] > rec['lim'][si]: huge += 1; bad.append((ri, rec['preset'], s, 'stable with a displacement of %.3g m, beyond ten times W L^3 / EI = %.3g m' % (rec['big'][si], rec['lim'][si])))
    if mine[0]:                                        # a mechanism: the number of free movements, section by section
        k = I.free_modes(with_section(mo, 'IPE 300'), *I.section('IPE 300')); nm += 1; more += k > max(1, -rec['det']['n'])
        if any(x != k for x in rec['modes']): bad.append((ri, rec['preset'], 'free movements: page %s, independent %d' % (rec['modes'], k)))
    mech += mine[0]
    is_mech.append(mine[0]); tested[(ri, tuple(x['sup'] for x in mo['nodes']), tuple(bool(x['hinge']) for x in mo['nodes']))] = mine[2]
print('%d arrangements, %d with every section, each classified by the independent solver with each of the seven sections: %d mechanisms and %d stable; %d arrangements have a member with a profile of its own, whose stiffness the independent solver takes from its own table for every section' % (len(recs), n, mech, len(recs) - mech, own))
print('free movements of the %d mechanisms counted by both: in %d of them more are free than the count n shows' % (nm, more))
print('classified differently, counted differently or absurd: %d' % len(bad))
for b in bad[:25]: print('   ', b)
# ---- what the page names to make a mechanism stable
ORDER = ['free', 'roller', 'pin', 'fixed']
def apply(nodes, changes):
    c = [dict(x) for x in nodes]
    for i, what in changes:
        if what == 'close': c[i]['hinge'] = False
        else: c[i]['sup'] = what
    return c
def options(nodes):
    """per joint that can change: the stronger supports, or the closing of its hinge"""
    o = {}
    for i, x in enumerate(nodes):
        if x['cs']:
            st = ORDER[ORDER.index(x['sup']) + 1:]
            if st: o[i] = st
        elif x['ch'] and x['hinge']: o[i] = ['close']
    return o
def fewest(ri, nodes):
    """the fewest joints whose change makes the arrangement stable, tried on its own model by the independent solver; None: no change does"""
    o = options(nodes)
    for k in range(1, len(o) + 1):
        for js in itertools.combinations(sorted(o), k):
            for ch in itertools.product(*[o[j] for j in js]):
                if not mech_of(ri, apply(nodes, list(zip(js, ch)))): return k
    return None
cnt = {1: 0, 2: 0, 3: 0, 4: 0}; named = 0; fb = []
def check_fix(ri, rec, count=None):
    """the changes that the page names for arrangement ri, as the record rec holds them: what is wrong with them.
    Every mechanism must carry them, and where a change of one to three joints makes it stable the page must name at
    least one set of that many joints that does (review 11, C128: a record whose sets were emptied passed)"""
    out = []; nodes = rec['model']['nodes']; pre = rec['preset']
    if not is_mech[ri]:
        if rec['fix'] is not None: out.append((ri, pre, 'stable, and the page names changes'))
        return out
    f = rec['fix']
    if f is None: return [(ri, pre, 'a mechanism without named changes')]
    if not rec['fixSame']: out.append((ri, pre, 'the named changes differ between sections'))
    k = fewest(ri, nodes)
    if count is not None: count[f['n']] += 1
    if f['n'] < 4:
        if k != f['n']: out.append((ri, pre, 'page: %d joints to change, fewest on its own model: %s' % (f['n'], k)))
        if not f['sets']: out.append((ri, pre, 'no set of changes is named, and a change of %s joints makes it stable' % k))
        for st in f['sets']:
            if count is not None: count['named'] += 1
            ch = [(q['i'], 'close' if q.get('close') else q['sup']) for q in st]
            if len(ch) != f['n'] or len(set(i for i, _ in ch)) != len(ch): out.append((ri, pre, 'a set of %d changes at %d joints' % (len(ch), len(set(i for i, _ in ch)))))
            if mech_of(ri, apply(nodes, ch)): out.append((ri, pre, 'the named set leaves a mechanism', ch))
            for j, (i, what) in enumerate(ch):                 # each named support is the weakest kind that does it with the others
                if what == 'close': continue
                weaker = ORDER[ORDER.index(what) - 1]
                if not mech_of(ri, apply(nodes, ch[:j] + [(i, weaker)] + ch[j + 1:])): out.append((ri, pre, 'a weaker support does it as well', ch, weaker))
    else:
        if k is not None and k < 4: out.append((ri, pre, 'page: more than three joints, fewest on its own model: %d' % k))
        ch = [(q['i'], 'close' if q.get('close') else q['sup']) for q in f['set']]
        if (f['kind'] == '') != (k is None): out.append((ri, pre, 'page names %r, fewest on its own model: %s' % (f['kind'], k)))
        if k is not None and not ch: out.append((ri, pre, 'no set of changes is named, and a change of %d joints makes it stable' % k))
        if ch:
            if count is not None: count['named'] += 1
            if mech_of(ri, apply(nodes, ch)): out.append((ri, pre, 'the named set leaves a mechanism', ch))
    return out
cnt['named'] = 0
for ri, rec in enumerate(recs): fb += check_fix(ri, rec, cnt)
named = cnt['named']
print('changes that the page names for the %d mechanisms: one joint in %d, two in %d, three in %d, more in %d; %d named sets, each applied to the model of its own mechanism (its lengths and profiles) and tested by the independent solver; %d models tested in all for the named sets, the fewest changes and the weaker supports' % (nm, cnt[1], cnt[2], cnt[3], cnt[4], named, len(tested) - len(recs)))
print('named sets that leave a mechanism, counts of joints that differ from the fewest found on the same model, weaker supports that do it as well: %d' % len(fb))
for b in fb[:25]: print('   ', b)
# ---- the free movements that the page tells apart
mb = []; told = 0; kinds = {'slide': 0, 'lift': 0, 'turn': 0, 'part': 0}; untold = 0; turning = 0
def inside(S, t):
    """does the movement t (2 numbers per joint) lie in the space S of the free movements (orthonormal rows)"""
    t = np.asarray(t, float); r = t - S.T @ (S @ t) if len(S) else t
    return np.linalg.norm(r) <= 1e-6 * np.linalg.norm(t)
def check_moves(ri, rec, count=None):
    """the free movements that the page tells of arrangement ri, as the record rec holds them: what is wrong with them.
    Every mechanism must have them told (review 11, C128: a record without them was counted as "not told" and passed)"""
    mb = []; mo = rec['model']; nodes = mo['nodes']; pre = rec['preset']; J = len(nodes); C = count is not None
    if not is_mech[ri]:
        if rec.get('moves'): mb.append((ri, pre, 'stable, and the page tells movements'))
        return mb
    if rec['movesNull'] or rec['moves'] is None:
        if C: count['untold'] += 1
        return mb + [(ri, pre, 'a mechanism whose free movements the page does not tell')]
    if not rec['movesSame']: mb.append((ri, pre, 'what the page says of the movements differs between sections'))
    S = I.free_space(with_section(mo, 'IPE 300'), *I.section('IPE 300')); mv = rec['moves']
    if len(S) != len(mv): return mb + [(ri, pre, 'movements: page tells %d, independent space has %d' % (len(mv), len(S)))]
    built = []
    for q in mv:
        if C: count['told'] += 1; count[q['kind']] += 1
        if q['kind'] == 'slide': t = [1.0, 0.0] * J
        elif q['kind'] == 'lift': t = [0.0, 1.0] * J
        elif q['kind'] == 'turn':
            if q['about'] is not None and q['about'] >= 0: cx, cy = nodes[q['about']]['x'], nodes[q['about']]['y']
            else: cx = sum(n['x'] for n in nodes) / J; cy = sum(n['y'] for n in nodes) / J
            t = []
            for n in nodes: t += [-(n['y'] - cy), n['x'] - cx]
            if q['about'] is not None and q['about'] >= 0 and nodes[q['about']]['sup'] == 'free': mb.append((ri, pre, 'turns about a joint without a support'))
        else:
            t = q['t']
            moving = sorted(i for i in range(J) if abs(t[2 * i]) > 1e-9 or abs(t[2 * i + 1]) > 1e-9)
            if moving != sorted(j[0] for j in q['joints']): mb.append((ri, pre, 'the joints named for a part are not the joints that move', q['joints'], moving))
            for i, sx, sy in q['joints']:
                if (sx, sy) != (np.sign(round(t[2 * i], 9)), np.sign(round(t[2 * i + 1], 9))): mb.append((ri, pre, 'direction of a joint', i))
            want = []
            for mi, m in enumerate(mo['members']):
                a, b = m['n1'] in moving, m['n2'] in moving
                if a != b:
                    want.append([mi, m['n2'] if a else m['n1']])
                    # the moving end moves across the member: the member turns about its other end
                    e = m['n1'] if a else m['n2']; o = m['n2'] if a else m['n1']
                    ax = (nodes[e]['x'] - nodes[o]['x'], nodes[e]['y'] - nodes[o]['y'])
                    along = (t[2 * e] * ax[0] + t[2 * e + 1] * ax[1]) / np.hypot(*ax) / np.hypot(t[2 * e], t[2 * e + 1])
                    if abs(along) > 1e-6: mb.append((ri, pre, 'a member said to turn about its end is stretched', mi, along))
            if C: count['turning'] += len(want)
            if sorted(want) != sorted(q['turns']): mb.append((ri, pre, 'the members said to turn', q['turns'], want))
        if not inside(S, t): mb.append((ri, pre, 'a movement the page tells is not free by the independent solver', q['kind'], q.get('about')))
        if q['kind'] != 'part' and not inside(S, q['t']): mb.append((ri, pre, 'the exported movement is not free by the independent solver', q['kind']))
        built.append(np.asarray(t, float) / np.linalg.norm(t))
    if np.linalg.matrix_rank(np.array(built), tol=1e-6) != len(built): mb.append((ri, pre, 'the movements told are not independent of each other'))
    return mb
mc = {'told': 0, 'turning': 0, 'untold': 0, 'slide': 0, 'lift': 0, 'turn': 0, 'part': 0}
for ri, rec in enumerate(recs): mb += check_moves(ri, rec, mc)
told, turning, untold = mc['told'], mc['turning'], mc['untold']; kinds = mc
print('free movements that the page tells apart: %d in %d mechanisms (%d slide sideways, %d move up and down, %d turn, %d parts with %d turning members); not told in %d mechanisms' % (told, nm - untold, kinds['slide'], kinds['lift'], kinds['turn'], kinds['part'], turning, untold))
print('of these, built again from the words alone (the kind and the centre) and found in the free movements of the independent solver: %d movements of the whole structure; taken as the page worked them out, found there, and set against what the page records of them (joints, directions, turning members): %d movements of parts' % (kinds['slide'] + kinds['lift'] + kinds['turn'], kinds['part']))
print('movements told that are not free by the independent solver, not independent, or described wrongly: %d' % len(mb))
for b in mb[:25]: print('   ', b)
# ---- what the panel shows of the movements
RX = {'fixed': (0, 1, 2), 'pin': (0, 1), 'roller': (1,), 'free': ()}
one = 0; lb = []; listed = 0; shown = 0; counted = 0; over4 = 0; named = 0
for ri, rec in enumerate(recs):
    mo = rec['model']; nodes = mo['nodes']; pre = rec['preset']
    if not is_mech[ri] or rec['moves'] is None: continue
    if not rec['looseSame']: lb.append((ri, pre, 'the single holds that make it stable differ between sections'))
    S = I.free_space(with_section(mo, 'IPE 300'), *I.section('IPE 300')); lo = sorted(tuple(q) for q in rec['loose'])
    # one free movement: a hold of a joint stops it exactly where the movement moves that joint in that direction
    want = sorted((i, d) for i in range(len(nodes)) for d in (0, 1) if d not in RX[nodes[i]['sup'] or 'free'] and abs(S[0][2 * i + d]) > 1e-6 * np.abs(S[0]).max()) if len(S) == 1 else []
    if lo != want: lb.append((ri, pre, 'single holds: page %s, from the free movement of the independent solver %s' % (lo, want)))
    if lo: one += 1; named += len(set(i for i, d in lo))
    else:
        k = len(rec['moves']); listed += 1; shown += k if k <= 4 else 3; counted += 0 if k <= 4 else k - 3; over4 += k > 4
print('on the panel: one sentence that names the joints where a single hold stops the mechanism in %d mechanisms (%d joints named); the movements one by one in %d mechanisms: %d written out, %d counted without a description of their own, in %d mechanisms with more than four free movements' % (one, named, listed, shown, counted, over4))
print('single holds that differ from the free movement of the independent solver: %d' % len(lb))
for b in lb[:25]: print('   ', b)
# ---- the check of the changes and of the movements tried on itself (review 11, C128): in copies of the record of one
# mechanism that a change of one or two joints makes stable and that has free movements told, the movements are taken
# away, then the named sets, then one set is made a set that leaves a mechanism. Each copy must be reported.
import copy
ctl = next((ri for ri, r in enumerate(recs) if is_mech[ri] and r['fix'] and r['fix']['n'] < 3 and len(r['fix']['sets']) >= 2 and r.get('moves') and len(r['moves']) >= 2 and not check_fix(ri, r) and not check_moves(ri, r)), None)
caught = []
if ctl is None: bad.append(('no mechanism for the controls',))
else:
    r0 = recs[ctl]
    c1 = copy.deepcopy(r0); c1['moves'] = None
    c2 = copy.deepcopy(r0); c2['moves'] = []
    c3 = copy.deepcopy(r0); c3['fix']['sets'] = []
    c4 = copy.deepcopy(r0); c4['fix'] = None
    c5 = copy.deepcopy(r0); c5['fix']['sets'] = [[]] + c5['fix']['sets'][1:]          # a set that changes nothing
    c6 = copy.deepcopy(r0); c6['moves'] = c6['moves'][:-1]
    caught = [bool(check_moves(ctl, c1)), bool(check_moves(ctl, c2)), bool(check_fix(ctl, c3)), bool(check_fix(ctl, c4)), bool(check_fix(ctl, c5)), bool(check_moves(ctl, c6))]
    if not all(caught): bad.append(('a control of the check passed', caught))
    print('the check tried on itself, on the record of arrangement %d (%s: %d free movements, %d named sets of %d joints): the movements taken away, the list of movements emptied, the named sets emptied, the named changes taken away, one set replaced by a set that changes nothing, one movement left out: reported in %d of 6' % (ctl, r0['preset'], len(r0['moves']), len(r0['fix']['sets']), r0['fix']['n'], sum(caught)))
bad += fb + mb + lb
sys.exit(1 if bad else 0)
