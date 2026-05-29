// V30.5 — 세계 속 한국 경제: World Bank 무료 오픈 API (키 불필요)
// 주요국 핵심 경제지표 '최신값' 비교. 연 단위 데이터라 길게 캐시.
//   요청: /api/worldbank
//   응답: { countries:[...], indicators:[{ key,label,unit,higher,byCountry:{KR:{value,year},...} }], source }
// 주의: World Bank는 format=json + date 범위로 호출(국가별 최신 non-null 선택). mrnev 파라미터는 XML 반환 버그 있어 미사용.

const COUNTRIES = ['KR', 'US', 'CN', 'JP', 'DE', 'GB', 'FR', 'IN'];
const INDICATORS = [
  { id: 'NY.GDP.PCAP.CD',    key: 'gdp_pc', label: '1인당 GDP',  unit: 'US$', higher: 'good' },
  { id: 'NY.GDP.MKTP.CD',    key: 'gdp',    label: 'GDP 규모',   unit: 'US$', higher: 'good' },
  { id: 'NY.GDP.MKTP.KD.ZG', key: 'growth', label: '경제성장률', unit: '%',   higher: 'good' },
  { id: 'FP.CPI.TOTL.ZG',    key: 'cpi',    label: '물가상승률', unit: '%',   higher: 'low' },
  { id: 'SL.UEM.TOTL.ZS',    key: 'unemp',  label: '실업률',     unit: '%',   higher: 'low' },
];

async function fetchIndicator(id) {
  const url = `https://api.worldbank.org/v2/country/${COUNTRIES.join(';')}/indicator/${id}`
    + `?format=json&date=2019:2025&per_page=600`;
  const r = await fetch(url, { headers: { 'User-Agent': 'patchkr' } });
  if (!r.ok) return {};
  const txt = (await r.text()).replace(/^﻿/, '');
  let j; try { j = JSON.parse(txt); } catch { return {}; }
  const rows = Array.isArray(j) && j[1] ? j[1] : [];
  const latest = {};
  for (const row of rows) {
    if (row && row.value != null && row.country) {
      const c = row.country.id;
      const y = +row.date;
      if (!latest[c] || y > latest[c].year) latest[c] = { value: row.value, year: y };
    }
  }
  return latest;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  try {
    const indicators = await Promise.all(INDICATORS.map(async (ind) => ({
      key: ind.key, label: ind.label, unit: ind.unit, higher: ind.higher,
      byCountry: await fetchIndicator(ind.id),
    })));
    res.status(200).json({ countries: COUNTRIES, indicators, source: 'World Bank', generatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(200).json({ countries: COUNTRIES, indicators: [], source: 'error', error: e && e.message });
  }
}
