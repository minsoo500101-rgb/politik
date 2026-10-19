#!/usr/bin/env node
/**
 * 관제 화면(/eye.html) 데이터 — data/eye.json 하나로 모은다(UI 전면 개편, 시안 D).
 *
 * 화면이 여러 파일(법령 레이더 240KB 등)을 다 받지 않게, 필요한 몇 줄만 뽑아 작은 파일로 만든다.
 *  - 최근 사안: index.html 의 homeIssueItems() 배열(홈과 같은 원본) 최근 12건
 *    · 지역은 본문에 지명이 '직접' 나올 때만 붙인다(부천→경기 등). 국회·법원 같은 기관 소재지는 지역으로 치지 않는다.
 *  - 광역단체장(9회 지선) · 22대 국회 의석 · 곧 시행되는 법령(임박 8건·분야별 수) · 경제 지표 · 윤석열 형사사건(data/yoon-cases.json)
 * 또 eye.html 의 <noscript> 요약(검색엔진·JS 없는 접속용)을 같은 데이터로 다시 쓴다.
 *
 * 사용: node scripts/build-eye-data.js   (기사 등록 뒤·daily-sync 에서 실행)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// 1) 최근 사안 — 홈과 같은 배열
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const a = idx.indexOf('var items=[', idx.indexOf('function homeIssueItems'));
const b = idx.indexOf('];', a);
// eslint-disable-next-line no-eval
const items = eval(idx.slice(a + 10, b + 1)).sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0));
const PLACES = [
  [/북한|평양|북측/, '북측'], [/부천|수원|성남|고양|용인|화성|평택|경기/, '경기'], [/부산/, '부산'], [/대구/, '대구'], [/인천/, '인천'],
  [/광주|전남|목포|여수|순천/, '전남광주'], [/대전/, '대전'], [/울산/, '울산'], [/세종시|세종특별/, '세종'], [/강원|춘천|강릉|원주/, '강원'],
  [/충북|청주|충주/, '충북'], [/충남|천안|아산/, '충남'], [/전북|전주|군산/, '전북'], [/경북|포항|구미|안동/, '경북'], [/경남|창원|김해|거제|양산/, '경남'], [/제주/, '제주'],
  [/서울(?!고법|고등법원|중앙지법|중앙지검|행정법원|남부지법|북부지법)/, '서울'],
];
const regionOf = (t) => { for (const [re, r] of PLACES) if (re.test(t)) return r; return null; };
const strip = (s) => String(s).replace(/<\/?b>/g, '');
const issues = items.slice(0, 12).map((x) => ({
  d: x.d, tt: strip(x.tt), sub: strip(x.sub), big: (String(x.sub).match(/<b>([^<]+)<\/b>/) || [])[1] || '', href: x.href,
  r: regionOf(strip(x.tt) + ' ' + strip(x.sub)),
}));

// 2) 광역단체장
const el = read('data/election_2026_results.json').election;
const governors = el.governors.map((g) => ({ r: g.region.replace('전남광주통합특별시', '전남광주'), name: g.winner, party: g.winner_party }));

// 3) 의석
const seats = {};
for (const m of read('data/assembly-22.json').members) { const p = m.POLY_NM || m.party || '기타'; seats[p] = (seats[p] || 0) + 1; }

// 4) 곧 시행되는 법령
const radar = read('data/law/radar.json');
const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const asOf = radar.asOf;
const domLabel = Object.fromEntries((radar.domains || []).map((d) => [d.id, d.label]));
const laws = {
  asOf, total: radar.total,
  soon30: radar.items.filter((i) => (day(i.ef) - day(asOf)) / 864e5 <= 30).length,
  next: radar.items.slice(0, 8).map((i) => ({ name: i.name, ef: i.ef, dom: domLabel[(i.tags || [])[0]] || '기타' })),
  domains: (radar.domains || []).filter((d) => d.count).map((d) => ({ id: d.id, label: d.label, n: d.count })).sort((x, y) => y.n - x.n),
};

// 5) 경제 지표 — 시점형 지표의 진행 연도 최신값
const eco = read('data/economy.json');
const last = (id) => { const ind = eco.indicators.find((x) => x.id === id); const pts = (ind && (ind.series || ind.values || ind.data)) || []; const p = pts.filter((q) => q.value != null).slice(-1)[0]; return p ? p.value : null; };
const economy = { updatedAt: eco.updatedAt, usd_krw: last('usd_krw'), base_rate: last('base_rate'), kospi: last('kospi'), household_debt: last('household_debt_ratio') };

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  issues, governors, seats, laws, economy,
  yoon: read('data/yoon-cases.json'),
  counts: { articles: (() => { const x = read('data/articles.json'); return (Array.isArray(x) ? x : x.articles || x.items).length; })(), members: Object.values(seats).reduce((s, n) => s + n, 0) },
};
fs.writeFileSync(path.join(ROOT, 'data/eye.json'), JSON.stringify(out));

// 6) eye.html <noscript> 요약
const ep = path.join(ROOT, 'eye.html');
if (fs.existsSync(ep)) {
  let s = fs.readFileSync(ep, 'utf8');
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ns = `<!-- EYE-NOSCRIPT:START --><div style="max-width:860px;margin:24px auto;padding:0 16px;color:#e8f4f1;font-family:sans-serif;line-height:1.7">` +
    `<h1>대한민국 패치노트 관제 화면</h1><p>국회·법령·재판·경제·지역 사안을 한 화면에서 보는 페이지다. 기준일 ${out.generatedAt}.</p>` +
    `<h2>최근 사안</h2><ul>${issues.map((i) => `<li>${esc(i.d)} <a href="${i.href}">${esc(i.tt)}</a> — ${esc(i.sub)}</li>`).join('')}</ul>` +
    `<h2>곧 시행되는 법령</h2><p>공포는 끝났고 시행일만 남은 법령 ${laws.total}건, 30일 안에 ${laws.soon30}건(${asOf} 기준). <a href="/law-radar.html">업무 분야별로 보기</a></p>` +
    `<h2>22대 국회</h2><p>${Object.entries(seats).sort((x, y) => y[1] - x[1]).map(([p, n]) => `${esc(p)} ${n}`).join(' · ')}</p>` +
    `<h2>윤석열 전 대통령 형사사건</h2><ul>${out.yoon.cases.map((c) => `<li>${esc(c.id)}: ${c.s.filter(Boolean).map((x) => esc(x[1])).join(' → ')} — ${esc(c.note)}</li>`).join('')}</ul>` +
    `</div>` +
    // 홈(/)이 이 화면이 됐으므로(V32.1) 크롤러·애드센스 심사가 읽던 홈 본문(noscript, 약 1,200단어)도 함께 싣는다 — 원본은 build-home-noscript.js
    ((idx.match(/<!-- HOME-NOSCRIPT:START -->([\s\S]*?)<!-- HOME-NOSCRIPT:END -->/) || [])[1] || '') +
    `<!-- EYE-NOSCRIPT:END -->`;
  s = s.replace(/<!-- EYE-NOSCRIPT:START -->[\s\S]*?<!-- EYE-NOSCRIPT:END -->/, ns);
  fs.writeFileSync(ep, s);
}
console.log(`✅ data/eye.json — 사안 ${issues.length}(지역 ${issues.filter((i) => i.r).length}) · 단체장 ${governors.length} · 의석 ${out.counts.members} · 법령 ${laws.total}/${laws.soon30} · 경제 ${economy.updatedAt}`);
