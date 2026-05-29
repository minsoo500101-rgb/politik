// 법령 신구표 자동 수집 — GitHub Actions(law.go.kr 도달 가능)에서 실행
// 결과를 data/law/*.json 정적 파일로 저장 → patchkr(Vercel)가 서빙
//   env: LAW_OC (GHA secret), LAW_REFERER (기본 https://patchkr.com)
// 산출물:
//   data/law/index.json        — 바스켓 신구표 목록(메타)
//   data/law/body/<mst>.json   — 조별 구/신 본문
//   data/law/meta.json         — 갱신시각·바스켓
import { writeFileSync, mkdirSync } from 'node:fs';

const OC = process.env.LAW_OC;
const REFERER = process.env.LAW_REFERER || 'https://patchkr.com';
const BASE = 'https://www.law.go.kr/DRF';
if (!OC) { console.error('❌ LAW_OC 필요'); process.exit(1); }

// 철도 사업자 법령 바스켓 (확장 가능)
const BASKET = [
  '철도안전법', '철도사업법', '도시철도법', '철도산업발전기본법',
  '산업안전보건법', '중대재해 처벌 등에 관한 법률',
  '시설물의 안전 및 유지관리에 관한 특별법', '개인정보 보호법',
];

const asArr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function drf(path, params, tries = 4) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('OC', OC); u.searchParams.set('type', 'json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(u, { headers: { Referer: REFERER, 'User-Agent': 'Mozilla/5.0 (compatible; patchkr/1.0)' } });
      const t = await r.text();
      if (t && t.trim()) return JSON.parse(t);
      lastErr = new Error('빈 응답');
    } catch (e) { lastErr = e; }
    await sleep(700);
  }
  throw lastErr || new Error('재시도 초과');
}

(async () => {
  mkdirSync('data/law/body', { recursive: true });
  const manifest = [];
  const seen = new Set();

  for (const law of BASKET) {
    try {
      const j = await drf('lawSearch.do', { target: 'oldAndNew', query: law, display: '50' });
      const items = asArr(j?.OldAndNewLawSearch?.oldAndNew)
        // 검색어를 법령명에 포함하는 것만 (무관한 매치 제외)
        .filter(it => (it.신구법명 || '').includes(law.split(' ')[0].slice(0, 4)) || (it.신구법명 || '').includes(law));
      for (const it of items) {
        const mst = it.신구법일련번호;
        if (!mst || seen.has(mst)) continue;
        seen.add(mst);
        try {
          const b = await drf('lawService.do', { target: 'oldAndNew', MST: mst });
          const s = b?.OldAndNewService || {};
          writeFileSync(`data/law/body/${mst}.json`, JSON.stringify({
            name: s.법령명 || it.신구법명, ef: s.시행일자 || it.시행일자,
            old: asArr(s?.구조문목록?.조문), new: asArr(s?.신조문목록?.조문),
          }));
          manifest.push({
            group: law, name: it.신구법명, kind: it.법령구분명, rev: it.제개정구분명,
            ef: it.시행일자, pub: it.공포일자, pubNo: it.공포번호, dept: it.소관부처명, mst,
          });
          console.log('  ✓', it.신구법명, it.법령구분명, it.시행일자);
        } catch (e) { console.warn('  ✗ body', mst, e.message); }
        await sleep(500);
      }
    } catch (e) { console.warn('✗ search', law, e.message); }
    await sleep(500);
  }

  manifest.sort((a, b) => (b.pub || '').localeCompare(a.pub || ''));
  writeFileSync('data/law/index.json', JSON.stringify(manifest));
  writeFileSync('data/law/meta.json', JSON.stringify({
    generatedAt: new Date().toISOString(), basket: BASKET, count: manifest.length,
    source: '법제처 국가법령정보 (신구조문대비표)',
  }));
  console.log(`\n✅ 완료: ${manifest.length}건`);
  if (!manifest.length) process.exit(1); // 빈 결과면 실패 처리(차단·오류 감지)
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
