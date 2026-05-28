// V27.4 — 사이트 표기 숫자 vs 실제 데이터 자동 검증
// 사용: node scripts/verify-counts.js
//
// 검사 항목:
// - politicians.json group별 카운트
// - glossary.json 용어·카테고리
// - election_2026.json 시군구 합계
// - economy.json 지표 수
// - index.html / llms.txt / llms-full.txt 의 숫자 표기 grep
//
// 출력: 일치/불일치 표 + 잔존 stale 숫자 위치

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const LLMS = path.join(ROOT, 'llms.txt');
const LLMS_FULL = path.join(ROOT, 'llms-full.txt');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─── 1. 실측 카운트 ───────────────────────────────────
function countActual() {
  const pol = readJson(path.join(ROOT, 'data/politicians.json'));
  const gl  = readJson(path.join(ROOT, 'data/glossary.json'));
  const e26 = readJson(path.join(ROOT, 'data/election_2026.json'));
  const eco = readJson(path.join(ROOT, 'data/economy.json'));

  const byGroup = {};
  for (const p of pol.people) byGroup[p.group] = (byGroup[p.group] || 0) + 1;

  return {
    politicians_total: pol.people.length,
    politicians_by_group: byGroup,
    glossary_terms: gl.terms.length,
    glossary_categories: Object.keys(gl.categories).length,
    e26_regions: e26.regions.length,
    e26_muni_sum: e26.regions.reduce((s, r) => s + (r.muni_count || 0), 0),
    e26_total_seats: e26.total_seats,
    economy_indicators: Object.keys(eco.indicators || {}).length,
  };
}

// ─── 2. HTML/text 파일에서 숫자 패턴 찾기 ─────────────
// CHANGELOG는 회고용 history라 stale 검사에서 제외
function findChangelogRange(text) {
  const startIdx = text.indexOf('const CHANGELOG = [');
  if (startIdx < 0) return null;
  // 매칭되는 닫는 ];를 찾기 (간단히 다음 \n];\n 으로)
  const tail = text.indexOf('\n];\n', startIdx);
  if (tail < 0) return null;
  const beforeLines = text.slice(0, startIdx).split('\n').length;
  const insideLines = text.slice(startIdx, tail).split('\n').length;
  return { start: beforeLines, end: beforeLines + insideLines };
}

function findStaleNumbers(actual) {
  const STALE_PATTERNS = [
    // [pattern, expected_truth, label]
    ['772명',          '768명 (22대 286 + 자체 482)',         '정치인 (구: 772명)'],
    ['744명',          '768명 (22대 286 + 자체 482)',         '정치인 (구: 744명)'],
    ['536명',          '768명 (22대 286 + 자체 482)',         '정치인 (구: 536명, V27.3 보정 전)'],
    ['136개 용어',     actual.glossary_terms + '개 용어',    '용어 (구: 136)'],
    ['213개 용어',     actual.glossary_terms + '개 용어',    '용어 (구: 213)'],
    ['250 시군구',     actual.e26_muni_sum + ' 시군구',      '시군구 (구: 250)'],
    ['250개 시군구',   actual.e26_muni_sum + '개 시군구',    '시군구 (구: 250개)'],
    ['696명 후보',     '697명 후보',                          '9회 후보'],
    ['8 카테고리',     actual.glossary_categories + ' 카테고리', '용어 카테고리 (구: 8)'],
    ['14 카테고리',    actual.glossary_categories + ' 카테고리', '용어 카테고리 (구: 14)'],
  ];

  const targets = [
    { path: HTML, name: 'index.html', findChangelog: true },
    { path: LLMS, name: 'llms.txt' },
    { path: LLMS_FULL, name: 'llms-full.txt' },
  ];

  const hits = [];
  for (const t of targets) {
    if (!fs.existsSync(t.path)) continue;
    const text = fs.readFileSync(t.path, 'utf8');
    const lines = text.split('\n');
    const cgRange = t.findChangelog ? findChangelogRange(text) : null;

    lines.forEach((line, i) => {
      const lineNum = i + 1;
      // CHANGELOG 영역 내부는 제외 (회고 기록)
      if (cgRange && lineNum >= cgRange.start && lineNum <= cgRange.end) return;
      // 명시적 ⚠️ 주석은 제외 (의도된 fact statement)
      if (/⚠️.*풀데이터.*미보유|⚠️.*22대 일반/.test(line)) return;
      for (const [pat, truth, label] of STALE_PATTERNS) {
        if (line.includes(pat)) {
          hits.push({
            file: t.name,
            line: lineNum,
            pattern: pat,
            truth,
            label,
            snippet: line.trim().slice(0, 90),
          });
        }
      }
    });
  }
  return hits;
}

// ─── 3. 일관성 점검 (자명한 수치) ─────────────────────
function consistencyChecks(actual) {
  const checks = [
    {
      name: '시군구 합계 = 226',
      ok: actual.e26_muni_sum === 226,
      value: actual.e26_muni_sum,
    },
    {
      name: '시도 = 17',
      ok: actual.e26_regions === 17,
      value: actual.e26_regions,
    },
    {
      name: '경제 지표 = 9',
      ok: actual.economy_indicators === 9,
      value: actual.economy_indicators,
    },
    {
      name: '용어 ≥ 248',
      ok: actual.glossary_terms >= 248,
      value: actual.glossary_terms,
    },
    {
      name: '용어 카테고리 = 15',
      ok: actual.glossary_categories === 15,
      value: actual.glossary_categories,
    },
    {
      name: '9회 지선 의석 합 = 4040',
      ok: actual.e26_total_seats === 4040,
      value: actual.e26_total_seats,
    },
  ];
  return checks;
}

// ─── 메인 ────────────────────────────────────────────
function main() {
  console.log('═════════════════════════════════════════════════════');
  console.log('  patchkr.com — 사이트 표기 vs 실제 데이터 검증');
  console.log('═════════════════════════════════════════════════════');

  const actual = countActual();

  console.log('\n[실측 카운트]');
  console.log(' 정치인 총:', actual.politicians_total);
  console.log(' └ group별:', JSON.stringify(actual.politicians_by_group));
  console.log(' 용어:', actual.glossary_terms, '/', actual.glossary_categories, '카테고리');
  console.log(' 9회 지선: regions', actual.e26_regions, '· 시군구 합', actual.e26_muni_sum, '· 의석', actual.e26_total_seats);
  console.log(' 경제 지표:', actual.economy_indicators);

  console.log('\n[자명한 일관성 검사]');
  const checks = consistencyChecks(actual);
  for (const c of checks) {
    console.log(' ', (c.ok ? '✅' : '❌'), c.name, '→', c.value);
  }

  console.log('\n[Stale 숫자 검사 (활성 UI만, CHANGELOG history 제외)]');
  const hits = findStaleNumbers(actual);
  if (hits.length === 0) {
    console.log(' ✅ 발견된 stale 숫자 없음 — 사이트 표기 정확');
  } else {
    console.log(` ⚠️  ${hits.length}건 발견:\n`);
    for (const h of hits) {
      console.log(` ${h.file}:${h.line} [${h.label}]`);
      console.log(`   "${h.pattern}" → 정정: ${h.truth}`);
      console.log(`   ${h.snippet}\n`);
    }
  }

  console.log('═════════════════════════════════════════════════════');
  process.exit(hits.length > 0 ? 1 : 0);
}

main();
