# 📊 data.go.kr 공공데이터 활용 가이드

본 사이트에서 활용 가능한 **공공데이터포털 (data.go.kr)** API 목록과 신청 방법.

---

## 🟢 통합된 API (Worker 프록시로 즉시 사용)

| API | 데이터셋 ID | 활용 위치 | sgTypecode |
|---|---|---|---|
| 후보자 정보 | [15000908](https://www.data.go.kr/data/15000908/openapi.do) | `/election2026` 후보자 카드 | 1~11 |
| 선거공약 정보 | [15040587](https://www.data.go.kr/data/15040587/openapi.do) | 후보 detail | 1,3,4,11 |
| 당선인 정보 | [15000864](https://www.data.go.kr/data/15000864/openapi.do) | `/elections` 역대 보강 | 1~11 |
| 코드 정보 | [15000897](https://www.data.go.kr/data/15000897/openapi.do) | 메타 (sgId 매핑) | — |
| 후보자 통합검색 | [15140045](https://www.data.go.kr/data/15140045/openapi.do) | 인물 검색 | — |

---

## 🟡 추가 활용 가능 (Worker에 endpoint 추가 필요)

| API | 데이터셋 ID | 활용 가능성 |
|---|---|---|
| 공직자 재산 공개 | [15109164](https://www.data.go.kr/data/15109164/openapi.do) | 의원·단체장 재산 |
| 국회의원 정보 통합 | [15126133](https://www.data.go.kr/data/15126133/openapi.do) | 현재 open.assembly와 중복 |
| 개표소 정보 | [15040584](https://www.data.go.kr/data/15040584/openapi.do) | 투표소 찾기 |
| 국가법령 본문 | (다수) | 통과 법안 원문 |

---

## 5분 신청 가이드

### 1. data.go.kr 가입
1. https://www.data.go.kr → 우상단 **회원가입**
2. 이메일 인증 (네이버/카카오 SNS 로그인도 가능)

### 2. API 활용신청 (각 API마다)
1. 위 표의 데이터셋 ID 링크 클릭
2. 우상단 **활용신청** 버튼
3. 활용 목적 입력 (예시):
   ```
   활용 목적: 오픈소스 정치 데이터 시각화 사이트 운영
   사이트: https://politik-phi.vercel.app/
   GitHub: https://github.com/minsoo500101-rgb/politik
   ```
4. 시스템 유형: **REST**
5. 일일 트래픽: **10,000** (기본 개발계정)
6. 약관 동의 → 신청

### 3. 자동 승인 (즉시)
- **선거 관련 API는 모두 "자동 승인"** — 신청 후 30초~1분 내 발급
- 마이페이지 → **개발계정 신청 현황** → 상세보기
- **일반 인증키 (Decoding)** 복사 (URL 인코딩 안 된 버전)

### 4. Worker secret 등록
```bash
cd worker
wrangler secret put DATA_GO_KR_KEY
# 프롬프트에서 발급받은 Decoding 키 붙여넣기
wrangler deploy
```

### 5. 사이트에 연결
1. `/election2026` 페이지 접속
2. **"⚙ 프록시 URL 입력"** 클릭
3. `https://nec-proxy.{your-subdomain}.workers.dev` 입력
4. 자동으로 17개 광역단체장 후보자 명단 fetch + 카드 표시

---

## 🔑 trace: API 응답 정규화

NEC API는 응답을 다음 구조로 반환:
```
response
  ├ header (resultCode, resultMsg)
  └ body
    ├ items
    │   └ item: [후보1, 후보2, ...]
    ├ numOfRows
    ├ pageNo
    └ totalCount
```

Worker가 XML→JSON 변환 + 정규화 처리 후 단일 구조로 클라이언트에 전달.

---

## ❓ 자주 문제

### "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
→ 신청 후 30분 정도 대기 필요 (서버 동기화). 키 복사 시 공백/줄바꿈 포함 안 했는지 확인.

### "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"
→ 1일 10,000 한도 초과. 운영계정 신청 (활용사례 등록 후) → 무제한.

### CORS error (직접 호출)
→ NEC API는 CORS Allow-Origin 없음. **반드시 Worker 프록시 경유**.

### 한자 이름이 깨짐
→ 응답 인코딩이 EUC-KR인 경우 있음. Worker에서 자동 UTF-8 변환됨.

---

## 활용 예시 (브라우저 console)

```javascript
// 9회 지선 광역단체장 후보자
const proxy = localStorage.getItem('politik:necProxyUrl');
fetch(`${proxy}/candidates?sgId=20260603&sgTypecode=3`)
  .then(r => r.json())
  .then(d => console.table(d.response.body.items.item));

// 특정 후보 공약
fetch(`${proxy}/policies?sgId=20260603&sgTypecode=3&cnddtId=CANDIDATE_ID`)
  .then(r => r.json());

// 8회 지선 (2022) 당선인
fetch(`${proxy}/winners?sgId=20220601&sgTypecode=3`)
  .then(r => r.json());

// 이름으로 검색
fetch(`${proxy}/search?name=이재명`)
  .then(r => r.json());
```
