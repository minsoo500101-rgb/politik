/* PATCH//EYE 기사 계기 (UI 개편 3단계) — apply-hud.js 가 정적 페이지 전부에 defer 로 넣는다.
   ① 읽기 진행선(맨 위 청록 선) ② 소제목 목차 레일(넓은 화면은 오른쪽 고정, 폰은 '목차' 버튼 → 아래 시트, 지금 읽는 곳 강조)
   ③ 핵심 숫자(.kpi .n)가 화면에 들어오면 0에서 세어 올라감. 앱(index.html)과 관제 화면은 건드리지 않는다. */
(function () {
  if (document.getElementById('view') || document.querySelector('.shell .holo')) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('.wrap') || document.body;
  var h2s = [].slice.call(root.querySelectorAll('h2')).filter(function (h) { return !h.closest('.rel, footer, nav, .hax') && h.textContent.trim(); });

  // ① 진행선
  var bar = document.createElement('div'); bar.className = 'hud-prog'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  function prog() { var d = document.documentElement, m = d.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (m > 0 ? Math.min(1, scrollY / m) : 0) + ')'; }
  addEventListener('scroll', prog, { passive: true }); addEventListener('resize', prog); prog();

  // ② 목차 레일 — 소제목 3개 이상일 때만
  if (h2s.length >= 3) {
    h2s.forEach(function (h, i) { if (!h.id) h.id = 's' + (i + 1); });
    var nav = document.createElement('nav'); nav.className = 'hud-rail'; nav.setAttribute('aria-label', '이 글의 목차');
    nav.innerHTML = '<div class="hr-h">TRACE · 목차 <button type="button" class="hr-x" aria-label="목차 닫기">×</button></div><ol>' + h2s.map(function (h, i) {
      return '<li><a href="#' + h.id + '"><span>' + String(i + 1).padStart(2, '0') + '</span>' + h.textContent.trim().replace(/[<>&]/g, '') + '</a></li>';
    }).join('') + '</ol>';
    document.body.appendChild(nav);
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'hud-toc'; btn.textContent = '목차 ' + h2s.length; btn.setAttribute('aria-expanded', 'false');
    document.body.appendChild(btn);
    var open = function (v) { nav.classList.toggle('open', v); btn.setAttribute('aria-expanded', String(v)); };
    btn.addEventListener('click', function () { open(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('.hr-x') || e.target.closest('a')) open(false); });
    var links = nav.querySelectorAll('a');
    var cur = -1, tk = 0;
    var spy = function () { var k = -1; for (var i = 0; i < h2s.length; i++) if (h2s[i].getBoundingClientRect().top < innerHeight * 0.3) k = i; if (k !== cur) { cur = k; for (var j = 0; j < links.length; j++) links[j].classList.toggle('on', j === k); } };
    addEventListener('scroll', function () { clearTimeout(tk); tk = setTimeout(spy, 60); }, { passive: true }); spy();
    // 목차가 본문을 가리지 않을 만큼 넓은 화면에서만 레일 상시 표시
    var fit = function () { document.documentElement.classList.toggle('hud-wide', innerWidth >= (root.getBoundingClientRect().width + 520)); };
    addEventListener('resize', fit); fit();
  }

  // ③ 핵심 숫자 카운트업 — 숫자 하나로 된 칸만(날짜·범위·문장은 그대로)
  if (!reduce && 'IntersectionObserver' in window) {
    var ns = [].slice.call(document.querySelectorAll('.kpi .n')).filter(function (el) { return el.children.length === 0 && /^[^\d]{0,3}[\d,]+(\.\d+)?[^\d]{0,6}$/.test(el.textContent.trim()); });
    var run = function (el) {
      var t = el.textContent.trim(), m = t.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/); if (!m) return;
      var raw = m[2], v = parseFloat(raw.replace(/,/g, '')), dp = (raw.split('.')[1] || '').length, comma = raw.indexOf(',') >= 0, t0 = null;
      var fmt = function (x) { var s = x.toFixed(dp); if (comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); } return m[1] + s + m[3]; };
      var step = function (ts) { if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(v * e); if (k < 1) requestAnimationFrame(step); else el.textContent = t; };
      requestAnimationFrame(step);
    };
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io2.unobserve(e.target); run(e.target); } }); }, { threshold: 0.6 });
    ns.forEach(function (el) { io2.observe(el); });
  }
})();
