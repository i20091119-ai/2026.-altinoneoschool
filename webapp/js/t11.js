// t11 순서대로 기억시키기 (21–22차시) — 기획서 docs/topics/t11.md
// ① 사람 로봇 놀이(명령 카드를 놓고 한 장씩 읽기 — 로봇은 안 움직임) → ② 블록으로 기억시키기(한 칸 맞추기,
// 블록 실행, 되풀이 규칙 찾기) → ③ 버그 고치기 미션(틀린 순서를 실행해 보고 고치기, 미션 3개)
// ❗ 회전 센서·자이로가 없어 '한 칸'·'돌기'는 시간으로만 만든다(03 §10). 로봇별 보정은 이 앱의 저장값(cal)에 —
//    t14 와 공용(kit)으로 할지는 열린 결정(10 §7-4).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't11',
    title: '순서대로 기억시키기',
    onRunEnd: endRun,
    onTick: () => { if (running && !kit.running) endRun(); },   // kit.stop()·화면 이탈로 끝난 실행 정리
  });

  const SPEED = 300;            // 03 §1 순항
  const STEER = 127;            // 03 §1 ±127 제자리급 회전
  const GAP_MS = 300;           // 블록 사이 쉼 — 아이들이 눈으로 따라갈 수 있게
  const MAX_BLOCKS = 12;
  const SYM = { F: '↑', L: '←', R: '→' };
  const NAME = { F: '앞으로 한 칸', L: '왼쪽으로 돌기', R: '오른쪽으로 돌기' };
  // 격자: x = -1~3 (5칸), y = 0~3 (4칸). 출발 (0,0) 위쪽을 보고 시작. 방향 0=위 1=오른쪽 2=아래 3=왼쪽
  const X0 = -1, X1 = 3, Y1 = 3, START = { x: 0, y: 0, d: 0 };
  const DX = [0, 1, 0, -1], DY = [1, 0, -1, 0];
  // ① 코스 — 활동지 1번(교사용): ↑↑→↑ = 도착점, ↑→↑↑←↑ = 보물 칸
  const GOALS1 = [{ k: 'goal', name: '도착점', x: 1, y: 2, icon: '🚩' }, { k: 'treasure', name: '보물 칸', x: 2, y: 2, icon: '💎' }];
  // ② 코스 — 활동지 2번: ↑↑→↑↑→ (↑↑→ 가 2번 되풀이)
  const GOAL2 = { x: 2, y: 2, icon: '🚩', name: '도착점' };
  // ③ 미션 카드 — PPT·활동지와 같다(_작업도구/t11.py MISSIONS). goal 은 바른 순서로 가는 칸
  const MISSIONS = [
    { bug: 'FFLF', fix: 'FFRF' },
    { bug: 'FRF', fix: 'FRFF' },
    { bug: 'RFFFF', fix: 'FFRFF' },
  ].map(m => ({ ...m, goal: simulate(m.fix.split('')).end }));

  // ── 흉내 내기(화면 지도) ─────────────────────────────────────────
  function simulate(seq) {
    let p = { ...START }; const path = [p]; let off = -1;
    seq.forEach((b, i) => {
      if (off >= 0) return;
      if (b === 'F') p = { x: p.x + DX[p.d], y: p.y + DY[p.d], d: p.d };
      else p = { ...p, d: (p.d + (b === 'R' ? 1 : 3)) % 4 };
      if (p.x < X0 || p.x > X1 || p.y < 0 || p.y > Y1) off = i;
      path.push(p);
    });
    return { path, end: path[path.length - 1], off };
  }
  const at = (p, g) => p.x === g.x && p.y === g.y;
  const clean = (a) => Array.isArray(a) ? a.filter(b => SYM[b]).slice(0, MAX_BLOCKS) : [];
  const symbols = (seq) => seq.map(b => SYM[b]).join(' ');

  // 되풀이 규칙: 같은 묶음이 2번 이상 이어지면 { unit, times }
  function repeatOf(seq) {
    for (let n = 1; n <= seq.length / 2; n++) {
      if (seq.length % n) continue;
      const unit = seq.slice(0, n);
      if (seq.every((b, i) => b === unit[i % n])) return { unit, times: seq.length / n };
    }
    return null;
  }

  function drawMap(el, path, upto, goals) {
    const shown = path.slice(0, upto + 1), bot = shown[shown.length - 1];
    el.innerHTML = '';
    for (let y = Y1; y >= 0; y--) for (let x = X0; x <= X1; x++) {
      const c = document.createElement('div');
      const g = goals.find(q => q.x === x && q.y === y);
      if (x === START.x && y === START.y) { c.classList.add('start'); c.innerHTML = '<span class="tag">출발</span>'; }
      if (g) { c.classList.add('goal'); c.innerHTML += `${g.icon}<span class="tag">${g.name}</span>`; }
      if (shown.some(p => p.x === x && p.y === y)) c.classList.add('trail');
      if (bot.x === x && bot.y === y) c.innerHTML += `<span class="bot" style="transform:rotate(${bot.d * 90}deg)">▲</span>`;
      el.appendChild(c);
    }
  }

  // ── 블록 편집기 (① 카드 · ②③ 블록 공용) ─────────────────────────
  // 블록을 누르면 고르기 → 팔레트는 고른 블록 뒤에 끼운다(없으면 맨 뒤). 빼기·옮기기로 버그를 고친다.
  function makeEditor(pre, getSeq, setSeq, onChange) {
    let sel = -1, now = -1, locked = false;
    ['F', 'L', 'R'].forEach(b => {
      const el = document.createElement('button'); el.dataset.b = b;
      el.innerHTML = `<b>${SYM[b]}</b>${NAME[b]}`;
      el.onclick = () => {
        if (locked) return;
        const s = getSeq(); if (s.length >= MAX_BLOCKS) { kit.toast(`블록은 ${MAX_BLOCKS}개까지 놓을 수 있어요`); return; }
        const at = sel >= 0 ? sel + 1 : s.length;
        s.splice(at, 0, b); sel = at; setSeq(s); onChange();
      };
      $('pal' + pre).appendChild(el);
    });
    const acts = [['del', '빼기'], ['left', '◀ 옮기기'], ['right', '옮기기 ▶'], ['clear', '모두 지우기']];
    acts.forEach(([k, t]) => { const el = document.createElement('button'); el.dataset.k = k; el.textContent = t; $('acts' + pre).appendChild(el); });
    $('acts' + pre).onclick = async (e) => {
      const k = e.target.dataset && e.target.dataset.k; if (!k || locked) return;
      const s = getSeq();
      if (k === 'clear') {
        if (s.length && !await kit.confirm({ title: '블록을 모두 지울까요?', lines: [symbols(s)], okText: '네, 지우기', danger: true })) return;
        s.length = 0; sel = -1;
      } else if (sel < 0) return;
      else if (k === 'del') { s.splice(sel, 1); sel = Math.min(sel, s.length - 1); }
      else if (k === 'left' && sel > 0) { [s[sel - 1], s[sel]] = [s[sel], s[sel - 1]]; sel--; }
      else if (k === 'right' && sel < s.length - 1) { [s[sel + 1], s[sel]] = [s[sel], s[sel + 1]]; sel++; }
      setSeq(s); onChange();
    };
    const ed = {
      render() {
        const s = getSeq(), strip = $('strip' + pre);
        if (sel >= s.length) sel = s.length - 1;
        strip.innerHTML = s.length ? '' : '<span class="empty">위의 블록을 눌러 순서대로 놓아요</span>';
        s.forEach((b, i) => {
          const el = document.createElement('button'); el.dataset.i = i;
          el.innerHTML = `<i>${i + 1}</i>${SYM[b]}`;
          el.className = (i === sel && !locked ? 'sel ' : '') + (i === now ? 'now ' : '') + (now >= 0 && i < now ? 'done' : '');
          el.onclick = () => { if (locked) return; sel = sel === i ? -1 : i; onChange(); };
          strip.appendChild(el);
        });
        $('acts' + pre).querySelectorAll('button').forEach(el => { el.disabled = locked || (el.dataset.k !== 'clear' && sel < 0) || (el.dataset.k === 'clear' && !s.length); });
        $('pal' + pre).querySelectorAll('button').forEach(el => { el.disabled = locked; });
      },
      setNow(i) { now = i; },
      lock(v) { locked = v; if (v) sel = -1; },
      deselect() { sel = -1; },
    };
    return ed;
  }

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== Math.min(n, 2)));
    showCal(false); judging = false;
    ed2.deselect(); ed2.setNow(-1); simAt = -1;
    $('fb2').textContent = '';
    render2();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── ① 사람 로봇 놀이 ────────────────────────────────────────────
  let seq1 = clean(kit.store.get('seq1', []));
  let att1 = kit.store.get('att1', []); if (!Array.isArray(att1)) att1 = [];
  let goal1 = kit.store.get('goal1', 'goal'); if (!GOALS1.some(g => g.k === goal1)) goal1 = 'goal';
  let read1 = -1;   // 몇 장째 읽었나(-1 = 처음 자리)
  const ed1 = makeEditor('1', () => seq1, (s) => { seq1 = s; kit.store.set('seq1', s); read1 = -1; ed1.setNow(-1); }, render1);
  GOALS1.forEach(g => {
    const b = document.createElement('button'); b.dataset.k = g.k; b.textContent = `${g.icon} ${g.name}까지`;
    b.onclick = () => { goal1 = g.k; kit.store.set('goal1', g.k); render1(); };
    $('goal1Chips').appendChild(b);
  });
  $('read1').onclick = () => {
    if (!seq1.length) { kit.toast('카드를 먼저 놓아요'); return; }
    if (read1 >= seq1.length - 1) return;
    read1++; ed1.deselect(); ed1.setNow(read1 + 1 >= seq1.length ? seq1.length : read1);
    kit.signal('notice'); render1();
  };
  $('rewind1').onclick = () => { read1 = -1; ed1.setNow(-1); render1(); };
  $('rec1').onclick = () => {
    const r = simulate(seq1), end = r.end;
    const hit = GOALS1.find(g => at(end, g));
    const okay = r.off < 0 && !!hit && hit.k === goal1;
    att1.push({ seq: symbols(seq1), where: r.off >= 0 ? '길 밖' : hit ? hit.name : '다른 칸', ok: okay });
    if (att1.length > 6) att1.shift();
    kit.store.set('att1', att1); kit.signal(okay ? 'success' : 'fail');
    read1 = -1; ed1.setNow(-1); render1();
  };
  function render1() {
    document.querySelectorAll('#goal1Chips button').forEach(b => b.classList.toggle('on', b.dataset.k === goal1));
    ed1.render();
    const r = simulate(seq1), upto = Math.min(read1 + 1, r.path.length - 1);
    drawMap($('map1'), r.path, upto, GOALS1);
    const g = GOALS1.find(q => q.k === goal1), done = read1 >= seq1.length - 1 && seq1.length > 0;
    $('say1').textContent = read1 < 0 ? `${g.name}까지 가는 카드를 놓고, 한 장씩 읽어 줘요.`
      : r.off >= 0 && read1 >= r.off ? '앗, 길 밖으로 나가요!'
      : !done ? `${read1 + 1}번째 카드: ${NAME[seq1[read1]]}`
      : at(r.end, g) ? `${g.name} 도착! 🎉 📝 기록하기를 눌러요.` : '도착점이 아니에요. 어느 카드가 달라야 할까요?';
    $('read1').disabled = !seq1.length || done;
    $('rec1').disabled = !done;
    $('tab1').innerHTML = '<tr><th>도전</th><th>명령 카드 순서</th><th>도착한 곳</th><th>성공</th></tr>' +
      att1.slice(-3).map((a, i) => `<tr><td>${att1.length - Math.min(3, att1.length) + i + 1}번째</td><td>${a.seq}</td><td>${a.where}</td><td>${a.ok ? 'O' : 'X'}</td></tr>`).join('');
  }

  // ── ②③ 블록 실행 ───────────────────────────────────────────────
  let cellMs = kit.store.num('cellMs', 1000, 300, 3000), turnMs = kit.store.num('turnMs', 700, 200, 2000);
  let seq2 = clean(kit.store.get('seq2', []));
  let mis = kit.store.get('mis', null); if (!Array.isArray(mis) || mis.length !== 3) mis = MISSIONS.map(m => ({ seq: m.bug.split(''), solved: false }));
  mis.forEach((m, i) => { m.seq = clean(m.seq); if (!m.seq.length && !m.solved) m.seq = MISSIONS[i].bug.split(''); });
  let mi = kit.store.num('mi', 0, 0, 2);
  let done2 = kit.store.get('done2', null);   // { seq, rep } — 코스 완주한 순서
  let running = false, simAt = -1, judging = false, runSeq = null;
  const curSeq = () => step === 3 ? mis[mi].seq : seq2;
  const curGoal = () => step === 3 ? { ...MISSIONS[mi].goal, icon: '🚩', name: `미션 ${mi + 1}` } : GOAL2;
  const ed2 = makeEditor('2', curSeq, (s) => {
    if (step === 3) { mis[mi].seq = s; kit.store.set('mis', mis); } else { seq2 = s; kit.store.set('seq2', s); }
    simAt = -1; ed2.setNow(-1); judging = false; $('fb2').textContent = '';
  }, render2);

  // 블록 하나를 알티노로 — 앞으로: 속도 300 × 한 칸 시간 / 돌기: 앞으로 꺾기 + 뒤로 반대로 꺾기(제자리 가까이)
  async function doBlock(r, b) {
    const phases = b === 'F' ? [[SPEED, 0, cellMs]]
      : [[SPEED, (b === 'R' ? 1 : -1) * STEER, turnMs], [-SPEED, (b === 'R' ? -1 : 1) * STEER, turnMs]];
    for (const [sp, st, ms] of phases) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        r.drive(sp, st);
        if (!await r.sleep(50)) return false;
      }
      r.drive(0, 0);
      if (!await r.sleep(150)) return false;
    }
    return true;
  }

  function execute(onRobot) {
    const seq = curSeq().slice();
    if (!seq.length) { kit.toast('블록을 먼저 놓아요'); return; }
    const sim = simulate(seq);
    const ok = kit.run(async (r) => {
      running = true; runSeq = seq; judging = false; ed2.lock(true); simAt = 0; ed2.setNow(-1); render2();
      if (onRobot) { kit.signal('start'); $('fb2').textContent = '준비…'; $('fb2').className = 'fb'; if (!await r.sleep(1000)) return; }
      for (let i = 0; i < seq.length; i++) {
        ed2.setNow(i); $('fb2').textContent = `${i + 1}번째 블록: ${NAME[seq[i]]}`; render2();
        if (onRobot) { if (!await doBlock(r, seq[i])) return; }
        else if (!await r.sleep(600)) return;
        simAt = i + 1; render2();
        if (sim.off === i) { r.drive(0, 0); finish(seq, sim, onRobot, true); return; }
        if (!await r.sleep(GAP_MS)) return;
      }
      r.drive(0, 0);
      finish(seq, sim, onRobot, false);
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  }
  function finish(seq, sim, onRobot, offRoad) {
    running = false; ed2.setNow(seq.length); ed2.lock(false);
    const g = curGoal(), reached = !offRoad && at(sim.end, g);
    if (offRoad) { kit.signal('fail'); say(`앗, ${sim.off + 1}번째 블록에서 길 밖으로 나가요! 그 블록을 살펴봐요.`, false); }
    else if (!reached) { kit.signal('fail'); say(`${g.name}에 못 갔어요. 블록을 하나씩 짚으며 어디서 길을 잘못 들었는지 찾아요.`, false); }
    else {
      kit.signal('success');
      if (step === 3) {
        mis[mi].solved = true; kit.store.set('mis', mis);
        say(`미션 ${mi + 1} 해결! 🎉 고친 순서를 활동지에 적어요.`, true);
      } else {
        const rep = repeatOf(seq);
        done2 = { seq: symbols(seq), rep: rep ? `'${symbols(rep.unit)}'가 ${rep.times}번 되풀이` : '' };
        kit.store.set('done2', done2);
        say('도착점까지 완주! 🎉' + (rep ? ` 되풀이 규칙: ${done2.rep}돼요.` : ''), true);
      }
      checkStars();
    }
    judging = onRobot && reached;      // 블록이 맞으면 진짜 알티노도 갔는지 사람이 본다 — 순서 실수와 이동 오차를 나눈다
    render2();
  }
  function say(t, good) { $('fb2').textContent = t; $('fb2').className = 'fb ' + (good ? 'ok' : 'no'); }
  function endRun() {
    if (running) { running = false; ed2.lock(false); ed2.setNow(-1); simAt = -1; say('멈췄어요. 다시 실행할 수 있어요.', false); }
    render2();
  }
  $('run2').onclick = () => execute(true);
  $('sim2').onclick = () => execute(false);
  $('stop2').onclick = () => { kit.stop(); endRun(); };
  $('judgeOk').onclick = () => { judging = false; kit.dot.icon('smile'); say('블록 순서도, 알티노도 완벽해요! 👏', true); render2(); };
  $('judgeNo').onclick = () => { judging = false; say('블록 순서는 맞아요! 알티노의 한 칸이 달라서 그래요 → 📏 한 칸 맞추기를 해 봐요.', false); render2(); };

  // 미션 카드
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button'); b.dataset.i = i; b.textContent = `미션 ${i + 1}`;
    b.onclick = () => { if (running) return; mi = i; kit.store.set('mi', i); simAt = -1; ed2.deselect(); ed2.setNow(-1); judging = false; $('fb2').textContent = ''; render2(); };
    $('missionChips').appendChild(b);
  });

  function render2() {
    const m3 = step === 3, seq = curSeq(), g = curGoal();
    $('edTitle').textContent = m3 ? '🐞 버그를 그대로 실행해 보고, 블록을 고쳐요' : '🧱 블록을 순서대로 놓아 길을 기억시켜요';
    $('missionChips').classList.toggle('hidden', !m3);
    document.querySelectorAll('#missionChips button').forEach(b => { const i = +b.dataset.i; b.classList.toggle('on', i === mi); b.classList.toggle('done', !!mis[i].solved); });
    ed2.render();
    $('run2').classList.toggle('hidden', running); $('sim2').classList.toggle('hidden', running);
    $('stop2').classList.toggle('hidden', !running);
    $('run2').disabled = $('sim2').disabled = !seq.length;
    $('judge2').classList.toggle('hidden', !judging);
    $('calOpen').classList.toggle('hidden', m3);
    $('mapTitle').textContent = m3 ? `🗺 미션 ${mi + 1} — 🚩까지 가요` : '🗺 출발점 → 🚩 도착점';
    const sim = simulate(running || simAt >= 0 ? (runSeq || seq) : seq);
    drawMap($('map2'), sim.path, simAt < 0 ? 0 : Math.min(simAt, sim.path.length - 1), [g]);
    if (m3) {
      $('say2').textContent = `버그: ${symbols(MISSIONS[mi].bug.split(''))}`;
      $('tab3').innerHTML = '<tr><th>미션</th><th>버그</th><th>고친 순서</th><th>해결</th></tr>' +
        MISSIONS.map((q, i) => `<tr><td>${i + 1}</td><td>${symbols(q.bug.split(''))}</td><td>${mis[i].solved ? symbols(mis[i].seq) : ''}</td><td>${mis[i].solved ? 'O' : ''}</td></tr>`).join('');
    } else {
      $('say2').textContent = done2 ? `완주한 순서: ${done2.seq}` + (done2.rep ? ` · ${done2.rep}` : '') : '되풀이되는 블록이 있으면 찾아 줄게요.';
    }
    $('tab3').classList.toggle('hidden', !m3);
  }

  // ── 한 칸 맞추기 ────────────────────────────────────────────────
  function showCal(on) {
    if (!on && kit.running && !running) kit.stop();
    $('calView').classList.toggle('hidden', !on); $('mapView').classList.toggle('hidden', on);
    renderCal();
  }
  $('calOpen').onclick = () => { if (running) return; showCal(true); };
  $('calClose').onclick = () => showCal(false);
  $('calStop').onclick = () => kit.stop();
  const setCal = (k, v) => {
    if (k === 'cell') { cellMs = Math.max(300, Math.min(3000, v)); kit.store.set('cellMs', cellMs); }
    else { turnMs = Math.max(200, Math.min(2000, v)); kit.store.set('turnMs', turnMs); }
    renderCal();
  };
  $('cellMinus').onclick = () => setCal('cell', cellMs - 100);
  $('cellPlus').onclick = () => setCal('cell', cellMs + 100);
  $('turnMinus').onclick = () => setCal('turn', turnMs - 50);
  $('turnPlus').onclick = () => setCal('turn', turnMs + 50);
  const tryBlock = (b) => {
    const ok = kit.run(async (r) => { kit.signal('start'); if (!await r.sleep(800)) return; if (!await doBlock(r, b)) return; r.drive(0, 0); });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('cellTry').onclick = () => tryBlock('F');
  $('turnTry').onclick = () => tryBlock('R');
  function renderCal() { $('cellVal').textContent = (cellMs / 1000).toFixed(1) + '초'; $('turnVal').textContent = (turnMs / 1000).toFixed(2) + '초'; }

  // ── 별·성장기록부 — 코스 완주 ⭐ · 되풀이 규칙 찾기 ⭐⭐ · 미션 3개 해결 ⭐⭐⭐ ──
  function checkStars() {
    const solved = mis.filter(m => m.solved).length;
    const stars = solved === 3 ? 3 : done2 && done2.rep ? 2 : done2 ? 1 : 0;
    const best = kit.store.num('bestStars', 0, 0, 3);
    if (stars <= best) return;           // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
    kit.store.set('bestStars', stars);
    kit.record.add({
      title: stars === 3 ? '버그를 모두 고쳤어요' : '블록으로 길을 기억시켰어요',
      detail: [done2 && `코스 완주 ${done2.seq}`, done2 && done2.rep, solved && `미션 ${solved}개 해결`].filter(Boolean).join(' · '),
      stars,
    });
    kit.toast(['', '🏅 도전 배지!', '🏅 실력 배지!', '🏅 박사 배지!'][stars]);
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  render1();
  showStep(step);
})();
