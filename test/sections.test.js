/* The section values of the page against the dimensions of the sections: I_y and A are worked out from the nominal
   depth h, width b, web t_w, flange t_f and root radius r (mm) and compared with the values the page uses.
   The window of the section also shows the elastic section modulus W_y and the mass G per metre. The page takes
   neither from a table: W_y = I_y / (h/2) with I_y of the dimensions (not cut), G = A x 7850 kg/m3 with the area of
   the table. Both are worked out again here from the dimensions and compared with what the page shows.
   Run: node test/sections.test.js */
const { SECTIONS, sectionMore } = require('../src/presets.js');
/* the table the page takes its values from: ArcelorMittal Europe, Long Products, sales programme for sections and
   merchant bars (copyright year 2023), read on 25.11.2026: I_y in cm4, A in cm2. The programme cuts I_y to four digits. */
const TABLE = { 'IPE 200': [1943, 28.5], 'IPE 240': [3891, 39.1], 'IPE 300': [8356, 53.8], 'IPE 360': [16260, 72.7], 'IPE 400': [23120, 84.5], 'HEB 200': [5696, 78.1], 'HEB 300': [25160, 149.1] };
const DIM = Object.fromEntries(SECTIONS.map(s => [s.name, s.dim]));
const af = 1 - Math.PI / 4, cf = (5 / 6 - Math.PI / 4) / af, jf = (1 - 5 * Math.PI / 16) - af * cf * cf;   // one root fillet of radius 1: area, centroid from the corner, own second moment
function props([h, b, tw, tf, r]) {
  const d = h - 2 * tf;
  const A = 2 * b * tf + d * tw + 4 * af * r * r;
  const I = (b * h ** 3 - (b - tw) * d ** 3) / 12 + 4 * (jf * r ** 4 + af * r * r * (d / 2 - cf * r) ** 2);
  return { A: A / 100, I: I / 1e4 };            // cm2, cm4
}
let pass = 0, fail = 0, worst = 0, more = 0; const Ws = [], Gs = [];
const shown = v => (v >= 1000 ? String(Math.round(v)) : v.toFixed(1));   // four digits, as the window prints W_y
for (const s of SECTIONS) {
  const d = DIM[s.name];
  if (!d) { fail++; console.log(`FAIL ${s.name}: no dimensions`); continue; }
  const p = props(d), eI = Math.abs(p.I - s.I) / s.I, eA = Math.abs(p.A - s.A);
  worst = Math.max(worst, eI);
  const tb = TABLE[s.name], ok = eI <= 5e-4 && eA <= 0.06 && tb && tb[0] === s.I && tb[1] === s.A && p.I >= s.I && p.I - s.I < 10 ** Math.max(0, Math.floor(Math.log10(s.I)) - 3);   // I within 0.05 %, cut to four digits; A to one decimal; equal to the table
  if (ok) pass++; else { fail++; console.log(`FAIL ${s.name}: I ${p.I.toFixed(1)} against ${s.I}, A ${p.A.toFixed(2)} against ${s.A}`); }
  /* W_y and G of the window: within a millionth of the value worked out here; the mass also with the area of the dimensions (to 0.05 kg/m) */
  const mo = sectionMore(s), W = p.I / (d[0] / 20), G = s.A * 0.785;
  if (Math.abs(mo.W - W) <= 1e-6 * W && Math.abs(mo.G - G) <= 1e-9 && Math.abs(mo.G - p.A * 0.785) <= 0.05) more++; else { fail++; console.log(`FAIL ${s.name}: W_y ${mo.W} against ${W}, G ${mo.G} against ${G}`); }
  Ws.push(shown(mo.W)); Gs.push(mo.G.toFixed(1));
  if (process.argv.includes('-v')) console.log(`${s.name}: I_y ${p.I.toFixed(1)} (page ${s.I}) cm4, A ${p.A.toFixed(2)} (page ${s.A}) cm2`);
}
console.log(`${pass} of ${SECTIONS.length} sections: I_y and A are those of the table and follow from the dimensions (I_y cut to four digits, largest difference ${(worst * 100).toFixed(3)} %), ${fail} failed`);
/* The first moment of area S that the 3D view takes for the shear stress τ = V·S/(I·t) (V3.firstMoment), for each
   section, against three things worked out here:
   (1) S at the middle of the section, added up strip by strip over the true outline of the half section, with the root
       fillets as quarter circles (2000 strips over the fillet zone): no formula for a fillet is used;
   (2) twice that S is the plastic section modulus W_pl,y of the section. The seven values of the tables of sections are
       set beside it (cm3): they agree to four digits;
   (3) the shear stress over the whole depth, times the width it acts on, adds up to the shear force: the integral of
       τ·t over the depth is V (the integral of S over the depth is I). Added up over 4000 strips with τ of the page. */
global.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const { V3 } = require('../src/view3d.js');
const WPL = { 'IPE 200': 220.6, 'IPE 240': 366.6, 'IPE 300': 628.4, 'IPE 360': 1019, 'IPE 400': 1307, 'HEB 200': 642.5, 'HEB 300': 1869 };
let sOk = 0, wOk = 0, vOk = 0, sW = 0, vW = 0; const Ss = [];
for (const s of SECTIONS) {
  const [h, b, tw, tf, r] = s.dim, H = h / 2, hw = H - tf;
  /* the width of the section at the distance u from the middle: the web, wider in the fillets, then the flange */
  const width = u => (u >= hw ? b : u <= hw - r ? tw : tw + 2 * (r - Math.sqrt(r * r - (u - (hw - r)) ** 2)));
  let S = 0;
  const strips = (u0, u1, n) => { for (let i = 0; i < n; i++) { const u = u0 + (u1 - u0) * (i + 0.5) / n; S += width(u) * u * (u1 - u0) / n; } };
  strips(0, hw - r, 400); strips(hw - r, hw, 2000); strips(hw, H, 200);
  S /= 1000;   /* cm3 */
  const page = V3.firstMoment(s, 0)[0], eS = Math.abs(page - S) / S, eW = Math.abs(2 * page - WPL[s.name]) / WPL[s.name];
  sW = Math.max(sW, eS);
  if (eS <= 1e-5) sOk++; else { fail++; console.log(`FAIL ${s.name}: S at the middle ${page} cm3 against ${S} cm3 from the outline`); }
  if (eW <= 5e-4) wOk++; else { fail++; console.log(`FAIL ${s.name}: twice S = ${2 * page} cm3 against W_pl,y = ${WPL[s.name]} cm3`); }
  /* the integral of τ·t over the depth for V = 100 kN, with the width the page takes for τ at each fibre */
  let V = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const u = (-H + h * (i + 0.5) / n) / 1000, [, t] = V3.firstMoment(s, u); V += V3.tau(100, s, u) * t * (h / n) / 1000; }   /* N/mm2 x mm x mm = N; / 1000 = kN */
  const eV = Math.abs(V - 100) / 100; vW = Math.max(vW, eV);
  if (eV <= 5e-4) vOk++; else { fail++; console.log(`FAIL ${s.name}: the shear stress adds up to ${V} kN for V = 100 kN`); }
  Ss.push(page.toFixed(1));
}
console.log(`the first moment of area S at the middle of the section, as the 3D view takes it for τ = V·S/(I·t), against the outline of the half section added up in strips: ${sOk} of ${SECTIONS.length} agree (largest difference ${(sW * 100).toFixed(5)} %); in the order of the list: S = ${Ss.join(', ')} cm3`);
console.log(`twice S against the plastic section modulus W_pl,y of the tables of sections (${Object.values(WPL).join(', ')} cm3): ${wOk} of ${SECTIONS.length} agree to four digits; the shear stress over the depth adds up to the shear force (integral of τ·t for V = 100 kN): ${vOk} of ${SECTIONS.length} within 0.05 %, the amount by which the table cuts I_y (largest difference ${(vW * 100).toFixed(3)} %)`);
console.log(`W_y = I_y / (h/2) and G = A x 7850 kg/m3 of the window, worked out again from the dimensions: ${more} of ${SECTIONS.length} agree; as printed, in the order of the list: W_y ${Ws.join(', ')} cm3; G ${Gs.join(', ')} kg/m`);
process.exit(fail ? 1 : 0);
