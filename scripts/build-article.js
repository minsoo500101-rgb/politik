#!/usr/bin/env node
/**
 * 기사 사양(JSON) → 정적 기사 HTML.
 *
 * 왜 저장소에 두나: 지금까지는 라운드마다 임시 폴더에 gen-sepXX.js 를 만들어 썼는데,
 * 임시 폴더가 정리되면서 생성기와 자체 광고 모듈이 통째로 사라졌다. 기사 형식의 기준을 저장소에 고정한다.
 * 머리(head)의 스타일은 기존 기사에서 그대로 뽑아 쓴다 — 기사마다 모양이 어긋나지 않게.
 *
 * 사용: node scripts/build-article.js <spec.json> [--dry]
 *
 * spec = { today: "YYYY-MM-DD", articles: [ {
 *   slug, domain, kicker, headline, eventDate, dek, lead, kpis:[{n,l}×4],
 *   sections:[{h2, content}], caveats:[], sources:[], nav:[{href,label}],
 *   lang?: "ko"|"en", faq?: [{q,a}]            // 영어 기사는 lang:"en"
 * } ] }
 *
 * content 문법: 빈 줄로 문단 구분 · "표:/Table: a | b" + "행N:/RowN: …" · "타임라인:/Timeline: A → B" · <b>만 허용
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_ARTICLE = 'chungmun-superweek-sep15-16-2026.html';   // 머리 스타일 기준 기사
const BASE = 'https://patchkr.com';

const specPath = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!specPath) { console.error('사용: node scripts/build-article.js <spec.json>'); process.exit(1); }
const SPEC = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PUB = SPEC.today;

const TPL = fs.readFileSync(path.join(ROOT, TEMPLATE_ARTICLE), 'utf8').replace(/\r\n/g, '\n');
const STYLE = TPL.match(/<style>\n([\s\S]*?)<\/style><script defer/)[1];
const POLISH = TPL.match(/(<style id="trend-polish">[\s\S]*?<\/style>)/)[1];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');

// ── 자체 서비스 광고(하우스 애드) — 기사당 정확히 1개, 섹션 사이에만, sponsored 표기 ──
const ADS = {
  momento: {
    href: 'https://www.momento.cards/?utm_source=patchkr&utm_medium=house&utm_campaign=article', icon: '💌',
    name: '모멘토 momento', line: '청첩장·돌잔치·생일 모바일 카드를 만들고 카카오톡으로 보냅니다. 받는 분은 가입 없이 열어봅니다.', cta: '카드 만들기 →',
  },
  clinch: {
    href: 'https://cupbracket.com/ko/hub?utm_source=patchkr&utm_medium=house&utm_campaign=article', icon: '⚾',
    name: 'Clinch', line: 'KBO·K리그·월드컵의 매직넘버와 진출 경우의 수를 공식 기록으로 계산하고, 계산 근거까지 보여줍니다.', cta: '경우의 수 보기 →',
  },
  clinchEn: {
    href: 'https://cupbracket.com/en/hub?utm_source=patchkr&utm_medium=house&utm_campaign=article_en', icon: '⚾',
    name: 'Clinch', line: 'Magic numbers, playoff pictures and clinch scenarios for MLB, NFL, NBA, F1 and KBO — computed from official standings.', cta: 'See the scenarios →',
  },
};
function houseAd(kind, en) {
  const a = ADS[kind];
  return `<a class="hax" href="${a.href}" target="_blank" rel="noopener sponsored">
  <div class="hax-l">${en ? 'AD · A service by HYT, the publisher of this site' : 'AD · 한양텍 자체 서비스'}</div>
  <div class="hax-b">
    <span class="hax-i" aria-hidden="true">${a.icon}</span>
    <span style="flex:1;min-width:0">
      <span class="hax-t">${esc(a.name)}</span>
      <span class="hax-d">${esc(a.line)}</span>
    </span>
    <span class="hax-c">${esc(a.cta)}</span>
  </div>
</a>`;
}

function renderTable(lines) {
  const head = lines[0].replace(/^(표|Table):\s*/i, '').split('|').map((s) => s.trim());
  const rows = lines.slice(1).filter((l) => /^(행|Row)\s*\d+\s*:/i.test(l))
    .map((l) => l.replace(/^(행|Row)\s*\d+\s*:\s*/i, '').split('|').map((s) => s.trim()));
  const numeric = (c) => /^[\d,.\-+%]+$|억|조|명$|일$|%$/.test(c);
  const table = `<table>\n<tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr>\n` +
    rows.map((r) => `<tr>${r.map((c, i) => `<td${i > 0 && numeric(c) ? ' class="r"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('\n') +
    '\n</table>';
  return head.length > 4 ? `<div class="tw">${table}</div>\n<p class="twn">↔ 좌우로 밀어서 보세요.</p>` : table;
}

function renderContent(content) {
  const out = [];
  for (const block of String(content).split(/\n\s*\n/)) {
    const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^(표|Table):/i.test(lines[0])) { out.push(renderTable(lines)); continue; }
    if (/^(타임라인|Timeline):/i.test(lines[0])) {
      const steps = lines.join(' ').replace(/^(타임라인|Timeline):\s*/i, '').split('→').map((s) => s.trim()).filter(Boolean);
      out.push(`<ul class="tl2">${steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>`);
      continue;
    }
    out.push(lines.map((l) => `<p>${inline(l)}</p>`).join('\n'));
  }
  return out.join('\n\n');
}

function firstSentence(t, en) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  const m = en ? s.match(/^(.+?[.!?])(?:\s|$)/) : s.match(/^(.+?(?:다|음|함|됨|것)\.)(?:\s|$)/);
  return m ? m[1] : s.slice(0, 110);
}

let adIdx = 0;
function page(a) {
  const en = a.lang === 'en';
  const url = `${BASE}/${a.slug}.html`;
  const desc = String(a.dek).replace(/\s+/g, ' ').slice(0, 300);
  const news = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: a.headline, description: desc, datePublished: PUB, dateModified: PUB, inLanguage: en ? 'en' : 'ko',
    publisher: { '@type': 'Organization', name: '대한민국 패치노트', alternateName: 'Korea Patch Notes', url: BASE,
      logo: { '@type': 'ImageObject', url: `${BASE}/og-image.png?v=2`, width: 1200, height: 630 } },
    about: a.domain || 'Korea',
    image: { '@type': 'ImageObject', url: `${BASE}/og-image.png?v=2`, width: 1200, height: 630 },
    author: { '@type': 'Organization', name: en ? 'Korea Patch Notes' : '대한민국 패치노트', url: BASE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isAccessibleForFree: true,
  };
  const crumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: en ? 'Home' : '홈', item: `${BASE}/` },
      en ? { '@type': 'ListItem', position: 2, name: 'Korea, Explained', item: `${BASE}/en` }
         : { '@type': 'ListItem', position: 2, name: '분석·기록', item: `${BASE}/analysis.html` },
      { '@type': 'ListItem', position: 3, name: a.headline.slice(0, 60), item: url },
    ],
  };
  // FAQ 구조화 데이터 — 답변엔진(구글 AI 개요·퍼플렉시티)이 질문형으로 인용하기 좋은 형식
  const faqLd = (a.faq || []).length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: a.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  } : null;

  const secs = a.sections.map((s) => `<h2>${inline(s.h2)}</h2>\n${renderContent(s.content)}`);
  const mid = Math.max(1, Math.floor(secs.length / 2));
  const ad = en ? houseAd('clinchEn', true) : houseAd(adIdx++ % 2 === 0 ? 'momento' : 'clinch', false);
  const body = [...secs.slice(0, mid), ad, ...secs.slice(mid)].join('\n\n');

  const kpis = (a.kpis || []).slice(0, 4).map((k) =>
    `  <div class="kpi"><div class="n">${inline(k.n)}</div><div class="l">${inline(k.l)}</div></div>`).join('\n');
  const faqHtml = (a.faq || []).length
    ? `<h2>${en ? 'Frequently asked questions' : '자주 묻는 질문'}</h2>\n` + a.faq.map((f) =>
        `<details class="note"><summary><b>${inline(f.q)}</b></summary><p style="margin:10px 0 0">${inline(f.a)}</p></details>`).join('\n')
    : '';
  const cav = a.caveats || [];
  const caveats = cav.length ? `<details class="note cav">
<summary><b>${en ? 'What to keep in mind' : '읽을 때 유의할 점'}</b> — ${en ? `${cav.length} points we could not confirm or that need caution (expand)` : `확인하지 못했거나 유보가 필요한 ${cav.length}가지 (펼치기)`}</summary>
<ul style="margin:10px 0 0;padding-left:18px">
${cav.map((c) => `<li style="margin:6px 0">${inline(c)}</li>`).join('\n')}
</ul>
</details>` : '';
  const d = new Date(PUB + 'T12:00:00+09:00');
  const byline = en
    ? `Published ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })} · primary records cross-checked with multiple outlets · unconfirmed points are stated in the text`
    : `${PUB.slice(0, 4)}년 ${Number(PUB.slice(5, 7))}월 ${Number(PUB.slice(8, 10))}일 작성 · 사건일 ${esc(a.eventDate)} · 1차 자료·복수 보도 대조 · 미확인 사항은 본문에 명시`;
  const nav = (a.nav || []).slice(0, 2).map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join('');

  return `<!doctype html><html lang="${en ? 'en' : 'ko'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.headline)} | ${en ? 'Korea Patch Notes' : '대한민국 패치노트'}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(a.headline)}">
<meta property="og:description" content="${esc(desc.slice(0, 180))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/og-image.png?v=2"><meta property="og:site_name" content="${en ? 'Korea Patch Notes' : '대한민국 패치노트'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1352114558631968" crossorigin="anonymous"></script>
<script type="application/ld+json">${JSON.stringify(news)}</script>
<script type="application/ld+json">${JSON.stringify(crumb)}</script>${faqLd ? `\n<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ''}
<script>try{var t=localStorage.getItem('politik:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.setAttribute('data-theme','dark');}catch(e){}</script>
<style>
${STYLE}</style><script defer src="/_vercel/insights/script.js"></script>${POLISH}
</head><body><div class="wrap">
<div class="top"><a href="${en ? '/en' : '/'}">← ${en ? 'Korea Patch Notes' : '대한민국 패치노트'}</a><span><button class="tt" onclick="(function(){var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{localStorage.setItem('politik:theme',n)}catch(e){}})()">🌓</button></span></div>

<div class="kicker">${inline(a.kicker)}</div>
<h1>${inline(a.headline)}</h1>
<p class="dek">${inline(firstSentence(a.dek, en))}</p>
<div class="byline">${byline}</div>

<div class="lead">
${String(a.lead).replace(/<(?!\/?b>)/g, '&lt;')}
</div>

${kpis ? `<div class="kpis">\n${kpis}\n</div>\n\n` : ''}${body}

${faqHtml}

${caveats}

<h2>${en ? 'Sources' : '출처'}</h2>
<ul class="src">
${(a.sources || []).map((s) => `<li>${inline(s)}</li>`).join('\n')}
</ul>

<footer>
<div class="ft-nav">${en
    ? `<a href="/en">Korea, Explained</a>${nav}<a href="/">한국어</a><a href="/about">About</a><a href="/privacy">Privacy</a>`
    : `<a href="/">홈</a><a href="/analysis.html">분석·기록</a>${nav}<a href="/about">소개</a><a href="/privacy">개인정보</a>`}</div>
${en
    ? 'Korea Patch Notes · patchkr.com · Facts compiled from official records and published reporting for information only; we do not support or oppose any party. © 2026 Korea Patch Notes.'
    : '대한민국 패치노트 · patchkr.com · 본 정리는 공식 기록·보도에 근거한 정보 제공용이며 특정 정파를 지지하거나 반대하지 않습니다. © 2026 대한민국 패치노트.'}
</footer>
</div></body></html>
`;
}

let n = 0;
for (const a of SPEC.articles) {
  const html = page(a);
  const f = path.join(ROOT, a.slug + '.html');
  if (!DRY) fs.writeFileSync(f, html, 'utf8');
  console.log(`  ✅ ${a.slug}.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB  [${a.lang === 'en' ? 'EN' : a.domain}]${DRY ? ' (dry)' : ''}`);
  n++;
}
console.log(`\n${n}편 ${DRY ? '확인' : '생성'}`);
