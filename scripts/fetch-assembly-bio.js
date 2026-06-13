// 국회 OPEN API(열린국회정보)로 현역 의원 약력(MEM_TITLE)을 받아 politicians.json 빈 경력을 채운다.
// 서비스: nwvrqwxyaytdsfvhu (현 국회의원 인적사항 — assembly-22.json과 동일 소스, MEM_TITLE에 약력 포함)
//
// 안전 설계:
//  - 키: process.env.ASSEMBLY_API_KEY > api/bill.js의 DEFAULT_KEY(공개 임베드 키) 순. 키 리터럴을 이 파일에 두지 않음.
//  - 동명이인 오귀속 방지: 이름 매칭 후 정당(POLY_NM)이 도감 entry와 일치하는 '단일' 후보만 채움.
//  - 출처 표기. dry-run 기본(--write로 저장). --all 로 현역 의원 entry 전체 약력 보강.
//
// 실행: node scripts/fetch-assembly-bio.js [--write] [--all]
//   (env 우선: ASSEMBLY_API_KEY=키 node scripts/fetch-assembly-bio.js)

const fs = require('fs');
const path = require('path');

function getKey() {
  if (process.env.ASSEMBLY_API_KEY) return process.env.ASSEMBLY_API_KEY;
  // 공개 레포에 임베드된 기본 키를 api/bill.js에서 런타임에 읽음 (키 리터럴을 본 파일에 두지 않음)
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'bill.js'), 'utf8');
    const m = src.match(/DEFAULT_KEY\s*=\s*'([^']+)'/);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

const API_KEY = getKey();
const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');
const SVC = 'nwvrqwxyaytdsfvhu';
const BASE = 'https://open.assembly.go.kr/portal/openapi';
// 현역 22대 의원 type만 매칭 — 동명이인 단체장·교육감·차관 오귀속 방지
const MP_TYPES = new Set(['assembly_leader', 'committee_chair', 'committee_secretary']);

if (!API_KEY) { console.error('❌ 키 없음 (ASSEMBLY_API_KEY env 또는 api/bill.js DEFAULT_KEY)'); process.exit(1); }

async function fetchPage(pIndex) {
  const url = `${BASE}/${SVC}?KEY=${encodeURIComponent(API_KEY)}&Type=json&pIndex=${pIndex}&pSize=1000`;
  const r = await fetch(url, { headers: { 'User-Agent': 'patchkr-dex/1.0 (https://patchkr.com)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const svc = j[SVC];
  if (!svc) throw new Error(`API 응답에 데이터 없음 — ${JSON.stringify(j.RESULT || j).slice(0, 200)}`);
  const rowB = svc.find(b => b.row);
  return rowB ? rowB.row : [];
}

const norm = s => (s || '').replace(/\s+/g, '').trim();

// MEM_TITLE(약력) 가독성 정리 — 연도 항목마다 줄바꿈
function fmtCareer(memTitle) {
  let t = (memTitle || '').trim();
  if (!t) return '';
  // " 2024.5~", " 2021" 등 (앞에 공백 + 4자리 연도) 앞에서 줄바꿈
  t = t.replace(/\s+(?=(19|20)\d\d)/g, '\n').trim();
  return t;
}

async function main() {
  const fp = path.join(__dirname, '..', 'data', 'politicians.json');
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));

  console.log('📡 국회 OPEN API 현역 의원 인적사항(MEM_TITLE 약력) 수집…');
  const rows = [];
  for (let p = 1; p <= 5; p++) {
    const page = await fetchPage(p);
    rows.push(...page);
    if (page.length < 1000) break;
    await new Promise(s => setTimeout(s, 200));
  }
  console.log(`   → ${rows.length}명 수신 (약력 보유: ${rows.filter(r => (r.MEM_TITLE || '').length > 20).length})`);

  const byName = new Map();
  for (const row of rows) {
    const nm = norm(row.HG_NM);
    if (!nm) continue;
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm).push(row);
  }

  const targets = data.people.filter(p => p.name_ko && MP_TYPES.has(p.type) && (ALL ? true : (!p.career || p.career.length === 0)));
  console.log(`\n🎯 대상 ${targets.length}명 (${ALL ? '현역 의원 entry 전체 보강' : '경력 공란'})`);

  let filled = 0, enriched = 0, noMatch = 0, ambiguous = 0, partyMismatch = 0;
  for (const p of targets) {
    const cands = byName.get(norm(p.name_ko)) || [];
    if (cands.length === 0) { noMatch++; continue; }
    const pParty = norm(p.party || p.poly || '');
    let match = null;
    if (cands.length === 1) {
      if (!pParty || norm(cands[0].POLY_NM) !== pParty) { partyMismatch++; console.log(`  ⚠ 정당검증 실패 ${p.name_ko}: 도감(${p.party || '무'}) vs API(${cands[0].POLY_NM})`); continue; }
      match = cands[0];
    } else {
      const byParty = cands.filter(c => norm(c.POLY_NM) === pParty);
      if (byParty.length === 1) match = byParty[0];
      else { ambiguous++; console.log(`  ⚠ 동명이인 ${p.name_ko}: API ${cands.length}명/정당매칭 ${byParty.length} → 건너뜀`); continue; }
    }
    const career = fmtCareer(match.MEM_TITLE);
    if (!career || career.length < 15) { noMatch++; continue; }
    const tagged = career + '\n\n[출처: 국회 OPEN API(열린국회정보)]';
    const wasEmpty = !p.career || p.career.length === 0;
    if (WRITE) p.career = tagged;
    if (wasEmpty) { filled++; console.log(`  ✓ ${p.name_ko} (${p.type}) — ${career.length}자`); }
    else enriched++;
  }

  console.log(`\n=== 결과 ===`);
  console.log(`채움(빈→채): ${filled}${ALL ? ` · 보강: ${enriched}` : ''}`);
  console.log(`매칭없음(=의원 아님 등): ${noMatch} · 동명이인 모호: ${ambiguous} · 정당불일치: ${partyMismatch}`);

  if (WRITE && (filled > 0 || enriched > 0)) {
    data.version = (data.version || 26) + 1;
    data.syncedAt = new Date().toISOString();
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`\n📦 politicians.json version → ${data.version} (저장됨)`);
    console.log('⚠️  index.html POLITICIANS_VER 및 preload ?v= 동반 상향 필요.');
  } else if (!WRITE) {
    console.log('\n(dry-run — 저장하려면 --write)');
  }
}
main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
