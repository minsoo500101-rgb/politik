#!/usr/bin/env node
/**
 * 분야별 기사 커버리지 점검 — V31.81
 *
 * 운영 방침: 기사 라운드마다 6개 분야를 최소 1편씩 채운다.
 * 이 스크립트는 각 기사 HTML의 kicker와 ld+json datePublished를 읽어
 * 분야별 최신 발행일과 경과일을 출력한다. 기사 쓰기 전에 먼저 돌려
 * 어느 분야가 비었는지 확인하는 용도.
 *
 * 실행: node scripts/article-coverage.js [기준일 YYYY-MM-DD]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10);
const STALE_DAYS = 30; // 이 이상 지나면 '보강 필요'

// kicker 텍스트 → 분야 매핑. 새 분야 라벨이 생기면 여기에 추가한다.
const DOMAINS = [
  { key: '정당·정치', re: /정당|전당대회|대통령|총리|개각|선거|지방선거|정치|지방행정|광역|ELECTION/i },
  { key: '안보·외교', re: /안보|국방|외교|한미|북한|군사|DMZ|최전방/ },
  { key: '사회·재난', re: /사회|재난|기후|사고|인구|노동|의료|기념일|현충일|월드컵|스포츠/ },
  { key: '국회·입법', re: /국회|입법|법안|헌법재판소|헌재|예산|표현의 자유|^📜|법·/ },
  { key: '경제·산업', re: /경제|산업|수출|한국은행|통화|금리|부동산|증시|기업/ },
  { key: '사법·수사', re: /사법|검찰|수사|법원|대법원|판결|재판|헌정사|팩트체크|Constitutional/i },
];

function collect() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html') || f === 'index.html') continue;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = h.match(/<script type="application\/ld\+json">(\{"@context[\s\S]*?)<\/script>/);
    if (!m) continue;
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    if (j['@type'] !== 'NewsArticle' && j['@type'] !== 'Article') continue;
    const kicker = (h.match(/<div class="kicker">([^<]*)</) || [])[1] || '';
    out.push({ file: f, date: j.datePublished || '', kicker: kicker.trim(), lang: j.inLanguage || 'ko' });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

const arts = collect();
if (!arts.length) { console.error('기사를 찾지 못했습니다.'); process.exit(1); }

console.log(`기준일 ${TODAY} · 기사 ${arts.length}편\n`);
console.log('분야별 최신 기사');
console.log('─'.repeat(74));

const unmatched = new Set(arts.map(a => a.file));
let gaps = 0;

for (const d of DOMAINS) {
  const hits = arts.filter(a => d.re.test(a.kicker));
  hits.forEach(a => unmatched.delete(a.file));
  const latest = hits[0];
  if (!latest) {
    console.log(`  ❌ ${d.key.padEnd(10)} 기사 없음`);
    gaps++;
    continue;
  }
  const age = daysBetween(latest.date, TODAY);
  const mark = age > STALE_DAYS ? '⚠' : '✅';
  if (age > STALE_DAYS) gaps++;
  console.log(`  ${mark} ${d.key.padEnd(10)} ${latest.date}  (${String(age).padStart(3)}일 전)  ${latest.file}`);
  console.log(`     ${String(hits.length).padStart(2)}편 · ${latest.kicker}`);
}

console.log('─'.repeat(74));
if (unmatched.size) {
  console.log(`\n분야 미분류 ${unmatched.size}편 (kicker 매핑 확인 필요):`);
  [...unmatched].forEach(f => {
    const a = arts.find(x => x.file === f);
    console.log(`  - ${f}  kicker="${a.kicker}"`);
  });
}

console.log(
  gaps
    ? `\n▶ 보강 필요 ${gaps}개 분야 (기사 없음 또는 ${STALE_DAYS}일 초과). 다음 라운드에서 우선 채울 것.`
    : `\n▶ 6개 분야 모두 ${STALE_DAYS}일 이내 기사 보유.`
);
process.exitCode = 0; // 점검용이므로 갭이 있어도 빌드를 깨지 않는다
