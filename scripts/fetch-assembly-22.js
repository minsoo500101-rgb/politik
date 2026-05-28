// V27.4 — 국회 OpenAPI에서 22대 현역 의원 286명 fetch
// 사용: node scripts/fetch-assembly-22.js
//
// endpoint: nwbpacrgavhjryiph (국회의원 인적정보)
// 출력: data/assembly-22.json

const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = process.env.ASSEMBLY_API_KEY || '3aac055cce1641f2b5f1b9b359ec5957';
const BASE = 'https://open.assembly.go.kr/portal/openapi';
const OUTPUT = path.resolve(__dirname, '../data/assembly-22.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'KoreaPatchNotes/1.0' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse: ' + e.message + ', body=' + body.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

async function tryFetch(endpoint, label) {
  const url = `${BASE}/${endpoint}?KEY=${KEY}&Type=json&pIndex=1&pSize=400`;
  console.log(`[${label}] fetch: ${endpoint}`);
  try {
    const data = await fetchJson(url);
    const key = Object.keys(data)[0];
    if (!key) return null;
    const rows = data[key]?.[1]?.row;
    if (Array.isArray(rows)) {
      console.log(`[${label}] ✅ ${rows.length}명 fetched`);
      return { endpoint, label, rows, raw: data[key] };
    }
    console.log(`[${label}] ⚠️ no rows. response keys:`, Object.keys(data[key] || {}));
    return null;
  } catch (e) {
    console.log(`[${label}] ❌ error:`, e.message);
    return null;
  }
}

async function main() {
  // 가능성 있는 endpoint 시도 (이름이 모호함)
  const candidates = [
    { ep: 'nwvrqwxyaytdsfvhu', label: '국회의원 현황 (nwvrqwxyaytdsfvhu)' },
    { ep: 'nwbpacrgavhjryiph', label: '의원 인적정보 (nwbpacrgavhjryiph)' },
    { ep: 'ALLNAMEMBER',      label: 'ALLNAMEMBER (전체 의원)' },
    { ep: 'nojepdqqaweusdfbi', label: '22대 의원 (nojepdqqaweusdfbi)' },
  ];

  let result = null;
  for (const c of candidates) {
    result = await tryFetch(c.ep, c.label);
    if (result && result.rows.length >= 200) break;
  }

  if (!result) {
    console.log('\n❌ 모든 endpoint 실패. 수동 확인 필요.');
    console.log('   https://open.assembly.go.kr 에서 22대 의원 목록 endpoint 검색');
    process.exit(1);
  }

  // 정규화 — 의원 데이터 통일 형태로
  const members = result.rows.map(r => ({
    name: r.HG_NM || r.HG_NM_KOREAN || r.NAME || r.MONA_NM,
    hanja: r.HJ_NM || null,
    en: r.ENG_NM || null,
    party: r.POLY_NM || r.PARTY || null,
    district: r.ORIG_NM || r.SGG || null,
    elections: r.REELE_GBN_NM || r.REELE || null,
    committees: r.CMITS || r.CMIT_NM || null,
    gender: r.SEX_GBN_NM || r.GENDER || null,
    birth: r.BTH_DATE || r.BIRTH || null,
    email: r.E_MAIL || null,
    homepage: r.HOMEPAGE || null,
    mona_cd: r.MONA_CD || r.MEMBER_NO || null,
    source: result.endpoint,
  })).filter(m => m.name);

  const output = {
    _meta: 'V27.4 — 22대 국회의원 명부 (국회 OpenAPI)',
    syncedAt: new Date().toISOString().slice(0, 10),
    source: `https://open.assembly.go.kr/portal/openapi/${result.endpoint}`,
    count: members.length,
    members,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✅ 저장: ${OUTPUT}`);
  console.log(`   ${members.length}명 | endpoint: ${result.endpoint}`);

  // 정당 분포
  const byParty = {};
  for (const m of members) byParty[m.party || '?'] = (byParty[m.party || '?'] || 0) + 1;
  console.log('\n[정당 분포]');
  Object.entries(byParty).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(' ', v, '·', k));
}

main().catch(e => { console.error(e); process.exit(1); });
