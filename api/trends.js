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
    // 한국과 무관한 외국 토픽 필터링
    const items = req.query.raw === '1' ? allItems : allItems.filter(it => isRelevantToKorea(it));
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

// 한국과 관련 있는 토픽인지 판별 (외국 스포츠·해외 이슈 제거)
const FOREIGN_NOISE_PATTERNS = [
  // 인도 IPL 크리켓
  /\b(rajasthan|royals|sunrisers|hyderabad|mumbai indians|chennai super|delhi capitals|punjab kings|lucknow|gujarat titans|kolkata knight)\b/i,
  /\b(ipl|cricket|scorecard|wicket|batsman)\b/i,
  // 기타 해외 스포츠
  /\b(nba|nfl|nhl|mlb|premier league|champions league)\b/i,
  // 영어 매치업 패턴
  /\bvs\b.*\b(match|game|score)\b/i,
];
const KOREAN_SOURCES = ['daum', 'naver', '조선', '중앙', '한겨레', '경향', 'kbs', 'mbc', 'sbs', 'jtbc', 'ytn', 'sbs.co.kr', 'donga', 'chosun', 'hani', 'khan', '연합뉴스', '뉴스1', '뉴시스', '머니투데이', '한국경제', '매일경제', '이데일리', '디지털타임스', 'zdnet'];

function isRelevantToKorea(item) {
  const title = item.title || '';
  // 1) 한글이 포함된 토픽은 무조건 통과
  if (/[가-힣]/.test(title)) return true;
  // 2) 짧은 영어 (5자 이하, 약어로 추정) 통과 (SBS, BTS 등)
  if (title.trim().length <= 5) return true;
  // 3) 외국 노이즈 패턴 매칭되면 제외
  for (const re of FOREIGN_NOISE_PATTERNS) {
    if (re.test(title)) return false;
  }
  // 4) 뉴스 소스 중 한국 매체가 1개라도 있으면 통과
  const newsSources = (item.news_items || []).map(n => (n.source || '').toLowerCase()).join(' ');
  const newsUrls = (item.news_items || []).map(n => n.url || '').join(' ');
  for (const k of KOREAN_SOURCES) {
    if (newsSources.includes(k) || newsUrls.includes(k)) return true;
  }
  // 5) 한국 도메인 (.kr) 뉴스 있으면 통과
  if (/\.kr[\/\b]/.test(newsUrls)) return true;
  // 그 외 순수 영어 + 한국 매체 없음 = 외국 토픽으로 간주
  return false;
}
