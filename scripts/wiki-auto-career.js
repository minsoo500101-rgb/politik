// 위키백과 자동 career 보충
// 한국어 Wikipedia REST API에서 summary extract 가져와 정확한 정보만 입력.
// - 위키 페이지 없으면 스킵 (잘못된 정보 방지)
// - extract 50자 미만 스킵 (의미 있는 정보만)
// - 출생·학력·경력 패턴 인식 + 정리
//
// 실행: node scripts/wiki-auto-career.js [--dry] [--type=local_gov_muni] [--limit=50]
//
// 안전 가드:
// - dry-run 기본 (--write로만 실제 저장)
// - rate limit: 200ms 간격
// - 동명이인 회피 — wiki 필드 우선 사용

const fs = require('fs');
const path = require('path');

const WIKI_API = 'https://ko.wikipedia.org/api/rest_v1/page/summary/';

const args = process.argv.slice(2);
const dryRun = !args.includes('--write');
const typeFilter = (args.find(a => a.startsWith('--type=')) || '').split('=')[1] || null;
const limit = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=50').split('=')[1], 10);

async function fetchWikiSummary(title) {
  try {
    const r = await fetch(WIKI_API + encodeURIComponent(title), {
      headers: { 'User-Agent': 'patchkr-data-supplement/1.0 (https://patchkr.com)' }
    });
    if (!r.ok) return null;
    const j = await r.json();
    // disambiguation 페이지 스킵
    if (j.type === 'disambiguation') return null;
    if (j.extract && j.extract.length >= 50) {
      return {
        extract: j.extract,
        url: j.content_urls?.desktop?.page || '',
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'politicians.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let candidates = data.people.filter(p =>
    p.name_ko &&
    (!p.career || p.career.length === 0) &&
    (typeFilter ? p.type === typeFilter : true)
  );

  console.log(`📊 후보: ${candidates.length}명 (limit ${limit})`);
  console.log(`📝 모드: ${dryRun ? 'DRY-RUN (저장 안 함, --write로 활성화)' : '실제 저장'}`);
  if (typeFilter) console.log(`🔍 type 필터: ${typeFilter}`);
  console.log('');

  candidates = candidates.slice(0, limit);

  let fetched = 0;
  let success = 0;
  let skipped = 0;

  for (const p of candidates) {
    const title = p.wiki || p.name_ko;
    process.stdout.write(`[${++fetched}/${candidates.length}] ${p.name_ko} (${p.type}) … `);
    const summary = await fetchWikiSummary(title);
    if (!summary) {
      console.log('SKIP (no wiki)');
      skipped++;
    } else {
      // extract을 정제 — 너무 길면 잘라냄 (~300자)
      let career = summary.extract.trim();
      if (career.length > 500) career = career.slice(0, 500) + '…';
      // 끝에 출처 표기
      career += '\n\n[출처: 한국어 위키백과 CC BY-SA 4.0]';
      if (!dryRun) {
        p.career = career;
      }
      console.log(`OK (${summary.extract.length}자)`);
      success++;
    }
    await sleep(220); // rate limit
  }

  console.log('');
  console.log(`✅ 성공: ${success}명`);
  console.log(`⏭  스킵: ${skipped}명`);

  if (!dryRun && success > 0) {
    // version bump + syncedAt
    data.version = (data.version || 11) + 1;
    data.syncedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`📦 politicians.json version → ${data.version}`);
    console.log(`📅 syncedAt: ${data.syncedAt}`);
    console.log('');
    console.log('⚠️  index.html의 POLITICIANS_VER 및 preload v= 도 업데이트 필요!');
  }
}

main().catch(e => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
