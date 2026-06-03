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

    // 선거종류=시·도지사선거 를 JS로 설정(셀렉트가 숨김/커스텀이라 selectOption 대신 value+change)
    const picked = await page.evaluate(() => {
      const ec = document.getElementById('electionCode');
      if (!ec) return 'no electionCode';
      const opt = [...ec.options].find(o => /시.?도지사/.test(o.text));
      if (!opt) return 'no 시도지사 opt';
      ec.value = opt.value;
      ec.dispatchEvent(new Event('change', { bubbles: true }));
      return 'electionCode=' + opt.value + ' (' + opt.text.trim() + ')';
    });
    console.log('[select]', picked);
    await page.waitForTimeout(1500);

    // 시도 = 전체 (모든 시도 한 표에)
    const cityPick = await page.evaluate(() => {
      const cc = document.getElementById('cityCode');
      if (!cc) return 'no cityCode';
      const opt = [...cc.options].find(o => /전\s*체/.test(o.text)) || cc.options[0];
      cc.value = opt.value; cc.dispatchEvent(new Event('change', { bubbles: true }));
      return 'cityCode=' + opt.value + ' (' + opt.text.trim() + ')';
    });
    console.log('[city]', cityPick);
    await page.waitForTimeout(1000);

    await clickSearch(page);
    await page.waitForTimeout(3500);

    // 시도명이 가장 많이 든 테이블의 행(헤더+데이터) 추출
    const grab = await page.evaluate(() => {
      const SD = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충청','충북','충남','전북','전라','전남','경상','경북','경남','제주'];
      let best = [], bestN = 0;
      for (const t of document.querySelectorAll('table')) {
        const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => (c.innerText || '').replace(/\s+/g, ' ').trim()));
        const n = rows.filter(r => r[0] && SD.some(s => r[0].startsWith(s))).length;
        if (n > bestN) { best = rows; bestN = n; }
      }
      return best;
    });
    console.log('[rows]', JSON.stringify(grab.slice(0, 3)).slice(0, 1600), '... 총', grab.length, '행');

    if (INSPECT) { console.log('[inspect] 완료'); process.exit(0); }

    // 헤더에서 정당 컬럼 라벨 추출(있으면)
    const PARTIES = ['더불어민주당','국민의힘','개혁신당','조국혁신당','진보당','정의당','무소속'];
    const header = grab.find(r => r.some(c => PARTIES.some(p => c.includes(p)))) || [];
    const colParty = {};
    header.forEach((c, i) => { const p = PARTIES.find(p => c.includes(p)); if (p) colParty[i] = p; });

    const SHORT = SIDO.map(s => s.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, ''));
    const fullName = sh => SIDO.find(s => s.startsWith(sh)) || sh;

    const regions = [];
    for (const r of grab) {
      if (!r[0]) continue;
      const sh = SHORT.find(s => r[0].startsWith(s));
      if (!sh) continue;
      const pcts = [];
      r.forEach((c, i) => { const m = String(c).match(/(\d{1,3}\.\d+)\s*%/); if (m) pcts.push({ i, v: parseFloat(m[1]) }); });
      if (!pcts.length) continue;
      const progress = pcts[pcts.length - 1].v;                  // 개표율(마지막 %)
      const cand = pcts.slice(0, -1).sort((a, b) => b.v - a.v);  // 후보 득표율 내림차순
      regions.push({
        sido: fullName(sh),
        progress,
        leader: cand[0] ? { party: colParty[cand[0].i] || '', rate: cand[0].v } : null,
        second: cand[1] ? { party: colParty[cand[1].i] || '', rate: cand[1].v } : null,
        won: r.some(c => /당선/.test(c)),
      });
    }
    console.log('[parse]', regions.length + '개 시도 · 정당컬럼 ' + Object.keys(colParty).length);

    if (!regions.length) { console.log('[skip] 개표 데이터 없음(개표 전/구조변경) — 기존 유지'); process.exit(0); }

    const out = {
      phase: Date.now() < Date.parse('2026-06-04T02:00:00+09:00') ? 'counting' : 'done',
      updatedAt: new Date().toISOString(),
      regions,
      _source: 'nec-headless-auto',
    };
    console.log(`[ok] 개표 ${regions.length}/17 시도 · 평균 개표율 ${(regions.reduce((a, b) => a + b.progress, 0) / regions.length).toFixed(1)}%`);
    if (DRY) { console.log('[dry]', JSON.stringify(out).slice(0, 600)); process.exit(0); }
    fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log('[written]', FILE);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('[error]', e && e.message); process.exit(1); });
