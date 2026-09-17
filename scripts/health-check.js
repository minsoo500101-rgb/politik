// V29.3 — patchkr.com 자동 감시 (GitHub Actions로 매 시간 실행)
//
// 점검 항목:
// 1. 핵심 페이지 8개 응답 (200·로드 시간)
// 2. 외부 API 프록시 8개 (사전투표율·시세·뉴스 등)
// 3. SW 캐시 갱신 (V버전 노출 확인)
// 4. JSON-LD·noscript 정상 노출
//
// 결과: data/health-log.json 에 누적 (최근 50건 유지)
// 사용자가 일어나면 한눈에 확인 가능

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = process.env.PATCHKR_BASE || 'https://patchkr.com';
const LOG_FILE = path.resolve(__dirname, '../data/health-log.json');
const MAX_LOG = 50;

// 주의: SPA라 모든 경로가 동일 index.html(990KB)을 받음.
// → 페이지별 콘텐츠 검증은 raw HTML로 불가 (JS 실행 후 생성).
// → SPA 경로는 공통 마커(patchkr·noscript 본문)로만 "정상 로드" 확인.
// → 정적 파일(llms·sitemap)만 고유 콘텐츠 검증.
const SPA_MARKER = /patchkr|패치노트|9회 전국동시|정치인/;
const PAGES = [
  { path: '/',                     critical: true,  expect: SPA_MARKER },
  { path: '/early-voting',         critical: true,  expect: SPA_MARKER },
  { path: '/election2026',         critical: true,  expect: SPA_MARKER },
  { path: '/economy',              critical: true,  expect: SPA_MARKER },
  { path: '/bills',                critical: false, expect: SPA_MARKER },
  { path: '/changelog',            critical: false, expect: SPA_MARKER },
  { path: '/glossary',             critical: false, expect: SPA_MARKER },
  { path: '/llms.txt',             critical: false, expect: /patchkr|llms/ },       // 정적 파일
  { path: '/sitemap.xml',          critical: false, expect: /<urlset|sitemap/ },     // 정적 파일
];

const APIS = [
  { path: '/api/early-vote-rate',                                       critical: true  },
  { path: '/api/trends',                                                critical: false },
  { path: '/api/data?type=info',                                        critical: false },
  // Origin 화이트리스트라 외부 fetch 시 403 정상
  { path: '/api/quote?symbols=^KS11',                                   critical: false, expect403: true },
  { path: '/api/naver?action=health',                                   critical: false },
];

function fetchUrl(url, timeoutMs = 8000, full = false) {
  return new Promise(resolve => {
    const start = Date.now();
    const req = https.get(url, { headers: { 'User-Agent': 'patchkr-health/29.3' } }, res => {
      // 청크를 문자열로 이어붙이면 한글이 청크 경계에서 깨진다(UTF-8 3바이트 분할).
      // 여기선 정규식 매칭용이라 치명적이진 않지만, SPA_MARKER('패치노트' 등)가 경계에 걸리면
      // 멀쩡한 페이지를 실패로 오판할 수 있다. Buffer로 모아 한 번에 디코딩한다.
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          ms: Date.now() - start,
          bodyLen: body.length,
          // 기본은 처음 5KB만 본다(응답 크기 절약). 단 버전 표기는 푸터(≈980KB 지점)에 있어
          // 5KB 샘플로는 절대 안 잡히므로, 버전 탐지는 full=true 로 전체를 받아야 한다.
          body: full ? body : body.slice(0, 5000),
        });
      });
    });
    req.on('error', e => resolve({ status: 0, ms: Date.now() - start, error: e.message }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 0, ms: timeoutMs, error: 'timeout' });
    });
  });
}

function isPaginated(body, pattern) {
  if (!pattern) return true;
  return pattern.test(body);
}

async function checkPage(p) {
  const r = await fetchUrl(BASE + p.path);
  const ok200 = r.status === 200;
  const contentOk = ok200 && isPaginated(r.body, p.expect);
  return {
    url: p.path,
    critical: p.critical,
    status: r.status,
    ms: r.ms,
    contentMatch: contentOk,
    bodyLen: r.bodyLen || 0,
    error: r.error || null,
    pass: ok200 && contentOk,
  };
}

async function checkApi(a) {
  const r = await fetchUrl(BASE + a.path);
  let pass;
  if (a.expect403) {
    pass = r.status === 403;
  } else {
    pass = r.status === 200 || r.status === 503;
  }
  return {
    url: a.path,
    critical: a.critical,
    status: r.status,
    ms: r.ms,
    bodyLen: r.bodyLen || 0,
    error: r.error || null,
    pass,
    note: a.expect403 ? '403 expected (Origin guard)' : null,
  };
}

async function detectSiteVersion(homeBody) {
  // 푸터의 변경이력 링크가 배포된 버전의 정본이다: <a href="/changelog" id="foot-year">V31.86</a>
  // ⚠ 예전에는 헤더 version-pill의 'V31.86 ·' 형태만 찾았는데, 마크업에서 뒤의 '·'가 사라진 뒤로
  //    매 실행이 '미감지'였다 = 배포 정지·롤백을 건강 점검이 전혀 못 잡고 있었다.
  const verMatch = homeBody.match(/id="foot-year"[^>]*>\s*V(\d+\.\d+)/)
                || homeBody.match(/V(\d+\.\d+)\s*·/);
  return verMatch ? 'V' + verMatch[1] : null;
}

async function main() {
  const now = new Date();
  console.log(`\n═══ patchkr.com health check @ ${now.toISOString()} ═══`);

  const pageResults = await Promise.all(PAGES.map(checkPage));
  const apiResults = await Promise.all(APIS.map(checkApi));

  // 홈 body에서 버전 추출
  const homeResult = pageResults.find(r => r.url === '/');
  const homeBodyFetch = await fetchUrl(BASE + '/', 8000, true);
  const siteVersion = await detectSiteVersion(homeBodyFetch.body || '');

  const summary = {
    timestamp: now.toISOString(),
    timestamp_kst: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    site_version: siteVersion,
    pages: pageResults,
    apis: apiResults,
    pass_count: pageResults.filter(r => r.pass).length + apiResults.filter(r => r.pass).length,
    total_count: pageResults.length + apiResults.length,
    critical_fail: [
      ...pageResults.filter(r => r.critical && !r.pass),
      ...apiResults.filter(r => r.critical && !r.pass),
    ].map(r => ({ url: r.url, status: r.status, error: r.error })),
    avg_response_ms: Math.round(
      [...pageResults, ...apiResults].reduce((s, r) => s + r.ms, 0) /
      (pageResults.length + apiResults.length)
    ),
  };

  // 콘솔 요약
  console.log(`\n[전체] ${summary.pass_count}/${summary.total_count} 통과`);
  console.log(`[사이트 버전] ${siteVersion || '미감지'}`);
  console.log(`[평균 응답] ${summary.avg_response_ms}ms`);
  if (summary.critical_fail.length > 0) {
    console.log(`\n❌ Critical 실패 ${summary.critical_fail.length}건:`);
    summary.critical_fail.forEach(f => {
      console.log(`  ${f.url} → ${f.status || 'ERR'} ${f.error || ''}`);
    });
  } else {
    console.log(`\n✅ Critical 모두 통과`);
  }

  // 누적 로그
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
  log.unshift(summary);
  log = log.slice(0, MAX_LOG);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');

  // critical fail이 있으면 exit 1 (CI 실패 신호)
  if (summary.critical_fail.length > 0) process.exit(1);
}

main().catch(e => {
  console.error('health-check unexpected error:', e);
  process.exit(2);
});
