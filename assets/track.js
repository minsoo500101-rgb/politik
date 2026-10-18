/* patchkr 기사 조회·'이어서 볼 것' 클릭 기록 (UI 개편 5단계 측정용).
 * 봇·자동화 브라우저 제외, 화면이 보일 때만, 같은 탭 30분 1회. 개인정보 없음(익명 ID만, 홈과 같은 키).
 * 키는 공개 anon 키 — page_views 는 INSERT 전용 정책(page_type 제한)이라 읽기·수정은 막혀 있다. */
(function () {
  try {
    var ua = navigator.userAgent || '';
    if (navigator.webdriver || /bot|crawl|spider|slurp|Yeti|Daum|externalagent|Headless|Lighthouse|PageSpeed|InspectionTool|bingpreview|facebookexternalhit|Bytespider|GPTBot|ClaudeBot|PerplexityBot|Applebot/i.test(ua)) return;
    var U = 'https://oaivxaniwvxclzigiswr.supabase.co/rest/v1/page_views';
    var K = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9haXZ4YW5pd3Z4Y2x6aWdpc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NzY1NjYsImV4cCI6MjA5NTQ1MjU2Nn0.CEgk464VOiU7WG4AjhHeWDkSTk0A39_MBAWWZfIbw1U';
    var uid = function () {
      try {
        var k = 'patchkr:anonUid', v = localStorage.getItem(k);
        if (!v) { v = (crypto.randomUUID && crypto.randomUUID()) || ('u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)); localStorage.setItem(k, v); }
        return v;
      } catch (e) { return null; }
    };
    var slug = location.pathname.replace(/^\//, '').replace(/\.html$/, '').slice(0, 100) || 'index';
    var send = function (t, id) {
      fetch(U, { method: 'POST', keepalive: true, headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([{ page_type: t, page_id: String(id).slice(0, 100), user_id: uid() }]) }).catch(function () {});
    };
    var view = function () {
      var k = 'pv:a:' + slug;
      try { var l = +sessionStorage.getItem(k) || 0; if (Date.now() - l < 1800000) return; sessionStorage.setItem(k, String(Date.now())); } catch (e) {}
      send('article', slug);
    };
    if (document.visibilityState === 'visible') view();
    else document.addEventListener('visibilitychange', function f() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); view(); } });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.rel a, .nx a');
      if (!a) return;
      var to = (a.getAttribute('href') || '').replace(/^\//, '').replace(/\.html$/, '');
      send('article_next', (slug.slice(0, 48) + '>' + to).slice(0, 100));
    });
  } catch (e) {}
})();
