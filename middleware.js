// 홈(/)을 관제 화면(eye.html)으로 — Vercel Routing Middleware(플랫폼 기능, 프레임워크 없음).
//
// 왜 미들웨어인가: '/'는 정적 파일 index.html(홈 앱·SPA)이 먼저 잡는다. vercel.json 의 rewrites 는 정적 파일보다
// 뒤에 적용돼 '/'를 바꿀 수 없다. index.html 은 /bills·/dex 등 모든 앱 경로가 쓰고 스크립트 20여 개가 참조하므로
// 이름을 바꾸는 대신 '/' 한 경로만 캐시 앞에서 eye.html 로 돌린다. 기존 대시보드는 /home (같은 index.html).
// matcher 가 '/' 하나라 다른 경로에서는 실행되지 않는다(비용 없음).
export const config = { matcher: ['/'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/') return;            // 그대로 진행
  url.pathname = '/eye.html';                  // 쿼리(?utm=…)는 유지
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
