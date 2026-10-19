// 위기 지표 8종 갱신(2026-10-19) — 조사 + 독립 검증 결과(지적 6건 반영)만 적용
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '../../data/risk-indicators.json');
const j = JSON.parse(fs.readFileSync(P, 'utf8'));
const set = (id, patch) => { const i = j.indicators.find((x) => x.id === id); if (!i) throw new Error(id); Object.assign(i, patch); return i; };
const addSeries = (id, pts) => { const i = j.indicators.find((x) => x.id === id); if (!i.series) return; for (const [y, v] of pts) { const k = i.series.findIndex((p) => p[0] === y); if (k >= 0) i.series[k] = [y, v]; else i.series.push([y, v]); } i.series.sort((a, b) => a[0] - b[0]); };

set('tfr', { value: '0.80', asof: '2025 확정', source: '국가데이터처',
  headline: '여성 1명이 평생 낳는 아이 0.80명, 여전히 세계 최저 수준이다',
  context: '인구를 유지하려면 합계출산율이 2.1명이어야 한다. 2025년 확정치는 0.80명으로 그 38% 수준이다. 2023년 0.72명을 바닥으로 2년 연속 올라 2021년(0.81명) 이후 4년 만에 0.8명대를 회복했다. 2024년 기준 OECD 38개국 중 최하위였고, 2위권(스페인·폴란드 1.10명)과도 격차가 크다. 출생아는 25만4,341명으로 6.7% 늘었다.' });
addSeries('tfr', [[2025, 0.8]]);

set('aging', { value: '21.6', asof: '2026', source: '국가데이터처(2026 고령자 통계)',
  headline: '국민 5명 중 1명 넘게 노인이다. 2026년 고령인구 비중 21.6%',
  context: '65세 이상이 전체 인구의 20%를 넘으면 초고령사회로 분류한다. 한국은 장래인구추계 기준으로 2025년 이 선을 처음 넘었고, 2026년에는 21.6%(1,112만 명)로 1년 새 약 1.3%p 더 올랐다. 2036년 30%, 2050년 40%를 넘어설 것으로 전망된다(장래인구추계). 고령자 가구는 전체 가구의 28.8%다.' });
addSeries('aging', [[2026, 21.6]]);

// 가계부채: economy.json(ECOS 903Y049, 2025=97.2)은 BIS 공식 시계열(2025년 말 88.1%)보다 약 9%p 높다 — GDP 기준년 개편 전 값으로 보인다.
// 화면 값과 설명이 어긋나지 않게 이 지표는 live 주입을 끊고 BIS 최신치를 직접 쓴다. economy.json 시계열 정리는 별도 과제.
const hd = set('household_debt', { value: '85.1', asof: '2026년 1분기 (BIS)', source: '국제결제은행(BIS)', source_url: 'https://data.bis.org',
  headline: '가계 빚이 GDP의 85% 수준이다. 비율은 내려가지만 빚 자체는 늘고 있다',
  context: 'BIS 기준 가계부채는 2026년 1분기 말 GDP의 85.1%로, 2018년 1분기 이후 가장 낮다. 정점은 2021년 3분기 99.1%였다. 다만 빚이 줄어서가 아니라 명목 GDP가 더 빨리 늘어난 결과다. 가계부채 잔액은 계속 늘고 있고, 여전히 주요국 중 상위권이다.',
  compare: '정점 99.1%(2021년 3분기)' });
delete hd.live;

set('potential_growth', { value: '1.7', asof: '2026 (OECD 추정)', source: 'OECD·한국은행', source_url: 'https://www.oecd.org/economic-outlook/',
  headline: '성장 엔진이 식고 있다. 잠재성장률 1.7%, 2027년엔 1.5%대로 내려갈 전망이다',
  context: '나라가 무리 없이 낼 수 있는 성장률을 잠재성장률이라 한다. OECD는 한국의 잠재성장률을 2025년 1.85%, 2026년 1.66%로 추정하고, 2027년에는 1.52%로 역대 최저가 될 것으로 본다(2026년 6월 추정). 한국은행도 향후 5년 평균을 1.8% 수준으로 본다. 일할 사람이 줄고 생산성 증가가 둔화한 결과다.',
  compare: '2012년 3.6%대' });

set('national_debt', { value: '49.0', asof: '2025 결산', source: '기획재정부',
  headline: '나랏빚 1,304조 원, GDP의 49.0%다(2025년 결산)',
  context: '2025년 결산 기준 국가채무(D1)는 1,304조5,000억 원으로 1년 새 129조 원 늘었고, GDP 대비 49.0%다. 2026년 본예산 편성 당시(2025년 8월)에는 51.6%로 50%를 넘을 것으로 전망됐다. 새 국가재정운용계획(2026년 9월)은 2027년 48.3%, 2030년 49.0%를 전망한다. 관리재정수지 적자는 2025년 GDP의 3.9%였다.',
  compare: '2017년 36%' });

set('grain', { asof: '2021~23 평균', source: '한국농촌경제연구원·농림축산식품부',
  context: '곡물자급률(사료용 포함)은 2021~2023년 평균 19.5%로 주요국 중 최하위권이다. 쌀은 자급하지만 밀과 옥수수는 사실상 전량 수입한다. 2008년 31%에서 계속 내려왔다. 사료용을 뺀 식량자급률도 2024년 47.9%로 떨어져 2027년 목표치(곡물 27%, 식량 55.5%)와 거리가 멀다.' });

set('energy', { value: '93.7', asof: '2024', source: '에너지경제연구원',
  headline: '에너지의 94%를 수입한다. 수입길이 막히면 멈추는 나라다',
  context: '석유·가스·석탄 등 에너지의 93.7%를 해외에서 들여온다(2024년). 30년 넘게 90%대에 머물러 있다. 원전과 신재생을 늘려도 이 구조는 쉽게 바뀌지 않는다.',
  compare: '30년 넘게 90%대' });

set('credit', { asof: '2026.10', source: 'S&P·무디스·피치',
  headline: '그래도 신용등급은 굳건하다. 위기 지표 속 유일한 파란불이다',
  context: '2026년 정기 평가에서 S&P AA(4월), 무디스 Aa2(2월), 피치 AA-(1월)가 모두 유지됐고, 세 곳 모두 \'안정적\' 전망이다. 평가사들은 반도체 수출 경쟁력과 대외건전성을 강점으로, 고령화와 국가채무 증가를 부담 요인으로 꼽았다.',
  compare: "3대 평가사 모두 '안정적'" });

j.updatedAt = '2026-10-19';
j.version = (j.version || 0) + 1;
fs.writeFileSync(P, JSON.stringify(j, null, 2) + '\n');
console.log('ok version', j.version, j.indicators.map((i) => `${i.id}=${i.value || 'live'}(${i.asof})`).join(' '));
