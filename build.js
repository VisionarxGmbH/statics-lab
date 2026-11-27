/* Assembles dist/index.html from the sources: one file with its styles, scripts and fonts inside.
   Run: node build.js (the page) or node build.js --debug (dist/debug.html, which the browser checks use) */
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const strip = s => s.replace(/\nif \(typeof module !== 'undefined'\)[^\n]*\n?/g, '\n');
const js = ['solver.js', 'presets.js', 'cards.js', 'view3d.js', 'app.js'].map(f => strip(src(f))).join('\n')
  .replace("const S = typeof FS !== 'undefined' ? FS : require('./solver.js');", 'const S = FS;');
const dbg = process.argv.includes('--debug');
const body = dbg ? js : js.replace(/\n\/\*DEBUG\*\/[^\n]*/g, '');
/* the two fonts of the page, from the folder fonts: built in, so that the page calls no other server */
const faces = JSON.parse(fs.readFileSync(path.join(__dirname, 'fonts', 'faces.json'), 'utf8'));
const fonts = '/* Geist: Copyright 2024 The Geist Project Authors. STIX Two Text: Copyright 2001-2021 The STIX Fonts Project Authors. Both under the SIL Open Font License 1.1 (folder fonts) */\n'
  + faces.map(f => `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f.file)).toString('base64')}) format('woff2');unicode-range:${f.range}}`).join('\n');
/* the page travels alone: it carries the licence of the package in itself, where that is a short one */
const licFile = path.join(__dirname, 'LICENSE'), lic = fs.existsSync(licFile) ? fs.readFileSync(licFile, 'utf8').trim() : '';
const notice = lic && lic.length < 2000 && !lic.includes('--') ? `<!--\nStatics Lab\n\n${lic}\n\nThe fonts Geist and STIX Two Text are built in under the SIL Open Font License 1.1.\n-->\n` : '';
const html = src('index.template.html').replace('<!DOCTYPE html>\n', () => '<!DOCTYPE html>\n' + notice).replace('/*FONTS*/', () => fonts).replace('/*CSS*/', () => src('style.css').trim()).replace('/*JS*/', () => body.trim());
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const outName = dbg ? 'debug.html' : 'index.html';
fs.writeFileSync(path.join(__dirname, 'dist', outName), html);
console.log('dist/' + outName, (html.length / 1024).toFixed(1) + ' KB', html.split('\n').length + ' lines');
