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

// ─────────────────────────────────────────────────────────────
// V31.75 — 동명이인 검증 게이트
// 과거 이 게이트가 없어 제주도의회 의장 이상봉에 '패션 디자이너 이상봉',
// 단양군수 김문근에 '조선 후기 외척 김문근(1801~1863)' 등 11건이 잘못 등록됐다.
// 가져온 위키 요약이 '그 직책을 맡은 그 사람'인지 확인한 뒤에만 채택한다.
// ─────────────────────────────────────────────────────────────
const NON_POLITICAL = /패션 디자이너|성우|가수|배우|개그맨|아나운서|프로게이머|만화가|소설가|시인|화가|작곡가|야구 선수|축구 선수|농구 선수|배구 선수|수영 선수|골프 선수|씨름|바둑/;
const POLITICAL = /정치인|국회의원|시장|군수|구청장|지사|교육감|의원|장관|차관|청장|공무원|관료|법조인|변호사|판사|검사|기업인|교육자|교수|의사|약사|군인|경찰/;

function isSamePerson(extract, p) {
  const c = extract || '';
  const role = p.role || '';
  const isCurrent = !String(p.type || '').startsWith('former');

  // ① 사망자 배제 — 생몰 두 날짜가 적힌 인물은 현직자일 수 없다
  const deceased = /\d{3,4}년\s*\d{1,2}월\s*\d{1,2}일\s*[~\-–]\s*\d{3,4}년\s*\d{1,2}월\s*\d{1,2}일/.test(c);
  if (deceased && isCurrent) return false;

  // ② 조선·일제강점기 등 역사 인물 배제
  if (/조선 (후기|초기|중기)|일제강점기의|고려 시대|삼국시대/.test(c)) return false;

  // ③ 명백한 비정치 직업 + 정치 이력 없음 → 동명이인
  if (NON_POLITICAL.test(c) && !POLITICAL.test(c)) return false;

  // ④ 직책 일치 확인 — role의 핵심 직책어가 요약에 등장하는지
  //    (국회 간사·차관 등은 위키에 직책이 없을 수 있어, '정치인' 언급이면 통과)
  const keys = role.match(/시장|군수|구청장|지사|교육감|의장|국회의원|장관|차관|청장|대법관|재판관/g);
  if (keys && keys.length) {
    const roleHit = [...new Set(keys)].some(k => c.includes(k));
    if (!roleHit && !POLITICAL.test(c)) return false;
  }
  return true;
}

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
    process.stdout.write(`[${++fetched}/${candidates.length}] ${p.name_ko} (${p.type}) … `);
    // 후보 제목: wiki 필드 → 이름 → "이름 (정치인)" (동명이인·disambiguation 대응)
    const titles = [];
    if (p.wiki) titles.push(p.wiki);
    if (!titles.includes(p.name_ko)) titles.push(p.name_ko);
    titles.push(`${p.name_ko} (정치인)`);
    let summary = null;
    for (const t of titles) {
      const s = await fetchWikiSummary(t);
      // V31.75 — 동명이인 게이트: 그 직책의 그 사람인지 확인된 경우에만 채택
      if (s && isSamePerson(s.extract, p)) { summary = s; break; }
      if (s) console.log(`\n    ↳ 동명이인 의심 거부: "${t}" — ${s.extract.slice(0, 50)}…`);
      await sleep(120);
    }
    if (!summary) {
      console.log('SKIP (no wiki / 동명이인 거부)');
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
