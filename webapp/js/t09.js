// t09 어둠 알아채기 (17–18차시) — 기획서 docs/topics/t09.md
// ① 알티노의 눈 찾기(밝기 숫자·10초 그래프, 가리기 전·뒤 비교) → ② 밝기 그래프 그리기(네 곳 막대그래프)
// → ③ 터널 실험(밖·안 → 가운데 값 기준, 차이 120 미만 경고, 기준보다 어두우면 전방등 LED 15)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't09',
    title: '어둠 알아채기',
    onSensor,
    onTick,
  });

  const GAP_MIN = 120;          // 밝은 곳·어두운 곳 차이가 이보다 작으면 기준을 못 만든다(03 §3, 파일럿)
  const LED_ON = 15;            // 실측된 전방등 값(03 §6)
  const HYST = 10;              // 켜진 뒤에는 기준+10 보다 밝아져야 끈다 — 기준 근처에서 깜빡이지 않게(04 #7)
  const SPEED = 300;            // 03 §1
  const SPOTS = ['앞쪽', '위쪽', '뒤쪽', '아래쪽'];
  const PLACES = ['창가', '교실 가운데', '책상 아래', '사물함 안'];
  const HIST_MS = 10000;

  // 화면 표시는 최소 30(0 이 뜨면 고장으로 오해, 03 §3), 10 단위로 어림
  const r10 = (v) => Math.round(Math.max(30, v) / 10) * 10;
  let lastCds = null, lastAt = 0;
  const hist = [];
  let sampler = null;           // { vals:[], end, done }

  function onSensor(s) {
    if (s.cds == null) return;
    lastCds = s.cds; lastAt = Date.now();
    hist.push({ t: lastAt, v: s.cds });
    while (hist.length && hist[0].t < lastAt - HIST_MS) hist.shift();
    if (sampler) sampler.vals.push(s.cds);
    if (auto) autoLight(s.cds);
  }
  let tickN = 0;
  function onTick() {
    if (++tickN % 2) return;    // 200ms 마다 화면 갱신
    const txt = lastCds == null || Date.now() - lastAt > 1500 ? '–' : r10(lastCds);
    ['cdsNow', 'cdsNow2', 'cdsNow3'].forEach(id => { $(id).textContent = txt; });
    if (step === 1) drawLive();
    if (sampler && Date.now() >= sampler.end) {
      const sm = sampler; sampler = null;
      if (!sm.vals.length) { kit.toast('⚠ 밝기 값이 안 들어와요 — 연결을 확인해요'); sm.done(null); }
      else sm.done(r10(sm.vals.reduce((a, b) => a + b, 0) / sm.vals.length));
    }
  }
  // ms 동안 들어온 값의 평균을 10 단위로
  function measure(ms, done) {
    if (sampler) { kit.toast('재는 중이에요'); return false; }
    sampler = { vals: [], end: Date.now() + ms, done };
    return true;
  }

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) kit.stop();
    pad.forEach(h => h && h.release());
    if (n !== 3) setAuto(false);
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── ① 알티노의 눈 찾기 ──────────────────────────────────────────
  function drawLive() {
    const cv = $('liveCv'), box = $('live');
    const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const top = Math.max(800, Math.ceil(Math.max(0, ...hist.map(x => x.v)) / 100) * 100);
    const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
    g.strokeStyle = '#f0e6d8'; g.lineWidth = 1;
    box.querySelectorAll('.yl').forEach(e => e.remove());
    for (let v = 0; v <= top; v += 200) {
      const y = h - v / top * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      const l = document.createElement('span'); l.className = 'yl'; l.style.top = y + 'px'; l.textContent = v; box.appendChild(l);
    }
    const now = Date.now();
    g.strokeStyle = '#5ea0ff'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    hist.forEach((x, i) => { const px = w - (now - x.t) / HIST_MS * w, py = h - Math.max(30, x.v) / top * h; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
  }
  // eye = { 앞쪽: {before, after}, … }
  let eye = kit.store.get('eye', {}); if (!eye || typeof eye !== 'object') eye = {};
  let spot = SPOTS[0];
  SPOTS.forEach(s => {
    const b = document.createElement('button'); b.textContent = s; b.dataset.s = s;
    b.onclick = () => { if (sampler) return; spot = s; renderEye(); };
    $('spotChips').appendChild(b);
  });
  $('eyeBefore').onclick = () => {
    measure(500, (v) => { if (v == null) return; eye[spot] = { before: v }; kit.store.set('eye', eye); $('eyeFb').textContent = `가리기 전 ${v} — 이제 ${spot}을 손으로 가려요.`; $('eyeFb').className = 'fb'; renderEye(); });
    renderEye();
  };
  $('eyeAfter').onclick = () => {
    const e = eye[spot]; if (!e || e.before == null) return;
    $('eyeFb').textContent = '✋ 2초 동안 가리고 있어요…'; $('eyeFb').className = 'fb';
    measure(2000, (v) => {
      if (v == null) return;
      e.after = v; kit.store.set('eye', eye);
      const d = Math.abs(e.before - v), big = d >= GAP_MIN;
      kit.signal(big ? 'success' : 'notice');
      $('eyeFb').textContent = big ? `${spot}: ${d} 만큼 크게 바뀌었어요! 여기에 눈이 있을까요?` : `${spot}: ${d} 만큼 — 별로 안 바뀌었어요. 다른 곳도 가려 봐요.`;
      $('eyeFb').className = 'fb ' + (big ? 'ok' : '');
      renderEye();
    });
    renderEye();
  };
  function renderEye() {
    document.querySelectorAll('#spotChips button').forEach(b => b.classList.toggle('on', b.dataset.s === spot));
    const e = eye[spot];
    $('eyeBefore').disabled = !!sampler;
    $('eyeAfter').disabled = !!sampler || !e || e.before == null;
    let h = '<tr><th>가린 곳</th><th>가리기 전</th><th>가린 뒤</th><th>밝기 차이</th></tr>';
    let best = null;
    SPOTS.forEach(s => {
      const x = eye[s] || {}, d = x.after != null ? Math.abs(x.before - x.after) : null;
      if (d != null && (!best || d > best.d)) best = { s, d };
      h += `<tr class="${s === spot ? 'on' : ''}"><td>${s}</td><td>${x.before ?? ''}</td><td>${x.after ?? ''}</td><td class="${d >= GAP_MIN ? 'big' : ''}">${d ?? ''}</td></tr>`;
    });
    $('eyeTable').innerHTML = h;
    $('eyeSum').textContent = best && best.d >= GAP_MIN ? `👁 ${best.s}을 가렸을 때 가장 크게 바뀌었어요 — 알티노의 눈은 ${best.s}!` : '밝기가 크게(120 넘게) 바뀌는 곳을 찾아요.';
  }

  // ── ② 밝기 그래프 그리기 ────────────────────────────────────────
  let places = kit.store.get('places', {}); if (!places || typeof places !== 'object') places = {};
  let place = PLACES.find(p => places[p] == null) || PLACES[0];
  PLACES.forEach(p => {
    const b = document.createElement('button'); b.textContent = p; b.dataset.p = p;
    b.onclick = () => { if (sampler) return; place = p; renderPlaces(); };
    $('placeChips').appendChild(b);
  });
  $('placeMeasure').onclick = () => {
    if (!measure(2000, (v) => {
      if (v == null) { renderPlaces(); return; }
      places[place] = v; kit.store.set('places', places); kit.signal('success');
      const next = PLACES.find(p => places[p] == null); if (next) place = next;
      renderPlaces(); checkStars();
    })) return;
    $('placeMeasure').textContent = '⏳ 재는 중…'; $('placeMeasure').disabled = true;
  };
  $('placeReset').onclick = async () => {
    if (!await kit.confirm({ title: '장소별 밝기를 처음부터 잴까요?', lines: ['네 곳의 기록이 지워져요'], okText: '네, 처음부터', danger: true })) return;
    places = {}; kit.store.remove('places'); place = PLACES[0]; renderPlaces();
  };
  function renderPlaces() {
    document.querySelectorAll('#placeChips button').forEach(b => { b.classList.toggle('on', b.dataset.p === place); b.textContent = b.dataset.p + (places[b.dataset.p] != null ? ' ✓' : ''); });
    $('placeMeasure').textContent = '📏 여기 밝기 재기'; $('placeMeasure').disabled = !!sampler;
    $('placeTable').innerHTML = '<tr><th>장소</th>' + PLACES.map(p => `<th>${p}</th>`).join('') + '</tr><tr><td>밝기</td>' + PLACES.map(p => `<td>${places[p] ?? ''}</td>`).join('') + '</tr>';
    const vals = PLACES.map(p => places[p]).filter(v => v != null);
    const top = Math.max(800, Math.ceil(Math.max(0, ...vals) / 100) * 100), n = top / 100;
    const ch = $('chart');
    ch.style.background = `repeating-linear-gradient(to top,transparent 0,transparent calc(${100 / n}% - 1px),var(--line) calc(${100 / n}% - 1px),var(--line) ${100 / n}%)`;
    ch.innerHTML = '';
    for (let v = 100; v <= top; v += 100) { const l = document.createElement('span'); l.className = 'yl'; l.style.bottom = (v / top * 100) + '%'; l.textContent = v; ch.appendChild(l); }
    PLACES.forEach(p => {
      const c = document.createElement('div'); c.className = 'col';
      const b = document.createElement('div'); b.className = 'bar';
      b.style.height = places[p] == null ? '0' : (places[p] / top * 100) + '%';
      b.textContent = places[p] ?? ''; c.appendChild(b); ch.appendChild(c);
    });
    $('xl').innerHTML = PLACES.map(p => `<span>${p}</span>`).join('');
    if (vals.length === PLACES.length) {
      const sorted = PLACES.slice().sort((a, b) => places[b] - places[a]);
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      $('chartSay').textContent = `가장 밝은 곳 ${hi}(${places[hi]}) · 가장 어두운 곳 ${lo}(${places[lo]}) · 차이 ${places[hi] - places[lo]}`;
    } else $('chartSay').textContent = `${vals.length} / 4곳 — 네 곳을 재면 가장 밝은 곳과 어두운 곳을 알려 줘요.`;
  }

  // ── ③ 터널 실험 ─────────────────────────────────────────────────
  // tun = { rows:[{out, in, gap, mid|null}], cur:{out?, in?} }
  let tun = kit.store.get('tun', null);
  if (!tun || !Array.isArray(tun.rows)) tun = { rows: [], cur: {} };
  if (!tun.cur || typeof tun.cur !== 'object') tun.cur = {};
  const saveTun = () => kit.store.set('tun', tun);
  const goodRow = () => [...tun.rows].reverse().find(r => r.mid != null);
  function takeTun(key) {
    measure(1000, (v) => {
      if (v == null) { renderTun(); return; }
      tun.cur[key] = v;
      if (tun.cur.out != null && tun.cur.in != null) {
        const gap = tun.cur.out - tun.cur.in;
        const row = { out: tun.cur.out, in: tun.cur.in, gap, mid: gap >= GAP_MIN ? (tun.cur.out + tun.cur.in) / 2 : null };
        tun.rows.push(row); if (tun.rows.length > 4) tun.rows.shift();
        tun.cur = {};
        kit.signal(row.mid != null ? 'success' : 'fail');
        if (row.mid == null) setAuto(false);
        checkStars();
      }
      saveTun(); renderTun();
    });
    renderTun();
  }
  $('tunOut').onclick = () => takeTun('out');
  $('tunIn').onclick = () => takeTun('in');

  let auto = false, lit = false, litCount = kit.store.num('litCount', 0, 0, 9999);
  function autoLight(v) {
    const g = goodRow(); if (!g) return;
    const want = lit ? v < g.mid + HYST : v < g.mid;
    if (want !== lit) {
      lit = want; kit.led(lit ? LED_ON : 0);
      if (lit) { litCount++; kit.store.set('litCount', litCount); checkStars(); }
      renderLamp();
    }
  }
  function setAuto(on) {
    auto = on && !!goodRow();
    if (!auto && lit) { lit = false; }
    if (!auto) kit.led(0);
    renderTun();
  }
  $('autoOn').onclick = () => { setAuto(true); kit.signal('start'); if (lastCds != null) autoLight(lastCds); };
  $('autoOff').onclick = () => { kit.stop(); pad.forEach(h => h && h.release()); setAuto(false); };
  window.addEventListener('pagehide', () => kit.led(0));   // 화면을 떠나면 라이트도 끈다

  // 터널로 천천히 — 누르는 동안만(12 S3)
  const pad = [
    kit.hold($('d-up'), () => kit.drive(SPEED, 0), () => kit.drive(0, 0)),
    kit.hold($('d-down'), () => kit.drive(-SPEED, 0), () => kit.drive(0, 0)),
  ];

  function renderLamp() {
    $('lamp').classList.toggle('on', lit);
    const g = goodRow();
    $('autoSay').textContent = !g ? '기준을 만들면 켤 수 있어요.'
      : !auto ? `기준 ${g.mid} — 자동 라이트를 켜 봐요.`
      : lit ? `밝기가 기준 ${g.mid}보다 작아요 → 라이트 켜짐 💡` : `밝기가 기준 ${g.mid}보다 커요 → 라이트 꺼짐`;
    $('lightCount').textContent = litCount ? `라이트가 저절로 켜진 횟수 ${litCount}번` : '';
  }
  function renderTun() {
    $('tunOut').disabled = $('tunIn').disabled = !!sampler;
    let h = '<tr><th>구분</th><th>터널 밖</th><th>터널 안</th><th>두 값의 차이</th><th>가운데 값(기준)</th></tr>';
    tun.rows.forEach((r, i) => { h += `<tr><td>${i + 1}번째 측정</td><td>${r.out}</td><td>${r.in}</td><td>${r.gap}</td><td>${r.mid ?? '다시 재기'}</td></tr>`; });
    if (tun.cur.out != null || tun.cur.in != null) h += `<tr class="on"><td>재는 중</td><td>${tun.cur.out ?? ''}</td><td>${tun.cur.in ?? ''}</td><td></td><td></td></tr>`;
    $('tunTable').innerHTML = h;
    const last = tun.rows[tun.rows.length - 1], g = goodRow();
    $('calc').innerHTML = !last ? '밖과 안을 재면 가운데 값을 계산해요.'
      : last.mid != null ? `(${last.out} + ${last.in}) ÷ 2 = <b>${last.mid}</b> &nbsp;← 가운데 값(기준)`
      : `차이 ${last.gap} — 120보다 작아서 기준을 못 만들어요.`;
    $('gapWarn').classList.toggle('hidden', !last || last.mid != null);
    $('gapWarn').textContent = `⚠ 밖(${last && last.out})과 안(${last && last.in})의 차이가 ${last && last.gap}밖에 안 돼요. 알티노를 터널 안쪽 깊숙이 넣고 다시 재요.`;
    $('autoOn').disabled = !g;
    $('autoOn').classList.toggle('hidden', auto);
    $('autoOff').classList.toggle('hidden', !auto);
    renderLamp();
  }

  // ── 별·성장기록부 — 4곳 재기 ⭐ · + 터널 기준 ⭐⭐ · + 라이트가 저절로 켜짐 ⭐⭐⭐ ──
  function checkStars() {
    const four = PLACES.every(p => places[p] != null);
    if (!four) return;
    const stars = litCount > 0 && goodRow() ? 3 : goodRow() ? 2 : 1;
    const best = kit.store.num('bestStars', 0, 0, 3);
    if (stars <= best) return;           // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
    kit.store.set('bestStars', stars);
    const g = goodRow();
    kit.record.add({
      title: stars === 3 ? '터널에서 라이트를 켰어요' : '밝기 그래프를 그렸어요',
      detail: `네 곳 밝기 막대그래프` + (g ? ` · 터널 기준 (${g.out}+${g.in})÷2=${g.mid}` : '') + (stars === 3 ? ' · 자동 라이트 성공' : ''),
      stars,
    });
    kit.toast(['', '🏅 도전 배지!', '🏅 실력 배지!', '🏅 박사 배지!'][stars]);
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  kit.led(0);
  showStep(step);
  renderEye(); renderPlaces(); renderTun();
})();
