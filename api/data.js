// 공개 데이터 REST API — 개발자·시민테크 프로젝트용
// V26.3 — 자체 데이터만 공개. 외부 API 프록시(/api/quote·/api/naver)는 별도 Origin 제한.
//
// GET /api/data                       — 사용 가능한 endpoint 목록
// GET /api/data?type=politicians      — 정치인 전체 (학력·경력 포함)
// GET /api/data?type=politicians&id=  — 단일 정치인
// GET /api/data?type=politicians&group=  — 그룹별 (legislative/executive/judicial/local/historical)
// GET /api/data?type=glossary         — 정치 용어 사전 248개
// GET /api/data?type=parties          — 정당 메타정보
// GET /api/data?type=info             — 사이트 통계·요약
//
// 데이터 라이선스:
//   • politicians: patchkr.com 자체 편집 (공공누리 1유형 출처 + CC BY-SA 4.0 위키 인용)
//   • glossary: patchkr.com 자체 저작 (CC BY-SA 4.0)
//   • parties/info: patchkr.com 자체 통계 (CC BY 4.0)
// 출처 표기 필수: "Data: patchkr.com · https://github.com/minsoo500101-rgb/politik"
//
// ⚠️ 본 endpoint는 자체 편집 데이터만 제공합니다.
//   • 시세(Yahoo Finance·Stooq) → /api/quote (patchkr.com 내부 전용)
//   • 네이버 뉴스 → /api/naver (patchkr.com 내부 전용)
//   재배포가 필요한 외부 데이터는 각 원천(한국은행 ECOS·data.go.kr·국회 OpenAPI)에서 직접 받으세요.

const fs = require('fs');
const path = require('path');

let _politiciansCache = null;
let _glossaryCache = null;

function loadJson(name) {
  try {
    const filePath = path.join(process.cwd(), 'data', name + '.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function getPoliticians() {
  if (!_politiciansCache) _politiciansCache = loadJson('politicians');
  return _politiciansCache;
}

function getGlossary() {
  if (!_glossaryCache) _glossaryCache = loadJson('glossary');
  return _glossaryCache;
}

export default async function handler(req, res) {
  // CORS — 모든 도메인 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // 24시간 CDN 캐시
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const type = req.query.type;

  // 루트: endpoint 목록
  if (!type) {
    const pol = getPoliticians();
    const gloss = getGlossary();
    return res.status(200).json({
      name: '대한민국 패치노트 데이터 API',
      version: '1.0',
      endpoints: {
        '/api/data?type=politicians': '정치인 전체 (' + (pol?.people?.length || '?') + '명) — group·id 파라미터 지원',
        '/api/data?type=politicians&id=ID': '단일 정치인',
        '/api/data?type=politicians&group=GROUP': '그룹별 (legislative·executive·judicial·local·historical)',
        '/api/data?type=glossary': '정치 용어 사전 (' + (gloss?.terms?.length || '?') + '개)',
        '/api/data?type=glossary&category=CAT': '카테고리별 용어',
        '/api/data?type=parties': '정당 메타정보',
        '/api/data?type=info': '사이트 통계·요약',
      },
      license: {
        politicians: '공공누리 1유형 + CC BY-SA 4.0 (위키 인용)',
        glossary:    'CC BY-SA 4.0 (patchkr.com 자체 저작)',
        parties:     'CC BY 4.0',
        info:        'CC BY 4.0',
      },
      attribution: 'Data: patchkr.com · https://github.com/minsoo500101-rgb/politik',
      contact: 'minsoo500101@gmail.com',
      rate_limit: 'no hard limit, please be reasonable. CDN cache 24h.',
      cors: 'all origins allowed (자체 데이터만 — 외부 시세·뉴스는 별도 endpoint, Origin 제한)',
      _note: '시세(quote)·네이버 뉴스(naver) endpoint는 ToS상 patchkr.com 내부 전용입니다.',
    });
  }

  if (type === 'politicians') {
    const pol = getPoliticians();
    if (!pol) return res.status(500).json({ error: 'politicians.json load failed' });
    const id = req.query.id;
    if (id) {
      const person = pol.people.find(p => p.id === id);
      if (!person) return res.status(404).json({ error: 'not found', id });
      return res.status(200).json({ data: person, source: 'patchkr.com' });
    }
    const group = req.query.group;
    if (group) {
      const filtered = pol.people.filter(p => p.group === group);
      return res.status(200).json({
        count: filtered.length,
        group,
        data: filtered,
        source: 'patchkr.com'
      });
    }
    return res.status(200).json({
      version: pol.version,
      syncedAt: pol.syncedAt,
      count: pol.people.length,
      data: pol.people,
      source: 'patchkr.com'
    });
  }

  if (type === 'glossary') {
    const gloss = getGlossary();
    if (!gloss) return res.status(500).json({ error: 'glossary.json load failed' });
    const category = req.query.category;
    if (category) {
      const filtered = gloss.terms.filter(t => t.category === category);
      return res.status(200).json({
        count: filtered.length,
        category,
        data: filtered,
        source: 'patchkr.com'
      });
    }
    return res.status(200).json({
      count: gloss.terms.length,
      categories: [...new Set(gloss.terms.map(t => t.category))],
      data: gloss.terms,
      source: 'patchkr.com'
    });
  }

  if (type === 'parties') {
    const pol = getPoliticians();
    if (!pol) return res.status(500).json({ error: 'politicians.json load failed' });
    return res.status(200).json({
      parties: pol.parties || [],
      party_roles: pol.party_roles || {},
      source: 'patchkr.com'
    });
  }

  if (type === 'info') {
    const pol = getPoliticians();
    const gloss = getGlossary();
    const byGroup = {};
    if (pol?.people) {
      for (const p of pol.people) byGroup[p.group] = (byGroup[p.group] || 0) + 1;
    }
    return res.status(200).json({
      site: 'patchkr.com',
      politicians: {
        total: pol?.people?.length || 0,
        by_group: byGroup,
        with_career: pol?.people?.filter(p => p.career && p.career.length).length || 0,
      },
      glossary: {
        total: gloss?.terms?.length || 0,
      },
      version: pol?.version,
      syncedAt: pol?.syncedAt,
      source: 'patchkr.com'
    });
  }

  return res.status(400).json({
    error: 'unknown type',
    type,
    available: ['politicians', 'glossary', 'parties', 'info']
  });
}
