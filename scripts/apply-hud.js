#!/usr/bin/env node
// PATCH//EYE 공통 테마(assets/hud.css)를 모든 HTML 에 입힌다 — UI 개편 2단계.
//
// 생성기(build_static_pages.py·build_law_pages.py·build-article.js …)를 하나하나 고치지 않고,
// apply-ko-type.js 처럼 결과물 HTML 의 </head> 앞에 블록 하나를 넣는 후처리로 한다. 여러 번 돌려도 같다(마커 사이를 교체).
// CI(build-static-pages·law-singu·daily-sync)는 생성기와 extract-css 다음에 이 스크립트를 돌린다.
//
// 넣는 것: ① 글꼴(비차단) ② hud.css?v=<내용 해시> ③ 테마 결정 스크립트
// 테마: 'politik:ui' 에 직접 'light' 를 고른 사람만 밝은 판, 나머지는 어두운 HUD.
//   예전 키 'politik:theme' 는 앱이 첫 방문 때 OS 설정을 자동 저장해 '고른 값'과 구분이 안 돼 새 키로 바꾼다.
//   페이지의 🌓 버튼(onclick)도 새 키에 쓰도록 같이 바꾼다.
// eye.html(관제 화면)은 자체 테마라 건너뛴다.
//
// 사용: node scripts/apply-hud.js [--check]   (--check: 바꿀 게 있으면 exit 1, 파일은 안 건드림)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');
const css = fs.readFileSync(path.join(ROOT, 'assets/hud.css'));
const ver = crypto.createHash('sha1').update(css).digest('hex').slice(0, 8);
const FONTS = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap';
const THEME = "try{var d=document.documentElement;if(localStorage.getItem('politik:ui')==='light')d.removeAttribute('data-theme');else d.setAttribute('data-theme','dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}";
const BLOCK = `<!--HUD--><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}" media="print" onload="this.media='all'"><link rel="stylesheet" href="/assets/hud.css?v=${ver}" id="hud"><script>${THEME}</script><!--/HUD-->`;
const SKIP = new Set(['eye.html']);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (dir === ROOT && !['law', 'law-radar', 'history', 'en'].includes(e.name)) continue; yield* walk(path.join(dir, e.name)); }
    else if (e.name.endsWith('.html')) yield path.join(dir, e.name);
  }
}

let changed = 0, total = 0, nohead = [];
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (SKIP.has(rel)) continue;
  total++;
  const src = fs.readFileSync(f, 'utf8');
  let s = src;
  if (/<!--HUD-->[\s\S]*?<!--\/HUD-->/.test(s)) s = s.replace(/<!--HUD-->[\s\S]*?<!--\/HUD-->/, BLOCK);
  else if (s.includes('</head>')) s = s.replace('</head>', BLOCK + '</head>');
  else { nohead.push(rel); continue; }
  // 🌓 버튼이 새 키에 쓰도록
  s = s.split("localStorage.setItem('politik:theme',n)").join("localStorage.setItem('politik:ui',n)");
  if (s !== src) { changed++; if (!CHECK) fs.writeFileSync(f, s); }
}
console.log(`HUD v=${ver} — ${total}쪽 중 ${changed}쪽 ${CHECK ? '갱신 필요' : '갱신'}${nohead.length ? ` · </head> 없음 ${nohead.length}: ${nohead.slice(0, 5).join(', ')}` : ''}`);
if (CHECK && changed) process.exit(1);
