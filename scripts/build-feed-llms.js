#!/usr/bin/env node
/**
 * feed.xml(RSS) + llms.txt '분석·기록' 섹션 자동 생성기 — V31.79
 *
 * 배경: 원본 기사 28편이 feed.xml에도 llms.txt에도 없어서
 *  ① RSS 구독자·뉴스 수집기가 신규 기사를 못 받고(SEO)
 *  ② AI 검색이 참조하는 llms.txt에 기사가 전혀 노출되지 않았다(GEO).
 * 두 파일 모두 수동 관리라 3개월간 방치됐으므로, 기사 HTML의 ld+json에서
 * 메타데이터를 읽어 자동 생성하도록 바꾼다.
 *
 * 실행: node scripts/build-feed-llms.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://patchkr.com';
const LLMS_START = '<!-- ARTICLES:START -->';
const LLMS_END = '<!-- ARTICLES:END -->';

// ── 1) 기사 메타 수집 ────────────────────────────────────────────
function collectArticles() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html') || f === 'index.html') continue;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = h.match(/<script type="application\/ld\+json">(\{"@context[\s\S]*?)<\/script>/);
    if (!m) continue;
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    if (j['@type'] !== 'NewsArticle' && j['@type'] !== 'Article') continue;
    const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || j.description || '';
    out.push({
      file: f,
      url: `${BASE}/${f}`,
      title: j.headline || '',
      desc: desc.replace(/\s+/g, ' ').trim(),
      published: j.datePublished || '',
      modified: j.dateModified || j.datePublished || '',
      lang: j.inLanguage || 'ko',
    });
  }
  out.sort((a, b) => (b.modified || '').localeCompare(a.modified || '') || b.file.localeCompare(a.file));
  return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// YYYY-MM-DD → RFC-822 (KST 고정)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function rfc822(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 12:00 KST
  return `${DOW[dt.getUTCDay()]}, ${String(d).padStart(2, '0')} ${MON[m - 1]} ${y} 12:00:00 +0900`;
}

// ── 2) feed.xml 생성 ─────────────────────────────────────────────
function buildFeed(arts) {
  const latest = arts.slice(0, 25);
  const build = rfc822(latest[0]?.modified || new Date().toISOString().slice(0, 10));
  const items = latest.map(a => `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(a.url)}</link>
      <guid isPermaLink="true">${esc(a.url)}</guid>
      <description>${esc(a.desc.slice(0, 300))}</description>
      <pubDate>${rfc822(a.published || a.modified)}</pubDate>
      <category>분석·기록</category>
    </item>`).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>대한민국 패치노트 · Korea Patch Notes</title>
    <link>${BASE}/</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>한국 정치·법안·선거·경제를 공식 출처로 정리한 분석·기록. 계엄·선거·사법·경제·안보 심층 기사.</description>
    <language>ko-KR</language>
    <copyright>공공누리 1유형(공공데이터) · 기사 본문 (c) 대한민국 패치노트</copyright>
    <category>정치</category>
    <category>대한민국</category>
    <category>데이터 저널리즘</category>
    <lastBuildDate>${build}</lastBuildDate>
    <generator>patchkr build-feed-llms.js</generator>

${items}

  </channel>
</rss>
`;
}

// ── 3) llms.txt '분석·기록' 섹션 생성 ────────────────────────────
function buildLlmsSection(arts) {
  const ko = arts.filter(a => a.lang !== 'en');
  const en = arts.filter(a => a.lang === 'en');
  const line = a => `- [${a.title}](${a.url}) — ${a.desc.slice(0, 150)}${a.desc.length > 150 ? '…' : ''} (${a.modified})`;
  return [
    LLMS_START,
    '',
    '## 분석·기록 (원본 기사)',
    '',
    `> patchkr가 공식 1차 자료(헌재·법원·국회·중앙선관위·통계청·한국은행 등)를 직접 확인해 작성한 기사다. 각 기사는 본문에 출처를 표기하고, 사실과 주장을 구분하며, 확정 전 판결에는 무죄추정을 명시한다. 인용 시 기사 URL과 함께 원 출처를 함께 확인할 것을 권장한다. 총 ${arts.length}편(한국어 ${ko.length}·영어 ${en.length}). 목록은 최신 수정순.`,
    '',
    '### 한국어',
    ...ko.map(line),
    '',
    '### English (Korea, Explained)',
    `- [${BASE}/en](${BASE}/en): 영어 explainer 허브`,
    ...en.map(line),
    '',
    `- 전체 목록: [${BASE}/analysis.html](${BASE}/analysis.html) · RSS: [${BASE}/feed.xml](${BASE}/feed.xml)`,
    '',
    LLMS_END,
  ].join('\n');
}

function injectInto(file, section, anchor) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return false;
  let t = fs.readFileSync(p, "utf8");
  if (t.includes(LLMS_START) && t.includes(LLMS_END)) {
    t = t.replace(new RegExp(LLMS_START + '[\\s\\S]*?' + LLMS_END), section);
  } else if (t.includes(anchor)) {
    t = t.replace(anchor, section + '\n\n' + anchor);
  } else {
    t = t + '\n\n' + section + '\n';
  }
  fs.writeFileSync(p, t, "utf8");
  return true;
}

// ── 실행 ─────────────────────────────────────────────────────────
const arts = collectArticles();
if (!arts.length) { console.error('기사를 찾지 못했습니다.'); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'feed.xml'), buildFeed(arts), 'utf8');
// data/articles.json — 인물 상세 '관련 분석·기록' 블록이 쓰는 경량 인덱스.
// 이름 매칭은 meta description만으로는 부족해(본문에만 등장하는 인물이 많다) 기사 본문을 훑어
// 인물 DB(politicians.json + assembly-22.json)에 있는 이름을 people 배열로 뽑아 둔다.
const kickerOf = f => ((fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<div class="kicker">([^<]*)</) || [])[1] || '').trim();
// ⚠ 동명이인 주의: 이름만으로 매칭하면 '김민석'(민주당 대표) 기사가 도감의 '김민석'(고용노동부 차관)
// 페이지에 붙는다(이상봉 사건과 같은 유형). 그래서 이름이 등장한 자리 앞뒤 40자 안에 그 인물의
// 직책·정당 토큰이 함께 있어야만 매칭하고, 결과는 이름이 아니라 인물 ID로 저장한다(정밀도 우선).
const PEOPLE = (() => {
  const out = [];
  // 직책 토큰만 쓴다. 정당명·연도·'제N대'는 동명이인을 가르지 못해 오탐만 늘린다
  // (예: 역대 인물 '이재명(전 경기지사)'가 정당명 토큰으로 현직 대통령 기사에 붙음).
  const tok = s => String(s || '').split(/[^가-힣A-Za-z0-9]+/)
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !/^(전직|현직|제\d+대|사퇴|당선무효|임기|만료)$/.test(t) && !/(당|정의|혁신|미래|국민의힘|더불어민주)/.test(t));
  try {
    for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/politicians.json'), 'utf8')).people || []) {
      if (!p.name_ko || p.name_ko.length < 3 || !p.id) continue;
      const tokens = [...new Set([...tok(p.role), ...tok(p.title)])];
      if (tokens.length) out.push({ id: p.id, name: p.name_ko, tokens });
    }
  } catch {}
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assembly-22.json'), 'utf8'));
    for (const m of (Array.isArray(j) ? j : (j.members || []))) {
      const name = m.name || m.HG_NM, id = m.mona_cd || m.MONA_CD;
      if (!name || name.length < 3 || !id) continue;
      out.push({ id, name, tokens: ['의원', '국회의원', '원내대표', '위원장', '간사', '후보자'] });
    }
  } catch {}
  return out;
})();
const peopleIn = f => {
  const body = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const ids = new Set();
  for (const p of PEOPLE) {
    let i = body.indexOf(p.name);
    while (i >= 0) {
      // 한국어는 직책이 이름 뒤에 온다("김민석 대표", "이재명 대통령").
      // ① 이름 바로 앞이 한글이면 합성어("친이재명계")라 인물 언급이 아님 → 건너뜀
      // ② 뒤쪽 창은 문장·절 경계(. , · ( ) 줄바꿈)에서 끊는다 — "…이재명계로 분류된다. 즉 대표는 김민석"처럼
      //    다음 문장의 직책이 넘어와 붙는 오탐을 막는다. 앞쪽 창은 두지 않는다 — "김민석 대표는 이재명 정부"처럼
      //    바로 앞 인물의 직책이 섞이기 때문.
      const prev = i > 0 ? body[i - 1] : ' ';
      if (!/[가-힣]/.test(prev)) {
        const after = body.slice(i + p.name.length, i + p.name.length + 28).split(/[.,·()\n]/)[0];
        if (p.tokens.some(t => after.includes(t))) { ids.add(p.id); break; }
      }
      i = body.indexOf(p.name, i + p.name.length);
    }
  }
  return [...ids];
};
fs.writeFileSync(path.join(ROOT, 'data', 'articles.json'), JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  count: arts.length,
  items: arts.map(a => ({ url: '/' + a.file, title: a.title, desc: a.desc.slice(0, 200), date: a.published || a.modified, kicker: kickerOf(a.file), lang: a.lang, people: peopleIn(a.file) })),
}), 'utf8');
const section = buildLlmsSection(arts);
injectInto("llms.txt", section, "## 공개 API");
injectInto("llms-full.txt", section, "## API 호출 예시");
console.log(`✅ feed.xml — 기사 ${Math.min(arts.length, 25)}편 (lastBuildDate ${rfc822(arts[0].modified)})`);
console.log(`✅ llms.txt · llms-full.txt — '분석·기록' 섹션 ${arts.length}편 반영`);
console.log(`   최신: ${arts[0].modified} ${arts[0].title.slice(0, 40)}`);
