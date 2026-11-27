/* Random lengths and profiles for a test state, as a user of the page can set them: steps of the grid of the joints get
   another length (the page's own stretch, 0.5 to 30 m), members get a profile of their own (their two stiffness factors
   follow from the two sections, as the page sets them before an analysis).
   rnd: the random numbers of the calling test; si: the place of the section of the structure in SECTIONS. */
const { SECTIONS, gridOf, stretch } = require('../src/presets.js');
const LENGTHS = [0.5, 0.8, 1, 1.6, 2.75, 3.5, 4.2, 6, 7.25, 9, 12.4, 18, 30];
function lengths(m, rnd, share = 0.3) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  let n = 0;
  for (const ax of ['x', 'y']) for (let i = gridOf(m, ax).length - 2; i >= 0; i--) if (rnd() < share) { const g = gridOf(m, ax); stretch(m, ax, g[i], g[i + 1], pick(LENGTHS)); n++; }
  return n;
}
function profiles(m, rnd, si, share = 0.3) {
  let n = 0;
  for (const mb of m.members) { mb.sec = rnd() < share ? Math.floor(rnd() * SECTIONS.length) : null; if (mb.sec !== null) { mb.kf = SECTIONS[mb.sec].I / SECTIONS[si].I; mb.ka = SECTIONS[mb.sec].A / SECTIONS[si].A; n++; } }
  return n;
}
/* What a state ends with, set against its example (ref: the example built again). steps: the steps of the grid whose
   length is not that of the example, [changed, all]. ownProfile: a member has a profile other than that of the
   structure. A step that was given the length it already had, or set back to it, and a member that was given the profile
   of the structure are not counted: nothing in the state differs from the example there. */
function steps(m, ref) {
  let n = 0, all = 0;
  for (const ax of ['x', 'y']) { const g = gridOf(m, ax), h = gridOf(ref, ax); for (let i = 0; i + 1 < h.length; i++) { all++; if (!(Math.abs((g[i + 1] - g[i]) - (h[i + 1] - h[i])) <= 1e-9)) n++; } }
  return [n, all];
}
function ownProfile(m, si) { return m.members.some(q => q.sec !== null && q.sec !== undefined && q.sec !== si); }
module.exports = { lengths, profiles, steps, ownProfile, LENGTHS };
