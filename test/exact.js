/* A decimal reference for the printed lines: the line "with the numbers" is worked out in exact fractions of whole
   numbers (no binary arithmetic) and rounded half away from zero at the printed number of decimals.
   exact(line, d) gives the digits as the page must print them, or null when the line holds a root or a sine. */
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const Q = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const add = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d), mul = (a, b) => Q(a.n * b.n, a.d * b.d), neg = a => Q(-a.n, a.d);
const div = (a, b) => { if (b.n === 0n) throw new Error('division by zero'); return Q(a.n * b.d, a.d * b.n); };
function parse(t) {
  const src = t.replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1').replace(/\s+/g, '');
  if (/√|sin/.test(src)) return null;
  let i = 0;
  const eat = c => (src.startsWith(c, i) ? (i += c.length, true) : false);
  const pow = v => { for (;;) { if (eat('²')) v = mul(v, v); else if (eat('³')) v = mul(v, mul(v, v)); else if (eat('⁴')) { const w = mul(v, v); v = mul(w, w); } else return v; } };
  const num = () => { const m = /^(\d+)(?:\.(\d+))?/.exec(src.slice(i)); if (!m) throw new Error('number at ' + i); i += m[0].length; return Q(BigInt(m[1] + (m[2] || '')), 10n ** BigInt((m[2] || '').length)); };
  const close = v => { if (!eat(')')) throw new Error(') at ' + i); return v; };
  const atom = () => (eat('(') ? pow(close(expr())) : pow(num()));
  const unary = () => (eat('−') || eat('-') ? neg(unary()) : atom());
  const term = () => { let v = unary(); for (;;) { if (eat('·') || eat('*')) v = mul(v, unary()); else if (eat('/')) v = div(v, unary()); else return v; } };
  function expr() { let v = term(); for (;;) { if (eat('+')) v = add(v, term()); else if (eat('−') || eat('-')) v = add(v, neg(term())); else return v; } }
  const v = expr();
  if (i !== src.length) throw new Error('not arithmetic: ' + t);
  return v;
}
function exact(line, d) {
  const v = parse(line);
  if (v === null) return null;
  const s = 10n ** BigInt(d), an = v.n < 0n ? -v.n : v.n;
  const q = (2n * an * s + v.d) / (2n * v.d);                 /* |v| · 10^d + 1/2, cut: half away from zero */
  const txt = q.toString().padStart(d + 1, '0');
  return (v.n < 0n && q > 0n ? '−' : '') + (d ? txt.slice(0, -d) + '.' + txt.slice(-d) : txt);
}
module.exports = { exact };
if (require.main === module) {
  let bad = 0;
  for (const [l, d, want] of [['−382.7 · 2.66 · 3.34² / 6.00²', 1, '−315.4'], ['380.0 · 1.27 · 4.73 / 6.00', 1, '380.4'], ['10.0 · 5.00² / 8', 1, '31.3'], ['−10.0 · 5.00² / 8', 1, '−31.3'],
    ['55.5 / 2', 1, '27.8'], ['10.0 − 30.0 + 30.0', 1, '10.0'], ['(0.0 − 0.04) / 1', 1, '0.0'], ['5 · 10.0 · 6.00⁴ / (384 · 17 547.6) · 10³', 1, '9.6'], ['1 / 3', 2, '0.33'], ['2 / 3', 2, '0.67'], ['0.125 · 1', 2, '0.13']]) {
    const got = exact(l, d); if (got !== want) { bad++; console.log('FAIL', l, got, want); }
  }
  console.log(bad ? `${bad} failed` : 'exact rounding: the reference cases agree');
  process.exit(bad ? 1 : 0);
}
