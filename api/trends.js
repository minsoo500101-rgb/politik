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
  const url = `${GOOGLE_TRENDS_RSS}?geo=${geo}`;

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

    const items = parseTrendsRss(xml);
    return res.status(200).json({
      items,
      total: items.length,
      geo,
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
