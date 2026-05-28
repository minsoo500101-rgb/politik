// V28.0 — llms.txt + llms-full.txt 자동 갱신
// 사용: node scripts/update-llms.js
//
// 실측 카운트 기반으로 AI 크롤러용 마크업 동기화:
// - politicians + assembly-22 dedup (22대 의원 + 자체 DB)
// - glossary terms·categories
// - election_2026 시군구·시도
// - economy indicators
//
// 변경 사항 없으면 write 안 함 (idempotent)
// exit 0 (변경 없음) / exit 0 (변경 있음, 갱신 완료)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LLMS = path.join(ROOT, 'llms.txt');
const LLMS_FULL = path.join(ROOT, 'llms-full.txt');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ─── 실측 카운트 ───────────────────────────────────
function countActual() {
  const pol = readJson(path.join(ROOT, 'data/politicians.json'));
  const asm = readJson(path.join(ROOT, 'data/assembly-22.json'));
  const gl  = readJson(path.join(ROOT, 'data/glossary.json'));
  const e26 = readJson(path.join(ROOT, 'data/election_2026.json'));
  const eco = readJson(path.join(ROOT, 'data/economy.json'));

  const polTotal = pol?.people?.length || 0;
  const asmCount = asm?.count || asm?.members?.length || 0;

  // group별
  const byGroup = {};
  for (const p of (pol?.people || [])) {
    byGroup[p.group] = (byGroup[p.group] || 0) + 1;
  }
  // dedup: 22대 의원 286 + (politicians 482 = 위원회 직책자 54 + 행정 80 + 사법 22 + 지방 278 + 역사 102 중 22대 중복 제외)
  // 위원회 직책자(legislative 54)는 거의 다 22대 의원과 이름 중복 → 빼고 계산
  const legCount = byGroup.legislative || 0;
  const unique = asmCount + (polTotal - legCount);

  return {
    politicians_total: unique,            // 정확한 dedup 카운트 (V27.4에서 "768명" 추정)
    politicians_assembly: asmCount,        // 22대 의원 286
    politicians_self_db: polTotal,         // 자체 DB 536
    politicians_legislative: legCount,     // 위원회 직책자 54 (22대와 dedup)
    politicians_by_group: byGroup,
    glossary_terms: gl?.terms?.length || 0,
    glossary_categories: Object.keys(gl?.categories || {}).length,
    e26_regions: (e26?.regions || []).length,
    e26_muni_sum: (e26?.regions || []).reduce((s, r) => s + (r.muni_count || 0), 0),
    e26_total_seats: e26?.total_seats || 0,
    economy_indicators: Object.keys(eco?.indicators || {}).length,
  };
}

// ─── 갱신 패턴 ─────────────────────────────────────
// 각 패턴: [정규식, 대체 함수]
function buildReplacements(c) {
  return [
    // 정치인 총수
    [/정치인 \d+명 \(22대 의원 \d+ \+ 자체 DB \d+\)/g,
      `정치인 ${c.politicians_total}명 (22대 의원 ${c.politicians_assembly} + 자체 DB ${c.politicians_self_db - c.politicians_legislative})`],
    [/정치인 \d+명(?! \(22)/g, `정치인 ${c.politicians_total}명`],
    [/정치인 도감 \d+명(?! \()/g, `정치인 도감 ${c.politicians_total}명`],
    [/정치인 도감 \(약 ?\d+명\) 구성/g, `정치인 도감 (약 ${c.politicians_total}명) 구성`],
    [/정치인 도감 \(\d+명\) 구성/g, `정치인 도감 (${c.politicians_total}명) 구성`],

    // 22대 의원
    [/22대 국회의원 \d+명 \(현역/g, `22대 국회의원 ${c.politicians_assembly}명 (현역`],

    // 용어 사전
    [/정치 용어 사전 \d+개 ?용어[, ]+ ?\d+ ?카테고리/g,
      `정치 용어 사전 ${c.glossary_terms}개 용어, ${c.glossary_categories} 카테고리`],
    [/정치 용어 사전 ?\(?\/glossary\)?[^.]*?: ?\d+개 용어/g,
      (m) => m.replace(/\d+개 용어/, `${c.glossary_terms}개 용어`)],

    // 시군구
    [/(\d+) ?시군구 정당색/g, `${c.e26_muni_sum} 시군구 정당색`],
    [/시군구 매핑/g, `시군구 매핑`],

    // 경제 지표
    [/경제 \d+개 지표/g, `경제 ${c.economy_indicators}개 지표`],
    [/경제 지표 \d+종/g, `경제 지표 ${c.economy_indicators}종`],

    // 시도
    [/광역단체장 17명·기초단체장 \d+명/g, `광역단체장 17명·기초단체장 ${c.e26_muni_sum}명`],
  ];
}

// ─── 메인 ────────────────────────────────────────────
function main() {
  console.log('═════════════════════════════════════════════════════');
  console.log('  llms 자동 갱신 — 실측 카운트 → AI 크롤러 마크업');
  console.log('═════════════════════════════════════════════════════');

  const c = countActual();
  console.log('\n[실측]');
  console.log(' 정치인 총:', c.politicians_total, '(22대', c.politicians_assembly, '+ 자체', c.politicians_self_db - c.politicians_legislative, ')');
  console.log(' 용어:', c.glossary_terms, '/', c.glossary_categories, '카테고리');
  console.log(' 9회 지선: regions', c.e26_regions, '· 시군구', c.e26_muni_sum, '· 의석', c.e26_total_seats);
  console.log(' 경제 지표:', c.economy_indicators);

  const replacements = buildReplacements(c);
  const files = [
    { path: LLMS, label: 'llms.txt' },
    { path: LLMS_FULL, label: 'llms-full.txt' },
  ];

  let totalChanged = 0;
  for (const f of files) {
    if (!fs.existsSync(f.path)) continue;
    const before = fs.readFileSync(f.path, 'utf8');
    let after = before;
    for (const [pattern, replacer] of replacements) {
      if (typeof replacer === 'function') {
        after = after.replace(pattern, replacer);
      } else {
        after = after.replace(pattern, replacer);
      }
    }
    if (after !== before) {
      fs.writeFileSync(f.path, after, 'utf8');
      const diff = Math.abs(after.length - before.length);
      console.log(` ✅ ${f.label} 갱신 (${diff} bytes 변경)`);
      totalChanged++;
    } else {
      console.log(` ⏸ ${f.label} 변경 없음`);
    }
  }

  console.log('\n═════════════════════════════════════════════════════');
  console.log(totalChanged > 0 ? `🎯 ${totalChanged}개 파일 갱신 완료` : '✅ 모든 파일 최신 상태 (갱신 불필요)');
  process.exit(0);
}

main();
