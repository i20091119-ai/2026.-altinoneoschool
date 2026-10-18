// t14 보물 지도 탐험 (27–28차시) — 기획서 docs/topics/t14.md
// ① 지도 읽기(방위·지도 기호) → ② 경유지 1곳(출발 → 경유지 → 도착지) → ③ 탐험 시험(경유지 2곳 + 도착지, 기록원 판정, 보물 카드)
// t11(순서대로 기억시키기)의 블록 실행을 복사해 🚩 힌트 블록을 더했다. 🚩 = 그 자리에 멈추고 도트에 힌트 그림.
// 회전 센서·자이로가 없어 '한 칸'·'꺾기'는 시간으로만 움직인다(10 §4) → 교사 보정값을 이 앱에 둔다(altino.t14.*).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let step = 1, phase = 'idle';          // idle | running | finished | judge

  const kit = AltinoKit.create({
    appId: 't14',
    title: '보물 지도 탐험',
    onRunEnd: endRun,
    // kit.stop()(멈춰·화면 이탈) 뒤에는 onRunEnd 가 오지 않는다 → 화면 상태를 여기서 되돌린다
    onTick: () => { if (!kit.running && phase === 'running') endRun(); },
  });

  const SPEED = 300;                     // 순항 (03 §1)
  const STEER = 127;                     // 꺾기 — 최대 조향 (03 §1)
  const PAUSE = 300;                     // 블록 사이 쉼
  const HINT_MS = 2000;                  // 🚩 힌트 블록에서 멈춰 있는 시간
  const MAX_BLOCKS = 12;
  const N = 4;                           // 지도 4×4
  let FWD_MS = kit.store.num('calF', 1000, 400, 2000);   // 블록당 1초(설계원리서 P10 과 같은 규칙) — 현장 보정
  let TURN_MS = kit.store.num('calT', 1000, 400, 2500);  // ⚠ 실측 전 기본값 — 90° 가 되게 현장에서 맞춘다
  const BLOCKS = {
    F: { icon: '⬆', name: '앞으로' },
    L: { icon: '↰', name: '왼쪽 꺾기' },
    R: { icon: '↱', name: '오른쪽 꺾기' },
    H: { icon: '🚩', name: '힌트' },
  };
  const ARROW = ['⬆', '➡', '⬇', '⬅'];   // 방향 0 북 · 1 동 · 2 남 · 3 서 (지도 위쪽 = 북)

  // 도트 힌트 그림 — 8바이트, 바이트 = 행(위→아래), 비트7 = 맨 왼쪽 (03 §5)
  const HINTS = {
    flag:  { name: '깃발', card: '🚩 깃발', rows: [0x40, 0x7C, 0x7E, 0x7C, 0x40, 0x40, 0x40, 0xE0] },
    key:   { name: '열쇠', card: '🗝️ 열쇠', rows: [0x00, 0x70, 0x88, 0x8F, 0x89, 0x70, 0x00, 0x00] },
    chest: { name: '보물상자', card: '💎 보물', rows: [0x00, 0x7E, 0x81, 0xFF, 0x99, 0x81, 0xFF, 0x00] },
  };
  // k 번째 🚩 의 힌트: 경유지는 깃발 → 열쇠, 마지막(도착지)은 언제나 보물상자
  const hintOf = (k, n) => (k === n - 1 ? 'chest' : k === 0 ? 'flag' : 'key');

  // 보물 지도 — 칸 (x, y), y=0 이 맨 위(북)
  const LM = {
    home:   { e: '🏠', n: '우리 집', x: 0, y: 3 },
    school: { e: '🏫', n: '학교',   x: 2, y: 3 },
    fire:   { e: '🚒', n: '소방서', x: 1, y: 2 },
    hosp:   { e: '🏥', n: '병원',   x: 3, y: 2 },
    post:   { e: '📮', n: '우체국', x: 0, y: 1 },
    lib:    { e: '📚', n: '도서관', x: 2, y: 1 },
    park:   { e: '🌳', n: '공원',   x: 1, y: 0 },
    museum: { e: '🏛️', n: '박물관', x: 3, y: 0 },
  };
  const START = [0, 3];                  // 우리 집에서 북쪽을 보고 출발
  const lmAt = (x, y) => Object.keys(LM).find(k => LM[k].x === x && LM[k].y === y);
  const PRACTICE = [
    { id: 'p1', name: '연습 1', stops: ['post', 'lib'], dirs: ['북쪽 2칸', '동쪽 2칸'] },
    { id: 'p2', name: '연습 2', stops: ['school', 'hosp'], dirs: ['동쪽 2칸', '동쪽 1칸 → 북쪽 1칸'] },
  ];
  const EXAM = [
    { id: 'A', name: '탐험 A', stops: ['post', 'lib', 'hosp'] },
    { id: 'B', name: '탐험 B', stops: ['school', 'hosp', 'museum'] },
    { id: 'C', name: '탐험 C', stops: ['post', 'park', 'museum'] },
  ];
  const DIRK = { N: '북', E: '동', S: '남', W: '서' };
  const QUIZ = [
    { q: '📮 우체국은 🏠 우리 집에서 어느 쪽에 있나요?', a: 'N' },
    { q: '🏫 학교는 🏠 우리 집에서 어느 쪽에 있나요?', a: 'E' },
    { q: '📚 도서관에서 남쪽으로 2칸 가면 어디일까요? 지도에서 눌러요.', a: 'school' },
    { q: '🌳 공원은 🏛️ 박물관에서 어느 쪽에 있나요?', a: 'W' },
    { q: '📮 우체국에서 동쪽으로 2칸 가면 어디일까요? 지도에서 눌러요.', a: 'lib' },
    { q: '🏥 병원은 🏛️ 박물관에서 어느 쪽에 있나요?', a: 'S' },
  ];

  let mi = { 2: 0, 3: 0 };               // 단계별 고른 코스
  let prog, done, tries, got, qi, lastSim = null, jk = 0, pick = null;
  function load() {
    prog = kit.store.get('prog', []);
    if (!Array.isArray(prog)) prog = [];
    prog = prog.filter(b => BLOCKS[b]).slice(0, MAX_BLOCKS);
    done = kit.store.get('done', {});    // { p1:true, A:true }
    if (!done || typeof done !== 'object') done = {};
    tries = kit.store.get('tries', {});  // 탐험별 실행 횟수
    if (!tries || typeof tries !== 'object') tries = {};
    got = kit.store.get('got', {});      // 탐험별 가장 많이 얻은 보물 카드 수
    if (!got || typeof got !== 'object') got = {};
    qi = kit.store.num('qi', 0, 0, QUIZ.length);
  }
  load();
  const save = () => kit.store.set('prog', prog);
  const course = () => (step === 2 ? PRACTICE[mi[2]] : step === 3 ? EXAM[mi[3]] : null);
  const stopName = (k) => `${LM[k].e} ${LM[k].n}`;
  const batchim = (w) => kit.josa(w, '이가').endsWith('이');
  const iga = (k) => stopName(k) + (batchim(LM[k].n) ? '이' : '가');          // 학교가 · 우체국이
  const ieyo = (k) => stopName(k) + (batchim(LM[k].n) ? '이에요' : '예요');   // 학교예요 · 우체국이에요

  // ── 단계 ─────────────────────────────────────────────────────────
  step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n); phase = 'idle'; lastSim = null; pick = null; $('dotNow').classList.add('hidden');
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    $('stars').textContent = '';
    renderMissions(); render();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  function renderMissions() {
    const list = step === 2 ? PRACTICE : step === 3 ? EXAM : [];
    $('missions').classList.toggle('hidden', !list.length);
    $('missions').innerHTML = '';
    list.forEach((m, i) => {
      const b = document.createElement('button'); b.textContent = m.name;
      b.classList.toggle('on', mi[step] === i); b.classList.toggle('done', !!done[m.id]);
      b.onclick = () => { if (phase === 'running' || phase === 'judge') return; mi[step] = i; phase = 'idle'; lastSim = null; $('stars').textContent = ''; renderMissions(); render(); };
      $('missions').appendChild(b);
    });
    const c = course();
    if (step === 1) $('mission').textContent = '🧭 지도의 위쪽은 북쪽이에요. 방위와 그림 기호로 지도를 읽어 봐요.';
    else if (step === 2) $('mission').textContent = `🚩 ${stopName(c.stops[0])}에 들렀다가 ${stopName(c.stops[1])}까지! 도착할 때마다 🚩 를 놓아요.`;
    else $('mission').textContent = `🏝️ ${c.stops.map(stopName).join(' → ')} 순서로 탐험해요!`;
    // 구간 — 긴 길을 나누어 생각하게 하는 장치(설계원리서 P13 '분해')
    if (c) {
      const from = ['home', ...c.stops];
      $('segs').innerHTML = c.stops.map((s, k) => `<span class="s${k}">구간 ${k + 1} ${LM[from[k]].e}→${LM[s].e}${step === 2 ? ` <i>${c.dirs[k]}</i>` : ''}</span>`).join('');
    }
    if (phase === 'idle' && !lastSim) {
      $('say').textContent = step === 1 ? '' : step === 2 ? '구간 1 블록 → 🚩 → 구간 2 블록 → 🚩 순서로 쌓아요.' : '구간마다 나누어 생각하고, 예상 경로를 지도 활동지에 먼저 그려요.';
    }
  }

  // ── ① 지도 읽기 ──────────────────────────────────────────────────
  function renderQuiz() {
    const fin = qi >= QUIZ.length, q = QUIZ[qi];
    $('qnum').textContent = fin ? '지도 읽기 끝!' : `문제 ${qi + 1} / ${QUIZ.length}`;
    $('qtext').textContent = fin ? '🎉 방위와 지도 기호를 잘 읽었어요. ② 경유지 1곳으로 가요!' : q.q;
    const isDir = !fin && DIRK[q.a];
    document.querySelectorAll('#dirs button').forEach(b => { b.disabled = !isDir; });
    $('quizAgain').classList.toggle('hidden', !fin);
  }
  function answer(v) {
    if (step !== 1 || qi >= QUIZ.length) return;
    const q = QUIZ[qi];
    if (v === q.a) {
      kit.signal('success'); qi++; kit.store.set('qi', qi);
      $('say').textContent = DIRK[v] ? `맞아요! ${DIRK[v]}쪽이에요. 👍` : `맞아요! ${ieyo(v)}. 👍`;
    } else {
      kit.signal('fail');
      $('say').textContent = DIRK[q.a] ? '아깝다! 지도 위쪽이 북쪽, 오른쪽이 동쪽이에요. 다시 골라 봐요.' : '아깝다! 출발한 곳에서 한 칸씩 손가락으로 세어 봐요.';
    }
    renderQuiz(); renderMap();
  }
  document.querySelectorAll('#dirs button').forEach(b => { b.onclick = () => answer(b.dataset.d); });
  $('quizAgain').onclick = () => { qi = 0; kit.store.set('qi', 0); $('say').textContent = ''; renderQuiz(); };
  Object.entries(HINTS).forEach(([k, h]) => {
    const b = document.createElement('button'); b.dataset.h = k;
    b.innerHTML = miniDot(h.rows) + h.name;
    b.onclick = () => { if (phase === 'running') return; kit.dot.bytes(h.rows); showDot(h); $('say').textContent = `알티노 도트에 ${h.name} 그림이 떴어요.`; };
    $('hints').appendChild(b);
  });
  // 화면에도 지금 도트 그림을 보여 준다(교실 앞 화면·PPT 에서 보이게)
  const hideDot = () => $('dotNow').classList.add('hidden');
  function showDot(h) { $('dotNow').innerHTML = miniDot(h.rows) + `<span>도트: ${h.name}</span>`; $('dotNow').classList.remove('hidden'); }
  function miniDot(rows) {
    let s = '<span class="mini">';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += `<i class="${(rows[y] >> (7 - x)) & 1 ? 'on' : ''}"></i>`;
    return s + '</span>';
  }

  // ── 블록 ─────────────────────────────────────────────────────────
  Object.entries(BLOCKS).forEach(([k, b]) => {
    const el = document.createElement('button'); el.dataset.k = k;
    if (k === 'H') el.classList.add('flag');
    el.innerHTML = `<b>${b.icon}</b>${b.name}`;
    el.onclick = () => {
      if (phase === 'running' || phase === 'judge') return;
      if (prog.length >= MAX_BLOCKS) { kit.toast(`블록은 ${MAX_BLOCKS}개까지예요`); return; }
      prog.push(k); save(); phase = 'idle'; lastSim = null; render();
    };
    $('palette').appendChild(el);
  });
  $('undo').onclick = () => { if (phase === 'running' || phase === 'judge') return; prog.pop(); save(); phase = 'idle'; lastSim = null; render(); };
  $('clear').onclick = async () => {
    if (phase === 'running' || phase === 'judge' || !prog.length) return;
    if (!await kit.confirm({ title: '블록을 모두 지울까요?', lines: [`지금 블록 ${prog.length}개`], okText: '네, 지우기' })) return;
    prog = []; save(); phase = 'idle'; lastSim = null; render();
  };
  // 블록마다 몇 번째 구간인가 — 🚩 까지가 한 구간
  function segOf() { let s = 0; return prog.map(b => { const k = s; if (b === 'H') s++; return k; }); }

  // ── 앱이 생각한 길 (꺾기 = 그 자리에서 방향만 바꾼다) ──────────────
  function simulate() {
    let [x, y] = START, d = 0, seg = 0; const path = [[x, y, 0]], flags = []; let out = false, outSeg = -1;
    for (const b of prog) {
      if (b === 'L') d = (d + 3) % 4;
      else if (b === 'R') d = (d + 1) % 4;
      else if (b === 'H') { flags.push([x, y]); seg++; }
      else {
        x += [0, 1, 0, -1][d]; y += [-1, 0, 1, 0][d];
        if (x < 0 || x >= N || y < 0 || y >= N) { out = true; outSeg = seg; break; }
        path.push([x, y, seg]);
      }
    }
    return { path, flags, end: [x, y], dir: d, out, outSeg };
  }
  // 앱의 판정 — 🚩 가 차례대로 경유지·도착지 칸에 있는가
  function check(sim, c) {
    const n = c.stops.length;
    if (sim.out) return { ok: false, msg: `지도 밖으로 나가요! 구간 ${sim.outSeg + 1} 블록을 살펴봐요.` };
    for (let k = 0; k < Math.min(n, sim.flags.length); k++) {
      const s = LM[c.stops[k]], f = sim.flags[k];
      if (f[0] !== s.x || f[1] !== s.y) return { ok: false, msg: `🚩 ${k + 1}번 자리가 ${iga(c.stops[k])} 아니에요. 구간 ${k + 1} 블록을 고쳐 봐요.` };
    }
    if (sim.flags.length < n) return { ok: false, msg: `🚩 힌트 블록이 ${n - sim.flags.length}개 모자라요. 도착할 때마다 🚩 를 놓아요.` };
    if (sim.flags.length > n) return { ok: false, msg: `🚩 가 ${sim.flags.length - n}개 더 있어요. 들를 곳은 ${n}곳이에요.` };
    if (prog[prog.length - 1] !== 'H') return { ok: false, msg: '마지막 🚩 뒤에 블록이 남았어요. 도착지에서 🚩 로 끝내요.' };
    return { ok: true, msg: '' };
  }
  function renderMap() {
    const c = course(), sim = lastSim;
    $('map').innerHTML = '';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cell = document.createElement('div'); cell.dataset.x = x; cell.dataset.y = y;
      const k = lmAt(x, y), si = c ? c.stops.indexOf(k) : -1;
      if (si >= 0) cell.classList.add('stop');
      const hit = sim && sim.path.filter(([a, b]) => a === x && b === y).pop();
      if (hit) cell.classList.add('path', 's' + Math.min(hit[2], 3));
      if (pick === k && k) cell.classList.add('pick');
      let html = k ? `${LM[k].e}<small>${LM[k].n}</small>` : '';
      if (si >= 0) html += `<em>${si === c.stops.length - 1 ? '도착' : '경유 ' + (si + 1)}</em>`;
      if (x === START[0] && y === START[1] && c) html += '<em style="background:var(--mint)">출발</em>';
      if (c && sim && !sim.out && sim.end[0] === x && sim.end[1] === y) html += `<span class="bot">${ARROW[sim.dir]}</span>`;
      else if (c && !sim && x === START[0] && y === START[1]) html += '<span class="bot">⬆</span>';
      cell.innerHTML = html;
      cell.onclick = () => {
        if (step !== 1) return;
        if (!k) { $('say').textContent = '빈 길이에요.'; return; }
        pick = k;
        if (qi < QUIZ.length && !DIRK[QUIZ[qi].a]) answer(k);
        else { $('say').textContent = `${stopName(k)} — 지도에서는 그림 기호로 나타내요.`; renderMap(); }
      };
      $('map').appendChild(cell);
    }
    if (sim && sim.out) [...$('map').children].forEach(el => el.classList.add('out'));
  }

  // ── 실행 ─────────────────────────────────────────────────────────
  $('runBtn').onclick = () => {
    if (phase === 'judge') return;
    if (!prog.length) { kit.toast('블록을 먼저 놓아요'); return; }
    const c = course(), n = c.stops.length;
    const ok = kit.run(async (r) => {
      phase = 'running'; lastSim = null; $('stars').textContent = ''; render();
      kit.signal('start'); kit.dot.clear(); $('dotNow').classList.add('hidden'); $('say').textContent = '준비…';
      if (!await r.sleep(1000)) return;                // 손을 로봇에서 뗄 시간 (05 §7)
      let k = 0;
      for (let i = 0; i < prog.length; i++) {
        const b = prog[i]; markNow(i);
        if (b === 'H') {                                // 🚩 그 자리에 멈춰 도트에 힌트 그림
          r.drive(0, 0);
          const h = k < n ? HINTS[hintOf(k, n)] : null;
          if (h) { kit.dot.bytes(h.rows); showDot(h); } else kit.dot.icon('ask');
          kit.signal('notice');
          $('say').textContent = h ? `🚩 ${k + 1}번 도착 표시 — 도트에 ${h.name} 힌트!` : '🚩 들를 곳보다 많아요.';
          k++;
          if (!await r.sleep(HINT_MS)) return;
          continue;
        }
        $('say').textContent = `${i + 1}번 블록: ${BLOCKS[b].name}`;
        const ms = b === 'F' ? FWD_MS : TURN_MS;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          r.drive(SPEED, b === 'L' ? -STEER : b === 'R' ? STEER : 0);
          if (!await r.sleep(50)) return;
        }
        r.drive(0, 0);
        if (!await r.sleep(PAUSE)) return;
      }
      phase = 'finished';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('stopBtn').onclick = () => { kit.stop(); endRun(); };
  function markNow(i) { [...$('prog').querySelectorAll('span')].forEach((s, j) => s.classList.toggle('now', j === i)); }

  function endRun() {
    markNow(-1);
    if (phase === 'finished') { afterRun(); return; }
    if (phase === 'running') { phase = 'idle'; $('say').textContent = '멈췄어요. 🏠 출발 칸에 북쪽을 보게 놓고 다시 실행해요.'; }
    render();
  }
  function afterRun() {
    const c = course(); lastSim = simulate();
    const res = check(lastSim, c);
    if (step === 2) {
      phase = 'idle';
      if (res.ok) { done[c.id] = true; kit.store.set('done', done); kit.signal('success'); kit.dot.bytes(HINTS.chest.rows); showDot(HINTS.chest); $('say').textContent = '경유지를 들러 도착! 구간을 잘 나누었어요. 🎉'; }
      else { kit.signal('fail'); hideDot(); $('say').textContent = res.msg; }
      renderMissions();
    } else {
      tries[c.id] = (tries[c.id] || 0) + 1; kit.store.set('tries', tries);
      phase = 'judge'; jk = 0;
      $('say').textContent = res.ok ? '앱이 생각한 길로는 모두 도착해요! 진짜 알티노는요?' : '앱이 생각한 길: ' + res.msg;
    }
    render();
  }

  // ③ 기록원 판정 — 바닥 센서가 없어 도착은 사람이 본다(03 §10). 들른 차례대로 하나씩 묻는다.
  $('jO').onclick = () => {
    if (phase !== 'judge') return;
    const c = course(); jk++;
    kit.signal('success'); hideDot();                 // 도트는 ✓ (신호 사전)
    if (jk >= c.stops.length) { kit.dot.bytes(HINTS.chest.rows); showDot(HINTS.chest); finishJudge(jk); return; }
    render();
  };
  $('jX').onclick = () => { if (phase !== 'judge') return; finishJudge(jk); };
  function finishJudge(reached) {
    const c = course(), n = c.stops.length, t = tries[c.id] || 1;
    phase = 'idle';
    const stars = reached === n ? (t === 1 ? 3 : 2) : reached > 0 ? 1 : 0;
    if (reached > (got[c.id] || 0)) { got[c.id] = reached; kit.store.set('got', got); }
    if (reached === n) { done[c.id] = true; kit.store.set('done', done); }
    $('stars').textContent = '⭐'.repeat(stars);
    if (reached === n) $('say').textContent = t === 1 ? '한 번에 보물을 찾았어요! 보물 카드 3장! 🎉' : `고쳐서 성공! ${t}번 만에 보물을 찾았어요. 🎉`;
    else {
      kit.signal('fail'); hideDot();
      $('say').textContent = reached ? `보물 카드 ${reached}장! 구간 ${reached + 1} 블록을 고쳐서 다시 해 봐요.` : '괜찮아요! 구간 1 블록부터 예상 경로와 비교해 고쳐 봐요.';
    }
    const best = kit.store.num('best', 0, 0, 3);
    if (stars > best) {
      kit.store.set('best', stars);
      kit.record.add({ title: '보물 지도를 따라 탐험했어요', detail: `${c.name} · 보물 카드 ${reached}장 · ${t}번째 도전 · 블록 ${prog.length}개`, stars });
    }
    jk = reached; renderMissions(); render();
  }

  // ── 보정 (교사용) · 처음부터 ─────────────────────────────────────
  $('calF').value = FWD_MS; $('calT').value = TURN_MS;
  $('calToggle').onclick = () => $('calBox').classList.toggle('hidden');
  $('calF').addEventListener('change', () => { FWD_MS = Math.max(400, Math.min(2000, Math.round(+$('calF').value || 1000))); $('calF').value = FWD_MS; kit.store.set('calF', FWD_MS); });
  $('calT').addEventListener('change', () => { TURN_MS = Math.max(400, Math.min(2500, Math.round(+$('calT').value || 1000))); $('calT').value = TURN_MS; kit.store.set('calT', TURN_MS); });
  $('resetAll').onclick = async () => {
    if (phase === 'running') return;
    if (!await kit.confirm({ title: '처음부터 할까요?', lines: ['지도 읽기·블록·보물 카드가 지워져요.', '성장기록부와 보정값은 남아요.'], okText: '네, 처음부터', danger: true })) return;
    ['prog', 'done', 'tries', 'got', 'qi', 'step', 'best'].forEach(k => kit.store.remove(k));
    load(); mi = { 2: 0, 3: 0 }; $('say').textContent = ''; showStep(1);
  };

  // ── 그리기 ───────────────────────────────────────────────────────
  function render() {
    const running = phase === 'running', judging = phase === 'judge', c = course();
    $('quizBox').classList.toggle('hidden', step !== 1);
    $('codeBox').classList.toggle('hidden', step === 1);
    if (step === 1) renderQuiz();
    const segs = segOf();
    $('prog').innerHTML = prog.length ? prog.map((b, i) => `<span class="s${Math.min(segs[i], 3)}"><i>${i + 1}</i>${BLOCKS[b].icon}</span>`).join('') : '<span class="empty" style="all:unset;color:var(--mut)">여기에 블록이 쌓여요 — 🚩 까지가 한 구간</span>';
    document.querySelectorAll('#palette button').forEach(b => { b.disabled = running || judging || prog.length >= MAX_BLOCKS; });
    $('undo').disabled = $('clear').disabled = running || judging || !prog.length;
    $('runBtn').classList.toggle('hidden', running); $('stopBtn').classList.toggle('hidden', !running);
    $('runBtn').disabled = judging;
    $('resetAll').disabled = running;
    $('judgeBox').classList.toggle('hidden', !judging);
    if (judging) {
      const s = c.stops[jk], last = jk === c.stops.length - 1;
      $('jq').textContent = `기록원: 진짜 알티노가 ${last ? '도착지' : '경유지 ' + (jk + 1)} ${stopName(s)}에 도착했나요?`;
    }
    $('cards').classList.toggle('hidden', step !== 3);
    if (step === 3) {
      const have = judging ? jk : (got[c.id] || 0);
      $('cards').innerHTML = c.stops.map((s, k) => { const h = HINTS[hintOf(k, c.stops.length)]; return `<span class="${k < have ? 'got' : ''}">${k < have ? h.card : '카드 ' + (k + 1)}</span>`; }).join('');
    }
    $('mapTitle').textContent = step === 1 ? '🗺️ 보물 지도 — 위쪽이 북쪽' : step === 2 ? '🗺️ 경유지 1곳 코스' : '🗺️ 탐험 시험 — 경유지 2곳 + 도착지';
    $('mapLead').textContent = step === 1 ? '그림 기호를 눌러 이름을 확인해요.' : judging ? '' : '실행하면 앱이 생각한 길이 구간 색으로 보여요.';
    renderMap();
  }

  showStep(step);
})();
