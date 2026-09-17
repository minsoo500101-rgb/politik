#!/usr/bin/env node
/**
 * data/economy.json 의 '진행 중인 연도' 값을 한국은행 ECOS 실측으로 갱신한다.
 *
 * 연도별 시계열의 규칙 (기존 데이터에서 확인):
 *   - 시점형 지표(기준금리·환율·코스피·코스닥) = 그 해 마지막 거래일 종가.
 *     지난 연도는 확정값, 진행 중인 연도는 '오늘까지의 최신값'을 넣는다.
 *   - 평균·합계형 지표(CPI 상승률·실업률·GDP 성장률·가계부채비율·수출액)는
 *     연평균/연합계라서, 연도가 끝나기 전에 월 단위 값을 넣으면 의미가 달라진다.
 *     → 진행 중인 연도는 비워 둔다. 이 스크립트는 건드리지 않는다.
 *
 * ECOS 키는 Vercel 환경변수에만 있으므로 라이브 프록시(/api/ecos)를 통해 읽는다.
 * (로컬에 ECOS_API_KEY가 있으면 ECOS_BASE 로 직접 호출하도록 바꿔도 된다.)
 *
 *   node scripts/refresh-economy.js          # 조회만 (dry-run)
 *   node scripts/refresh-economy.js --write  # 파일 반영
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'economy.json');
const PROXY = process.env.ECOS_PROXY || 'https://patchkr.com/api/ecos';
const WRITE = process.argv.includes('--write');

// 시점형 지표만. [id, stat, item, 소수 자릿수]
const POINT_IN_TIME = [
  ['base_rate', '722Y001', '0101000', 'M', 2],
  ['usd_krw',   '731Y001', '0000001', 'D', 1],
  ['kospi',     '802Y001', '0001000', 'D', 0],
  ['kosdaq',    '802Y001', '0089000', 'D', 0],
];

const pad = (n) => String(n).padStart(2, '0');

async function fetchLatest(stat, item, period, year) {
  const start = period === 'D' ? `${year}0101` : `${year}01`;
  const today = new Date();
  const end = period === 'D'
    ? `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
    : `${today.getFullYear()}${pad(today.getMonth() + 1)}`;
  const url = `${PROXY}?stat=${stat}&item=${item}&period=${period}&start=${start}&end=${end}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${stat} HTTP ${r.status}`);
  const j = await r.json();
  if (!j.data || !j.data.length) throw new Error(`${stat} 데이터 없음 (${j.ecos_error && j.ecos_error.message || ''})`);
  // 같은 time 에 복수 계열이 오는 통계가 있어 마지막 것만 쓰지 않고 time 최대값을 고른다
  const last = j.data.reduce((a, b) => (String(b.time) >= String(a.time) ? b : a));
  return { time: String(last.time), value: Number(last.value), unit: j.data[0].unit };
}

(async () => {
  const json = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const year = new Date().getFullYear();
  const byId = Object.fromEntries(json.indicators.map((i) => [i.id, i]));

  console.log(`ECOS 프록시: ${PROXY}`);
  console.log(`대상 연도: ${year} (진행 중 — 최신 시점값으로 갱신)\n`);

  let changed = 0;
  const asOf = [];
  for (const [id, stat, item, period, digits] of POINT_IN_TIME) {
    const ind = byId[id];
    if (!ind) { console.log(`  ⏭  ${id} — 지표 없음`); continue; }
    let got;
    try {
      got = await fetchLatest(stat, item, period, year);
    } catch (e) {
      console.log(`  ⚠️  ${ind.label} — 조회 실패: ${e.message}`);
      continue;
    }
    const next = Number(got.value.toFixed(digits));
    const row = ind.data.find((d) => d.year === year);
    const prev = row ? row.value : null;
    asOf.push(`${ind.label} ${got.time}`);
    if (prev === next) {
      console.log(`  =  ${ind.label.padEnd(12)} ${next} (${got.time}) — 변경 없음`);
      continue;
    }
    console.log(`  ✏️  ${ind.label.padEnd(12)} ${prev === null ? '(없음)' : prev} → ${next} (${got.time})`);
    if (row) row.value = next;
    else ind.data.push({ year, value: next });
    changed++;
  }

  const skipped = json.indicators
    .filter((i) => !POINT_IN_TIME.some(([id]) => id === i.id))
    .map((i) => i.label);
  console.log(`\n  ⏭  연평균·연합계 지표는 연도 종료 전이라 건너뜀: ${skipped.join(', ')}`);

  if (!changed) { console.log('\n✅ 갱신할 값 없음'); return; }
  if (!WRITE) { console.log(`\n(dry-run) ${changed}개 변경 예정 — 반영하려면 --write`); return; }

  json.version = (json.version || 0) + 1;
  json.updatedAt = new Date().toISOString().slice(0, 10);
  json._note = `한국 핵심 경제 지표 시계열 (2015~${year}). 출처: 한국은행 ECOS, 통계청 KOSIS, 한국거래소 공식. `
    + `정부 공식 공개 데이터 인용 — 추가 라이선스 불필요. `
    + `${year}년 시점형 지표(기준금리·환율·코스피·코스닥)는 연말 확정값이 아니라 ${json.updatedAt} 기준 최신 종가다 `
    + `(${asOf.join(' / ')}). 연평균·연합계 지표(물가·실업률·GDP·가계부채·수출)는 연도가 끝나야 값이 확정돼 비워 둔다.`;
  fs.writeFileSync(FILE, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`\n✅ economy.json 갱신 — version ${json.version}, ${changed}개 값 변경`);
})();
