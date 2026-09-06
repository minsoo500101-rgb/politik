#!/usr/bin/env node
/**
 * politicians.json 무결성 검증
 * - JSON 파싱 가능 여부
 * - people 배열 존재
 * - 필수 필드 (id, name_ko, type) 검사
 * - 중복 id 검사
 * - sitemap.xml URL 유효성
 * - index.html POLITICIANS_VER 와 데이터 version 일치 여부
 *
 * 실행: node scripts/validate.js
 * GitHub Actions에서도 호출됨
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let errors = 0;
let warnings = 0;

function err(msg) { console.error('❌ ERROR:', msg); errors++; }
function warn(msg) { console.warn('⚠️  WARN:', msg); warnings++; }
function ok(msg) { console.log('✅', msg); }

// 1. politicians.json
let data;
try {
  const raw = fs.readFileSync(path.join(ROOT, 'data/politicians.json'), 'utf8');
  data = JSON.parse(raw);
  ok(`politicians.json 파싱 OK (${(raw.length / 1024).toFixed(1)} KB)`);
} catch (e) {
  err(`politicians.json 파싱 실패: ${e.message}`);
  process.exit(1);
}

if (!data.people || !Array.isArray(data.people)) {
  err('people 배열이 없음');
  process.exit(1);
}
ok(`people 배열 ${data.people.length}명`);

// 2. 필수 필드 검사
const seenIds = new Set();
const dupIds = new Set();
let missingId = 0, missingName = 0, missingType = 0;
let withCareer = 0;

data.people.forEach((p, i) => {
  if (!p.id) { missingId++; warn(`[${i}] id 없음 — name=${p.name_ko}`); }
  if (!p.name_ko) { missingName++; warn(`[${i}] name_ko 없음 — id=${p.id}`); }
  if (!p.type) { missingType++; warn(`[${i}] type 없음 — id=${p.id}`); }
  if (p.id) {
    if (seenIds.has(p.id)) dupIds.add(p.id);
    seenIds.add(p.id);
  }
  if (p.career) withCareer++;
});

if (missingId) warn(`id 없는 인물 ${missingId}명`);
if (missingName) warn(`name_ko 없는 인물 ${missingName}명`);
if (missingType) warn(`type 없는 인물 ${missingType}명`);
if (dupIds.size) {
  err(`중복 id ${dupIds.size}개: ${[...dupIds].join(', ')}`);
}
ok(`career 등록 ${withCareer}/${data.people.length} (${(withCareer / data.people.length * 100).toFixed(1)}%)`);

// 3. index.html POLITICIANS_VER 일치 검사
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const POLITICIANS_VER\s*=\s*(\d+)/);
  if (!m) {
    warn('index.html에 POLITICIANS_VER 상수 없음');
  } else {
    const htmlVer = parseInt(m[1]);
    if (htmlVer !== data.version) {
      err(`버전 불일치: politicians.json version=${data.version}, index.html POLITICIANS_VER=${htmlVer}`);
      err('→ 둘 다 같은 숫자로 맞춰야 캐시 정상 갱신');
    } else {
      ok(`POLITICIANS_VER 일치 (${htmlVer})`);
    }
  }
  // preload 링크도 확인
  const pm = html.match(/data\/politicians\.json\?v=(\d+)/);
  if (pm) {
    const pv = parseInt(pm[1]);
    if (pv !== data.version) {
      warn(`<link preload> 버전 ${pv} ≠ data version ${data.version}`);
    }
  }
} catch (e) {
  warn('index.html 검사 실패: ' + e.message);
}

// 4. sitemap.xml 검증
try {
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...sm.matchAll(/<loc>(.+?)<\/loc>/g)].map(m => m[1]);
  const oldDomains = urls.filter(u => u.includes('politik-phi.vercel.app') || u.includes('minsoo500101-rgb.github.io'));
  if (oldDomains.length) {
    err(`sitemap.xml에 이전 도메인 URL ${oldDomains.length}개 남아있음`);
  } else {
    ok(`sitemap.xml URL ${urls.length}개 — 모두 patchkr.com`);
  }
} catch (e) {
  warn('sitemap.xml 검사 실패: ' + e.message);
}

// 5. index.html 인라인 script 안에 위험한 </script> 문자열 검사
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // 마지막 <script> 블록 (메인 인라인 JS) 안에 </script> 리터럴이 있으면 위험
  const mainScript = html.match(/<script>\s*'use strict';([\s\S]+?)<\/script>\s*<\/body>/);
  if (mainScript) {
    const body = mainScript[1];
    // </script> 가 백틱 안이거나 문자열·주석에 있으면 안 됨
    const danger = body.match(/<\/script>/i);
    if (danger) {
      err('index.html 메인 script 블록 안에 </script> 리터럴 발견 — HTML 파서가 조기 종료시킴');
      err('  → 백틱 템플릿이나 주석에 </script> 쓰지 말 것 (escape 필요: <\\/script>)');
    } else {
      ok('index.html 메인 script 안에 위험한 </script> 리터럴 없음');
    }
  }
} catch (e) {
  warn('index.html script 검사 실패: ' + e.message);
}

// 6. API 파일 환경변수 검사
const apiFiles = ['api/law.js', 'api/nec.js', 'api/naver.js'];
apiFiles.forEach(f => {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (c.match(/(?:client_secret|apikey|api_key|password)\s*[:=]\s*['"][a-zA-Z0-9]{10,}/i)) {
      err(`${f}: 하드코딩된 시크릿 의심 — process.env 사용해야 함`);
    } else {
      ok(`${f} 시크릿 OK`);
    }
  } catch {}
});

// 7. 기사(NewsArticle) 정적 페이지 무결성 — V31.83
//    ld+json 파싱, canonical, 애드센스 로더, 트렌드 폴리시, 바이라인 날짜 ↔ datePublished 일치
try {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html');
  let articles = 0, bad = 0;
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
    let first = null;
    for (const b of blocks) { try { const j = JSON.parse(b); if (!first) first = j; } catch { err(`${f}: ld+json 파싱 실패`); bad++; } }
    if (!first || (first['@type'] !== 'NewsArticle' && first['@type'] !== 'Article')) continue;
    articles++;
    if (!/rel="canonical"/.test(h)) { err(`${f}: canonical 없음`); bad++; }
    if (!/adsbygoogle/.test(h)) { err(`${f}: 애드센스 로더 없음`); bad++; }
    if (!/trend-polish/.test(h)) { warn(`${f}: 트렌드 폴리시 CSS 없음`); }
    const by = (h.match(/<div class="byline">([^<]*)/) || [])[1] || '';
    const d = by.match(/(20\d\d)년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (d && first.datePublished) {
      const bd = `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}`;
      // 바이라인 첫 날짜는 작성일(datePublished) 또는 갱신일(dateModified) 중 하나와 같아야 한다.
      // 둘 다 아니면 화면 표기와 구조화 데이터가 어긋난 것 — 검색·AI가 날짜를 다르게 읽는다.
      if (bd !== first.datePublished && bd !== (first.dateModified || first.datePublished)) {
        warn(`${f}: 바이라인 ${bd} ≠ datePublished ${first.datePublished} / dateModified ${first.dateModified || '-'}`);
      }
    }
  }
  ok(`기사 ${articles}편 무결성 검사 (오류 ${bad})`);
} catch (e) { warn('기사 검사 실패: ' + e.message); }

// 8. 내부 링크 검사 — index.html(홈·내비)·analysis.html·기사에서 가리키는 경로가 실제로 존재하는가.
//    제거된 라우트(리다이렉트만 남은 것)는 홈·내비에서 다시 노출되면 오류.
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cl0 = html.indexOf('const CHANGELOG = ['), cl1 = html.indexOf('\n];', cl0);
  const live = html.slice(0, cl0) + html.slice(cl1); // 변경이력은 과거 기록이라 제외
  const routes = new Set([...live.matchAll(/^\s*'(\/[^']*)':\s*\{\s*title:/gm)].map(m => m[1]));
  const RETIRED = ['/me', '/share', '/stances', '/bookmarks', '/play', '/pulse', '/polling', '/compare-cand', '/election2026/live'];
  const navSeg = (() => { const i = live.indexOf('const NAV_TREE = ['); return live.slice(i, live.indexOf('\n];', i)); })();
  const homeSeg = (() => { const i = live.search(/^function renderHome\(\)/m); const j = live.slice(i + 10).search(/^(?:async\s+)?function\s+[A-Za-z]/m); return live.slice(i, i + 10 + j); })();
  let retiredHits = 0;
  for (const r of RETIRED) {
    const re = new RegExp(`href=["']${r.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}["'?#]`);
    if (re.test(navSeg) || re.test(homeSeg)) { err(`제거된 라우트 ${r} 가 홈/내비에 다시 노출됨`); retiredHits++; }
  }
  if (!retiredHits) ok(`제거된 라우트 ${RETIRED.length}개 — 홈·내비 미노출 확인`);
  // 정적 파일 링크 존재 확인 (홈·내비·analysis·기사)
  const targets = new Set();
  const collect = s => { for (const m of s.matchAll(/href="(\/[a-zA-Z0-9\-_\/\.]+\.html)["#?]/g)) targets.add(m[1]); };
  collect(navSeg); collect(homeSeg);
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html')) collect(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  let missing = 0;
  for (const t of targets) { if (!fs.existsSync(path.join(ROOT, t.slice(1)))) { err(`깨진 내부 링크: ${t}`); missing++; } }
  if (!missing) ok(`정적 내부 링크 ${targets.size}개 — 모두 존재`);
  // SEO 라우트 테이블에 없는 클린 경로가 홈/내비에서 링크되면 경고 (404 아님, SPA fallback이지만 메타 누락)
  for (const m of (navSeg + homeSeg).matchAll(/href="(\/[a-z0-9\-\/]*)"/g)) {
    const p = m[1];
    // vercel.json rewrite로 정적 파일에 매핑되는 클린 경로는 SPA 라우트가 아니므로 제외
    const REWRITES = ['/about', '/privacy', '/business', '/en'];
    if (p === '/' || p.endsWith('.html') || routes.has(p) || REWRITES.includes(p) || /^\/(m|bill|party|group|election2026)\//.test(p)) continue;
    warn(`SEO 메타 테이블에 없는 경로 링크: ${p}`);
  }
} catch (e) { warn('내부 링크 검사 실패: ' + e.message); }

// 결과 요약
console.log('\n' + '='.repeat(50));
if (errors > 0) {
  console.error(`💥 검증 실패: ${errors}개 오류, ${warnings}개 경고`);
  process.exit(1);
}
console.log(`✨ 검증 통과: 0개 오류, ${warnings}개 경고`);
process.exit(0);
