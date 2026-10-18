#!/usr/bin/env node
/**
 * 한·영 전환 링크 — 모든 기사 상단 막대(.top)에 글자 링크 하나('English' / '한국어')를 넣는다(UI 개편 4단계).
 *
 * 규칙(모멘토·Clinch 공통 교훈): 언어는 주소로 가르고 브라우저 언어로 자동 이동하지 않는다. 국기 아이콘 없이 글자로.
 * 짝(hreflang)이 있는 페이지는 짝으로, 없으면 상대 언어 허브로(한국어 → /en, 영어 → /).
 * 마커 <!--LANG--> … <!--/LANG--> 사이를 바꾸므로 멱등. 이미 손으로 넣은 언어 링크가 있는 페이지는 건드리지 않는다.
 * 측정 스크립트(assets/track.js)도 함께 붙인다.
 * 사용: node scripts/build-lang-links.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
let n = 0, skip = 0;
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
  const p = path.join(ROOT, f);
  const s = fs.readFileSync(p, 'utf8');
  if (!/"@type":"NewsArticle"/.test(s)) continue;
  const top = s.match(/<div class="top">([\s\S]*?)<\/div>/);
  if (!top) { skip++; }
  const en = /<html[^>]*lang="en"/.test(s);
  const alt = Object.fromEntries([...s.slice(0, 8000).matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2].replace('https://patchkr.com', '') || '/']));
  const href = en ? (alt.ko || '/') : (alt.en || '/en');
  const label = en ? '한국어' : 'English';
  const link = `<!--LANG--><a class="lang-link" href="${href}" hreflang="${en ? 'ko' : 'en'}" lang="${en ? 'ko' : 'en'}" style="font-size:13px;margin-right:10px">${label}</a><!--/LANG-->`;
  let t = s;
  if (!top) { /* 상단 막대 없음 */ }
  else if (t.includes('<!--LANG-->')) t = t.replace(/<!--LANG-->[\s\S]*?<!--\/LANG-->/, link);
  else if (/한국어<\/a>|>English<\/a>/.test(top[1])) skip++;   // 손으로 넣은 링크가 이미 있음(측정 스크립트만 붙인다)
  else t = t.replace(top[0], top[0].replace('<span>', '<span>' + link));
  // 측정(UI 개편 5단계) — 기사 조회·'이어서 볼 것' 클릭 기록 스크립트. 한·영 기사 모두.
  if (!t.includes('src="/assets/track.js"')) t = t.replace('</head>', '<script defer src="/assets/track.js"></script></head>');
  if (t !== s) { n++; if (!DRY) fs.writeFileSync(p, t); }
}
console.log(`${DRY ? '(dry) ' : ''}언어 링크 ${n}편 갱신 · 건너뜀 ${skip}`);
