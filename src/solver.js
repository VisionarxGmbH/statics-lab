/* 2D frame analysis: direct stiffness method, Euler-Bernoulli members with axial and bending stiffness.
   Units: kN, m. Global axes: x right, y up, rotation counter-clockwise.
   Internal forces use the dashed-fibre convention: the dashed fibre lies on the right-hand side of the
   member direction (n1 -> n2). N > 0 tension; M > 0 tension on the dashed fibre; V = dM/dx. */
const FS = (() => {
  const RXN = { fixed: [0, 1, 2], pin: [0, 1], roller: [1], free: [] };

  function geom(model, m) {
    const a = model.nodes[m.n1], b = model.nodes[m.n2];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    return { L, c: dx / L, s: dy / L, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  function kLocal(EA, EI, L) {
    const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
    return [
      [a, 0, 0, -a, 0, 0],
      [0, b, c, 0, -b, c],
      [0, c, d, 0, -c, e],
      [-a, 0, 0, a, 0, 0],
      [0, -b, -c, 0, b, -c],
      [0, c, e, 0, -c, d]];
  }

  /* member loads in local axes: point loads {a, px, py} and one distributed load over the full length that runs
     in a straight line from (q1x, q1y) at end 1 to (q2x, q2y) at end 2, per metre; tx, ty are its change per metre */
  function memberLoads(model, mi, g) {
    const pts = [];
    for (const ld of model.loads) {
      if (ld.m !== mi) continue;
      /* the four directions of the menus are exact: cos 90° is not the 6e-17 of the machine, which under 85 loads of 1000 kN
         down a column of 30 m would push the frame 4e-12 m sideways */
      const r = ld.ang * Math.PI / 180; let Fx = ld.P * Math.cos(r), Fy = ld.P * Math.sin(r);
      if (Math.abs(Fx) < 1e-12 * Math.abs(ld.P)) Fx = 0;
      if (Math.abs(Fy) < 1e-12 * Math.abs(ld.P)) Fy = 0;
      let a = Math.min(Math.max(ld.a, 0), g.L);
      /* a load closer than a nanometre to an end of its member stands on that joint: every reading of the member takes it
         so (the last digit of a length such as √18 is not a place of its own) */
      if (a < 1e-9) a = 0; else if (a > g.L - 1e-9) a = g.L;
      else { const same = pts.find(p => Math.abs(p.a - a) < 1e-9); if (same) a = same.a; }   /* and two loads closer than that stand at one place */
      pts.push({ a, px: Fx * g.c + Fy * g.s, py: -Fx * g.s + Fy * g.c, Fx, Fy, id: ld.id });
    }
    pts.sort((p, q) => p.a - q.a);
    const u = model.members[mi].udl;
    let q1x = 0, q1y = 0, q2x = 0, q2y = 0;
    if (u && u.on && (u.w1 || u.w2)) {
      const r = u.ang * Math.PI / 180; let dx = Math.cos(r), dy = Math.sin(r);
      if (Math.abs(dx) < 1e-12) dx = 0;
      if (Math.abs(dy) < 1e-12) dy = 0;
      const lx = dx * g.c + dy * g.s, ly = -dx * g.s + dy * g.c;
      q1x = u.w1 * lx; q1y = u.w1 * ly; q2x = u.w2 * lx; q2y = u.w2 * ly;
    }
    return { pts, q1x, q1y, q2x, q2y, tx: (q2x - q1x) / g.L, ty: (q2y - q1y) / g.L };
  }

  /* fixed-end forces acting on the member (local axes) */
  function fixedEnd(L, ll) {
    const f = [0, 0, 0, 0, 0, 0];
    for (const p of ll.pts) {
      const a = p.a, b = L - a;
      f[0] -= p.px * b / L;
      f[3] -= p.px * a / L;
      f[1] -= p.py * b * b * (3 * a + b) / L ** 3;
      f[2] -= p.py * a * b * b / L ** 2;
      f[4] -= p.py * a * a * (a + 3 * b) / L ** 3;
      f[5] += p.py * a * a * b / L ** 2;
    }
    /* uniform part q1 plus a triangle that rises from zero at end 1 to d = q2 - q1 at end 2 */
    const dx = ll.q2x - ll.q1x, dy = ll.q2y - ll.q1y;
    f[0] -= ll.q1x * L / 2 + dx * L / 6; f[3] -= ll.q1x * L / 2 + dx * L / 3;
    f[1] -= ll.q1y * L / 2 + dy * 3 * L / 20; f[4] -= ll.q1y * L / 2 + dy * 7 * L / 20;
    f[2] -= ll.q1y * L * L / 12 + dy * L * L / 30; f[5] += ll.q1y * L * L / 12 + dy * L * L / 20;
    return f;
  }

  /* static condensation of released end rotations (moment hinges) */
  function condense(k, f, rel) {
    const R = [];
    if (rel[0]) R.push(2);
    if (rel[1]) R.push(5);
    if (!R.length) return;
    let inv;
    if (R.length === 1) inv = [[1 / k[R[0]][R[0]]]];
    else {
      const a = k[2][2], b = k[2][5], c = k[5][2], d = k[5][5], det = a * d - b * c;
      inv = [[d / det, -b / det], [-c / det, a / det]];
    }
    const kc = k.map(r => r.slice()), fc = f.slice();
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        let s = 0;
        for (let p = 0; p < R.length; p++) for (let q = 0; q < R.length; q++) s += k[i][R[p]] * inv[p][q] * k[R[q]][j];
        kc[i][j] -= s;
      }
      let s = 0;
      for (let p = 0; p < R.length; p++) for (let q = 0; q < R.length; q++) s += k[i][R[p]] * inv[p][q] * f[R[q]];
      fc[i] -= s;
    }
    for (const r of R) { for (let j = 0; j < 6; j++) { kc[r][j] = 0; kc[j][r] = 0; } fc[r] = 0; }
    /* released at both ends, the member is a bar: across its axis it has no stiffness at all. The subtraction
       above leaves a rounding amount there, which would hold up a joint that nothing holds */
    if (R.length === 2) for (const r of [1, 4]) for (let j = 0; j < 6; j++) { kc[r][j] = 0; kc[j][r] = 0; }
    for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) k[i][j] = kc[i][j]; f[i] = fc[i]; }
  }

  /* Gaussian elimination on the diagonally scaled matrix; a vanishing pivot means a mechanism */
  /* The number of independent movements the stiffness does not hold: the size of the matrix less its rank.
     Elimination on the scaled matrix with the largest remaining diagonal entry as pivot (the matrix is symmetric
     and has no negative direction, so its largest entry lies on the diagonal); it ends when no entry above the
     tolerance is left. A direction with no stiffness of its own is one movement. */
  function nullity(A, n, floor, tol) {
    let dm = 0, free = 0;
    for (let i = 0; i < n; i++) dm = Math.max(dm, A[i * n + i]);
    if (!(dm > 0)) return n;
    const keep = [], sc = [];
    for (let i = 0; i < n; i++) { const d = A[i * n + i]; if (d > floor * dm) { keep.push(i); sc.push(1 / Math.sqrt(d)); } else free++; }
    const m = keep.length, B = new Float64Array(m * m);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) B[i * m + j] = A[keep[i] * n + keep[j]] * sc[i] * sc[j];
    let rank = 0;
    for (let k = 0; k < m; k++) {
      let p = k, mx = B[k * m + k];
      for (let i = k + 1; i < m; i++) if (B[i * m + i] > mx) { mx = B[i * m + i]; p = i; }
      if (!(mx > tol)) break;
      if (p !== k) {
        for (let j = 0; j < m; j++) { const t = B[k * m + j]; B[k * m + j] = B[p * m + j]; B[p * m + j] = t; }
        for (let i = 0; i < m; i++) { const t = B[i * m + k]; B[i * m + k] = B[i * m + p]; B[i * m + p] = t; }
      }
      for (let i = k + 1; i < m; i++) { const f = B[i * m + k] / mx; if (f) for (let j = k + 1; j < m; j++) B[i * m + j] -= f * B[k * m + j]; }
      rank++;
    }
    return free + m - rank;
  }

  /* The movements the stiffness does not hold, as vectors: the null space of the matrix. A direction with no stiffness of
     its own is one movement by itself. The rest is found on the scaled matrix by Jacobi rotations (the matrix is small and
     symmetric): the directions whose stiffness is below 10⁻⁹ of the largest one. Returns null when their number is not the
     one that `nullity` counts by elimination: then nothing is said about them. */
  function nullSpace(A, n, floor, tol) {
    let dm = 0;
    for (let i = 0; i < n; i++) dm = Math.max(dm, A[i * n + i]);
    const out = [], keep = [], sc = [];
    for (let i = 0; i < n; i++) { const d = A[i * n + i]; if (dm > 0 && d > floor * dm) { keep.push(i); sc.push(1 / Math.sqrt(d)); } else { const v = new Float64Array(n); v[i] = 1; out.push(v); } }
    const m = keep.length;
    if (m) {
      const B = new Float64Array(m * m), W = new Float64Array(m * m);
      for (let i = 0; i < m; i++) { W[i * m + i] = 1; for (let j = 0; j < m; j++) B[i * m + j] = A[keep[i] * n + keep[j]] * sc[i] * sc[j]; }
      for (let sweep = 0; sweep < 60; sweep++) {
        let off = 0;
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) off += B[i * m + j] * B[i * m + j];
        if (off < 1e-30) break;
        for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
          const apq = B[p * m + q];
          if (Math.abs(apq) < 1e-300) continue;
          const th = (B[q * m + q] - B[p * m + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
          for (let k = 0; k < m; k++) { const bkp = B[k * m + p], bkq = B[k * m + q]; B[k * m + p] = c * bkp - sn * bkq; B[k * m + q] = sn * bkp + c * bkq; }
          for (let k = 0; k < m; k++) { const bpk = B[p * m + k], bqk = B[q * m + k]; B[p * m + k] = c * bpk - sn * bqk; B[q * m + k] = sn * bpk + c * bqk; }
          for (let k = 0; k < m; k++) { const wkp = W[k * m + p], wkq = W[k * m + q]; W[k * m + p] = c * wkp - sn * wkq; W[k * m + q] = sn * wkp + c * wkq; }
        }
      }
      let big = 0;
      for (let i = 0; i < m; i++) big = Math.max(big, B[i * m + i]);
      for (let j = 0; j < m; j++) if (B[j * m + j] <= 1e-9 * big) { const v = new Float64Array(n); for (let i = 0; i < m; i++) v[keep[i]] = W[i * m + j] * sc[i]; out.push(v); }
    }
    return out.length === nullity(A, n, floor, tol) ? out : null;
  }

  function gauss(A, b, n, tol, floor) {
    const sc = new Float64Array(n), A0 = A.slice(), b0 = b.slice();
    let dm = 0;
    for (let i = 0; i < n; i++) dm = Math.max(dm, A[i * n + i]);
    /* floor: a direction whose stiffness is a rounding amount beside the largest one is not held (mechanism test) */
    for (let i = 0; i < n; i++) { const d = A[i * n + i]; if (!(d > (floor || 0) * dm)) return null; sc[i] = 1 / Math.sqrt(d); }
    for (let i = 0; i < n; i++) { b[i] *= sc[i]; for (let j = 0; j < n; j++) A[i * n + j] *= sc[i] * sc[j]; }
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
      if (mx < tol) return null;
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = b[k]; b[k] = b[p]; b[p] = t;
      }
      const piv = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / piv;
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
        b[i] -= f * b[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
      x[i] = s / A[i * n + i];
    }
    for (let i = 0; i < n; i++) x[i] *= sc[i];
    /* the solution must satisfy the original equations; if it does not, the system was singular after all */
    let res = 0, ref = 0;
    for (let i = 0; i < n; i++) {
      let r = -b0[i], q = Math.abs(b0[i]);
      for (let j = 0; j < n; j++) { const t = A0[i * n + j] * x[j]; r += t; q += Math.abs(t); }
      if (!isFinite(r)) return null;
      res = Math.max(res, Math.abs(r)); ref = Math.max(ref, q);
    }
    if (res > 1e-7 * ref) return null;
    return x;
  }

  /* Eigenvalues and eigenvectors of a small symmetric matrix by Jacobi rotations: { d, V } with B v_k = d_k v_k, the
     vector v_k in column k of V (row-major, m x m). */
  function symEig(B, m) {
    const V = new Float64Array(m * m);
    for (let i = 0; i < m; i++) V[i * m + i] = 1;
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0, on = 0;
      for (let i = 0; i < m; i++) { on += B[i * m + i] * B[i * m + i]; for (let j = i + 1; j < m; j++) off += B[i * m + j] * B[i * m + j]; }
      if (off <= 1e-32 * on || off < 1e-300) break;
      for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
        const apq = B[p * m + q];
        if (Math.abs(apq) < 1e-300) continue;
        const th = (B[q * m + q] - B[p * m + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        for (let k = 0; k < m; k++) { const bkp = B[k * m + p], bkq = B[k * m + q]; B[k * m + p] = c * bkp - sn * bkq; B[k * m + q] = sn * bkp + c * bkq; }
        for (let k = 0; k < m; k++) { const bpk = B[p * m + k], bqk = B[q * m + k]; B[p * m + k] = c * bpk - sn * bqk; B[q * m + k] = sn * bpk + c * bqk; }
        for (let k = 0; k < m; k++) { const vkp = V[k * m + p], vkq = V[k * m + q]; V[k * m + p] = c * vkp - sn * vkq; V[k * m + q] = sn * vkp + c * vkq; }
      }
    }
    const d = new Float64Array(m);
    for (let i = 0; i < m; i++) d[i] = B[i * m + i];
    return { d, V };
  }

  /* Members that are rigid along their axis, solved exactly: such a member keeps its length, one condition
     (u2 - u1) · e = 0 with e its direction. Nothing is made stiff and nothing is extrapolated.
       1. The conditions C (one row per rigid member, over the free displacements) are brought to their reduced form
          by elimination with the largest entry as pivot. A row that only repeats what the others say drops out (its
          entries fall below 1e-9; the entries of C are direction cosines). The displacements that meet every
          condition are x = Z y: the displacements without a pivot are free, those with one follow from them.
       2. The stiffness without the axial stiffness of the rigid members is solved in that space: Z'AZ y = Z'b.
       3. The axial force N of each rigid member is the force of its condition: C'N = b - A x. Where the conditions do
          not fix the forces alone (a beam held along its axis at both ends), of all N in equilibrium the one with
          the least sum of N² L / EA is taken: what members of a very large but finite axial stiffness, all stiffened
          by the same factor, tend to. It is N = W C v with (C'WC) v = b - A x and W = EA / L; C'WC has directions
          without stiffness (it is the axial stiffness of the rigid members alone), so v is taken from its
          eigenvectors, without those below 1e-9 of the largest eigenvalue of the scaled matrix.
     Returns the displacements x, the axial forces N by member, and what the arithmetic left: the largest force and
     moment out of balance in the equations, and the largest change of length of a rigid member. Null when the reduced
     stiffness cannot be solved. */
  function rigidSolve(A, b, nf, free, mem, rg) {
    const pos = new Map(free.map((d, i) => [d, i])), rows = [];
    mem.forEach((M, mi) => {
      if (!rg[mi]) return;
      const r = new Float64Array(nf);
      for (const [d, v] of [[M.dofs[0], -M.c], [M.dofs[1], -M.s], [M.dofs[3], M.c], [M.dofs[4], M.s]]) if (pos.has(d)) r[pos.get(d)] += v;
      rows.push({ mi, r, W: M.W });
    });
    const nc = rows.length, C = new Float64Array(nc * nf), isP = new Uint8Array(nf), pc = [];
    rows.forEach((q, i) => C.set(q.r, i * nf));
    let rank = 0;
    for (; rank < nc; rank++) {
      let best = 1e-9, pr = -1, pj = -1;
      for (let i = rank; i < nc; i++) for (let j = 0; j < nf; j++) { const v = Math.abs(C[i * nf + j]); if (!isP[j] && v > best) { best = v; pr = i; pj = j; } }
      if (pr < 0) break;
      if (pr !== rank) for (let j = 0; j < nf; j++) { const t = C[rank * nf + j]; C[rank * nf + j] = C[pr * nf + j]; C[pr * nf + j] = t; }
      const pv = C[rank * nf + pj];
      for (let j = 0; j < nf; j++) C[rank * nf + j] /= pv;
      for (let i = 0; i < nc; i++) { if (i === rank) continue; const f = C[i * nf + pj]; if (f) for (let j = 0; j < nf; j++) C[i * nf + j] -= f * C[rank * nf + j]; }
      isP[pj] = 1; pc.push(pj);
    }
    const fc = [];
    for (let j = 0; j < nf; j++) if (!isP[j]) fc.push(j);
    const nz = fc.length, Z = new Float64Array(nf * nz);
    fc.forEach((j, a) => { Z[j * nz + a] = 1; for (let i = 0; i < rank; i++) Z[pc[i] * nz + a] = -C[i * nf + j]; });
    const AZ = new Float64Array(nf * nz), Kz = new Float64Array(nz * nz), bz = new Float64Array(nz);
    for (let i = 0; i < nf; i++) for (let a = 0; a < nz; a++) { let t = 0; for (let j = 0; j < nf; j++) t += A[i * nf + j] * Z[j * nz + a]; AZ[i * nz + a] = t; }
    for (let a = 0; a < nz; a++) {
      for (let c = a; c < nz; c++) { let t = 0; for (let i = 0; i < nf; i++) t += Z[i * nz + a] * AZ[i * nz + c]; Kz[a * nz + c] = Kz[c * nz + a] = t; }
      let t = 0; for (let i = 0; i < nf; i++) t += Z[i * nz + a] * b[i]; bz[a] = t;
    }
    const y = nz ? gauss(Kz, bz, nz, 1e-13) : new Float64Array(0);
    if (!y) return null;
    const x = new Float64Array(nf), res = new Float64Array(nf);
    for (let i = 0; i < nf; i++) { let t = 0; for (let a = 0; a < nz; a++) t += Z[i * nz + a] * y[a]; x[i] = t; }
    for (let i = 0; i < nf; i++) { let t = b[i]; for (let j = 0; j < nf; j++) t -= A[i * nf + j] * x[j]; res[i] = t; }
    /* the axial forces of the conditions */
    const dg = new Float64Array(nf), id = [];
    for (const q of rows) for (let i = 0; i < nf; i++) dg[i] += q.W * q.r[i] * q.r[i];
    for (let i = 0; i < nf; i++) if (dg[i] > 0) id.push(i);
    const m = id.length, B = new Float64Array(m * m), v = new Float64Array(nf);
    for (const q of rows) for (let i = 0; i < m; i++) { const ri = q.r[id[i]]; if (ri) for (let j = 0; j < m; j++) B[i * m + j] += q.W * ri * q.r[id[j]] / Math.sqrt(dg[id[i]] * dg[id[j]]); }
    if (m) {
      const { d, V } = symEig(B, m);
      let big = 0;
      for (let k = 0; k < m; k++) big = Math.max(big, d[k]);
      for (let k = 0; k < m; k++) {
        if (!(d[k] > 1e-9 * big)) continue;
        let t = 0;
        for (let i = 0; i < m; i++) t += V[i * m + k] * res[id[i]] / Math.sqrt(dg[id[i]]);
        for (let i = 0; i < m; i++) v[id[i]] += V[i * m + k] * t / d[k] / Math.sqrt(dg[id[i]]);
      }
    }
    const N = new Map(), err = { F: 0, M: 0, u: 0 };
    for (const q of rows) { let e = 0, cv = 0; for (let i = 0; i < nf; i++) { e += q.r[i] * x[i]; cv += q.r[i] * v[i]; } N.set(q.mi, q.W * cv); err.u = Math.max(err.u, Math.abs(e)); }
    for (let i = 0; i < nf; i++) {
      let t = res[i];
      for (const q of rows) if (q.r[i]) t -= q.r[i] * N.get(q.mi);
      const k = free[i] % 3 === 2 ? 'M' : 'F'; err[k] = Math.max(err[k], Math.abs(t));
    }
    return { x, N, err };
  }

  function endReleases(model, m) {
    return [!!((m.rel && m.rel[0]) || model.nodes[m.n1].hinge), !!((m.rel && m.rel[1]) || model.nodes[m.n2].hinge)];
  }

  /* degree of static indeterminacy n = 3m + r - 3j - c (c = conditions from moment releases) */
  function determinacy(model) {
    const J = model.nodes.length, conn = Array(J).fill(0), relc = Array(J).fill(0);
    model.members.forEach(m => {
      const rel = endReleases(model, m);
      conn[m.n1]++; conn[m.n2]++;
      if (rel[0]) relc[m.n1]++;
      if (rel[1]) relc[m.n2]++;
    });
    let r = 0, c = 0;
    model.nodes.forEach((n, i) => {
      r += RXN[n.sup || 'free'].length;
      if (conn[i]) c += relc[i] - (relc[i] === conn[i] && n.sup !== 'fixed' ? 1 : 0);
    });
    const m = model.members.length;
    return { n: 3 * m + r - 3 * J - c, m, r, j: J, c };
  }

  /* internal forces at local x; side -1 = just left of x, +1 = just right of x */
  function forcesAt(M, x, side) {
    const f = M.f, ll = M.ll;
    let N = -f[0], V = f[1], Mo = -f[2] + f[1] * x;
    for (const p of ll.pts) {
      if (p.a < x || (side > 0 && p.a <= x)) { N -= p.px; V += p.py; Mo += p.py * (x - p.a); }
    }
    N -= ll.q1x * x + ll.tx * x * x / 2;
    V += ll.q1y * x + ll.ty * x * x / 2;
    Mo += ll.q1y * x * x / 2 + ll.ty * x * x * x / 6;
    return { N, V, M: Mo };
  }
  /* distributed load at local x, per metre, along and across the member */
  const qAt = (M, x) => ({ qx: M.ll.q1x + M.ll.tx * x, qy: M.ll.q1y + M.ll.ty * x });
  const hasQ = M => Math.abs(M.ll.q1y) > 1e-12 || Math.abs(M.ll.q2y) > 1e-12;
  /* Places inside a piece (a, b) without point loads where the shear changes sign; the shear is at most a parabola
     there, so its zeros are known. A zero counts when the shear has opposite signs on its two sides: it is read half
     way to the next zero or to the end of the piece on either side, and it must be a shear there, not a rounding
     amount. A rounding amount is what the analysis cannot tell from zero: the last digits of the arithmetic (10⁻¹² of
     the shear of the piece) and the uncertainty of the end forces of the member (M.nilF, set with the lines of the
     structure: the same amount below which the page calls a force zero), as long as the value prints 0.0.
     Nothing else decides: not the distance from a load or a support. A shear of 0.0002 kN behind a point load of
     950 kN is a shear, and the moment line turns where it reaches zero, a third of a micrometre behind the load, not
     at the load. A shear that only touches zero, as at the free end of a cantilever under a triangle, has the same
     sign on both sides and is no such place; an end shear of 10⁻¹⁰ kN that should be zero is none either. */
  function vZeros(M, a, b) {
    const Va = forcesAt(M, a, 1).V, qa = M.ll.q1y + M.ll.ty * a, A2 = M.ll.ty / 2, h = b - a, out = [];
    const sc = Math.max(Math.abs(qa), Math.abs(A2) * h);
    if (!(h > 0) || sc < 1e-12) return out;
    let r = [];
    if (Math.abs(A2) * h < 1e-9 * sc) r = [-Va / qa];
    else {
      const disc = qa * qa - 4 * A2 * Va;
      if (disc >= 0) { const s = Math.sqrt(disc), t = -(qa + (qa < 0 ? -s : s)) / 2; r = [t / A2]; if (t !== 0) r.push(Va / t); }
    }
    r = r.filter(x => x > 0 && x < h).sort((p, q) => p - q);
    const floor = Math.max(1e-12 * Math.max(Math.abs(Va), sc * h), M.nilF || 0), V = x => forcesAt(M, a + x, -1).V;
    const none = v => Math.abs(v) <= floor && Math.abs(v) < 0.05;   /* below 0.05 a value prints 0.0 */
    r.forEach((x, i) => {
      const vl = V((x + (i ? r[i - 1] : 0)) / 2), vr = V((x + (i + 1 < r.length ? r[i + 1] : h)) / 2);
      if (!(vl * vr < 0) || none(vl) || none(vr)) return;
      if (!(out.length && a + x - out[out.length - 1] < 1e-9)) out.push(a + x);
    });
    return out;
  }

  /* the place between a and b where N, V or M (key) changes sign, by halving; null where its two ends have one sign */
  function rootOf(M, key, a, b) {
    const fa = forcesAt(M, a, 1)[key], fb = forcesAt(M, b, -1)[key];
    if (!(fa * fb < 0)) return null;
    let lo = a, hi = b;
    for (let k = 0; k < 60; k++) { const xm = (lo + hi) / 2; if (forcesAt(M, xm, -1)[key] * fa > 0) lo = xm; else hi = xm; }
    return (lo + hi) / 2;
  }
  /* The places inside a member that shape its lines, beside the regular steps. Between two point loads the distributed
     load acts one way, so N and V run one way and are largest at the two ends of the piece. M is largest or smallest
     where V = 0; between two such places it runs one way and has one zero at most. Where M = 0 the curvature changes
     side: between two zeros of M the slope of the deflection runs one way. Where N = 0 the strain of a bar changes sign.
     With these places as stations the samples hold the largest N, V and M of the member themselves, a line is drawn
     through its peaks, and a search between two neighbouring stations passes over no turn of the slope. A short piece
     between two loads also gets three steps of its own. */
  function shapePlaces(M) {
    const L = M.L, br = [0], out = [];
    for (const a of M.ll.pts.map(p => p.a).sort((p, q) => p - q)) if (a > 1e-9 && a < L - 1e-9 && a - br[br.length - 1] > 1e-9) br.push(a);
    br.push(L);
    for (let i = 0; i < br.length - 1; i++) {
      const a = br[i], b = br[i + 1], vz = vZeros(M, a, b), cut = [a, ...vz, b];
      for (let k = 1; k < 4; k++) out.push(a + (b - a) * k / 4);
      out.push(...vz);
      for (let j = 0; j < cut.length - 1; j++) { const r = rootOf(M, 'M', cut[j], cut[j + 1]); if (r !== null) out.push(r); }
      const rn = rootOf(M, 'N', a, b); if (rn !== null) out.push(rn);
    }
    return out;
  }
  function sample(M, nSeg) {
    const L = M.L, eps = 1e-9 * L;
    /* The point loads inside the member: each place once, as the loads hold it. A load point is a station with two
       sides, the values just before and just after the load, and it keeps its own place: the step of a line stands
       where the load stands. */
    const brk = [];
    for (const a of M.ll.pts.map(p => p.a).sort((p, q) => p - q)) if (a > 1e-9 && a < L - 1e-9 && (!brk.length || a - brk[brk.length - 1] > eps)) brk.push(a);
    /* Every other station: the even steps and the places that shape the lines. A zero of N, V or M can lie on a
       point load, a hair before or behind it in the arithmetic (V = 0 behind a load that takes all the shear). Such
       a place is the load point and is not kept beside it: kept, it would stand between the two sides of the load
       or take their place, and the step of the line would be drawn as a slope to the next station. */
    const plain = [];
    /* the last station is the end of the member itself: L · n / n can come out a last digit above L (a diagonal of √45 m),
       and a station behind the end would take the loads on the end joint for loads of the member */
    for (let i = 0; i <= nSeg; i++) plain.push(i === nSeg ? L : L * i / nSeg);
    for (const x of shapePlaces(M)) if (x > eps && x < L - eps) plain.push(x);
    plain.sort((p, q) => p - q);
    const pts = [], load = a => pts.push({ x: a, side: -1 }, { x: a, side: 1 });
    let bi = 0;
    for (const x of plain) {
      while (bi < brk.length && brk[bi] < x - eps) load(brk[bi++]);
      if (bi < brk.length && Math.abs(brk[bi] - x) <= eps) continue;                 /* on the load point ahead */
      if (pts.length && x - pts[pts.length - 1].x <= eps) continue;                   /* on the station before, a load point or not */
      pts.push({ x, side: pts.length ? -1 : 1 });
    }
    while (bi < brk.length) load(brk[bi++]);
    const n = pts.length;
    const xs = new Float64Array(n), side = new Int8Array(n), Na = new Float64Array(n), Va = new Float64Array(n), Ma = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const r = forcesAt(M, pts[i].x, pts[i].side);
      xs[i] = pts[i].x; side[i] = pts[i].side; Na[i] = r.N; Va[i] = r.V; Ma[i] = r.M;
    }
    /* deflection: integrate the curvature M/EI twice (Simpson over short steps: exact for the parabolic M of a
       uniform load, and to nine digits for the cubic M of a triangular load), then close on the end displacements */
    const th = new Float64Array(n), vr = new Float64Array(n), ur = new Float64Array(n);
    let t = 0, v = 0, u = 0;
    for (let i = 1; i < n; i++) {
      const h = xs[i] - xs[i - 1];
      if (h > 0) {
        const fm = forcesAt(M, xs[i - 1] + h / 2, -1), k0 = Ma[i - 1] / M.EI, k1 = Ma[i] / M.EI, km = fm.M / M.EI;
        v += h * t + h * h * (k0 + 2 * km) / 6;
        t += h * (k0 + 4 * km + k1) / 6;
        u += h * (Na[i - 1] + 4 * fm.N + Na[i]) / 6 / M.EA;
      }
      th[i] = t; vr[i] = v; ur[i] = u;
    }
    const [u1, v1, , u2, v2] = M.ul;
    const t0 = (v2 - v1 - v) / L, du = (u2 - u1 - u) / L;
    const dX = new Float64Array(n), dY = new Float64Array(n), rot = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const vv = v1 + t0 * xs[i] + vr[i], uu = u1 + ur[i] + du * xs[i];
      dX[i] = uu * M.c - vv * M.s;
      dY[i] = uu * M.s + vv * M.c;
      rot[i] = t0 + th[i];
    }
    /* displacement and slope at any place: one more step of the same rule, from the sample before that place. No
       reading between samples: a value asked for at any x is integrated like the samples themselves */
    const fine = x => {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      if (xs[hi] <= x) lo = hi;
      const h = x - xs[lo];
      let t = th[lo], v = vr[lo], u = ur[lo];
      if (h > 0) {
        const fm = forcesAt(M, xs[lo] + h / 2, -1), fx = forcesAt(M, x, -1), k0 = Ma[lo] / M.EI, km = fm.M / M.EI, kx = fx.M / M.EI;
        v += h * t + h * h * (k0 + 2 * km) / 6;
        t += h * (k0 + 4 * km + kx) / 6;
        u += h * (Na[lo] + 4 * fm.N + fx.N) / 6 / M.EA;
      }
      const vv = v1 + t0 * x + v, uu = u1 + u + du * x;
      return { dX: uu * M.c - vv * M.s, dY: uu * M.s + vv * M.c, rot: t0 + t };
    };
    return { xs, side, N: Na, V: Va, M: Ma, dX, dY, rot, t0, du, fine };
  }

  function solve(model, opts = {}) {
    const nSeg = opts.nSeg || 160, rg = opts.rigid || null;   /* rg: the members that are rigid along their axis (rigidSolve) */
    const J = model.nodes.length, nd = 3 * J;
    const K = new Float64Array(nd * nd), F = new Float64Array(nd);
    const conn = Array(J).fill(0), relc = Array(J).fill(0);
    const det = determinacy(model);

    const mem = model.members.map((m, mi) => {
      const g = geom(model, m);
      const rel = endReleases(model, m);
      conn[m.n1]++; conn[m.n2]++;
      if (rel[0]) relc[m.n1]++;
      if (rel[1]) relc[m.n2]++;
      const k = kLocal(rg && rg[mi] ? 0 : m.EA, m.EI, g.L);   /* a rigid member has no axial stiffness of its own: its length is a condition */
      const ll = memberLoads(model, mi, g);
      const f0 = fixedEnd(g.L, ll);
      condense(k, f0, rel);
      const { c, s } = g;
      const T = [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]];
      const dofs = [3 * m.n1, 3 * m.n1 + 1, 3 * m.n1 + 2, 3 * m.n2, 3 * m.n2 + 1, 3 * m.n2 + 2];
      const kT = k.map(row => T[0].map((_, j) => row.reduce((acc, kv, q) => acc + kv * T[q][j], 0)));
      for (let i = 0; i < 6; i++) {
        let fg = 0;
        for (let p = 0; p < 6; p++) fg += T[p][i] * f0[p];
        F[dofs[i]] -= fg;
        for (let j = 0; j < 6; j++) {
          let kg = 0;
          for (let p = 0; p < 6; p++) kg += T[p][i] * kT[p][j];
          K[dofs[i] * nd + dofs[j]] += kg;
        }
      }
      return { ...g, i: mi, n1: m.n1, n2: m.n2, rel, k, f0, ll, T, dofs, EA: rg && rg[mi] ? Infinity : m.EA, EI: m.EI, W: m.EA / g.L };
    });

    const restrained = new Uint8Array(nd), dummy = new Uint8Array(nd);
    model.nodes.forEach((n, i) => {
      for (const d of RXN[n.sup || 'free']) restrained[3 * i + d] = 1;
      if (!conn[i]) { for (let d = 0; d < 3; d++) { restrained[3 * i + d] = 1; dummy[3 * i + d] = 1; } }
      else if (relc[i] === conn[i] && n.sup !== 'fixed') { restrained[3 * i + 2] = 1; dummy[3 * i + 2] = 1; }
    });
    const hold = opts.hold || [];
    for (const d of hold) restrained[d] = 1;
    const free = [];
    for (let i = 0; i < nd; i++) if (!restrained[i]) free.push(i);
    const nf = free.length, A = new Float64Array(nf * nf), b = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      b[i] = F[free[i]];
      for (let j = 0; j < nf; j++) A[i * nf + j] = K[free[i] * nd + free[j]];
    }
    if (opts.modes) return { modes: nullity(A, nf, opts.floor || 0, opts.pivot || 1e-10) };
    if (opts.space) return { space: nullSpace(A, nf, opts.floor || 0, opts.pivot || 1e-10), free };
    const exact = rg && rg.some(Boolean) ? rigidSolve(A, b, nf, free, mem, rg) : null;
    if (rg && rg.some(Boolean) && !exact) return { ok: false, unstable: true, det, noLimit: true };
    const x = exact ? exact.x : nf ? gauss(A, b, nf, opts.pivot || 1e-13, opts.floor) : new Float64Array(0);
    if (!x || det.n + hold.length < 0) return { ok: false, unstable: true, det };
    if (opts.checkOnly) return { ok: true, det };
    const u = new Float64Array(nd);
    free.forEach((d, i) => { u[d] = x[i]; });
    /* the axial force of each rigid member, as it pulls at its two joints */
    const pull = new Float64Array(nd);
    if (exact) for (const [mi, Nv] of exact.N) { const M = mem[mi]; pull[M.dofs[0]] -= M.c * Nv; pull[M.dofs[1]] -= M.s * Nv; pull[M.dofs[3]] += M.c * Nv; pull[M.dofs[4]] += M.s * Nv; }

    const reactions = model.nodes.map((n, i) => {
      const r = [0, 0, 0], has = [false, false, false];
      for (let d = 0; d < 3; d++) {
        const gd = 3 * i + d;
        if (!restrained[gd] || dummy[gd]) continue;
        let s = -F[gd] + pull[gd];
        for (let j = 0; j < nd; j++) s += K[gd * nd + j] * u[j];
        r[d] = s; has[d] = true;
      }
      return { Rx: r[0], Ry: r[1], Mz: r[2], has };
    });

    for (const M of mem) {
      const ug = M.dofs.map(d => u[d]);
      M.ul = M.T.map(row => row.reduce((acc, t, j) => acc + t * ug[j], 0));
      M.f = M.f0.slice();
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) M.f[i] += M.k[i][j] * M.ul[j];
      if (exact && exact.N.has(M.i)) { const Nv = exact.N.get(M.i); M.f[0] -= Nv; M.f[3] += Nv; }
    }
    /* What the solution left (err), measured for every structure: the largest force and the largest moment that the end
       forces of the members, as they are returned, leave out of balance at a joint in a direction that no support
       holds; with rigid members also what the equations with their conditions left (rigidSolve), and the largest
       change of length of a rigid member. */
    const out = new Float64Array(nd), jr = { F: 0, M: 0 };
    for (const M of mem) for (let i = 0; i < 6; i++) { let fg = 0; for (let p = 0; p < 6; p++) fg += M.T[p][i] * M.f[p]; out[M.dofs[i]] += fg; }
    for (let d = 0; d < nd; d++) if (!restrained[d]) { const k = d % 3 === 2 ? 'M' : 'F'; jr[k] = Math.max(jr[k], Math.abs(out[d])); }
    const R = { ok: true, u, reactions, mem, det };
    R.err = exact ? { F: Math.max(exact.err.F, jr.F), M: Math.max(exact.err.M, jr.M), u: exact.err.u } : { F: jr.F, M: jr.M, u: 0 };
    if (exact) R.limit = 'exact';
    return lines(R, nSeg);
  }

  /* the lines of every member from its end forces and end displacements, and the largest values of the structure.
     The forces have their largest values at stations (the ends, the load points and the zeros of the shear force are
     stations). A displacement can be largest between two stations: the largest displacement of the structure is the
     largest that its members reach anywhere along them (mostMoved), not the largest at a station. The coarse lines of
     the steps towards the rigid limit (nSeg below 160) are not searched: only their end values are used. */
  function lines(R, nSeg = 160) {
    /* turn: the largest rotation of a member anywhere along it (turnOf), in radians, turnM: that member;
       strain: the largest strain along the axis of a member, |N| / EA, anywhere in it (strainOf), strainM: that member,
       strainAt: the stretch of the member that has it [from, to], strainSign: +1 stretched, -1 shortened */
    const max = { N: 0, V: 0, M: 0, D: 0, turn: 0, turnM: -1, strain: 0, strainM: -1, strainAt: null, strainSign: 0 };
    /* The largest force of the structure: a reaction, or N or V of a member. Between two point loads the distributed load
       acts one way, so N and V are largest at an end of the member or beside a point load. From it: the force that the
       analysis cannot tell from zero, nilF = 1e-9 kN + a hundred times the uncertainty it states for a force + 1e-10 of
       that largest force (the last digits of the elimination). The page calls N and V zero below it, and a zero of the
       shear is looked for with it (vZeros).
       The same for a moment, with the largest force times the longest member as its scale.
       For a displacement, nilD = 1e-12 m + a hundred times the stated change of length of a rigid member + what the
       last digit of a load direction can bend: a load along a member that is not along an axis of the sheet has a
       part across the member of 1e-16 of its size by the arithmetic of its direction alone; nilD takes a thousand
       times that, 1e-13 of the largest force, on the longest member as a cantilever of the smallest bending
       stiffness, F L^3 / (3 EI); and 1e-10 of the largest displacement, for the last digits of the integration along
       the members. Up to review 09 the term of the load was 1e-10 of that deflection, and 95 loads of 1000 kN along a
       beam of 30 m hid a deflection of 0.02 mm (finding C102): with 1e-13 the amount is 2e-5 mm there. */
    let fm = 0;
    for (const r of R.reactions) fm = Math.max(fm, Math.abs(r.Rx), Math.abs(r.Ry));
    for (const M of R.mem) {   /* the member runs from just behind its start to just before its end: a load on an end joint is not inside it */
      const at = [[0, 1], [M.L, -1]];
      for (const q of M.ll.pts) if (q.a > 1e-9 && q.a < M.L - 1e-9) at.push([q.a, -1], [q.a, 1]);
      for (const [x, sd] of at) { const f = forcesAt(M, x, sd); fm = Math.max(fm, Math.abs(f.N), Math.abs(f.V)); }
    }
    R.fmax = fm; R.nilF = 1e-9 + 100 * (R.err ? R.err.F : 0) + 1e-10 * fm;
    { let Lx = 0, EIn = Infinity; for (const M of R.mem) { Lx = Math.max(Lx, M.L); EIn = Math.min(EIn, M.EI); }
      R.nilM = 1e-9 + 100 * (R.err ? R.err.M : 0) + 1e-10 * fm * Lx;
      R.nilD = 1e-12 + 100 * (R.err ? R.err.u : 0) + 1e-13 * fm * Lx * Lx * Lx / (3 * EIn); }   /* the last digits of the largest displacement itself are added below, when it is known */
    for (const M of R.mem) M.nilF = R.nilF;
    for (const M of R.mem) {
      M.smp = sample(M, nSeg); M._top = M._wt = null;
      const S = M.smp;
      for (let i = 0; i < S.xs.length; i++) {
        max.N = Math.max(max.N, Math.abs(S.N[i]));
        max.V = Math.max(max.V, Math.abs(S.V[i]));
        max.M = Math.max(max.M, Math.abs(S.M[i]));
        max.D = Math.max(max.D, Math.hypot(S.dX[i], S.dY[i]));
      }
      if (nSeg >= 160) {
        max.D = Math.max(max.D, mostMoved(M).v);
        const q = turnOf(M), e = strainOf(M);
        if (q > max.turn) { max.turn = q; max.turnM = M.i; }
        if (e.e > max.strain) { max.strain = e.e; max.strainM = M.i; max.strainAt = [e.x0, e.x1]; max.strainSign = e.sign; }
      }
    }
    R.max = max;
    R.nilD += 1e-10 * max.D;   /* the last digits of the integration along the members: of no weight in the question whether anything moves */
    return R;
  }

  /* value of a sampled quantity at local x; side picks the jump side. N, V and M of the samples are joined by straight
     lines (the page reads its numbers from forcesAt, which is exact). A displacement or a slope is integrated from the
     sample before x where the series still belongs to its member; a mixed series (the moving picture between two states)
     follows the parabola through three samples */
  function interp(S, key, x, side) {
    const xs = S.xs, a = S[key], n = xs.length;
    if (x <= xs[0]) return a[0];
    if (x >= xs[n - 1]) return a[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < x || (xs[mid] === x && side > 0)) lo = mid; else hi = mid;
    }
    const x0 = xs[lo], x1 = xs[hi];
    if (x1 <= x0) return side > 0 ? a[hi] : a[lo];
    if (S.fine && (key === 'dX' || key === 'dY' || key === 'rot')) return S.fine(x)[key];
    const lin = a[lo] + (a[hi] - a[lo]) * (x - x0) / (x1 - x0);
    if (key !== 'dX' && key !== 'dY') return lin;
    /* a displacement is a smooth line: between two samples it follows the parabola through them and the next sample
       on the nearer side, so that a value read between the samples is right to the printed digit */
    const pick = dir => { let k = dir < 0 ? lo - 1 : hi + 1; while (k >= 0 && k < n && (xs[k] === x0 || xs[k] === x1)) k += dir; return k >= 0 && k < n ? k : -1; };
    let k = pick(x - x0 < x1 - x ? -1 : 1);
    if (k < 0) k = pick(x - x0 < x1 - x ? 1 : -1);
    if (k < 0) return lin;
    const x2 = xs[k];
    return a[lo] * (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2)) + a[hi] * (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2)) + a[k] * (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1));
  }

  /* One analysis as the page shows it. A mechanism is detected on the well-conditioned system with the real
     axial stiffness; the results are then computed with frame members axially rigid (the assumption of hand
     methods), while bars hinged at both ends keep their real axial stiffness. */
  /* What a mechanism lacks: every joint is held in turn sideways (d = 0) and vertically (d = 1); listed are the
     single holds that make the structure stable. Empty when one hold is not enough. */
  function loose(model) {
    const out = [];
    model.nodes.forEach((n, i) => {
      const has = RXN[n.sup || 'free'];
      for (const d of [0, 1]) if (!has.includes(d) && solve(model, { checkOnly: true, pivot: 1e-10, floor: 1e-10, hold: [3 * i + d] }).ok) out.push({ i, d });
    });
    return out;
  }

  /* Which members are bars. An end of a member carries no moment when it is released by a hinge, or when nothing at
     its joint can take a moment from it: no fixed support there and no other member attached without a hinge. A member
     with two such ends is a bar and keeps its real axial stiffness: a truss bar, a strut hinged at both joints, a
     column on a pin with a hinge at its head. In a beam (all members in one line) no member is singled out: its axial
     stiffness is the same along its whole length. */
  function bars(model) {
    const rel = model.members.map(m => endReleases(model, m));
    const none = (mi, k) => {
      if (rel[mi][k]) return true;
      const m = model.members[mi], ni = k ? m.n2 : m.n1;
      if ((model.nodes[ni].sup || 'free') === 'fixed') return false;
      return !model.members.some((q, j) => j !== mi && ((q.n1 === ni && !rel[j][0]) || (q.n2 === ni && !rel[j][1])));
    };
    const a = model.nodes[model.members[0].n1], b = model.nodes[model.members[0].n2], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (model.nodes.every(n => Math.abs((n.x - a.x) * dy - (n.y - a.y) * dx) <= 1e-9 * d2)) return model.members.map(() => false);
    return model.members.map((m, mi) => none(mi, 0) && none(mi, 1));
  }

  /* One analysis as the page shows it. Whether the structure is a mechanism is tested with the real axial stiffness
     of every member. The results are those of members that are rigid along their axis, the assumption of hand
     methods; bars keep their real axial stiffness. The rigid members are solved exactly, with their length as a
     condition (rigidSolve): the result does not depend on a factor, and it holds for any lengths and profiles.
     The analysis says what its arithmetic left (err): the largest force and the largest moment out of balance in its
     equations, and the largest change of length of a rigid member (m). These are the last digits of the elimination,
     not a bound. The page calls a line zero only below a hundred times that amount plus the last digits of the
     arithmetic, and only when the line prints 0.0 (app.js, targets). The last digits are those of the largest value of
     its kind in the structure, not of the value itself: with a member of 18 m a shear that is zero by hand can come
     out as 1e-11 kN beside a largest force of 600 kN. The page allows 1e-10 of the largest value for them.
     Should the reduced stiffness of the exact way not be solved (it never happened in the tests), the limit is taken as
     before: from three solutions with the axial stiffness of the rigid members 10, 10² and 10³ times the real one
     (stepsLimit); the result then says so (limit: 'steps'). */
  /* EI and EA are those of the section of the structure. A member with a section of its own carries two factors on
     them: kf on EI and ka on EA (the page sets both from the two sections; 1 where the member has the section of the
     structure). */
  function analyse(model, EI, EA, rigid = 10) {
    const bar = bars(model);
    model.members.forEach(m => { m.EI = EI * (m.kf || 1); m.EA = EA * (m.ka || 1); });
    const chk = solve(model, { checkOnly: true, pivot: 1e-10, floor: 1e-10 });
    if (!chk.ok) { chk.loose = loose(model); chk.modes = solve(model, { modes: true, pivot: 1e-10, floor: 1e-10 }).modes; return chk; }
    if (!bar.includes(false)) { const R = solve(model); R.bar = bar; return R; }   /* every member a bar: nothing is taken as rigid; what the solution left is measured like everywhere (solve) */
    const R = solve(model, { rigid: bar.map(q => !q) });
    if (!R.ok) return stepsLimit(model, EA, bar, rigid);
    model.members.forEach((m, i) => { m.EA = bar[i] ? EA * (m.ka || 1) : Infinity; });
    R.bar = bar;
    return R;
  }
  /* The rigid limit in three steps, kept for the case that the exact way fails: the structure is solved with the axial
     stiffness of its rigid members 10, 10² and 10³ times the real one. What a finite factor f leaves in the results
     falls as a/f + b/f², and the three solutions s1, s2, s3 remove both parts: the limit is (1000 s3 - 110 s2 + s1) / 891.
     This holds while the stiffened axial stiffness is large beside the bending stiffness of the shortest members: for
     a column of 0.5 m under a beam of 30 m it is not, and the limit is then off in the fourth digit. err is here the
     difference of the two limits of the first order, (10 s2 - s1) / 9 and (10 s3 - s2) / 9. */
  function stepsLimit(model, EA, bar, rigid) {
    const run = f => { model.members.forEach((m, i) => { m.EA = EA * (m.ka || 1) * (bar[i] ? 1 : f); }); return solve(model, { nSeg: 2 }); };
    const s1 = run(rigid), s2 = run(10 * rigid), s3 = run(100 * rigid);
    for (const q of [s1, s2, s3]) if (!q.ok) return q;
    const lim = (p, q, r) => (1000 * r - 110 * q + p) / 891, gap = (p, q, r) => Math.abs(10 * r - 11 * q + p) / 9, err = { F: 0, M: 0, u: 0 };
    for (let i = 0; i < s3.u.length; i++) { if (i % 3 < 2) err.u = Math.max(err.u, gap(s1.u[i], s2.u[i], s3.u[i])); s3.u[i] = lim(s1.u[i], s2.u[i], s3.u[i]); }
    s3.reactions.forEach((r, i) => { for (const k of ['Rx', 'Ry', 'Mz']) { const e = k === 'Mz' ? 'M' : 'F'; err[e] = Math.max(err[e], gap(s1.reactions[i][k], s2.reactions[i][k], r[k])); r[k] = lim(s1.reactions[i][k], s2.reactions[i][k], r[k]); } });
    s3.mem.forEach((M, i) => {
      const P = s1.mem[i], Q = s2.mem[i];
      for (let k = 0; k < 6; k++) {
        if (k % 3 < 2) err.u = Math.max(err.u, gap(P.ul[k], Q.ul[k], M.ul[k]));
        const e = k % 3 === 2 ? 'M' : 'F'; err[e] = Math.max(err[e], gap(P.f[k], Q.f[k], M.f[k]));
        M.ul[k] = lim(P.ul[k], Q.ul[k], M.ul[k]); M.f[k] = lim(P.f[k], Q.f[k], M.f[k]);
      }
      /* a rigid member does not change its length: its axial strain is zero in the limit. EAr keeps the stiffness of the
         last and stiffest step, from which the page tells what a finite factor would have left */
      if (!bar[i]) { M.EAr = EA * (model.members[i].ka || 1) * 100 * rigid; M.EA = Infinity; }
    });
    model.members.forEach((m, i) => { m.EA = bar[i] ? EA * (m.ka || 1) : Infinity; });
    s3.bar = bar; s3.err = err; s3.limit = 'steps';
    return lines(s3);
  }

  /* Where a member moves most, and how far: { x, v, inner, dX, dY }, kept with the member.
     Along the member the movement is u, across it w: u′ = N/EA, w′ = the slope, w″ = M/EI. The square of its size is
     f = u² + w². The stations of the member hold both sides of every point load and the zeros of N, V and M
     (shapePlaces): between two neighbouring stations N, V and M keep their signs, so u, the slope and M each run one way.
     A member that is rigid along its axis has the same u everywhere. It moves most where |w| is largest: at a station,
     or where the slope is zero. Between two stations the slope is zero once at most; the place is found by halving.
     A bar without a load of its own moves in a straight line between its joints: f is a parabola that opens upward and
     is largest at a joint.
     A bar with loads: a stretch between two stations is cut where the slope is zero, so that w runs one way on each
     piece as well. Half the second derivative of f, f″/2 = u′² + u·u″ + w′² + w·w″, then lies between two numbers that follow from
     the values at the two ends of the piece (u, u′, w, w′ and M run one way, N′ is a straight line). Not below zero:
     f has no top inside the piece. Not above zero: f′ falls and is zero once at most, found by halving. Otherwise the
     piece is halved and both halves are looked at again, down to a billionth of the member.
     So no top is passed over, and the largest of the tops and of the stations is taken. */
  function mostMoved(M) {
    if (M._top) return M._top;
    return (M._top = topFrom(M, 0, 0));
  }
  /* The same search for the movement against a point that moves by (X0, Y0): the largest distance between the
     displacement of a point of the member and that displacement. The derivatives of the movement are the same, so
     the search is the same with the movement counted from (X0, Y0). */
  function topFrom(M, X0, Y0) {
    const S = M.smp, xs = S.xs, n = xs.length, L = M.L, c = M.c, s = M.s, bar = isFinite(M.EA), du = S.du || 0;
    let best = [xs[0], Math.hypot(S.dX[0] - X0, S.dY[0] - Y0)];
    const take = (x, v) => { if (v > best[1]) best = [x, v]; };
    for (let i = 1; i < n; i++) take(xs[i], Math.hypot(S.dX[i] - X0, S.dY[i] - Y0));
    const at = x => S.fine(Math.min(L, Math.max(0, x))), size = x => { const q = at(x); return Math.hypot(q.dX - X0, q.dY - Y0); };
    const zero = (fn, lo, hi, flo) => { for (let k = 0; k < 60; k++) { const xm = (lo + hi) / 2; if (fn(xm) * flo > 0) lo = xm; else hi = xm; } return (lo + hi) / 2; };
    const own = bar && (M.ll.pts.length > 0 || [M.ll.q1x, M.ll.q1y, M.ll.q1x + M.ll.tx * L, M.ll.q1y + M.ll.ty * L].some(v => Math.abs(v) > 1e-12));
    /* a point of a bar with all that the bend of f needs; side picks the side of a point load */
    const P = (x, sd) => { const q = at(x), f = forcesAt(M, x, sd), ax = q.dX - X0, ay = q.dY - Y0; return { x, u: ax * c + ay * s, w: -ax * s + ay * c, r: q.rot, e: f.N / M.EA + du, N: f.N, k: f.M / M.EI }; };
    const sq = (a, b) => (a * b <= 0 ? [0, Math.max(a * a, b * b)] : [Math.min(a * a, b * b), Math.max(a * a, b * b)]);
    const pr = (a1, a2, b1, b2) => { const v = [a1 * b1, a1 * b2, a2 * b1, a2 * b2]; return [Math.min(...v), Math.max(...v)]; };
    const g = q => q.u * q.e + q.w * q.r;
    const piece = (A, B, depth) => {
      const h = B.x - A.x;
      if (!(h > 1e-9 * L)) return;
      const m = P((A.x + B.x) / 2, -1), nA = (-3 * A.N + 4 * m.N - B.N) / h / M.EA, nB = (A.N - 4 * m.N + 3 * B.N) / h / M.EA;
      const t1 = sq(A.e, B.e), t2 = pr(A.u, B.u, nA, nB), t3 = sq(A.r, B.r), t4 = pr(A.w, B.w, A.k, B.k), lo = t1[0] + t2[0] + t3[0] + t4[0], hi = t1[1] + t2[1] + t3[1] + t4[1];
      if (lo >= 0) return;
      if (hi <= 0) { const gA = g(A), gB = g(B); if (gA > 0 && gB < 0) { const x = zero(xx => g(P(xx, -1)), A.x, B.x, gA); take(x, size(x)); } return; }
      take(m.x, Math.hypot(m.u, m.w));
      if (depth < 34) { piece(A, m, depth + 1); piece(m, B, depth + 1); }
    };
    for (let i = 0; i < n - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      if (!(b > a)) continue;
      const ra = S.rot[i], rb = S.rot[i + 1], turn = ra * rb < 0 ? zero(x => at(x).rot, a, b, ra) : null;
      if (turn !== null) take(turn, size(turn));
      if (!own) continue;
      const A = P(a, 1), B = P(b, -1);
      if (turn === null) piece(A, B, 0); else { const T = P(turn, -1); piece(A, T, 0); piece(T, B, 0); }
    }
    const [x, v] = best, q = at(x);
    return { x, v, inner: x > 1e-6 * L && x < L * (1 - 1e-6), dX: q.dX, dY: q.dY };
  }
  /* First-order theory holds for small rotations and small strains. Two measures say how far a member is from that,
     each read on the member itself (reviews 09 to 11, C97, C115 and C122):
     - turnOf: the largest rotation of the member anywhere along it, in radians. The rotation is the slope of its
       deflected line; it holds the turn of the member as a whole (a column of a frame that sways, a bar of a truss) and
       the turn by bending. Its derivative is M/EI, and the zeros of M are stations (shapePlaces), so it runs one way
       between two stations: the largest at a station is the largest of the member. A short stretch that turns far is
       found whatever the member moves as a whole: a cantilever of 30 m with 500 kN down at 26 m, 1000 kN up at 28 m
       and 500 kN down at 30 m turns by 0.49 rad at its tip, which moves by 0.98 m, a thirtieth of the length.
     - strainOf: the largest strain along the axis, |N| / EA, anywhere in the member, with the stretch of the member that
       has it and its sign. It is read at the stations, which hold both sides of every point load: between two stations
       the axial force runs one way (a distributed load keeps its direction along the member), so the largest at a
       station is the largest of the member. A member that is only pulled or pushed has this and no rotation. Up to
       review 11 the measure was the movement of a point along the member against its ends, as a share of the whole
       length: sixty loads of 1000 kN pulling a stretch of 10 cm of a 3 m bar apart strain that stretch by 10 % and the
       whole bar by 0.33 % (C122). A member that the analysis takes as rigid along its axis has no strain here.
     The page says so above TURN, a twentieth of a radian (50 mrad), and above STRAIN, a twentieth (5 %). */
  const TURN = 1 / 20, STRAIN = 1 / 20;
  function turnOf(M) {
    let r = 0;
    for (const v of M.smp.rot) r = Math.max(r, Math.abs(v));
    return r;
  }
  function strainOf(M) {
    const S = M.smp, n = S.xs.length, none = { e: 0, x0: 0, x1: 0, sign: 0 };
    if (!isFinite(M.EA)) return none;
    const at = i => S.N[i] / M.EA + (S.du || 0);
    let k = 0;
    for (let i = 1; i < n; i++) if (Math.abs(at(i)) > Math.abs(at(k))) k = i;
    const e = Math.abs(at(k));
    if (!(e > 0)) return none;
    /* the stretch that carries it: the stations beside it with the same strain, as between two point loads */
    let lo = k, hi = k;
    while (lo > 0 && Math.abs(at(lo - 1) - at(k)) <= 1e-9 * e) lo--;
    while (hi < n - 1 && Math.abs(at(hi + 1) - at(k)) <= 1e-9 * e) hi++;
    return { e, x0: S.xs[lo], x1: S.xs[hi], sign: at(k) > 0 ? 1 : -1 };
  }
  /* The largest and smallest values of the deflection of a beam member, each found on the line itself:
     [x, w, sample, sign of the slope before the turn] (the line rises to the turn or falls to it).
     The line turns where its slope is zero. The stations of the member hold the zeros of the moment (shapePlaces):
     between two neighbouring stations the curvature keeps its sign, the slope runs one way and is zero once at most.
     So every turn shows as a change of sign of the slope between two neighbouring stations, up to both ends of the
     member, and is found by halving; a station with the slope zero is such a place itself. Two turns a few
     millimetres apart, on either side of a zero of the moment, are both found. An end of the member is no top here:
     a free end and a joint carry their own numbers. That holds also for a fixed end, where the slope is zero but for
     the last digits of the arithmetic: a change of sign within a billionth of the member from an end is not named. */
  function wTops(M) {
    if (M._wt) return M._wt;
    const S = M.smp, xs = S.xs, n = xs.length, L = M.L, wf = x => -interp(S, 'dY', x, -1), sl = (x, sd) => -interp(S, 'rot', x, sd), id = [], out = [];
    for (let i = 0; i < n; i++) if (!i || xs[i] > xs[i - 1]) id.push(i);
    const big = id.reduce((t, i) => Math.max(t, Math.abs(S.rot[i])), 0), sg = v => (Math.abs(v) <= 1e-12 * big ? 0 : v > 0 ? 1 : -1);
    let last = 0;   /* the sign of the slope before the present stretch, where it was not zero */
    for (let j = 0; j < id.length - 1; j++) {
      const a = xs[id[j]], b = xs[id[j + 1]], sa = sg(sl(a, 1)), sb = sg(sl(b, -1));
      if (sa && sb && sa !== sb) { let lo = a, hi = b; for (let k = 0; k < 60; k++) { const xm = (lo + hi) / 2; if (sg(sl(xm, -1)) === sa) lo = xm; else hi = xm; } const x = (lo + hi) / 2; if (x > 1e-9 * L && x < L * (1 - 1e-9)) out.push([x, wf(x), id[j], sa]); }
      else if (!sa && j > 0 && last && sb && sb !== last) out.push([a, wf(a), id[j], last]);   /* the slope is zero at this sample and turns there */
      if (sa) last = sa;
      if (sb) last = sb;
    }
    return (M._wt = out);
  }

  /* What a mechanism can do: its free movements, one by one, as far as they can be told apart in words.
     The free movements are the null space of the stiffness (nullSpace); any set of that many independent movements
     describes it. This set is chosen:
     - the whole structure slides sideways, moves up and down or turns as one body, where such a movement is free
       (every joint moves by the same amount, or about one point; tried about every support and about the centre);
     - then movements of few joints: the null space is brought to the form in which each movement has one joint of its
       own that the others leave at rest, and the ones that move the fewest joints are taken until the set is complete.
     Each movement: { kind: 'slide' | 'lift' | 'turn' | 'part', about (turn: the joint it turns about, or -1), joints:
     [{ i, dx, dy }] with the largest part 1, turns: [{ mi, about }] the members of which one end moves and the other
     does not }, and t, the movement of every joint (dx, dy by joint). Returns null where the movements cannot be told
     (the two counts of free movements differ, or a movement has no joint that moves). */
  function movements(model, EI, EA) {
    model.members.forEach(m => { m.EI = EI * (m.kf || 1); m.EA = EA * (m.ka || 1); });
    const r = solve(model, { space: true, pivot: 1e-10, floor: 1e-10 });
    if (!r.space) return null;
    const J = model.nodes.length, k = r.space.length, T = r.space.map(v => { const t = new Float64Array(2 * J); r.free.forEach((d, i) => { if (d % 3 < 2) t[2 * ((d - d % 3) / 3) + d % 3] = v[i]; }); return t; });
    if (!k) return [];
    const dot = (a, b) => { let q = 0; for (let i = 0; i < a.length; i++) q += a[i] * b[i]; return q; };
    /* an orthonormal set that spans the same joint movements; a movement that moves no joint cannot be told */
    const ortho = list => { const Q = []; for (const v of list) { const w = Float64Array.from(v); for (const q of Q) { const c = dot(q, w); for (let i = 0; i < w.length; i++) w[i] -= c * q[i]; } const nw = Math.sqrt(dot(w, w)); if (nw > 1e-7 * Math.sqrt(dot(v, v) || 1)) Q.push(w.map(x => x / nw)); } return Q; };
    const Q = ortho(T);
    if (Q.length !== k) return null;
    const inSpace = p => { const w = Float64Array.from(p); for (const q of Q) { const c = dot(q, w); for (let i = 0; i < w.length; i++) w[i] -= c * q[i]; } return Math.sqrt(dot(w, w)) <= 1e-6 * Math.sqrt(dot(p, p)); };
    const pat = f => { const t = new Float64Array(2 * J); model.nodes.forEach((n, i) => { const [x, y] = f(n); t[2 * i] = x; t[2 * i + 1] = y; }); return t; };
    const chosen = [];
    const sx = pat(() => [1, 0]), sy = pat(() => [0, 1]);
    if (inSpace(sx)) chosen.push({ kind: 'slide', t: sx });
    if (inSpace(sy)) chosen.push({ kind: 'lift', t: sy });
    const cx = model.nodes.reduce((q, n) => q + n.x, 0) / J, cy = model.nodes.reduce((q, n) => q + n.y, 0) / J;
    const centres = model.nodes.map((n, i) => ({ i, x: n.x, y: n.y })).filter(c => (model.nodes[c.i].sup || 'free') !== 'free').concat([{ i: -1, x: cx, y: cy }]);
    for (const c of centres) { const t = pat(n => [-(n.y - c.y), n.x - c.x]); if (inSpace(t)) { chosen.push({ kind: 'turn', about: chosen.length === 2 ? -1 : c.i, t }); break; } }
    /* the movements of parts: Gauss-Jordan on the joint movements, joint by joint */
    const R = T.map(t => Float64Array.from(t)), piv = [];
    let row = 0;
    for (let col = 0; col < 2 * J && row < k; col++) {
      let b = row;
      for (let i = row + 1; i < k; i++) if (Math.abs(R[i][col]) > Math.abs(R[b][col])) b = i;
      const big = Math.max(...R[b].map(Math.abs));
      if (!(Math.abs(R[b][col]) > 1e-7 * big)) continue;
      [R[row], R[b]] = [R[b], R[row]];
      const d = R[row][col]; for (let j = 0; j < 2 * J; j++) R[row][j] /= d;
      for (let i = 0; i < k; i++) if (i !== row) { const f = R[i][col]; if (f) for (let j = 0; j < 2 * J; j++) R[i][j] -= f * R[row][j]; }
      piv.push(col); row++;
    }
    if (row !== k) return null;
    const clean = t => { const big = Math.max(...Array.from(t, Math.abs)); return t.map(x => (Math.abs(x) <= 1e-7 * big ? 0 : x / big)); };
    const moving = t => { let c = 0; for (let i = 0; i < J; i++) if (t[2 * i] || t[2 * i + 1]) c++; return c; };
    const parts = R.map(clean).sort((a, b) => moving(a) - moving(b));
    for (const t of parts) {
      if (chosen.length >= k) break;
      if (ortho(chosen.map(c => c.t).concat([t])).length > chosen.length) chosen.push({ kind: 'part', t });
    }
    if (chosen.length !== k) return null;
    return chosen.map(c => {
      const t = clean(c.t), joints = [], turns = [];
      for (let i = 0; i < J; i++) if (t[2 * i] || t[2 * i + 1]) joints.push({ i, dx: t[2 * i], dy: t[2 * i + 1] });
      if (c.kind === 'part') model.members.forEach((m, mi) => { const a = t[2 * m.n1] || t[2 * m.n1 + 1], b = t[2 * m.n2] || t[2 * m.n2 + 1]; if (!!a !== !!b) turns.push({ mi, about: a ? m.n2 : m.n1 }); });
      return { kind: c.kind, about: c.kind === 'turn' ? c.about : undefined, joints, turns, t: Array.from(t) };
    });
  }

  /* is the structure stable: the test of analyse alone, for a model the page tries a change on */
  function stable(model, EI, EA) {
    model.members.forEach(m => { m.EI = EI * (m.kf || 1); m.EA = EA * (m.ka || 1); });
    return solve(model, { checkOnly: true, pivot: 1e-10, floor: 1e-10 }).ok;
  }

  /* Changes that make a mechanism stable, tried and not guessed: each set of changes is applied to a copy of the structure
     and tested with `stable`. A change is a support made stronger (free, roller, pin, fixed) at a joint that can carry a
     support (cs), or the hinge of a joint closed (ch). The fewest joints are changed: one, two where one is not enough,
     three where two are not; at each joint the weakest kind of support that does it with the other changes named.
     Returns { n: 1 | 2 | 3, sets } with up to three sets of one change, two sets of two or one set of three,
     each change { i, sup } or { i, close: true }. Where three joints are not enough: { n: 4, kind, set } with
     kind 'sup' (every support fixed), 'hin' (every hinge closed), 'both', or '' (set empty). */
  function remedies(model, EI, EA) {
    const ORDER = ['free', 'roller', 'pin', 'fixed'], cands = [];
    model.nodes.forEach((n, i) => {
      if (n.cs) for (const t of ORDER.slice(ORDER.indexOf(n.sup || 'free') + 1)) cands.push({ i, sup: t });
      else if (n.ch && n.hinge) cands.push({ i, close: true });
    });
    const works = set => { const c = JSON.parse(JSON.stringify(model)); for (const q of set) { if (q.sup) c.nodes[q.i].sup = q.sup; else c.nodes[q.i].hinge = false; } return stable(c, EI, EA); };
    /* k changes at k different joints, in the order of the joints and from the weakest support on; each set of joints once */
    const sets = (k, most) => {
      const out = [], seen = new Set(), pick = [];
      const go = from => {
        if (out.length >= most) return;
        if (pick.length === k) { const id = pick.map(q => q.i).join('|'); if (!seen.has(id) && works(pick)) { seen.add(id); out.push(pick.map(q => ({ ...q }))); } return; }
        for (let a = from; a < cands.length && out.length < most; a++) { if (pick.some(q => q.i === cands[a].i)) continue; pick.push(cands[a]); go(a + 1); pick.pop(); }
      };
      go(0); return out;
    };
    for (const [k, most] of [[1, 3], [2, 2], [3, 1]]) { const f = sets(k, most); if (f.length) return { n: k, sets: f }; }
    const sup = [], hin = [];
    model.nodes.forEach((n, i) => { if (n.cs && (n.sup || 'free') !== 'fixed') sup.push({ i, sup: 'fixed' }); else if (n.ch && n.hinge) hin.push({ i, close: true }); });
    const kind = sup.length && works(sup) ? 'sup' : hin.length && works(hin) ? 'hin' : sup.length && hin.length && works(sup.concat(hin)) ? 'both' : '';
    return { n: 4, kind, set: kind === 'sup' ? sup : kind === 'hin' ? hin : kind === 'both' ? sup.concat(hin) : [] };
  }

  return { solve, analyse, stepsLimit, bars, stable, remedies, movements, mostMoved, turnOf, strainOf, TURN, STRAIN, wTops, forcesAt, qAt, hasQ, vZeros, interp, determinacy, loose, RXN };
})();
if (typeof module !== 'undefined') module.exports = FS;
