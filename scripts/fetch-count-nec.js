// V31.18 — 시도지사 실시간 개표 (NEC 개표진행상황 헤드리스 크롤)
// 개표(2026-06-03 18:00~) 동안 주기 실행. info.nec.go.kr 개표진행상황 → 17 시도지사 결과.
// 1차: 페이지 구조 조사(덤프) 후 파서 확정. (투표율 크롤러의 개표 버전)
//
// env: DRY_RUN(파일 미저장), FORCE(시간 무시), NEC_URL(문서 URL 오버라이드), INSPECT(구조 덤프만)

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'data', 'count-fallback.json');
const HOME = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
const REPORT_URL = process.env.NEC_URL || '';   // 비면 메뉴에서 '개표진행상황' 동적 탐색
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';
const INSPECT = process.env.INSPECT === '1' || process.env.INSPECT === 'true';

const SIDO = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function inWindow() {
  const n = Date.now();
  return n >= Date.parse('2026-06-03T18:00:00+09:00') && n <= Date.parse('2026-06-04T04:00:00+09:00');
}

async function clickSearch(page) {
  const cands = [
    page.getByRole('button', { name: '검색', exact: true }),
    page.locator('button', { hasText: '검색' }).filter({ hasNotText: '통합' }),
    page.locator('a', { hasText: '검색' }).filter({ hasNotText: '통합' }),
    page.locator('input[value="검색"], input[value*="검색"]'),
    page.locator(':text-is("검색")'),
  ];
  for (const loc of cands) { try { if (await loc.count()) { await loc.first().click({ timeout: 12000 }); return true; } } catch {} }
  return false;
}

(async () => {
  if (!inWindow() && !FORCE && !INSPECT) { console.log('[skip] 개표시간 아님 (FORCE/INSPECT로 강제)'); process.exit(0); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: UA, locale: 'ko-KR' });
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1000);
    await page.getByText('투·개표', { exact: true }).first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    let target = REPORT_URL;
    if (!target) {
      const menu = await page.evaluate(() =>
        [...document.querySelectorAll('a')]
          .map(a => ({ t: (a.textContent || '').replace(/\s+/g, ' ').trim(), h: a.href || '' }))
          .filter(x => x.h && /showDocument|secondMenuId/.test(x.h) && x.t));
      const pick = menu.find(x => /개표진행상황/.test(x.t)) || menu.find(x => /개표/.test(x.t) && !/단위/.test(x.t));
      if (pick) { target = pick.h; console.log('[menu] 개표 선택:', pick.t, '->', target); }
      else { console.log('[menu] 개표 링크 못 찾음. 후보:', JSON.stringify(menu.slice(0, 40))); process.exit(1); }
    }
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);

    // 선거종류 셀렉트 구조 덤프 + 시도지사 선택 시도
    const selInfo = await page.evaluate(() =>
      [...document.querySelectorAll('select')].map((s, i) => ({ i, id: s.id || '', name: s.name || '', opts: [...s.options].map(o => o.text.replace(/\s+/g, ' ').trim()) })));
    console.log('[selects]', JSON.stringify(selInfo).slice(0, 1200));

    // '시·도지사' 옵션이 있는 select에서 선택
    for (const s of selInfo) {
      const idx = s.opts.findIndex(o => /시.?도지사|광역단체장/.test(o));
      if (idx >= 0) {
        try {
          const sel = page.locator('select').nth(s.i);
          await sel.selectOption({ index: idx });
          console.log('[select] 시도지사 선택 select#' + s.i + ' opt:', s.opts[idx]);
          await page.waitForTimeout(1200);
        } catch (e) { console.log('[select] 실패:', e.message); }
        break;
      }
    }

    await clickSearch(page);
    await page.waitForTimeout(2800);

    // 테이블 구조 덤프 (상위 3개 테이블, 각 6행)
    const dump = await page.evaluate(() => {
      return [...document.querySelectorAll('table')].slice(0, 4).map((t, ti) => ({
        ti,
        cap: (t.caption ? t.caption.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 60),
        rows: [...t.querySelectorAll('tr')].slice(0, 7).map(tr =>
          [...tr.querySelectorAll('th,td')].map(c => (c.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 14)),
      }));
    });
    console.log('[dump]', JSON.stringify(dump).slice(0, 3500));

    if (INSPECT) { console.log('[inspect] 구조 덤프 완료'); process.exit(0); }
    // (파서는 구조 확인 후 추가)
    console.log('[note] 파서 미구현 — INSPECT로 구조 먼저 확인');
    process.exit(0);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('[error]', e && e.message); process.exit(1); });
