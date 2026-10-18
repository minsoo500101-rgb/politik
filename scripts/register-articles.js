#!/usr/bin/env node
/**
 * 새 기사 등록 — 홈 '주요 이슈' 행 · 분석·기록 카드 · build_sitemap.py STATIC_PAGES.
 *
 * 왜 저장소에 두나: 라운드마다 임시 폴더에 등록 스크립트를 만들어 썼는데, 임시 폴더가 정리되면서
 * 스크립트와 기사 사양이 함께 사라졌다(2026-10-19). build-article.js 와 짝으로 둔다.
 *
 * 사용: node scripts/register-articles.js <spec.json> <home.json>
 *   home.json = [{ slug, d, ic, tt, sub }]  — 홈 행의 짧은 제목·부제(<b> 허용). 순서대로 위에 붙는다.
 *   영어 기사(lang:'en')는 여기서 다루지 않는다(english.html 허브는 따로).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const [specPath, homePath] = process.argv.slice(2);
if (!specPath || !homePath) { console.error('사용: node scripts/register-articles.js <spec.json> <home.json>'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const HOME = JSON.parse(fs.readFileSync(homePath, 'utf8'));
const by = Object.fromEntries(spec.articles.map((a) => [a.slug, a]));
for (const h of HOME) {
  if (!by[h.slug]) throw new Error('spec 에 없는 slug: ' + h.slug);
  if (!fs.existsSync(path.join(ROOT, h.slug + '.html'))) throw new Error('기사 파일 없음(build-article.js 먼저): ' + h.slug);
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function edit(file, fn) {
  const f = path.join(ROOT, file);
  const s = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, fn(s, s.includes('\r\n') ? '\r\n' : '\n'));
  console.log('  ✅', file);
}
function insertAfter(s, anchor, add, label) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${label}: 앵커 ${n}회`);
  return s.replace(anchor, anchor + add);
}

edit('index.html', (s, nl) => {
  for (const h of HOME) if (s.includes(`href:"/${h.slug}.html"`)) throw new Error('이미 등록됨: ' + h.slug);
  const rows = HOME.map((h) => `    {d:"${h.d}",ic:"${h.ic}",href:"/${h.slug}.html",tt:"${h.tt.replace(/"/g, '\\"')}",sub:"${h.sub.replace(/"/g, '\\"')}"},${nl}`).join('');
  return insertAfter(s, '  var items=[' + nl, rows, '홈 주요 이슈');
});

edit('analysis.html', (s, nl) => {
  const i = s.indexOf('<a class="art-card" href="/');
  if (i < 0) throw new Error('analysis.html 카드 앵커 없음');
  const cards = HOME.map(({ slug }) => {
    const a = by[slug];
    const names = [];
    for (const x of a.sources || []) { const n = x.split(' (')[0].trim(); if (!names.includes(n)) names.push(n); }
    let dek = a.dek.replace(/<\/?b>/g, '').replace(/\s+/g, ' ');
    if (dek.length > 230) dek = dek.slice(0, 228).replace(/\s\S*$/, '') + '…';
    return [`<a class="art-card" href="/${slug}.html">`, `  <div class="art-cat">${esc(a.kicker)}</div>`, `  <div class="art-tt">${esc(a.headline)}</div>`,
      `  <p class="art-desc">${esc(dek)}</p>`, `  <div class="art-meta"><span>출처 <b>${esc(names.slice(0, 3).join('·'))}</b></span><span class="art-go">전문 보기 →</span></div>`, '</a>', '', ''].join(nl);
  }).join('');
  return s.slice(0, i) + cards + s.slice(i);
});

edit('build_sitemap.py', (s, nl) => insertAfter(s, 'STATIC_PAGES = [' + nl,
  HOME.map((h) => `    {"path": "/${h.slug}.html", "priority": "0.9", "freq": "weekly"},${nl}`).join(''), 'sitemap'));

console.log(`등록 ${HOME.length}편 — 다음: build-feed-llms.js · build_sitemap.py · build-home-noscript.js · build-llms-live.js · validate.js`);
