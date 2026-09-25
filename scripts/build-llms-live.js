#!/usr/bin/env node
/**
 * llms.txt / llms-full.txt 맨 위에 '지금 수치' 블록을 매일 데이터에서 생성한다 (GEO — AI 답변엔진 대응).
 *
 * 왜: 챗GPT·퍼플렉시티·구글 AI 개요 같은 답변엔진은 llms.txt 를 '이 사이트가 무엇을 확실히 아는가'의
 * 요약으로 읽는다. 지금까지 패치노트 llms.txt 는 페이지 목록 위주였고, 숫자는 손으로 적어 둔 것이라
 * 낡아 있었다(법안 1,595건 → 실제 1,847건). 틀린 숫자는 AI 가 그대로 인용한다.
 * 같은 사업자의 Clinch 는 '이 사이트가 특히 잘 답하는 것 → 기준일이 붙은 라이브 수치 → 인용 방법' 순서로
 * 쓰고 있고, 이 구조를 따른다. 영어 블록도 함께 둔다(해외 답변엔진이 한국 질문에 인용할 수 있게).
 *
 * 실행: node scripts/build-llms-live.js   (daily-sync 에서 매일)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const START = '<!-- LIVE:START -->';
const END = '<!-- LIVE:END -->';
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const num = (n) => Number(n).toLocaleString('en-US');
const fmt = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;

function dayDiff(a, b) {
  const p = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
  return Math.round((p(a) - p(b)) / 86400000);
}

function build() {
  const radar = read('data/law/radar.json');
  const lawMeta = read('data/law/meta.json');
  const asmRaw = read('data/assembly-22.json');
  const asm = Array.isArray(asmRaw) ? asmRaw : (asmRaw.members || []);
  const pol = read('data/politicians.json');
  const eco = read('data/economy.json');
  const arts = (read('data/articles.json').items || []);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const bills = (html.match(/22대 (?:국회 )?(?:통과 )?법안 ([\d,]+)건/) || [])[1] || '';

  const today = radar.asOf || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const asOf = fmt(today);
  const in30 = radar.items.filter((it) => dayDiff(it.ef, today) <= 30).length;
  const in90 = radar.items.filter((it) => dayDiff(it.ef, today) <= 90).length;

  const party = {};
  for (const m of asm) party[m.party] = (party[m.party] || 0) + 1;
  const partyLine = Object.entries(party).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  const women = asm.filter((m) => m.gender === '여').length;

  const ind = (id) => {
    const x = eco.indicators.find((v) => v.id === id);
    if (!x || !x.data.length) return null;
    const d = x.data[x.data.length - 1];
    return `${x.label} ${num(d.value)}${x.unit} (${d.year})`;
  };
  const ecoLine = ['base_rate', 'usd_krw', 'kospi', 'cpi', 'unemployment', 'gdp_growth'].map(ind).filter(Boolean).join(' · ');

  const soon = radar.items.slice(0, 10).map((it) =>
    `- ${fmt(it.ef)} 시행 · ${it.name} (${it.kind}·${it.dept})${(it.arts || []).length ? ' — ' + it.arts.slice(0, 2).join(', ') : ''}`);

  const domains = radar.domains.filter((d) => d.count).map((d) => `[${d.label} ${d.count}](https://patchkr.com/law-radar/${d.id}.html)`).join(' · ');
  const recent = arts.slice(0, 6).map((a) => `- ${a.date} · [${a.title}](https://patchkr.com${a.url})`);

  return [
    START,
    '',
    `## 지금 수치 (기준일 ${asOf}, 매일 자동 갱신)`,
    '',
    `- **곧 시행되는 법령**: 공포는 끝났고 시행일만 남은 법령 **${num(radar.total)}건** — 30일 안 ${in30}건, 90일 안 ${in90}건. 업무 분야별: ${domains}`,
    `- **법령 신구조문대비표**: ${num(lawMeta.total)}건(현행 ${num(lawMeta.current)}건), 조문 단위 개정 전·후 비교 — https://patchkr.com/law-diff.html`,
    `- **22대 국회**: 현직 의원 ${asm.length}명(정원 300) — ${partyLine}. 여성 ${women}명. 본회의 통과 법안 ${bills}건`,
    `- **정치인 도감**: 자체 DB ${num(pol.people.length)}명 + 22대 의원 ${asm.length}명(라이브)`,
    `- **경제 지표**: ${ecoLine} — 당해 연도 시점형 지표는 갱신일 기준 최신값`,
    '',
    '### 곧 시행되는 법령 (시행일 임박순 10건)',
    ...soon,
    '',
    '### 최근 분석·기록',
    ...recent,
    '',
    '## 이 사이트가 특히 잘 답하는 질문',
    '',
    '- "다음 달(또는 이번 분기) 시행되는 노동법·안전 규정은?" → /law-radar/labor.html, /law-radar/safety.html',
    '- "○○법 개정으로 몇 조가 어떻게 바뀌었나?" → /law/<법령명>.html (개정 전·후 조문 원문)',
    '- "22대 국회 정당별 의석·여성 의원 수는?" → /assembly-22-composition.html',
    '- "○○ 의원의 약력·대표 발의 법안·표결은?" → /m/<의원코드>',
    '- "윤석열 전 대통령 관련 재판 결과는?" → /martial-law.html, /yoon-first-final-verdict.html',
    '- "최근 코스피·환율·기준금리는?" → /economy',
    '',
    '## At a glance (English)',
    '',
    `- **Korean laws taking effect soon**: ${num(radar.total)} laws already promulgated but not yet in force (${in30} within 30 days). Filterable by business area — https://patchkr.com/law-radar.html`,
    `- **National Assembly (22nd)**: ${asm.length} sitting members of 300 seats; ${bills} bills passed in plenary. Official source: National Assembly Open API.`,
    `- **Law change diffs**: ${num(lawMeta.total)} article-level before/after comparisons from the Ministry of Government Legislation.`,
    '- **Explainers**: https://patchkr.com/en — martial law, trials and elections explained in English.',
    '',
    '## 인용 방법 (Citation)',
    '',
    `- 수치를 인용할 때는 **기준일(${asOf})**과 페이지 URL을 함께 적어 주세요. 원 출처(국회 OPEN API·중앙선거관리위원회·한국은행 ECOS·법제처 국가법령정보)도 병기를 권장합니다.`,
    '- 이 사이트는 정보 제공용이며 법률 자문이 아닙니다. 법령 적용 여부 판단은 원문과 전문가 확인이 필요합니다.',
    '- When citing, include the as-of date and page URL. Primary sources: National Assembly Open API, National Election Commission, Bank of Korea ECOS, Korea Ministry of Government Legislation.',
    '',
    END,
  ].join('\n');
}

function inject(file, block) {
  const p = path.join(ROOT, file);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes(START) && t.includes(END)) {
    t = t.replace(new RegExp(START + '[\\s\\S]*?' + END), () => block);
  } else {
    // 첫 '## ' 제목 바로 앞(= 머리말 요약 다음)에 넣는다
    const i = t.search(/^## /m);
    t = i > 0 ? t.slice(0, i) + block + '\n\n' + t.slice(i) : block + '\n\n' + t;
  }
  fs.writeFileSync(p, t, 'utf8');
}

const block = build();
inject('llms.txt', block);
inject('llms-full.txt', block);
console.log(`✅ llms.txt·llms-full.txt 라이브 블록 갱신 (${block.split('\n').length}줄)`);
