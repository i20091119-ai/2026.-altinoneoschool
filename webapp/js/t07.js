// t07 수학 시험 보는 날 (13–14차시) — 기획서 docs/topics/t07.md
// ① 알티노의 문제 읽기(도트로 수→기호→수→? 차례로, 답 입력) → ② 알티노 답안지 채점하기(6문항 O·X,
// 틀린 답 가르치기) → ③ 연산 레이스(3분, 맞힐 때마다 한 칸 전진, 1라운드·2라운드)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't07',
    title: '수학 시험 보는 날',
    onRunEnd: endRun,
    // kit.stop()·화면 이탈로 끝난 실행은 onRunEnd 가 안 불린다 → 여기서 정리
    onTick: () => { if (runKind && !kit.running) endRun(); },
  });

  const SHOW_MS = 1200;          // 도트 한 글자 보여 주는 시간(기획서 §3)
  const STEP_SPEED = 300;        // 레이스 한 칸 = 속도 300 × 1초 (03 §1 순항 속도)
  const STEP_MS = 1000;
  const RACE_SEC = kit.store.num('raceSec', 180, 10, 600);   // 3분. 현장에서 줄일 때만 저장값으로
  const HELP_MAX = 2;
  const BADGES = [[12, 3, '박사'], [8, 2, '실력'], [5, 1, '도전']];   // 정답 수 이상 → 별

  // ── 도트 기호 — 바이트=행(위→아래), 비트7=맨 왼쪽. × 는 실패 아이콘(✗, 테두리까지 큼)과 헷갈리지 않게 작게 ──
  const SYM = {
    '+': [0x00, 0x18, 0x18, 0x7E, 0x7E, 0x18, 0x18, 0x00],
    '−': [0x00, 0x00, 0x00, 0x7E, 0x7E, 0x00, 0x00, 0x00],
    '×': [0x00, 0x00, 0x24, 0x18, 0x18, 0x24, 0x00, 0x00],
    '÷': [0x18, 0x18, 0x00, 0x7E, 0x7E, 0x00, 0x18, 0x18],
    '=': [0x00, 0x7E, 0x7E, 0x00, 0x00, 0x7E, 0x7E, 0x00],
  };

  // ── 문제 — 도트가 0~99 만 그리므로 수와 답이 모두 0~99 (05 §5). 답은 식에서 계산해 만든다(검산이 곧 생성) ──
  const calc = (a, op, b) => op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
  function makePool(grade) {
    const pool = [];
    const add = (a, op, b) => {
      const ans = calc(a, op, b);
      if (Number.isInteger(ans) && ans >= 0 && ans <= 99 && a <= 99 && b <= 99) pool.push({ a, op, b, ans });
    };
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) { add(a, '×', b); add(a * b, '÷', a); }   // 곱셈구구·몫이 한 자리
    if (grade === 4) {
      for (let a = 11; a <= 49; a++) for (let b = 2; b <= 9; b++) if (a * b <= 99) add(a, '×', b);   // (두 자리)×(한 자리)
      for (let b = 2; b <= 9; b++) for (let q = 10; q * b <= 99; q++) add(q * b, '÷', b);            // 몫이 두 자리
    }
    // 덧셈·뺄셈은 조금만 (기호 읽기 연습) — 받아올림 있는 두 자리
    [[27, 35], [46, 38], [19, 54], [58, 26]].forEach(([a, b]) => { add(a, '+', b); add(a + b, '−', b); });
    return pool;
  }
  const POOLS = { 3: makePool(3), 4: makePool(4) };
  const text = (p, hideAns) => `${p.a} ${p.op} ${p.b} = ${hideAns ? '?' : p.ans}`;
  let recent = [];
  function pick(grade) {
    const pool = POOLS[grade];
    // 곱셈·나눗셈 위주: 덧셈·뺄셈은 열에 하나 꼴
    const want = Math.random() < 0.1 ? ['+', '−'] : ['×', '÷'];
    const cands = pool.filter(p => want.includes(p.op) && !recent.includes(text(p)));
    const p = cands[Math.floor(Math.random() * cands.length)] || pool[0];
    recent.push(text(p)); if (recent.length > 8) recent.shift();
    return p;
  }

  // 도트 보여 주기 — 움직임은 없지만 정지·단계 전환에 바로 끊기도록 kit.run 안에서
  function playDots(items, onDone) {
    return kit.run(async (r) => {
      for (const it of items) {
        if (typeof it === 'number') kit.dot.number(it);
        else if (it === '?') kit.dot.icon('ask');
        else kit.dot.bytes(SYM[it]);
        if (!await r.sleep(SHOW_MS)) return;
      }
      if (onDone) onDone();
    });
  }

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  let runKind = '';   // 'read' | 'paper' | 'race' — kit.run 이 끝났을 때 무엇을 정리할지
  function endRun() {
    const k = runKind; runKind = '';
    if (k === 'race') raceEnded();
    renderRead(); renderPaper();
  }

  // ── ① 알티노의 문제 읽기 ─────────────────────────────────────────
  let grade = kit.store.num('grade', 3, 3, 4);
  let cur1 = null, seen1 = false, solved1 = false, turn = kit.store.num('turn', 0, 0, 999);
  let log1 = kit.store.get('log1', []); if (!Array.isArray(log1)) log1 = [];
  const ROLES = ['식 읽기', '답 입력', '확인'];
  [[3, '3학년'], [4, '4학년']].forEach(([g, label]) => {
    const b = document.createElement('button'); b.dataset.g = g; b.textContent = label;
    b.onclick = () => { if (runKind) return; grade = g; kit.store.set('grade', g); newProblem(); };
    $('gradeChips').appendChild(b);
  });
  function newProblem() { cur1 = pick(grade); seen1 = false; solved1 = false; $('ans1').value = ''; $('fb1').textContent = ''; $('fb1').className = 'fb'; renderRead(); }
  function show1() {
    if (!cur1) cur1 = pick(grade);
    runKind = 'read';
    if (!playDots([cur1.a, cur1.op, cur1.b, '?'], () => { seen1 = true; })) { runKind = ''; kit.toast('도트가 아직 나오는 중이에요'); return; }
    $('q1').textContent = '👀 도트를 보세요';
    renderRead();
  }
  $('show1').onclick = show1;
  $('again1').onclick = show1;
  $('next1').onclick = () => { turn++; kit.store.set('turn', turn); newProblem(); show1(); };
  function check1() {
    if (!seen1 || solved1) return;
    const v = $('ans1').value.trim(); if (v === '') { $('fb1').textContent = '답을 넣어요.'; return; }
    const okay = +v === cur1.ans;
    log1.push({ q: text(cur1, true), mine: +v, ok: okay }); if (log1.length > 30) log1.shift();
    kit.store.set('log1', log1);
    if (okay) {
      solved1 = true; kit.signal('success');
      $('fb1').textContent = `맞았어요! ${text(cur1)}`; $('fb1').className = 'fb ok';
    } else {
      kit.signal('fail');
      $('fb1').textContent = cur1.op === '×' || cur1.op === '÷' ? '아깝다! 곱셈구구를 떠올려 다시 풀어 봐요.' : '아깝다! 일의 자리부터 다시 계산해 봐요.';
      $('fb1').className = 'fb no'; $('ans1').value = '';
    }
    renderRead();
  }
  $('ok1').onclick = check1;
  $('ans1').addEventListener('keydown', (e) => { if (e.key === 'Enter') check1(); });
  function renderRead() {
    document.querySelectorAll('#gradeChips button').forEach(b => b.classList.toggle('on', +b.dataset.g === grade));
    const busy = runKind === 'read';
    $('show1').disabled = busy || seen1; $('again1').disabled = busy || !seen1;
    $('next1').disabled = busy || !solved1;
    $('ok1').disabled = !seen1 || solved1; $('ans1').disabled = !seen1 || solved1;
    if (!busy) $('q1').textContent = solved1 ? text(cur1) : seen1 ? '식을 써 보세요 ✏️' : '?';
    $('roles').innerHTML = ROLES.map((r, i) => `<div class="${i === 0 ? 'on' : ''}"><b>${(turn + i) % 3 + 1}번</b>${r}</div>`).join('');
    $('log1').innerHTML = log1.slice(-5).reverse().map(x => `<div><span>${x.q}</span><span>내 답 ${x.mine} · <b>${x.ok ? 'O' : 'X'}</b></span></div>`).join('') || '<p class="lead">아직 없어요.</p>';
  }

  // ── ② 알티노 답안지 채점하기 — 시험지와 틀린 까닭(기획서 표, 정답은 calc 로 검산) ──
  const REASONS = [
    '곱셈을 덧셈처럼 계산했어요.',
    '곱셈구구를 잘못 떠올렸어요.',
    '받아올림한 수를 더하지 않았어요.',
  ];
  const PAPER = [
    { a: 8, op: '×', b: 4, alt: 32 },
    { a: 6, op: '×', b: 3, alt: 9, why: 0, say: '6 × 3은 6을 3번 더하는 거야. 6+6+6=18이야.' },
    { a: 45, op: '÷', b: 5, alt: 9 },
    { a: 24, op: '÷', b: 4, alt: 5, why: 1, say: '4 × 6 = 24니까 몫은 6이야.' },
    { a: 16, op: '×', b: 3, alt: 38, why: 2, say: '6 × 3 = 18에서 올라간 1을 십의 자리에 꼭 더해야 해.' },
    { a: 56, op: '÷', b: 7, alt: 8 },
  ].map(p => ({ ...p, ans: calc(p.a, p.op, p.b) }));
  const WRONG = PAPER.filter(p => p.alt !== p.ans).length;
  // marks[i] = { first:'O'|'X', judge:'O'|'X', fixed:bool, taught:'…' }
  let marks = kit.store.get('marks', {}); if (!marks || typeof marks !== 'object') marks = {};
  let sel2 = -1, shown2 = false;
  const truth = (p) => p.alt === p.ans ? 'O' : 'X';
  PAPER.forEach((p, i) => {
    const b = document.createElement('button'); b.dataset.i = i;
    b.onclick = () => {
      if (runKind) return;
      sel2 = i; shown2 = false; $('fix2').value = ''; $('own2').value = ''; $('fb2').textContent = ''; $('fbTeach').textContent = '';
      runKind = 'paper';
      if (!playDots([p.a, p.op, p.b, '=', p.alt], () => { shown2 = true; })) runKind = '';
      $('q2').textContent = '👀 도트를 보세요';
      renderPaper();
    };
    $('paper').appendChild(b);
  });
  function judge(mark) {
    if (sel2 < 0 || !shown2) return;
    const p = PAPER[sel2], m = marks[sel2] || {};
    if (!m.first) m.first = mark;
    m.judge = mark; marks[sel2] = m; kit.store.set('marks', marks);
    if (mark === truth(p)) {
      if (mark === 'O') { kit.signal('success'); $('fb2').textContent = '맞게 채점했어요! 알티노가 바르게 풀었어요.'; $('fb2').className = 'fb ok'; }
      else { kit.signal('notice'); $('fb2').textContent = '맞아요, 틀린 답이에요. 오른쪽에서 알티노를 가르쳐 줘요.'; $('fb2').className = 'fb ok'; }
    } else {
      kit.signal('fail');
      $('fb2').textContent = '다시 계산해 볼까요? 곱셈은 곱셈구구로, 나눗셈은 곱셈으로 거꾸로 생각해요.'; $('fb2').className = 'fb no';
    }
    renderPaper();
  }
  $('judgeO').onclick = () => judge('O');
  $('judgeX').onclick = () => judge('X');
  $('fixOk').onclick = () => {
    const p = PAPER[sel2], m = marks[sel2]; if (!m) return;
    if (+$('fix2').value === p.ans && $('fix2').value.trim() !== '') {
      m.fixed = true; kit.store.set('marks', marks); kit.dot.icon('smile');
      $('fbTeach').textContent = `바른 답 ${p.ans} — 알티노가 웃어요! 이제 까닭을 가르쳐 줘요.`; $('fbTeach').className = 'fb ok';
    } else { kit.signal('fail'); $('fbTeach').textContent = '아깝다! 한 번 더 계산해 봐요.'; $('fbTeach').className = 'fb no'; }
    renderPaper();
  };
  function teach(say) {
    const p = PAPER[sel2], m = marks[sel2]; if (!m || !m.fixed) return;
    m.taught = say; kit.store.set('marks', marks);
    kit.signal('success'); setTimeout(() => kit.dot.icon('heart'), 700);
    $('fbTeach').textContent = '알티노가 배웠어요 ♥ 친구들에게 발표해 봐요.'; $('fbTeach').className = 'fb ok';
    renderPaper();
  }
  REASONS.forEach((t, k) => {
    const b = document.createElement('button'); b.dataset.k = k; b.textContent = t;
    b.onclick = () => {
      const p = PAPER[sel2];
      if (k === p.why) teach(`알티노야, ${p.say}`);
      else { kit.signal('fail'); $('fbTeach').textContent = '그 까닭이 맞을까요? 알티노의 답을 다시 보며 생각해 봐요.'; $('fbTeach').className = 'fb no'; }
    };
    $('opts').appendChild(b);
  });
  $('ownOk').onclick = () => {
    const t = $('own2').value.trim();
    if (t.length < 4) { $('fbTeach').textContent = '가르쳐 줄 말을 조금 더 길게 써요.'; $('fbTeach').className = 'fb no'; return; }
    teach(t);
  };
  $('reset2').onclick = async () => {
    if (!await kit.confirm({ title: '채점을 처음부터 할까요?', lines: ['O·X 와 가르친 말이 모두 지워져요'], okText: '네, 처음부터', danger: true })) return;
    marks = {}; kit.store.remove('marks'); sel2 = -1; shown2 = false; $('fb2').textContent = ''; renderPaper();
  };
  const taughtCount = () => PAPER.filter((p, i) => truth(p) === 'X' && marks[i] && marks[i].taught).length;
  function renderPaper() {
    document.querySelectorAll('#paper button').forEach(b => {
      const i = +b.dataset.i, m = marks[i];
      b.classList.toggle('on', i === sel2);
      b.innerHTML = `${i + 1}번<span class="mk ${m && m.judge === 'O' ? 'o' : 'x'}">${m && m.judge ? m.judge + (m.taught ? ' ♥' : '') : '·'}</span>`;
    });
    const p = PAPER[sel2], m = marks[sel2];
    if (runKind !== 'paper') $('q2').textContent = sel2 < 0 ? '번호를 눌러요' : shown2 || m ? `${p.a} ${p.op} ${p.b} = ${p.alt}` : '번호를 눌러요';
    if (m && !shown2 && runKind !== 'paper') shown2 = true;    // 이미 채점한 문항은 다시 판정 가능
    $('judgeO').disabled = $('judgeX').disabled = !(sel2 >= 0 && shown2 && runKind !== 'paper');
    const teaching = !!(p && m && m.judge === 'X' && truth(p) === 'X');
    $('teachBox').classList.toggle('hidden', !teaching);
    if (teaching) {
      $('fix2').disabled = $('fixOk').disabled = !!m.fixed;
      if (m.fixed) $('fix2').value = p.ans;
      document.querySelectorAll('#opts button').forEach(b => { b.disabled = !m.fixed; b.classList.toggle('on', !!m.taught && +b.dataset.k === p.why && m.taught.endsWith(p.say)); });
      $('own2').disabled = $('ownOk').disabled = !m.fixed;
    }
    const judged = PAPER.filter((q, i) => marks[i] && marks[i].first).length;
    const right = PAPER.filter((q, i) => marks[i] && marks[i].first === truth(q)).length;
    $('paperResult').classList.toggle('hidden', teaching);
    $('paperResult').innerHTML = judged < PAPER.length
      ? `<span class="m">📝</span>${judged} / ${PAPER.length} 문항 채점했어요.<br><span class="lead">틀린 문항은 바른 답과 까닭을 가르쳐 줘요.</span>`
      : `<span class="m">${taughtCount() === WRONG ? '🏅' : '📝'}</span>내 채점이 맞은 수 <b>${right} / ${PAPER.length}</b><br>가르친 문항 <b>${taughtCount()} / ${WRONG}</b>` +
        (taughtCount() === WRONG ? '<br>알티노가 다 배웠어요!' : '<br><span class="lead">X 문항을 눌러 마저 가르쳐 줘요.</span>');
  }

  // ── ③ 연산 레이스 ───────────────────────────────────────────────
  // rounds = [1라운드 정답 수, 2라운드 정답 수] (null = 아직)
  let rounds = kit.store.get('rounds', [null, null]);
  if (!Array.isArray(rounds) || rounds.length !== 2) rounds = [null, null];
  let racing = false, ready = false, score = 0, helps = HELP_MAX, pending = 0, cur3 = null;
  const roundIdx = () => rounds[0] == null ? 0 : rounds[1] == null ? 1 : -1;
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.max(0, s) % 60).padStart(2, '0');

  $('start3').onclick = () => {
    const ri = roundIdx(); if (ri < 0) return;
    score = 0; helps = HELP_MAX; pending = 0; ready = false; $('score3').textContent = '0';
    runKind = 'race';
    const ok = kit.run(async (r) => {
      racing = true; renderRace();
      kit.signal('start'); $('q3').textContent = '준비…';
      if (!await r.sleep(1000)) return;               // 손을 로봇에서 뗄 시간 (05 §7)
      ready = true; next3(); renderRace();
      const t0 = performance.now(); let moveUntil = 0;
      while (r.alive()) {
        const now = performance.now(), left = RACE_SEC - Math.floor((now - t0) / 1000);
        $('clock3').textContent = fmt(left);
        if (left <= 0) break;
        if (now >= moveUntil && pending > 0) { pending--; moveUntil = now + STEP_MS; }   // 맞힌 만큼 한 칸씩 차례로
        r.drive(now < moveUntil ? STEP_SPEED : 0, 0);
        if (!await r.sleep(100)) return;
      }
      r.drive(0, 0);
      finishRound();
    });
    if (!ok) { runKind = ''; kit.toast('이미 움직이는 중이에요'); }
  };
  $('stop3').onclick = () => { kit.stop(); endRun(); };
  function next3() { cur3 = pick(grade); $('q3').textContent = text(cur3, true); $('ans3').value = ''; $('fb3').textContent = ''; setTimeout(() => $('ans3').focus(), 0); }
  function check3() {
    if (!racing || !ready) return;
    const v = $('ans3').value.trim(); if (v === '') return;
    if (+v === cur3.ans) {
      score++; pending++; kit.signal('success');
      $('score3').textContent = score;
      next3(); $('fb3').textContent = '맞았어요! 다음 풀이자 차례 🔄'; $('fb3').className = 'fb ok';
    } else {
      kit.signal('fail'); $('ans3').value = '';
      $('fb3').textContent = '아깝다! 다시 풀어 봐요. 어려우면 도움 카드!'; $('fb3').className = 'fb no';
    }
  }
  $('ok3').onclick = check3;
  $('ans3').addEventListener('keydown', (e) => { if (e.key === 'Enter') check3(); });
  $('help3').onclick = () => {
    if (!racing || !ready || helps <= 0) return;
    helps--;
    const p = cur3;
    $('fb3').textContent = p.op === '×' ? `🃏 ${kit.josa(String(p.a), '을를')} ${p.b}번 더한 수예요.`
      : p.op === '÷' ? `🃏 ${p.b} × □ = ${p.a} 에서 □ 를 찾아요.`
      : p.op === '+' ? '🃏 일의 자리끼리 먼저 더하고, 10이 넘으면 올려요.' : '🃏 일의 자리에서 못 빼면 십의 자리에서 10을 빌려 와요.';
    $('fb3').className = 'fb'; renderRace();
  };
  function finishRound() {
    const ri = roundIdx(); if (ri < 0) return;
    rounds[ri] = score; kit.store.set('rounds', rounds);
    racing = false; ready = false;
    kit.signal('notice');
    const best = Math.max(...rounds.filter(x => x != null));
    const badge = BADGES.find(([n]) => best >= n);
    const stars = badge ? badge[1] : 0;
    const bestStars = kit.store.num('bestStars', 0, 0, 3);
    if (stars > bestStars) {                // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
      kit.store.set('bestStars', stars);
      const t = taughtCount();
      kit.record.add({ title: '수학 시험 통과', detail: `연산 레이스 정답 ${best}개 · ${badge[2]} 배지` + (t ? ` · 알티노 답안 ${t}문항 가르침` : ''), stars });
    }
    const got = BADGES.find(([n]) => score >= n);
    $('raceResult').innerHTML = got
      ? `<span class="m">🏅</span>${ri + 1}라운드 정답 <b>${score}개</b> · ${got[2]} 배지 ${'⭐'.repeat(got[1])}`
      : `<span class="m">💪</span>${ri + 1}라운드 정답 <b>${score}개</b><br>전략을 세우고 다시 도전해요!`;
    $('raceResult').classList.remove('hidden');
  }
  function raceEnded() {
    if (racing) {                            // 끝나기 전에 멈춤 — 이 라운드는 기록하지 않는다
      racing = false; ready = false;
      $('q3').textContent = '멈췄어요';
      $('fb3').textContent = '끝나기 전에 멈춰서 이 라운드는 기록하지 않아요. 다시 출발할 수 있어요.'; $('fb3').className = 'fb';
      $('clock3').textContent = fmt(RACE_SEC);
    }
    renderRace();
  }
  $('reset3').onclick = async () => {
    if (!await kit.confirm({ title: '레이스 기록을 처음부터 할까요?', lines: ['1라운드·2라운드 기록이 지워져요'], okText: '네, 처음부터', danger: true })) return;
    rounds = [null, null]; kit.store.set('rounds', rounds); score = 0; $('score3').textContent = '0';
    $('raceResult').classList.add('hidden'); $('q3').textContent = '준비'; renderRace();
  };
  function renderRace() {
    const ri = roundIdx();
    $('roundName').textContent = ri < 0 ? '레이스 끝' : `${ri + 1}라운드`;
    $('r1').textContent = rounds[0] == null ? '–' : rounds[0] + '개';
    $('r2').textContent = rounds[1] == null ? '–' : rounds[1] + '개';
    $('start3').classList.toggle('hidden', racing);
    $('stop3').classList.toggle('hidden', !racing);
    $('start3').disabled = ri < 0;
    $('start3').textContent = ri === 1 ? '▶ 2라운드 하기' : '▶ 준비… 출발!';
    $('ans3').disabled = $('ok3').disabled = !(racing && ready);
    $('help3').disabled = !(racing && ready) || helps <= 0;
    $('help3').textContent = `🃏 도움 카드 (${helps})`;
    if (racing) $('raceResult').classList.add('hidden');
    if (!racing) $('clock3').textContent = fmt(RACE_SEC);
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  showStep(step);
  newProblem();
  renderPaper();
  renderRace();
})();
