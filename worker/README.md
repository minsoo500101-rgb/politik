# Cloudflare Worker — NEC API 프록시

## 무엇을 하나?

중앙선거관리위원회 (info.nec.go.kr, policy.nec.go.kr) 및 data.go.kr OpenAPI에 **CORS 우회 프록시**를 제공.
이걸 통해 본 사이트에서 **후보자 명단·공약·재산·전과** 등 실시간 데이터를 fetch할 수 있게 됩니다.

## 무료 한도
- Cloudflare Workers 무료 플랜: **100,000 요청/일**
- 본 사이트 트래픽 기준 충분 (1만명 방문 × 10 fetch = 10만)

## 5분 배포 (wrangler 사용)

```bash
# 1. wrangler 설치
npm install -g wrangler

# 2. Cloudflare 로그인
wrangler login

# 3. (선택) data.go.kr 키 등록
#    https://www.data.go.kr → 회원가입 → "선거관리위원회" 검색 →
#    "후보자 등록정보 조회 서비스" 활용신청 → 키 발급
wrangler secret put DATA_GO_KR_KEY
# 프롬프트에서 발급받은 키 붙여넣기

# 4. 배포
cd worker
wrangler deploy

# 결과: https://nec-proxy.{your-subdomain}.workers.dev
```

## GUI 배포 (wrangler 없이)

1. https://workers.cloudflare.com/ 접속
2. Workers & Pages → Create → Create Worker
3. 이름 입력 (예: `nec-proxy`) → Deploy
4. 우상단 "Edit code" → `nec-proxy.js` 전체 복사·붙여넣기 → Save and Deploy
5. Settings → Variables → "Add variable" → `DATA_GO_KR_KEY` (선택)

## 사이트에서 사용

`index.html` 또는 별도 설정에서:

```javascript
// 1) 후보자 목록 (광역단체장)
fetch('https://nec-proxy.you.workers.dev/candidates?sgId=20260603&sgTypecode=4')
  .then(r => r.json())
  .then(data => console.log(data));

// 2) 정책공약 목록
fetch('https://nec-proxy.you.workers.dev/policies?sgId=20260603')
  .then(r => r.json());

// 3) Raw 프록시 (화이트리스트 도메인만)
const url = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml?...';
fetch('https://nec-proxy.you.workers.dev/raw?url=' + encodeURIComponent(url))
  .then(r => r.text());
```

## 보안

- CORS Origin 화이트리스트 (`ALLOWED_ORIGINS`)
- Raw 프록시는 NEC·data.go.kr 도메인만 허용 (`ALLOWED_HOSTS`)
- API 키는 Worker secret으로만 저장 (코드에 평문 X)
- 캐시 600초 (NEC 부하 최소화)

## 사용량 모니터링

Cloudflare Dashboard → Workers & Pages → nec-proxy → Metrics
- 요청 수
- CPU 시간
- 에러율

## 키 발급 가이드 (data.go.kr)

1. https://www.data.go.kr → 회원가입 (네이버·카카오 로그인 가능)
2. 검색: "선거관리위원회" 또는 "후보자 등록"
3. **"선거관리위원회_후보자 등록정보 조회 서비스2"** 클릭
4. 우측 "활용신청" → 약관 동의 → 사용 목적 입력
5. 30분~1일 후 승인됨 (마이페이지 → 데이터 활용 → 인증키 확인)
6. 발급된 키를 `wrangler secret put DATA_GO_KR_KEY` 로 등록

승인 안 되면 사용 목적을 더 구체적으로 (예: "오픈소스 정치 데이터 시각화 사이트 운영")
