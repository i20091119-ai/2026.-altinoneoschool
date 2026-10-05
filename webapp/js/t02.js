// t02 알티노 걸음마 가르치기 (3–4차시) — 기획서 docs/topics/t02.md
// ① 걸음마 연습(패드·속도 막대·구령 놀이) → ② 속도의 비밀 찾기(앱이 재는 3초 달리기)
// → ③ 걸음마 시험(앞으로 버튼 한 번, 기록원이 성공·실패, 3번 중 2번 성공이면 합격)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't02',
    title: '알티노 걸음마 가르치기',
    onRunEnd: endRun,
  });

  const RUN_MS = 3000;                       // 실험은 언제나 3초
  const EXP_SPEEDS = [300, 350, 400, 500];   // 350 = 미니게임 '몇 뼘 갈까?'
  const BADGES = [                           // 빠를수록 멈추기 어려워 등급이 높다 (PPT 42쪽)
    { speed: 300, name: '걸음마', medal: '🥉', stars: 1 },
    { speed: 400, name: '달리기', medal: '🥈', stars: 2 },
    { speed: 500, name: '전력질주', medal: '🥇', stars: 3 },
  ];
  const TRIES = 3, PASS = 2;

  let goHold = null;
  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) kit.stop();
    if (n !== 1) releasePad();
    if (n !== 3 && goHold) goHold.release();     // 시험 버튼을 누른 채 단계를 바꿔도 멈춘다
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── ① 걸음마 연습: 조종 패드 ─────────────────────────────────────
  let speed = kit.store.num('speed', 300, 0, 500);
  $('spd').value = speed; $('spdVal').textContent = speed;
  $('spd').addEventListener('input', (e) => { speed = +e.target.value; $('spdVal').textContent = speed; kit.store.set('speed', speed); apply(); });
  let fwd = 0, turn = 0;
  const apply = () => kit.drive(fwd * speed, turn);
  const pads = [
    kit.hold($('d-up'),    () => { fwd = 1; apply(); },    () => { fwd = 0; apply(); }),
    kit.hold($('d-down'),  () => { fwd = -1; apply(); },   () => { fwd = 0; apply(); }),
    kit.hold($('d-left'),  () => { turn = -100; apply(); }, () => { turn = 0; apply(); }),
    kit.hold($('d-right'), () => { turn = 100; apply(); },  () => { turn = 0; apply(); }),
  ];
  function releasePad() { pads.forEach(h => h && h.release()); fwd = 0; turn = 0; }

  // 구령 놀이 — 같은 구령이 두 번 연달아 나오지 않게
  const CMDS = ['출발!', '멈춰!', '뒤로!'];
  let cmd = '출발!';
  $('nextCmd').onclick = () => {
    const rest = CMDS.filter(c => c !== cmd);
    cmd = rest[Math.floor(Math.random() * rest.length)];
    $('cmd').textContent = cmd;
    kit.signal('notice');
  };
  // 2분 역할 타이머 (화면 표시용 — 로봇을 움직이지 않는다)
  const ROLE_MS = 120000;
  let roleEnd = 0, roleTimer = null;
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function roleTick() {
    const left = roleEnd - Date.now();
    if (left <= 0) {
      clearInterval(roleTimer); roleTimer = null; $('roleClock').textContent = '0:00';
      $('roleStart').textContent = '⏱ 2분 시작';
      kit.signal('notice'); kit.toast('🔄 역할을 바꿔요!', 2500);
      return;
    }
    $('roleClock').textContent = fmt(left);
  }
  $('roleStart').onclick = () => {
    roleEnd = Date.now() + ROLE_MS; clearInterval(roleTimer);
    roleTimer = setInterval(roleTick, 250); roleTick();
    $('roleStart').textContent = '⏱ 다시 2분';
  };
  $('roleReset').onclick = () => { clearInterval(roleTimer); roleTimer = null; $('roleClock').textContent = fmt(ROLE_MS); $('roleStart').textContent = '⏱ 2분 시작'; };

  // ── ② 속도의 비밀 찾기: 3초 달리기 실험 ─────────────────────────
  // exp = { '300': { p: 예상, a: 실제 }, ... }  — 예상은 출발 전에 잠근다(PPT 26쪽 규칙)
  let exp = kit.store.get('exp', {});
  if (!exp || typeof exp !== 'object') exp = {};
  let expSpeed = kit.store.num('expSpeed', 300, 300, 500);
  if (!EXP_SPEEDS.includes(expSpeed)) expSpeed = 300;
  let pDraft = 5, aDraft = 5, runPhase = 'idle';   // idle | running | measure
  const clampHand = (v) => Math.max(0, Math.min(99, Math.round(+v || 0)));
  const rowOf = (s) => exp[s] || {};

  EXP_SPEEDS.forEach(s => {
    const b = document.createElement('button');
    b.dataset.s = s; b.textContent = s === 350 ? '350 게임' : '속도 ' + s;
    b.onclick = () => { if (runPhase === 'running') return; expSpeed = s; kit.store.set('expSpeed', s); runPhase = 'idle'; renderExp(); };
    $('speedChips').appendChild(b);
  });
  $('pMinus').onclick = () => { pDraft = clampHand(pDraft - 1); renderExp(); };
  $('pPlus').onclick = () => { pDraft = clampHand(pDraft + 1); renderExp(); };
  $('aMinus').onclick = () => { aDraft = clampHand(aDraft - 1); renderExp(); };
  $('aPlus').onclick = () => { aDraft = clampHand(aDraft + 1); renderExp(); };

  $('lockP').onclick = () => {
    exp[expSpeed] = { p: pDraft };            // 예상을 새로 적으면 그 속도의 실제값은 다시 잰다
    kit.store.set('exp', exp); aDraft = pDraft; renderExp();
    kit.toast('🔒 예상을 적었어요. 이제 바꿀 수 없어요');
  };

  $('runBtn').onclick = () => {
    const ok = kit.run(async (r) => {
      runPhase = 'running'; renderExp();
      kit.signal('start'); $('runMsg').textContent = '준비…';
      if (!await r.sleep(1000)) return;       // 손을 로봇에서 뗄 시간 (05 §7)
      $('runMsg').textContent = '출발!';
      const t0 = performance.now();
      while (r.alive()) {
        const t = performance.now() - t0;
        if (t >= RUN_MS) break;
        $('clock').textContent = (t / 1000).toFixed(1) + '초';
        r.drive(expSpeed, 0);
        if (!await r.sleep(50)) return;
      }
      r.drive(0, 0);
      $('clock').textContent = (RUN_MS / 1000).toFixed(1) + '초';
      runPhase = 'measure';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('stopBtn').onclick = () => { kit.stop(); };
  function endRun() {
    if (runPhase === 'running') { runPhase = 'idle'; $('runMsg').textContent = '멈췄어요. 다시 달려 볼까요?'; }
    renderExp();
  }

  $('saveA').onclick = () => {
    exp[expSpeed] = { p: rowOf(expSpeed).p, a: aDraft };
    kit.store.set('exp', exp); runPhase = 'idle';
    kit.dot.number(aDraft); kit.signal('success');
    const next = EXP_SPEEDS.find(s => rowOf(s).a == null);
    if (next != null) { expSpeed = next; kit.store.set('expSpeed', next); pDraft = 5; }
    renderExp();
  };
  $('expReset').onclick = async () => {
    if (!await kit.confirm({ title: '실험 기록을 처음부터 할까요?', lines: ['예상과 실제 기록이 모두 지워져요'], okText: '네, 처음부터', danger: true })) return;
    exp = {}; kit.store.remove('exp'); expSpeed = 300; kit.store.set('expSpeed', 300); pDraft = 5; runPhase = 'idle'; renderExp();
  };

  function renderExp() {
    const row = rowOf(expSpeed), locked = row.p != null, measured = row.a != null;
    document.querySelectorAll('#speedChips button').forEach(b => {
      b.classList.toggle('on', +b.dataset.s === expSpeed);
      b.classList.toggle('done', rowOf(+b.dataset.s).a != null);
    });
    const running = runPhase === 'running';
    $('pVal').textContent = locked ? row.p : pDraft;
    $('pMinus').disabled = $('pPlus').disabled = locked;
    $('lockP').disabled = locked || running;
    $('lockP').textContent = locked ? '🔒 예상 ' + row.p + '뼘' : '🔒 예상 적기';
    $('runBtn').disabled = !locked || running;
    $('runBtn').classList.toggle('hidden', running);
    $('stopBtn').classList.toggle('hidden', !running);
    $('actualBox').classList.toggle('hidden', runPhase !== 'measure');
    $('aVal').textContent = aDraft;
    if (!running) {
      $('expGuide').textContent = !locked ? '① 속도를 고르고 ② 몇 뼘 갈지 예상을 먼저 적어요.'
        : measured ? `속도 ${expSpeed}: 예상 ${row.p}뼘 · 실제 ${row.a}뼘 — 다른 속도도 해 봐요.`
        : '③ 3초 달리기를 눌러요. 달리는 길에는 들어가지 않아요.';
      if (runPhase === 'idle') { $('clock').textContent = '0.0초'; if (!/멈췄어요/.test($('runMsg').textContent)) $('runMsg').textContent = '앱이 3초를 똑같이 재 줘요 — 공정한 실험!'; }
      if (runPhase === 'measure') $('runMsg').textContent = '거리를 재는 사람은 한 명! 정한 사람의 뼘으로 재요.';
    }
    renderChart();
  }

  function renderChart() {
    const max = Math.max(10, ...EXP_SPEEDS.flatMap(s => [rowOf(s).p || 0, rowOf(s).a || 0]));
    $('chart').innerHTML = '';
    EXP_SPEEDS.forEach(s => {
      const r = rowOf(s), col = document.createElement('div'); col.className = 'col';
      const bars = document.createElement('div'); bars.className = 'bars';
      [['p', r.p], ['a', r.a]].forEach(([k, v]) => {
        const b = document.createElement('div'); b.className = 'bar ' + k;
        b.style.height = v == null ? '0' : (v / max * 100) + '%';
        b.textContent = v == null ? '' : v; bars.appendChild(b);
      });
      const lab = document.createElement('span'); lab.textContent = s === 350 ? '350 게임' : '속도 ' + s;
      col.appendChild(bars); col.appendChild(lab); $('chart').appendChild(col);
    });
    const a3 = rowOf(300).a, a5 = rowOf(500).a;
    const done = [300, 400, 500].every(s => rowOf(s).a != null);
    let msg = '속도마다 실험하면 그래프가 채워져요.';
    if (done) {
      const gaps = [300, 400, 500].map(s => [s, Math.abs(rowOf(s).p - rowOf(s).a)]).sort((x, y) => y[1] - x[1]);
      msg = a5 > a3 ? `속도 500은 300보다 ${a5 - a3}뼘 더 갔어요. 예상과 가장 달랐던 속도는 ${gaps[0][0]}!`
        : `속도 500이 300보다 멀리 가지 않았어요. 바닥과 배터리를 살펴보고 다시 재 볼까요?`;
    } else if (rowOf(350).a != null) {
      msg = `몇 뼘 갈까? 예상 ${rowOf(350).p}뼘 · 실제 ${rowOf(350).a}뼘 — 차이 ${Math.abs(rowOf(350).p - rowOf(350).a)}뼘`;
    }
    $('insight').textContent = msg;
  }

  // ── ③ 걸음마 시험 ────────────────────────────────────────────────
  // test = { speed, results: [true/false…] }  — 판정은 기록원이 줄자로(바닥 센서가 없다, 03 §10)
  let test = kit.store.get('test', null);
  if (!test || !BADGES.some(b => b.speed === test.speed) || !Array.isArray(test.results)) test = null;
  let phase = 'pick';   // pick | ready | driving | judge | done
  const badgeOf = (s) => BADGES.find(b => b.speed === s);
  const wins = () => test ? test.results.filter(Boolean).length : 0;
  const losses = () => test ? test.results.filter(x => !x).length : 0;

  BADGES.forEach(b => {
    const el = document.createElement('button'); el.dataset.s = b.speed;
    el.innerHTML = `<span class="m">${b.medal}</span><b>${b.name}</b><span class="lead">속도 ${b.speed}</span>`;
    el.onclick = async () => {
      if (phase === 'driving') return;
      if (test && test.results.length && phase !== 'done' && test.speed !== b.speed) {
        if (!await kit.confirm({ title: '시험 속도를 바꿀까요?', lines: ['지금까지의 도전 기록이 지워져요'], okText: '네, 바꿀래요' })) return;
      }
      if (!test || test.speed !== b.speed || phase === 'done') test = { speed: b.speed, results: [] };
      saveTest(); phase = 'ready'; renderTest();
    };
    $('badges').appendChild(el);
  });
  if (test) phase = (wins() >= PASS || losses() > TRIES - PASS) ? 'done' : 'ready';

  // 앞으로 버튼은 한 번만 — 누르는 동안 달리고, 손을 떼면 그 판은 끝(PPT 38쪽 규칙)
  goHold = kit.hold($('go'), () => {
    if (phase !== 'ready') return;
    phase = 'driving'; kit.drive(test.speed, 0); renderTest();
  }, () => {
    if (phase !== 'driving') return;
    kit.drive(0, 0); phase = 'judge'; renderTest();
  });
  const judge = (okay) => {
    if (phase !== 'judge') return;
    test.results.push(okay); saveTest();
    kit.signal(okay ? 'success' : 'fail');
    if (wins() >= PASS || losses() > TRIES - PASS) finish(); else { phase = 'ready'; renderTest(); }
  };
  $('judgeOk').onclick = () => judge(true);
  $('judgeNo').onclick = () => judge(false);
  $('retry').onclick = () => { test = { speed: test.speed, results: [] }; saveTest(); phase = 'ready'; renderTest(); };

  function finish() {
    phase = 'done';
    const b = badgeOf(test.speed), passed = wins() >= PASS;
    if (passed) {
      kit.dot.icon('ok');
      const best = kit.store.num('bestStars', 0, 0, 3);
      if (b.stars > best) {                   // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
        kit.store.set('bestStars', b.stars);
        kit.record.add({ title: '걸음마 시험 합격', detail: `${b.name} 배지(속도 ${b.speed}) · ${test.results.length}번 중 ${wins()}번 성공`, stars: b.stars });
      }
    }
    renderTest();
  }
  function saveTest() { kit.store.set('test', test); }

  function renderTest() {
    document.querySelectorAll('#badges button').forEach(el => el.classList.toggle('on', !!test && +el.dataset.s === test.speed));
    const res = test ? test.results : [];
    $('tries').innerHTML = '';
    for (let i = 0; i < TRIES; i++) {
      const s = document.createElement('span');
      s.textContent = i < res.length ? (res[i] ? '✓' : '✗') : '';
      if (i < res.length) s.className = res[i] ? 'ok' : 'no';
      $('tries').appendChild(s);
    }
    $('go').disabled = phase !== 'ready' && phase !== 'driving';
    $('judgeBox').classList.toggle('hidden', phase !== 'judge');
    $('resultBox').classList.toggle('hidden', phase !== 'done');
    $('retry').classList.toggle('hidden', phase !== 'done');
    const b = test && badgeOf(test.speed);
    $('testMsg').textContent = phase === 'pick' ? '속도를 고르면 시작해요.'
      : phase === 'ready' ? `${res.length + 1}번째 도전! 신호원이 "출발!" 하면 눌러요.`
      : phase === 'driving' ? '정지선 앞에서 손을 떼요!'
      : phase === 'judge' ? '기록원이 판정해요.'
      : wins() >= PASS ? '합격! 박수!' : '아깝다! 다시 도전해요.';
    if (phase === 'done') {
      $('resultBox').innerHTML = wins() >= PASS
        ? `<span class="m">${b.medal}</span><b>걸음마 시험 합격!</b><br>${b.name} 배지 · ${'⭐'.repeat(b.stars)}`
        : `<span class="m">💪</span><b>아깝다!</b><br>손을 조금 더 일찍 떼 보거나, 속도를 낮춰 도전해요.`;
    }
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  showStep(step);
  renderExp();
  renderTest();
})();
