// t08 알티노 골든벨 (15–16차시) — 기획서 docs/topics/t08.md
// 문제 진행은 교사·PPT 가 하고, 앱은 '답 잠금 → 맞혔어요(한 칸 전진) → 결승선에서 골든벨'을 맡는다.
// ① 골든벨 연습(연습 문제 5개, PPT 와 같은 문제) → ② 우리가 내는 퀴즈(만들기·크게 보기)
// → ③ 알티노 골든벨 대회(1라운드·2라운드, 결승선 통과하면 골든벨)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't08',
    title: '알티노 골든벨',
    onRunEnd: endRun,
    onTick: () => { if (moving && !kit.running) endRun(); },   // kit.stop()·화면 이탈로 끝난 실행 정리
  });

  const SPEED = 300;                 // 03 §1 순항 속도
  const OX = ['O', 'X'], PICK = ['①', '②', '③'], ALL = ['O', 'X', '①', '②', '③', '④'];
  // 연습 문제 — PPT·활동지와 같다(_작업도구/t08.py PRACTICE). 정답: O ② O ② ②
  const PRACTICE = [
    { type: 'O·X', q: '7 × 8 = 56이다.', a: 'O' },
    { type: '고르기', q: '알티노의 얼굴(도트매트릭스)은 가로 몇 칸일까요?<br>① 6칸 ② 8칸 ③ 10칸', a: '②' },
    { type: 'O·X', q: '알티노의 부저로 도부터 높은 도까지 8개의 음을 낼 수 있다.', a: 'O' },
    { type: '고르기', q: '밤에 앞을 밝게 비추는 알티노의 불빛은?<br>① 브레이크등 ② 전조등 ③ 방향지시등', a: '②' },
    { type: '고르기', q: '42 ÷ 6의 몫은?<br>① 6 ② 7 ③ 8', a: '②' },
  ];
  // 배지(활동지 4번): 정답 3개 도전 · 5개 실력 · 결승선 통과 골든벨
  const BELL = [[44, 400], [44, 400], [46, 400], [46, 400], [44, 400], [44, 400], [41, 700]];   // 학교종(솔솔라라솔솔미)

  let moving = false, after = null;   // 움직이는 중? / 움직임이 끝나면 할 일

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    renderAll();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // 한 칸 전진 (+ 결승선이면 골든벨) — 자율 동작은 kit.run 안에서만(12 S5)
  let cellMs = kit.store.num('cellMs', 1000, 600, 2000);
  function forward(bell, done) {
    const ok = kit.run(async (r) => {
      moving = true; renderAll();
      const t0 = performance.now();
      while (r.alive() && performance.now() - t0 < cellMs) {
        r.drive(SPEED, 0);
        if (!await r.sleep(50)) return;
      }
      r.drive(0, 0);
      if (bell) {
        for (const [code, ms] of BELL) { kit.beep(code, ms - 60); if (!await r.sleep(ms)) return; }
        kit.dot.icon('heart');
      }
      after = done;
    });
    if (!ok) kit.toast('알티노가 아직 움직이는 중이에요');
    return ok;
  }
  function endRun() {
    moving = false;
    const f = after; after = null;
    if (f) f();                    // 끝까지 간 경우에만 — 멈춤으로 끊기면 칸을 세지 않는다
    renderAll();
  }
  const stopAll = () => { kit.stop(); endRun(); };

  // ── ① 골든벨 연습 ────────────────────────────────────────────────
  // prac[i] = { mine:'O', locked:true, shown:true, moved:true }
  let prac = kit.store.get('prac', []); if (!Array.isArray(prac)) prac = [];
  let pi = kit.store.num('pi', 0, 0, PRACTICE.length - 1);
  const pr = () => prac[pi] || (prac[pi] = {});
  const savePrac = () => { kit.store.set('prac', prac); kit.store.set('pi', pi); };
  $('pLock').onclick = () => { const s = pr(); if (!s.mine || s.locked) return; s.locked = true; savePrac(); kit.signal('notice'); renderPrac(); };
  $('pReveal').onclick = () => {
    const s = pr(); if (!s.locked) return;
    s.shown = true; savePrac();
    const right = s.mine === PRACTICE[pi].a;
    kit.signal(right ? 'success' : 'fail');
    renderPrac();
  };
  $('pGo').onclick = () => {
    const s = pr(); if (!s.shown || s.moved || s.mine !== PRACTICE[pi].a) return;
    forward(false, () => { s.moved = true; savePrac(); });
  };
  $('pNext').onclick = () => { if (pi < PRACTICE.length - 1) { pi++; savePrac(); renderPrac(); } };
  $('pStop').onclick = stopAll;
  $('pReset').onclick = async () => {
    if (!await kit.confirm({ title: '연습을 처음부터 할까요?', lines: ['연습 기록이 모두 지워져요'], okText: '네, 처음부터', danger: true })) return;
    prac = []; pi = 0; savePrac(); renderPrac();
  };
  function renderPrac() {
    const P = PRACTICE[pi], s = pr(), right = s.mine === P.a;
    $('pNo').textContent = pi + 1; $('pType').textContent = '· ' + P.type + ' 퀴즈';
    $('pText').innerHTML = P.q;
    $('pAns').innerHTML = '';
    (P.type === 'O·X' ? OX : PICK).forEach(a => {
      const b = document.createElement('button'); b.textContent = a; b.dataset.a = a;
      b.classList.toggle('on', s.mine === a); b.disabled = !!s.locked;
      b.onclick = () => { if (s.locked) return; s.mine = a; savePrac(); renderPrac(); };
      $('pAns').appendChild(b);
    });
    $('pLock').disabled = !s.mine || !!s.locked;
    $('pLock').textContent = s.locked ? '🔒 잠금 ✓' : '🔒 답 잠금';
    $('pReveal').classList.toggle('hidden', !s.locked || !!s.shown);
    $('pFb').textContent = !s.shown ? '' : right ? `정답 ${P.a} — 맞혔어요!` : `정답은 ${P.a} — 아깝다! 다음 문제에서 다시 해 봐요.`;
    $('pFb').className = 'fb ' + (s.shown ? (right ? 'ok' : 'no') : '');
    $('pGo').classList.toggle('hidden', !(s.shown && right && !s.moved));
    $('pGo').disabled = moving;
    $('pNext').classList.toggle('hidden', !(s.shown && (s.moved || !right)) || pi >= PRACTICE.length - 1);
    // 기록표
    let h = '<tr><th>번호</th><th>우리 모둠 답</th><th>정답</th><th>맞힘(O·X)</th></tr>';
    PRACTICE.forEach((q, i) => {
      const x = prac[i] || {};
      h += `<tr><td class="${i === pi ? 'on' : ''}">${i + 1}</td><td>${x.locked ? x.mine : ''}</td><td>${x.shown ? q.a : ''}</td><td>${x.shown ? (x.mine === q.a ? 'O' : 'X') : ''}</td></tr>`;
    });
    $('pTable').innerHTML = h;
    const done = PRACTICE.filter((q, i) => prac[i] && prac[i].shown).length;
    const hit = PRACTICE.filter((q, i) => prac[i] && prac[i].shown && prac[i].mine === q.a).length;
    $('pSum').textContent = done === PRACTICE.length ? `연습 끝! 5문제 중 ${hit}문제 맞혔어요. 이제 퀴즈를 만들어 봐요.` : `답 고르기 → 🔒 잠금 → 정답 확인 → 맞혔어요`;
  }

  // ── ② 우리가 내는 퀴즈 ──────────────────────────────────────────
  // quiz = { ox:{q,a,why}, pick:{q,o:[3],a,why} }
  let quiz = kit.store.get('quiz', null);
  if (!quiz || typeof quiz !== 'object') quiz = {};
  quiz.ox = Object.assign({ q: '', a: '', why: '' }, quiz.ox);
  quiz.pick = Object.assign({ q: '', o: ['', '', ''], a: '', why: '' }, quiz.pick);
  if (!Array.isArray(quiz.pick.o) || quiz.pick.o.length !== 3) quiz.pick.o = ['', '', ''];
  let qk = 'ox', reveal = false;
  const saveQuiz = () => kit.store.set('quiz', quiz);
  document.querySelectorAll('#quizPick button').forEach(b => { b.onclick = () => { qk = b.dataset.k; reveal = false; loadQuiz(); }; });
  function loadQuiz() {
    const z = quiz[qk];
    $('qzQ').value = z.q; $('qzWhy').value = z.why;
    if (qk === 'pick') [0, 1, 2].forEach(i => { $('qzO' + (i + 1)).value = z.o[i]; });
    renderQuiz();
  }
  const bind = (id, fn) => $(id).addEventListener('input', (e) => { fn(e.target.value); reveal = false; saveQuiz(); renderQuiz(); });
  bind('qzQ', (v) => { quiz[qk].q = v; });
  bind('qzWhy', (v) => { quiz[qk].why = v; });
  [0, 1, 2].forEach(i => bind('qzO' + (i + 1), (v) => { quiz.pick.o[i] = v; }));
  $('qzShow').onclick = () => { if (!quizReady(qk)) return; reveal = !reveal; if (reveal) kit.signal('success'); renderQuiz(); };
  function quizReady(k) {
    const z = quiz[k];
    return z.q.trim() && z.a && z.why.trim() && (k === 'ox' || z.o.every(o => o.trim()));
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderQuiz() {
    const z = quiz[qk];
    document.querySelectorAll('#quizPick button').forEach(b => b.classList.toggle('on', b.dataset.k === qk));
    $('qzOpts').classList.toggle('hidden', qk !== 'pick');
    $('qzA').innerHTML = '';
    (qk === 'ox' ? OX : PICK).forEach(a => {
      const b = document.createElement('button'); b.textContent = a; b.classList.toggle('on', z.a === a);
      b.onclick = () => { z.a = a; reveal = false; saveQuiz(); renderQuiz(); };
      $('qzA').appendChild(b);
    });
    const miss = [!z.q.trim() && '문제', qk === 'pick' && !z.o.every(o => o.trim()) && '보기', !z.a && '정답', !z.why.trim() && '까닭'].filter(Boolean);
    $('qzCheck').textContent = miss.length ? `아직 비었어요: ${miss.join(', ')}` : '✓ 퀴즈 완성! 활동지 2번에 옮겨 적어요.';
    $('qzCheck').style.color = miss.length ? '' : '#1b8f6a';
    $('present').innerHTML = !z.q.trim() ? '<p class="lead">왼쪽에 문제를 쓰면 여기에 크게 보여요.</p>'
      : `<div class="pq">${esc(z.q)}</div>` + (qk === 'pick' ? `<div class="po">${z.o.map((o, i) => PICK[i] + ' ' + esc(o)).join('&nbsp;&nbsp; ')}</div>` : '<div class="po">O 일까요, X 일까요?</div>') +
        (reveal ? `<div class="po" style="color:#1b8f6a"><b>정답 ${z.a}</b><br>${esc(z.why)}</div>` : '');
    $('qzShow').disabled = !quizReady(qk);
    $('qzShow').textContent = reveal ? '정답 가리기' : '정답 공개';
  }

  // ── ③ 알티노 골든벨 대회 ────────────────────────────────────────
  // con = { finish, round:0|1|2(끝), pos, correct, n(문제 번호), mine, locked, results:[{correct,passed}|null, …] }
  let con = kit.store.get('con', null);
  if (!con || typeof con !== 'object' || !Array.isArray(con.results)) con = { round: 0, pos: 0, correct: 0, n: 1, mine: '', locked: false, results: [null, null] };
  con.finish = kit.store.num('finish', 7, 3, 10);
  const saveCon = () => kit.store.set('con', con);
  const passed = () => con.pos >= con.finish;

  $('finMinus').onclick = () => setFinish(con.finish - 1);
  $('finPlus').onclick = () => setFinish(con.finish + 1);
  function setFinish(v) {
    if (con.pos > 0 || con.correct > 0) { kit.toast('라운드 중에는 결승선을 못 바꿔요'); return; }
    con.finish = Math.max(3, Math.min(10, v)); kit.store.set('finish', con.finish); renderCon();
  }
  $('cellMinus').onclick = () => setCell(cellMs - 100);
  $('cellPlus').onclick = () => setCell(cellMs + 100);
  function setCell(v) { cellMs = Math.max(600, Math.min(2000, v)); kit.store.set('cellMs', cellMs); renderCon(); }

  $('cLock').onclick = () => { if (!con.mine || con.locked || moving) return; con.locked = true; saveCon(); kit.signal('notice'); renderCon(); };
  const nextQ = () => { con.n++; con.mine = ''; con.locked = false; saveCon(); };
  $('cOk').onclick = () => {
    if (!con.locked || moving || con.round > 1 || passed()) return;
    const willPass = con.pos + 1 >= con.finish;
    forward(willPass, () => {
      con.correct++; con.pos++; nextQ();
      if (passed()) finishRound(true); else kit.signal('success');
    });
  };
  $('cNo2').onclick = () => {
    if (!con.locked || moving) return;
    kit.signal('fail'); $('cMsg').textContent = '아깝다! 제자리예요. 다음 문제를 잘 들어요.';
    nextQ(); renderCon();
  };
  $('cHost').onclick = () => {
    if (moving || con.locked) return;
    kit.toast('🎤 우리 모둠은 사회자! 또박또박 문제를 읽어요'); nextQ(); renderCon();
  };
  $('cStop').onclick = stopAll;
  $('cEnd').onclick = async () => {
    if (con.round > 1) return;
    if (!await kit.confirm({ title: `${con.round + 1}라운드를 끝낼까요?`, lines: [`맞힌 문제 ${con.correct}개를 기록해요`], okText: '네, 끝내기' })) return;
    finishRound(false);
  };
  $('cReset').onclick = async () => {
    if (!await kit.confirm({ title: '대회를 처음부터 할까요?', lines: ['1라운드·2라운드 기록이 지워져요', '알티노를 출발선에 다시 놓아요'], okText: '네, 처음부터', danger: true })) return;
    stopAll();
    con = { finish: con.finish, round: 0, pos: 0, correct: 0, n: 1, mine: '', locked: false, results: [null, null] }; saveCon();
    $('cResult').classList.add('hidden'); renderCon();
  };
  function finishRound(byBell) {
    const ri = con.round; if (ri > 1) return;
    con.results[ri] = { correct: con.correct, passed: passed() };
    const stars = passed() ? 3 : con.correct >= 5 ? 2 : con.correct >= 3 ? 1 : 0;
    const name = ['', '도전', '실력', '골든벨'][stars];
    const best = kit.store.num('bestStars', 0, 0, 3);
    if (stars > best) {              // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
      kit.store.set('bestStars', stars);
      kit.record.add({ title: passed() ? '골든벨을 울렸어요' : '골든벨 대회 참가', detail: `${ri + 1}라운드 정답 ${con.correct}개 · ${name} 배지`, stars });
    }
    $('cResult').innerHTML = byBell ? `<span class="m">🔔</span><b>골든벨!</b> 결승선 통과 · 정답 ${con.correct}개`
      : `<span class="m">${stars ? '🏅' : '💪'}</span>${ri + 1}라운드 정답 <b>${con.correct}개</b>` + (name ? ` · ${name} 배지` : '<br>전략을 세우고 다시 도전해요!');
    $('cResult').classList.remove('hidden');
    if (!byBell) kit.signal('notice');
    con.round = ri + 1; con.pos = 0; con.correct = 0; con.n = 1; con.mine = ''; con.locked = false; saveCon();
    renderCon();
  }
  function renderCon() {
    const ri = con.round;
    $('cRound').textContent = ri > 1 ? '대회 끝' : `${ri + 1}라운드`;
    $('lane').innerHTML = '';
    for (let i = 1; i <= con.finish; i++) {
      const d = document.createElement('div');
      d.className = (i <= con.pos ? 'done ' : '') + (i === con.finish ? 'goal' : '');
      d.textContent = i === con.pos ? '🚗' : i === con.finish ? '🔔' : '';
      $('lane').appendChild(d);
    }
    $('finVal').textContent = con.finish; $('cellVal').textContent = (cellMs / 1000).toFixed(1);
    $('cr1').textContent = con.results[0] ? `${con.results[0].correct}개 · ${con.results[0].passed ? 'O' : 'X'}` : '–';
    $('cr2').textContent = con.results[1] ? `${con.results[1].correct}개 · ${con.results[1].passed ? 'O' : 'X'}` : '–';
    $('cNo').textContent = con.n;
    const over = ri > 1;
    $('cAns').innerHTML = '';
    ALL.forEach(a => {
      const b = document.createElement('button'); b.textContent = a; b.classList.toggle('on', con.mine === a);
      b.disabled = con.locked || over;
      b.onclick = () => { if (con.locked) return; con.mine = a; saveCon(); renderCon(); };
      $('cAns').appendChild(b);
    });
    $('cLock').disabled = !con.mine || con.locked || over || moving;
    $('cLock').textContent = con.locked ? '🔒 잠금 ✓' : '🔒 답 잠금';
    $('cOk').disabled = $('cNo2').disabled = !con.locked || moving || over;
    $('cHost').disabled = con.locked || moving || over;
    $('cEnd').disabled = over;
    if (moving) $('cMsg').textContent = '🚗 한 칸 전진!';
    else if (con.locked) $('cMsg').textContent = `우리 답 ${con.mine} 🔒 — 정답이 공개되면 눌러요.`;
    else if (over) $('cMsg').textContent = '대회 끝! 활동지 3번에 기록을 적어요.';
    else if (!/아깝다/.test($('cMsg').textContent)) $('cMsg').textContent = '선생님 문제나 모둠 퀴즈를 잘 들어요.';
  }

  function renderAll() { renderPrac(); renderQuiz(); renderCon(); }

  // ── 시작 ─────────────────────────────────────────────────────────
  loadQuiz();
  showStep(step);
})();
