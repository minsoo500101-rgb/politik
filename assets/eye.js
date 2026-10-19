/* 관제 화면(/eye.html) — 데이터: /data/eye.json(build-eye-data.js) · /data/risk-indicators.json · /api/ecos(코스피 일별)
 * 시안 D(동아시아 HUD) 구현. 모든 수치는 데이터 파일에서 읽는다 — 화면에 숫자를 박지 않는다. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SIG = { red: '#ff4d3a', yellow: '#f2c14e', green: '#3fe0c8' };
  // 게이지 눈금 — 지표별 기준선(ref)과 끝값(max). 값·설명은 risk-indicators.json 에서.
  const GAUGE = { tfr: [2.1, 2.1], aging: [20, 40], household_debt: [100, 120], potential_growth: [3, 4], national_debt: [50, 100], grain: [31, 100], energy: [100, 100], credit: [null, null] };
  const SHORT = { tfr: '합계출산율', aging: '65세 이상', household_debt: '가계부채/GDP', potential_growth: '잠재성장률', national_debt: '국가채무/GDP', grain: '곡물자급률', energy: '에너지 수입의존', credit: '국가신용등급' };
  const HEX = [['경기', 1, 0], ['강원', 2, 0], ['인천', 0, 1], ['서울', 1, 1], ['충북', 2, 1], ['경북', 3, 1], ['충남', 0, 2], ['세종', 1, 2], ['대전', 2, 2], ['대구', 3, 2], ['전북', 0, 3], ['경남', 2, 3], ['울산', 3, 3], ['전남광주', 0, 4], ['부산', 2, 4], ['제주', 0, 5.4]];

  setInterval(clock, 1000); clock();
  function clock() { $('#clock').textContent = new Date(Date.now() + 9 * 36e5).toISOString().slice(11, 19) + ' KST'; }

  let EYE = null, RISK = [], ISSUES = [], GOV = {};
  Promise.all([
    fetch('/data/eye.json').then((r) => r.json()),
    fetch('/data/risk-indicators.json').then((r) => r.json()).catch(() => null),
  ]).then(([eye, risk]) => {
    EYE = eye; ISSUES = eye.issues;
    eye.governors.forEach((g) => { GOV[g.r] = [g.name, /민주/.test(g.party) ? '민주' : '국힘']; });
    RISK = risk ? risk.indicators.map((i) => normRisk(i, eye)) : [];
    chips(); gauges(); laws(); thread(); cases(); holoInit(); legend(); suggest();
    say(`› 오늘의 신호 — ${ISSUES[0] ? ISSUES[0].tt : ''}`);
  }).catch(() => { $('#chips').innerHTML = '<span class="chip alert">데이터를 불러오지 못했다 — 새로고침</span>'; });
  kospi();

  function normRisk(i, eye) {
    let v = i.value;
    if (i.live && i.live.id === 'household_debt_ratio' && eye.economy.household_debt != null) v = String(eye.economy.household_debt);  // live 지표일 때만
    if (i.id === 'credit' && !v) v = 'AA';
    const [ref, max] = GAUGE[i.id] || [null, null];
    return { id: i.id, l: SHORT[i.id] || i.label, full: i.label, v, u: i.unit || '', sig: i.signal, asof: i.asof, hl: i.headline, ctx: String(i.context || '').replace(/\{value\}/g, v), cmp: i.compare, s: i.series || null, ref, max, src: i.source, href: i.source_url };
  }
  function chips() {
    const red = RISK.filter((r) => r.sig === 'red').length;
    const y = EYE.yoon.summary;
    $('#chips').innerHTML = `<span class="chip">국회 <b>${EYE.counts.members}</b></span><span class="chip">법령 <b>${EYE.laws.total}</b></span><span class="chip">기사 <b>${EYE.counts.articles}</b></span>` +
      (RISK.length ? `<span class="chip alert">위기 계수 적색 ${red} / ${RISK.length}</span>` : '') + `<span class="chip">갱신 <b>${esc(EYE.generatedAt.slice(5).replace('-', '.'))}</b></span>`;
    $('#yoonAsof').textContent = `${y.total}건 · 확정 ${y.final} · ${EYE.yoon.asOf.slice(5).replace('-', '.')} 기준`;
  }

  // ── 위기 계수 ──
  let gsel = 'tfr';
  function drawGauge(cv, r) {
    const x = cv.getContext('2d'), W = cv.width, cx = W / 2, cy = W / 2 + 6, R = W * 0.38, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, col = SIG[r.sig] || SIG.green;
    x.clearRect(0, 0, W, W); x.lineWidth = W * 0.07; x.strokeStyle = 'rgba(63,224,200,.12)'; x.beginPath(); x.arc(cx, cy, R, a0, a1); x.stroke();
    for (let i = 0; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20; x.strokeStyle = 'rgba(63,224,200,.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx + (R + W * 0.06) * Math.cos(a), cy + (R + W * 0.06) * Math.sin(a)); x.lineTo(cx + (R + W * 0.09) * Math.cos(a), cy + (R + W * 0.09) * Math.sin(a)); x.stroke(); }
    const num = parseFloat(r.v), f = r.max && !isNaN(num) ? Math.min(1, num / r.max) : 1;
    x.strokeStyle = col; x.lineWidth = W * 0.07; x.shadowColor = col; x.shadowBlur = 8; x.beginPath(); x.arc(cx, cy, R, a0, a0 + (a1 - a0) * f); x.stroke(); x.shadowBlur = 0;
    if (r.ref && r.max) { const a = a0 + (a1 - a0) * Math.min(1, r.ref / r.max); x.strokeStyle = '#eef3ef'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + (R - W * 0.06) * Math.cos(a), cy + (R - W * 0.06) * Math.sin(a)); x.lineTo(cx + (R + W * 0.06) * Math.cos(a), cy + (R + W * 0.06) * Math.sin(a)); x.stroke(); }
    x.fillStyle = '#e8f4f1'; x.textAlign = 'center'; x.font = `600 ${W * 0.2}px JetBrains Mono`; x.fillText(String(r.v), cx, cy + W * 0.06);
    x.font = `${W * 0.1}px IBM Plex Sans KR`; x.fillStyle = '#93b5ae'; x.fillText(r.u, cx, cy + W * 0.2);
  }
  function gauges() {
    if (!RISK.length) { $('#gauges').innerHTML = '<div class="skel">위기 지표를 불러오지 못했다</div>'; return; }
    $('#gauges').innerHTML = RISK.map((r) => `<button class="g" aria-pressed="${r.id === gsel}" data-id="${r.id}"><canvas width="140" height="140"></canvas><small>${esc(r.l)}</small></button>`).join('');
    document.querySelectorAll('#gauges .g').forEach((b, i) => drawGauge(b.querySelector('canvas'), RISK[i]));
    const r = RISK.find((x) => x.id === gsel) || RISK[0];
    $('#gd').innerHTML = `<div class="coef"><b style="color:${SIG[r.sig]}">${esc(r.v)}${esc(r.u)}</b><span>${esc(r.full)} · ${esc(r.asof)} · ${esc(r.src)}</span></div><div class="hl">${esc(r.hl)}</div><div class="tx">${esc(r.ctx)}${r.cmp ? ` <b>${esc(r.cmp)}</b>` : ''}</div>${r.s ? '<canvas id="gs" width="560" height="112"></canvas>' : ''}`;
    if (r.s) series($('#gs'), r);
  }
  function series(cv, r) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, v = r.s.map((p) => p[1]);
    const mn = Math.min(...v, r.ref || Infinity) * 0.92, mx = Math.max(...v, r.ref || -Infinity) * 1.05;
    const X = (i) => 10 + i * (W - 20) / (v.length - 1), Y = (a) => H - 14 - (a - mn) / (mx - mn) * (H - 28);
    if (r.ref && r.ref <= mx) { x.strokeStyle = 'rgba(238,243,239,.4)'; x.setLineDash([5, 5]); x.beginPath(); x.moveTo(10, Y(r.ref)); x.lineTo(W - 10, Y(r.ref)); x.stroke(); x.setLineDash([]); x.fillStyle = '#93b5ae'; x.font = '18px JetBrains Mono'; x.fillText('기준 ' + r.ref, W - 110, Y(r.ref) - 6); }
    x.beginPath(); v.forEach((a, i) => (i ? x.lineTo(X(i), Y(a)) : x.moveTo(X(i), Y(a)))); x.strokeStyle = SIG[r.sig]; x.lineWidth = 3; x.stroke();
    r.s.forEach((p, i) => { x.fillStyle = SIG[r.sig]; x.fillRect(X(i) - 3, Y(p[1]) - 3, 6, 6); if (i === 0 || i === v.length - 1) { x.fillStyle = '#93b5ae'; x.font = '16px JetBrains Mono'; x.fillText(p[0], X(i) - (i ? 44 : 0), H - 1); } });
  }
  $('#gauges').addEventListener('click', (e) => { const b = e.target.closest('.g'); if (b) { gsel = b.dataset.id; gauges(); } });

  // ── 코스피(ECOS 일별) ──
  let KOSPI = [];
  function kospi() {
    const end = new Date(Date.now() + 9 * 36e5), start = new Date(end - 40 * 864e5), f = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
    fetch(`/api/ecos?stat=802Y001&item=0001000&period=D&start=${f(start)}&end=${f(end)}`).then((r) => r.json()).then((j) => {
      KOSPI = (j.data || []).slice(-15).map((d) => [d.time.slice(4, 6) + '/' + d.time.slice(6, 8), +d.value]);
      if (KOSPI.length < 2) throw new Error('no data');
      const hi = KOSPI.reduce((m, k) => (k[1] > m[1] ? k : m)), lastK = KOSPI[KOSPI.length - 1], chg = (lastK[1] / hi[1] - 1) * 100;
      $('#kospiChg').textContent = `${lastK[1].toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`;
      $('#kospiRange').textContent = `최근 고점(${hi[0]}) 대비 ${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`;
      $('#kospiChg').style.color = chg < 0 ? 'var(--jeok)' : 'var(--cheong)';
      spark();
    }).catch(() => { $('#readout').textContent = '코스피 일별 자료를 불러오지 못했다'; });
  }
  const sp = $('#spark'), sx = sp.getContext('2d'); let hv = -1;
  function spark() {
    const W = sp.width, H = sp.height, p = 12, v = KOSPI.map((k) => k[1]), mn = Math.min(...v) * 0.99, mx = Math.max(...v) * 1.01, X = (i) => p + i * (W - 2 * p) / (v.length - 1), Y = (a) => H - p - (a - mn) / (mx - mn) * (H - 2 * p);
    sp._X = X; sx.clearRect(0, 0, W, H);
    sx.beginPath(); v.forEach((a, i) => (i ? sx.lineTo(X(i), Y(a)) : sx.moveTo(X(i), Y(a)))); sx.strokeStyle = '#ff4d3a'; sx.lineWidth = 2.5; sx.shadowColor = '#ff4d3a'; sx.shadowBlur = 8; sx.stroke(); sx.shadowBlur = 0;
    v.forEach((a, i) => { sx.fillStyle = i === hv ? '#f2c14e' : '#ff4d3a'; sx.beginPath(); sx.arc(X(i), Y(a), i === hv ? 6 : 3, 0, 7); sx.fill(); });
  }
  sp.addEventListener('mousemove', (e) => { if (!KOSPI.length) return; const r = sp.getBoundingClientRect(), x = (e.clientX - r.left) * sp.width / r.width; let b = 0, bd = 1e9; KOSPI.forEach((k, i) => { const d = Math.abs(sp._X(i) - x); if (d < bd) { bd = d; b = i; } }); hv = b; const [d, v] = KOSPI[b], pc = b ? (v / KOSPI[b - 1][1] - 1) * 100 : 0; $('#readout').textContent = `${d} 종가 ${v.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}${b ? ` · ${pc > 0 ? '+' : ''}${pc.toFixed(2)}%` : ''}`; spark(); });
  sp.addEventListener('mouseleave', () => { hv = -1; if (KOSPI.length) spark(); });

  // ── 곧 시행 ──
  function laws() {
    const L = EYE.laws, day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)), today = Date.now() + 9 * 36e5, t0 = Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth(), new Date(today).getUTCDate());
    $('#lawAsof').textContent = `${L.total}건 · 30일 안 ${L.soon30}`;
    $('#laws').innerHTML = L.next.map((l) => { const dd = Math.round((day(l.ef) - t0) / 864e5); return `<li data-n="${esc(l.name + ' ' + l.dom)}"><span class="dd ${dd <= 0 ? 'now' : ''}">${dd <= 0 ? '시행' : 'D-' + dd}</span><span>${esc(l.name)}<small>${l.ef.slice(4, 6)}.${l.ef.slice(6, 8)} · ${esc(l.dom)}</small></span></li>`; }).join('');
  }

  // ── 흐름 · 재판 ──
  function thread(h) {
    $('#thread').innerHTML = ISSUES.map((it, i) => `<li data-i="${i}" aria-expanded="false" class="${h && h.includes(i) ? 'hit' : ''}"><button><span class="d">${it.d.slice(5).replace('-', '.')}</span><span class="t">${esc(it.tt)}</span></button><div class="more">${it.big ? `<div class="num">${esc(it.big)}</div>` : ''}<div class="sub">${esc(it.sub)}</div><a class="go" href="${esc(it.href)}">기사 열기 ›</a></div></li>`).join('');
  }
  $('#thread').addEventListener('click', (e) => { if (e.target.closest('a')) return; const li = e.target.closest('li[data-i]'); if (!li) return; const o = li.getAttribute('aria-expanded') === 'true'; document.querySelectorAll('#thread li').forEach((x) => x.setAttribute('aria-expanded', 'false')); li.setAttribute('aria-expanded', String(!o)); const r = ISSUES[+li.dataset.i].r; if (!o && r && GOV[r]) { sel = r; $('#htx').textContent = 'LOCK ' + r; } if (reduce) draw(0); });
  function cases() {
    $('#cases').innerHTML = EYE.yoon.cases.map((c) => `<div class="case" title="${esc(c.note)}"><span>${esc(c.id)}</span><div class="bar">${[0, 1, 2].map((i) => (c.s[i] ? `<i class="${c.s[i][0]}">${esc(c.s[i][1].replace('징역', '').replace(' 집유', '·집유'))}</i>` : '<i class="p">—</i>')).join('')}</div></div>`).join('');
  }

  // ── 홀로테이블 ──
  const cv = $('#holo'), hx = cv.getContext('2d'), W = cv.width, H = cv.height, S = 58;
  let cells = [], rot = -0.45, tilt = 0.56, drag = null, sel = null, hitR = [], NK = null, SEA = null, hasNK = false;
  function holoInit() {
    cells = HEX.map(([n, c, r]) => ({ n, x: c * S * 1.74 + (Math.floor(r) % 2 ? S * 0.87 : 0), y: r * S * 1.5 }));
    const mx = (Math.min(...cells.map((c) => c.x)) + Math.max(...cells.map((c) => c.x))) / 2, my = (Math.min(...cells.map((c) => c.y)) + Math.max(...cells.map((c) => c.y))) / 2;
    cells.forEach((c) => { c.x -= mx; c.y -= my; c.iss = ISSUES.filter((i) => i.r === c.n).length; c.h = 22 + c.iss * 18; });
    const gg = cells.find((c) => c.n === '경기'), gw = cells.find((c) => c.n === '강원');
    NK = { x: gg.x - 20, y: gg.y - 150 }; SEA = { x: gw.x + 330, y: gw.y - 20 };
    hasNK = ISSUES.some((i) => i.r === '북측');
    reduce ? draw(0) : requestAnimationFrame(loop);
  }
  function legend() {
    const nM = Object.values(GOV).filter((g) => g[1] === '민주').length, nG = Object.values(GOV).length - nM, nk = ISSUES.find((i) => i.r === '북측');
    $('#legend').innerHTML = `<span><i style="background:var(--minju)"></i>민주 단체장 ${nM}</span><span><i style="background:var(--gukim)"></i>국힘 단체장 ${nG}</span><span><i style="background:var(--hwang)"></i>최근 사안(빛기둥)</span>${nk ? `<span><i style="background:var(--jeok)"></i>북측 ${esc(nk.d.slice(5).replace('-', '/'))} ${esc(nk.tt.split('—')[0].trim())}</span>` : ''}`;
  }
  const P = (x, y, z) => { const cs = Math.cos(rot), sn = Math.sin(rot), rx = x * cs - y * sn, ry = x * sn + y * cs; return { x: W / 2 + rx * 1.6, y: H * 0.5 + ry * 1.6 * tilt - z * 1.6, d: ry }; };
  function hexPts(c, z) { const a = []; for (let i = 0; i < 6; i++) { const t = Math.PI / 180 * (60 * i - 30); a.push(P(c.x + S * 0.94 * Math.cos(t), c.y + S * 0.94 * Math.sin(t), z)); } return a; }
  function poly(pts) { hx.beginPath(); pts.forEach((p, i) => (i ? hx.lineTo(p.x, p.y) : hx.moveTo(p.x, p.y))); hx.closePath(); }
  function draw(t) {
    if (!cells.length) return;
    hx.clearRect(0, 0, W, H);
    const cs = P(0, 0, 0);
    for (const rr of [200, 320, 440]) { hx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = P(rr * Math.cos(a), rr * Math.sin(a), 0); i ? hx.lineTo(p.x, p.y) : hx.moveTo(p.x, p.y); } hx.strokeStyle = 'rgba(63,224,200,.12)'; hx.lineWidth = 1; hx.stroke(); }
    if (!reduce) { const sw = (t / 2800) % (Math.PI * 2); for (let k = 0; k < 24; k++) { const a = sw - k * 0.02, p = P(440 * Math.cos(a), 440 * Math.sin(a), 0); hx.strokeStyle = `rgba(63,224,200,${0.35 * (1 - k / 24)})`; hx.beginPath(); hx.moveTo(cs.x, cs.y); hx.lineTo(p.x, p.y); hx.stroke(); } }
    cells.map((c) => ({ c, d: P(c.x, c.y, 0).d })).sort((a, b) => a.d - b.d).forEach(({ c }) => {
      const g = GOV[c.n] || ['', '민주'], p = g[1] === '민주' ? [79, 140, 255] : [255, 77, 58], on = sel === c.n, hit = hitR.includes(c.n), top = hexPts(c, c.h), bot = hexPts(c, 0);
      for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; poly([bot[i], bot[j], top[j], top[i]]); hx.fillStyle = `rgba(${p},${on ? 0.28 : 0.1})`; hx.fill(); hx.strokeStyle = `rgba(${p},.35)`; hx.lineWidth = 1; hx.stroke(); }
      poly(top); hx.fillStyle = `rgba(${p},${on ? 0.65 : 0.3})`; hx.fill(); hx.strokeStyle = hit ? '#f2c14e' : `rgba(${p},.95)`; hx.lineWidth = hit || on ? 3 : 1.5; hx.stroke();
      const ct = P(c.x, c.y, c.h); hx.fillStyle = '#eef3ef'; hx.textAlign = 'center'; hx.font = '22px "Black Han Sans"'; hx.fillText(c.n, ct.x, ct.y + 7);
      if (c.iss) { const k = reduce ? 0.5 : (t / 900) % 1, gr = hx.createLinearGradient(0, ct.y - 160, 0, ct.y); gr.addColorStop(0, 'rgba(242,193,78,0)'); gr.addColorStop(1, 'rgba(242,193,78,.75)'); hx.fillStyle = gr; hx.fillRect(ct.x - 3, ct.y - 160, 6, 160); hx.beginPath(); hx.arc(ct.x, ct.y - 160 * k, 4, 0, 7); hx.fillStyle = '#f2c14e'; hx.fill(); }
    });
    if (hasNK) {
      hx.strokeStyle = 'rgba(255,77,58,.85)'; hx.lineWidth = 2; hx.setLineDash([6, 6]); hx.lineDashOffset = reduce ? 0 : -t / 25; hx.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40, p = P(NK.x + (SEA.x - NK.x) * u, NK.y + (SEA.y - NK.y) * u, Math.sin(u * Math.PI) * 170); i ? hx.lineTo(p.x, p.y) : hx.moveTo(p.x, p.y); } hx.stroke(); hx.setLineDash([]);
      const pa = P(NK.x, NK.y, 0), pb = P(SEA.x, SEA.y, 0); hx.fillStyle = '#ff4d3a'; hx.fillRect(pa.x - 5, pa.y - 5, 10, 10); hx.beginPath(); hx.arc(pb.x, pb.y, 6, 0, 7); hx.fill();
      hx.font = '16px "IBM Plex Sans KR"'; hx.textAlign = 'left'; hx.fillText('북측', pa.x + 10, pa.y - 10);
    }
    if (sel) { const c = cells.find((x) => x.n === sel), ct = P(c.x, c.y, c.h), r = 46 + (reduce ? 0 : Math.sin(t / 220) * 3); hx.strokeStyle = '#f2c14e'; hx.lineWidth = 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([qx, qy]) => { hx.beginPath(); hx.moveTo(ct.x + qx * r, ct.y + qy * r - qy * 14); hx.lineTo(ct.x + qx * r, ct.y + qy * r); hx.lineTo(ct.x + qx * r - qx * 14, ct.y + qy * r); hx.stroke(); });
      hx.beginPath(); hx.moveTo(ct.x + r, ct.y - r); hx.lineTo(ct.x + r + 60, ct.y - r - 60); hx.lineTo(W - 30, ct.y - r - 60); hx.stroke();
      hx.fillStyle = '#f2c14e'; hx.font = '14px "JetBrains Mono"'; hx.textAlign = 'right'; hx.fillText(`LOCK ${sel} · ${(GOV[sel] || [''])[0]}`, W - 34, ct.y - r - 68); }
    hx.fillStyle = 'rgba(147,181,174,.85)'; hx.font = '15px "JetBrains Mono"'; hx.textAlign = 'left';
    hx.fillText(`ROT ${String(Math.round((((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 57.3)).padStart(3, '0')}°  TILT ${tilt.toFixed(2)}`, 16, H - 16);
  }
  function loop(t) { if (!drag) rot += 0.0012; draw(t); requestAnimationFrame(loop); }
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, r: rot, t: tilt, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; rot = drag.r + dx * 0.008; tilt = Math.max(0.3, Math.min(0.85, drag.t + dy * 0.002)); if (reduce) draw(0); });
  cv.addEventListener('pointerup', (e) => {
    const was = drag && drag.moved; drag = null; if (was || !cells.length) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const h = cells.map((c) => ({ c, p: P(c.x, c.y, c.h) })).filter((o) => Math.hypot(o.p.x - x, o.p.y - y) < S * 1.2).sort((a, b) => b.p.d - a.p.d)[0];
    if (!h) { sel = null; $('#card').hidden = true; $('#htx').textContent = '끌어서 돌리기 · 눌러서 고정'; if (reduce) draw(0); return; }
    sel = h.c.n; const g = GOV[sel] || ['—', '—'], iss = ISSUES.filter((i) => i.r === sel);
    $('#card').innerHTML = `<button class="x" aria-label="닫기">×</button><h3>${esc(sel)}</h3><div class="meta">광역단체장 · 9회 지선 2026.6.3</div><p><b style="color:var(--ink)">${esc(g[0])}</b> · ${g[1] === '민주' ? '더불어민주당' : '국민의힘'}</p>${iss.length ? iss.map((i) => `<p>▸ <a href="${esc(i.href)}" style="color:var(--ink-2)">${esc(i.tt)}</a></p>`).join('') : '<p>최근 사안 중 이 지역 지명이 나온 기사 없음</p>'}`;
    $('#card').hidden = false; $('#htx').textContent = 'LOCK ' + sel; if (reduce) draw(0);
  });
  $('#card').addEventListener('click', (e) => { if (e.target.closest('.x')) { $('#card').hidden = true; sel = null; if (reduce) draw(0); } });

  // ── 명령줄 ──
  function suggest() {
    const S2 = ['코스피', '출산율', '국가채무', '재판', '법령'].concat(ISSUES.filter((i) => i.r && i.r !== '북측').map((i) => i.r)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 7);
    $('#sugg').innerHTML = S2.map((s) => `<button>${esc(s)}</button>`).join('');
  }
  $('#sugg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('#q').value = b.textContent; run(); } });
  let ty; function say(s) { clearInterval(ty); const el = $('#reply'); if (reduce) { el.textContent = s; return; } el.textContent = ''; let i = 0; ty = setInterval(() => { el.textContent = s.slice(0, ++i); if (i >= s.length) clearInterval(ty); }, 12); }
  function run() {
    const q = $('#q').value.trim(); if (!q || !EYE) return;
    const w = q.split(/\s+/).filter((x) => x.length > 1), hit = (s) => w.some((x) => s.includes(x)) || s.includes(q);
    const iss = ISSUES.map((it, i) => (hit(it.tt + it.sub) ? i : -1)).filter((i) => i >= 0);
    hitR = cells.map((c) => c.n).filter((n) => hit(n) || ISSUES.some((it, i) => iss.includes(i) && it.r === n)); thread(iss);
    document.querySelectorAll('#laws li').forEach((li) => li.classList.toggle('hit', hit(li.dataset.n)));
    const rk = RISK.find((r) => hit(r.l) || hit(r.full) || (q.includes('출산') && r.id === 'tfr') || (q.includes('부채') && r.id === 'household_debt') || (q.includes('채무') && r.id === 'national_debt') || (q.includes('고령') && r.id === 'aging'));
    if (rk) { gsel = rk.id; gauges(); say(`› ${rk.full} ${rk.v}${rk.u} (${rk.asof}) — ${rk.hl}`); }
    else if (/코스피|증시|주식/.test(q) && KOSPI.length) { const a = KOSPI[0], b = KOSPI[KOSPI.length - 1]; say(`› 코스피 ${a[0]} ${a[1].toLocaleString('ko-KR')} → ${b[0]} ${b[1].toLocaleString('ko-KR')} (${((b[1] / a[1] - 1) * 100).toFixed(1)}%). 왼쪽 그래프에 커서를 올려 보세요.`); }
    else if (/재판|윤석열|판결/.test(q)) { const y = EYE.yoon.summary; say(`› 윤석열 전 대통령 형사사건 ${y.total}건 — 확정 ${y.final}, 무죄 ${y.acquittals}(모두 불복), 선고 전 ${y.pending}.`); }
    else if (/법령|시행/.test(q)) say(`› 곧 시행되는 법령 ${EYE.laws.total}건, 30일 안 ${EYE.laws.soon30}건. 가장 가까운 것: ${EYE.laws.next[0].name}.`);
    else say(`› 사안 ${iss.length}건 · 지역 ${hitR.length ? hitR.join('·') : '없음'} 표시`);
    if (reduce) draw(0);
  }
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
})();
