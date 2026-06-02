// V31.17 — 본투표(선거일) 투표율 무인 자동 갱신 (NEC 통계페이지 헤드리스 크롤)
// GitHub Actions에서 선거일(6/3) 투표시간 중 주기 실행.
// info.nec.go.kr "투·개표 → 투표율 현황" 표를 읽어 data/turnout-fallback.json 갱신.
// (사전투표용 fetch-vote-rate-nec.js의 본투표 버전)
//
// 안전장치:
//   - 선거일 투표시간(KST 6/3 06:00 ~ 18:50)에만 동작, 그 외 즉시 종료 (FORCE=1로 무시 가능)
//   - 합계 투표율 0~90% 범위 검증, 17 시도 다 못 읽으면 중단
//   - 새 값이 기존값보다 낮으면(파싱오류 의심) 스킵 — 투표율은 단조 증가
//   - DRY_RUN=1 이면 읽기만 하고 파일 미수정 (테스트용)
//   - NEC_URL 환경변수로 조회 문서 URL 오버라이드 가능 (메뉴 ID 변동 대비)

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'data', 'turnout-fallback.json');
const HOME = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
// 선거일 투표율 현황 문서. 메뉴 ID가 바뀌면 NEC_URL 로 덮어쓴다.
// 선거일 투표진행상황(=투표율) 문서: topMenuId=VC, secondMenuId=VCVP01 (NEC 메뉴맵 확인).
const REPORT_URL = process.env.NEC_URL
  || 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCVP01';
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';

const SIDO = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function inWindow() {
  const n = Date.now();
  return n >= Date.parse('2026-06-03T06:00:00+09:00') && n <= Date.parse('2026-06-03T18:50:00+09:00');
}
function phaseNow() {
  return Date.now() < Date.parse('2026-06-03T18:00:00+09:00') ? 'voting' : '종료';
}
// NEC '투표진행상황' 표 컬럼 예: [구분, 당일대상선거인수, 사전투표수, 선거인수(계), 당일투표수, …, 당일투표율%]
// 위치에 의존하지 않고 값으로 판별:
//   - 선거인수(계) = 가장 큰 정수, 당일대상선거인수 = 두번째 큰 정수
//   - 사전투표수 = 선거인수 - 당일대상 (사전투표자는 당일 대상에서 제외됨)
//   - 페이지 투표율(%) = 소수점 퍼센트 셀 → 당일투표율 → 당일투표수 = 선거인수 × 당일율
//   - ★누적 투표율 = (사전투표수 + 당일투표수) / 선거인수  (언론 보도·헤드라인 기준)
function parseRows(rows) {
  const out = {};
  for (const c of rows) {
    const name = (c[0] || '').trim();
    if (name !== '합계' && !SIDO.includes(name)) continue;
    let dayPct = NaN;
    const ints = [];
    for (const cell of c.slice(1)) {
      const s = (cell || '').replace(/[,%\s]/g, '');
      if (/^\d{1,3}\.\d+$/.test(s)) { const v = parseFloat(s); if (v >= 0 && v <= 100 && isNaN(dayPct)) dayPct = v; }
      else if (/^\d{2,}$/.test(s)) ints.push(parseInt(s, 10));
    }
    if (isNaN(dayPct) || ints.length < 2) continue;
    ints.sort((a, b) => b - a);
    const eligible = ints[0];
    const dayElig = ints[1];
    const preVote = Math.max(0, eligible - dayElig);
    const dayVote = Math.round(eligible * dayPct / 100);
    const count = preVote + dayVote;                                   // 누적 투표수
    const rate = eligible ? +(count / eligible * 100).toFixed(2) : NaN; // 누적 투표율
    if (!isNaN(rate) && eligible > 0) out[name] = { eligible, count, rate, dayRate: dayPct };
  }
  return out;
}

async function clickSearch(page) {
  const candidates = [
    page.getByRole('button', { name: '검색', exact: true }),
    page.locator('button', { hasText: '검색' }).filter({ hasNotText: '통합' }),
    page.locator('a', { hasText: '검색' }).filter({ hasNotText: '통합' }),
    page.locator('input[value="검색"], input[value*="검색"]'),
    page.locator(':text-is("검색")'),
  ];
  for (const loc of candidates) {
    try { if (await loc.count()) { await loc.first().click({ timeout: 12000 }); return; } } catch {}
  }
  throw new Error('검색 버튼을 찾지 못함');
}

(async () => {
  if (!inWindow() && !FORCE) { console.log('[skip] 선거일 투표시간 아님 (FORCE=1로 강제 가능)'); process.exit(0); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let parsed = null;
  try {
    const page = await browser.newPage({ userAgent: UA, locale: 'ko-KR' });
    await page.goto(HOME, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByText('투·개표', { exact: true }).first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 메뉴에서 '투표율'(선거일) 문서 링크를 동적 탐색 — 메뉴 ID 추정/변동 회피.
    // NEC_URL 환경변수가 있으면 그걸 우선 사용.
    let target = REPORT_URL;
    if (!process.env.NEC_URL) {
      const menu = await page.evaluate(() =>
        [...document.querySelectorAll('a')]
          .map(a => ({ t: (a.textContent || '').replace(/\s+/g, ' ').trim(), h: a.href || '' }))
          .filter(x => x.h && /showDocument|secondMenuId|menuId/.test(x.h) && x.t)
      );
      console.log('[menu] 후보 링크:', JSON.stringify(menu.slice(0, 50)));
      const pick = menu.find(x => /투표진행상황/.test(x.t) && !/사전/.test(x.t))
                || menu.find(x => /투표율/.test(x.t) && !/사전|개표/.test(x.t));
      if (pick) { target = pick.h; console.log('[menu] 선택:', pick.t, '->', target); }
      else console.log('[menu] 투표율 링크 못 찾음 — 기본 REPORT_URL 사용');
    }
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    await clickSearch(page);
    await page.waitForSelector('text=합계', { timeout: 40000 });
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => {
      const result = [];
      document.querySelectorAll('table tr').forEach(tr => {
        const c = [...tr.querySelectorAll('td,th')].map(x => (x.innerText || '').replace(/\s+/g, ' ').trim());
        if (c.length >= 4) result.push(c);
      });
      return result;
    });
    const sumRow = rows.find(c => (c[0] || '').trim() === '합계');
    if (sumRow) console.log('[debug] 합계 row:', JSON.stringify(sumRow));
    parsed = parseRows(rows);
  } finally {
    await browser.close();
  }

  if (!parsed || !parsed['합계']) { console.error('[fail] 합계 행 파싱 실패 (메뉴 URL 확인 필요 — NEC_URL)'); process.exit(1); }
  const total = parsed['합계'];
  const regionCount = SIDO.filter(s => parsed[s]).length;
  if (!(total.rate > 0 && total.rate <= 90)) { console.error('[fail] 합계율 범위 이상:', total.rate); process.exit(1); }
  if (regionCount < 17) { console.error('[fail] 시도 누락:', regionCount + '/17'); process.exit(1); }

  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  if (cur.rate != null && total.rate < cur.rate - 0.01) {
    console.error(`[skip] 새 값(${total.rate}%)이 기존(${cur.rate}%)보다 낮음 — 파싱오류 의심, 미반영`);
    process.exit(0);
  }

  const byRegion = {};
  for (const s of SIDO) if (parsed[s]) byRegion[s] = parsed[s].rate;

  const out = {
    ...cur,
    rate: total.rate,
    phase: phaseNow(),
    turnoutCount: total.count,
    totalVoters: total.eligible || cur.totalVoters || 44649908,
    byRegion,
    announcedAt: new Date().toISOString(),
    _lastUpdate: new Date().toISOString(),
    _source: 'nec-headless-auto',
  };

  console.log(`[ok] 합계 ${total.rate}% (${total.count.toLocaleString()}명) · 시도 ${regionCount}/17`);
  if (DRY) { console.log('[dry-run] 파일 미수정\n' + JSON.stringify(out, null, 0).slice(0, 600)); process.exit(0); }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('[written]', FILE);
})().catch(e => { console.error('[error]', e && e.message); process.exit(1); });
