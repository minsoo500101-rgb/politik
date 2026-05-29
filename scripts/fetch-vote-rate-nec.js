// V30.0 — 사전투표율 무인 자동 갱신 (NEC 통계페이지 헤드리스 크롤)
// GitHub Actions에서 사전투표 기간 매시 :55 실행.
// NEC "사전투표진행상황(위원회별)" 표를 읽어 data/early-vote-fallback.json 갱신.
// 봇차단(302→access error)은 실제 크로미움(Playwright)으로 우회됨.
//
// 안전장치:
//   - 사전투표 기간(KST 5/29 06:00 ~ 5/30 18:40)에만 동작, 그 외 즉시 종료
//   - 합계 투표율 0~35% 범위 검증, 17 시도 다 못 읽으면 중단
//   - 새 값이 기존값보다 낮으면(파싱오류 의심) 스킵 — 투표율은 단조 증가
//   - DRY_RUN=1 이면 읽기만 하고 파일 미수정 (테스트용)

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'data', 'early-vote-fallback.json');
const HOME = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const SIDO = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function inWindow() {
  const n = Date.now();
  return n >= Date.parse('2026-05-29T06:00:00+09:00') && n <= Date.parse('2026-05-30T18:40:00+09:00');
}
function phaseNow() {
  const n = Date.now();
  if (n < Date.parse('2026-05-29T18:00:00+09:00')) return '1일차';
  if (n < Date.parse('2026-05-30T06:00:00+09:00')) return '1일차_종료';
  return '2일차';
}
function parseRows(rows) {
  const out = {};
  for (const c of rows) {
    const name = (c[0] || '').trim();
    if (name !== '합계' && !SIDO.includes(name)) continue;
    const eligible = parseInt((c[1] || '').replace(/[^\d]/g, ''), 10);
    const count = parseInt((c[2] || '').replace(/[^\d]/g, ''), 10);
    const rate = parseFloat((c[3] || '').replace(/[^\d.]/g, ''));
    if (!isNaN(rate)) out[name] = { eligible, count, rate };
  }
  return out;
}

async function clickSearch(page) {
  // "통합검색"(헤더)이 아닌 조회조건의 검색 버튼을 여러 전략으로 시도
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
  if (!inWindow()) { console.log('[skip] 사전투표 기간 아님'); process.exit(0); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let parsed = null;
  try {
    const page = await browser.newPage({ userAgent: UA, locale: 'ko-KR' });
    const REPORT_URL = 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCAP01';
    await page.goto(HOME, { waitUntil: 'networkidle', timeout: 60000 });
    // 투·개표 진입(세션 컨텍스트 확보) 후 위원회별 페이지로 직접 이동
    // — 서브메뉴 링크가 DOM엔 있으나 hidden이라 클릭 대신 href로 goto
    await page.getByText('투·개표', { exact: true }).first().click({ timeout: 15000 }).catch(() => {});
    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    // 검색 (시도=전체, 투표일자=전체 기본값)
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
    parsed = parseRows(rows);
  } finally {
    await browser.close();
  }

  if (!parsed || !parsed['합계']) { console.error('[fail] 합계 행 파싱 실패'); process.exit(1); }
  const total = parsed['합계'];
  const regionCount = SIDO.filter(s => parsed[s]).length;
  if (!(total.rate > 0 && total.rate <= 35)) { console.error('[fail] 합계율 범위 이상:', total.rate); process.exit(1); }
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
    totalVoters: total.eligible,
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
