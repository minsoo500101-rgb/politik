#!/usr/bin/env node
/**
 * 한국어 기사마다 '다음 행동'(바이라인 아래 버튼 한 줄)과 '이어서 볼 것'(본문 끝 링크 목록)을 넣는다.
 *
 * 왜(UI 개편 2단계): 검색으로 기사에 바로 들어온 사람은 홈을 거치지 않는다. 같은 사업자의 Clinch 는
 * 기사 ↔ 관련 페이지 상호 링크가 체류에 가장 확실했다고 했다. 지금 기사들은 끝의 내비 2개 말고는
 * 다음으로 갈 곳이 없었다.
 *
 * 분류는 kicker·제목의 낱말로 정한다(같은 분야 최근 기사 3편 + 분야별 데이터 페이지 1곳).
 * 마커(<!-- NEXT:START/END -->, <!-- RELATED:START/END -->) 사이를 통째로 바꾸므로 멱등이다.
 * 기사 추가 뒤 build-feed-llms.js 다음에 실행한다(data/articles.json 을 읽음).
 *
 * 사용: node scripts/build-related.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/articles.json'), 'utf8'));
const ARTS = (Array.isArray(raw) ? raw : raw.articles || raw.items).filter((a) => a.lang !== 'en');

const CATS = [
  { id: 'econ', re: /경제|증시|코스피|수출|물가|고용|취업|금리|환율|부동산|산업|반도체/, tool: { href: '/economy', label: '경제 지표 한 화면' } },
  { id: 'justice', re: /사법|재판|판결|선고|검찰|특검|헌재|헌법재판|법원|수사|공소청|중수청/, tool: { href: '/martial-law.html', label: '계엄 이후 재판 현황' } },
  { id: 'assembly', re: /국회|법안|입법|국감|국정감사|본회의|상임위|예산안/, tool: { href: '/bills', label: '22대 국회 법안 검색' } },
  { id: 'security', re: /안보|북한|국방|외교|미사일|DMZ|한미|정상회담|유엔/, tool: { href: '/korea-security-2026.html', label: '2026 한반도 안보 정리' } },
  { id: 'politics', re: /정치|정당|여론|갤럽|개각|장관|대표|선거|대통령/, tool: { href: '/dex', label: '정치인 도감' } },
  { id: 'society', re: /사회|재난|사고|화재|인구|출생|노동|교육|보건|태풍|폭염/, tool: { href: '/law-radar.html', label: '곧 시행되는 법령' } },
];
const catOf = (a) => (CATS.find((c) => c.re.test(a.kicker || '')) || CATS.find((c) => c.re.test(a.title || '')) || CATS[5]).id;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (t) => String(t).split(/…|—| - /)[0].trim();

const STYLE = '<style id="rel-style">.nx{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}.nx a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--bd,#d9d9d9);border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;color:inherit}.nx a.p{border-color:var(--ac,#4F46E5);color:var(--ac,#4F46E5)}.rel{margin:32px 0 8px;border-top:2px solid currentColor;padding-top:10px}.rel h2{font-size:16px;margin:0 0 4px;border:0;padding:0}.rel ul{list-style:none;margin:0;padding:0}.rel li{border-bottom:1px solid var(--bd,#d9d9d9)}.rel a{display:flex;justify-content:space-between;gap:12px;padding:10px 0;text-decoration:none;color:inherit;font-size:14.5px;line-height:1.45}.rel a span{flex:0 0 auto;font-size:12.5px;opacity:.7}</style>';

function setBlock(s, start, end, html, insert) {
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  const block = `${start}${html}${end}`;
  if (re.test(s)) return s.replace(re, block);
  return insert(s, block);
}

let n = 0, skip = 0;
for (const a of ARTS) {
  const file = path.join(ROOT, a.url.replace(/^\//, ''));
  if (!fs.existsSync(file)) { skip++; continue; }
  let s = fs.readFileSync(file, 'utf8');
  if (!/class="byline"/.test(s)) { skip++; continue; }
  const cat = catOf(a);
  const tool = CATS.find((c) => c.id === cat).tool;
  const same = ARTS.filter((b) => b.url !== a.url && catOf(b) === cat).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  // 이 기사보다 최근 것 1편 + 그 이전 것 2편 — 새 기사에도 옛 기사에도 앞뒤 흐름이 생긴다
  const newer = same.filter((b) => (b.date || '') >= (a.date || '')).slice(-1);
  const older = same.filter((b) => (b.date || '') < (a.date || '')).slice(0, 3 - newer.length);
  const rel = [...newer, ...older, ...same].filter((b, i, arr) => arr.indexOf(b) === i).slice(0, 3);

  // 첫 화면은 답을 가리지 않게 버튼 하나만 — 관련 기사 목록은 본문 끝 '이어서 볼 것'에
  const next = `<div class="nx"><a class="p" href="${tool.href}">${esc(tool.label)} →</a></div>`;
  const list = `<aside class="rel" aria-label="이어서 볼 것"><h2>이어서 볼 것</h2><ul>` +
    rel.map((b) => `<li><a href="${b.url}">${esc(short(b.title))}<span>${(b.date || '').slice(5).replace('-', '.')}</span></a></li>`).join('') +
    `<li><a href="${tool.href}">${esc(tool.label)}<span>데이터</span></a></li><li><a href="/analysis.html">분석·기록 전체<span>목록</span></a></li></ul></aside>`;

  const before = s;
  if (!s.includes('id="rel-style"')) s = s.replace('</head>', STYLE + '</head>');
  s = setBlock(s, '<!-- NEXT:START -->', '<!-- NEXT:END -->', next, (t, blk) => t.replace(/(<div class="byline">[\s\S]*?<\/div>)/, `$1\n${blk}`));
  s = setBlock(s, '<!-- RELATED:START -->', '<!-- RELATED:END -->', list, (t, blk) => {
    if (t.includes('<h2>출처</h2>')) return t.replace('<h2>출처</h2>', `${blk}\n\n<h2>출처</h2>`);
    return t.replace('<footer', `${blk}\n\n<footer`);
  });
  if (s !== before) { n++; if (!DRY) fs.writeFileSync(file, s); }
}
console.log(`${DRY ? '(dry) ' : ''}이어서 볼 것 갱신 ${n}편 · 건너뜀 ${skip}`);
