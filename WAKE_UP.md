# 🌅 일어나서 첫 번째로 볼 곳

> **사이트 자동 감시 켜놨음. 깨면 여기 순서대로 보면 끝.**

---

## ✅ 자동 점검 스냅샷 (2026-05-29 05:00 KST)

- **health check 14/14 통과** — Critical 0건. (이전 `/early-voting` 오탐 fix 완료: SPA라 모든 경로가 동일 index.html → 공통 마커로만 "정상 로드" 검증)
- **GitHub Issue 0건** — 빨간 알림 없음.
- **사전투표율 파이프라인 정상** — 단, NEC가 실시간 API/HTML을 안 줘서 **자동 fetch는 작동 안 함 (설계상 수동 갱신 전용)**. 06:00 투표 시작, 첫 발표 ~09:00. 발표 숫자 보고 아래 **4번** 명령어로 갱신 → push 하면 사이트에 반영됨. 그 전까진 `rate:null` + 8회(20.62%) 참고치 노출이 정상.
- **너 확인용 2건**: ① 라이트모드 pulse 흰글씨 (코드는 전부 검정 `var(--text)`, SW 캐시 bump 했으니 **강력 새로고침** 후 확인) ② 강릉 — 현재 강원 데이터는 2022 공식치와 일치, **구체적으로 뭐가 문제인지** 알려주면 수정.

---

## 1. 최근 health check 결과 (1분)

```bash
node -e "const log=require('./data/health-log.json'); const l=log[0]; console.log('마지막 체크:', l?.timestamp_kst || '아직 없음'); console.log('통과:', l?.pass_count+'/'+l?.total_count); console.log('버전:', l?.site_version); console.log('Critical 실패:', l?.critical_fail?.length || 0, '건'); if(l?.critical_fail?.length) console.log(JSON.stringify(l.critical_fail, null, 2));"
```

또는 그냥 `data/health-log.json` 열어서 첫 항목 보기.

---

## 2. GitHub Issue 확인 (Critical 실패 자동 알림)

https://github.com/minsoo500101-rgb/politik/issues?q=label:health-check

빨간 issue 있으면 그것부터.

---

## 3. 사전투표 fetch 작동 여부

```bash
curl -s https://patchkr.com/api/early-vote-rate | head -200
```

`rate` 값 나오면 ✅, `null`이면 NEC fetch 실패 → 수동 갱신 필요.

---

## 4. 수동 갱신 (필요 시)

NEC 공식 사이트(info.nec.go.kr)에서 사전투표율 확인 후:

```bash
node scripts/update-vote-rate.js --rate=4.50 --phase=1일차 --announced="2026-05-29T11:00:00+09:00"
git commit -am "data: 사전투표율 11시 갱신 4.50%"
git push
```

NEC 보통 발표 시각: **09 · 11 · 13 · 15 · 17 시** (5회/일)

---

## 5. 평온하면 (90% 시나리오)

- 위 1번 통과율 90%+
- Critical 실패 0건
- 사전투표 fetch 작동

→ **할 일 없음.** 인스타 카드 1번 올리고 일상으로.

---

## 자동 시스템 요약 (자는 동안 작동한 것)

| 시간 | 시스템 | 동작 |
|---|---|---|
| 매 시간 정시 | health-check.yml | 사이트 + API 16개 점검 → log 누적 |
| 매일 09:00 KST | daily-sync.yml | 위키 career + llms 자동 갱신 |
| Critical 실패 시 | health-check.yml | GitHub Issue 자동 생성 |
| 5/29 06:00 | 사이트 자동분기 | 홈 hero → "사전투표 진행 중" 모드 |

전부 자동. 사용자 개입 없어도 굴러감.
