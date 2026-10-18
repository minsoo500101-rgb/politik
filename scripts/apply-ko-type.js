#!/usr/bin/env node
/**
 * 한국어 줄바꿈 정리 — 모든 페이지 <head> 에 assets/ko-type.css 를 인라인(<style id="ko-type">)으로 넣고,
 * 한국어 기사 본문의 'N월 N일'·'N시 N분'이 두 줄로 갈리지 않게 묶는다.
 *
 * 왜: 2026-10-19 실측에서 98개 페이지 중 keep-all 을 쓰는 곳이 0개였다. 폰에서 '제/조업', '청/년'처럼
 *     음절 중간에서 줄이 끊겼다(UI 개편 0단계). 같은 사업자의 모멘토는 이것 하나로 체감 품질이 가장 크게 올랐다고 했다.
 * 생성기(build-article.js·build_law_pages.py·build-law-radar.js·build_static_pages.py·build_risk.py·build_law_hot.py)도
 * 같은 파일을 읽어 넣는다 — 원본은 assets/ko-type.css 하나. 이 스크립트는 이미 만들어진 페이지를 맞추는 용도.
 *
 * 사용: node scripts/apply-ko-type.js [--dry]   (멱등 — 다시 돌려도 바뀌는 것 없음)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CSS = fs.readFileSync(path.join(ROOT, 'assets/ko-type.css'), 'utf8').trim();
const BLOCK = `<style id="ko-type">${CSS}</style>`;

function glueDates(html) {
  // 본문(body)의 글자 부분만 — 태그·속성·script·style·title 안은 건드리지 않는다
  const i = html.search(/<body[^>]*>/i);
  if (i < 0) return html;
  const head = html.slice(0, i), body = html.slice(i);
  const parts = body.split(/(<[^>]+>)/);
  let skip = 0;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.startsWith('<')) {
      if (/^<(script|style|title|textarea)\b/i.test(p)) skip++;
      else if (/^<\/(script|style|title|textarea)>/i.test(p)) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip || !p) continue;
    if (k > 0 && parts[k - 1] === '<span class="nw">') continue;      // 이미 묶인 것
    parts[k] = p.replace(/(\d{1,2}월) (\d{1,2}일)/g, '<span class="nw">$1 $2</span>')
      .replace(/(\d{1,2}시) (\d{1,2}분)/g, '<span class="nw">$1 $2</span>');
  }
  return head + parts.join('');
}

const dirs = ['.', 'law', 'law-radar'];
let changed = 0, total = 0, glued = 0;
for (const d of dirs) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const p = path.join(dir, f);
    const s = fs.readFileSync(p, 'utf8');
    total++;
    let t = s;
    if (/<style id="ko-type">[\s\S]*?<\/style>/.test(t)) t = t.replace(/<style id="ko-type">[\s\S]*?<\/style>/, BLOCK);
    else if (t.includes('</head>')) t = t.replace('</head>', BLOCK + '</head>');
    else continue;
    // 날짜 묶기는 한국어 기사 페이지에만(법령 4,900쪽은 조문 원문이라 손대지 않음)
    if (d === '.' && /<html[^>]*lang="ko"/i.test(t) && /"@type":"NewsArticle"/.test(t)) {
      const g = glueDates(t);
      if (g !== t) glued++;
      t = g;
    }
    if (t !== s) { changed++; if (!DRY) fs.writeFileSync(p, t); }
  }
}
console.log(`${DRY ? '(dry) ' : ''}페이지 ${total}개 중 ${changed}개 갱신 · 날짜 묶음 적용 기사 ${glued}편`);
