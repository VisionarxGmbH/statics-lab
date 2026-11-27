"""Independent plane-frame solver for the cold review of "Statics Lab".

Written from scratch for the review; it shares no code and no closed formulas with the page.
  - a member is cut only at point loads; every piece is one Euler-Bernoulli element;
  - distributed loads enter through Gauss quadrature of the Hermite shape functions (no fixed-end tables);
  - a hinged joint gives every member end its own rotation (no static condensation);
  - internal forces inside a piece follow from its start values by statics (polynomials);
  - the deflection inside a piece is the analytic double integral of M/EI from the start displacement and
    start rotation of the piece (no closing on the far end: the far end is used as a check, see closure()).
Sign convention reproduced for comparison (section 4 of the review document):
  x right, y up in the model; member axis from n1 to n2; M > 0 = tension on the right-hand side of that direction
  (below a beam that runs left to right); V = dM/dx; N > 0 tension; reactions Rx to the right, Ry upward, Mz ccw.
Units kN, m.
"""
import math
import numpy as np

GP, GW = np.polynomial.legendre.leggauss(6)


def k_local(EA, EI, h):
    a = EA / h; b = 12 * EI / h**3; c = 6 * EI / h**2; d = 4 * EI / h; e = 2 * EI / h
    return np.array([[a, 0, 0, -a, 0, 0],
                     [0, b, c, 0, -b, c],
                     [0, c, d, 0, -c, e],
                     [-a, 0, 0, a, 0, 0],
                     [0, -b, -c, 0, b, -c],
                     [0, c, e, 0, -c, d]], float)


def consistent_load(h, qx1, qx2, qy1, qy2):
    """equivalent nodal loads of a load that runs linearly from (qx1,qy1) to (qx2,qy2) over an element of length h"""
    f = np.zeros(6)
    for g, w in zip(GP, GW):
        xi = 0.5 * (g + 1); ww = 0.5 * h * w
        qx = qx1 + (qx2 - qx1) * xi; qy = qy1 + (qy2 - qy1) * xi
        N1 = 1 - 3 * xi**2 + 2 * xi**3; N2 = h * (xi - 2 * xi**2 + xi**3)
        N3 = 3 * xi**2 - 2 * xi**3; N4 = h * (-xi**2 + xi**3)
        f += ww * np.array([(1 - xi) * qx, N1 * qy, N2 * qy, xi * qx, N3 * qy, N4 * qy])
    return f


SUP = {'fixed': (1, 1, 1), 'pin': (1, 1, 0), 'roller': (0, 1, 0), 'free': (0, 0, 0)}


class Result:
    pass


def bars(model):
    """Which members are bars (section 3 of the review document): a member is a bar when neither of its ends can carry a
    moment. An end carries none when its joint is hinged, or when the joint has no fixed support and no other member is
    attached to it. A bar keeps its real axial stiffness. A beam, all joints on one line, has no bars."""
    nodes = model['nodes']; members = model['members']
    a = nodes[members[0]['n1']]; b = nodes[members[0]['n2']]; dx = b['x'] - a['x']; dy = b['y'] - a['y']
    if all(abs((n['x'] - a['x']) * dy - (n['y'] - a['y']) * dx) <= 1e-9 * (dx * dx + dy * dy) for n in nodes):
        return [False] * len(members)
    count = [0] * len(nodes)
    for m in members: count[m['n1']] += 1; count[m['n2']] += 1
    def no_moment(ni):
        n = nodes[ni]
        return bool(n.get('hinge')) or ((n.get('sup') or 'free') != 'fixed' and count[ni] == 1)
    return [no_moment(m['n1']) and no_moment(m['n2']) for m in members]


def solve(model, EI, EA, axial='rigid', nsub=1):
    """model: {'nodes': [{x,y,sup,hinge}], 'members': [{n1,n2,kf,udl:{on,w1,w2,ang}}], 'loads': [{m,a,P,ang}]}
    axial='real' : every member keeps EA (the mechanism test).
    axial='rigid': the members that are not bars are rigid along their axis (the assumption of the page). The rigid
    limit is taken from three solutions with their EA 20, 200 and 2000 times the real one: what a factor f leaves
    falls as a/f + b/f^2, and the three solutions remove both terms. (The page uses the factors 10, 100 and 1000.)"""
    if axial == 'real': return _solve1(model, EI, EA, 1.0, 'real', nsub, None)
    bl = bars(model)
    if axial == 'exact': return _solve1(model, EI, EA, 1.0, 'exact', nsub, bl)
    if all(bl): return _solve1(model, EI, EA, 1.0, 'rigid', nsub, bl)
    R = [_solve1(model, EI, EA, f, 'rigid', nsub, bl) for f in (20.0, 200.0, 2000.0)]
    if any(r.ok is False for r in R): return R[0]
    lim = lambda a, b, c: (100 * (10 * c - b) / 9 - (10 * b - a) / 9) / 99
    Z = R[2]
    Z.U = lim(R[0].U, R[1].U, R[2].U)
    Z.reac = [tuple(lim(p, q, r) for p, q, r in zip(*t)) for t in zip(R[0].reac, R[1].reac, R[2].reac)]
    for e0, e1, e2 in zip(R[0].elems, R[1].elems, R[2].elems):
        for k in ('N', 'V', 'M'): e2[k] = tuple(lim(p, q, r) for p, q, r in zip(e0[k], e1[k], e2[k]))
        e2['ul'] = lim(e0['ul'], e1['ul'], e2['ul'])
        if not bl[e2['m']]: e2['EA'] = math.inf            # rigid along its axis: no change of length
    return Z


def _solve1(model, EI, EA, rigid, axial, nsub, barlist):
    nodes = model['nodes']; members = model['members']; loads = model.get('loads') or []
    nN = len(nodes)
    xy = [(n['x'], n['y']) for n in nodes]
    dof = {}
    def D(key):
        if key not in dof: dof[key] = len(dof)
        return dof[key]
    for i in range(nN):
        D(('ux', i)); D(('uy', i))
    elems = []; mem = []
    for mi, m in enumerate(members):
        a, b = nodes[m['n1']], nodes[m['n2']]
        L = math.hypot(b['x'] - a['x'], b['y'] - a['y']); c = (b['x'] - a['x']) / L; s = (b['y'] - a['y']) / L
        bar = True if barlist is None else barlist[mi]
        ea = EA * (m.get('ka') or 1) * (1 if (bar or axial == 'real') else rigid); ei = EI * (m.get('kf') or 1)
        st = {0.0, L}
        for ld in loads:
            if ld['m'] == mi:
                aa = min(max(ld['a'], 0.0), L)
                if 1e-9 < aa < L - 1e-9: st.add(aa)
        # two loads within a billionth of a metre stand at one place: a piece between them would have no length to speak of
        brk = []
        for v in sorted(st):
            if brk and v - brk[-1] < 1e-9: continue
            brk.append(v)
        if brk[-1] != L: brk[-1] = L
        stations = [0.0]
        for p, q in zip(brk[:-1], brk[1:]):
            for k in range(1, nsub + 1): stations.append(p + (q - p) * k / nsub)
        ids = [m['n1']]
        for sx in stations[1:-1]:
            xy.append((a['x'] + c * sx, a['y'] + s * sx)); ids.append(len(xy) - 1)
        ids.append(m['n2'])
        for nid in ids[1:-1]:
            D(('ux', nid)); D(('uy', nid)); D(('rz', nid))
        def rkey(nid):
            if nid < nN and nodes[nid].get('hinge'): return ('rz', nid, mi)
            return ('rz', nid)
        u = m.get('udl') or {}
        w1 = w2 = 0.0; ang = -90
        if u.get('on') and (u.get('w1') or u.get('w2')):
            w1, w2, ang = float(u['w1']), float(u['w2']), u.get('ang', -90)
        r = math.radians(ang); gx, gy = math.cos(r), math.sin(r)
        lx = gx * c + gy * s; ly = -gx * s + gy * c            # unit load direction in member axes
        first = len(elems)
        for k in range(len(ids) - 1):
            x0, x1 = stations[k], stations[k + 1]; h = x1 - x0
            wa = w1 + (w2 - w1) * x0 / L; wb = w1 + (w2 - w1) * x1 / L
            elems.append(dict(m=mi, i=ids[k], j=ids[k + 1], h=h, x0=x0, c=c, s=s, EA=ea, EI=ei,
                              ri=rkey(ids[k]), rj=rkey(ids[k + 1]), q=(wa * lx, wb * lx, wa * ly, wb * ly)))
        mem.append(dict(L=L, c=c, s=s, EA=ea, EI=ei, first=first, n=len(ids) - 1, stations=stations, ids=ids, bar=bar,
                        w=(w1, w2, lx, ly), n1=m['n1'], n2=m['n2']))
    for e in elems:
        D(e['ri']); D(e['rj'])
    nd = len(dof)
    K = np.zeros((nd, nd)); F = np.zeros(nd)
    for e in elems:
        c, s = e['c'], e['s']
        T = np.array([[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
                      [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]], float)
        stiff = axial == 'exact' and not mem[e['m']]['bar']        # rigid along its axis: a condition, not a stiffness
        kl = k_local(0.0 if stiff else e['EA'], e['EI'], e['h']); fl = consistent_load(e['h'], *e['q'])
        idx = [dof[('ux', e['i'])], dof[('uy', e['i'])], dof[e['ri']], dof[('ux', e['j'])], dof[('uy', e['j'])], dof[e['rj']]]
        e['idx'] = idx; e['T'] = T; e['kl'] = kl; e['fl'] = fl; e['stiff'] = stiff
        K[np.ix_(idx, idx)] += T.T @ kl @ T
        F[idx] += T.T @ fl
    for ld in loads:
        m = mem[ld['m']]; aa = min(max(ld['a'], 0.0), m['L'])
        k = min(range(len(m['stations'])), key=lambda q: abs(m['stations'][q] - aa))
        assert abs(m['stations'][k] - aa) < 1e-9
        nid = m['ids'][k]; r = math.radians(ld['ang'])
        F[dof[('ux', nid)]] += ld['P'] * math.cos(r); F[dof[('uy', nid)]] += ld['P'] * math.sin(r)
    fixed = set()
    for i, n in enumerate(nodes):
        sx, sy, sr = SUP[n.get('sup') or 'free']
        if sx: fixed.add(dof[('ux', i)])
        if sy: fixed.add(dof[('uy', i)])
        if sr and ('rz', i) in dof: fixed.add(dof[('rz', i)])
    free = [d for d in range(nd) if d not in fixed]
    Kff = K[np.ix_(free, free)]
    R = Result(); R.model = model; R.mem = mem; R.elems = elems; R.xy = xy; R.ok = None; R.dof = dof
    dg = np.sqrt(np.abs(np.diag(Kff))) if len(free) else np.zeros(0)
    if axial == 'real' and len(free):
        nz = dg > 0                                    # a direction without any stiffness is one free movement
        if nz.any():
            svz = np.linalg.svd(Kff[np.ix_(nz, nz)] / np.outer(dg[nz], dg[nz]), compute_uv=False)
            R.modes = int((~nz).sum() + (svz <= 1e-9 * svz[0]).sum())
        else:
            R.modes = int(len(free))
        # the free movements themselves: the singular vectors of the smallest singular values, taken back to displacements
        vecs = []
        for d in np.where(~nz)[0]:
            v = np.zeros(len(free)); v[d] = 1.0; vecs.append(v)
        if nz.any():
            _, sv_, vt = np.linalg.svd(Kff[np.ix_(nz, nz)] / np.outer(dg[nz], dg[nz]))
            for row in vt[sv_ <= 1e-9 * sv_[0]]:
                v = np.zeros(len(free)); v[nz] = row / dg[nz]; vecs.append(v)
        J = len(nodes); pos = {d: k for k, d in enumerate(free)}
        rows = []
        for v in vecs:
            t = np.zeros(2 * J)
            for i in range(J):
                for c, key in enumerate((('ux', i), ('uy', i))):
                    if dof[key] in pos: t[2 * i + c] = v[pos[dof[key]]]
            rows.append(t)
        A = np.array(rows) if rows else np.zeros((0, 2 * J))
        if len(A):
            u_, s_, w_ = np.linalg.svd(A, full_matrices=False)
            A = w_[s_ > 1e-7 * s_[0]] if s_[0] > 0 else np.zeros((0, 2 * J))
        R.space = A
    if axial != 'exact' and len(free) and (dg == 0).any():
        R.ok = False; return R
    Ks = Kff / np.outer(dg, dg) if axial != 'exact' else None    # diagonally scaled (exact conditions: a direction held by a condition alone has no stiffness of its own)
    if axial == 'real':
        sv = np.linalg.svd(Ks, compute_uv=False) if len(free) else np.array([1.0])
        R.sv = sv; R.ok = bool(sv[-1] > 1e-9 * sv[0])
        if not R.ok: return R
    U = np.zeros(nd)
    lam = {}
    if axial == 'exact' and len(free):
        # The members that are rigid along their axis keep their length exactly: one condition per piece, the elongation
        # (u_j - u_i) along the axis is zero. No stiffness is made large and nothing is extrapolated:
        #   1. the displacements that meet every condition are the null space Z of the conditions C (from its singular
        #      vectors; a condition that says what another says already is no further one);
        #   2. the stiffness is solved in that space: Z'KZ y = Z'F, u = Z y;
        #   3. the axial force N of each rigid piece is the force of its condition: C'N = F - K u. Where the conditions
        #      do not fix the forces alone (a beam held along its axis at both ends), of all N in equilibrium the one
        #      with the least sum of N^2 h / EA is taken: that is what members of a very large but finite axial
        #      stiffness, all stiffened by the same factor, tend to. N = W C v with (C'WC) v = F - K u, W = EA / h.
        st = [e for e in elems if e['stiff']]
        pos = {d: k for k, d in enumerate(free)}; nf = len(free); nc = len(st)
        C = np.zeros((nc, nf)); W = np.zeros(nc)
        for r_, e in enumerate(st):
            c, s = e['c'], e['s']
            for d, v in zip(e['idx'][0:2] + e['idx'][3:5], (-c, -s, c, s)):
                if d in pos: C[r_, pos[d]] += v
            W[r_] = e['EA'] / e['h']
        if nc:
            _, sv_, vt = np.linalg.svd(C, full_matrices=True)
            rk = int((sv_ > 1e-9 * sv_[0]).sum()) if len(sv_) and sv_[0] > 0 else 0
            Z = vt[rk:].T
        else:
            Z = np.eye(nf)
        Kz = Z.T @ Kff @ Z; dz = np.sqrt(np.abs(np.diag(Kz)))
        if Z.shape[1] and (dz == 0).any():
            R.ok = False; return R
        if Z.shape[1]: U[free] = Z @ (np.linalg.solve(Kz / np.outer(dz, dz), (Z.T @ F[free]) / dz) / dz)
        if nc:
            res = F[free] - Kff @ U[free]
            Ka = C.T @ (W[:, None] * C); da = np.sqrt(np.diag(Ka)); nz = da > 0
            v = np.zeros(nf)
            v[nz] = np.linalg.pinv(Ka[np.ix_(nz, nz)] / np.outer(da[nz], da[nz]), rcond=1e-11) @ (res[nz] / da[nz]) / da[nz]
            N = W * (C @ v)
            for r_, e in enumerate(st): lam[id(e)] = float(N[r_])
    elif len(free):
        U[free] = np.linalg.solve(Ks, F[free] / dg) / dg
    if axial == 'exact':
        for e in elems:                                 # a rigid piece between joints that are all held: no condition is left, its own loads go to its ends
            if e['stiff']: lam.setdefault(id(e), 0.0)
    R.U = U
    Rf = K @ U - F
    for e in elems:                                     # the axial forces of the rigid pieces hold their joints too
        if id(e) in lam:
            c, s = e['c'], e['s']; i0, i1, j0, j1 = e['idx'][0], e['idx'][1], e['idx'][3], e['idx'][4]
            Rf[i0] -= lam[id(e)] * c; Rf[i1] -= lam[id(e)] * s; Rf[j0] += lam[id(e)] * c; Rf[j1] += lam[id(e)] * s
    R.reac = []
    for i, n in enumerate(nodes):
        sx, sy, sr = SUP[n.get('sup') or 'free']
        R.reac.append((float(Rf[dof[('ux', i)]]) if sx else 0.0, float(Rf[dof[('uy', i)]]) if sy else 0.0,
                       float(Rf[dof[('rz', i)]]) if (sr and ('rz', i) in dof) else 0.0))
    for e in elems:
        ul = e['T'] @ U[e['idx']]
        f = e['kl'] @ ul - e['fl']
        if id(e) in lam: f[0] -= lam[id(e)]; f[3] += lam[id(e)]; e['EA'] = math.inf
        e['N'] = (-f[0], f[3]); e['V'] = (f[1], -f[4]); e['M'] = (-f[2], f[5]); e['ul'] = ul
    return R


def _elem(R, mi, x, side):
    m = R.mem[mi]; es = R.elems[m['first']:m['first'] + m['n']]
    x = min(max(x, 0.0), m['L'])
    if x <= 1e-12: return es[0], 0.0
    if x >= m['L'] - 1e-12: return es[-1], es[-1]['h']
    for e in es:
        a, b = e['x0'], e['x0'] + e['h']
        if (side > 0 and a - 1e-12 <= x < b - 1e-12) or (side <= 0 and a + 1e-12 < x <= b + 1e-12): return e, x - a
    raise ValueError(x)


def at(R, mi, x, side=-1):
    """N, V, M at station x of member mi (side -1: just before x, +1: just after x); exact"""
    e, t = _elem(R, mi, x, side); qx1, qx2, qy1, qy2 = e['q']; h = e['h']
    N = e['N'][0] - (qx1 * t + (qx2 - qx1) * t * t / (2 * h))
    V = e['V'][0] + (qy1 * t + (qy2 - qy1) * t * t / (2 * h))
    M = e['M'][0] + e['V'][0] * t + qy1 * t * t / 2 + (qy2 - qy1) * t**3 / (6 * h)
    return float(N), float(V), float(M)


def disp(R, mi, x, side=-1):
    """global displacement (dx, dy) and rotation at station x of member mi: analytic integration of M/EI and N/EA
    from the START of the piece (its nodal displacement and its own end rotation)"""
    e, t = _elem(R, mi, x, side); qx1, qx2, qy1, qy2 = e['q']; h = e['h']
    u0, v0, th0 = e['ul'][0], e['ul'][1], e['ul'][2]; M0, V0, N0 = e['M'][0], e['V'][0], e['N'][0]
    v = v0 + th0 * t + (M0 * t**2 / 2 + V0 * t**3 / 6 + qy1 * t**4 / 24 + (qy2 - qy1) * t**5 / (120 * h)) / e['EI']
    th = th0 + (M0 * t + V0 * t**2 / 2 + qy1 * t**3 / 6 + (qy2 - qy1) * t**4 / (24 * h)) / e['EI']
    u = u0 + (N0 * t - qx1 * t**2 / 2 - (qx2 - qx1) * t**3 / (6 * h)) / e['EA']
    c, s = e['c'], e['s']
    return float(u * c - v * s), float(u * s + v * c), float(th)


def closure(R):
    """largest gap between the integrated displacement at the end of a piece and the nodal displacement there"""
    g = 0.0
    for e in R.elems:
        dx, dy, th = disp(R, e['m'], e['x0'] + e['h'], -1)
        u2, v2 = e['ul'][3], e['ul'][4]; c, s = e['c'], e['s']
        g = max(g, abs(dx - (u2 * c - v2 * s)), abs(dy - (u2 * s + v2 * c)), abs(th - e['ul'][5]))
    return g


def member_lines(R, mi, n=400):
    """sampled stations of member mi: x, (N,V,M) left and right of x, displacement dx, dy"""
    m = R.mem[mi]; L = m['L']
    xs = sorted(set([L * k / n for k in range(n + 1)] + list(m['stations'])))
    out = []
    for x in xs:
        vl = at(R, mi, x, -1) if x > 1e-12 else None
        vr = at(R, mi, x, +1) if x < L - 1e-12 else None
        dx, dy, th = disp(R, mi, x, -1)
        out.append(dict(x=x, L=vl, R=vr, dx=dx, dy=dy, rot=th))
    return out


def extremes(R, mi):
    """(peaks, inflections) of member mi: places where V changes sign with M there, places where M changes sign"""
    m = R.mem[mi]; es = R.elems[m['first']:m['first'] + m['n']]
    peaks = []; infl = []
    for k, e in enumerate(es):
        h = e['h']; qx1, qx2, qy1, qy2 = e['q']
        A = (qy2 - qy1) / (2 * h); B = qy1; C = e['V'][0]
        ts = []
        if abs(A) < 1e-14:
            if abs(B) > 1e-14: ts = [-C / B]
        else:
            dsc = B * B - 4 * A * C
            if dsc > 0: ts = [(-B + math.sqrt(dsc)) / (2 * A), (-B - math.sqrt(dsc)) / (2 * A)]
        for t in ts:
            if 1e-9 < t < h - 1e-9:
                # a real change of sign, not a touch
                va = at(R, mi, e['x0'] + max(t - 1e-4, 0), 1)[1]; vb = at(R, mi, e['x0'] + min(t + 1e-4, h), -1)[1]
                if va * vb < 0: peaks.append((e['x0'] + t, at(R, mi, e['x0'] + t)[2]))
        if k + 1 < len(es):
            x_st = e['x0'] + h
            if e['V'][1] * es[k + 1]['V'][0] < 0:                      # jump through zero at a point load
                peaks.append((x_st, e['M'][1]))
            elif not any(abs(p[0] - x_st) < 1e-6 for p in peaks):      # smooth crossing exactly at a station
                va = at(R, mi, x_st - min(1e-4, h / 2), -1)[1]; vb = at(R, mi, x_st + min(1e-4, es[k + 1]['h'] / 2), 1)[1]
                if va * vb < 0 and abs(e['V'][1]) < 1e-6 * max(1.0, abs(va) * 1e4): peaks.append((x_st, e['M'][1]))
        # sign changes of M: scan
        n = 200; prev = e['M'][0]; px = 0.0
        for q in range(1, n + 1):
            t = h * q / n; Mv = at(R, mi, e['x0'] + t, -1)[2]
            if prev * Mv < 0:
                lo, hi = px, t
                for _ in range(60):
                    mid = (lo + hi) / 2; Mm = at(R, mi, e['x0'] + mid, -1)[2]
                    if (Mm > 0) == (prev > 0): lo = mid
                    else: hi = mid
                infl.append(e['x0'] + (lo + hi) / 2)
            if Mv != 0: prev = Mv; px = t
    return peaks, infl


def determinacy(model):
    """n = 3m + r - 3j - c counted independently from the description in section 3"""
    nodes = model['nodes']; members = model['members']
    m = len(members); j = len(nodes)
    r = sum(sum(SUP[n.get('sup') or 'free']) for n in nodes)
    c = 0
    for i, n in enumerate(nodes):
        if n.get('hinge'):
            k = sum((mm['n1'] == i) + (mm['n2'] == i) for mm in members)
            c += k if n.get('sup') == 'fixed' else k - 1
    return 3 * m + r - 3 * j - c, m, r, j, c


def is_mechanism(model, EI, EA):
    """singular stiffness with the real axial stiffness; the loads play no part (and must not cut the members)"""
    bare = dict(nodes=model['nodes'], members=[dict(n1=m['n1'], n2=m['n2'], kf=m.get('kf') or 1, ka=m.get('ka') or 1) for m in model['members']], loads=[])
    R = solve(bare, EI, EA, axial='real')
    return not R.ok


SECTIONS = {'IPE 200': (1943, 28.5), 'IPE 240': (3891, 39.1), 'IPE 300': (8356, 53.8), 'IPE 360': (16260, 72.7),
            'IPE 400': (23120, 84.5), 'HEB 200': (5696, 78.1), 'HEB 300': (25160, 149.1)}
E_STEEL = 210000.0   # N/mm2


def free_modes(model, EI, EA):
    """the number of independent movements of a mechanism (0 for a stable structure)"""
    bare = dict(nodes=model['nodes'], members=[dict(n1=m['n1'], n2=m['n2'], kf=m.get('kf') or 1, ka=m.get('ka') or 1) for m in model['members']], loads=[])
    R = solve(bare, EI, EA, axial='real')
    return getattr(R, 'modes', 0)


def free_space(model, EI, EA):
    """the free movements of a mechanism as movements of the joints: rows of 2 numbers per joint (sideways, upwards),
    an orthonormal set that spans them (empty for a stable structure). From the singular vectors of the stiffness
    matrix with the real axial stiffness; the hinges are not condensed."""
    bare = dict(nodes=model['nodes'], members=[dict(n1=m['n1'], n2=m['n2'], kf=m.get('kf') or 1, ka=m.get('ka') or 1) for m in model['members']], loads=[])
    R = solve(bare, EI, EA, axial='real')
    return getattr(R, 'space', np.zeros((0, 2 * len(model['nodes']))))


def section(name):
    I, A = SECTIONS[name]
    return E_STEEL * 1e3 * I * 1e-8, E_STEEL * 1e3 * A * 1e-4      # EI in kNm2, EA in kN
