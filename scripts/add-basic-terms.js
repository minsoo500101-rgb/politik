// 정치 용어 사전 기초 보충 — 여·야·정당·국회·대통령 등 기본 30+개
const fs = require('fs');
const path = require('path');

const NEW_TERMS = [
  // ===== 기본 정치 =====
  { term: '정치', category: 'assembly', def: '국가나 지역사회를 운영하기 위해 사람들 간의 갈등·이해관계를 조정하고 결정하는 활동. 입법·행정·사법 모두 포함하는 가장 넓은 개념.', related: ['민주주의', '정당', '선거'] },
  { term: '민주주의', category: 'assembly', def: '주권이 국민에게 있고, 국민이 선거를 통해 대표를 뽑아 통치하는 정치 체제. 다수결·법치·기본권 보장이 핵심.', related: ['선거', '국민', '헌법'] },
  { term: '공화국', category: 'assembly', def: '세습 군주가 아닌 국민이 선출한 대표(대통령 등)가 국가를 운영하는 체제. 대한민국은 민주공화국.', related: ['대통령', '민주주의', '헌법'] },
  { term: '헌법', category: 'judicial', def: '국가의 최상위 법. 국민의 기본권·정부 구조·통치 원칙을 정함. 1948년 제정, 9차례 개정 (현행 1987년 9차 개헌).', related: ['헌법재판소', '권력분립', '국민'] },
  { term: '국민', category: 'assembly', def: '한 국가의 구성원으로서 주권을 가진 사람. 대한민국 국민은 약 5,100만 명 (2026).', related: ['민주주의', '선거', '주민'] },
  { term: '주민', category: 'local', def: '특정 지방자치단체에 거주하는 사람. 지방선거에서 단체장·의원을 선출하고 주민투표·주민소환 권한을 가짐.', related: ['주민투표', '주민소환', '지방자치'] },

  // ===== 정당·정파 =====
  { term: '정당', category: 'party', def: '비슷한 정치 이념을 가진 사람들이 정권 획득을 목표로 만든 조직. 대한민국에는 더불어민주당·국민의힘 등 주요 정당과 군소정당 다수.', related: ['여당', '야당', '교섭단체'] },
  { term: '여당', category: 'party', def: '대통령(또는 행정부)을 배출한 집권 정당. "여(與)"는 함께한다는 뜻으로 정부와 손잡은 당.', related: ['야당', '여야', '집권당'] },
  { term: '야당', category: 'party', def: '집권하지 않은 정당. "야(野)"는 들판이라는 뜻으로 야인(在野). 정부를 견제·비판하는 역할.', related: ['여당', '여야', '제1야당'] },
  { term: '여야', category: 'party', def: '여당과 야당을 함께 부르는 말. "여야 합의로 통과", "여야 협상" 등 정치 협상 상황에서 자주 사용.', related: ['여당', '야당', '교섭단체'] },
  { term: '집권당', category: 'party', def: '여당과 같은 뜻. 정권을 잡고 있는 정당. 현재 집권당은 대통령이 소속된 당.', related: ['여당', '제1당'] },
  { term: '제1당', category: 'party', def: '국회에서 가장 많은 의석을 가진 정당. 22대 국회 제1당은 더불어민주당 (170석+).', related: ['교섭단체', '원내대표'] },
  { term: '제1야당', category: 'party', def: '야당 중 가장 의석이 많은 정당. 정부 견제의 핵심 역할.', related: ['야당', '교섭단체'] },
  { term: '진보', category: 'party', def: '사회 변화·개혁·평등을 강조하는 정치 성향. 한국에서는 일반적으로 더불어민주당·진보당 계열을 가리킴.', related: ['보수', '중도', '좌파'] },
  { term: '보수', category: 'party', def: '전통·시장경제·안보를 강조하는 정치 성향. 한국에서는 일반적으로 국민의힘 계열을 가리킴.', related: ['진보', '중도', '우파'] },
  { term: '중도', category: 'party', def: '진보와 보수의 중간 입장. 사안별 유연하게 판단. 개혁신당·새로운미래 등이 표방.', related: ['진보', '보수'] },
  { term: '좌파', category: 'party', def: '평등·복지·노동권 강조. 진보보다 더 강한 변화 추구 성향을 함의. 프랑스 혁명 당시 의회 좌측 좌석에서 유래.', related: ['진보', '우파'] },
  { term: '우파', category: 'party', def: '시장경제·전통·국가안보 강조. 보수보다 더 강한 유지 성향을 함의.', related: ['보수', '좌파'] },

  // ===== 국가 기구 =====
  { term: '국가', category: 'executive', def: '일정한 영토에서 주권을 행사하는 정치 공동체. 대한민국·미국·일본 등.', related: ['정부', '국민', '헌법'] },
  { term: '정부', category: 'executive', def: '국가를 운영하는 행정 조직. 대통령·국무총리·17부처·외청·헌법기관 포함. "행정부"라고도 함.', related: ['대통령', '국무총리', '장관'] },
  { term: '국회', category: 'assembly', def: '법을 만들고 정부를 감시하는 입법기관. 국회의원 300명으로 구성. 22대 국회 (2024-2028).', related: ['국회의원', '본회의', '상임위원회'] },
  { term: '국회의원', category: 'assembly', def: '국회에서 활동하는 선출직 정치인. 4년 임기. 지역구 254명 + 비례대표 46명 = 총 300명.', related: ['지역구', '비례대표', '국회'] },
  { term: '대통령', category: 'executive', def: '대한민국 행정부 수반이자 국가원수. 5년 단임제. 직접 선거로 선출. 현 대통령은 21대 이재명 (2025-).', related: ['대통령비서실장', '정부', '국무총리'] },
  { term: '선거관리위원회', category: 'election', def: '선거와 국민투표를 관리하는 헌법기관. 약칭 "선관위" 또는 "중앙선관위". 17개 시·도 선관위가 지역 선거를 담당.', related: ['선거', '전국동시지방선거'] },

  // ===== 선거·투표 기초 =====
  { term: '선거', category: 'election', def: '국민이 투표로 대표(대통령·국회의원·단체장 등)를 뽑는 과정. 대한민국 주요 선거: 대선·총선·지방선거·재보궐.', related: ['투표', '후보', '선거관리위원회'] },
  { term: '투표', category: 'vote', def: '선거나 정책 결정에서 자신의 의사를 표시하는 행위. 만 18세 이상 국민이 가능.', related: ['선거', '사전투표', '본투표'] },
  { term: '공약', category: 'election', def: '후보자가 당선되면 실천하겠다고 국민에게 약속한 정책. 중앙선관위에 5대 공약을 등록함.', related: ['5대 공약', '후보', '선거'] },
  { term: '후보', category: 'election', def: '선거에 출마한 사람. "후보자"라고도 함. 정당 추천 또는 무소속 출마 가능.', related: ['공천', '출마', '공약'] },
  { term: '출마', category: 'election', def: '선거에 후보로 나서는 것. 등록 마감일까지 선관위에 후보 등록을 해야 함.', related: ['후보', '공천', '낙선'] },
  { term: '당선', category: 'election', def: '선거에서 1위(또는 정해진 정원 안)로 뽑힘. 대통령은 다수 득표자, 국회의원 지역구는 1위.', related: ['낙선', '재선', '선거'] },
  { term: '낙선', category: 'election', def: '선거에서 떨어짐. 다음 선거에 재도전 가능.', related: ['당선', '재보궐선거'] },
  { term: '사전투표', category: 'vote', def: '선거 당일 투표가 어려운 유권자를 위한 사전 투표 제도. 본투표 5·6일 전 이틀간 진행. 어디서나 신분증으로 가능.', related: ['투표', '본투표'] },
  { term: '본투표', category: 'vote', def: '선거 당일(보통 오전 6시~오후 6시) 자신의 지정 투표소에서 하는 정식 투표.', related: ['사전투표', '투표'] },
  { term: '출구조사', category: 'election', def: '투표소를 나오는 유권자에게 누구를 뽑았는지 묻는 조사. 방송사가 개표 시작 전 결과 예측에 사용.', related: ['투표', '당선'] },

  // ===== 의원 활동 기초 =====
  { term: '초선', category: 'assembly', def: '처음 당선된 국회의원·단체장. "초선 의원" 등으로 표현.', related: ['재선', '다선'] },
  { term: '재선', category: 'assembly', def: '두 번째로 당선된 국회의원·단체장. 의정 경험이 어느 정도 쌓인 단계.', related: ['초선', '3선', '다선'] },
  { term: '다선', category: 'assembly', def: '여러 차례 당선된 국회의원. 보통 3선 이상부터 다선이라 부름. 정치 경륜·영향력 지표.', related: ['초선', '재선'] },
  { term: '현직', category: 'assembly', def: '현재 직책을 맡고 있는 정치인. "현직 의원", "현직 단체장" 등. 재선 도전 시 유리한 위치.', related: ['초선', '재보궐선거'] },

  // ===== 지방자치 기초 =====
  { term: '지방자치', category: 'local', def: '중앙정부가 아닌 각 지역(시·도·시·군·구)이 자기 일을 스스로 결정·집행하는 제도. 1991년 부활.', related: ['단체장', '지방의원', '주민'] },
  { term: '단체장', category: 'local', def: '지방자치단체의 장. 광역단체장(시·도지사 17명) + 기초단체장(시장·군수·구청장 226명) = 총 243명.', related: ['광역단체장', '기초단체장'] },
  { term: '지방의원', category: 'local', def: '광역의회(시·도의회)와 기초의회(시·군·구의회) 소속 선출직. 단체장을 견제·예산 심의.', related: ['광역단체장', '기초단체장'] },
];

const filePath = path.join(__dirname, '..', 'data', 'glossary.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 중복 체크 (term 이름 기준)
const existing = new Set(data.terms.map(t => t.term));
let added = 0;
let skipped = 0;
for (const t of NEW_TERMS) {
  if (existing.has(t.term)) {
    skipped++;
    continue;
  }
  data.terms.push(t);
  added++;
}

// 가나다순 정렬
data.terms.sort((a, b) => (a.term || '').localeCompare(b.term || '', 'ko'));

// 버전/날짜 갱신
if (data.version != null) data.version += 1;
data.updatedAt = new Date().toISOString().slice(0, 10);

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');

console.log(`✅ ${added}개 용어 추가, ${skipped}개 중복 스킵`);
console.log(`📦 총 용어 ${data.terms.length}개`);
const byCat = {};
for (const t of data.terms) byCat[t.category] = (byCat[t.category] || 0) + 1;
console.log('카테고리별:');
for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + c + ': ' + n);
}
