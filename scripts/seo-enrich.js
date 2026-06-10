// SEO 보강: 기사 페이지 NewsArticle/Article JSON-LD에 구글 권장 필드 추가
//  + BreadcrumbList(빵부스러기) 구조화 데이터 삽입
// 안전 설계: 기존 ld+json을 JSON.parse → 객체 보강 → JSON.stringify (수기 JSON 작성 오류 0)
//           idempotent (이미 있으면 건너뜀) — 재실행 안전
// 실행: node scripts/seo-enrich.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OG = 'https://patchkr.com/og-image.png?v=2';
const IMG = { '@type': 'ImageObject', url: OG, width: 1200, height: 630 };

// 파일: [빵부스러기 leaf 이름, canonical URL, 언어]
const PAGES = {
  'ballot-shortage.html':    ['6·3 지방선거 투표용지 부족 사태', 'https://patchkr.com/ballot-shortage.html', 'ko'],
  'ballot-shortage-en.html': ['2026 South Korea Ballot-Shortage Crisis', 'https://patchkr.com/ballot-shortage-en.html', 'en'],
  'judiciary.html':          ['사법부 구성·임명·독립성 팩트체크', 'https://patchkr.com/judiciary.html', 'ko'],
  'martial-law.html':        ['윤석열 12·3 비상계엄 기록', 'https://patchkr.com/martial-law.html', 'ko'],
  'memorial-day.html':       ['제71회 현충일', 'https://patchkr.com/memorial-day.html', 'ko'],
  'nvidia-huang.html':       ['젠슨 황 엔비디아 CEO 방한', 'https://patchkr.com/nvidia-huang.html', 'ko'],
  'president-1year.html':    ['이재명 대통령 취임 1주년 기자회견', 'https://patchkr.com/president-1year.html', 'ko'],
};
const CRUMB = { ko: { home: '홈', hub: '분석·기록' }, en: { home: 'Home', hub: 'Analysis' } };
const LDJSON_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

let changed = 0;
for (const [file, [leaf, url, lang]] of Object.entries(PAGES)) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) { console.log(`! ${file}: 없음`); continue; }
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;

  // 1) 첫 ld+json(기사 스키마) 보강
  const m = html.match(LDJSON_RE);
  if (!m) { console.log(`! ${file}: ld+json 없음`); continue; }
  let obj;
  try { obj = JSON.parse(m[1]); } catch (e) { console.log(`! ${file}: parse 실패 — ${e.message}`); continue; }
  const added = [];
  if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article') {
    const pubName = (obj.publisher && obj.publisher.name) || '대한민국 패치노트';
    if (!obj.image) { obj.image = IMG; added.push('image'); }
    if (!obj.author) { obj.author = { '@type': 'Organization', name: pubName, url: 'https://patchkr.com' }; added.push('author'); }
    if (obj.publisher && !obj.publisher.logo) { obj.publisher.logo = IMG; added.push('publisher.logo'); }
    if (!obj.mainEntityOfPage) { obj.mainEntityOfPage = { '@type': 'WebPage', '@id': url }; added.push('mainEntityOfPage'); }
    if (obj.isAccessibleForFree === undefined) { obj.isAccessibleForFree = true; added.push('isAccessibleForFree'); }
    html = html.replace(LDJSON_RE, '<script type="application/ld+json">' + JSON.stringify(obj) + '</script>');
  }

  // 2) BreadcrumbList 삽입 (idempotent)
  let crumbAdded = false;
  if (!/BreadcrumbList/.test(html)) {
    const cn = CRUMB[lang] || CRUMB.ko;
    const crumb = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: cn.home, item: 'https://patchkr.com/' },
        { '@type': 'ListItem', position: 2, name: cn.hub, item: 'https://patchkr.com/analysis.html' },
        { '@type': 'ListItem', position: 3, name: leaf, item: url },
      ],
    };
    const tag = '<script type="application/ld+json">' + JSON.stringify(crumb) + '</script>';
    html = html.replace(LDJSON_RE, (m0) => m0 + '\n' + tag);
    crumbAdded = true;
  }

  if (html !== before) {
    fs.writeFileSync(fp, html, 'utf8');
    changed++;
    console.log(`✓ ${file} — 보강[${added.join(',') || '없음'}]${crumbAdded ? ' +breadcrumb' : ''}`);
  } else {
    console.log(`= ${file} (변경 없음)`);
  }
}

// 3) 검증: 모든 대상 파일의 ld+json 블록 전부 JSON.parse
console.log('\n=== ld+json 검증 ===');
let bad = 0, blocks = 0;
const ALL_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
for (const file of Object.keys(PAGES)) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) continue;
  const html = fs.readFileSync(fp, 'utf8');
  let mm, n = 0;
  while ((mm = ALL_RE.exec(html))) {
    blocks++; n++;
    try { JSON.parse(mm[1]); } catch (e) { bad++; console.log(`✗ ${file} 블록#${n}: ${e.message}`); }
  }
  if (n !== 2) console.log(`⚠ ${file}: ld+json 블록 ${n}개 (기대 2)`);
}
console.log(bad === 0 ? `✓ 전체 ${blocks}개 블록 파싱 OK` : `✗ ${bad}개 블록 오류`);
console.log(`\n${changed}개 파일 수정됨.`);
process.exit(bad === 0 ? 0 : 1);
