// t10 스스로 멈추는 차의 비밀 (19–20차시) — 기획서 docs/topics/t10.md
// ① 사람 센서 놀이(눈·머리·발 역할 + 알티노의 입력→판단→출력 보기) → ② 센서 숫자 관찰(작을수록 가깝다)
// → ③ 긴급 제동 실험(속도 300·400·500, 앞 센서 220 에서 스스로 정지, 사람이 cm·mm 로 잰 거리 기록)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't10',
    title: '스스로 멈추는 차의 비밀',
    onSensor,
    onRunEnd: endRun,
    onTick: () => { if (runPhase === 'running' && !kit.running) endRun(); },   // kit.stop()·화면 이탈 정리
  });

  const FRONT = 220;              // 정면 벽 감지 ir2 — 2026-09-20 파일럿 현장 보정값(03 §2)
  const SPEEDS = [300, 400, 500];
  const MAX_RUN_MS = 8000;        // 이만큼 달려도 벽이 없으면 멈춘다(벽을 안 세웠거나 비스듬할 때)
  const DISTS = ['5cm', '10cm', '20cm', '아무것도 없음'];
  const r10 = (v) => Math.round(v / 10) * 10;

  let ir2 = null, irAt = 0, sampler = null;
  function onSensor(s) {
    if (s.ir2 == null) return;
    ir2 = s.ir2; irAt = Date.now();
    if (sampler) sampler.vals.push(s.ir2);
    renderLive();
  }
  const fresh = () => ir2 != null && Date.now() - irAt < 1500;

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── ① 사람 센서 놀이 ────────────────────────────────────────────
  const ROLES = [['👀', '눈', '입력', '벽까지 거리를 말해요'], ['🧠', '머리', '판단', '가까우면 "멈춰!"'], ['🦶', '발', '출력', '"멈춰!"를 들으면 멈춰요']];
  let turn = kit.store.num('turn', 0, 0, 99);
  $('swapRole').onclick = () => { turn = (turn + 1) % 99; kit.store.set('turn', turn); kit.signal('notice'); renderRoles(); };
  function renderRoles() {
    $('roles').innerHTML = ROLES.map(([m, n, k, d], i) => `<div><span class="m">${m}</span><b>${n} (${k})</b><span class="who">${(i + turn) % 3 + 1}번 친구</span><span class="lead">${d}</span></div>`).join('');
    $('roundNo').textContent = `· ${turn + 1}번째` + (turn >= 2 ? ' — 세 역할을 모두 해 봤어요 ✓' : '');
  }

  function renderLive() {
    const v = fresh() ? ir2 : null;
    const txt = v == null ? '–' : v;
    $('tEye').textContent = txt; $('irNow').textContent = txt; $('irNow3').textContent = txt;
    const near = v != null && v < FRONT;
    $('tHead').textContent = v == null ? '–' : near ? '가깝다!' : '멀다';
    $('tHead').className = 'v ' + (near ? 'stop' : 'go');
    $('tFoot').textContent = v == null ? '–' : near ? '🛑 멈춤' : '🚗 달림';
    $('tFoot').className = 'v ' + (near ? 'stop' : 'go');
    $('gauge').style.width = v == null ? '0' : Math.min(100, v / 1300 * 100) + '%';
  }

  // ── ② 센서 숫자 관찰 ────────────────────────────────────────────
  let dist = kit.store.get('dist', {}); if (!dist || typeof dist !== 'object') dist = {};
  let dsel = DISTS.find(d => dist[d] == null) || DISTS[0];
  DISTS.forEach(d => {
    const b = document.createElement('button'); b.dataset.d = d; b.textContent = d;
    b.onclick = () => { if (sampler) return; dsel = d; renderDist(); };
    $('distChips').appendChild(b);
  });
  $('distRec').onclick = () => {
    if (sampler) return;
    if (!fresh()) { kit.toast('⚠ 센서 숫자가 안 들어와요 — 연결을 확인해요'); return; }
    sampler = { vals: [] };
    $('distRec').disabled = true; $('distRec').textContent = '⏳ 1초 동안 재는 중…';
    setTimeout(() => {
      const vals = sampler.vals; sampler = null;
      if (vals.length) {
        dist[dsel] = r10(vals.reduce((a, b) => a + b, 0) / vals.length);   // 10 단위로 어림
        kit.store.set('dist', dist); kit.signal('success');
        const next = DISTS.find(d => dist[d] == null); if (next) dsel = next;
        checkStars();
      }
      renderDist();
    }, 1000);
  };
  $('distReset').onclick = async () => {
    if (!await kit.confirm({ title: '숫자 기록을 처음부터 할까요?', lines: ['거리마다 잰 숫자가 지워져요'], okText: '네, 처음부터', danger: true })) return;
    dist = {}; kit.store.remove('dist'); dsel = DISTS[0]; renderDist();
  };
  function renderDist() {
    document.querySelectorAll('#distChips button').forEach(b => { b.classList.toggle('on', b.dataset.d === dsel); b.textContent = b.dataset.d + (dist[b.dataset.d] != null ? ' ✓' : ''); });
    $('distRec').disabled = !!sampler; if (!sampler) $('distRec').textContent = '📝 숫자 기록하기';
    $('distTable').innerHTML = '<tr><th>거리</th>' + DISTS.map(d => `<th>${d}</th>`).join('') + '</tr><tr><td>센서 숫자</td>' + DISTS.map(d => `<td>${dist[d] ?? ''}</td>`).join('') + '</tr>';
    const got = DISTS.filter(d => dist[d] != null);
    const order = got.every((d, i) => i === 0 || dist[got[i - 1]] < dist[d]);
    $('distSay').textContent = got.length < 3 ? `${got.length}곳 기록 — 세 거리를 모두 재 봐요.`
      : order ? '✓ 물건이 가까울수록 센서 숫자가 작아져요!' : '숫자 순서가 이상해요. 자를 다시 맞추고 재 볼까요?';
  }

  // ── ③ 긴급 제동 실험 ────────────────────────────────────────────
  // brake = { '300': [mm, mm], … }  — 길이는 mm 로 저장하고 cm·mm 로 보여 준다
  let brake = kit.store.get('brake', {}); if (!brake || typeof brake !== 'object') brake = {};
  let speed = kit.store.num('speed', 300, 300, 500); if (!SPEEDS.includes(speed)) speed = 300;
  let runPhase = 'idle';            // idle | running | measure
  const tries = (s) => Array.isArray(brake[s]) ? brake[s].filter(x => Number.isFinite(x)) : [];
  const cmmm = (mm) => `${Math.floor(mm / 10)}cm ${mm % 10}mm`;
  SPEEDS.forEach(s => {
    const b = document.createElement('button'); b.dataset.s = s; b.textContent = '속도 ' + s;
    b.onclick = () => { if (runPhase === 'running') return; speed = s; kit.store.set('speed', s); runPhase = 'idle'; $('runFb').textContent = ''; renderBrake(); };
    $('speedChips').appendChild(b);
  });

  $('runBtn').onclick = () => {
    if (tries(speed).length >= 2) { kit.toast('이 속도는 두 번 다 쟀어요. 다른 속도를 골라요'); return; }
    if (!fresh()) { kit.toast('⚠ 센서 숫자가 안 들어와요 — 연결을 확인해요'); return; }
    if (ir2 < FRONT) { kit.toast('벽이 너무 가까워요. 알티노를 뒤로 옮겨요'); return; }
    const ok = kit.run(async (r) => {
      runPhase = 'running'; $('runFb').textContent = ''; renderBrake();
      kit.signal('start'); $('runMsg').textContent = '준비…';
      if (!await r.sleep(1000)) return;              // 손을 로봇에서 뗄 시간 (05 §7)
      $('runMsg').textContent = `출발! 속도 ${speed}`;
      const t0 = performance.now();
      while (r.alive()) {
        const v = r.sensor.ir2;                       // 작을수록 가깝다!
        if (v != null && v < FRONT) break;            // 입력(센서) → 판단(220보다 작다) → 출력(정지)
        if (performance.now() - t0 > MAX_RUN_MS) {
          r.drive(0, 0); runPhase = 'idle';
          $('runMsg').textContent = '벽을 못 찾았어요'; $('runFb').textContent = '벽이 알티노 바로 앞에 있는지 확인하고 다시 출발해요.'; $('runFb').className = 'fb no';
          kit.signal('fail');
          return;
        }
        r.drive(speed, 0);
        if (!await r.sleep(50)) return;
      }
      r.drive(0, 0);
      kit.signal('success');
      $('runMsg').textContent = '🛑 스스로 멈췄어요!';
      runPhase = 'measure';
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  $('stopBtn').onclick = () => { kit.stop(); endRun(); };
  function endRun() {
    if (runPhase === 'running') { runPhase = 'idle'; $('runMsg').textContent = '멈췄어요. 다시 출발할 수 있어요'; }
    renderBrake();
  }
  $('saveLen').onclick = () => {
    const cm = $('cmIn').value.trim(), mm = $('mmIn').value.trim();
    const c = +cm, m = mm === '' ? 0 : +mm;
    if (cm === '' || !Number.isInteger(c) || c < 0 || c > 99 || !Number.isInteger(m) || m < 0 || m > 9) {
      $('runFb').textContent = 'cm 는 0~99, mm 는 0~9 로 넣어요.'; $('runFb').className = 'fb no'; return;
    }
    const arr = tries(speed); arr.push(c * 10 + m); brake[speed] = arr;
    kit.store.set('brake', brake); kit.dot.number(Math.min(99, c));
    $('runFb').textContent = `속도 ${speed}: ${arr.length}번째 ${cmmm(c * 10 + m)} 기록!`; $('runFb').className = 'fb ok';
    $('cmIn').value = ''; $('mmIn').value = '';
    runPhase = 'idle';
    if (arr.length >= 2) { const next = SPEEDS.find(s => tries(s).length < 2); if (next) { speed = next; kit.store.set('speed', next); } }
    checkStars(); renderBrake();
  };
  $('brakeReset').onclick = async () => {
    if (!await kit.confirm({ title: '긴급 제동 기록을 처음부터 할까요?', lines: ['속도마다 잰 거리가 지워져요'], okText: '네, 처음부터', danger: true })) return;
    brake = {}; kit.store.remove('brake'); speed = 300; runPhase = 'idle'; $('runMsg').textContent = ''; $('runFb').textContent = ''; renderBrake();
  };
  function renderBrake() {
    document.querySelectorAll('#speedChips button').forEach(b => { const s = +b.dataset.s; b.classList.toggle('on', s === speed); b.textContent = '속도 ' + s + (tries(s).length >= 2 ? ' ✓' : ''); });
    const running = runPhase === 'running';
    $('runBtn').classList.toggle('hidden', running); $('stopBtn').classList.toggle('hidden', !running);
    $('runBtn').disabled = runPhase === 'measure' || tries(speed).length >= 2;
    $('measureBox').classList.toggle('hidden', runPhase !== 'measure');
    if (runPhase === 'idle' && !/멈췄어요|못 찾았어요/.test($('runMsg').textContent)) $('runMsg').textContent = `속도 ${speed} · ${tries(speed).length + 1}번째`;
    // 표: 속도 · 1번째 · 2번째 · 두 값의 차이 · 가까운 순서(평균이 작을수록 벽에 가깝다 = 1)
    const avg = (s) => { const t = tries(s); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null; };
    const ranked = SPEEDS.filter(s => avg(s) != null).sort((a, b) => avg(a) - avg(b));
    let h = '<tr><th>속도</th><th>1번째</th><th>2번째</th><th>두 값의 차이</th><th>가까운 순서</th></tr>';
    SPEEDS.forEach(s => {
      const t = tries(s);
      h += `<tr class="${s === speed ? 'on' : ''}"><td>${s}</td><td>${t[0] != null ? cmmm(t[0]) : ''}</td><td>${t[1] != null ? cmmm(t[1]) : ''}</td>` +
        `<td>${t.length === 2 ? Math.abs(t[0] - t[1]) + 'mm' : ''}</td><td>${ranked.length === 3 ? ranked.indexOf(s) + 1 : ''}</td></tr>`;
    });
    $('brakeTable').innerHTML = h;
    let say = '세 속도를 모두 재면 비교해 줘요.';
    if (ranked.length === 3) {
      const faster = avg(500) < avg(400) && avg(400) < avg(300);
      say = faster ? '빠를수록 벽 가까이에서 멈췄어요! 왜 그럴까요? (멈출 때까지 미끄러지는 거리)'
        : '속도와 멈춘 거리의 규칙이 잘 안 보여요. 같은 속도로 한 번 더 재 볼까요?';
    }
    $('brakeSay').textContent = say;
  }

  // ── 별·성장기록부 — 숫자 3곳 ⭐ · 세 속도 모두 ⭐⭐ · 세 속도 두 번씩(mm 까지) ⭐⭐⭐ ──
  function checkStars() {
    const three = ['5cm', '10cm', '20cm'].every(d => dist[d] != null);
    const all1 = SPEEDS.every(s => tries(s).length >= 1), all2 = SPEEDS.every(s => tries(s).length >= 2);
    const stars = all2 ? 3 : all1 ? 2 : three ? 1 : 0;
    const best = kit.store.num('bestStars', 0, 0, 3);
    if (stars <= best) return;           // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
    kit.store.set('bestStars', stars);
    const near = all1 ? SPEEDS.slice().sort((a, b) => tries(a)[0] - tries(b)[0])[0] : null;
    kit.record.add({
      title: stars >= 2 ? '긴급 제동 실험을 했어요' : '센서 숫자를 관찰했어요',
      detail: stars >= 2 ? `속도 300·400·500 멈춘 거리 비교 · 벽에 가장 가까이 멈춘 속도 ${near}` : '거리 5·10·20cm 에서 앞 센서 숫자 기록',
      stars,
    });
    kit.toast(['', '🏅 도전 배지!', '🏅 실력 배지!', '🏅 박사 배지!'][stars]);
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  showStep(step);
  renderRoles(); renderLive(); renderDist(); renderBrake();
})();
