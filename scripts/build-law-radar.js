#!/usr/bin/env node
/**
 * data/law/radar.json 생성 — "공포됐지만 아직 시행되지 않은 법령"만 추려 업무 분야로 태깅한다.
 *
 * 왜 따로 만드나: data/law/index.json 은 11,848건 2.3MB라 브라우저에서 통째로 받게 할 수 없다.
 * 레이더 페이지가 쓰는 건 그중 '시행 전' 수백 건뿐이고, 여기에 신구조문대비표에서 뽑은
 * '손대는 조문 제목'을 붙여 두면 페이지는 작은 파일 하나만 받으면 된다.
 *
 * ⚠ 이 파일은 판단을 담지 않는다. 무엇이 언제 어떻게 바뀌는지만 싣고,
 *   위법 여부·대응 방법 같은 해석은 넣지 않는다(변호사법 이슈).
 *
 * 실행: node scripts/build-law-radar.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IDX = path.join(ROOT, 'data/law/index.json');
const BODY = path.join(ROOT, 'data/law/body');
const OUT = path.join(ROOT, 'data/law/radar.json');

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// 업무 분야 — '내 일에 걸리나'로 고를 수 있게 짠 목록이다. 법령 체계 분류가 아니라 담당자 기준.
// name(법령명) 정규식이 1순위, dept(소관부처)는 보조. 둘 다 없으면 태그 없이 '기타'로 남는다.
const DOMAINS = [
  { id: 'labor',   label: '인사·노무',    icon: '🧑‍💼',
    re: /근로|노동|임금|퇴직|고용|채용|파견|기간제|단시간|남녀고용평등|일ㆍ가정|직장 내|해고|노사|산업재해보상|고용보험/,
    dept: /고용노동부/ },
  { id: 'safety',  label: '안전·보건',    icon: '🦺',
    re: /산업안전|중대재해|안전보건|재해예방|승강기|가스안전|소방|화재|위험물|건설기술 진흥|시설물의 안전/,
    dept: /소방청/ },
  { id: 'privacy', label: '개인정보·정보보안', icon: '🔐',
    re: /개인정보|정보통신망|신용정보|전자서명|위치정보|정보보호|마이데이터|클라우드컴퓨팅/,
    dept: /개인정보보호위원회/ },
  { id: 'tax',     label: '세무·회계',    icon: '🧾',
    re: /국세|지방세|법인세|소득세|부가가치세|조세특례|상속세|증여세|관세|회계|외부감사|세무사/,
    dept: /국세청|관세청/ },
  { id: 'contract',label: '계약·거래',    icon: '🤝',
    re: /공정거래|하도급|약관|전자상거래|표시ㆍ광고|가맹사업|대리점|대규모유통업|상생협력|소비자|할부거래|방문판매/,
    dept: /공정거래위원회/ },
  { id: 'corp',    label: '회사·자금',    icon: '🏦',
    re: /상법|자본시장|금융소비자|외부감사|중소기업|벤처|은행|보험업|여신전문|전자금융|자산유동화|기업구조조정/,
    dept: /금융위원회|금융감독원|중소벤처기업부/ },
  { id: 'build',   label: '건설·부동산',  icon: '🏗',
    re: /건축|건설|주택|부동산|국토의 계획|도시개발|재건축|재개발|공동주택|임대차|측량|감정평가|건설기계/,
    dept: /국토교통부/ },
  { id: 'env',     label: '환경·에너지',  icon: '🌱',
    re: /환경|대기|수질|폐기물|온실가스|탄소|화학물질|토양|소음|자원순환|에너지|전기사업|신ㆍ재생/,
    dept: /기후에너지환경부|환경부/ },
  { id: 'food',    label: '식품·위생',    icon: '🍽',
    re: /식품|위생|축산물|건강기능식품|농수산물|원산지|주류|담배/,
    dept: /식품의약품안전처/ },
  { id: 'health',  label: '의료·복지',    icon: '🏥',
    re: /의료|의약품|약사|보건|국민건강보험|노인|장애인|아동|영유아|사회복지|요양|감염병|연금/,
    dept: /보건복지부|질병관리청/ },
  { id: 'logi',    label: '운수·물류',    icon: '🚚',
    re: /운수|운송|물류|화물|여객|자동차관리|도로교통|항만|해운|철도|항공|택배/,
    dept: /해양수산부/ },
  { id: 'edu',     label: '교육·보육',    icon: '🎓',
    re: /교육|학교|학원|유아교육|영유아보육|평생교육|교원|학생/,
    dept: /교육부/ },
  { id: 'ict',     label: 'IT·통신·콘텐츠', icon: '💻',
    re: /전기통신|방송|인터넷|소프트웨어|저작권|콘텐츠|게임|정보통신|전파|디지털|인공지능|데이터 산업|전자문서/,
    dept: /과학기술정보통신부|방송미디어통신위원회/ },
  { id: 'agri',    label: '농림·수산',    icon: '🌾',
    re: /농업|농지|축산|임업|산림|수산|어업|양식|종자|비료|농약|가축/,
    dept: /농림축산식품부|산림청|농촌진흥청/ },
  { id: 'public',  label: '공공·행정',    icon: '🏛',
    re: /공공기관|행정절차|전자정부|국가계약|지방계약|조달|민원|공공데이터|지방자치|보조금|공익신고|청탁금지|부패방지/,
    dept: /조달청|국민권익위원회/ },
];

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** 조문 본문에서 "제12조(직장 내 성희롱의 금지)" 형태의 머리말만 뽑는다 */
function articleHeads(arts) {
  const out = [];
  for (const a of arts) {
    const m = strip(a.content).match(/^제[0-9]+조(?:의[0-9]+)?(?:\([^)]{1,40}\))?/);
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** build_law_pages.py 의 slugify 와 같은 규칙 — law/<slug>.html 존재 여부를 여기서 확인해 둔다 */
function slugify(name) {
  return String(name || '').replace(/[\\/:*?"<>|#%&\s]+/g, '').trim() || 'law';
}

function classify(law) {
  const tags = [];
  for (const d of DOMAINS) {
    if (d.re.test(law.name) || (d.dept && d.dept.test(law.dept || ''))) tags.push(d.id);
  }
  return tags;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (y) => y.slice(0, 4) + '-' + y.slice(4, 6) + '-' + y.slice(6, 8);

/** YYYYMMDD 차이(일). 시간대에 흔들리지 않게 UTC 정오 고정 — 페이지 JS와 같은 규칙. */
function dayDiff(a, b) {
  const p = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
  return Math.round((p(a) - p(b)) / 86400000);
}

/** 목록 한 줄을 HTML로. 페이지의 JS 렌더와 같은 마크업이어야 필터링 시 튀지 않는다. */
function rowHtml(it, today) {
  const dd = dayDiff(it.ef, today);
  const cls = dd <= 30 ? ' near' : (dd <= 90 ? ' soon' : '');
  let arts = '';
  if (it.arts && it.arts.length) {
    const shown = it.arts.slice(0, 6);
    arts = '<div class="arts">' + shown.map((a) => `<span class="art">${esc(a)}</span>`).join('') +
           (it.n > shown.length ? `<span class="more">외 ${it.n - shown.length}개 조문</span>` : '') + '</div>';
  } else if (it.rev === '제정') {
    arts = '<div class="arts"><span class="art">신규 제정 — 전체 조문</span></div>';
  }
  const first = it.slug
    ? `<a href="/law/${encodeURIComponent(it.slug)}.html">바뀌는 조문 보기 →</a>`
    : `<a href="/law-diff.html?law=${encodeURIComponent(it.name)}">신구조문 비교 →</a>`;
  return '<div class="row">' +
    '<div class="row-h">' +
      `<div class="dday${cls}"><div class="d">D-${dd}</div><div class="s">${fmt(it.ef).slice(5)}</div></div>` +
      '<div style="min-width:0;flex:1">' +
        `<div class="nm">${esc(it.name)}</div>` +
        `<div class="meta">${esc(it.kind)}<span class="sep">·</span>${esc(it.rev)}` +
          `<span class="sep">·</span>${esc(it.dept)}<span class="sep">·</span>공포 ${fmt(it.pub)}</div>` +
      '</div>' +
    '</div>' + arts +
    '<div class="acts">' + first +
      `<a href="https://www.law.go.kr/lsSc.do?menuId=1&amp;query=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">법제처 원문 ↗</a>` +
    '</div>' +
  '</div>';
}

const MARK_START = '<!-- RADAR:START -->';
const MARK_END = '<!-- RADAR:END -->';
const CHIPS_START = '<!-- CHIPS:START -->';
const CHIPS_END = '<!-- CHIPS:END -->';

/** law-radar.html 안의 표시 영역을 빌드 시점 HTML로 채운다 */
function injectStatic(items, today) {
  const p = path.join(ROOT, 'law-radar.html');
  let h = fs.readFileSync(p, 'utf8');
  const nl = h.includes('\r\n') ? '\r\n' : '\n';

  // 첫 화면 기본값(3개월 내)과 같은 조건. 전부 박으면 문서가 너무 커지므로 60건까지만.
  const initial = items.filter((it) => dayDiff(it.ef, today) <= 90);
  const shown = initial.slice(0, 60);
  const rows = shown.map((it) => rowHtml(it, today)).join(nl) +
    (initial.length > shown.length
      ? `${nl}<p class="more-note">여기까지 ${shown.length}건입니다. 나머지 ${initial.length - shown.length}건과 분야별 추리기는 자바스크립트가 켜진 상태에서 볼 수 있습니다. <a href="/law-radar/labor.html">분야별 목록</a>도 있습니다.</p>`
      : '');

  const chips = DOMAINS.filter((d) => byTagCount[d.id])
    .map((d) => `<a class="chip" href="/law-radar/${d.id}.html">${d.icon} ${esc(d.label)} <span class="c">${byTagCount[d.id]}</span></a>`)
    .join('');

  h = h.replace(new RegExp(MARK_START + '[\\s\\S]*?' + MARK_END),
                MARK_START + nl + rows + nl + MARK_END);
  h = h.replace(new RegExp(CHIPS_START + '[\\s\\S]*?' + CHIPS_END),
                CHIPS_START + nl +
                `<a class="chip" href="/law-radar.html" aria-pressed="true">전체 <span class="c">${items.length}</span></a>` +
                chips + nl + CHIPS_END);
  fs.writeFileSync(p, h, 'utf8');
  console.log(`   ↳ law-radar.html 정적 목록 ${shown.length}건 주입`);
}

let byTagCount = {};

/** 분야별 정적 페이지 law-radar/<id>.html — 색인 대상 URL을 분야 수만큼 늘린다 */
function buildDomainPages(items, byTag, today) {
  const dir = path.join(ROOT, 'law-radar');
  fs.mkdirSync(dir, { recursive: true });
  const tpl = fs.readFileSync(path.join(ROOT, 'law-radar.html'), 'utf8');
  const style = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
  let n = 0;

  for (const d of DOMAINS) {
    const rows = items.filter((it) => it.tags.includes(d.id));
    if (!rows.length) continue;
    const near = rows.filter((it) => dayDiff(it.ef, today) <= 90).length;
    const url = `https://patchkr.com/law-radar/${d.id}.html`;
    const names = rows.slice(0, 6).map((r) => r.name).join(', ');
    const desc = `${d.label} 분야에서 공포는 끝났고 시행일만 남은 법령 ${rows.length}건` +
      (near ? ` (3개월 내 시행 ${near}건)` : '') + `. ${names} 등. ` +
      `시행일까지 남은 날짜와 바뀌는 조문을 법제처 국가법령정보 신구조문대비표로 확인하세요. 무료.`;

    const list = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: `${d.label} — 곧 시행되는 법령`, numberOfItems: rows.length,
      itemListElement: rows.slice(0, 30).map((r, i) => ({
        '@type': 'ListItem', position: i + 1, name: r.name,
        url: r.slug ? `https://patchkr.com/law/${encodeURIComponent(r.slug)}.html` : url,
      })),
    };
    const crumb = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: 'https://patchkr.com/' },
        { '@type': 'ListItem', position: 2, name: '곧 시행되는 법령', item: 'https://patchkr.com/law-radar.html' },
        { '@type': 'ListItem', position: 3, name: d.label, item: url },
      ],
    };

    const others = DOMAINS.filter((o) => o.id !== d.id && byTag[o.id])
      .map((o) => `<a class="chip" href="/law-radar/${o.id}.html">${o.icon} ${esc(o.label)} <span class="c">${byTag[o.id]}</span></a>`).join('');

    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.label)} — 곧 시행되는 법령 ${rows.length}건 | 대한민국 패치노트</title>
<meta name="description" content="${esc(desc.slice(0, 300))}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(d.icon + ' ' + d.label)} — 곧 시행되는 법령 ${rows.length}건">
<meta property="og:description" content="${esc(desc.slice(0, 180))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://patchkr.com/og-law-radar.png?v=1"><meta property="og:site_name" content="대한민국 패치노트">
<meta name="twitter:card" content="summary_large_image">
<link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1352114558631968" crossorigin="anonymous"></script>
<script type="application/ld+json">${JSON.stringify(list)}</script>
<script type="application/ld+json">${JSON.stringify(crumb)}</script>
<script>try{var t=localStorage.getItem('politik:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.setAttribute('data-theme','dark');}catch(e){}</script>
<style>${style}</style><script defer src="/_vercel/insights/script.js"></script>
</head><body><div class="wrap">
<div class="top"><a href="/law-radar.html">← 곧 시행되는 법령</a><span><button class="tt" onclick="(function(){var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{localStorage.setItem('politik:theme',n)}catch(e){}})()">🌓</button></span></div>

<div class="kicker">${d.icon} ${esc(d.label)} · 곧 시행되는 법령</div>
<h1>${esc(d.label)}에서 곧 바뀌는 법령 ${rows.length}건</h1>
<p class="dek">공포는 끝났고 <b>시행일만 남은</b> 법령입니다${near ? `. 이 가운데 <b>${near}건</b>은 3개월 안에 시행됩니다` : ''}. 시행일이 가까운 순서이며, 각 항목의 바뀌는 조문까지 함께 보여드립니다.</p>
<div class="byline">법제처 국가법령정보 신구조문대비표 기준 · ${fmt(today)} 갱신 · 매일 자동 수집 · 법률 자문이 아닙니다</div>

<div class="list">
${rows.map((it) => rowHtml(it, today)).join('\n')}
</div>

<h2>다른 분야도 보기</h2>
<div class="chips"><a class="chip" href="/law-radar.html">📡 전체 ${items.length}</a>${others}</div>

<div class="note">
<b>이 페이지가 하는 일과 하지 않는 일.</b><br>
하는 일 — 법제처 국가법령정보의 공식 신구조문대비표에서 <b>공포 완료·시행 전</b> 법령을 모아, 시행일과 바뀌는 조문 제목을 그대로 보여드립니다.<br>
하지 않는 일 — <b>법률 자문이 아닙니다.</b> 특정 사업장·계약·내규가 적법한지, 무엇을 어떻게 고쳐야 하는지는 판단하지 않습니다. 실제 적용에는 조문 원문 확인과 변호사·노무사 등 전문가의 검토가 필요합니다.<br>
분야 분류는 법령명과 소관 부처를 기준으로 patchkr가 자동으로 붙인 것이라 <b>빠지거나 더 붙는 경우가 있습니다</b>. <a href="/law-radar.html">전체 목록</a>도 함께 확인해 주세요. 시행일은 부칙에 따라 조문별로 다를 수 있습니다.
</div>

<footer>
<div class="ft-nav"><a href="/">홈</a><a href="/law-radar.html">곧 시행되는 법령</a><a href="/law-diff.html">법령 신구비교</a><a href="/law-changes.html">법령 변경 랭킹</a><a href="/about">소개</a><a href="/privacy">개인정보</a></div>
대한민국 패치노트 · patchkr.com · 출처 <a href="https://www.law.go.kr" target="_blank" rel="noopener">법제처 국가법령정보센터</a> · 본 정리는 공식 기록에 근거한 정보 제공용이며 법률 자문이 아닙니다.<br>
© 2026 대한민국 패치노트.<br>
상호 한양텍(HYT) · 대표 차민수 · 사업자등록번호 555-46-01185 · 통신판매업 신고 2026-서울도봉-0358<br>
사업장 서울특별시 도봉구 도봉로 110다길 38 · 전화 010-2320-8041 · <a href="mailto:lyel1029@gmail.com">lyel1029@gmail.com</a>
</footer>
</div></body></html>`;
    fs.writeFileSync(path.join(dir, d.id + '.html'), html, 'utf8');
    n++;
  }
  console.log(`   ↳ law-radar/*.html 분야 페이지 ${n}개 생성`);
}

function main() {
  const raw = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const all = Array.isArray(raw) ? raw : (raw.items || Object.values(raw)[0]);
  const today = ymd(new Date());

  const upcoming = all
    .filter((x) => x.ef && /^\d{8}$/.test(x.ef) && x.ef > today)
    .sort((a, b) => a.ef.localeCompare(b.ef) || a.name.localeCompare(b.name));

  const items = [];
  for (const law of upcoming) {
    let heads = [], nArt = 0;
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BODY, law.mst + '.json'), 'utf8'));
      const arts = b.new || [];
      nArt = arts.length;
      heads = articleHeads(arts).slice(0, 10);
    } catch { /* 신구표가 없는 제정 법령 등 — 조문 목록 없이 싣는다 */ }

    // 법령별 정적 페이지(build_law_pages.py 생성)가 있으면 그쪽으로 보낸다.
    // law-diff.html 은 기간 필터 기본값이 '오늘까지'라 시행 전 개정이 걸러지므로 목적지로 부적절하다.
    const slug = slugify(law.name);
    const hasPage = fs.existsSync(path.join(ROOT, 'law', slug + '.html'));

    items.push({
      mst: law.mst,
      name: law.name,
      slug: hasPage ? slug : '',
      kind: law.kind,
      // 부처 표기에 '해양수산부령,' 처럼 꼬리 쉼표가 붙은 원자료가 있어 정리한다
      dept: String(law.dept || '').replace(/[,\s]+$/, ''),
      rev: law.rev,
      pub: law.pub,
      ef: law.ef,
      n: nArt,
      arts: heads,
      tags: classify(law),
    });
  }

  const byTag = {};
  for (const d of DOMAINS) byTag[d.id] = items.filter((i) => i.tags.includes(d.id)).length;
  byTagCount = byTag;   // injectStatic 이 칩 개수를 쓰기 위해
  const untagged = items.filter((i) => !i.tags.length).length;

  const out = {
    generatedAt: new Date().toISOString(),
    asOf: today,
    total: items.length,
    source: '법제처 국가법령정보 (신구조문대비표)',
    domains: DOMAINS.map((d) => ({ id: d.id, label: d.label, icon: d.icon, count: byTag[d.id] })),
    items,
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

  // ── SEO: 자바스크립트 없이도 목록이 보이게 한다 ───────────────────────────
  // 이 페이지의 가치는 전부 목록인데, 클라이언트에서 fetch로 그리면 크롤러·애드센스 심사는
  // 205단어짜리 빈 껍데기만 본다(홈이 같은 이유로 '가치 없는 콘텐츠' 판정을 받았다).
  // 초기 목록을 빌드 시점에 HTML로 박아 넣고, JS는 그 위에서 필터링만 맡는다.
  injectStatic(items, today);
  buildDomainPages(items, byTag, today);

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`✅ radar.json — 시행 전 ${items.length}건 (${kb} KB, 기준일 ${today})`);
  console.log(`   분야 태그: ${DOMAINS.map((d) => `${d.label} ${byTag[d.id]}`).join(' · ')}`);
  console.log(`   분야 미분류 ${untagged}건 (${(untagged / items.length * 100).toFixed(0)}%)`);
}

main();
