// t04 노래 가르치기 (7–8차시) — 기획서 docs/topics/t04.md
// ① 높은 소리 낮은 소리(건반 + 귀 기울이기 놀이: 높낮이 · 차례가기/뛰어가기)
// → ② 가락 바꾸기(원곡 한 줄을 계이름 블록 악보로 가르치기 → 마지막 줄 바꾸기)
// → ③ 두 알티노의 어울림(짝 모둠과 동시에 길게 — 어울리는 짝 찾기, 메기고 받기)
// 부저는 실측된 8음만(03 §4). 3~4학년 음악 요소: 음의 높고 낮음·차례가기와 뛰어가기·음의 길고 짧음·소리의 어울림
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't04',
    title: '노래 가르치기',
    onRunEnd: () => { renderGame(); renderSheet(); },
  });

  const NOTES = [
    { n: '도', c: 37 }, { n: '레', c: 39 }, { n: '미', c: 41 }, { n: '파', c: 42 },
    { n: '솔', c: 44 }, { n: '라', c: 46 }, { n: '시', c: 48 }, { n: '높은도', c: 49 },
  ];
  const SHORT = 450, LONG = 900, GAP = 90;   // 같은 음이 이어져도 끊겨 들리게 사이를 띄운다
  // 곡: [음 번호, 길게?] — 모두 도~높은도 안. from = '마지막 줄' 시작 칸
  const SONGS = [
    { id: 'bell', name: '학교종', from: 7, n: [[4], [4], [5], [5], [4], [4], [2, 1], [4], [4], [2], [2], [1, 1]] },
    { id: 'butterfly', name: '나비야', from: 6, n: [[4], [2], [2, 1], [3], [1], [1, 1], [0], [1], [2], [3], [4], [4], [4, 1]] },
    { id: 'star', name: '작은 별', from: 7, n: [[0], [0], [4], [4], [5], [5], [4, 1], [3], [3], [2], [2], [1], [1], [0, 1]] },
  ].map(s => ({ ...s, notes: s.n.map(([i, l]) => ({ i, l: !!l })) }));
  const MAXN = 16;
  const consonant = (a, b) => { const d = Math.abs(a - b); return d !== 0 && d !== 1 && d !== 6; };   // 2도·7도 = 부딪힘

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  let holds = [];
  function showStep(n) {
    if (kit.running) kit.stop();
    holds.forEach(h => h && h.release());
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    renderGame(); renderSheet();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  const ok = (v) => Number.isInteger(v) && v >= 0 && v <= 7;
  const play1 = (i, ms) => kit.beep(NOTES[i].c, ms || SHORT);

  // ── ① 건반 + 귀 기울이기 놀이 ───────────────────────────────────
  NOTES.forEach((x, i) => {
    const b = document.createElement('button'); b.innerHTML = `<b>${x.n}</b><small>${i + 1}</small>`;
    b.style.borderBottom = `6px solid hsl(${200 - i * 22},70%,60%)`;
    b.onclick = () => { if (!kit.running) play1(i); };
    $('keys1').appendChild(b);
  });
  const MODES = [{ id: 'hl', name: '어느 쪽이 높을까?' }, { id: 'shape', name: '차례가기? 뛰어가기?' }];
  let mode = 'hl', q = null, score = 0, asked = 0, answered = true;
  const rnd = (n) => Math.floor(Math.random() * n);
  function newQ() {
    if (mode === 'hl') { let a = rnd(8), b = rnd(8); while (b === a) b = rnd(8); q = { notes: [a, b], right: a > b ? 0 : 1 }; }
    else {
      const leap = Math.random() < 0.5, k = leap ? 2 : 1, up = Math.random() < 0.5;
      const s = up ? rnd(8 - 2 * k) : 2 * k + rnd(8 - 2 * k);
      const d = up ? k : -k;
      q = { notes: [s, s + d, s + 2 * d], right: leap ? 1 : 0 };
    }
  }
  MODES.forEach(m => {
    const b = document.createElement('button'); b.textContent = m.name; b.dataset.m = m.id;
    b.onclick = () => { if (kit.running) return; mode = m.id; q = null; score = 0; asked = 0; answered = true; renderGame(); };
    $('modeChips').appendChild(b);
  });
  $('listen').onclick = () => {
    if (asked >= 5 && answered) return;
    if (answered) { newQ(); answered = false; }
    const notes = q.notes;
    const go = kit.run(async (r) => {
      for (const i of notes) { play1(i, SHORT); if (!await r.sleep(SHORT + 250)) return; }
    });
    if (go) renderGame();
  };
  $('game1Reset').onclick = () => { if (kit.running) kit.stop(); q = null; score = 0; asked = 0; answered = true; renderGame(); };
  function answer(k) {
    if (answered || !q || kit.running) return;
    answered = true; asked++;
    const right = k === q.right; if (right) score++;
    kit.signal(right ? 'success' : 'fail');
    const word = mode === 'hl' ? (q.right === 0 ? '첫 번째 소리가 더 높아요' : '두 번째 소리가 더 높아요')
      : (q.right === 1 ? '건너뛰어 갔어요(뛰어가기)' : '계단처럼 갔어요(차례가기)');
    $('qText').textContent = (right ? '맞았어요! ' : '아깝다! ') + word + ` · ${q.notes.map(i => NOTES[i].n).join('-')}`;
    renderGame();
  }
  function renderGame() {
    document.querySelectorAll('#modeChips button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    const labels = mode === 'hl' ? ['첫 번째가 높아요', '두 번째가 높아요'] : ['🪜 차례가기', '🦘 뛰어가기'];
    $('ans').innerHTML = '';
    labels.forEach((t, k) => {
      const b = document.createElement('button'); b.className = 'btn' + (k ? ' sun' : ''); b.textContent = t; b.dataset.k = k;
      b.disabled = answered || kit.running; b.onclick = () => answer(k); $('ans').appendChild(b);
    });
    const end = asked >= 5 && answered;
    $('listen').disabled = kit.running || end;
    $('listen').textContent = answered ? '▶ 들어 보기' : '▶ 다시 듣기';
    $('score1').textContent = end ? `끝! 맞힌 수 ${score} / 5 — 처음부터 다시 할 수 있어요` : `맞힌 수 ${score} / ${asked} (5문제)`;
    if (q === null) $('qText').textContent = mode === 'hl' ? '두 소리를 듣고 더 높은 쪽을 골라요.' : '세 소리가 계단처럼 갔나요, 건너뛰었나요?';
  }

  // ── ② 가락 바꾸기 ─────────────────────────────────────────────────
  let songId = kit.store.get('song', 'bell'); if (!SONGS.some(s => s.id === songId)) songId = 'bell';
  const song = () => SONGS.find(s => s.id === songId);
  let sheets = kit.store.get('sheets', {});          // { songId: [{i,l}] }
  if (!sheets || typeof sheets !== 'object' || Array.isArray(sheets)) sheets = {};
  const clean = (a) => Array.isArray(a) ? a.filter(x => x && ok(x.i)).map(x => ({ i: x.i, l: !!x.l })).slice(0, MAXN) : [];
  let sheet = clean(sheets[songId]);
  let mine = kit.store.get('mine', null);             // { song, notes } — 바꾼 가락 (t15 공연에서 쓸 후보)
  if (!mine || !SONGS.some(s => s.id === mine.song)) mine = null; else mine.notes = clean(mine.notes);
  let got = kit.store.get('got', {});                  // 별: { exact, mine, pairs }
  if (!got || typeof got !== 'object') got = {};
  let mode2 = 'teach';   // teach | change
  let marks = null;      // 맞춰 보기 결과 [true/false…]
  let longOn = false;

  SONGS.forEach(s => {
    const b = document.createElement('button'); b.textContent = s.name; b.dataset.s = s.id;
    b.onclick = () => { if (kit.running) return; songId = s.id; kit.store.set('song', s.id); sheet = clean(sheets[s.id]); mode2 = 'teach'; marks = null; renderSheet(); };
    $('songChips').appendChild(b);
  });
  [['짧게', false], ['길게 —', true]].forEach(([t, v]) => {
    const b = document.createElement('button'); b.textContent = t; b.dataset.l = v ? 1 : 0;
    b.onclick = () => { longOn = v; renderSheet(); };
    $('lenChips').appendChild(b);
  });
  NOTES.forEach((x, i) => {
    const b = document.createElement('button'); b.textContent = x.n;
    b.onclick = () => {
      if (kit.running) return;
      if (sheet.length >= MAXN) { kit.toast(`${MAXN}칸까지예요`); return; }
      sheet.push({ i, l: longOn }); play1(i, longOn ? LONG - GAP : SHORT - GAP); marks = null; saveSheet(); renderSheet();
    };
    $('palette').appendChild(b);
  });
  const lockedTo = () => (mode2 === 'change' ? song().from : 0);
  $('back').onclick = () => { if (kit.running) return; if (sheet.length > lockedTo()) { sheet.pop(); marks = null; saveSheet(); renderSheet(); } };
  $('sheetReset').onclick = async () => {
    if (kit.running) return;
    if (!await kit.confirm({ title: '악보를 처음부터 할까요?', lines: ['만든 블록이 지워져요'], okText: '네, 처음부터', danger: true })) return;
    sheet = mode2 === 'change' ? song().notes.slice(0, song().from).map(x => ({ ...x })) : [];
    marks = null; saveSheet(); renderSheet();
  };
  function saveSheet() { if (mode2 === 'teach') { sheets[songId] = sheet; kit.store.set('sheets', sheets); } }

  $('play2').onclick = () => {
    if (!sheet.length) { kit.toast('블록을 먼저 놓아요'); return; }
    const notes = sheet.slice();
    const go = kit.run(async (r) => {
      for (const x of notes) {
        const d = x.l ? LONG : SHORT;
        play1(x.i, d - GAP);
        if (!await r.sleep(d)) return;
      }
    });
    if (go) renderSheet();
  };
  $('stop2').onclick = () => { kit.stop(); renderSheet(); };   // kit.stop 은 onRunEnd 를 부르지 않는다

  $('check').onclick = () => {
    const o = song().notes;
    marks = o.map((x, k) => !!sheet[k] && sheet[k].i === x.i && sheet[k].l === x.l);
    const right = marks.filter(Boolean).length, exact = right === o.length && sheet.length === o.length;
    if (exact) {
      kit.signal('success');
      if (!got.exact) { got.exact = song().name; award(); }
    } else kit.signal('fail');
    $('checkMsg').textContent = exact ? `완벽해요! ${song().name}을(를) 가르쳤어요. 이제 마지막 줄을 바꿔 볼까요?`
      : `맞은 음 ${right} / ${o.length}` + (sheet.length > o.length ? ` · 블록이 ${sheet.length - o.length}개 더 있어요` : '') + ' — 빨간 블록을 고쳐요';
    renderSheet(true);
  };
  $('change').onclick = () => {
    mode2 = 'change'; marks = null;
    sheet = song().notes.map(x => ({ ...x }));
    $('checkMsg').textContent = '앞부분은 그대로, 마지막 줄을 지우고 새 가락을 넣어요.';
    renderSheet(true);
  };
  $('saveMine').onclick = () => {
    const o = song(), tail = sheet.slice(o.from), orig = o.notes.slice(o.from);
    if (tail.length < 2) { kit.toast('마지막 줄에 음을 두 개 이상 넣어요'); return; }
    if (JSON.stringify(tail) === JSON.stringify(orig)) { kit.toast('원곡과 같아요. 한 군데라도 바꿔 봐요'); return; }
    mine = { song: o.id, notes: sheet.slice() }; kit.store.set('mine', mine);
    kit.signal('success');
    if (!got.mine) { got.mine = true; award(); }
    $('checkMsg').textContent = '우리 가락을 저장했어요! ▶ 연주하기로 발표해요.';
    renderSheet(true);
  };

  function renderSheet(keepMsg) {
    document.querySelectorAll('#songChips button').forEach(b => b.classList.toggle('on', b.dataset.s === songId));
    document.querySelectorAll('#lenChips button').forEach(b => b.classList.toggle('on', +b.dataset.l === (longOn ? 1 : 0)));
    const o = song();
    $('ref').innerHTML = o.notes.map((x, k) => (k === o.from ? '<b> | </b>' : '') + NOTES[x.i].n + (x.l ? '—' : '')).join(' ');
    $('sheetTitle').textContent = mode2 === 'change' ? '✏ 우리 가락 — 마지막 줄을 바꿔요' : '🎼 우리가 가르친 악보';
    $('sheet').innerHTML = '';
    sheet.forEach((x, k) => {
      const d = document.createElement('div');
      d.className = 'blk' + (x.l ? ' long' : '') + (mode2 === 'change' && k < o.from ? ' lock' : '') + (marks ? (marks[k] ? ' ok' : ' wrong') : '');
      d.textContent = NOTES[x.i].n + (x.l ? ' —' : '');
      $('sheet').appendChild(d);
    });
    if (marks) for (let k = sheet.length; k < o.notes.length; k++) { const d = document.createElement('div'); d.className = 'blk wrong'; d.textContent = '?'; $('sheet').appendChild(d); }
    const run = kit.running && step === 2;
    $('play2').classList.toggle('hidden', run); $('stop2').classList.toggle('hidden', !run);
    $('check').classList.toggle('hidden', mode2 !== 'teach');
    $('change').classList.toggle('hidden', mode2 !== 'teach' || !(got.exact));
    $('saveMine').classList.toggle('hidden', mode2 !== 'change');
    if (!keepMsg && !marks && mode2 === 'teach') $('checkMsg').textContent = sheet.length ? '▶ 연주하기로 들어 보고, ✓ 원곡과 맞춰 봐요.' : '원곡을 보며 계이름 블록을 놓아요.';
    renderStars();
  }

  // ── ③ 두 알티노의 어울림 ───────────────────────────────────────────
  let ours = null, theirs = null;
  let pairs = kit.store.get('pairs', []);              // 찾은 어울리는 짝 ['0-2', …]
  if (!Array.isArray(pairs)) pairs = [];
  pairs = pairs.filter(p => typeof p === 'string' && /^[0-7]-[0-7]$/.test(p));
  NOTES.forEach((x, i) => {
    const b = document.createElement('button'); b.innerHTML = `<b>${x.n}</b>`;
    b.style.borderBottom = `6px solid hsl(${200 - i * 22},70%,60%)`;
    $('keys3').appendChild(b);
    // 누르는 동안만 길게 — 떼면 소리를 끈다(바퀴는 쓰지 않으니 kit.stop 으로 끔)
    holds.push(kit.hold(b, () => { ours = i; kit.stop(); kit.beep(x.c, 6000); renderPairs(); }, () => kit.stop()));   // 먼저 stop: 울리던 신호음이 이 소리를 끄지 않게
    const c = document.createElement('button'); c.textContent = x.n; c.dataset.i = i;
    c.onclick = () => { theirs = i; renderPairs(); };
    $('pairs').appendChild(c);
  });
  function judgePair(saidGood) {
    if (ours == null || theirs == null) { kit.toast('우리 음을 눌러 보고, 짝 모둠 음을 골라요'); return; }
    if (ours === theirs) { $('pairMsg').textContent = '같은 음이에요. 다른 음으로 해 봐요.'; return; }
    const truth = consonant(ours, theirs), key = [ours, theirs].sort().join('-');
    const pairName = `${NOTES[Math.min(ours, theirs)].n}+${NOTES[Math.max(ours, theirs)].n}`;
    if (saidGood === truth) {
      kit.signal('success');
      $('pairMsg').textContent = truth ? `${pairName} — 어울리는 짝이에요!` : `${pairName} — 맞아요, 바로 옆 음은 서로 부딪혀요.`;
      if (truth && !pairs.includes(key)) {
        pairs.push(key); kit.store.set('pairs', pairs);
        if (pairs.length >= 3 && !got.pairs) { got.pairs = true; award(); }
      }
    } else {
      kit.signal('fail');
      $('pairMsg').textContent = truth ? `${pairName} — 음악에서는 어울리는 짝으로 봐요. 다시 들어 볼까요?` : `${pairName} — 음악에서는 부딪히는 짝으로 봐요. 다시 들어 볼까요?`;
    }
    renderPairs();
  }
  $('good').onclick = () => judgePair(true);
  $('bad').onclick = () => judgePair(false);
  function renderPairs() {
    $('ourNote').textContent = ours == null ? '– (왼쪽 건반을 눌러요)' : NOTES[ours].n;
    document.querySelectorAll('#pairs button').forEach(b => b.classList.toggle('on', +b.dataset.i === theirs));
    $('found').innerHTML = pairs.length ? pairs.map(k => { const [a, b] = k.split('-').map(Number); return `<span>😊 ${NOTES[a].n}+${NOTES[b].n}</span>`; }).join('')
      : '<span style="background:none;border-style:dashed;color:var(--mut)">어울리는 짝 3개를 찾아요</span>';
    renderStars();
  }

  // ── 별(배지) — 원곡 정확히 · 바꾼 가락 · 어울리는 짝 3개 ────────────
  function award() {
    kit.store.set('got', got);
    const n = (got.exact ? 1 : 0) + (got.mine ? 1 : 0) + (got.pairs ? 1 : 0);
    const best = kit.store.num('bestStars', 0, 0, 3);
    if (n > best) {                                       // 별이 늘 때만 한 줄 (05 §7)
      kit.store.set('bestStars', n);
      const parts = [got.exact ? `${got.exact} 가르치기` : null, got.mine ? '가락 바꾸기' : null, got.pairs ? '어울리는 짝 3개' : null].filter(Boolean);
      kit.record.add({ title: '노래를 가르쳤어요', detail: parts.join(' · '), stars: n });
    }
    renderStars();
  }
  function renderStars() {
    const items = [['exact', '원곡 정확히'], ['mine', '가락 바꾸기'], ['pairs', '어울리는 짝 3개']];
    const html = items.map(([k, t]) => `<span class="${got[k] ? 'on' : ''}">${got[k] ? '⭐' : '☆'} ${t}</span>`).join('');
    $('stars2').innerHTML = html; $('stars3').innerHTML = html;
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  renderPairs();
  showStep(step);
})();
