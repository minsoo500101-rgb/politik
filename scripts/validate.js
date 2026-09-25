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
  // V31.83 — fetch URL 드리프트 검사. daily-sync의 sed가 '?v=' + POLITICIANS_VER 를 '?v=31' + … 로 되돌리면
  // 실제 요청이 ?v=3131 이 되어 prefetch(?v=31)와 어긋나 인물 데이터를 두 번 내려받는다(2026-08~09 두 번 재발).
  if (/politicians\.json\?v=\d+['"]\s*\+\s*POLITICIANS_VER/.test(html)) {
    err("politicians.json fetch URL에 숫자와 POLITICIANS_VER가 함께 있음 → 요청이 ?v=NNNN 으로 어긋남. '?v=' + POLITICIANS_VER 로 고칠 것");
  } else if (!/politicians\.json\?v=['"]\s*\+\s*POLITICIANS_VER/.test(html)) {
    warn("politicians.json fetch가 '?v=' + POLITICIANS_VER 형태가 아님 — prefetch와 일치하는지 확인");
  } else {
    ok('politicians.json fetch URL = prefetch URL (중복 다운로드 없음)');
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

// robots.txt가 존재하는 모든 사이트맵을 선언하는지.
// sitemap-law.xml(법령 4,877쪽)이 만들어지고도 robots.txt에 선언되지 않아
// 크롤러에 발견 경로가 없는 상태로 방치돼 있었다(2026-09-21 발견).
try {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  const declared = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map(m => m[1].split('/').pop());
  const onDisk = fs.readdirSync(ROOT).filter(f => /^sitemap.*\.xml$/i.test(f));
  const missing = onDisk.filter(f => !declared.includes(f));
  if (missing.length) {
    err(`robots.txt에 선언되지 않은 사이트맵: ${missing.join(', ')} (크롤러가 발견하지 못함)`);
  } else {
    ok(`robots.txt 사이트맵 선언 ${declared.length}개 — 디스크의 ${onDisk.length}개 모두 포함`);
  }
} catch (e) {
  warn('robots.txt 검사 실패: ' + e.message);
}

// IndexNow 키 — scripts/indexnow.js 의 KEY 와 루트 <KEY>.txt 내용이 같아야 네이버·빙이 소유 확인을 통과한다.
// 키 파일을 지우거나 키만 바꾸면 통지가 조용히 전부 거절된다.
try {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/indexnow.js'), 'utf8');
  const key = (src.match(/const KEY = '([0-9a-f]{32})'/) || [])[1];
  const kf = key && path.join(ROOT, key + '.txt');
  if (!key) err('scripts/indexnow.js 에서 IndexNow KEY 를 찾지 못함');
  else if (!fs.existsSync(kf)) err(`IndexNow 키 파일 ${key}.txt 가 루트에 없음 — 통지가 전부 거절된다`);
  else if (fs.readFileSync(kf, 'utf8').trim() !== key) err(`IndexNow 키 파일 내용이 KEY 와 다름`);
  else ok('IndexNow 키 파일 일치');
} catch (e) {
  warn('IndexNow 검사 실패: ' + e.message);
}

// 홈의 법안 건수 표기 일관성. <title>·og·소개 카드가 서로 다른 숫자를 말하면
// 부분 갱신이 일어난 것이다. 실제 값과의 대조는 scripts/sync-bill-count.js(네트워크)가 맡는다.
try {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nums = new Set([...h.matchAll(/22대 (?:국회 )?(?:통과 )?법안 ([\d,]+)건/g)].map(m => m[1]));
  const card = (h.match(/about-stat-n">([\d,]+)<\/div><div class="about-stat-l">22대 통과 법안/) || [])[1];
  if (card) nums.add(card);
  if (nums.size > 1) {
    err(`홈 법안 건수 표기가 서로 다름: ${[...nums].join(' / ')} — sync-bill-count.js 실행 필요`);
  } else if (nums.size === 1) {
    ok(`법안 건수 표기 일관 (${[...nums][0]}건)`);
  }
} catch (e) {
  warn('법안 건수 표기 검사 실패: ' + e.message);
}

// Supabase 직접 접근 회귀 방지 — 2026-09-24.
// 공개 anon 키로 8개 테이블 원본(user_id 포함) 전체 읽기·일괄 수정·삭제가 가능했다(정책이 전부 USING(true)).
// 이제 투표·평점·찬반·조회수 집계는 RPC로만 다루고, 테이블 직접 권한은 page_views INSERT·nec_pledges_cache SELECT만 남겼다.
// 프런트가 다시 원본 행을 SELECT하거나 PATCH/DELETE하면 DB가 거부해 기능이 조용히 깨지므로, 여기서 먼저 잡는다.
try {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const LOCKED = ['social_votes', 'pledge_ihaeng_votes', 'pledge_ratings', 'user_stances', 'bookmarks', 'nec_candidates_cache'];
  const hits = [];
  for (const t of LOCKED) {
    // 죽은 함수(loadCandidateCached·syncStanceToServer) 안의 흔적은 호출 0이라 허용 — 살아있는 함수 이름으로 판별
    const re = new RegExp(`supabaseRest\\(\\s*[\`'"]/${t}[?\`'"]`, 'g');
    let m;
    while ((m = re.exec(h))) {
      const fnStart = h.lastIndexOf('function ', m.index);
      const fn = (h.slice(fnStart, fnStart + 80).match(/function\s+([A-Za-z0-9_]+)/) || [])[1] || '?';
      const calls = (h.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;   // 정의 포함
      if (calls > 1) hits.push(`${t} ← ${fn}()`);
    }
  }
  if (/\/page_views\?[^'"`]*select=/.test(h)) hits.push('page_views 원본 SELECT');
  if (hits.length) {
    err(`프런트가 잠긴 Supabase 테이블을 직접 접근함: ${hits.join(', ')} — RPC(supabaseRpc)로 바꿀 것`);
  } else {
    ok('Supabase 직접 접근 없음 — 투표·평점·찬반·조회수는 RPC 경유');
  }
} catch (e) {
  warn('Supabase 접근 검사 실패: ' + e.message);
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
    // 머리글만 있고 데이터 행이 없는 표 — V31.94 기사 5편이 이 상태로 배포됐다(생성기가 형식 안 맞는 행을 조용히 버림).
    const emptyTables = [...h.matchAll(/<table>([\s\S]*?)<\/table>/g)].filter(m => !/<td[\s>]/.test(m[1])).length;
    if (emptyTables) { err(`${f}: 데이터 행 없는 표 ${emptyTables}개`); bad++; }
    const by =(h.match(/<div class="byline">([^<]*)/) || [])[1] || '';
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
  // V31.84 — 홈 함수·내비 트리만 보던 검사를 라이브 HTML 전체(변경이력 제외)로 넓힌다. 모바일 하단 내비(정적 HTML)에
  // 남아 있던 /me 링크를 이전 검사가 놓쳤다. 라우터의 리다이렉트 분기와 SEO 메타 테이블 키는 허용.
  const routerStart = live.indexOf('function route()'), routerEnd = live.indexOf('\n}', routerStart);
  const metaStart = live.indexOf('const ROUTE_META = {'), metaEnd = live.indexOf('\n};', metaStart);
  const scan = live.slice(0, routerStart) + live.slice(routerEnd, metaStart) + live.slice(metaEnd);
  const lineOf = idx => scan.slice(0, idx).split('\n').length;
  for (const r of RETIRED) {
    const esc = r.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    const re = new RegExp(`(href|data-path)=["']${esc}["'?#]|nav\\(['"]${esc}['"]`, 'g');
    let m; while ((m = re.exec(scan))) {
      // 주석 줄은 제외
      const ls = scan.lastIndexOf('\n', m.index) + 1; if (/^\s*(\/\/|<!--)/.test(scan.slice(ls, m.index))) continue;
      err(`제거된 라우트 ${r} 링크가 남아 있음 (${lineOf(m.index)}행 근처): ${scan.slice(ls, ls + 90).trim()}`); retiredHits++;
    }
  }
  if (!retiredHits) ok(`제거된 라우트 ${RETIRED.length}개 — 전체 HTML(변경이력·라우터·메타 제외)에 링크 없음`);
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
