// 법령 신구표 자동 수집 — GitHub Actions(law.go.kr 도달 가능)에서 실행
// 결과를 data/law/*.json 정적 파일로 저장 → patchkr(Vercel)가 서빙
//   env: LAW_OC (GHA secret), LAW_REFERER (기본 https://patchkr.com), BODY_BUDGET (본문 백필/run, 기본 600)
// 전략: 전체 신구표(5,500+)를 인덱스로, 본문은 미캐시분만 "최신(공포일자)순"으로 매 run 예산만큼 점진 백필.
// 산출물:
//   data/law/index.json        — 전체 신구표 목록(메타, 공포일자 desc)
//   data/law/body/<mst>.json   — 조별 구/신 본문 (점진 캐시)
//   data/law/meta.json         — 갱신시각·총건수·캐시본문수
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';

const OC = process.env.LAW_OC;
const REFERER = process.env.LAW_REFERER || 'https://patchkr.com';
const BODY_BUDGET = Number(process.env.BODY_BUDGET || 600);
const BASE = 'https://www.law.go.kr/DRF';
if (!OC) { console.error('❌ LAW_OC 필요'); process.exit(1); }

// UI 칩 큐레이션은 프런트(law-diff.html)에서. 여기선 전체를 받는다.
const asArr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function drf(path, params, tries = 5) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('OC', OC); u.searchParams.set('type', 'json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(u, { headers: { Referer: REFERER, 'User-Agent': 'Mozilla/5.0 (compatible; patchkr/1.0)' } });
      const t = await r.text();
      if (t && t.trim()) return JSON.parse(t);
      lastErr = new Error('빈 응답(' + r.status + ')');
    } catch (e) { lastErr = e; }
    await sleep(700);
  }
  throw lastErr || new Error('재시도 초과');
}

const toEntry = it => ({
  mst: it.신구법일련번호, name: it.신구법명, kind: it.법령구분명,
  rev: it.제개정구분명, ef: it.시행일자, pub: it.공포일자,
  pubNo: it.공포번호, dept: it.소관부처명,
});

// eflaw(시행일 법령): EF_FROM 이후 '시행된 모든 개정(과거 포함)'을 열거 → 전체 법 × 최근 이력.
// 핵심: 각 버전의 법령일련번호(=MST)로 lawService(target=oldAndNew, MST=)를 부르면 그 개정의 법제처 공식 신구표가 나옴.
const EF_FROM = process.env.LAW_EF_FROM || '20250101';
const ymdToday = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const toEf = it => ({
  mst: it.법령일련번호, name: it.법령명한글, kind: it.법령구분명,
  rev: it.제개정구분명, ef: it.시행일자, pub: it.공포일자,
  pubNo: it.공포번호, dept: it.소관부처명,
});

// 전체 신구표 인덱스 페이지네이션 수집
async function fetchAllIndex() {
  const per = 100;
  const first = await drf('lawSearch.do', { target: 'oldAndNew', display: per, page: 1 });
  const root = first?.OldAndNewLawSearch || {};
  const total = Number(root.totalCnt) || 0;
  const pages = Math.ceil(total / per);
  let items = asArr(root.oldAndNew);
  let okPages = 1, failPages = 0;
  for (let p = 2; p <= pages; p++) {
    try {
      const j = await drf('lawSearch.do', { target: 'oldAndNew', display: per, page: p });
      const a = asArr(j?.OldAndNewLawSearch?.oldAndNew);
      if (a.length) { items = items.concat(a); okPages++; } else failPages++;
    } catch (e) { failPages++; console.warn('  ✗ index page', p, e.message); }
    await sleep(300);
  }
  console.log(`  인덱스: ${items.length}건 수집 (total ${total}, 페이지 ${okPages}/${pages}, 실패 ${failPages})`);
  return { items, total };
}

// eflaw efYd=<from>~<오늘> 페이지네이션 (LawSearch.law). 한 법령의 여러 개정도 각각 반환됨.
async function fetchEflawSince(fromYmd) {
  const per = 100, to = `${new Date().getFullYear() + 3}1231`;   // 시행예정(미래 시행일)까지 포함 → '곧 시행' 추적
  const base = { target: 'eflaw', efYd: `${fromYmd}~${to}`, display: per };
  const first = await drf('lawSearch.do', { ...base, page: 1 });
  const root = first?.LawSearch || {};
  const total = Number(root.totalCnt) || 0;
  const pages = Math.ceil(total / per);
  let items = asArr(root.law);
  let ok = 1, fail = 0;
  for (let p = 2; p <= pages; p++) {
    try { const j = await drf('lawSearch.do', { ...base, page: p }); const a = asArr(j?.LawSearch?.law); if (a.length) { items = items.concat(a); ok++; } else fail++; }
    catch (e) { fail++; }
    await sleep(250);
  }
  console.log(`  eflaw(${fromYmd}~${to}): ${items.length}건 (total ${total}, 페이지 ${ok}/${pages}, 실패 ${fail})`);
  return items;
}

(async () => {
  mkdirSync('data/law/body', { recursive: true });

  // 1) 인덱스 — 현행 전체 수집 후 기존 인덱스와 병합(누적). ★과거 개정 신구표는 절대 삭제하지 않음★
  //    oldAndNew API는 법령당 '현행 개정 1건'만 주므로, 매 run 현행 스냅샷을 누적해야 분기별 이력이 쌓인다.
  const { items: raw, total } = await fetchAllIndex();
  const byMst = new Map();
  if (existsSync('data/law/index.json')) {
    try { for (const e of JSON.parse(readFileSync('data/law/index.json', 'utf8'))) if (e && e.mst) byMst.set(String(e.mst), e); } catch {}
  }
  const prevCount = byMst.size;
  // 새 MST(=새 개정)만 추가, 기존(과거 개정)은 유지 → 누적
  for (const it of raw) { const m = it.신구법일련번호; if (m && !byMst.has(String(m))) byMst.set(String(m), toEntry(it)); }
  // 1b) eflaw — EF_FROM(기본 2025-01-01) 이후 시행된 '모든 개정(과거 포함)'을 누적. 전체 법 × 최근 이력.
  try {
    const ef = await fetchEflawSince(EF_FROM);
    let efNew = 0;
    for (const it of ef) { const m = it.법령일련번호; if (m && !byMst.has(String(m))) { byMst.set(String(m), toEf(it)); efNew++; } }
    console.log(`  eflaw 신규 ${efNew}건 병합 (인덱스 ${byMst.size})`);
  } catch (e) { console.warn('  ⚠ eflaw 실패:', e.message); }
  const manifest = [...byMst.values()].sort((a, b) => String(b.ef || '').localeCompare(String(a.ef || '')));  // 시행일 desc
  const added = byMst.size - prevCount;
  if (raw.length > 0 || prevCount > 0) {
    writeFileSync('data/law/index.json', JSON.stringify(manifest));   // 병합이라 부분 수집도 안전(삭제 없음)
    console.log(`  ✓ index.json 누적 (${manifest.length}건 / 이번 신규 ${added} / 현행 ${total})`);
  } else {
    console.warn('  ⚠ 수집·기존 모두 0 — 건너뜀');
  }

  // 2) 본문 백필: 미캐시분만 최신순 예산만큼
  const have = new Set(readdirSync('data/law/body').filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')));
  const cachedBefore = have.size;
  let fetched = 0, failed = 0;
  for (const e of manifest) {
    if (fetched >= BODY_BUDGET) break;
    if (!e.mst || have.has(String(e.mst))) continue;
    try {
      const b = await drf('lawService.do', { target: 'oldAndNew', MST: e.mst });
      const s = b?.OldAndNewService || {};
      writeFileSync(`data/law/body/${e.mst}.json`, JSON.stringify({
        name: s.법령명 || e.name, ef: s.시행일자 || e.ef,
        old: asArr(s?.구조문목록?.조문), new: asArr(s?.신조문목록?.조문),
      }));
      have.add(String(e.mst)); fetched++;
      if (fetched % 50 === 0) console.log(`  …본문 ${fetched}건`);
    } catch (err) { failed++; console.warn('  ✗ body', e.mst, err.message); }
    await sleep(400);
  }

  writeFileSync('data/law/meta.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: manifest.length,   // 누적(과거 개정 포함)
    current: total,           // 이번 현행 스냅샷 건수
    cachedBodies: cachedBefore + fetched,
    fetchedThisRun: fetched,
    remaining: Math.max(0, manifest.length - (cachedBefore + fetched)),
    source: '법제처 국가법령정보 (신구조문대비표)',
  }));
  console.log(`\n✅ index ${manifest.length}건 / 본문 신규 ${fetched} (총 캐시 ${cachedBefore + fetched}, 잔여 ${Math.max(0, manifest.length - (cachedBefore + fetched))}) / 실패 ${failed}`);
  if (!manifest.length) process.exit(1);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
