# 📋 대한민국 패치 노트 (Korea Patch Notes)

[**🔗 라이브 사이트 →**](https://patchkr.com/)
미러: [GH Pages](https://minsoo500101-rgb.github.io/politik/)

> **한국의 모든 것 한 곳에** — 정치·법안·선거·인물·역사를 데이터로.
> 한국 종합 정치 데이터 플랫폼.

## 🎯 5대 데이터 영역

| 영역 | 데이터 | 페이지 |
|---|---|---|
| 🏛 **정치** | 대통령·총리·17부처 장관/차관·외청장·헌법기관 27명 + 대통령실 4명 | `/` `/group/executive` |
| 📜 **법안** | 22대 국회 본회의 통과 1,595건 (발의자·정당·15분야·통과 속도) | `/bills` |
| 🗳 **선거** | 9회 지방선거 후보자 **697명 실시간** (5대 공약 포함) + 역대 7·8회 비교 | `/election2026` `/elections` |
| 👥 **인물** | 744명 종합 (22대 의원·단체장·사법부·검찰·역대 인물) | `/` |
| 📚 **역사** | 1948~현재 정당사 45개, 역대 광역단체장·사법부 수장·정당 대표 | `/history/parties` |

## 🌐 부가 데이터
- **국제 비교** — 12개 민주국가 (의원수·여성비율·투표율·민주주의지수·언론자유·청렴도)
- **정치 분포 지도** — 17 시도 + 250 시군구 정당색 인터랙티브
- **위원회** — 22대 국회 상임위 17 + 특별위 8 = 25개

---

## 🚀 제대로 배포하는 4단계

### 단계 1 — 호스팅 업그레이드 (GH Pages → Vercel/Netlify)

| 옵션 | 무료한도 | SSR/SSG | API 라우트 | CDN 속도 | 추천 |
|---|---|---|---|---|---|
| **GitHub Pages** (현재) | 100GB/월 | ❌ | ❌ | 기본 | 시작용 |
| **Vercel** ⭐ | 100GB/월 | ✅ | ✅ | 매우 빠름 | **추천** |
| **Netlify** | 100GB/월 | ✅ | ✅ | 빠름 | 대안 |
| **Cloudflare Pages** | 무제한 | ✅ | ✅ Worker | 가장 빠름 | 트래픽 큰 경우 |

**Vercel 5분 배포** (코드 0줄 변경):
```bash
# 옵션 A: GitHub 연동 (가장 쉬움)
1. https://vercel.com/new 접속
2. "Import Git Repository" → minsoo500101-rgb/politik 선택
3. "Deploy" 클릭 — vercel.json 자동 인식
4. 1-2분 후 https://politik-{random}.vercel.app 자동 배포 완료

# 옵션 B: CLI
npm install -g vercel
cd D:\politik && vercel
```

**Netlify 5분 배포** (대안):
```bash
# 옵션 A: GitHub 연동
1. https://app.netlify.com/start → GitHub → 저장소 선택
2. "Deploy site" — netlify.toml 자동 인식

# 옵션 B: 드래그앤드롭
1. https://app.netlify.com/drop
2. D:\politik 폴더 통째로 드래그
```

### 단계 2 — 커스텀 도메인 (신뢰도·기억성)

도메인 추천 (1.5만원 ~ 3.5만원/년):
- `patchkr.com` / `koreapatch.com` (.com 1.5만)
- `패치노트.kr` (.kr 한글 도메인 3.5만)
- `정계패치.com` (.com 한글 표시)

구매처: [가비아](https://gabia.com) · [카페24](https://hosting.cafe24.com) · [Namecheap](https://namecheap.com)

DNS 설정 (Vercel 예시):
```
# A 레코드
@   76.76.21.21

# CNAME 레코드
www patchkr.com
```

배포 플랫폼에서 도메인 추가:
- **Vercel**: Project Settings → Domains → Add → `patchkr.com`
- **Netlify**: Site Settings → Domain management → Add custom domain
- **GH Pages**: 저장소 Settings → Pages → Custom domain (이때 `CNAME` 파일 자동 생성)

SSL은 모두 자동 발급 (Let's Encrypt).

### 단계 3 — Cloudflare Worker NEC 프록시 (선거 후보 실시간 데이터)

중앙선관위 CORS 차단으로 못 가져오던 **2026 지방선거 후보·공약** 데이터를 실시간 fetch 가능하게:

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy  # ← 30초
# 결과: https://nec-proxy.{your-subdomain}.workers.dev
```

상세: [`worker/README.md`](./worker/README.md)

### 단계 4 — 국가법령정보 API (법안 본문 자동 표시)

법안 detail 페이지에 **현행 법령 본문**을 표시하려면:

1. https://open.law.go.kr 무료 가입
2. "내 정보" → "API 신청" → **회원ID (OC)** 확인
3. "API 사용 서버 등록" → `patchkr.com` 도메인 추가
4. Vercel 환경변수 설정:
   ```bash
   echo "YOUR_OC" | vercel env add LAW_GO_KR_OC production
   echo "YOUR_OC" | vercel env add LAW_GO_KR_OC preview
   ```
5. git push → 자동 배포 → `/bill/{billId}` 페이지에 법령 조문 자동 표시

미설정 시: 외부 링크만 표시. 사이트는 정상 작동.

### 단계 5 — 분석 도구 (Plausible 권장)

| 도구 | 가격 | 개인정보 | 무게 |
|---|---|---|---|
| **Plausible** ⭐ | $9/월 (or 셀프호스팅 무료) | 100% 익명·쿠키 X | 1KB |
| **Umami** | 셀프호스팅 무료 | 익명 | 2KB |
| **GA4** | 무료 | 추적·동의 필요 | 50KB+ |

Plausible 추가 (1줄):
```html
<!-- index.html <head>에 추가 -->
<script defer data-domain="patchkr.com" src="https://plausible.io/js/script.js"></script>
```

---

---

## 핵심 데이터

| 항목 | 수치 |
|---|---|
| 등록 인물 | **744명** (22대 MP 286 + 정치인 458) |
| 본회의 처리 의안 | 1,595건 |
| 발의자 매핑 | 17,224건 |
| 위원회 | 25개 (상임 17 + 특별 8) |
| 광역·기초 단체장 | 244명 |
| 국제 비교 | 12개 민주국가 |
| 광역단체장 선거 데이터 | 2018·2022 (34 race) |

---

## 네이버 검색 등록 가이드

본 사이트를 네이버에 노출시키려면 **네이버 서치어드바이저**에 등록해야 합니다.

### 1단계: 네이버 서치어드바이저 가입
1. [https://searchadvisor.naver.com](https://searchadvisor.naver.com) 접속
2. 네이버 계정으로 로그인
3. 우상단 "웹마스터 도구" → "사이트 등록"
4. URL 입력: `https://minsoo500101-rgb.github.io/politik/`

### 2단계: 사이트 소유 확인
네이버가 두 가지 방법 중 하나로 소유 확인을 요청합니다:

**방법 A — HTML 메타 태그 (권장)**
1. 발급된 인증 코드 복사 (예: `naver1234abcd...`)
2. `index.html`의 다음 줄을 찾아서:
   ```html
   <meta name="naver-site-verification" content="REPLACE_WITH_NAVER_VERIFICATION_CODE">
   ```
   `content` 값을 발급된 코드로 교체
3. git commit + push
4. GitHub Pages 반영 후 (1-2분) 서치어드바이저에서 "확인"

**방법 B — HTML 파일 업로드**
1. 발급된 파일 (예: `naverabc123.html`) 다운로드
2. 저장소 루트에 업로드
3. git commit + push
4. 서치어드바이저에서 "확인"

### 3단계: 사이트맵 제출
1. 서치어드바이저 사이트 관리 페이지 진입
2. 좌측 메뉴 "요청" → "사이트맵 제출"
3. URL 입력: `sitemap.xml`
4. 확인 클릭

### 4단계: RSS 등록
1. "요청" → "RSS 제출"
2. URL 입력: `feed.xml`
3. 등록

### 5단계: 색인 요청 (선택, 빠른 노출)
1. "요청" → "웹페이지 수집"
2. 주요 URL 입력 (홈, /bills, /election2026 등)
3. 일 50회까지 가능

### 6단계: 검증 (필수)
1. "검증" → "robots.txt" 확인
2. "검증" → "사이트맵" 형식 확인
3. 모두 정상이어야 노출됨

---

## 구글·빙 동시 등록 (권장)

### 구글 서치 콘솔
1. [https://search.google.com/search-console](https://search.google.com/search-console)
2. URL 접두어 추가: `https://minsoo500101-rgb.github.io/politik/`
3. `<meta name="google-site-verification">` 코드 교체 후 push
4. 사이트맵 제출

### 빙 웹마스터 도구
1. [https://www.bing.com/webmasters](https://www.bing.com/webmasters)
2. `<meta name="msvalidate.01">` 코드 교체

---

## 검색 노출 최적화 (이미 적용됨)

- ✅ `sitemap.xml` — 14개 URL 등록
- ✅ `robots.txt` — Naver Yeti·Daumoa·Googlebot 명시 허용
- ✅ `feed.xml` — RSS 2.0 피드
- ✅ JSON-LD 구조화 데이터 (Organization · WebSite · WebPage · Dataset)
- ✅ Open Graph + Twitter Card
- ✅ `<noscript>` 정적 콘텐츠 (검색봇 대응)
- ✅ Canonical URL
- ✅ 한국어 우선 (`<html lang="ko">`, `og:locale=ko_KR`)

### Hash 라우팅 한계
SPA의 `#/bills` 같은 hash 경로는 검색엔진이 별도 페이지로 인덱싱하지 않습니다.
- **인덱싱되는 것**: 메인 URL (`/`) + `<noscript>` 콘텐츠 + JSON-LD
- **개선 옵션**: History API 라우팅으로 변경 (별도 작업 필요)

---

## 기술 스택

- 순수 HTML 단일 파일 (6,000+ 줄), 인라인 CSS/JS
- d3 v7 (지도·관계도·차트)
- Pretendard·Inter 폰트
- 국회 OPEN API + Wikipedia REST + MediaWiki API
- localStorage 캐시 (24h TTL)
- 다크/라이트 모드, 모바일 반응형

## 데이터 출처

- [국회 OPEN API](https://open.assembly.go.kr) (공공누리 1유형)
- [Wikipedia REST API](https://ko.wikipedia.org) (CC BY-SA 4.0)
- [중앙선거관리위원회](https://info.nec.go.kr)
- [IPU Parline](https://data.ipu.org)
- [EIU Democracy Index 2024](https://www.eiu.com/democracy-index)
- [RSF Press Freedom Index](https://rsf.org)
- [Transparency International CPI](https://www.transparency.org)

## 라이선스

MIT License — 자유 사용·수정·배포

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
