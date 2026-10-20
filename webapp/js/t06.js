// t06 손길 알아채기 (11–12차시) — 기획서 docs/topics/t06.md
// ① 센서 지도 만들기(6개 센서 숫자, 손을 대면 작아짐) → ② 숫자 맞추기(앞 가운데 값을 목표 안에 1초)
// → ③ 손 따라오기 시험(영점 → 손 쪽으로 조향하며 다가옴, 코스별 별) → ④ 더 해 보기(밀고 당기기 · 몰래 다가가기)
// 센서 값은 작을수록 가깝다(03 §2). 좌·우 대각 센서는 현장 감지 기준부터 다를 만큼(650/210) 대칭이 아니어서 절대값을 비교하지 않고
// 시작 전 '영점'(손 없을 때 값) 대비 얼마나 줄었는지로 비교한다. 손 거리 기준은 실기에서 ⚙ 로 맞춘다.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't06',
    title: '손길 알아채기',
    onSensor: (s) => onSensor(s),
    onRunEnd: () => { renderFollow(); renderPush(); },
  });

  const SPEED = 300, STEER = 57;      // 순항 속도 · 현장 회피 회전 세기 (03 §1·§2)
  const SIDE = 0.15;                  // 좌우 대각의 '줄어든 정도' 차이가 이보다 커야 방향을 바꾼다(와리가리 방지, 03 §8)
  const SENS = [
    { k: 'ir1', name: '앞 왼쪽' }, { k: 'ir2', name: '앞 가운데' }, { k: 'ir3', name: '앞 오른쪽' },
    { k: 'ir5', name: '왼쪽 옆' }, { k: 'ir4', name: '오른쪽 옆' }, { k: 'ir6', name: '뒤' },
  ];
  const COURSES = [
    { id: 'line',  m: '⬆', name: '직선', stars: 1 },
    { id: 'turn',  m: '↱', name: '한 번 꺾기', stars: 2 },
    { id: 'curve', m: '〰', name: 'S자', stars: 3 },
  ];
  const ARROW = {   // 도트 화살표 — 바이트 = 행(위→아래), 비트7 = 맨 왼쪽
    up:    [0x18, 0x3C, 0x7E, 0x18, 0x18, 0x18, 0x18, 0x00],
    down:  [0x00, 0x18, 0x18, 0x18, 0x18, 0x7E, 0x3C, 0x18],
    left:  [0x00, 0x10, 0x30, 0x7F, 0x7F, 0x30, 0x10, 0x00],
    right: [0x00, 0x08, 0x0C, 0xFE, 0xFE, 0x0C, 0x08, 0x00],
  };
  const DIR_OF = { ir1: 'up', ir2: 'up', ir3: 'up', ir5: 'left', ir4: 'right', ir6: 'down' };

  // ── 조절값 (⚙, 실기에서 맞춘다) ─────────────────────────────────
  const DEF = { near: 120, detect: 30, found: 300 };
  let near = kit.store.num('near', DEF.near, 60, 300);
  let detect = kit.store.num('detect', DEF.detect, 10, 70);
  let found = kit.store.num('found', DEF.found, 100, 600);
  let base = kit.store.get('base', null);       // 영점 { ir1, ir2, ir3 }
  if (!base || !['ir1', 'ir2', 'ir3'].every(k => Number.isFinite(base[k]) && base[k] > 50 && base[k] <= 2000)) base = null;

  let last = {};    // 최신 센서
  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 4);
  function showStep(n) {
    if (kit.running) kit.stop();
    armed = false;
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    renderMap(); renderGame(); renderFollow(); renderPush(); renderSneak();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  function onSensor(s) {
    last = s;
    if (step === 1) senseMap(s);
    if (step === 2) senseGame(s);
    if (step === 4 && armed) senseSneak(s);
  }

  // ── ① 센서 지도 ──────────────────────────────────────────────────
  let got = kit.store.get('found', []);
  if (!Array.isArray(got)) got = [];
  got = got.filter(k => SENS.some(s => s.k === k));
  SENS.forEach(s => { const li = document.createElement('li'); li.dataset.k = s.k; li.textContent = s.name; $('flist').appendChild(li); });
  function senseMap(s) {
    SENS.forEach(x => {
      const v = s[x.k], el = document.querySelector(`.sen[data-k="${x.k}"]`);
      el.innerHTML = `${x.name}<b>${Number.isFinite(v) ? v : '–'}</b>`;
      el.classList.toggle('hot', v < found);
      if (v < found && !got.includes(x.k)) {
        got.push(x.k); kit.store.set('found', got); kit.signal('success');
        if (got.length === SENS.length) kit.toast('🎉 센서 6개를 다 찾았어요!', 2400);
        renderMap();
      }
    });
  }
  function renderMap() {
    SENS.forEach(x => {
      const el = document.querySelector(`.sen[data-k="${x.k}"]`);
      if (!el.innerHTML) el.innerHTML = `${x.name}<b>–</b>`;
      el.classList.toggle('found', got.includes(x.k));
      document.querySelector(`#flist [data-k="${x.k}"]`).classList.toggle('found', got.includes(x.k));
    });
    $('foundMsg').textContent = `찾은 센서 ${got.length} / ${SENS.length}`;
  }
  $('mapReset').onclick = async () => {
    if (!await kit.confirm({ title: '센서 지도를 처음부터 할까요?', lines: ['찾은 센서 표시가 지워져요'], okText: '네, 처음부터', danger: true })) return;
    got = []; kit.store.remove('found'); renderMap();
  };

  // ── ② 숫자 맞추기 ────────────────────────────────────────────────
  const TARGETS = [150, 300, 500], WIN = 50, HOLD = 1000, ROUNDS = 5;
  let target = null, inSince = 0, wins2 = 0, rounds2 = 0, cleared = false;
  $('newTarget').onclick = () => {
    if (rounds2 >= ROUNDS && (cleared || target === null)) return;
    let t = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    if (t === target && TARGETS.length > 1) t = TARGETS[(TARGETS.indexOf(t) + 1) % TARGETS.length];
    if (target !== null && !cleared) rounds2++;   // 못 하고 넘기면 한 판으로 친다
    target = t; inSince = 0; cleared = false; kit.signal('notice'); renderGame();
  };
  $('game2Reset').onclick = () => { target = null; wins2 = 0; rounds2 = 0; cleared = false; renderGame(); };
  function senseGame(s) {
    const v = s.ir2;
    $('liveNum').textContent = Number.isFinite(v) ? v : '–';
    $('needle').style.left = Math.max(0, Math.min(100, v / 10)) + '%';
    if (target === null || cleared) { $('holdbar').style.width = '0'; return; }
    const inside = Math.abs(v - target) <= WIN, now = Date.now();
    if (!inside) { inSince = 0; $('holdbar').style.width = '0'; $('gameMsg').textContent = v > target ? '조금 더 가까이!' : '조금 더 멀리!'; return; }
    if (!inSince) inSince = now;
    const t = now - inSince;
    $('holdbar').style.width = Math.min(100, t / HOLD * 100) + '%';
    $('gameMsg').textContent = '그대로!';
    if (t >= HOLD) { cleared = true; wins2++; rounds2++; kit.signal('success'); renderGame(); }
  }
  function renderGame() {
    $('target').textContent = target === null ? '–' : target;
    $('zone').style.display = target === null ? 'none' : '';
    if (target !== null) { $('zone').style.left = (target - WIN) / 10 + '%'; $('zone').style.width = (2 * WIN) / 10 + '%'; }
    const end = rounds2 >= ROUNDS;
    $('newTarget').disabled = end && (cleared || target === null);
    $('score2').textContent = end ? `끝! 성공 ${wins2} / ${ROUNDS}` : `성공 ${wins2} / ${ROUNDS} · ${rounds2}판 함`;
    if (cleared) $('gameMsg').textContent = '성공! 숫자가 작을수록 손이 가까워요.';
    else if (target === null) $('gameMsg').textContent = '▶ 새 목표를 눌러요.';
  }

  // ── ③ 손 따라오기 ────────────────────────────────────────────────
  let course = kit.store.get('course', 'line'); if (!COURSES.some(c => c.id === course)) course = 'line';
  let passed = kit.store.get('passed', []); if (!Array.isArray(passed)) passed = [];
  let fphase = 'idle';   // idle | zeroing | following | judge | done
  let dir = 0;
  COURSES.forEach(c => {
    const b = document.createElement('button'); b.dataset.c = c.id;
    b.innerHTML = `<span class="m">${c.m}</span><b>${c.name}</b><span>${'⭐'.repeat(c.stars)}</span>`;
    b.onclick = () => { if (kit.running) return; course = c.id; kit.store.set('course', c.id); fphase = 'idle'; renderFollow(); };
    $('courses').appendChild(b);
  });
  const drop = (k, s) => Math.max(0, Math.min(1, 1 - s[k] / base[k]));   // 영점보다 얼마나 줄었나 0~1
  $('zero').onclick = () => {
    const ok = kit.run(async (r) => {
      fphase = 'zeroing'; renderFollow();
      const sum = { ir1: 0, ir2: 0, ir3: 0 }; let n = 0;
      for (let i = 0; i < 10; i++) {
        if (!await r.sleep(100)) return;
        if (!r.fresh()) continue;
        ['ir1', 'ir2', 'ir3'].forEach(k => { sum[k] += r.sensor[k]; }); n++;
      }
      if (n < 5) { kit.toast('센서 값이 안 들어와요. 연결을 확인해요'); fphase = 'idle'; return; }
      const b = {}; ['ir1', 'ir2', 'ir3'].forEach(k => { b[k] = Math.round(sum[k] / n); });
      if (Math.min(b.ir1, b.ir2, b.ir3) < near * 2) { kit.toast('앞에 뭔가 있어요. 손과 물건을 치우고 다시 잡아요', 2500); fphase = 'idle'; return; }
      base = b; kit.store.set('base', base); fphase = 'idle'; kit.signal('success');
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('follow').onclick = () => {
    if (!base) { kit.toast('영점을 먼저 잡아요'); return; }
    dir = 0;
    const ok = kit.run(async (r) => {
      fphase = 'following'; renderFollow();
      kit.signal('start');
      if (!await r.sleep(1000)) return;                 // 손을 로봇에서 뗄 시간 (05 §7)
      while (r.alive()) {
        const s = r.sensor;
        const d1 = drop('ir1', s), d2 = drop('ir2', s), d3 = drop('ir3', s);
        const tooNear = s.ir1 < near || s.ir2 < near || s.ir3 < near;
        const hand = Math.max(d1, d2, d3) >= detect / 100;
        if (d1 - d3 > SIDE) dir = -1;                   // 왼쪽 대각이 더 많이 줄었다 → 손이 왼쪽
        else if (d3 - d1 > SIDE) dir = 1;
        else if (d2 >= Math.max(d1, d3)) dir = 0;       // 가운데가 가장 가까울 때만 곧게 — 그 전까지는 방향 유지
        if (tooNear) { r.drive(0, dir * STEER); showHand('너무 가까워요 — 멈춤', '✋'); }
        else if (!hand) { r.drive(0, 0); showHand('손을 기다려요', '⏸'); }
        else { r.drive(SPEED, dir * STEER); showHand(dir < 0 ? '왼쪽으로 따라가요' : dir > 0 ? '오른쪽으로 따라가요' : '앞으로 따라가요', dir < 0 ? '↖' : dir > 0 ? '↗' : '⬆'); }
        if (!await r.sleep(100)) return;
      }
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  function showHand(t, a) { $('handMsg').textContent = t; $('arrow').textContent = a; }
  $('stopF').onclick = () => { kit.stop(); if (fphase === 'following') fphase = 'judge'; renderFollow(); };   // kit.stop 은 onRunEnd 를 부르지 않는다
  const judgeF = (ok) => {
    if (fphase !== 'judge') return;
    kit.signal(ok ? 'success' : 'fail');
    const c = COURSES.find(x => x.id === course);
    if (ok) {
      if (!passed.includes(course)) { passed.push(course); kit.store.set('passed', passed); }
      const best = kit.store.num('bestStars', 0, 0, 3);
      if (c.stars > best) {                               // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
        kit.store.set('bestStars', c.stars);
        kit.record.add({ title: '손짓으로 알티노를 데려왔어요', detail: `${c.name} 코스 성공`, stars: c.stars });
      }
      $('resultBox').innerHTML = `<span class="m">🤚</span><b>${c.name} 코스 성공!</b><br>${'⭐'.repeat(c.stars)}${c.stars < 3 ? ' · 다음 코스에 도전해요' : ''}`;
    } else $('resultBox').innerHTML = `<span class="m">💪</span><b>아깝다!</b><br>손을 더 천천히, 센서 앞에서 움직여 봐요.`;
    fphase = 'done'; renderFollow();
  };
  $('judgeOk').onclick = () => judgeF(true);
  $('judgeNo').onclick = () => judgeF(false);
  function renderFollow() {
    if (fphase === 'following' && !kit.running) fphase = 'judge';
    if (fphase === 'zeroing' && !kit.running) fphase = 'idle';
    document.querySelectorAll('#courses button').forEach(b => { b.classList.toggle('on', b.dataset.c === course); b.classList.toggle('done', passed.includes(b.dataset.c)); });
    const run = kit.running && step === 3;
    $('follow').classList.toggle('hidden', fphase === 'following'); $('stopF').classList.toggle('hidden', fphase !== 'following');
    $('follow').disabled = !base || run;
    $('zero').disabled = run;
    $('judgeBox').classList.toggle('hidden', fphase !== 'judge');
    $('resultBox').classList.toggle('hidden', fphase !== 'done');
    $('baseMsg').textContent = fphase === 'zeroing' ? '영점 재는 중… 손을 떼요' : base ? `영점 ✓ (${base.ir1} · ${base.ir2} · ${base.ir3})` : '영점 전 — ① 영점 잡기';
    if (fphase !== 'following') showHand(fphase === 'judge' ? '멈췄어요. 기록원이 판정해요' : '손을 기다려요', '⏸');
  }

  // ── ④ 심화: 밀고 당기기 ──────────────────────────────────────────
  let pushing = false;
  $('push').onclick = () => {
    if (!base) { kit.toast('③에서 영점을 먼저 잡아요'); return; }
    const ok = kit.run(async (r) => {
      pushing = true; renderPush();
      kit.signal('start');
      if (!await r.sleep(1000)) return;
      const far = Math.round(near * 2.5);
      while (r.alive()) {
        const v = r.sensor.ir2, hand = drop('ir2', r.sensor) >= detect / 100;
        let z = 'stay';
        if (v < near) { z = 'back'; r.drive(-SPEED, 0); }
        else if (v >= far && hand) { z = 'come'; r.drive(SPEED, 0); }
        else r.drive(0, 0);
        document.querySelectorAll('#zones span').forEach(x => x.classList.toggle('on', x.dataset.z === z));
        $('pushMsg').textContent = `앞 가운데 ${v} · ${z === 'back' ? `${near}보다 작아요 → 뒤로` : z === 'come' ? `${far} 이상 + 손 있음 → 다가와요` : hand ? '알맞은 거리 → 멈춤' : '손이 없어요 → 멈춤'}`;
        if (!await r.sleep(100)) return;
      }
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('stopP').onclick = () => { kit.stop(); pushing = false; renderPush(); };
  function renderPush() {
    if (!kit.running) pushing = false;
    $('push').classList.toggle('hidden', pushing); $('stopP').classList.toggle('hidden', !pushing);
    if (!pushing) { document.querySelectorAll('#zones span').forEach(x => x.classList.remove('on')); $('pushMsg').textContent = base ? `멈춤 기준 ${near} · 다가옴 기준 ${Math.round(near * 2.5)}` : '③에서 영점을 먼저 잡아요'; }
  }

  // ── ④ 선택: 몰래 다가가기 (바퀴는 쓰지 않는다) ─────────────────────
  let armed = false, caught = 0;
  $('sneak').onclick = () => {
    if (kit.running) kit.stop();
    armed = true; kit.dot.clear(); kit.signal('notice');
    $('sneakArrow').textContent = '👀'; $('sneakMsg').textContent = '살금살금… 알티노가 지켜봐요';
    renderSneak();
  };
  function senseSneak(s) {
    const hit = SENS.filter(x => s[x.k] < found).sort((a, b) => s[a.k] - s[b.k])[0];
    if (!hit) return;
    armed = false; caught++;
    const d = DIR_OF[hit.k];
    kit.dot.bytes(ARROW[d]); kit.signal('caught');
    $('sneakArrow').textContent = { up: '⬆', down: '⬇', left: '⬅', right: '➡' }[d];
    $('sneakMsg').textContent = `알아챘다! ${hit.name}에서 왔어요`;
    renderSneak();
  }
  function renderSneak() {
    $('sneak').textContent = armed ? '지켜보는 중…' : '▶ 준비';
    $('sneak').disabled = armed;
    $('sneakScore').textContent = `알아챈 횟수 ${caught}`;
  }

  // ── ⚙ 거리 조절 ──────────────────────────────────────────────────
  kit.block($('tune'));
  const LIM = { near: [60, 300], detect: [10, 70], found: [100, 600] };
  function renderTune() { $('vNear').textContent = near; $('vDetect').textContent = detect + '%'; $('vFound').textContent = found; }
  document.querySelectorAll('#tune .stp button').forEach(b => {
    b.onclick = () => {
      const t = b.dataset.t, d = +b.dataset.d, [lo, hi] = LIM[t];
      const v = Math.max(lo, Math.min(hi, { near, detect, found }[t] + d));
      if (t === 'near') near = v; else if (t === 'detect') detect = v; else found = v;
      kit.store.set(t, v); renderTune();
    };
  });
  $('tuneDefault').onclick = () => { near = DEF.near; detect = DEF.detect; found = DEF.found; ['near', 'detect', 'found'].forEach(k => kit.store.set(k, DEF[k])); renderTune(); };
  $('tuneOpen').onclick = () => { if (kit.running) kit.stop(); renderTune(); $('tune').classList.remove('hidden'); renderFollow(); };
  $('tuneClose').onclick = () => { $('tune').classList.add('hidden'); renderPush(); };

  // ── 시작 ─────────────────────────────────────────────────────────
  showStep(step);
})();
