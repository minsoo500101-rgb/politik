/* patchkr 공유 바 — 정적 기사 페이지용 (KO/EN 자동). <div id="share-bar"></div> 위치에 주입 */
(function () {
  if (window.__pkShare) return; window.__pkShare = true;
  var url = location.href.split('#')[0];
  var title = (document.title || '')
    .replace(/\s*[|｜]\s*(?:대한민국 패치노트|Korea Patch Notes).*$/, '')
    .replace(/^[\s\p{Extended_Pictographic}\uFE0F\u20E3]+/u, '').trim();
  var en = ('' + (document.documentElement.lang || '')).toLowerCase().indexOf('en') === 0;
  var u = encodeURIComponent(url), t = encodeURIComponent(title), tu = encodeURIComponent(title + ' — ' + url);
  var L = en
    ? { h: '📢 Share this report', copy: '🔗 Copy link', copied: '✓ Link copied!', native: '📱 Share', kakao: 'Link copied — paste into KakaoTalk' }
    : { h: '📢 이 글 공유하기', copy: '🔗 링크 복사', copied: '✓ 복사됨!', native: '📱 공유', kakao: '링크 복사됨 — 카카오톡에 붙여넣기' };

  var B = [];
  if (!en) B.push({ l: '💬 카카오톡', bg: '#FEE500', fg: '#191919', act: 'kakao' });
  B.push({ l: '𝕏 (Twitter)', bg: '#000000', fg: '#fff', href: 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u });
  B.push({ l: 'f  Facebook', bg: '#1877F2', fg: '#fff', href: 'https://www.facebook.com/sharer/sharer.php?u=' + u });
  B.push({ l: '@ Threads', bg: '#101010', fg: '#fff', href: 'https://www.threads.net/intent/post?text=' + tu });
  if (en) {
    B.push({ l: 'Reddit', bg: '#FF4500', fg: '#fff', href: 'https://www.reddit.com/submit?url=' + u + '&title=' + t });
    B.push({ l: 'in LinkedIn', bg: '#0A66C2', fg: '#fff', href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + u });
    B.push({ l: 'Telegram', bg: '#229ED9', fg: '#fff', href: 'https://t.me/share/url?url=' + u + '&text=' + t });
  } else {
    B.push({ l: '밴드', bg: '#03C75A', fg: '#fff', href: 'https://band.us/plugin/share?body=' + tu + '&route=' + u });
    B.push({ l: '텔레그램', bg: '#229ED9', fg: '#fff', href: 'https://t.me/share/url?url=' + u + '&text=' + t });
  }

  var st = document.createElement('style');
  st.textContent =
    '.pk-share{margin:18px 0;padding:14px 16px;border:1px solid var(--bd,#e5e7eb);border-radius:12px;background:var(--card,#fff)}' +
    '.pk-share-h{font-size:13px;font-weight:800;color:var(--tx,#1f2937);margin-bottom:10px}' +
    '.pk-share-row{display:flex;flex-wrap:wrap;gap:8px}' +
    '.pk-sb{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;padding:8px 13px;border-radius:8px;border:none;cursor:pointer;text-decoration:none;line-height:1;transition:transform .1s ease,filter .1s ease}' +
    '.pk-sb:hover{transform:translateY(-1px);filter:brightness(1.07)}' +
    '.pk-sb-copy{background:var(--bg,#f3f4f6);color:var(--tx,#1f2937);border:1px solid var(--bd,#e5e7eb)}' +
    '.pk-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#111;color:#fff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:24px;opacity:0;transition:opacity .2s ease;z-index:99999;pointer-events:none}' +
    '.pk-toast.on{opacity:.96}';
  document.head.appendChild(st);

  function toast(m) {
    var d = document.createElement('div'); d.className = 'pk-toast'; d.textContent = m;
    document.body.appendChild(d); requestAnimationFrame(function () { d.classList.add('on'); });
    setTimeout(function () { d.classList.remove('on'); setTimeout(function () { d.remove(); }, 300); }, 1700);
  }
  function copy(msg) {
    var done = function () { toast(msg || L.copied); };
    if (navigator.clipboard) { navigator.clipboard.writeText(url).then(done, fallback); }
    else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  }

  var host = document.getElementById('share-bar');
  if (!host) { host = document.createElement('div'); var ft = document.querySelector('footer'); (ft && ft.parentNode) ? ft.parentNode.insertBefore(host, ft) : document.body.appendChild(host); }
  var wrap = document.createElement('div'); wrap.className = 'pk-share';
  var hd = document.createElement('div'); hd.className = 'pk-share-h'; hd.textContent = L.h; wrap.appendChild(hd);
  var row = document.createElement('div'); row.className = 'pk-share-row'; wrap.appendChild(row);

  if (navigator.share) {
    var ns = document.createElement('button'); ns.className = 'pk-sb';
    ns.style.background = 'var(--ac,#4F46E5)'; ns.style.color = '#fff'; ns.textContent = L.native;
    ns.onclick = function () { navigator.share({ title: title, url: url }).catch(function () {}); };
    row.appendChild(ns);
  }
  B.forEach(function (b) {
    var el;
    if (b.href) { el = document.createElement('a'); el.href = b.href; el.target = '_blank'; el.rel = 'noopener nofollow'; }
    else { el = document.createElement('button'); el.type = 'button'; }
    el.className = 'pk-sb'; el.style.background = b.bg; el.style.color = b.fg; el.textContent = b.l;
    if (b.act === 'kakao') {
      el.onclick = function (e) {
        e.preventDefault();
        if (/Android|iPhone|iPad/.test(navigator.userAgent)) { location.href = 'kakaolink://send?msg=' + encodeURIComponent(title + ' ' + url); }
        else { copy(L.kakao); }
      };
    }
    row.appendChild(el);
  });
  var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'pk-sb pk-sb-copy'; cp.textContent = L.copy; cp.onclick = function () { copy(); };
  row.appendChild(cp);
  host.appendChild(wrap);
})();
