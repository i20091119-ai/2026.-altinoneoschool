// t12 운동회 (23–24차시) — 기획서 docs/topics/t12.md
// ① 종목 연습(왕복 릴레이 · 로봇 컬링) → ② 꼬리잡기 판정(꽁무니 센서가 판정) → ③ 운동회 본선(3종목 + 점수판 · 시상)
// 원리(설계원리서 P11): 경쟁을 규칙과 공정 아래 둔다 — 시간은 앱이, 거리는 정면 센서가, 잡힘은 꽁무니 센서가 잰다.
// 로봇은 조종 패드(kit.hold)로만 움직인다. 자율 동작(kit.run)은 없다.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  // ── 실측값 (03) ─────────────────────────────────────────────────
  const SPEEDS = [330, 360, 390, 420, 450];   // 꼬리잡기 속도 단계 (03 §1)
  const FINAL_SPEED = 390;                    // 본선은 모든 모둠 같은 속도 — 공정
  const CURL_SPEED = 300;                     // 컬링은 천천히(순항 300, 출발 킥은 kit S4)
  const STEER = 100;                          // 일반 회전 (03 §1)
  const TARGETS = [90, 110, 130, 150, 170, 200];   // 컬링 목표 거리 (03 §2, 정밀주차)
  const FINAL_TARGET = 150;                   // 본선 컬링 목표 — 모든 태블릿이 같은 값(공정)
  const CRASH = 70;                           // 70 미만 = 충돌 위험 (03 §2) → 반칙
  const TAG_TH = 50;                          // 꽁무니 ir6 50 미만 = 잡힘 (03 §2)
  const TAG_RELEASE = TAG_TH + 60;            // 이만큼 떨어져야 다음 잡힘을 센다 (tag.js 와 같게)
  const TAG_GAP_MS = 1200;                    // 다시 세려면 1.2초 (03 §2)
  const STUCK_MS = 8000;                      // 8초 넘게 같은 숫자 = 센서 고장 (03 §2, 04 #36)
  const TRACK_MIN = 60, TRACK_MAX = 320;      // 컬링 막대에 그리는 범위

  const EVENTS = {
    relay: { name: '🏃 릴레이', panel: 'pRelay' },
    curl: { name: '🥌 컬링', panel: 'pCurl' },
    tag: { name: '🐍 꼬리잡기', panel: 'pTag' },
    board: { name: '📋 점수판', panel: 'pBoard' },
  };
  const STEP_EVENTS = { 1: ['relay', 'curl'], 2: ['tag'], 3: ['relay', 'curl', 'tag', 'board'] };

  let busy = null;        // 'relayReady' | 'relay' | 'tag' — 진행 중이면 단계·종목을 못 바꾼다
  let front = null, rear = null;

  const kit = AltinoKit.create({
    appId: 't12',
    title: '운동회',
    onSensor: (s) => { front = s.ir2; rear = s.ir6; onRear(s.ir6); },
    onTick: tick,
  });

  // ── 저장 ────────────────────────────────────────────────────────
  const obj = (k) => { const v = kit.store.get(k, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  let step = kit.store.num('step', 1, 1, 3);
  let evOf = obj('ev');                                  // 단계별 고른 종목
  let speed = kit.store.num('speed', 360, 330, 450);
  speed = SPEEDS.includes(speed) ? speed : 360;
  let best = obj('best');                                // 연습 최고 { relay: ms, curl: 오차 }
  let fin = obj('fin');                                  // 본선 우리 모둠 기록 { relay: ms, curl: {t,v,err,foul}, tag: n }
  let teams = kit.store.num('teams', 4, 2, 6);
  let pts = obj('pts');                                  // 점수판 { '1': { relay, curl, tag, fair } }
  let awarded = kit.store.get('awarded', false) === true;
  // 꼬리잡기 한 판 시간 — 기본 1분(수업 규칙). 화면에 조절 칸은 없고 저장값 altino.t12.roundSec 로만 바꾼다(기획서 §10)
  const ROUND_MS = kit.store.num('roundSec', 60, 10, 180) * 1000;
  let target = kit.store.num('target', 150, 90, 200);
  if (!TARGETS.includes(target)) target = 150;

  const curEv = () => { const list = STEP_EVENTS[step]; return list.includes(evOf[step]) ? evOf[step] : list[0]; };

  // ── 조종 패드 ───────────────────────────────────────────────────
  let fwd = 0, turn = 0;
  const padSpeed = () => (curEv() === 'curl' ? CURL_SPEED : step === 3 ? FINAL_SPEED : speed);
  const apply = () => kit.drive(fwd * padSpeed(), turn);
  const pads = [
    kit.hold($('d-up'), () => { fwd = 1; apply(); }, () => { fwd = 0; apply(); }),
    kit.hold($('d-down'), () => { fwd = -1; apply(); }, () => { fwd = 0; apply(); }),
    kit.hold($('d-left'), () => { turn = -STEER; apply(); }, () => { turn = 0; apply(); }),
    kit.hold($('d-right'), () => { turn = STEER; apply(); }, () => { turn = 0; apply(); }),
  ];
  function halt() { pads.forEach(h => h && h.release()); fwd = 0; turn = 0; kit.stop(); }

  function setSpeed(d) {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + d));
    speed = SPEEDS[i]; kit.store.set('speed', speed); apply(); renderSpeed();
  }
  $('spdDown').onclick = () => setSpeed(-1);
  $('spdUp').onclick = () => setSpeed(1);
  function renderSpeed() {
    const ev = curEv(), fixed = ev === 'curl' || step === 3;
    $('spdVal').textContent = padSpeed();
    $('spdDown').disabled = fixed || speed <= SPEEDS[0];
    $('spdUp').disabled = fixed || speed >= SPEEDS[SPEEDS.length - 1];
    $('spdNote').textContent = ev === 'board' ? '점수판에서는 알티노를 쉬게 해요'
      : ev === 'curl' ? '컬링은 천천히 — 속도 300으로 정해져 있어요'
      : step === 3 ? `본선은 모든 모둠이 같은 속도 ${FINAL_SPEED} — 공정하게!`
      : '330~450 중에서 골라요 (+30씩)';
  }

  // ■ 멈춰 — 로봇을 세우고, 재던 기록은 버린다(멈춘 경기는 기록이 아니다)
  $('stopBtn').onclick = () => {
    halt();
    if (busy === 'relay' || busy === 'relayReady') { busy = null; relayT0 = 0; $('rSay').textContent = '멈췄어요. 출발선에 다시 놓고 ▶ 시작을 눌러요.'; }
    if (busy === 'tag') { busy = null; $('tSay').textContent = '멈췄어요. 이번 판은 기록하지 않아요. 다시 ▶ 한 판 시작!'; }
    render();
  };

  // ── 단계 · 종목 ─────────────────────────────────────────────────
  function lockedToast() { kit.toast('경기 중이에요 — 끝나거나 ■ 멈춰를 누른 뒤에 바꿔요'); }
  function showStep(n) {
    if (busy) { lockedToast(); return; }
    halt();
    step = n; kit.store.set('step', n);
    // 앞 단계의 기록이 화면에 남아 본선 기록처럼 보이지 않게 지운다 (본선 기록이 있으면 render 가 다시 보여 준다)
    $('rClock').textContent = '0.0초'; $('cResult').textContent = ''; $('cStars').textContent = '';
    $('rSay').textContent = '앱이 시간을 똑같이 재 줘요 — 공정한 기록!';
    $('tSay').textContent = '손을 알티노 꽁무니에 가까이 대 보세요. 센서 숫자가 어떻게 변하나요?';
    if (n === 3 && fin.curl) showCurlResult(fin.curl.t, fin.curl.v, fin.curl.err, fin.curl.foul);
    render();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });
  function pickEv(ev) {
    if (busy) { lockedToast(); return; }
    halt();
    evOf[step] = ev; kit.store.set('ev', evOf);
    render();
  }

  // ── 🏃 왕복 릴레이 (앱 스톱워치) ─────────────────────────────────
  let relayT0 = 0, relayReadyAt = 0;
  const fmt = (ms) => (Math.floor(ms / 100) / 10).toFixed(1) + '초';
  $('rStart').onclick = async () => {
    if (busy) return;
    if (step === 3 && fin.relay != null && !await redoOk('릴레이', fmt(fin.relay))) return;
    busy = 'relayReady'; relayReadyAt = performance.now() + 1000;
    kit.signal('start');
    $('rSay').textContent = '준비…';
    render();
  };
  $('rEnd').onclick = () => {
    if (busy !== 'relay') return;
    const ms = Math.round(performance.now() - relayT0);
    busy = null; relayT0 = 0;
    halt(); kit.signal('success'); kit.dot.icon('ok');
    $('rClock').textContent = fmt(ms);
    if (step === 3) {
      fin.relay = ms; kit.store.set('fin', fin);
      $('rSay').textContent = `본선 기록 ${fmt(ms)}! 기록원은 점수판에 적어요. 🎉`;
      afterFinal();
    } else {
      const better = best.relay == null || ms < best.relay;
      if (better) { best.relay = ms; kit.store.set('best', best); }
      $('rSay').textContent = better ? `${fmt(ms)}! 우리 모둠 최고 기록이에요. 🎉` : `${fmt(ms)}! 바통을 더 빨리 넘겨 볼까요?`;
    }
    render();
  };

  // ── 🥌 로봇 컬링 (정면 ir2 로 거리 판정) ─────────────────────────
  const pos = (v) => Math.max(0, Math.min(100, ((v - TRACK_MIN) / (TRACK_MAX - TRACK_MIN)) * 100));
  const curTarget = () => (step === 3 ? FINAL_TARGET : target);
  const curlStars = (err) => (err <= 5 ? 3 : err <= 15 ? 2 : err <= 30 ? 1 : 0);
  $('cNew').onclick = () => {
    if (step === 3) { kit.toast(`본선 목표는 모든 모둠 같은 ${FINAL_TARGET}이에요`); return; }
    let t; do { t = TARGETS[Math.floor(Math.random() * TARGETS.length)]; } while (t === target);
    target = t; kit.store.set('target', target);
    $('cResult').textContent = ''; $('cStars').textContent = '';
    renderCurl();
  };
  $('cMeasure').onclick = async () => {
    if (front == null) { kit.toast('센서 값이 아직 없어요 — 연결을 확인해요'); return; }
    if (fwd !== 0) { kit.toast('알티노가 완전히 멈춘 뒤에 재요'); return; }
    if (step === 3 && fin.curl && !await redoOk('컬링', fin.curl.foul ? '반칙' : `오차 ${fin.curl.err}`)) return;
    halt();
    const tg = curTarget(), v = front, err = Math.abs(tg - v), foul = v < CRASH;
    showCurlResult(tg, v, err, foul);
    const st = foul ? 0 : curlStars(err);
    if (foul) { kit.signal('fail'); kit.dot.icon('no'); }
    else { kit.signal(st >= 2 ? 'success' : 'notice'); kit.dot.number(Math.min(err, 99)); }
    if (step === 3) {
      fin.curl = { t: tg, v, err, foul }; kit.store.set('fin', fin);
      afterFinal();
    } else if (!foul && (best.curl == null || err < best.curl)) {
      best.curl = err; kit.store.set('best', best);
    }
    $('cBest').textContent = curlBestText();
    if (foul) kit.toast('70보다 가까우면 부딪힐 수 있어요. 조금 일찍 멈춰요');
    render();
  };
  function showCurlResult(t, v, err, foul) {
    $('cResult').innerHTML = foul
      ? `정면 거리 <b>${v}</b> — <b style="color:var(--coral)">벽에 너무 가까워요 (반칙)</b>`
      : `오차 = | 목표 ${t} − 알티노 ${v} | = <b>${err}</b>`;
    const st = foul ? 0 : curlStars(err);
    $('cStars').textContent = foul ? '🚧' : st ? '⭐'.repeat(st) : '💪';
  }
  const curlBestText = () => step === 3 ? '본선은 한 번! 다시 재려면 심판이 허락해야 해요.'
    : best.curl != null ? `🏆 연습 최고 기록 — 오차 ${best.curl}` : '오차가 작을수록 잘 멈춘 거예요';
  function renderCurl() {
    const target = curTarget();
    $('cTgt').textContent = target;
    $('cNew').disabled = step === 3;
    $('cMkT').style.left = pos(target) + '%';
    const lo = pos(target - 5), hi = pos(target + 5), w = Math.max(5, hi - lo);
    $('cZone').style.left = (lo - (w - (hi - lo)) / 2) + '%'; $('cZone').style.width = w + '%';
    if (front == null) { $('cMkN').style.display = 'none'; return; }
    $('cMkN').style.display = ''; $('cMkN').style.left = pos(front) + '%';
    const d = front - target;
    $('cNow').innerHTML = `정면 거리 <b>${front}</b> (가까울수록 작아요) · ` + (front < CRASH ? '<b style="color:var(--coral)">🚧 너무 가까워요!</b>'
      : Math.abs(d) <= 5 ? '<b style="color:var(--mint)">딱 좋아요!</b>' : d > 0 ? `${d} 더 가요` : `${-d} 지나쳤어요`);
  }

  // ── 🐍 꼬리잡기 (꽁무니 ir6 으로 판정 — js/tag.js 와 같은 규칙) ──
  let caught = 0, armed = true, lastCatch = 0, roundEnd = 0, hitUntil = 0;
  let r6min = null, r6max = null, r6n = 0, r6since = 0, stuck = false;
  function onRear(v) {
    // 고장 감시: 8초 동안 한 번도 안 변하면 센서 문제 (04 #36)
    const now = Date.now();
    if (!r6since) { r6since = now; r6min = r6max = v; r6n = 1; }
    else {
      r6min = Math.min(r6min, v); r6max = Math.max(r6max, v); r6n++;
      if (now - r6since >= STUCK_MS) {
        stuck = r6n >= 40 && r6min === r6max;
        r6since = now; r6min = r6max = v; r6n = 1;
      }
    }
    // 판정은 한 판이 진행 중일 때만 센다 (시작 전에 붙여 둔 차가 점수를 깎지 않게 — tag.js)
    if (busy !== 'tag') return;
    if (armed && v < TAG_TH && now - lastCatch >= TAG_GAP_MS) {
      caught++; armed = false; lastCatch = now; hitUntil = now + 900;
      kit.signal('caught'); kit.dot.number(Math.min(caught, 99));
      $('tSay').textContent = `잡혔어요! 센서가 ${kit.josa(String(v), '을를')} 읽었어요 (50보다 작아요)`;
    } else if (v < TAG_TH) armed = false;   // 1.2초 안에 붙은 건 안 세고, 한 번 떨어져야 다음을 센다
    if (!armed && v > TAG_RELEASE) armed = true;
  }
  $('tStart').onclick = async () => {
    if (busy) return;
    if (step === 3 && fin.tag != null && !await redoOk('꼬리잡기', `잡힘 ${fin.tag}번`)) return;
    caught = 0; armed = !(rear != null && rear < TAG_TH); lastCatch = 0;
    busy = 'tag'; roundEnd = Date.now() + ROUND_MS;
    kit.signal('start'); kit.dot.number(0);
    $('tSay').textContent = '출발! 꽁무니를 지키면서 상대를 쫓아가요.';
    render();
  };
  $('tEnd').onclick = () => {
    if (busy !== 'tag') return;
    busy = null; halt();
    $('tSay').textContent = step === 3 ? '중간에 그만두면 본선 기록이 남지 않아요. 다시 ▶ 한 판 시작!' : `그만했어요. 잡힌 횟수 ${caught}번.`;
    render();
  };
  function endRound() {
    busy = null; halt(); kit.signal('notice');
    if (step === 3) {
      fin.tag = caught; kit.store.set('fin', fin);
      $('tSay').textContent = `시간 끝! 본선 기록: 잡힌 횟수 ${caught}번. 기록원은 점수판에 적어요.`;
      afterFinal();
    } else {
      $('tSay').textContent = `시간 끝! 잡힌 횟수 ${caught}번. 센서가 판정해서 모두에게 똑같아요.`;
    }
    render();
  }
  function renderTag() {
    $('tCount').textContent = caught;
    $('tRear').textContent = rear == null ? '—' : rear;
    $('tFill').style.width = (rear == null ? 0 : Math.min(100, rear / 3)) + '%';   // 0~300 을 막대로
    $('tTh').style.left = (TAG_TH / 3) + '%';
    const hit = Date.now() < hitUntil || (rear != null && rear < TAG_TH);
    $('tState').classList.toggle('hit', hit); $('tState').classList.toggle('safe', !hit);
    $('tFace').textContent = hit ? '😵' : '🙂';
    $('tWord').textContent = hit ? '잡혔다!' : '안 잡혔어요';
    $('rearWarn').classList.toggle('hidden', !stuck);
    const left = busy === 'tag' ? Math.max(0, roundEnd - Date.now()) : ROUND_MS;
    const s = Math.ceil(left / 1000);
    $('tClock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('tClock').classList.toggle('run', busy === 'tag');
  }

  // ── ③ 본선 — 우리 모둠 기록 · 성장기록부 ─────────────────────────
  async function redoOk(name, was) {
    return kit.confirm({ title: `${name} 본선 기록을 다시 잴까요?`, lines: [`지금 기록: ${was}`, '본선은 한 번이 규칙이에요. 심판이 허락했을 때만 다시 해요.'], okText: '심판이 허락했어요', cancelText: '그대로 두기' });
  }
  function finStars() {   // 규칙대로 마친 종목 수 (컬링 반칙은 빼요)
    return (fin.relay != null ? 1 : 0) + (fin.curl && !fin.curl.foul ? 1 : 0) + (fin.tag != null ? 1 : 0);
  }
  function finText() {
    return [
      `릴레이 ${fin.relay != null ? fmt(fin.relay) : '—'}`,
      `컬링 ${fin.curl ? (fin.curl.foul ? '반칙' : '오차 ' + fin.curl.err) : '—'}`,
      `꼬리잡기 ${fin.tag != null ? '잡힘 ' + fin.tag + '번' : '—'}`,
    ];
  }
  function afterFinal() {
    // 세 종목을 다 치른 뒤에, 별이 늘었을 때만 기록부에 한 줄 (05 §7)
    if (fin.relay == null || !fin.curl || fin.tag == null) return;
    const st = finStars(), was = kit.store.num('recBest', 0, 0, 3);
    if (st > was) {
      kit.store.set('recBest', st);
      kit.record.add({ title: '운동회 본선을 규칙대로 치렀어요', detail: finText().join(' · '), stars: st });
      kit.toast(`성장기록부에 남겼어요 ${'⭐'.repeat(st)}`);
    }
  }
  function renderMyRec() {
    const show = step === 3;
    $('myrec').classList.toggle('hidden', !show);
    if (!show) return;
    const t = finText(), st = finStars();
    $('myrec').innerHTML = `<b>📒 우리 모둠 본선</b><span>🏃 ${t[0].slice(4)}</span><span>🥌 ${t[1].slice(3)}</span><span>🐍 ${t[2].slice(5)}</span><span>${st ? '⭐'.repeat(st) : ''}</span>`;
  }

  // ── 📋 점수판 (기록원) ──────────────────────────────────────────
  const COLS = [['relay', '🏃 릴레이'], ['curl', '🥌 컬링'], ['tag', '🐍 꼬리잡기'], ['fair', '🤝 규칙 지킴']];
  const cell = (i, k) => { const v = ((pts[i] || {})[k]) | 0; return k === 'fair' ? Math.min(1, Math.max(0, v)) : Math.min(3, Math.max(0, v)); };
  const total = (i) => COLS.reduce((a, [k]) => a + cell(i, k), 0);
  function ranking() {
    const rows = []; for (let i = 1; i <= teams; i++) rows.push({ i, t: total(i) });
    rows.sort((a, b) => b.t - a.t || a.i - b.i);
    let rank = 0, prev = null;
    rows.forEach((r, n) => { if (r.t !== prev) { rank = n + 1; prev = r.t; } r.rank = rank; });
    return rows;
  }
  function renderBoard() {
    const rk = {}; if (awarded) ranking().forEach(r => { rk[r.i] = r.rank; });
    let h = '<tr><th>모둠</th>' + COLS.map(c => `<th>${c[1]}</th>`).join('') + '<th>합계</th><th></th></tr>';
    for (let i = 1; i <= teams; i++) {
      h += `<tr><td class="nm">${i}모둠</td>` + COLS.map(([k]) => {
        const v = cell(i, k), cls = k === 'fair' ? (v ? 'fair' : '') : v ? 'p' + v : '';
        return `<td><button class="${cls}" data-t="${i}" data-k="${k}">${k === 'fair' ? (v ? '⭐' : '·') : v ? v + '점' : '·'}</button></td>`;
      }).join('') + `<td class="tot">${total(i)}</td><td class="md">${awarded ? (['', '🥇', '🥈', '🥉'][rk[i]] || '') : ''}</td></tr>`;
    }
    $('board').innerHTML = h;
    $('board').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const i = b.dataset.t, k = b.dataset.k, row = pts[i] || (pts[i] = {});
        row[k] = (cell(i, k) + 1) % (k === 'fair' ? 2 : 4);
        kit.store.set('pts', pts);
        if (awarded) { awarded = false; kit.store.set('awarded', false); }
        renderBoard();
      };
    });
    $('nVal').textContent = teams;
    $('nDown').disabled = teams <= 2; $('nUp').disabled = teams >= 6;
    $('award').classList.toggle('hidden', !awarded);
    if (awarded) {
      const rows = ranking(), names = (r) => rows.filter(x => x.rank === r).map(x => x.i + '모둠').join('·');
      const fair = []; for (let i = 1; i <= teams; i++) if (cell(i, 'fair')) fair.push(i + '모둠');
      const lines = [1, 2, 3].filter(r => rows.some(x => x.rank === r)).map(r => `${['', '🥇', '🥈', '🥉'][r]} ${names(r)} (${rows.find(x => x.rank === r).t}점)`);
      $('award').innerHTML = `<b>🏅 시상</b> ${lines.join(' &nbsp; ')}` + (fair.length ? `<br>🤝 규칙을 잘 지킨 모둠: ${fair.join('·')} — 모두 박수! 👏` : '<br>규칙을 지키며 끝까지 한 모든 모둠에게 박수! 👏');
    }
  }
  $('nDown').onclick = () => { teams = Math.max(2, teams - 1); kit.store.set('teams', teams); awarded = false; kit.store.set('awarded', false); renderBoard(); };
  $('nUp').onclick = () => { teams = Math.min(6, teams + 1); kit.store.set('teams', teams); awarded = false; kit.store.set('awarded', false); renderBoard(); };
  $('awardBtn').onclick = () => {
    let any = false; for (let i = 1; i <= teams; i++) if (total(i) > 0) any = true;
    if (!any) { kit.toast('점수를 먼저 적어요 — 칸을 누르면 1·2·3점으로 바뀌어요'); return; }
    awarded = true; kit.store.set('awarded', true);
    kit.signal('success'); kit.dot.icon('smile');
    renderBoard();
  };

  // ── 처음부터 (다음 반을 위해) ────────────────────────────────────
  $('resetAll').onclick = async () => {
    if (busy) { lockedToast(); return; }
    if (!await kit.confirm({ title: '운동회 기록을 처음부터 할까요?', lines: ['연습 기록 · 본선 기록 · 점수판이 모두 지워져요.', '성장기록부에 남은 줄은 그대로예요.'], okText: '네, 처음부터', danger: true })) return;
    halt();
    ['step', 'ev', 'best', 'fin', 'pts', 'awarded', 'recBest', 'teams', 'target', 'speed'].forEach(k => kit.store.remove(k));
    step = 1; evOf = {}; best = {}; fin = {}; pts = {}; awarded = false; teams = 4; target = 150; speed = 360; caught = 0;
    $('rClock').textContent = '0.0초'; $('cResult').textContent = ''; $('cStars').textContent = '';
    $('rSay').textContent = '앱이 시간을 똑같이 재 줘요 — 공정한 기록!';
    kit.dot.clear();
    render();
  };

  // ── 100ms 마다 ──────────────────────────────────────────────────
  let lastUi = 0;
  function tick() {
    const now = performance.now();
    if (busy === 'relayReady' && now >= relayReadyAt) {
      busy = 'relay'; relayT0 = now; $('rSay').textContent = '출발! 🏃'; render();
    }
    if (busy === 'relay') $('rClock').textContent = fmt(now - relayT0);
    if (busy === 'tag' && Date.now() >= roundEnd) endRound();
    if (now - lastUi >= 200) {     // 센서 숫자는 0.2초마다 (떨림 방지)
      lastUi = now;
      const ev = curEv();
      if (ev === 'curl') renderCurl();
      if (ev === 'tag') renderTag();
    }
  }

  // ── 그리기 ──────────────────────────────────────────────────────
  function render() {
    const ev = curEv();
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === step));
    $('evs').innerHTML = '';
    const list = STEP_EVENTS[step];
    $('evs').classList.toggle('hidden', list.length < 2);
    list.forEach(k => {
      const b = document.createElement('button'); b.textContent = EVENTS[k].name; b.dataset.ev = k;
      b.classList.toggle('on', k === ev);
      if (step === 3) b.classList.toggle('done', k === 'relay' ? fin.relay != null : k === 'curl' ? !!fin.curl : k === 'tag' ? fin.tag != null : awarded);
      b.onclick = () => pickEv(k);
      $('evs').appendChild(b);
    });
    Object.values(EVENTS).forEach(e => $(e.panel).classList.toggle('hidden', e.panel !== EVENTS[ev].panel));
    renderMyRec(); renderSpeed();
    // 릴레이
    const rb = busy === 'relay' || busy === 'relayReady';
    $('rStart').disabled = !!busy; $('rEnd').disabled = busy !== 'relay';
    $('rClock').classList.toggle('run', rb);
    if (!rb && ev === 'relay') {
      if (step === 3 && fin.relay != null) $('rClock').textContent = fmt(fin.relay);
      $('rBest').textContent = step === 3 ? '본선은 한 번! 다시 재려면 심판이 허락해야 해요.' : best.relay != null ? `🏆 연습 최고 기록 — ${fmt(best.relay)}` : '바통 터치: 다음 친구는 알티노가 출발선에 오면 출발!';
    }
    // 컬링
    $('cBest').textContent = curlBestText();
    renderCurl();
    // 꼬리잡기
    $('tStart').classList.toggle('hidden', busy === 'tag'); $('tEnd').classList.toggle('hidden', busy !== 'tag');
    $('tStart').disabled = !!busy;
    if (busy !== 'tag' && step === 3 && fin.tag != null) caught = fin.tag;
    renderTag();
    renderBoard();
  }

  if (step === 3 && fin.curl) showCurlResult(fin.curl.t, fin.curl.v, fin.curl.err, fin.curl.foul);
  render();
})();
