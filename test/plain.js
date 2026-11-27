/* The text of a formula on one line, for the messages of the checks: a fraction as (a)/(b), a root as √[..],
   an index as _x, a power as ^x. Without this a fraction would lose its bar: (M1 + M2)/(2) would read "M1 + M22". */
const FR = /<span class="fr"><span>((?:(?!<span class="fr">)[\s\S])*?)<\/span><span>((?:(?!<span class="fr">)[\s\S])*?)<\/span><\/span>/g;
function plain(s) {
  s = String(s).replace(/√<span class="rt">([\s\S]*?)<\/span>/g, '√[$1]');
  for (let p = null; p !== s;) { p = s; s = s.replace(FR, '($1)/($2)'); }
  return s.replace(/<sub>([\s\S]*?)<\/sub>/g, '_$1').replace(/<sup>([\s\S]*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '');
}
module.exports = { plain };
