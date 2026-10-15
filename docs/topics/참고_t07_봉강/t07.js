// t07 수학 시험 보는 날 (13–14차시) — 기획서 docs/topics/t07.md
// ① 도트 문제 읽기(알티노 도트에 숫자→기호→숫자→? 가 차례로 뜨고, 태블릿에 답 쓰기)
// → ② 연산 레이스(맞힐 때마다 한 칸 전진, 10칸 또는 3분) → ③ 결과 보기(별·성장기록부)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const P = window.AltinoProblems;

  const kit = AltinoKit.create({
    appId: 't07',
    title: '수학 시험 보는 날',
    onRunEnd: endRun,
    // kit.stop()(멈춰·화면 이탈·창) 뒤에는 onRunEnd 가 오지 않는다 → 화면 상태를 여기서 되돌린다
    onTick: () => { if (!kit.running && (playing || race === 'ready' || race === 'racing')) endRun(); },
  });

  // ── 정해 둔 값 ──────────────────────────────────────────────────
  const STEP_SPEED = 300;      // 순항 속도 (03 §1)
  const STEP_MS = 800;         // 한 칸 = 속도 300 으로 0.8초. 길이는 실기에서 재서 활동지에 적는다(기획서 §10)
  const GOAL = 10;             // 10칸이면 결승
  const RACE_MS = 180000;      // 3분
  const GRADES = ['e3', 'e4'];
  const starsOf = (m) => (m >= 8 ? 3 : m >= 5 ? 2 : m >= 1 ? 1 : 0);

  // 도트 기호 (바이트 = 행, 비트7 = 맨 왼쪽)
  const OPS = {
    '+': [0x00, 0x18, 0x18, 0x7E, 0x7E, 0x18, 0x18, 0x00],
    '−': [0x00, 0x00, 0x00, 0x7E, 0x7E, 0x00, 0x00, 0x00],
    '×': [0x00, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x00],
    '÷': [0x00, 0x18, 0x00, 0x7E, 0x7E, 0x00, 0x18, 0x00],
  };
  const OP_LABEL = { '+': '더하기', '−': '빼기', '×': '곱하기', '÷': '나누기' };

  // ── 단계 ─────────────────────────────────────────────────────────
  let playing = false, race = 'idle';
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    if (n === 3) renderResult();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });
  const onEnter = (input, fn) => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(); });
  const readAns = (input) => { const v = input.value.trim(); return v === '' ? null : Math.round(+v); };

  // ── ① 도트 문제 읽기 ─────────────────────────────────────────────
  // 숫자는 도트에 뜨는 0~99 만. 3학년 1학기 범위의 쉬운 수, 답은 언제나 0 이상 정수.
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function makeDotProblem(op) {
    let a, b, ans;
    if (op === '+') { a = rnd(10, 49); b = rnd(10, 49); ans = a + b; }
    else if (op === '−') { a = rnd(20, 99); b = rnd(10, a); ans = a - b; }
    else if (op === '×') { a = rnd(11, 33); b = rnd(2, 3); ans = a * b; }
    else { b = rnd(2, 9); ans = rnd(2, 9); a = b * ans; }
    return { a, b, op, ans };
  }
  let op1 = kit.store.get('op1', '+'); if (!OPS[op1]) op1 = '+';
  let prob1 = null, tries1 = 0, solved1 = false;
  let n1 = kit.store.num('n1', 0, 0, 999);
  $('n1').textContent = n1;

  Object.keys(OPS).forEach(op => {
    const b = document.createElement('button');
    b.dataset.op = op; b.textContent = op + ' ' + OP_LABEL[op];
    b.onclick = () => { if (playing) return; op1 = op; kit.store.set('op1', op); newDotProblem(); };
    $('opChips').appendChild(b);
  });
  function renderOps() { document.querySelectorAll('#opChips button').forEach(b => b.classList.toggle('on', b.dataset.op === op1)); }

  function newDotProblem() {
    prob1 = makeDotProblem(op1); tries1 = 0; solved1 = false;
    $('q1').textContent = '?'; $('a1').value = '';
    $('say1').textContent = '▶ 문제 보여 주기를 눌러요.';
    $('replayBtn').disabled = true; kit.dot.clear(); renderOps();
  }
  function playDot() {
    if (!prob1) newDotProblem();
    const p = prob1;
    const ok = kit.run(async (r) => {
      playing = true; $('showBtn').disabled = $('replayBtn').disabled = true;
      $('say1').textContent = '알티노를 봐요! 👀';
      const seq = [() => kit.dot.number(p.a), () => kit.dot.bytes(OPS[p.op]), () => kit.dot.number(p.b)];
      for (const show of seq) {
        show();
        if (!await r.sleep(1300)) return;
        kit.dot.clear();
        if (!await r.sleep(250)) return;
      }
      kit.dot.icon('ask');
      $('say1').textContent = '답이 몇일까요? 써 보고 확인을 눌러요.';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  }
  $('showBtn').onclick = playDot;
  $('replayBtn').onclick = playDot;

  function check1() {
    if (!prob1 || solved1 || playing) return;
    const v = readAns($('a1'));
    if (v == null) { kit.toast('답을 먼저 써요'); return; }
    const eq = `${prob1.a} ${prob1.op} ${prob1.b} = ${prob1.ans}`;
    if (v === prob1.ans) {
      solved1 = true; n1++; kit.store.set('n1', n1); $('n1').textContent = n1;
      $('q1').textContent = eq; $('say1').textContent = '맞았어요! 🎉 다음 문제도 해 봐요.';
      kit.signal('success');
    } else if (++tries1 < 2) {
      $('say1').textContent = '아깝다! 한 번 더 보고 다시 써 봐요.';
      kit.signal('fail'); $('a1').value = '';
    } else {
      solved1 = true; $('q1').textContent = eq;
      $('say1').textContent = `답은 ${prob1.ans}이에요. 다음 문제로 가 봐요!`;
      kit.signal('fail');
    }
  }
  $('ok1').onclick = check1; onEnter($('a1'), check1);
  $('next1').onclick = () => { if (playing) return; newDotProblem(); };
  $('go2').onclick = () => showStep(2);

  // ── ② 연산 레이스 ───────────────────────────────────────────────
  let grade = kit.store.get('grade', 'e3'); if (!GRADES.includes(grade)) grade = 'e3';
  // race: idle | ready | racing | done
  let moves = 0, queued = 0, t0 = 0, deck = [], cur = null;

  GRADES.forEach(g => {
    const b = document.createElement('button');
    b.dataset.g = g; b.textContent = P.GRADE_LABELS[g] + ' 문제';
    b.onclick = () => { if (race === 'ready' || race === 'racing') return; grade = g; kit.store.set('grade', g); renderRace(); };
    $('gradeChips').appendChild(b);
  });
  for (let i = 0; i < GOAL; i++) {
    const s = document.createElement('span'); s.textContent = i === GOAL - 1 ? '🏁' : i + 1;
    if (i === GOAL - 1) s.className = 'goal';
    $('track').appendChild(s);
  }
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function nextQ() {
    if (!deck.length) deck = shuffle(P.GRADE_POOLS[grade]);
    cur = deck.pop();
    $('q2').textContent = cur.q; $('a2').value = '';
    $('say2').textContent = '모둠이 함께 풀어요.';
    if (race === 'racing') $('a2').focus();
  }

  $('raceStart').onclick = () => {
    const ok = kit.run(async (r) => {
      moves = 0; queued = 0; deck = []; race = 'ready'; renderRace();
      kit.signal('start'); $('q2').textContent = '준비…';
      if (!await r.sleep(1000)) return;           // 손을 로봇에서 뗄 시간 (05 §7)
      $('q2').textContent = '출발!';
      race = 'racing'; t0 = performance.now(); kit.dot.number(0);
      nextQ(); renderRace();
      while (r.alive()) {
        const left = RACE_MS - (performance.now() - t0);
        $('clock').textContent = fmt(left);
        if (moves >= GOAL || left <= 0) break;
        if (queued > 0) {                         // 맞힌 만큼 한 칸씩
          queued--;
          const s0 = performance.now();
          while (performance.now() - s0 < STEP_MS) {
            r.drive(STEP_SPEED, 0);
            if (!await r.sleep(50)) return;
          }
          r.drive(0, 0);
          moves++; kit.dot.number(moves); renderRace();
          if (!await r.sleep(300)) return;
          continue;
        }
        if (!await r.sleep(100)) return;
      }
      r.drive(0, 0);
      race = 'done';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('raceStop').onclick = () => { kit.stop(); endRun(); };

  function check2() {
    if (race !== 'racing' || !cur) return;
    const v = readAns($('a2'));
    if (v == null) { kit.toast('답을 먼저 써요'); return; }
    if (v === cur.a) {
      queued++; kit.signal('success');
      $('say2').textContent = '맞았어요! 한 칸 전진 🚗';
      nextQ(); $('say2').textContent = '맞았어요! 한 칸 전진 🚗';
    } else {
      kit.signal('fail');
      $('say2').textContent = '아깝다! 다시 풀어 보거나 넘겨도 돼요.';
      $('a2').value = '';
    }
  }
  $('ok2').onclick = check2; onEnter($('a2'), check2);
  $('skip2').onclick = () => { if (race === 'racing') nextQ(); };

  function endRun() {
    playing = false; $('showBtn').disabled = false; $('replayBtn').disabled = !prob1;
    if (race === 'done') { finishRace(); return; }
    if (race === 'ready' || race === 'racing') {   // ■ 멈춰, 단계 이동, 화면 이탈
      race = 'idle'; queued = 0;
      $('q2').textContent = '멈췄어요';
      $('say2').textContent = '다시 출발하면 처음부터 해요.';
    }
    renderRace();
  }

  function finishRace() {
    race = 'idle';
    const stars = starsOf(moves);
    const last = { moves, stars, grade };
    kit.store.set('last', last);
    const best = kit.store.get('best', null);
    if (moves > 0 && (!best || moves > (best.moves || 0))) {
      kit.store.set('best', last);
      kit.record.add({ title: '연산 레이스 도전', detail: `${P.GRADE_LABELS[grade]} 문제를 풀어 ${moves}칸 전진`, stars });
    }
    kit.signal(stars > 0 ? 'success' : 'notice');
    renderRace();
    showStep(3);
  }

  function renderRace() {
    const active = race === 'ready' || race === 'racing';
    document.querySelectorAll('#gradeChips button').forEach(b => { b.classList.toggle('on', b.dataset.g === grade); b.disabled = active; });
    document.querySelectorAll('#track span').forEach((s, i) => s.classList.toggle('on', i < moves));
    $('moves').textContent = moves; $('left').textContent = Math.max(0, GOAL - moves);
    $('raceStart').classList.toggle('hidden', active);
    $('raceStop').classList.toggle('hidden', !active);
    $('a2').disabled = $('ok2').disabled = $('skip2').disabled = race !== 'racing';
    if (race === 'idle' && !/멈췄어요/.test($('q2').textContent)) { $('clock').textContent = fmt(RACE_MS); $('q2').textContent = '출발을 눌러요'; }
  }

  // ── ③ 결과 보기 ─────────────────────────────────────────────────
  function renderResult() {
    const last = kit.store.get('last', null), best = kit.store.get('best', null);
    if (!last) {
      $('stars').textContent = '☆☆☆';
      $('resultMsg').textContent = '레이스를 마치면 결과가 나와요.';
      $('bestMsg').textContent = '';
      return;
    }
    $('stars').textContent = '⭐'.repeat(last.stars) + '☆'.repeat(3 - last.stars);
    const team = kit.team.get();
    const who = team ? kit.josa(team, '이가') : '우리 알티노가';
    $('resultMsg').textContent = last.moves >= GOAL ? `${who} 결승선까지 갔어요! 🏁`
      : last.moves > 0 ? `${who} ${last.moves}칸 갔어요!`
      : '아직 0칸이에요. 쉬운 문제부터 다시 해 봐요!';
    $('bestMsg').textContent = best ? `가장 좋은 기록: ${best.moves}칸 (${P.GRADE_LABELS[best.grade] || ''})` : '';
  }
  $('again').onclick = () => showStep(2);
  $('resetAll').onclick = async () => {
    if (!await kit.confirm({ title: '처음부터 할까요?', lines: ['이 앱의 점수와 기록이 지워져요', '성장기록부는 그대로예요'], okText: '네, 처음부터', danger: true })) return;
    ['n1', 'last', 'best', 'op1', 'grade'].forEach(k => kit.store.remove(k));
    n1 = 0; $('n1').textContent = 0; moves = 0; grade = 'e3'; op1 = '+';
    newDotProblem(); renderRace(); renderResult();
  };

  newDotProblem(); renderRace(); showStep(step);
})();
