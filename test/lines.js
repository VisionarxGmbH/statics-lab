/* The line "with the numbers" of a row is arithmetic. calc works it out exactly as it is printed. */
const calc = t => {
  const e = t.replace(/(\d)[\u2009\u202f ](?=\d{3}(?!\d))/g, '$1')
    .replace(/sin\s*([\d.]+)°/g, 'Math.sin($1*Math.PI/180)').replace(/√\(/g, 'Math.sqrt(').replace(/√(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)')
    .replace(/²/g, '**2').replace(/³/g, '**3').replace(/⁴/g, '**4').replace(/·/g, '*').replace(/−/g, '-');
  if (/[^\d.\s()+\-*\/]/.test(e.replace(/Math\.(sqrt|sin|PI)/g, ''))) throw new Error('not arithmetic: ' + t);
  /* a leading minus in front of a power means minus the whole term, as it is read on paper */
  return Function('"use strict"; return (' + e.replace(/^\s*-/, '-1*') + ')')();
};
module.exports = { calc };
