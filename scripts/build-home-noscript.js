#!/usr/bin/env node
/**
 * index.html 의 <noscript> 블록을 실제 데이터에서 다시 만든다.
 *
 * 왜 필요한가: 홈은 SPA라 자바스크립트를 실행하지 않는 크롤러·애드센스 심사가 보는 것은
 * <noscript> 안의 글이 전부다. 그런데 이 블록이 손으로 쓴 고정 텍스트라 데이터와 따로 놀았다.
 * 2026-09-21 점검 실측:
 *   환율 1,530원 권 → 실제 1,368.3 / 코스피 9,000pt 권 → 6,718 / 코스닥 960pt 권 → 816
 *   가계부채 91.2% → 97.2 / 수출 6,838억$ → 7,100 / 행정부 80명 → 79 / sitemap 275 URL → 5,219
 * 즉 검색엔진이 보는 유일한 본문이 가장 낡아 있었다. 이제 매일 데이터에서 생성한다.
 *
 * 분량도 같이 늘린다(706단어 → 기사 목록·곧 시행 법령을 실어 3배 이상).
 * 애드센스 '가치 없는 콘텐츠' 반려의 직접 원인이 홈의 무JS 빈약함이었다.
 *
 * 실행: node scripts/build-home-noscript.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const START = '<!-- HOME-NOSCRIPT:START -->';
const END = '<!-- HOME-NOSCRIPT:END -->';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const num = (n) => Number(n).toLocaleString('en-US');

function locCount(file) {
  try { return (fs.readFileSync(path.join(ROOT, file), 'utf8').match(/<loc>/g) || []).length; }
  catch { return 0; }
}

function main() {
  const eco = read('data/economy.json');
  const pol = read('data/politicians.json');
  const asmRaw = read('data/assembly-22.json');
  const asm = Array.isArray(asmRaw) ? asmRaw : (asmRaw.members || []);
  const gl = read('data/glossary.json');
  const arts = read('data/articles.json').items || [];
  const radar = read('data/law/radar.json');
  const lawMeta = read('data/law/meta.json');

  let html = fs.readFileSync(HTML, 'utf8');
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const bills = (html.match(/22대 (?:국회 )?(?:통과 )?법안 ([\d,]+)건/) || [])[1] || '';

  // 지표 — 마지막으로 값이 있는 연도를 쓴다(연중 미확정 지표는 전년이 최신이다)
  const ind = (id) => {
    const x = eco.indicators.find((v) => v.id === id);
    if (!x || !x.data.length) return null;
    const d = x.data[x.data.length - 1];
    return { label: x.label, unit: x.unit, year: d.year, value: d.value };
  };
  const ECO_IDS = ['base_rate', 'usd_krw', 'cpi', 'unemployment', 'gdp_growth', 'kospi', 'kosdaq', 'household_debt_ratio', 'export'];
  const ecoLis = ECO_IDS.map(ind).filter(Boolean).map((v) =>
    `    <li><b>${esc(v.label)}</b> ${num(v.value)}${esc(v.unit)} <span style="color:#6b7280">(${v.year})</span></li>`).join(nl);

  const byGroup = {};
  for (const p of pol.people) byGroup[p.group] = (byGroup[p.group] || 0) + 1;

  // 최근 기사 12편 — 무JS 본문 분량의 핵심이자 실제 색인 가치가 있는 부분
  const recent = arts.slice(0, 12).map((a) =>
    `    <li><a href="https://patchkr.com${esc(a.url)}"><b>${esc(a.title)}</b></a> <span style="color:#6b7280">${esc(a.date)}${a.kicker ? ' · ' + esc(a.kicker) : ''}</span><br>` +
    `<span style="color:#374151">${esc(String(a.desc).slice(0, 170))}…</span></li>`).join(nl);

  // 곧 시행되는 법령 10건 (시행일 임박순)
  const soon = radar.items.slice(0, 10).map((it) => {
    const ef = it.ef.slice(0, 4) + '-' + it.ef.slice(4, 6) + '-' + it.ef.slice(6, 8);
    const arts10 = (it.arts || []).slice(0, 3).join(' ');
    return `    <li><b>${ef}</b> 시행 — <a href="https://patchkr.com/law-radar/${esc((it.tags || [])[0] || '')}.html">${esc(it.name)}</a>` +
           ` <span style="color:#6b7280">${esc(it.kind)}·${esc(it.dept)}${arts10 ? ' · ' + esc(arts10) : ''}</span></li>`;
  }).join(nl);

  const domains = radar.domains.filter((d) => d.count)
    .map((d) => `<a href="https://patchkr.com/law-radar/${d.id}.html">${esc(d.label)} ${d.count}</a>`).join(' · ');

  const smTotal = locCount('sitemap.xml') + locCount('sitemap-law.xml');
  const today = new Date().toISOString().slice(0, 10);

  const block = [
    START,
    '<div style="max-width:900px;margin:40px auto;padding:30px;font-family:\'Pretendard Variable\',\'Inter\',sans-serif">',
    '  <h1 style="font-size:32px">대한민국 패치노트 — 한국 정치·법안·선거·경제 공공데이터</h1>',
    `  <p style="font-size:17px;color:#374151;line-height:1.6">국회·중앙선거관리위원회·한국은행·법제처 등 <b>공식 출처의 수치</b>를 모아 검색·비교·시각화하는 무료 데이터 사이트입니다. 해석보다 수치를 싣고, 모든 항목에 원본 출처를 표기합니다. 이 페이지는 자바스크립트 없이 보이는 요약이며, 전체 기능은 자바스크립트를 켜면 이용할 수 있습니다. <span style="color:#6b7280">(${today} 기준 자동 생성)</span></p>`,
    '',
    `  <h2 style="margin-top:24px">📜 법령 — 곧 시행되는 것부터</h2>`,
    `  <p style="color:#374151">공포는 끝났고 <b>시행일만 남은 법령이 ${num(radar.total)}건</b>입니다. 업무 분야로 추려 볼 수 있습니다 → <a href="https://patchkr.com/law-radar.html">곧 시행되는 법령</a></p>`,
    '  <ul style="line-height:1.9">',
    soon,
    '  </ul>',
    `  <p style="font-size:14px">분야별: ${domains}</p>`,
    `  <p style="font-size:13px;color:#6b7280">법제처 국가법령정보 신구조문대비표 ${num(lawMeta.total)}건(현행 ${num(lawMeta.current)}건) 기준 · <a href="https://patchkr.com/law-diff.html">법령 신구비교</a> · <a href="https://patchkr.com/law-changes.html">법령 변경 랭킹</a></p>`,
    '',
    '  <h2 style="margin-top:24px">📂 최근 분석·기록</h2>',
    `  <p style="color:#374151">1차 자료를 직접 확인해 작성한 기사 <b>${arts.length}편</b>. 사실과 주장을 구분하고, 확인하지 못한 것은 본문에 그대로 적습니다.</p>`,
    '  <ul style="line-height:1.8">',
    recent,
    '  </ul>',
    '  <p style="font-size:13px;color:#6b7280">→ <a href="https://patchkr.com/analysis.html">분석·기록 전체</a> · <a href="https://patchkr.com/feed.xml">RSS</a></p>',
    '',
    '  <h2 style="margin-top:24px">💰 한국 경제 주요 지표</h2>',
    '  <ul style="line-height:1.8">',
    ecoLis,
    '  </ul>',
    '  <p style="font-size:13px;color:#6b7280">출처: 한국은행 ECOS·통계청·관세청 · 시점형 지표(금리·환율·주가)의 당해 연도 값은 연말 확정치가 아니라 갱신일 기준 최신 종가입니다 · → <a href="https://patchkr.com/economy">전체 시계열 2015~2026</a></p>',
    '',
    '  <h2 style="margin-top:24px">🏛 인물·국회</h2>',
    '  <ul style="line-height:1.8">',
    `    <li><b>22대 국회의원</b> ${num(asm.length)}명 — 국회 OPEN API 라이브 (정원 300석) → <a href="https://patchkr.com/group/legislative">입법부</a></li>`,
    `    <li><b>정치인 도감</b> ${num(pol.people.length)}명 — 행정부 ${byGroup.executive || 0} · 지방 ${byGroup.local || 0} · 사법 ${byGroup.judicial || 0} · 역대 ${byGroup.historical || 0} → <a href="https://patchkr.com/dex">도감</a></li>`,
    `    <li><b>22대 본회의 통과 법안</b> ${bills}건 — 발의자·정당·위원회·분야별 → <a href="https://patchkr.com/bills">법안</a></li>`,
    `    <li><b>용어 사전</b> ${num(gl.terms.length)}개 / ${Object.keys(gl.categories).length}개 분류 → <a href="https://patchkr.com/glossary">용어</a></li>`,
    '  </ul>',
    '',
    '  <h2 style="margin-top:24px">🗳 선거 기록</h2>',
    '  <ul style="line-height:1.8">',
    '    <li><b>9회 전국동시지방선거</b> (2026.6.3) — 광역단체장 17·기초단체장 226·교육감 17, 총 4,040석 → <a href="https://patchkr.com/election2026">결과</a></li>',
    '    <li><b>역대 비교</b> — 7·8·9회 지방선거 결과 대조 · 8회 공약 이행 추적 → <a href="https://patchkr.com/election2026">지선 페이지</a></li>',
    '    <li><b>정치 분포 지도</b> — 17개 시도 + 226개 시군구 → <a href="https://patchkr.com/map">지도</a></li>',
    '  </ul>',
    '',
    '  <h2 style="margin-top:24px">🔗 주요 페이지</h2>',
    '  <ul style="line-height:1.8">',
    '    <li><a href="https://patchkr.com/law-radar.html">곧 시행되는 법령 — 업무 분야별</a></li>',
    '    <li><a href="https://patchkr.com/law-diff.html">법령 신구조문대비표 검색</a></li>',
    '    <li><a href="https://patchkr.com/analysis.html">분석·기록</a></li>',
    '    <li><a href="https://patchkr.com/economy">경제 지표</a> · <a href="https://patchkr.com/crisis.html">국가 지표 신호등</a></li>',
    '    <li><a href="https://patchkr.com/committees">국회 위원회</a> · <a href="https://patchkr.com/rankings">의원 활동 랭킹</a></li>',
    '    <li><a href="https://patchkr.com/world">국제 비교 12개국</a> · <a href="https://patchkr.com/english.html">Korea, Explained (English)</a></li>',
    '    <li><a href="https://patchkr.com/about">사이트 소개</a> · <a href="https://patchkr.com/business">광고·데이터 문의</a> · <a href="https://patchkr.com/changelog">변경 이력</a> · <a href="https://patchkr.com/developers">개발자·AI 가이드</a></li>',
    '  </ul>',
    '',
    '  <p style="font-size:13px;color:#6b7280;margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb">',
    '    <b>출처</b>: 국회 OPEN API · 중앙선거관리위원회(data.go.kr) · 한국은행 ECOS · 법제처 국가법령정보 · 통계청 · 위키미디어 · IPU Parline · EIU · RSF · TI · OECD<br>',
    '    <b>라이선스</b>: 공공누리 1유형 · CC BY-SA 4.0(위키) · MIT(사이트 코드)<br>',
    `    <b>AI 친화</b>: <a href="https://patchkr.com/llms.txt">/llms.txt</a> · <a href="https://patchkr.com/llms-full.txt">/llms-full.txt</a> · <a href="https://patchkr.com/sitemap.xml">/sitemap.xml</a> + <a href="https://patchkr.com/sitemap-law.xml">/sitemap-law.xml</a> (합계 ${num(smTotal)} URL)<br>`,
    '    <b>운영</b>: 한양텍(HYT) · 대표 차민수 · 사업자등록번호 555-46-01185 · 본 사이트는 특정 정당·후보를 지지하거나 반대하지 않으며, 정보 제공용입니다.',
    '  </p>',
    '</div>',
    END,
  ].join(nl);

  if (!html.includes(START)) {
    console.error('❌ index.html에 HOME-NOSCRIPT 마커가 없습니다. <noscript> 안에 마커를 넣어 주세요.');
    process.exit(1);
  }
  const before = html;
  html = html.replace(new RegExp(START + '[\\s\\S]*?' + END), () => block);
  if (html === before) { console.log('⏸ 변경 없음'); return; }
  fs.writeFileSync(HTML, html, 'utf8');

  const words = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
  console.log(`✅ 홈 <noscript> 재생성 — 약 ${words}단어 (기사 ${Math.min(12, arts.length)}편 · 시행 예정 법령 10건 · 지표 ${ECO_IDS.length}종)`);
}

main();
