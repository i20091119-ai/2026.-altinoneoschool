// t15 학예회·졸업식 (29–32차시) — 기획서 docs/topics/t15.md
// ① 공연 만들기(1초 칸 스토리보드: 움직임·속도·소리·빛·표정, 내 그림 8×8, 저장·불러오기)
// → ② 리허설·공연(칸마다 1초씩 실행, 지금 칸 강조, 친구 피드백 1가지 반영)
// → ③ 졸업식(모든 앱의 성장기록부를 차시 순으로 되짚기, 졸업장, 한 줄 소감)
// 다른 앱의 저장값(altino.tNN.*)은 읽지 않는다 — 성장기록부는 kit.record.list() 로만(10 §6).
// t03 표정·t05 신호표는 kit 공용 데이터(kit.share.get('faces'|'signals'))로만 읽는다.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let step = 1, phase = 'idle';          // idle | running | finished
  let runKind = '';                      // cell | show | grad

  // kit.stop() 이 불빛도 끈다(kit 1.1). 도트는 그대로라 화면을 벗어날 때 직접 지운다.
  // kit 보다 먼저 붙여 두면 kit 의 정지 프레임에 '꺼짐'이 함께 실린다.
  window.addEventListener('pagehide', () => { try { kit.led(0); kit.dot.clear(); } catch (e) {} });

  const kit = AltinoKit.create({
    appId: 't15',
    title: '학예회·졸업식',
    onRunEnd: endRun,
    // 혹시 onRunEnd 없이 실행이 끝난 경우의 안전망
    onTick: () => { if (!kit.running && phase === 'running') endRun(); },
  });

  // ── 값 (03 실측) ─────────────────────────────────────────────────
  const CELLS = 16;                      // 1초 칸 16개 = 공연 최대 16초
  const CELL_MS = 1000;                  // 칸 하나 = 1초 (설계원리서 P14 '1초 단위')
  const NOTE_MS = 600;                   // 칸 안에서 소리는 0.6초 — 같은 음이 이어져도 끊겨 들린다
  const LED_ON = 15;                     // 실측된 값은 15(전방등)뿐 (03 §6)
  const MOVES = {
    S: { icon: '⏸', name: '멈춤' },
    F: { icon: '⬆', name: '앞으로' },
    B: { icon: '⬇', name: '뒤로' },
    L: { icon: '↰', name: '왼쪽' },
    R: { icon: '↱', name: '오른쪽' },
  };
  const SPEEDS = { 0: { name: '보통', v: 300 }, 1: { name: '빠르게', v: 400 } };   // 300 순항 · 330~450 게임 (03 §1)
  const NOTES = [[0, '쉼'], [37, '도'], [39, '레'], [41, '미'], [42, '파'], [44, '솔'], [46, '라'], [48, '시'], [49, '높은도']];
  const noteName = (c) => (NOTES.find(n => n[0] === c) || [0, '쉼'])[1];
  // 도트 미리보기용 그림 — kit.dot.icon 과 같은 모양(바이트=행, 비트7=왼쪽)
  const ICON = {
    heart: [0x00, 0x66, 0xFF, 0xFF, 0x7E, 0x3C, 0x18, 0x00],
    smile: [0x3C, 0x42, 0xA5, 0x81, 0xA5, 0x99, 0x42, 0x3C],
    ok:    [0x00, 0x03, 0x06, 0x0C, 0xD8, 0x70, 0x20, 0x00],
    ask:   [0x3C, 0x42, 0x02, 0x0C, 0x10, 0x10, 0x00, 0x10],
  };
  const BASE_DOTS = [['none', '없음'], ['heart', '♥'], ['smile', '☺'], ['ok', '✓'], ['ask', '?'], ['num', '칸 번호'], ['p0', '그림1'], ['p1', '그림2'], ['p2', '그림3']];

  // ── t03 표정 · t05 신호표 (kit 공용 데이터, 읽기만) ─────────────────
  const okRows = (b) => Array.isArray(b) && b.length === 8 && b.every(v => Number.isInteger(v) && v >= 0 && v <= 255);
  const FACE_IDS = ['praise', 'pencil', 'noise', 'fall'];
  const FACE_ICON = { praise: '🖼', pencil: '✏', noise: '💥', fall: '🩹' };
  const faces = {};                      // id → { feel, bytes }
  (function () {
    const f = kit.share.get('faces', {});
    if (f && typeof f === 'object') FACE_IDS.forEach(id => { const x = f[id]; if (x && okRows(x.bytes)) faces[id] = { feel: String(x.feel || '').slice(0, 6), bytes: x.bytes.slice() }; });
  })();
  const DOTS = BASE_DOTS.concat(FACE_IDS.filter(id => faces[id]).map(id => ['f' + id, FACE_ICON[id] + (faces[id].feel || '표정')]));
  const SIG_UNIT = 300;                  // t05 와 같은 길이: 짧게 1 · 길게 3 · 사이 1
  const SIG_HORN = 42;                   // t05 경적 = 파
  const SIG_EL = { ls: '💡·', ll: '💡—', hs: '📣·', hl: '📣—' };
  const signals = {};                    // 뜻 → ['ls', …]
  (function () {
    const g = kit.share.get('signals', {});
    if (g && typeof g === 'object') ['안녕', '고마워', '조심해', '따라와'].forEach(m => {
      const a = Array.isArray(g[m]) ? g[m].filter(e => SIG_EL[e]).slice(0, 6) : [];
      if (a.length) signals[m] = a;
    });
  })();
  // 신호를 시간표로: [{ at, dur, kind: 'l'|'h' }], 전체 길이
  function sigPlan(name) {
    const a = signals[name] || []; let t = 0; const seg = [];
    a.forEach(e => { const d = (e[1] === 'l' ? 3 : 1) * SIG_UNIT; seg.push({ at: t, dur: d, kind: e[0] }); t += d + SIG_UNIT; });
    return { seg, len: t };
  }
  const sigHas = (name, kind) => (signals[name] || []).some(e => e[0] === kind);
  const DEF_PICS = [
    [0x0C, 0x0A, 0x09, 0x08, 0x08, 0x78, 0xF8, 0x70],   // ♪ 음표
    [0x18, 0x18, 0xFF, 0x7E, 0x3C, 0x7E, 0x66, 0xC3],   // ★ 별
    [0, 0, 0, 0, 0, 0, 0, 0],                           // 빈 그림(직접 그리기)
  ];
  const blank = () => ({ m: 'S', f: 0, n: 0, l: 0, d: 'none', s: '' });
  const SAMPLE = [
    { m: 'F', f: 0, n: 37, l: 1, d: 'smile' }, { m: 'F', f: 0, n: 41, l: 1, d: 'smile' },
    { m: 'R', f: 0, n: 44, l: 0, d: 'heart' }, { m: 'L', f: 0, n: 44, l: 0, d: 'heart' },
    { m: 'S', f: 0, n: 46, l: 1, d: 'p0' },    { m: 'S', f: 0, n: 44, l: 0, d: 'p0' },
    { m: 'B', f: 0, n: 41, l: 1, d: 'p1' },    { m: 'S', f: 0, n: 49, l: 1, d: 'ok' },
  ];

  // ── 저장값 읽기 (망가진 값 방어) ──────────────────────────────────
  function cleanCell(c) {
    const b = blank(); if (!c || typeof c !== 'object') return b;
    if (MOVES[c.m]) b.m = c.m;
    b.f = c.f ? 1 : 0;
    if (NOTES.some(n => n[0] === c.n)) b.n = c.n;
    b.l = c.l ? 1 : 0;
    if (DOTS.some(d => d[0] === c.d)) b.d = c.d;
    if (typeof c.s === 'string' && signals[c.s]) b.s = c.s;
    return b;
  }
  function cleanCells(a) { a = Array.isArray(a) ? a : []; return Array.from({ length: CELLS }, (_, i) => cleanCell(a[i])); }
  function cleanPics(a) { a = Array.isArray(a) ? a : []; return [0, 1, 2].map(i => Array.isArray(a[i]) && a[i].length === 8 ? a[i].map(v => (v | 0) & 0xFF) : DEF_PICS[i].slice()); }
  let cells = cleanCells(kit.store.get('cells', []));
  let pics = cleanPics(kit.store.get('pics', null));
  let showName = String(kit.store.get('name', '') || '').slice(0, 16);
  let sel = kit.store.num('sel', 0, 0, CELLS - 1);
  let fb = String(kit.store.get('fb', '') || '').slice(0, 40);
  let fbDone = !!kit.store.get('fbDone', false);
  let runs = kit.store.num('runs', 0, 0, 999);
  let pic = 0;                           // 그리는 그림 번호
  let now = -1;                          // 실행 중인 칸
  let lastDone = false;                  // 방금 공연을 끝까지 했나(시계 표시)
  const isEmpty = (c) => c.m === 'S' && !c.n && !c.l && c.d === 'none' && !c.s;
  const showLen = () => { for (let i = CELLS - 1; i >= 0; i--) if (!isEmpty(cells[i])) return i + 1; return 0; };
  const saveCells = () => { kit.store.set('cells', cells); };

  // ── 도트 미리보기 ────────────────────────────────────────────────
  function rowsOf(c, i) {
    if (c.d === 'none') return null;
    if (c.d === 'num') return 'num';
    if (c.d[0] === 'p') return pics[+c.d[1]];
    if (c.d[0] === 'f') return faces[c.d.slice(1)] ? faces[c.d.slice(1)].bytes : null;
    return ICON[c.d];
  }
  function paint(cv, rows, label) {
    const g = cv.getContext('2d'), W = cv.width, s = W / 8;
    g.clearRect(0, 0, W, W); g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, W, W);
    if (rows === 'num') { g.fillStyle = '#ff5a5a'; g.font = `bold ${W * 0.55}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, W / 2, W / 2 + 1); return; }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const on = rows && (rows[y] >> (7 - x)) & 1;
      g.fillStyle = on ? '#ff5a5a' : '#4a4442';
      g.beginPath(); g.arc(x * s + s / 2, y * s + s / 2, s * 0.36, 0, Math.PI * 2); g.fill();
    }
  }
  function showDot(c, i) {          // 로봇 도트에 그리기
    const r = rowsOf(c, i);
    if (!r) kit.dot.clear();
    else if (r === 'num') kit.dot.number(i + 1);
    else kit.dot.bytes(r);
  }

  // ── 단계 ─────────────────────────────────────────────────────────
  step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n); phase = 'idle';
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    [1, 2, 3].forEach(k => $('s' + k).classList.toggle('hidden', k !== n));
    if (n === 3) renderRecord();
    render();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── 스토리보드 ───────────────────────────────────────────────────
  function buildBoard(el, small) {
    el.innerHTML = '';
    for (let i = 0; i < CELLS; i++) {
      const b = document.createElement('button'); b.className = 'cell'; b.dataset.i = i;
      b.innerHTML = `<i>${i + 1}초</i><span class="mv"></span><span class="nt"></span><span class="lt"></span><canvas width="64" height="64"></canvas>`;
      if (!small) b.onclick = () => { if (phase === 'running') return; sel = i; kit.store.set('sel', sel); render(); };
      el.appendChild(b);
    }
  }
  buildBoard($('board1'), false); buildBoard($('board2'), true);
  function renderBoard(el, withSel) {
    const len = showLen();
    [...el.children].forEach((b, i) => {
      const c = cells[i];
      b.querySelector('.mv').textContent = MOVES[c.m].icon + (c.m !== 'S' && c.f ? '⚡' : '');
      b.querySelector('.nt').textContent = c.n ? '♪' + noteName(c.n) : '';
      b.querySelector('.lt').textContent = (c.l ? '💡' : '') + (c.s ? '🚦' + c.s : '');
      paint(b.querySelector('canvas'), rowsOf(c, i), String(i + 1));
      b.classList.toggle('filled', !isEmpty(c));
      b.classList.toggle('after', i >= len && !(withSel && i === sel));
      b.classList.toggle('sel', !!withSel && i === sel && phase !== 'running');
      b.classList.toggle('now', i === now);
    });
  }

  // ── 칸 고치기 ────────────────────────────────────────────────────
  function chip(parent, html, on, fn) {
    const b = document.createElement('button'); b.innerHTML = html; b.classList.toggle('on', on);
    b.onclick = () => { if (phase === 'running') return; fn(); saveCells(); render(); };
    parent.appendChild(b); return b;
  }
  function renderEditor() {
    const c = cells[sel];
    $('edTitle').innerHTML = `<span>${sel + 1}번 칸</span> · ${sel + 1}초째`;
    $('cMove').innerHTML = ''; Object.entries(MOVES).forEach(([k, m]) => chip($('cMove'), `<span class="big">${m.icon}</span>${m.name}`, c.m === k, () => { c.m = k; }));
    $('cSpeed').innerHTML = ''; Object.entries(SPEEDS).forEach(([k, s]) => chip($('cSpeed'), `${s.name} <small>${s.v}</small>`, c.f === +k, () => { c.f = +k; }));
    $('cNote').innerHTML = ''; NOTES.forEach(([code, nm]) => chip($('cNote'), nm, c.n === code, () => { c.n = code; if (code) kit.beep(code, 400); }));
    $('cLight').innerHTML = ''; [[0, '끔'], [1, '💡 켬']].forEach(([v, nm]) => chip($('cLight'), nm, c.l === v, () => { c.l = v; }));
    $('cDot').innerHTML = '';
    DOTS.forEach(([k, nm]) => {
      const b = chip($('cDot'), k === 'none' || k === 'num' ? nm : `<canvas width="48" height="48"></canvas>${nm.length > 1 ? nm : ''}`, c.d === k, () => { c.d = k; });
      const cv = b.querySelector('canvas'); if (cv) paint(cv, k[0] === 'p' ? pics[+k[1]] : k[0] === 'f' ? faces[k.slice(1)].bytes : ICON[k], '');
    });
    $('cSig').innerHTML = '';
    const names = Object.keys(signals);
    if (!names.length) $('cSig').innerHTML = '<span class="lead">t05 비밀 신호 보내기에서 만든 신호를 여기서 쓸 수 있어요</span>';
    else [['', '없음']].concat(names.map(m => [m, m])).forEach(([k, nm]) => chip($('cSig'), k ? `${nm}<small>${signals[k].map(e => SIG_EL[e]).join('')}</small>` : nm, c.s === k, () => { c.s = k; }));
    $('cSpeed').style.opacity = c.m === 'S' ? 0.45 : 1;
  }
  $('copyPrev').onclick = () => { if (phase === 'running' || sel === 0) return; cells[sel] = Object.assign({}, cells[sel - 1]); saveCells(); render(); };
  $('clearCell').onclick = () => { if (phase === 'running') return; cells[sel] = blank(); saveCells(); render(); };
  $('showName').value = showName;
  $('showName').addEventListener('input', () => { showName = $('showName').value.trim().slice(0, 16); kit.store.set('name', showName); });

  $('sample').onclick = async () => {
    if (phase === 'running') return;
    if (showLen() && !await kit.confirm({ title: '예시 공연으로 바꿀까요?', lines: ['지금 칸들이 예시로 바뀌어요.', '먼저 💾 작품 저장을 해 두면 다시 불러올 수 있어요.'], okText: '네, 바꾸기' })) return;
    cells = cleanCells(SAMPLE); if (!showName) { showName = '반짝반짝 알티노'; $('showName').value = showName; kit.store.set('name', showName); }
    sel = 0; saveCells(); $('say1').textContent = '예시 공연이에요. 칸을 눌러 마음대로 바꿔 보세요.'; render();
  };

  // 저장·불러오기 — 고쳐 보다가 저장한 작품으로 돌아갈 수 있게
  $('saveShow').onclick = () => {
    if (phase === 'running') return;
    if (!showLen()) { kit.toast('칸을 먼저 채워요'); return; }
    kit.store.set('saved', { cells, pics, name: showName, at: Date.now() });
    kit.signal('notice'); $('say1').textContent = `💾 저장했어요! (${showLen()}초짜리 공연)`; render();
  };
  $('loadShow').onclick = async () => {
    if (phase === 'running') return;
    const s = kit.store.get('saved', null);
    if (!s || !Array.isArray(s.cells)) { kit.toast('아직 저장한 작품이 없어요'); return; }
    if (!await kit.confirm({ title: '저장한 작품을 불러올까요?', lines: ['지금 고친 칸들은 저장한 작품으로 바뀌어요.'], okText: '불러오기' })) return;
    cells = cleanCells(s.cells); pics = cleanPics(s.pics); showName = String(s.name || '').slice(0, 16);
    $('showName').value = showName; kit.store.set('name', showName); kit.store.set('pics', pics); saveCells();
    $('say1').textContent = '📂 저장한 작품을 불러왔어요.'; render();
  };
  $('resetAll').onclick = async () => {
    if (phase === 'running') return;
    if (!await kit.confirm({ title: '처음부터 할까요?', lines: ['공연 칸·그림·저장한 작품·피드백·졸업장이 모두 지워져요.', '성장기록부는 지워지지 않아요.'], okText: '네, 처음부터', danger: true })) return;
    ['cells', 'pics', 'name', 'sel', 'saved', 'fb', 'fbDone', 'runs', 'best', 'grad', 'speech'].forEach(k => kit.store.remove(k));
    cells = cleanCells([]); pics = cleanPics(null); showName = ''; sel = 0; fb = ''; fbDone = false; runs = 0;
    $('showName').value = ''; $('fbText').value = ''; $('speech').value = ''; $('stars2').textContent = '';
    kit.led(0); kit.dot.clear(); $('say1').textContent = '처음부터 시작해요. 칸을 하나 골라 보세요.'; render();
  };

  // ── 그림 그리기 ──────────────────────────────────────────────────
  $('paintBtn').onclick = () => { if (phase === 'running') return; $('editor').classList.add('hidden'); $('painter').classList.remove('hidden'); renderPainter(); };
  $('paintBack').onclick = () => { $('painter').classList.add('hidden'); $('editor').classList.remove('hidden'); render(); };
  for (let i = 0; i < 64; i++) {
    const b = document.createElement('button');
    b.onclick = () => { const y = i >> 3, x = i & 7; pics[pic][y] ^= (1 << (7 - x)); kit.store.set('pics', pics); renderPainter(); };
    $('paint').appendChild(b);
  }
  function renderPainter() {
    $('ptabs').innerHTML = '';
    [0, 1, 2].forEach(k => { const b = document.createElement('button'); b.textContent = '그림' + (k + 1); b.classList.toggle('on', k === pic); b.onclick = () => { pic = k; renderPainter(); }; $('ptabs').appendChild(b); });
    [...$('paint').children].forEach((b, i) => b.classList.toggle('on', !!((pics[pic][i >> 3] >> (7 - (i & 7))) & 1)));
  }
  $('paintClear').onclick = () => { pics[pic] = [0, 0, 0, 0, 0, 0, 0, 0]; kit.store.set('pics', pics); renderPainter(); };
  $('paintShow').onclick = () => { kit.dot.bytes(pics[pic]); kit.toast('알티노 얼굴에 그림' + (pic + 1) + '을 보여 줘요'); };

  // ── 실행: 칸마다 1초 ─────────────────────────────────────────────
  function play(from, to, kind) {
    const ok = kit.run(async (r) => {
      phase = 'running'; runKind = kind; now = -1; lastDone = false; render();
      kit.signal('start'); say('준비…');
      if (!await r.sleep(1000)) return;                  // 손을 로봇에서 뗄 시간 (05 §7)
      // 신호(t05)는 그 칸에서 시작해 다음 칸까지 이어질 수 있다. 신호가 도는 동안은
      // 신호가 불빛·소리를 맡는다(칸의 💡·음은 쉼). 움직임·표정은 칸대로.
      let sig = null;                    // { plan, t0, horn: 마지막으로 울린 경적 칸 }
      const sigTick = (ledAfter) => {
        if (!sig) return;
        const t = performance.now() - sig.t0;
        if (t >= sig.plan.len) { sig = null; kit.led(ledAfter); return; }
        const k = sig.plan.seg.findIndex(g => t >= g.at && t < g.at + g.dur), g = sig.plan.seg[k];
        kit.led(g && g.kind === 'l' ? LED_ON : 0);
        if (g && g.kind === 'h' && sig.horn !== k) { sig.horn = k; kit.beep(SIG_HORN, g.at + g.dur - t); }
      };
      for (let i = from; i < to; i++) {
        const c = cells[i]; now = i; render();
        if (c.s) sig = { plan: sigPlan(c.s), t0: performance.now(), horn: -1 };
        say(`${i + 1}초: ${MOVES[c.m].name}${c.n ? ' · ' + noteName(c.n) : ''}${c.l ? ' · 💡' : ''}${c.s ? ' · 🚦' + c.s : ''}`);
        showDot(c, i);
        const sigOn = () => sig && performance.now() - sig.t0 < sig.plan.len;
        if (!sigOn()) { kit.led(c.l ? LED_ON : 0); if (c.n) kit.beep(c.n, NOTE_MS); }
        const sp = SPEEDS[c.f].v;
        const mv = c.m === 'F' ? [sp, 0] : c.m === 'B' ? [-sp, 0] : c.m === 'L' ? [sp, -127] : c.m === 'R' ? [sp, 127] : [0, 0];
        const t0 = performance.now();
        while (performance.now() - t0 < CELL_MS) {
          r.drive(mv[0], mv[1]);
          sigTick(c.l ? LED_ON : 0);
          if (!await r.sleep(50)) return;
        }
      }
      // 마지막 칸이 끝나도 신호가 남았으면 제자리에서 끝까지 보낸다
      r.drive(0, 0);
      while (sig) { sigTick(0); if (!await r.sleep(50)) return; }
      r.drive(0, 0); kit.led(0);
      phase = 'finished';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  }
  const say = (s) => { $(step === 1 ? 'say1' : 'say2').textContent = s; };
  $('tryCell').onclick = () => play(sel, sel + 1, 'cell');
  $('playBtn').onclick = () => {
    const len = showLen();
    if (!len) { kit.toast('① 공연 만들기에서 칸을 먼저 채워요'); return; }
    play(0, len, 'show');
  };
  ['stopBtn1', 'stopBtn2', 'stopBtn3'].forEach(id => { $(id).onclick = () => { kit.stop(); endRun(); }; });
  $('editBtn').onclick = () => showStep(1);

  function endRun() {
    kit.led(0);                         // 끝까지 간 공연도 불을 끄고 마친다
    const kind = runKind; now = -1; runKind = '';
    if (phase === 'finished') { phase = 'idle'; afterRun(kind); return; }
    if (phase === 'running') { phase = 'idle'; kit.dot.clear(); say(kind === 'grad' ? '멈췄어요.' : '멈췄어요. 제자리에 놓고 다시 해 봐요.'); }
    render();
  }

  // ── 별 기준 (② 공연) ─────────────────────────────────────────────
  function used() {
    const len = showLen(), a = cells.slice(0, len);
    return { move: a.some(c => c.m !== 'S'), sound: a.some(c => c.n || (c.s && sigHas(c.s, 'h'))), light: a.some(c => c.l || (c.s && sigHas(c.s, 'l'))), dot: a.some(c => c.d !== 'none') };
  }
  function checks() {
    const u = used(), all4 = u.move && u.sound && u.light && u.dot;
    return [
      { ok: runs > 0, t: '⭐ 공연을 끝까지 했어요' },
      { ok: all4, t: '⭐ 4가지 모두 넣기 — ' + [['움직임', u.move], ['소리', u.sound], ['빛', u.light], ['표정', u.dot]].map(([n, v]) => n + (v ? '✔' : '…')).join(' ') },
      { ok: fbDone && !!fb, t: '⭐ 친구 피드백 1가지를 반영했어요' },
    ];
  }
  function afterRun(kind) {
    if (kind === 'cell') { kit.dot.clear(); say(`${sel + 1}번 칸 끝! 마음에 들면 다음 칸으로.`); render(); return; }
    if (kind === 'grad') { renderCert(); render(); return; }
    runs++; kit.store.set('runs', runs); lastDone = true;
    const u = used(), all4 = u.move && u.sound && u.light && u.dot;
    const stars = 1 + (all4 ? 1 : 0) + (all4 && fbDone && fb ? 1 : 0);
    kit.signal('success');
    $('stars2').textContent = '⭐'.repeat(stars);
    say(stars === 3 ? '멋진 공연! 피드백까지 반영했어요. 🎉' : stars === 2 ? '4가지를 모두 넣은 공연! 이제 친구 피드백을 반영해 봐요.' : '공연 끝! 움직임·소리·빛·표정을 모두 넣어 볼까요?');
    const best = kit.store.num('best', 0, 0, 3);
    if (stars > best) {
      kit.store.set('best', stars);
      const ch = [u.move && '움직임', u.sound && '소리', u.light && '빛', u.dot && '표정'].filter(Boolean).join('·');
      kit.record.add({ title: '학예회 공연을 완성했어요', detail: `〈${showName || '이름 없는 공연'}〉 · ${showLen()}초 · ${ch}${fbDone && fb ? ' · 피드백 반영' : ''}`, stars });
    }
    render();
  }

  // 친구 피드백 1가지
  $('fbText').value = fb;
  $('fbText').addEventListener('input', () => { fb = $('fbText').value.trim().slice(0, 40); kit.store.set('fb', fb); if (!fb && fbDone) { fbDone = false; kit.store.set('fbDone', false); } render(); });
  $('fbDone').onclick = () => {
    if (!fb) { kit.toast('피드백을 먼저 적어요'); return; }
    fbDone = !fbDone; kit.store.set('fbDone', fbDone);
    if (fbDone) { kit.signal('notice'); say('반영했어요! 고친 공연을 처음부터 다시 해 봐요.'); }
    render();
  };

  // ── ③ 졸업식 ─────────────────────────────────────────────────────
  const APPS = (window.ALTINO_APPS || []).filter(a => /^t\d\d$/.test(a.id));
  const GRAD_TITLE = '로봇학교를 졸업했어요';
  function bestOf(id) {
    // t15 줄에는 학예회 공연 기록을 보여 준다(졸업 기록은 졸업장 쪽에)
    const list = kit.record.list().filter(x => x && x.app === id && !(id === 't15' && x.title === GRAD_TITLE));
    if (!list.length) return null;
    return list.slice().sort((a, b) => (b.stars - a.stars) || (b.at - a.at))[0];
  }
  function learned() { return APPS.filter(a => bestOf(a.id)).length; }
  function renderRecord() {
    $('rec').innerHTML = '';
    APPS.forEach(a => {
      const r = bestOf(a.id), d = document.createElement('div');
      d.className = r ? 'has' : 'none'; d.dataset.app = a.id;
      d.innerHTML = `<em>${a.lessons}차시</em><span class="t">${a.title}${r ? ' — <b></b>' : ' — 아직 기록이 없어요'}</span><span>${r ? '⭐'.repeat(r.stars) || '✔' : ''}</span>`;
      if (r) d.querySelector('b').textContent = r.title;       // 기록 글은 글자로만 넣는다
      $('rec').appendChild(d);
    });
    const n = learned();
    $('recCount').textContent = `${n} / ${APPS.length}`;
    $('recLead').textContent = n ? '처음부터 되짚어 봐요. 이 모든 걸 우리가 가르쳤어요!' : '이 태블릿에는 아직 앱 기록이 없어요. 종이 성장기록부를 함께 넘겨 봐요.';
    renderCert();
  }
  let replayTimer = 0;
  $('replay').onclick = () => {
    clearInterval(replayTimer);
    const rows = [...$('rec').children]; let i = 0;
    replayTimer = setInterval(() => {
      rows.forEach(r => r.classList.remove('hl'));
      if (i >= rows.length || step !== 3) { clearInterval(replayTimer); return; }
      rows[i].classList.add('hl'); i++;
    }, 900);
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
  let speech = String(kit.store.get('speech', '') || '').slice(0, 40);
  $('speech').value = speech;
  $('speech').addEventListener('input', () => { speech = $('speech').value.trim().slice(0, 40); kit.store.set('speech', speech); renderCert(); });
  $('teamName').addEventListener('change', () => { kit.team.set($('teamName').value); renderCert(); });
  function renderCert() {
    const team = kit.team.get(), n = learned(), grad = !!kit.store.get('grad', false);
    $('teamRow').classList.toggle('hidden', !!team && grad);
    if (document.activeElement !== $('teamName')) $('teamName').value = team;
    $('certWho').textContent = team ? `알티노 「${team}」` : '우리 알티노';
    $('certBody').textContent = `위 로봇은 알티노 로봇학교에서 친구들에게 움직임·표정·노래·신호·감각·공부를 배우고${n ? ` (배운 것 ${n}가지)` : ''}, 학예회 공연을 멋지게 마쳤기에 이 졸업장을 줍니다.`;
    $('certLine').textContent = speech ? `“${speech}”` : '';
    $('certDate').textContent = `${today()} · 가르친 선생님: 우리 모둠 친구들`;
    $('stamp').classList.toggle('hidden', !grad);
  }
  $('gradBtn').onclick = () => {
    if (!kit.store.get('grad', false)) {
      kit.store.set('grad', true);
      kit.record.add({ title: GRAD_TITLE, detail: speech || `배운 것 ${learned()}가지`, stars: 3 });
      renderRecord();
    }
    // 졸업 축하 — 도 미 솔 높은도, 전방등 반짝 (실측 8음 · LED 15 만)
    const ok = kit.run(async (r) => {
      phase = 'running'; runKind = 'grad'; render();
      kit.dot.icon('heart');
      const tune = [37, 41, 44, 49, 44, 49];
      for (let i = 0; i < tune.length; i++) {
        kit.led(i % 2 ? 0 : LED_ON); kit.beep(tune[i], i === tune.length - 1 ? 600 : 300);
        if (!await r.sleep(i === tune.length - 1 ? 700 : 380)) return;
      }
      kit.led(0);
      phase = 'finished';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
    renderCert();
  };
  $('printBtn').onclick = () => {
    // 태블릿 앱(WebView)에서는 인쇄가 안 될 수 있다 — 선생님 PC 브라우저에서 이 화면을 열어 인쇄
    try { window.print(); } catch (e) { kit.toast('이 기기에서는 인쇄가 안 돼요. 선생님 컴퓨터에서 인쇄해요.'); }
  };

  // ── 그리기 ───────────────────────────────────────────────────────
  function render() {
    const running = phase === 'running';
    if (step === 1) {
      renderBoard($('board1'), true);
      if (!$('editor').classList.contains('hidden')) renderEditor();
      ['copyPrev', 'clearCell', 'saveShow', 'loadShow', 'resetAll', 'sample', 'paintBtn'].forEach(id => { $(id).disabled = running; });
      $('copyPrev').disabled = running || sel === 0;
      $('tryCell').classList.toggle('hidden', running); $('stopBtn1').classList.toggle('hidden', !running);
    } else if (step === 2) {
      renderBoard($('board2'), false);
      const len = showLen(), team = kit.team.get();
      $('showTitle').innerHTML = '🎭 〈<b></b>〉 <small></small>';
      $('showTitle').querySelector('b').textContent = showName || '이름 없는 공연';
      $('showTitle').querySelector('small').textContent = team ? `— ${team} 모둠` : '';
      $('clock').textContent = `${now >= 0 ? now + 1 : lastDone ? len : 0} / ${len}초`;
      const c = now >= 0 ? cells[now] : null;
      $('nowMv').textContent = c ? MOVES[c.m].icon : running ? '⏳' : '🎬';
      $('nowNt').textContent = c ? (c.n ? '♪ ' + noteName(c.n) : '쉼') + (c.l ? ' 💡' : '') : running ? '준비…' : (len ? `${len}초 공연` : '칸이 비었어요');
      paint($('nowDot'), c ? rowsOf(c, now) : null, c ? String(now + 1) : '');
      $('playBtn').classList.toggle('hidden', running); $('stopBtn2').classList.toggle('hidden', !running);
      $('editBtn').disabled = running;
      $('checks').innerHTML = checks().map(k => `<li class="${k.ok ? 'ok' : ''}">${k.ok ? '✔' : '○'} ${k.t.replace(/^⭐ /, '')}</li>`).join('');
      $('fbDone').textContent = fbDone ? '✔ 반영함' : '✅ 반영했어요';
      $('fbDone').classList.toggle('mint', fbDone); $('fbDone').classList.toggle('sun', !fbDone);
      $('fbState').textContent = fbDone ? '반영했어요! 다시 공연해서 확인해요.' : '피드백을 적고, 고친 다음 눌러요.';
      if (!running && !$('stars2').textContent) { const b = kit.store.num('best', 0, 0, 3); $('stars2').textContent = b ? '⭐'.repeat(b) : ''; }
    } else {
      $('gradBtn').classList.toggle('hidden', running); $('stopBtn3').classList.toggle('hidden', !running);
      $('gradBtn').textContent = kit.store.get('grad', false) ? '🎓 졸업 축하 한 번 더' : '🎓 졸업장 받기';
      $('printBtn').disabled = running;
    }
  }

  showStep(step);
})();
