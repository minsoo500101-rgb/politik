// 구글 트렌드 한국 RSS 프록시
// CORS 우회 + XML → JSON 변환 + Vercel Edge 캐시
//
// GET /api/trends?geo=KR
//   geo: 국가 코드 (default KR)
//
// 응답:
// {
//   items: [
//     {
//       title: "외환위기",
//       approx_traffic: "500+",
//       pubDate: "Wed, 27 May 2026...",
//       picture: "https://...",
//       picture_source: "Daum",
//       news_items: [{ title, url, picture, source }, ...]
//     }, ...
//   ],
//   total: 20,
//   fetched_at: "2026-05-27T..."
// }

const GOOGLE_TRENDS_RSS = 'https://trends.google.com/trending/rss';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 10분 캐시 (구글 트렌드도 시간 단위 갱신)
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=1200');

  const geo = (req.query.geo || 'KR').toUpperCase();
  const hl = req.query.hl || 'ko';
  const url = `${GOOGLE_TRENDS_RSS}?geo=${geo}&hl=${hl}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaPatchNotes/1.0; +https://patchkr.com)',
        'Accept': 'application/rss+xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Google Trends fetch 실패', status: r.status });
    }
    // 명시적 UTF-8 디코딩 (Vercel Edge에서 r.text() charset 오인 회피)
    const buf = await r.arrayBuffer();
    const xml = new TextDecoder('utf-8').decode(buf);

    // 디버그 모드: ?debug=1
    if (req.query.debug === '1') {
      return res.status(200).json({
        debug: true,
        xml_length: xml.length,
        xml_preview: xml.slice(0, 1500),
        contains_korean: /[가-힣]/.test(xml),
      });
    }

    const allItems = parseTrendsRss(xml);
    // V22.2 — 정밀 처리: 정규화 → 필터링 → 카테고리 → 중복 제거
    let items;
    if (req.query.raw === '1') {
      items = allItems;
    } else {
      // 1) 제목 정규화
      const normalized = allItems.map(it => ({ ...it, title: normalizeTitle(it.title) }));
      // 2) 한국 관련 필터
      const filtered = normalized.filter(it => isRelevantToKorea(it));
      // 3) 카테고리 자동 분류
      const categorized = filtered.map(it => ({ ...it, category: inferCategory(it) }));
      // 4) 비슷한 중복 제거
      items = dedupSimilarTrends(categorized);
    }
    return res.status(200).json({
      items,
      total: items.length,
      filtered_out: allItems.length - items.length,
      geo,
      hl,
      source: 'Google Trends',
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// 간단한 RSS XML 파서 (구글 트렌드 전용)
function parseTrendsRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const body = m[1];
    const item = {
      title: pick(body, 'title'),
      approx_traffic: pick(body, 'ht:approx_traffic'),
      pubDate: pick(body, 'pubDate'),
      link: pick(body, 'link'),
      picture: pick(body, 'ht:picture'),
      picture_source: pick(body, 'ht:picture_source'),
      news_items: [],
    };
    // news_item 여러 개
    const newsRegex = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/g;
    let nm;
    while ((nm = newsRegex.exec(body)) !== null) {
      const nb = nm[1];
      item.news_items.push({
        title: stripHtml(pick(nb, 'ht:news_item_title')),
        url: pick(nb, 'ht:news_item_url'),
        snippet: stripHtml(pick(nb, 'ht:news_item_snippet')),
        picture: pick(nb, 'ht:news_item_picture'),
        source: pick(nb, 'ht:news_item_source'),
      });
    }
    items.push(item);
  }
  return items;
}

function pick(text, tag) {
  // CDATA + plain 모두 처리
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  let m = cdataRe.exec(text);
  if (m) return m[1].trim();
  m = plainRe.exec(text);
  if (m) return decodeEntities(m[1].trim());
  return '';
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(s) {
  return decodeEntities(s).replace(/<[^>]+>/g, '');
}

// ============================================================
// V22.2 — 트렌드 필터링 정밀 보완
// ============================================================

// 외국 노이즈 패턴 (확장)
const FOREIGN_NOISE_PATTERNS = [
  // 인도 IPL 크리켓
  /\b(rajasthan|royals|sunrisers|hyderabad|mumbai indians|chennai super|delhi capitals|punjab kings|lucknow|gujarat titans|kolkata knight)\b/i,
  /\b(ipl|cricket|scorecard|wicket|batsman|bowler)\b/i,
  // 해외 스포츠
  /\b(nba|nfl|nhl|mlb|premier league|champions league|ncaa|wwe|ufc|formula 1|nascar)\b/i,
  // 영어 매치업/주식
  /\bvs\b.*\b(match|game|score|fight)\b/i,
  /\b(stock|share|nasdaq|dow jones|ftse)\b/i,
  // 영어 일반 패턴 (긴 영어 토픽은 대부분 외국 이슈)
  /\b(today|tonight|breaking|update|live)\b/i,
];

// 한국 매체 도메인·이름 (확장)
const KOREAN_SOURCES = [
  'daum', 'naver', '조선', '중앙', '한겨레', '경향', 'kbs', 'mbc', 'sbs', 'jtbc', 'ytn',
  'donga', 'chosun', 'hani', 'khan', '연합뉴스', '뉴스1', '뉴시스', '머니투데이',
  '한국경제', '매일경제', '이데일리', '디지털타임스', 'zdnet', '서울신문', '국민일보',
  '문화일보', '세계일보', '한국일보', '국제신문', '부산일보', '강원일보',
  'inews24', 'mt.co.kr', 'mk.co.kr', 'hankyung', 'edaily', 'newsis',
];

// 한국 약어 화이트리스트 (영어 4자 이하지만 한국 컨텍스트)
const KOREAN_ABBREV_WHITELIST = new Set([
  'SBS', 'MBC', 'KBS', 'JTBC', 'YTN', 'TBS', 'EBS', 'TV조선',
  'BTS', 'TWS', 'IVE', 'NCT', 'SM', 'JYP', 'YG', 'HYBE',
  'KIA', 'SSG', 'NC', 'LG', 'SK', 'KT', 'KAI', 'GS', 'NH', 'KB', 'IBK',
  'BBQ', 'BHC', 'CGV', 'CJ', 'GTX', 'KTX', 'AI', 'EV',
  'POSCO', 'COSMAX', 'AMORE',
]);

// 너무 모호한 일반 한국어 단어 (트렌드로 부적합)
const GENERIC_KOREAN = new Set([
  '기사', '뉴스', '오늘', '어제', '내일', '데이터', '시스템', '회사', '제품', '서비스',
  '사람', '인물', '문제', '결과', '내용', '정보', '소식', '주제', '관련', '연관',
  '의원', '대표', '회장', '시민', '국민', '한국', '대한민국', '서울', '부산',
  '일반', '평범', '보통', '기본', '특별',
]);

// 띄어쓰기 정리 — 한글 사이 비정상 띄어쓰기 1개로 통일
function normalizeTitle(title) {
  if (!title) return '';
  return title.replace(/\s+/g, ' ').trim();
}

function isRelevantToKorea(item) {
  const title = normalizeTitle(item.title || '');
  // 1) 한글 포함 → 모호어 검사 후 통과
  if (/[가-힣]/.test(title)) {
    // 너무 모호한 한국어 (한 단어 + GENERIC 명단)
    if (GENERIC_KOREAN.has(title)) return false;
    // 2자 미만 단독 토픽 (의미 모호)
    if (title.length < 2) return false;
    return true;
  }
  // 2) 영어만 — 한국 약어 화이트리스트 확인
  const upper = title.toUpperCase().replace(/\s/g, '');
  if (KOREAN_ABBREV_WHITELIST.has(upper)) return true;
  // 3) 4자 이하 단순 대문자 약어
  if (/^[A-Z]{1,4}$/.test(upper) && title.length <= 4) return true;
  // 4) 외국 노이즈 패턴
  for (const re of FOREIGN_NOISE_PATTERNS) {
    if (re.test(title)) return false;
  }
  // 5) 뉴스 매체에서 한국 매체 확인
  const newsSources = (item.news_items || []).map(n => (n.source || '').toLowerCase()).join(' ');
  const newsUrls = (item.news_items || []).map(n => n.url || '').join(' ');
  for (const k of KOREAN_SOURCES) {
    if (newsSources.includes(k) || newsUrls.includes(k)) return true;
  }
  // 6) .kr 도메인
  if (/\.kr[\/\b]/.test(newsUrls)) return true;
  // 그 외 = 외국 토픽
  return false;
}

// V22.2 — 카테고리 자동 분류 (휴리스틱)
const CATEGORY_RULES = [
  { id: 'politics', label: '🏛 정치', color: '#1e40af',
    keywords: /국회|의원|장관|대통령|총리|민주당|국민의힘|진보당|개혁신당|선거|공약|대선|총선|지선|특검|국정감사/ },
  { id: 'economy', label: '💼 경제', color: '#0ea5e9',
    keywords: /주가|환율|코스피|코스닥|증시|시장|금리|물가|GDP|수출|반도체|삼성전자|SK하이닉스|현대차|기업|상장|배당|투자|부동산|아파트|전세|월세/ },
  { id: 'entertainment', label: '🎬 연예', color: '#dc2626',
    keywords: /배우|가수|아이돌|드라마|시즌|예능|영화|음반|앨범|콘서트|연예|방송|MC|아나운서|K-?POP|뮤직뱅크|쇼미더머니|나는솔로|환승연애/ },
  { id: 'sports', label: '⚽ 스포츠', color: '#16a34a',
    keywords: /축구|야구|농구|배구|골프|올림픽|월드컵|선수|구단|리그|KBO|KBL|KIA|SSG|두산|LG|롯데|손흥민|이강인|국가대표/ },
  { id: 'society', label: '⚖ 사회', color: '#f59e0b',
    keywords: /사건|사고|재판|판결|검찰|법원|경찰|범죄|살인|체포|영장|기소|구속|시위|집회|화재|산불|지진|태풍|폭우/ },
  { id: 'tech', label: '💻 IT/기술', color: '#7c3aed',
    keywords: /스마트폰|아이폰|갤럭시|폴더블|AI|인공지능|챗GPT|로봇|반도체|5G|6G|메타버스|NFT|코인|비트코인|이더리움|블록체인/ },
  { id: 'global', label: '🌍 국제', color: '#0891b2',
    keywords: /미국|일본|중국|러시아|북한|우크라이나|이스라엘|이란|EU|유럽|영국|프랑스|독일|G7|G20|UN|관세|외교|정상회담/ },
];

function inferCategory(item) {
  const title = item.title || '';
  const newsText = (item.news_items || []).map(n => n.title || '').join(' ');
  const allText = title + ' ' + newsText;
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(allText)) return rule;
  }
  return { id: 'other', label: '📌 기타', color: '#6b7280' };
}

// V22.2 — 비슷한 트렌드 중복 제거 (예: "오상진" + "오상진 아내")
function dedupSimilarTrends(items) {
  if (!items.length) return items;
  const kept = [];
  for (const it of items) {
    const t = it.title || '';
    // 이미 기록된 항목의 prefix인지 확인 (더 짧고 traffic 큰 게 primary)
    const isDup = kept.some(prev => {
      const pt = prev.title || '';
      // 한쪽이 다른 한쪽의 부분 문자열 (3자 이상 겹침)
      if (t.length < 3 || pt.length < 3) return false;
      // 한글 토픽 — 한쪽이 다른 한쪽 포함
      if (/[가-힣]/.test(t) && /[가-힣]/.test(pt)) {
        if (t.includes(pt) || pt.includes(t)) {
          // 더 짧은 게 primary로 인정 (보통 인물 단독 이름이 primary)
          // 이 경우 kept에 있는 게 더 짧으면 이 새 항목은 중복
          if (pt.length <= t.length) return true;
        }
      }
      return false;
    });
    if (!isDup) kept.push(it);
  }
  return kept;
}
