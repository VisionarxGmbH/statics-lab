/* ---------- the 3D view ----------
   The same structure as on the sheet, as a body: its members with the real outline of their profiles (depth, width, web,
   flanges and root fillets of the section), its supports and its loads, bent as the analysis finds it and by the same
   factor as on the sheet. The members are coloured by their normal stress σ = N/A + M·z/I at each fibre: tension and
   compression in the colours of the axial force. The line of the open tab stands as a clear sheet in the plane of the
   frame.
   At the place the probe reads on the sheet the member is cut. The view then has two parts: the structure above, with a
   frame round the cut, and below it the member cut open, seen near: on the cut face stands the body of the normal
   stress, as long at each fibre as the stress there is large, with its two edge values.
   Drawn with WebGL, without a library. The view is turned with the mouse, moved with shift or the right button, and
   brought nearer with the wheel. Nothing here changes the structure or its numbers. */
const V3 = (() => {
  const q = s => document.querySelector(s);
  let host = null, cv, lab, lx, gl = null, loc = null, on = false, dirty = true, moved = true, lost = false, W3 = 0, H3 = 0, dp = 1, failed = '';
  const START = { yaw: 0.6, pitch: 0.26, zoom: 1, zd: 1, px: 0, py: 0 }, cam = { ...START };
  let cut = null;            /* the place of the cut: { mi, a }. It stays where the probe last stood, so that the view can be turned */
  let scene = null;          /* what the last build made: the structure, and with a cut the member seen near */
  let info = null;           /* the cut in numbers */
  let views = [];            /* the parts of the view: [x, y, width, height] of the structure and of the cut */
  /* ---- small vector and matrix tools ---- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mat = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };
  const look = (e, c, up) => { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); };
  const rgb = c => { const m = c.match(/[\d.]+/g); return [m[0] / 255, m[1] / 255, m[2] / 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const Z = [0, 0, 1];

  /* ---- the mesh under construction: solid triangles, clear triangles, lines ---- */
  let T, G, L;
  const fresh = () => { T = { p: [], n: [], k: [] }; G = { p: [], n: [], k: [] }; L = { p: [], n: [], k: [] }; };
  const done = B => ({ n: B.p.length / 3, p: new Float32Array(B.p), nn: new Float32Array(B.n), k: new Float32Array(B.k) });
  const vtx = (B, p, n, k) => { B.p.push(p[0], p[1], p[2]); B.n.push(n[0], n[1], n[2]); B.k.push(k[0], k[1], k[2], k.length > 3 ? k[3] : 1); };
  const tri = (B, a, b, c, k, n) => { const m = n || norm(cross(sub(b, a), sub(c, a))); vtx(B, a, m, k); vtx(B, b, m, k); vtx(B, c, m, k); };
  const quad = (B, a, b, c, d, k, n) => { const m = n || norm(cross(sub(b, a), sub(d, a))); tri(B, a, b, c, k, m); tri(B, a, c, d, k, m); };
  const seg = (a, b, k) => { vtx(L, a, Z, k); vtx(L, b, Z, k); };
  /* a box: a centre, three axes of unit length and three half sizes */
  function block(B, c, ax, ay, az, hx, hy, hz, k) {
    const P = (i, j, l) => add(add(add(c, mul(ax, i * hx)), mul(ay, j * hy)), mul(az, l * hz));
    quad(B, P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), k, ax); quad(B, P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1), k, mul(ax, -1));
    quad(B, P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), k, ay); quad(B, P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), k, mul(ay, -1));
    quad(B, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), k, az); quad(B, P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), k, mul(az, -1));
  }
  /* a round bar from a to b with the radii r1 and r2; r2 = 0 makes a cone */
  function bar(B, a, b, r1, r2, k, m = 14) {
    const e = norm(sub(b, a)), u = norm(cross(e, Math.abs(e[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(e, u);
    for (let i = 0; i < m; i++) {
      const t0 = i / m * 2 * Math.PI, t1 = (i + 1) / m * 2 * Math.PI, d0 = add(mul(u, Math.cos(t0)), mul(v, Math.sin(t0))), d1 = add(mul(u, Math.cos(t1)), mul(v, Math.sin(t1)));
      const a0 = add(a, mul(d0, r1)), a1 = add(a, mul(d1, r1)), b0 = add(b, mul(d0, r2)), b1 = add(b, mul(d1, r2));
      vtx(B, a0, d0, k); vtx(B, a1, d1, k); vtx(B, b1, d1, k); vtx(B, a0, d0, k); vtx(B, b1, d1, k); vtx(B, b0, d0, k);
      tri(B, a, a1, a0, k, mul(e, -1)); if (r2 > 0) tri(B, b, b0, b1, k, e);
    }
  }
  function arrow(B, tip, dir, len, r, k) {   /* an arrow of the length len that ends at tip */
    const hl = Math.min(len * 0.5, r * 6), mid = sub(tip, mul(dir, hl));
    bar(B, sub(tip, mul(dir, len)), mid, r, r, k, 10); bar(B, mid, tip, r * 2.7, 0, k, 12);
  }

  /* ---- the outline of an I section in its own plane: points [u, v] in metres. u runs across the member toward its
     dashed side (down on a beam), v along the width. Once round, each root fillet as two chords. With it the pieces the
     end faces are made of: the two flanges, the web, and the four corners between them ---- */
  function section(s) {
    const [h, b, tw, tf, r] = s.dim.map(x => x / 1000), H = h / 2, B2 = b / 2, t = tw / 2, o = [], fans = [];
    const fil = (cu, cv_, f, corner) => { const a = []; for (let i = 0; i <= 2; i++) { const p = f(i * Math.PI / 4); a.push([cu + r * p[0], cv_ + r * p[1]]); } o.push(...a); fans.push([corner, ...a]); };
    o.push([-H, -B2], [-H, B2], [-H + tf, B2]);
    fil(-H + tf + r, t + r, a => [-Math.cos(a), -Math.sin(a)], [-H + tf, t]);
    fil(H - tf - r, t + r, a => [Math.sin(a), -Math.cos(a)], [H - tf, t]);
    o.push([H - tf, B2], [H, B2], [H, -B2], [H - tf, -B2]);
    fil(H - tf - r, -t - r, a => [Math.cos(a), Math.sin(a)], [H - tf, -t]);
    fil(-H + tf + r, -t - r, a => [-Math.sin(a), Math.cos(a)], [-H + tf, -t]);
    o.push([-H + tf, -B2]);
    const rects = [[-H, -H + tf, B2], [-H + tf, H - tf, t], [H - tf, H, B2]];   /* [u from, u to, half width]: top flange, web, bottom flange */
    return { o, fans, rects, H, B2, t, tf, nrm: o.map((p, i) => { const n = o[(i + 1) % o.length], du = n[0] - p[0], dv = n[1] - p[1], l = Math.hypot(du, dv) || 1; return [-dv / l, du / l]; }) };
  }
  const secOf = mb => (mb.sec === null || mb.sec === undefined ? SECTIONS[st.sec] : SECTIONS[mb.sec]);
  /* the normal stress in N/mm² from N in kN and M in kNm: σ = sigN + sigK · u, with u in metres toward the dashed side.
     N/A: kN / cm² · 10. M·u/I: kNm · m / cm⁴ · 10⁵, with the I that the section modulus W of the window of the section
     stands for (W = I / (h/2), I worked out from the dimensions): so the edge stress is M/W with the W shown there */
  const sigN = (N, s) => N * 10 / s.A, sigK = (M, s) => M * 1e5 / (sectionMore(s).W * s.dim[0] / 20);
  /* The shear stress τ = V·S/(I·t) at the fibre u (metres from the middle, across the member). S is the first moment,
     about the middle, of the part of the section beyond that fibre: in the web the flange, the two root fillets and the
     web beyond u; t is there the web. In a flange S is that of the flange beyond u and t its width, so τ is small there
     and steps at the web. A root fillet of radius r has the area (1 − π/4) r² and its centre (5/6 − π/4)/(1 − π/4) r
     from the corner, as in the window of the section. For a fibre that runs through the fillets, the part of them
     beyond it is added up in 24 strips of their true width.
     Returns [S in cm³, t in mm]. At the middle of an IPE 300: S = 314.2 cm³, half the plastic modulus of the tables */
  function firstMoment(s, u) {
    const [h, b, tw, tf, r] = s.dim.map(x => x / 1000), H = h / 2, hw = H - tf, a = Math.abs(u), af = 1 - Math.PI / 4, cf = (5 / 6 - Math.PI / 4) / af;
    if (a >= hw) return [b * (H * H - a * a) / 2 * 1e6, b * 1000];
    let fil = 2 * af * r * r * (hw - cf * r);
    if (a > hw - r) { fil = 0; const n = 24, du = (hw - a) / n; for (let i = 0; i < n; i++) { const x = a + (i + 0.5) * du; fil += 2 * (r - Math.sqrt(Math.max(0, r * r - (x - (hw - r)) ** 2))) * x * du; } }
    return [(b * tf * (H - tf / 2) + tw * (hw * hw - a * a) / 2 + fil) * 1e6, tw * 1000];
  }
  const tau = (V, s, u) => { const [S, t] = firstMoment(s, u); return V * S / (s.I * t) * 100; };   /* kN · cm³ / (cm⁴ · mm) · 100 = N/mm² */

  /* ---- a member as a body along its stations. A station: its point, its tangent, its direction toward the dashed
     side, and the two numbers of its stress ---- */
  function body(B, sta, sec, shade, alpha, capA, capB) {
    const n = sec.o.length, pt = (s, p) => add(add(s.p, mul(s.z, p[0])), mul(Z, p[1])), col = (s, p) => { const c = shade(s.sN + s.kM * p[0]); return alpha < 1 ? [c[0], c[1], c[2], alpha] : c; };
    for (let i = 0; i + 1 < sta.length; i++) {
      const a = sta[i], b = sta[i + 1];
      for (let k = 0; k < n; k++) {
        const p0 = sec.o[k], p1 = sec.o[(k + 1) % n], m = sec.nrm[k], na = add(mul(a.z, m[0]), mul(Z, m[1])), nb = add(mul(b.z, m[0]), mul(Z, m[1]));
        const A0 = pt(a, p0), A1 = pt(a, p1), B0 = pt(b, p0), B1 = pt(b, p1), ca0 = col(a, p0), ca1 = col(a, p1), cb0 = col(b, p0), cb1 = col(b, p1);
        vtx(B, A0, na, ca0); vtx(B, A1, na, ca1); vtx(B, B1, nb, cb1); vtx(B, A0, na, ca0); vtx(B, B1, nb, cb1); vtx(B, B0, nb, cb0);
      }
    }
    const cap = (s, sg) => {
      const nn = mul(s.t, sg), P = (u, v) => pt(s, [u, v]), c = (u, v) => col(s, [u, v]);
      for (const [u0, u1, w] of sec.rects) { const a = P(u0, -w), b = P(u0, w), c2 = P(u1, w), d = P(u1, -w); vtx(B, a, nn, c(u0, 0)); vtx(B, b, nn, c(u0, 0)); vtx(B, c2, nn, c(u1, 0)); vtx(B, a, nn, c(u0, 0)); vtx(B, c2, nn, c(u1, 0)); vtx(B, d, nn, c(u1, 0)); }
      for (const f of sec.fans) for (let i = 1; i + 1 < f.length; i++) { vtx(B, P(...f[0]), nn, c(...f[0])); vtx(B, P(...f[i]), nn, c(...f[i])); vtx(B, P(...f[i + 1]), nn, c(...f[i + 1])); }
    };
    if (capA) cap(sta[0], -1);
    if (capB) cap(sta[sta.length - 1], 1);
  }
  /* the long edges of a profile, as fine lines: the eight corners of the two flanges; and the outline of an end face */
  function edges(sta, sec, k, face) {
    const { H, B2, tf } = sec, P = (s, p) => add(add(s.p, mul(s.z, p[0])), mul(Z, p[1]));
    for (const p of [[-H, -B2], [-H, B2], [-H + tf, B2], [-H + tf, -B2], [H, -B2], [H, B2], [H - tf, B2], [H - tf, -B2]])
      for (let i = 0; i + 1 < sta.length; i++) seg(P(sta[i], p), P(sta[i + 1], p), k);
    if (face) { const s = sta[sta.length - 1], n = sec.o.length; for (let i = 0; i < n; i++) seg(add(P(s, sec.o[i]), mul(s.t, 0.001)), add(P(s, sec.o[(i + 1) % n]), mul(s.t, 0.001)), k); }
  }

  /* ---- the stations of a member: where it stands now, bent by the factor of the drawing ---- */
  function stations(mi, mag, ok) {
    const m = st.model, mb = m.members[mi], a = m.nodes[mb.n1], b = m.nodes[mb.n2], Lm = Math.hypot(b.x - a.x, b.y - a.y), e = [(b.x - a.x) / Lm, (b.y - a.y) / Lm, 0], s = secOf(mb);
    const out = [];
    if (!ok) { for (const x of [0, Lm]) out.push({ x, p: [a.x + e[0] * x, a.y + e[1] * x, 0], sN: 0, kM: 0, N: 0, V: 0, M: 0 }); }
    else {
      const S = series(mi), n = S.xs.length, straight = barStyle(mi);
      for (let i = 0; i < n; i++) {
        if (straight && i > 0 && i < n - 1) continue;
        out.push({ x: S.xs[i], p: [a.x + e[0] * S.xs[i] + S.dX[i] * mag, a.y + e[1] * S.xs[i] + S.dY[i] * mag, 0], sN: sigN(S.N[i], s), kM: sigK(S.M[i], s), N: S.N[i], V: S.V[i], M: S.M[i] });
      }
    }
    for (let i = 0; i < out.length; i++) {
      let j = Math.max(i - 1, 0), k = Math.min(i + 1, out.length - 1);
      while (j > 0 && out[i].x - out[j].x < 1e-9) j--;
      while (k < out.length - 1 && out[k].x - out[i].x < 1e-9) k++;
      const t = norm(sub(out[k].p, out[j].p));
      out[i].t = t[0] || t[1] ? t : e; out[i].z = [out[i].t[1], -out[i].t[0], 0];
    }
    return { sta: out, L: Lm, e, sec: s };
  }
  /* a station at the place x of a member, between the two it lies between */
  function at(sta, x) {
    let i = 0;
    while (i + 2 < sta.length && sta[i + 1].x < x) i++;
    const a = sta[i], b = sta[i + 1], f = b.x - a.x > 1e-12 ? clamp((x - a.x) / (b.x - a.x), 0, 1) : 0, o = { x };
    for (const k of ['sN', 'kM', 'N', 'V', 'M']) o[k] = lerp(a[k], b[k], f);
    o.p = add(a.p, mul(sub(b.p, a.p), f)); o.t = norm(add(mul(a.t, 1 - f), mul(b.t, f))); o.z = [o.t[1], -o.t[0], 0];
    return o;
  }

  /* ---- the scene: the whole structure, and with a cut the member seen near ---- */
  function build() {
    const m = st.model, nd = m.nodes, ok = !!(st.sol && st.sol.ok), dark = darkNow();
    const ink = rgb(C.ink), bg = rgb(C.bg), load = rgb(C.load), tens = rgb(C.cT), comp = rgb(C.cC), steel = dark ? [0.56, 0.61, 0.68] : [0.69, 0.73, 0.79];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const n of nd) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const size = Math.max(x1 - x0, y1 - y0, 3), U = clamp(size / 8, 0.6, 2.4);
    const mag = ok && !st.flat.D && VW ? VW.dAmp / st.ext.D / VW.s : 0;
    const MS = m.members.map((mb, mi) => stations(mi, mag, ok));
    /* the largest normal stress of the structure sets the colours and the length of the body of the stress */
    let smax = 0;
    if (ok) st.sol.mem.forEach((M, mi) => { const s = MS[mi].sec, H = s.dim[0] / 2000, S = M.smp; for (let i = 0; i < S.xs.length; i++) smax = Math.max(smax, Math.abs(sigN(S.N[i], s)) + Math.abs(sigK(S.M[i], s)) * H); });
    let tmax = 0;
    if (ok) st.sol.mem.forEach((M, mi) => { const s = MS[mi].sec, S = M.smp; for (let i = 0; i < S.xs.length; i++) tmax = Math.max(tmax, Math.abs(tau(S.V[i], s, 0))); });
    const shade = sg => (smax > 1e-9 ? mix(steel, sg >= 0 ? tens : comp, 0.9 * Math.min(1, Math.abs(sg) / smax) ** 0.7) : steel);
    if (cut && (!ok || !m.members[cut.mi])) cut = null;
    if (!cut) info = null;
    const edge = mix(ink, bg, 0.35), labels = [];
    fresh();
    /* members, each with its axis as it was as a fine line */
    let cutAt = null;
    MS.forEach((ms, mi) => {
      const sec = section(ms.sec);
      body(T, ms.sta, sec, shade, 1, true, true); edges(ms.sta, sec, edge);
      if (mag) { const mb = m.members[mi], a = nd[mb.n1], b = nd[mb.n2]; seg([a.x, a.y, 0], [b.x, b.y, 0], [...mix(ink, bg, 0.55), 1]); }
      if (cut && cut.mi === mi) {   /* where it is cut: a frame round the section and a clear pane in it */
        const xc = clamp(cut.a, 0, ms.L), c = at(ms.sta, xc), hu = sec.H + 0.11 * U, hv = sec.B2 + 0.11 * U, P = (u, v) => add(add(c.p, mul(c.z, u)), mul(Z, v)), k = [...load, 1];
        /* the forces of the cut are those of the analysis at that very place, not read between two stations: just before
           the place, as the probe reads its first value there (just after it at the start of a member) */
        { const f = FS.forcesAt(st.sol.mem[mi], xc, xc <= 1e-9 ? 1 : -1); c.N = f.N; c.M = f.M; c.V = f.V; c.sN = sigN(f.N, ms.sec); c.kM = sigK(f.M, ms.sec); }
        seg(P(-hu, -hv), P(-hu, hv), k); seg(P(-hu, hv), P(hu, hv), k); seg(P(hu, hv), P(hu, -hv), k); seg(P(hu, -hv), P(-hu, -hv), k);
        quad(G, P(-hu, -hv), P(-hu, hv), P(hu, hv), P(hu, -hv), [...load, 0.2], c.t);
        cutAt = { c, sec, ms };
      }
    });
    /* the line of the open tab: a clear sheet in the plane of the frame, from the axis to its value */
    const key = st.focus;
    if (ok && key !== 'D' && !st.zero[key] && !st.flat[key]) {
      const [lo, hi] = st.ext[key], kw = 0.17 * size / Math.max(-lo, hi, 1e-12), base = key === 'M' ? rgb(C.cM) : key === 'V' ? rgb(C.cV) : null;
      MS.forEach((ms, mi) => {
        if (key === 'N' && barStyle(mi)) return;   /* a bar says its force by its colour */
        const S = ms.sta, off = s => add(s.p, mul(s.z, s[key] * kw)), kc = s => (base || (s.N >= 0 ? tens : comp));
        for (let i = 0; i + 1 < S.length; i++) {
          const a = S[i], b = S[i + 1], oa = off(a), ob = off(b), ca = [...kc(a), 0.2], cb = [...kc(b), 0.2];
          vtx(G, a.p, Z, ca); vtx(G, b.p, Z, cb); vtx(G, ob, Z, cb); vtx(G, a.p, Z, ca); vtx(G, ob, Z, cb); vtx(G, oa, Z, ca);
          seg(oa, ob, [...kc(a), 1]);
        }
        seg(S[0].p, off(S[0]), [...kc(S[0]), 1]); seg(S[S.length - 1].p, off(S[S.length - 1]), [...kc(S[S.length - 1]), 1]);
      });
    }
    /* supports */
    const Hat = i => { let h = 0, w = 0; m.members.forEach((mb, mi) => { if (mb.n1 === i || mb.n2 === i) { const s = MS[mi].sec.dim; h = Math.max(h, s[0] / 2000 * Math.abs(MS[mi].e[0])); w = Math.max(w, s[1] / 2000); } }); return [h, w]; };
    const sup = mix(ink, bg, dark ? 0.25 : 0.2), plate = mix(ink, bg, dark ? 0.5 : 0.62);
    let yg = y0;
    nd.forEach((n, i) => {
      if (!n.sup || n.sup === 'free') return;
      const [h, w] = Hat(i), zh = w + 0.07 * U;
      if (n.sup === 'fixed') {
        const d = memberDir(i), dir = norm([d.x, -d.y, 0]), upv = [dir[1], -dir[0], 0], t = 0.1 * U;
        const mi = m.members.findIndex(mb => mb.n1 === i || mb.n2 === i), hh = MS[mi].sec.dim[0] / 2000 + 0.16 * U;
        block(T, sub([n.x, n.y, 0], mul(dir, t)), dir, upv, Z, t, hh, zh + 0.09 * U, plate);
        yg = Math.min(yg, n.y - Math.abs(dir[0]) * hh - Math.abs(dir[1]) * 2 * t);
        return;
      }
      const hs = 0.34 * U, ws = 0.2 * U, rr = 0.045 * U, ax = [n.x, n.y - h, 0], hw = n.sup === 'roller' ? hs - 2 * rr : hs;
      const A = z => [ax[0], ax[1], z], Bl = z => [ax[0] - ws, ax[1] - hw, z], Br = z => [ax[0] + ws, ax[1] - hw, z];
      tri(T, A(zh), Bl(zh), Br(zh), sup, Z); tri(T, A(-zh), Br(-zh), Bl(-zh), sup, [0, 0, -1]);
      quad(T, A(-zh), A(zh), Br(zh), Br(-zh), sup); quad(T, A(zh), A(-zh), Bl(-zh), Bl(zh), sup); quad(T, Bl(-zh), Br(-zh), Br(zh), Bl(zh), sup);
      if (n.sup === 'roller') for (const dx of [-0.11 * U, 0.11 * U]) bar(T, [ax[0] + dx, ax[1] - hs + rr, -zh], [ax[0] + dx, ax[1] - hs + rr, zh], rr, rr, mix(ink, bg, 0.45));
      block(T, [ax[0], ax[1] - hs - 0.02 * U, 0], [1, 0, 0], [0, 1, 0], Z, 0.3 * U, 0.02 * U, zh + 0.1 * U, plate);
      yg = Math.min(yg, ax[1] - hs - 0.04 * U);
    });
    /* hinges: a pin through the joint */
    nd.forEach((n, i) => { if (n.hinge) { const w = Hat(i)[1] + 0.05 * U; bar(T, [n.x, n.y, -w], [n.x, n.y, w], 0.035 * U, 0.035 * U, mix(ink, bg, 0.1)); } });
    /* point loads: an arrow that ends on the face of the member */
    if (ok) for (const ld of m.loads) {
      const ms = MS[ld.m]; if (!ms) continue;
      const s = at(ms.sta, clamp(ld.a, 0, ms.L)), r = ld.ang * Math.PI / 180, d = [Math.cos(r), Math.sin(r), 0], Hh = ms.sec.dim[0] / 2000;
      arrow(T, sub(s.p, mul(d, Hh * Math.abs(dot(d, s.z)) + 0.01)), d, clamp(0.64 * (ld.P / m.pref) ** 0.55, 0.26, 1.28) * U, 0.022 * U, load);
    }
    /* distributed loads: a row of arrows under a bar, and a clear sheet behind them */
    if (ok) m.members.forEach((mb, mi) => {
      const u = mb.udl; if (!u.on || !(Math.max(u.w1, u.w2) > 0)) return;
      const ms = MS[mi], r = u.ang * Math.PI / 180, d = [Math.cos(r), Math.sin(r), 0], Hh = ms.sec.dim[0] / 2000, par = Math.abs(dot(d, ms.e)) > 0.97;
      const cnt = clamp(Math.round(ms.L / (0.55 * U)), 3, 24), hOf = w => clamp(0.14 + 0.26 * (Math.abs(w) / m.wref) ** 0.6, 0.16, 0.62) * U;
      let prevT = null, prevB = null;
      for (let i = 0; i <= cnt; i++) {
        const f = i / cnt, s = at(ms.sta, ms.L * f), w = lerp(u.w1, u.w2, f), h = w > 0 ? hOf(w) : 0;
        /* a load along the member lies beside it, on the side away from the dashed one */
        const foot = par ? sub(s.p, mul(s.z, Hh + 0.1 * U)) : sub(s.p, mul(d, Hh * Math.abs(dot(d, s.z)) + 0.01)), tail = par ? foot : sub(foot, mul(d, h));
        if (par) { if (w > 0 && i < cnt) arrow(T, add(foot, mul(d, 0.2 * U)), d, 0.4 * U * (0.5 + 0.5 * w / Math.max(u.w1, u.w2)), 0.013 * U, load); }
        else if (h > 0.02) arrow(T, foot, d, h, 0.011 * U, load);
        if (!par && prevT) { seg(prevT, tail, [...load, 1]); const c = [...load, 0.13]; vtx(G, prevB, Z, c); vtx(G, foot, Z, c); vtx(G, tail, Z, c); vtx(G, prevB, Z, c); vtx(G, tail, Z, c); vtx(G, prevT, Z, c); }
        prevT = tail; prevB = foot;
      }
    });
    /* the ground: a net in the plane under the supports */
    { const step = size > 16 ? 2 : 1, pad = Math.max(1.5, 0.22 * size), gx0 = Math.floor((x0 - pad) / step) * step, gx1 = Math.ceil((x1 + pad) / step) * step, gz = Math.ceil(pad / step) * step, y = yg - 0.004, k = [...rgb(C.mute), dark ? 0.3 : 0.26];
      for (let x = gx0; x <= gx1 + 1e-9; x += step) seg([x, y, -gz], [x, y, gz], k);
      for (let z = -gz; z <= gz + 1e-9; z += step) seg([gx0, y, z], [gx1, y, z], k); }
    nd.forEach((n, i) => { if (n.lbl) { const [h] = Hat(i); labels.push({ p: [n.x, n.y + Math.max(h, 0.1) + 0.2 * U, 0], t: n.lbl, font: `600 14px ${UI}`, col: C.ink }); } });
    /* the box the view must show: the structure with its supports, the loads above it and the line of the open tab */
    const hang = ok && key !== 'D' && !st.zero[key] && !st.flat[key] ? 0.17 * size + 0.1 : 0.3, bx = [x0 - 0.45 * U - (y1 - y0 > 1e-9 ? hang : 0), x1 + 0.45 * U + (y1 - y0 > 1e-9 ? hang : 0)], by = [Math.min(yg, y0 - hang), y1 + Math.max(0.75 * U, hang)], bz = 0.3 * U + 0.15;
    const box = []; for (const X_ of bx) for (const Y_ of by) for (const Z_ of [-bz, bz]) box.push([X_, Y_, Z_]);
    scene = { T: done(T), G: done(G), L: done(L), labels, c: [(bx[0] + bx[1]) / 2, (by[0] + by[1]) / 2, 0], box, size, mag, smax, tmax, ok, detail: null };
    /* The member cut open, seen near: the part before the cut, and on its cut face the body of the normal stress. Over
       each part of the section stands a block as long as the stress at its fibres is large, tension in one colour and
       compression in the other; the arrows say which way the stress acts on the face: away from it is tension. The
       block of the largest stress of the structure is as long as its section is deep */
    if (cutAt) {
      fresh();
      const { c, sec, ms } = cutAt, lab2 = [], pts = [], back = clamp(2 * sec.H, 0.2, 0.8), x = c.x, from = Math.max(0, x - back), plain = () => steel;
      const part = [at(ms.sta, from)].concat(ms.sta.filter(s => s.x > from + 1e-9 && s.x < x - 1e-9), [c]);
      /* the part before the cut; a cut at the very start of a member shows its face alone */
      /* in plain steel: here the colours belong to the body of the stress */
      if (x - from > 1e-6) { body(T, part, sec, plain, 1, true, true); edges(part, sec, edge, true); }
      else { body(T, [c, { ...c, p: add(c.p, mul(c.t, 0.002)) }], sec, plain, 1, true, true); }
      const P = (u, v, s) => add(add(add(c.p, mul(c.z, u)), mul(Z, v)), mul(c.t, s));
      let far = 0;
      if (key === 'V') {
        /* Tab shear: the body of the shear stress. It stands on the web and, low, on the flanges: as long at each fibre
           as τ is large there, largest at the middle of the web. The stress itself acts in the face, along the web: the
           arrow beside the web shows which way. The body of the largest τ of the structure is as long as its section is deep */
        const kt = tmax > 1e-9 ? 2 * sec.H / tmax : 0, tv = rgb(C.cV), col = [...tv, 0.42], ln = [...tv, 1], hw = sec.H - sec.tf, n = 16, tOf = u => Math.abs(tau(c.V, ms.sec, u)) * kt;
        const strip = (u0, u1, w, e0, e1) => {   /* a piece of the body between two fibres, with the lengths e0 and e1 */
          far = Math.max(far, e0, e1);
          for (const v of [-w, w]) pts.push(P(u0, v, 0), P(u1, v, 0), P(u0, v, e0), P(u1, v, e1));
          quad(G, P(u0, -w, e0), P(u0, w, e0), P(u1, w, e1), P(u1, -w, e1), col); quad(G, P(u0, w, 0), P(u1, w, 0), P(u1, w, e1), P(u0, w, e0), col); quad(G, P(u1, -w, 0), P(u0, -w, 0), P(u0, -w, e0), P(u1, -w, e1), col);
          for (const v of [-w, w]) seg(P(u0, v, e0), P(u1, v, e1), ln);
        };
        for (let i = 0; i < n; i++) { const u0 = -hw + 2 * hw * i / n, u1 = -hw + 2 * hw * (i + 1) / n; strip(u0, u1, sec.t, tOf(u0 * 0.999999), tOf(u1 * 0.999999)); }
        for (const sgn_ of [-1, 1]) for (let i = 0; i < 3; i++) { const u0 = sgn_ * (hw + sec.tf * i / 3), u1 = sgn_ * (hw + sec.tf * (i + 1) / 3); strip(Math.min(u0, u1), Math.max(u0, u1), sec.B2, tOf(Math.min(u0, u1) * (sgn_ < 0 ? 0.999999 : 1.000001)), tOf(Math.max(u0, u1) * (sgn_ < 0 ? 1.000001 : 0.999999))); }
        for (const u of [-hw, hw]) for (const v of [-sec.t, sec.t]) seg(P(u, v, 0), P(u, v, tOf(u * 0.999999)), ln);
        const tm = tau(c.V, ms.sec, 0), [S0, t0] = firstMoment(ms.sec, 0);
        /* which way it acts on this face: with a positive V toward the dashed side */
        if (Math.abs(tm) * kt > 0.1 * sec.H) { const sg = c.V >= 0 ? 1 : -1; arrow(T, P(sg * 0.5 * hw, 0.55 * sec.B2, 0.004), mul(c.z, sg), hw, 0.05 * sec.H, mix(tv, ink, 0.25)); }
        lab2.push({ p: P(0, 0, Math.abs(tm) * kt), t: `τ = ${n1(Math.abs(tm))} N/mm²`, font: `600 13px ${UI}`, col: C.cV, out: 'beside' });
        info = { mi: cut.mi, x, N: c.N, M: c.M, V: c.V, tau: tm, S: S0, t: t0, I: ms.sec.I, kind: 'tau', name: memName(cut.mi), sec: ms.sec.name };
      } else {
        const sig = u => c.sN + c.kM * u, ks = smax > 1e-9 ? 2 * sec.H / smax : 0, parts = [];
        for (const [u0, u1, w] of sec.rects) {
          const s0 = sig(u0), s1 = sig(u1);
          if (s0 * s1 < 0) { const uz = u0 - s0 * (u1 - u0) / (s1 - s0); parts.push([u0, uz, w], [uz, u1, w]); } else parts.push([u0, u1, w]);
        }
        for (const [u0, u1, w] of parts) {
          const sm = sig((u0 + u1) / 2), kc = sm >= 0 ? tens : comp, col = [...kc, 0.36], ln = [...kc, 1], l0 = Math.abs(sig(u0)) * ks, l1 = Math.abs(sig(u1)) * ks;
          if (Math.max(l0, l1) < 1e-6) continue;
          far = Math.max(far, l0, l1);
          for (const v of [-w, w]) pts.push(P(u0, v, 0), P(u1, v, 0), P(u0, v, l0), P(u1, v, l1));
          quad(G, P(u0, -w, l0), P(u0, w, l0), P(u1, w, l1), P(u1, -w, l1), col);
          quad(G, P(u0, -w, 0), P(u0, w, 0), P(u0, w, l0), P(u0, -w, l0), col); quad(G, P(u1, -w, l1), P(u1, w, l1), P(u1, w, 0), P(u1, -w, 0), col);
          quad(G, P(u0, w, 0), P(u1, w, 0), P(u1, w, l1), P(u0, w, l0), col); quad(G, P(u1, -w, 0), P(u0, -w, 0), P(u0, -w, l0), P(u1, -w, l1), col);
          for (const v of [-w, w]) { seg(P(u0, v, l0), P(u1, v, l1), ln); seg(P(u0, v, 0), P(u0, v, l0), ln); seg(P(u1, v, 0), P(u1, v, l1), ln); }
          seg(P(u0, -w, l0), P(u0, w, l0), ln); seg(P(u1, -w, l1), P(u1, w, l1), ln);
        }
        /* arrows: in the middle of each flange and at two places of the web */
        for (const u of [-(sec.H - sec.tf / 2), -0.5 * sec.H, 0.5 * sec.H, sec.H - sec.tf / 2]) {
          const sg = sig(u), len = Math.abs(sg) * ks;
          if (len < 0.2 * sec.H) continue;
          const k = mix(sg >= 0 ? tens : comp, ink, 0.25), r = 0.05 * sec.H;
          if (sg >= 0) arrow(T, P(u, 0, len), c.t, len * 0.96, r, k); else arrow(T, P(u, 0, 0.003), mul(c.t, -1), len * 0.96, r, k);
        }
        /* the neutral fibre, where the stress is zero: a line across the face */
        if (Math.abs(c.kM) > 1e-9) { const uz = -c.sN / c.kM; if (Math.abs(uz) < sec.H) { seg(P(uz, -sec.B2 - 0.03, 0.002), P(uz, sec.B2 + 0.03, 0.002), [...ink, 1]); lab2.push({ p: P(uz, 0, 0), t: 'σ = 0', font: `13px ${UI}`, col: C.mute, gap: { t: P(uz, 0, 0.1), u: P(uz + 0.1, 0, 0), k: Math.abs(c.kM) * ks } }); } }   /* in the gap between the two bodies, which are thin beside this fibre */
        const top = sig(-sec.H), bot = sig(sec.H), sgn = v => (v > 0 && n1(v) !== '0.0' ? '+' : '') + n1(v), word = v => (n1(v) === '0.0' ? '' : v > 0 ? ', tension' : ', compression');
        const O = P(0, 0, 0);
        if (n1(top) === n1(bot)) lab2.push({ p: P(0, sec.B2, Math.abs(top) * ks), t: `σ = ${sgn(top)} N/mm²${word(top)}`, font: `600 13px ${UI}`, col: top >= 0 ? C.cT : C.cC, out: [O, O] });
        else {
          lab2.push({ p: P(-sec.H, 0, Math.abs(top) * ks), t: `σ = ${sgn(top)} N/mm²${word(top)}`, font: `600 13px ${UI}`, col: top >= 0 ? C.cT : C.cC, out: [O, P(-sec.H, 0, 0)] });
          lab2.push({ p: P(sec.H, 0, Math.abs(bot) * ks), t: `σ = ${sgn(bot)} N/mm²${word(bot)}`, font: `600 13px ${UI}`, col: bot >= 0 ? C.cT : C.cC, out: [O, P(sec.H, 0, 0)] });
        }
        info = { mi: cut.mi, x, N: c.N, M: c.M, V: c.V, top, bot, sN: c.sN, sM: c.kM * sec.H, kind: 'sigma', name: memName(cut.mi), sec: ms.sec.name, A: ms.sec.A, W: sectionMore(ms.sec).W };
      }
      const len = Math.min(back, x), box2 = [];
      for (const s_ of [-len, far + 0.02]) for (const u of [-sec.H - 0.06, sec.H + 0.06]) for (const v of [-sec.B2 - 0.02, sec.B2 + 0.02]) box2.push(P(u, v, s_));
      scene.detail = { T: done(T), G: done(G), L: done(L), labels: lab2, pts, c: add(c.p, mul(c.t, (far - len) / 2)), box: box2 };
    }
  }

  /* ---- WebGL ---- */
  /* the program and the buffers of the picture; made again when the browser has taken the drawing surface away and given it back */
  function setup() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) failed = 'The 3D picture could not be set up in this browser.'; return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;attribute vec4 k;uniform mat4 m;varying vec4 c;varying vec3 w;void main(){gl_Position=m*vec4(p,1.);w=n;c=k;}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec4 c;varying vec3 w;uniform vec3 l;uniform vec3 f;uniform float lit;void main(){float d=1.;if(lit>.5){vec3 q=normalize(w);float a=dot(q,l),b=dot(q,f);if(lit>1.5){a=abs(a);b=abs(b);}d=.46+.44*max(a,0.)+.16*max(b,0.);}gl_FragColor=vec4(c.rgb*d,c.a);}'));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { failed = failed || 'The 3D picture could not be set up in this browser.'; return; }
    gl.useProgram(pr);
    loc = { p: gl.getAttribLocation(pr, 'p'), n: gl.getAttribLocation(pr, 'n'), k: gl.getAttribLocation(pr, 'k'), m: gl.getUniformLocation(pr, 'm'), l: gl.getUniformLocation(pr, 'l'), f: gl.getUniformLocation(pr, 'f'), lit: gl.getUniformLocation(pr, 'lit'), bp: gl.createBuffer(), bn: gl.createBuffer(), bk: gl.createBuffer() };
  }
  function init() {
    host = q('#v3'); cv = q('#cv3'); lab = q('#cv3t'); lx = lab.getContext('2d');
    gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl');
    if (!gl) { failed = 'This browser does not draw 3D here (WebGL is off).'; return; }
    setup();
    if (failed) return;
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
    cv.addEventListener('webglcontextrestored', () => { lost = false; setup(); moved = true; });
    /* turning, moving, bringing nearer; the wheel and two fingers work on the part of the view they are over */
    let drag = null;
    const pts = new Map(), part = e => (views[1] && e.offsetY >= views[1][1] ? 'zd' : 'zoom');
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 || e.button === 1, d: 0, k: part(e) }; e.preventDefault(); });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !drag) return;
      if (pts.size === 2) {
        const o = [...pts.entries()].find(p => p[0] !== e.pointerId)[1], d = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
        if (drag.d) cam[drag.k] = clamp(cam[drag.k] * d / drag.d, 0.35, 12);
        drag.d = d; pts.set(e.pointerId, [e.clientX, e.clientY]); moved = true; return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (drag.pan) { cam.px -= dx / H3 * 1.6; cam.py += dy / H3 * 1.6; } else { cam.yaw -= dx * 0.008; cam.pitch = clamp(cam.pitch + dy * 0.008, -1.45, 1.45); }
      moved = true;
    });
    const end = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; else if (drag) drag.d = 0; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { const k = part(e); cam[k] = clamp(cam[k] * Math.exp(-e.deltaY * 0.0012), 0.35, 12); moved = true; e.preventDefault(); }, { passive: false });
    cv.addEventListener('dblclick', () => { Object.assign(cam, START); moved = true; });
    q('#v3x').addEventListener('click', () => { cut = null; info = null; dirty = true; });
    new ResizeObserver(size).observe(host);
  }
  function size() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    W3 = r.width; H3 = r.height; dp = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [cv, lab]) { c.width = Math.round(W3 * dp); c.height = Math.round(H3 * dp); }
    moved = true;
  }
  function pass(B, mode, lit) {
    if (!B.n) return;
    gl.uniform1f(loc.lit, lit);
    gl.bindBuffer(gl.ARRAY_BUFFER, loc.bp); gl.bufferData(gl.ARRAY_BUFFER, B.p, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, loc.bn); gl.bufferData(gl.ARRAY_BUFFER, B.nn, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, loc.bk); gl.bufferData(gl.ARRAY_BUFFER, B.k, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc.k); gl.vertexAttribPointer(loc.k, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(mode, 0, B.n);
  }
  const write = (t, x, y, font, col, align = 'center') => { lx.font = font; lx.textAlign = align; lx.lineWidth = 4; lx.strokeStyle = C.bg; lx.strokeText(t, x, y); lx.fillStyle = col; lx.fillText(t, x, y); };
  /* a text broken into the lines its room takes */
  function wrap(t, font, room) {
    lx.font = font;
    const out = []; let line = '';
    for (const w of t.split(' ')) { const tryL = line ? `${line} ${w}` : w; if (line && lx.measureText(tryL).width > room) { out.push(line); line = w; } else line = tryL; }
    if (line) out.push(line);
    return out;
  }
  /* lines written downward from y, or upward so that the last one stands at y; returns the height they take */
  function para(t, x, y, font, col, room, upward) {
    const L_ = wrap(t, font, room);
    L_.forEach((l, i) => write(l, x, upward ? y - (L_.length - 1 - i) * 17 : y + i * 17, font, col, 'left'));
    return L_.length * 17;
  }
  /* one part of the view: a scene seen from eye toward tgt, in the box vp of the picture, with its words */
  function show(S, vp, eye, tgt, fov, dist) {
    const [vx, vy, vw, vh] = vp, m = mat(persp(fov, vw / vh, Math.max(0.02, dist / 80), dist * 8 + 60), look(eye, tgt, [0, 1, 0]));
    gl.viewport(Math.round(vx * dp), Math.round((H3 - vy - vh) * dp), Math.round(vw * dp), Math.round(vh * dp));
    gl.uniformMatrix4fv(loc.m, false, m);
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); pass(S.T, gl.TRIANGLES, 1); gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    pass(S.L, gl.LINES, 0);
    gl.depthMask(false); pass(S.G, gl.TRIANGLES, 2); gl.depthMask(true);
    const proj = p => { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return w <= 0 ? null : [vx + (1 + (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w) / 2 * vw, vy + (1 - (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w) / 2 * vh]; };
    const put3 = [];
    /* The words of the body of the stress stand outside that body, so that no edge of it runs through them: the stress of
       a fibre above the body, or under it where that fibre is the lower one on the screen; the shear stress beside it.
       S.body is the rectangle of the body on the screen */
    const bp = (S.pts || []).map(proj).filter(Boolean);
    S.body = bp.length ? [Math.min(...bp.map(q => q[0])), Math.min(...bp.map(q => q[1])), Math.max(...bp.map(q => q[0])), Math.max(...bp.map(q => q[1]))] : null;
    for (const l of S.labels) { const p = proj(l.p); if (!p) continue; lx.font = l.font; const hw = lx.measureText(l.t).width / 2 + 6;
      let x = p[0] + (l.dx || 0), y = p[1] + (l.dy || 0), dir = 0;
      if (l.out && S.body) {
        if (l.out === 'beside') x = S.body[2] + hw + 2;
        else { const a = proj(l.out[0]), b = proj(l.out[1]), down = a && b && b[1] - a[1] > 0.5 * Math.hypot(b[0] - a[0], b[1] - a[1]); dir = down ? 1 : -1; y = down ? S.body[3] + 13 : S.body[1] - 12; }
      }
      /* the word of the fibre without stress: before the cut face, on the line of that fibre, as far out as the gap between
         the two bodies needs to be open for it. The bodies grow from that fibre by k metres for each metre across */
      if (l.gap) { const pt = proj(l.gap.t), pu = proj(l.gap.u);
        if (pt && pu) { const lt = Math.hypot(pt[0] - p[0], pt[1] - p[1]) || 1, lu = Math.hypot(pu[0] - p[0], pu[1] - p[1]) || 1, tx = (pt[0] - p[0]) / lt, ty = (pt[1] - p[1]) / lt, ux = (pu[0] - p[0]) / lu, uy = (pu[1] - p[1]) / lu;
          const hu = Math.abs(ux) * hw + Math.abs(uy) * 7.5, ht = Math.abs(tx) * hw + Math.abs(ty) * 7.5, D = l.gap.k * (lt / lu) * (hu + 2) + ht + 2;
          x = p[0] + tx * D; y = p[1] + ty * D; } }
      put3.push({ l, hw, dir, x: clamp(x, vx + hw, vx + vw - hw), y: clamp(y, vy + (S.head || 12), vy + vh - (S.foot || 12)) }); }
    /* two words that would lie on each other move apart, one up and one down; two that stand above the body of the stress
       (or two under it) keep the nearer one in its place and move the other farther from the body */
    for (let k = 0; k < 3; k++) for (let i = 0; i < put3.length; i++) for (let j = i + 1; j < put3.length; j++) {
      const a = put3[i], b = put3[j];
      if (Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < 17) { const hi = a.y <= b.y ? a : b, lo = hi === a ? b : a, d = (17 - Math.abs(a.y - b.y)) / 2 + 1;
        if (hi.dir < 0 && lo.dir < 0) hi.y -= 2 * d; else if (hi.dir > 0 && lo.dir > 0) lo.y += 2 * d; else { hi.y -= d; lo.y += d; } }
    }
    for (const w of put3) write(w.l.t, w.x, w.y, w.l.font, w.l.col);
    S.wrote = put3.map(w => [w.l.t, Math.round(w.x), Math.round(w.y), Math.round(w.hw)]);
  }
  /* how far the eye stands from the middle c of a box so that all its corners are in the picture, with a margin */
  function away(c, box, dir, right, upv, fov, asp, room) {
    const t = Math.tan(fov / 2) * room;
    let d = 0.5;
    for (const p of box) { const r = sub(p, c), z = dot(r, dir); d = Math.max(d, z + Math.abs(dot(r, right)) / (t * asp), z + Math.abs(dot(r, upv)) / t); }
    return d;
  }
  function render() {
    const s = scene, bgc = rgb(C.bg), d = s.detail, fov = 0.5, pad = 14;
    /* with a cut the view has two parts: the structure above, the cut member near below */
    const hd = d ? Math.round(H3 * 0.5) : 0, hs = H3 - hd;
    views = d ? [[0, 0, W3, hs], [0, hs, W3, hd]] : [[0, 0, W3, hs]];
    const cp = Math.cos(cam.pitch), dir = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp], right = norm(cross([0, 1, 0], dir)), upv = cross(dir, right);
    gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(bgc[0], bgc[1], bgc[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.uniform3fv(loc.l, norm([0.32, 0.82, 0.48])); gl.uniform3fv(loc.f, norm([-0.6, 0.25, -0.5]));
    lx.setTransform(dp, 0, 0, dp, 0, 0); lx.clearRect(0, 0, W3, H3); lx.textBaseline = 'middle'; lx.lineJoin = 'round';
    /* the structure: far enough to see all of it as the view starts */
    { const dist = away(s.c, s.box, dir, right, upv, fov, W3 / hs, 0.92) / cam.zoom;
      const tgt = add(add(s.c, mul(right, cam.px * dist * 0.5)), mul(upv, cam.py * dist * 0.5));
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, Math.round(hd * dp), cv.width, cv.height - Math.round(hd * dp));
      show(s, views[0], add(tgt, mul(dir, dist)), tgt, fov, dist); }
    const room = W3 - 2 * pad;
    if (d) {
      /* the head of the cut: where, and its two edge values worked out from N/A and M/W; the words below keep under it */
      lx.strokeStyle = C.line; lx.lineWidth = 1; lx.beginPath(); lx.moveTo(0, hs + 0.5); lx.lineTo(W3, hs + 0.5); lx.stroke();
      let y = hs + 18;
      const tv = info.kind === 'tau';
      y += para(`Cut at x = ${n2(info.x)} m of ${info.name.replace('Member ', '')}, ${info.sec}: ${tv ? `V = ${n1(info.V)} kN` : `M = ${n1(info.M)} kNm, N = ${n1(info.N)} kN`}`, pad, y, `600 13px ${UI}`, C.ink, room - 110);
      y += para(tv ? `τ = V·S/(I·t) = ${n1(Math.abs(info.tau))} N/mm² at the middle of the web (S = ${n1(info.S)} cm³, t = ${n1(info.t)} mm)`
        : `σ = N/A ± M/W = ${n1(info.sN)} ± ${n1(Math.abs(info.sM))} N/mm² (A = ${n1(info.A)} cm², W = ${info.W >= 1000 ? Math.round(info.W) : n1(info.W)} cm³)`, pad, y + 2, `13px ${UI}`, C.ink, room - 110);
      const fh = para(tv ? 'The body is the size of the shear stress; it acts along the web (arrow).' : 'The body is the normal stress; an arrow away from the face is tension.', pad, H3 - 13, `13px ${UI}`, C.mute, room, true);
      /* the cut member has the room between the head and the foot */
      const top = y - hs + 4, vp = [0, hs + top, W3, Math.max(60, hd - top - fh - 12)];
      const dist = away(d.c, d.box, dir, right, upv, fov, vp[2] / vp[3], 0.9) / cam.zd;
      gl.scissor(0, 0, cv.width, Math.round(hd * dp)); gl.clear(gl.DEPTH_BUFFER_BIT);
      show(d, vp, add(d.c, mul(dir, dist)), d.c, fov, dist);
    }
    gl.disable(gl.SCISSOR_TEST);
    /* at the foot of the structure: the factor of the bent shape and how to turn the view; above it what the colours say */
    let yb = hs - 13;
    yb -= para([s.mag ? `Bent shape drawn ×${s.mag >= 100 ? Math.round(s.mag / 10) * 10 : s.mag >= 10 ? Math.round(s.mag) : s.mag >= 1 ? r1(s.mag) : +s.mag.toPrecision(2)}.` : '', 'Drag: turn. Shift + drag: move. Wheel: nearer.'].filter(Boolean).join(' '), pad, yb, `13px ${UI}`, C.mute, room, true);
    if (s.ok && s.smax > 1e-9) {
      const w = Math.min(150, room), y = yb - 23, g = lx.createLinearGradient(pad, 0, pad + w, 0), steel = darkNow() ? 'rgb(143,156,173)' : 'rgb(176,186,201)';
      g.addColorStop(0, C.cC); g.addColorStop(0.5, steel); g.addColorStop(1, C.cT);
      lx.fillStyle = g; lx.beginPath(); lx.roundRect(pad, y, w, 8, 4); lx.fill();
      write(`−${n1(s.smax)}`, pad, y + 19, `13px ${UI}`, C.mute, 'left'); write('0', pad + w / 2, y + 19, `13px ${UI}`, C.mute); write(`+${n1(s.smax)}`, pad + w, y + 19, `13px ${UI}`, C.mute, 'right');
      if (room >= 420) { write('Colour: normal stress σ in N/mm²,', pad + w + 14, y + 4, `13px ${UI}`, C.mute, 'left'); write('compression −, tension +', pad + w + 14, y + 19, `13px ${UI}`, C.mute, 'left'); }
      else write('Colour: σ in N/mm²', pad, y - 13, `13px ${UI}`, C.mute, 'left');
    }
    if (!s.ok) write('Unstable: the structure is a mechanism', W3 / 2, 26, `600 14px ${UI}`, C.bad);
    else if (!d) para('Move the mouse along a member on the sheet: the member is cut open there.', pad, 18, `13px ${UI}`, C.mute, room);
    const xb = q('#v3x'); xb.hidden = !d; if (d) xb.style.top = `${hs + 10}px`;
  }
  function tick() {
    if (!on) return;
    if (!gl && !failed) { init(); size(); }
    if (failed) { host.dataset.msg = failed; return; }
    if (!W3 || !st.sol) return;
    if (st.probeRead && (!cut || cut.mi !== st.probeRead.mi || Math.abs(cut.a - st.probeRead.a) > 1e-9)) { cut = { mi: st.probeRead.mi, a: st.probeRead.a }; dirty = true; }
    if (dirty) { build(); dirty = false; moved = true; }
    if (moved && scene && !lost) { render(); moved = false; }
  }
  function set(v) {
    on = !!v;
    q('.app').toggleAttribute('data-v3', on); q('#v3d').setAttribute('aria-pressed', on);
    dirty = true;
    if (on) requestAnimationFrame(size);
  }
  return { tick, set, toggle: () => set(!on), mark: () => { dirty = true; }, clear: () => { cut = null; info = null; dirty = true; }, get on() { return on; },
    /* for the checks */
    get state() { return { on, failed, cut, info, ok: scene ? scene.ok : null, cam: { ...cam }, views, tris: scene ? scene.T.n / 3 : 0, clear: scene ? scene.G.n / 3 : 0, lines: scene ? scene.L.n / 2 : 0, smax: scene ? scene.smax : 0, tmax: scene ? scene.tmax : 0, mag: scene ? scene.mag : 0, labels: scene ? scene.labels.map(l => l.t).concat(scene.detail ? scene.detail.labels.map(l => l.t) : []) : [],
      body: scene && scene.detail ? scene.detail.body || null : null, wrote: scene && scene.detail ? scene.detail.wrote || null : null }; },
    section, sigN, sigK, firstMoment, tau };
})();
if (typeof module !== 'undefined') module.exports = { V3 };
