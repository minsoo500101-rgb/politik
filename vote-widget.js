/* patchkr 찬반 투표 위젯 — 정적 기사 페이지용. social_votes(target_type='topic') 백엔드 공유.
   사용: <div id="vote-widget" data-vote-id="..." data-q="..." data-yes="..." data-no="..." data-label="..."></div> */
(function () {
  if (window.__pkVote) return; window.__pkVote = true;
  var host = document.getElementById('vote-widget'); if (!host) return;
  var SUPA = 'https://oaivxaniwvxclzigiswr.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9haXZ4YW5pd3Z4Y2x6aWdpc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NzY1NjYsImV4cCI6MjA5NTQ1MjU2Nn0.CEgk464VOiU7WG4AjhHeWDkSTk0A39_MBAWWZfIbw1U';
  var en = ('' + (document.documentElement.lang || '')).toLowerCase().indexOf('en') === 0;
  var voteId = host.getAttribute('data-vote-id') || 'poll';
  var q = host.getAttribute('data-q') || (en ? 'What do you think?' : '여러분의 생각은?');
  var yesL = host.getAttribute('data-yes') || (en ? '👍 For' : '👍 찬성');
  var noL = host.getAttribute('data-no') || (en ? '👎 Against' : '👎 반대');
  var label = (host.getAttribute('data-label') || q).slice(0, 200);
  var L = en ? { total: 'votes', mine: 'Your vote', tap: 'tap again to undo', live: '🔴 LIVE · anonymous', loading: 'Loading…' }
             : { total: '표', mine: '내 선택', tap: '다시 누르면 취소', live: '🔴 LIVE · 익명', loading: '불러오는 중…' };
  function uid() { try { var k = 'patchkr:anonUid', v = localStorage.getItem(k); if (!v) { v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('a' + Date.now() + Math.random().toString(16).slice(2)); localStorage.setItem(k, v); } return v; } catch (e) { return 'anon-' + Date.now(); } }
  function rest(path, opts) {
    opts = opts || {}; var h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
    if (opts.headers) for (var k in opts.headers) h[k] = opts.headers[k];
    return fetch(SUPA + '/rest/v1' + path, Object.assign({}, opts, { headers: h })).then(function (r) { if (!r.ok) throw new Error(r.status); return r.status === 204 ? null : r.json(); });
  }

  var st = document.createElement('style'); st.textContent =
    '.pk-vote{margin:20px 0;padding:16px 18px;border:1px solid var(--bd,#e5e7eb);border-radius:12px;background:var(--card,#fff)}' +
    '.pk-vote-q{font-size:15.5px;font-weight:800;color:var(--tx,#1f2937);margin-bottom:3px;line-height:1.4}' +
    '.pk-vote-meta{font-size:11.5px;color:var(--dim,#6b7280);margin-bottom:12px}' +
    '.pk-vote-btns{display:flex;gap:10px;margin-bottom:14px}' +
    '.pk-vb{flex:1;font-size:15px;font-weight:800;padding:13px 8px;border-radius:10px;border:2px solid var(--bd,#e5e7eb);background:var(--bg,#f7f7f8);color:var(--tx,#1f2937);cursor:pointer;transition:transform .1s ease,border-color .1s ease,background .1s ease}' +
    '.pk-vb:hover{transform:translateY(-1px)}' +
    '.pk-vb.support.on{border-color:#4F46E5;background:rgba(79,70,229,.12);color:#4F46E5}' +
    '.pk-vb.oppose.on{border-color:#d97706;background:rgba(217,119,6,.12);color:#d97706}' +
    '.pk-bar{margin:9px 0}' +
    '.pk-bar-top{display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:4px}' +
    '.pk-bar-top .l{color:var(--tx,#1f2937)}.pk-bar-top .r{color:var(--dim,#6b7280);font-variant-numeric:tabular-nums}' +
    '.pk-bar-track{height:12px;border-radius:7px;background:var(--bg,#eef0f3);overflow:hidden}' +
    '.pk-bar-fill{height:100%;border-radius:7px;transition:width .4s ease}' +
    '.pk-bar.support .pk-bar-fill{background:#4F46E5}.pk-bar.oppose .pk-bar-fill{background:#d97706}' +
    '.pk-vote-foot{font-size:12px;color:var(--dim,#6b7280);margin-top:10px}' +
    '.pk-vote-foot b{color:var(--tx,#1f2937)}';
  document.head.appendChild(st);

  var card = document.createElement('div'); card.className = 'pk-vote';
  card.innerHTML = '<div class="pk-vote-q">🗳 ' + q + '</div><div class="pk-vote-meta">' + L.live + '</div>' +
    '<div class="pk-vote-btns"><button class="pk-vb support" data-v="support">' + yesL + '</button><button class="pk-vb oppose" data-v="oppose">' + noL + '</button></div>' +
    '<div class="pk-bar support"><div class="pk-bar-top"><span class="l">' + yesL + '</span><span class="r" data-r="support">—</span></div><div class="pk-bar-track"><div class="pk-bar-fill" data-f="support" style="width:0%"></div></div></div>' +
    '<div class="pk-bar oppose"><div class="pk-bar-top"><span class="l">' + noL + '</span><span class="r" data-r="oppose">—</span></div><div class="pk-bar-track"><div class="pk-bar-fill" data-f="oppose" style="width:0%"></div></div></div>' +
    '<div class="pk-vote-foot" data-foot>' + L.loading + '</div>';
  host.appendChild(card);

  var counts = { support: 0, oppose: 0 }, myVote = null, busy = false;
  function render() {
    var tot = counts.support + counts.oppose;
    ['support', 'oppose'].forEach(function (v) {
      var pct = tot ? Math.round(counts[v] / tot * 100) : 0;
      card.querySelector('[data-f="' + v + '"]').style.width = pct + '%';
      card.querySelector('[data-r="' + v + '"]').textContent = pct + '%  (' + counts[v].toLocaleString() + ')';
      var btn = card.querySelector('.pk-vb.' + v); btn.classList.toggle('on', myVote === v);
    });
    var foot = card.querySelector('[data-foot]');
    foot.innerHTML = '총 <b>' + tot.toLocaleString() + '</b> ' + L.total + (myVote ? ' · ' + L.mine + ': <b>' + (myVote === 'support' ? yesL : noL) + '</b> (' + L.tap + ')' : '');
    if (en) foot.innerHTML = '<b>' + tot.toLocaleString() + '</b> ' + L.total + (myVote ? ' · ' + L.mine + ': <b>' + (myVote === 'support' ? yesL : noL) + '</b> (' + L.tap + ')' : '');
  }
  function load() {
    rest('/social_votes?target_type=eq.topic&target_id=eq.' + encodeURIComponent(voteId) + '&select=vote,user_id').then(function (rows) {
      counts = { support: 0, oppose: 0 }; var u = uid(); myVote = null;
      (rows || []).forEach(function (r) { if (counts[r.vote] != null) counts[r.vote]++; if (r.user_id === u) myVote = r.vote; });
      render();
    }).catch(function () { var f = card.querySelector('[data-foot]'); if (f) f.textContent = en ? 'Could not load votes' : '집계를 불러오지 못했습니다'; });
  }
  function vote(v) {
    if (busy) return; busy = true; var u = uid();
    var prev = myVote;
    // optimistic
    if (myVote === v) { counts[v]--; myVote = null; } else { if (myVote) counts[myVote]--; counts[v]++; myVote = v; }
    render();
    var p;
    if (prev === v) { p = rest('/social_votes?user_id=eq.' + encodeURIComponent(u) + '&target_type=eq.topic&target_id=eq.' + encodeURIComponent(voteId), { method: 'DELETE' }); }
    else { p = rest('/social_votes?on_conflict=target_type,target_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ target_type: 'topic', target_id: voteId, target_label: label, user_id: u, vote: v }]) }); }
    p.then(function () { busy = false; load(); }).catch(function () { busy = false; load(); });
  }
  card.querySelectorAll('.pk-vb').forEach(function (b) { b.addEventListener('click', function () { vote(b.getAttribute('data-v')); }); });
  load();
})();
