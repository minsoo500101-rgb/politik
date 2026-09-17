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

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`✅ radar.json — 시행 전 ${items.length}건 (${kb} KB, 기준일 ${today})`);
  console.log(`   분야 태그: ${DOMAINS.map((d) => `${d.label} ${byTag[d.id]}`).join(' · ')}`);
  console.log(`   분야 미분류 ${untagged}건 (${(untagged / items.length * 100).toFixed(0)}%)`);
}

main();
