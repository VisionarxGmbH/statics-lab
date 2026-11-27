/* Every arrangement of supports and hinges that the page allows in its 16 examples, each with every section:
   stable or mechanism as the page's solver says it, for comparison with the independent solver (compare_configs.py).
   For a mechanism also the changes that the page names to make it stable (FS.remedies), section by section.
   and the free movements as the page tells them apart (FS.movements), section by section.
   With a seed every arrangement gets random lengths (the page's own stretch of the steps of the grid of the joints, 0.5
   to 30 m) and random profiles of single members: stable or mechanism, the named changes and the free movements must
   come out for any lengths and profiles.
   A member with a profile of its own keeps that profile under each of the seven sections of the structure: its two
   stiffness factors are set again for every section, as the page does before an analysis (applySections; review 10,
   C118: the factors of one section were kept for the other six, which gave stiffnesses of no profile of the list).
   The file names the profile of such a member and holds no factor: the independent solver works its own out.
   usage: node dump_configs.js <out.json> [seed] */
const path = require('path'), fs = require('fs');
const SRC = path.join(__dirname, '..', '..', 'src') + path.sep;
global.FS = require(SRC + 'solver.js');
const { SECTIONS, PRESETS, buildModel, sectionEI, sectionEA, memLen, applySections } = require(SRC + 'presets.js');
const vary = require(path.join(__dirname, '..', 'vary.js'));
let seed = +process.argv[3] || 0, varied = 0, runs = 0, alien = 0;
const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;
const SUPS = ['fixed', 'pin', 'roller', 'free'], out = [];
for (const p of PRESETS) {
  const base = buildModel(p), cs = base.nodes.map((n, i) => (n.cs ? i : -1)).filter(i => i >= 0), ch = base.nodes.map((n, i) => (n.ch ? i : -1)).filter(i => i >= 0);
  const nS = SUPS.length ** cs.length, nH = 2 ** ch.length;
  for (let a = 0; a < nS; a++) for (let b = 0; b < nH; b++) {
    const m = buildModel(p);
    cs.forEach((ni, k) => { m.nodes[ni].sup = SUPS[Math.floor(a / SUPS.length ** k) % SUPS.length]; });
    ch.forEach((ni, k) => { m.nodes[ni].hinge = !!((b >> k) & 1); });
    /* counted from what the arrangement ends with: a step with another length than in the example, a member with a profile other than that of the structure */
    if (seed) { vary.lengths(m, rnd, 0.6); const si = Math.floor(rnd() * SECTIONS.length); vary.profiles(m, rnd, si, 0.5); if (vary.steps(m, base)[0] || vary.ownProfile(m, si)) varied++; }
    /* every section of the structure in turn, with the factors of the members that have a profile of their own set for it */
    const each = fn => SECTIONS.map((sec, gi) => { applySections(m, gi); return fn(sec); });
    const ok = each(sec => !!FS.analyse(m, sectionEI(sec), sectionEA(sec)).ok);
    /* a stable structure must also give sane numbers: no displacement beyond ten times W L^3 / EI, with W all its loads,
       L the sum of its member lengths and EI the smallest bending stiffness of a member (a cantilever with all the load
       at its tip moves by a third of W L^3 / EI; a mechanism taken for stable would move a million times as far) */
    const big = each(sec => { const r = FS.analyse(m, sectionEI(sec), sectionEA(sec)); return r.ok ? r.max.D : 0; });
    const Ls = m.members.map((q, i) => memLen(m, i)), Wt = m.loads.reduce((t, l) => t + l.P, 0) + m.members.reduce((t, q, i) => t + (q.udl.on ? (q.udl.w1 + q.udl.w2) / 2 * Ls[i] : 0), 0), Lt = Ls.reduce((t, v) => t + v, 0);
    const lim = each(sec => 10 * Wt * Lt ** 3 / (sectionEI(sec) * Math.min(...m.members.map(q => q.kf || 1))));
    const fix = ok.every(Boolean) ? null : each(sec => JSON.stringify(FS.remedies(m, sectionEI(sec), sectionEA(sec))));
    /* the single holds that make a mechanism stable (joint, 0 sideways or 1 vertically): what the one sentence of the panel names */
    const lo = ok.every(Boolean) ? null : each(sec => JSON.stringify((FS.analyse(m, sectionEI(sec), sectionEA(sec)).loose || []).map(o => [o.i, o.d])));
    /* the free movements: what the page says of each (kind, centre, joints, turning members) must not depend on the section */
    const said = q => q && q.map(c => ({ kind: c.kind, about: c.about === undefined ? null : c.about, joints: c.joints.map(j => [j.i, Math.sign(j.dx), Math.sign(j.dy)]), turns: c.turns.map(t => [t.mi, t.about]) }));
    const mv = ok.every(Boolean) ? null : each(sec => FS.movements(JSON.parse(JSON.stringify(m)), sectionEI(sec), sectionEA(sec)));
    /* each pair of I and A that was analysed is a pair of the list: counted for the output */
    each(sec => { for (const q of m.members) { runs++; const I = sec.I * q.kf, A = sec.A * q.ka; if (!SECTIONS.some(o => Math.abs(o.I - I) <= 1e-9 * o.I && Math.abs(o.A - A) <= 1e-9 * o.A)) alien++; } });
    out.push({ preset: p.id, moves: mv && mv[0] && mv[0].map((c, i) => Object.assign(said(mv[0])[i], { t: c.t })), movesNull: !!mv && mv.some(q => !q), movesSame: !mv || mv.every(q => JSON.stringify(said(q)) === JSON.stringify(said(mv[0]))),
      fix: fix && JSON.parse(fix[0]), fixSame: !fix || fix.every(f => f === fix[0]), loose: lo && JSON.parse(lo[0]), looseSame: !lo || lo.every(f => f === lo[0]), model: { nodes: m.nodes.map(n => ({ x: n.x, y: n.y, sup: n.sup, hinge: !!n.hinge, cs: !!n.cs, ch: !!n.ch })), members: m.members.map(q => ({ n1: q.n1, n2: q.n2, sec: q.sec === null || q.sec === undefined ? null : SECTIONS[q.sec].name, rel: q.rel })) }, ok, big, lim, det: FS.determinacy(m), modes: each(sec => FS.analyse(m, sectionEI(sec), sectionEA(sec)).modes || 0) });
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(out.length, 'arrangements x', SECTIONS.length, 'sections' + (process.argv[3] ? `; ${varied} of them with lengths or profiles other than those of the example` : '') + `; members analysed with a second moment of area and an area that are no pair of the list of sections: ${alien} of ${runs}`);
