// t13 말 알아듣기 (25–26차시) — 기획서 docs/topics/t13.md
// ① 명령어 시험(사전의 말 하나씩) → ② 안 되는 말 탐험(못 알아들은 말 기록 + 까닭 추측) → ③ 심부름 시험(3개 연속 성공)
// 로봇에는 마이크가 없다(03 §10) → 태블릿 마이크. 안드로이드 WebView 는 웹 음성인식이 없을 것으로 보아(10 §4, 실기 미확인)
// 두 방식을 둔다: SpeechRecognition 이 있으면 🎤 음성 인식 모드, 없으면 🃏 말 카드 모드(기록원이 들은 말을 카드로 누름).
// 어느 방식이든 같은 handle() 로 들어가 같은 사전·같은 판정을 쓴다.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let step = 1, phase = 'idle';          // idle | running

  const kit = AltinoKit.create({
    appId: 't13',
    title: '말 알아듣기',
    onRunEnd: endRun,
    // kit.stop()(멈춰·화면 이탈) 뒤에는 onRunEnd 가 오지 않는다 → 화면 상태를 여기서 되돌린다
    onTick: () => { if (!kit.running && phase === 'running') endRun(); },
  });

  const SPEED = 300;                     // 순항 (03 §1)
  const STEER = 100;                     // 일반 회전 (03 §1)
  const MOVE_MS = 1000;                  // 움직이는 명령은 1초만
  const AUTO_MS = 3000;                  // '스스로 가' — 최대 3초
  const WALL = 220;                      // 정면 벽 감지(ir2) — 현장 검증값 (03 §2)
  const SONG = [44, 44, 46, 46, 44, 44, 41];   // 학교종: 솔솔라라 솔솔미 (실측된 8음 안, 03 §4)

  // 알티노 말 사전 — 낱말은 띄어쓰기 없이 비교한다
  const CMDS = {
    F:    { icon: '⬆', name: '앞으로', words: ['앞으로', '전진', '출발', '직진'], tip: '앞으로 가 · 전진' },
    B:    { icon: '⬇', name: '뒤로', words: ['뒤로', '후진'], tip: '뒤로 가 · 후진' },
    L:    { icon: '↰', name: '왼쪽', words: ['왼쪽', '왼쪽으로', '좌회전'], tip: '왼쪽으로 · 좌회전' },
    R:    { icon: '↱', name: '오른쪽', words: ['오른쪽', '오른쪽으로', '우회전'], tip: '오른쪽으로 · 우회전' },
    S:    { icon: '✋', name: '멈춰', words: ['멈춰', '정지', '스톱', '그만', '멈춤'], tip: '정지 · 그만' },
    SM:   { icon: '😊', name: '웃어', words: ['웃어', '스마일', '웃음'], tip: '스마일 · 웃어 줘' },
    ON:   { icon: '💡', name: '불 켜', words: ['불켜', '불켜기', '라이트켜', '전조등켜'], tip: '라이트 켜' },
    OFF:  { icon: '🌙', name: '불 꺼', words: ['불꺼', '불끄기', '라이트꺼', '전조등꺼'], tip: '라이트 꺼' },
    SONG: { icon: '🎵', name: '노래', words: ['노래', '노래불러', '음악'], tip: '노래해 · 음악' },
    A:    { icon: '🚗', name: '스스로 가', words: ['스스로', '자율주행', '혼자'], tip: '자율주행 · 혼자 가' },
  };
  const KEYS = Object.keys(CMDS);
  const MOVES = { F: [SPEED, 0], B: [-SPEED, 0], L: [SPEED, -STEER], R: [SPEED, STEER], A: [SPEED, 0] };
  const PREFIX = ['알티노야', '알티노', 'altino'];
  const SUFFIX = ['주세요', '해줘', '해봐', '해요', '줘', '해', '요', '가', '봐', '라', '야'];

  // 말 → 명령. { key } 또는 { key:null, hint }
  function understand(text) {
    let s = String(text || '').toLowerCase().replace(/[\s.,!?~'"“”‘’]/g, '');
    for (const p of PREFIX) if (s.startsWith(p) && s.length > p.length) { s = s.slice(p.length); break; }
    const find = (w) => KEYS.find(k => CMDS[k].words.includes(w));
    for (let guard = 0; guard < 6 && s; guard++) {
      const k = find(s);
      if (k) return { key: k };
      const suf = SUFFIX.find(x => s.endsWith(x) && s.length > x.length);
      if (!suf) break;
      s = s.slice(0, -suf.length);
    }
    const norm = String(text || '').toLowerCase().replace(/[\s.,!?~'"“”‘’]/g, '');
    const inside = KEYS.filter(k => CMDS[k].words.some(w => w.length >= 2 && norm.includes(w)));
    if (inside.length >= 2) return { key: null, hint: '두 가지 명령이 섞여서 하나를 고르지 못했어요.' };
    if (inside.length === 1) return { key: null, hint: `‘${CMDS[inside[0]].name}’은 아는 말인데, 모르는 말이 섞였어요.` };
    return { key: null, hint: '알티노 사전에 없는 말이에요.' };
  }

  const WHYS = [
    ['word', '🤔 모르는 낱말'], ['long', '🧩 말이 길어요'], ['two', '🔀 두 가지를 한꺼번에'],
    ['place', '📍 장소·이름을 몰라요'], ['noise', '🔊 시끄럽거나 작았어요'], ['other', '💭 잘 모르겠어요'],
  ];
  const ERRANDS = [
    { id: 'e1', name: '심부름 1', seq: ['F', 'SM', 'ON'] },
    { id: 'e2', name: '심부름 2', seq: ['SONG', 'B', 'SM'] },
    { id: 'e3', name: '심부름 3', seq: ['L', 'R', 'OFF'] },
  ];

  // ── 저장값 ───────────────────────────────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let mode, tried, notes, exam, done, log, why = null;
  function load() {
    step = kit.store.num('step', 1, 1, 3);
    mode = SR && kit.store.get('mode', 'voice') !== 'card' ? 'voice' : 'card';
    tried = kit.store.get('tried', {}); if (!tried || typeof tried !== 'object') tried = {};
    notes = kit.store.get('notes', []); if (!Array.isArray(notes)) notes = [];
    notes = notes.filter(n => n && typeof n.t === 'string').slice(-20);
    exam = kit.store.get('exam', null);
    if (!exam || typeof exam !== 'object') exam = { ei: 0, streak: 0, retries: 0, finished: false };
    exam.ei = Math.max(0, Math.min(ERRANDS.length - 1, exam.ei | 0));
    exam.streak = Math.max(0, Math.min(3, exam.streak | 0)); exam.retries = Math.max(0, exam.retries | 0);
    done = kit.store.get('done', {}); if (!done || typeof done !== 'object') done = {};
    log = kit.store.get('log', []); if (!Array.isArray(log)) log = [];
    log = log.filter(x => x && (x.k === null || CMDS[x.k])).slice(-4);
  }
  load();
  const saveExam = () => kit.store.set('exam', exam);

  // ── 단계 ─────────────────────────────────────────────────────────
  function showStep(n) {
    if (kit.running) { kit.stop(); endRun(); }
    stopListening();
    step = n; kit.store.set('step', n);
    $('heard').textContent = '';
    $('say').textContent = n === 1 ? '사전의 말을 하나씩 시험해 봐요.' : n === 2 ? '알티노가 못 알아들을 것 같은 말을 해 봐요.' : '심부름 세 가지를 차례로 말해요.';
    render();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── 말 카드 ──────────────────────────────────────────────────────
  KEYS.forEach(k => {
    const el = document.createElement('button'); el.dataset.k = k;
    el.innerHTML = `<b>${CMDS[k].icon}</b>${CMDS[k].name}`;
    el.onclick = () => handle(k, null);
    $('cards').appendChild(el);
  });
  $('noBtn').onclick = () => handle(null, null);

  // ── 음성 인식 ────────────────────────────────────────────────────
  let rec = null, listening = false;
  function stopListening() {
    if (rec) { try { rec.abort(); } catch (e) { /* 이미 끝남 */ } }
    rec = null; listening = false; renderMic();
  }
  $('micBtn').onclick = () => {
    if (!SR || mode !== 'voice') return;
    if (listening) { stopListening(); return; }
    let r;
    try { r = new SR(); } catch (e) { $('say').textContent = '음성 인식을 켤 수 없어요. 말 카드로 해요.'; return; }
    r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = (e) => {
      const res = e.results && e.results[e.results.length - 1];
      const t = res && res[0] && res[0].transcript;
      if (t) handle(understand(t).key, t);
    };
    r.onerror = (e) => {
      const er = e && e.error;
      if (er !== 'aborted') $('heard').textContent = '';
      $('say').textContent = er === 'no-speech' ? '아무 말도 안 들렸어요. 다시 눌러서 또박또박 말해요.'
        : (er === 'not-allowed' || er === 'service-not-allowed') ? '마이크를 쓸 수 없어요. 위에서 말 카드로 바꿔요.'
        : er === 'network' ? '인터넷이 없어서 못 들었어요. 말 카드로 바꿔요.'
        : er === 'aborted' ? $('say').textContent : '잘 못 들었어요. 다시 눌러서 말해요.';
    };
    r.onend = () => { if (rec === r) { rec = null; listening = false; renderMic(); } };
    try { r.start(); rec = r; listening = true; $('heard').textContent = '듣고 있어요…'; }
    catch (e) { $('say').textContent = '음성 인식을 켤 수 없어요. 말 카드로 해요.'; }
    renderMic();
  };
  function renderMic() {
    $('micBtn').classList.toggle('listen', listening);
    $('micLabel').textContent = listening ? '듣는 중…' : '눌러서 말하기';
  }
  $('modeToggle').onclick = () => {
    if (!SR) return;
    stopListening();
    mode = mode === 'voice' ? 'card' : 'voice'; kit.store.set('mode', mode);
    $('heard').textContent = '';
    render();
  };

  // ── 들은 말 처리 (두 방식 공통) ──────────────────────────────────
  // key: 알아들은 명령(없으면 null) · text: 음성 인식이 들은 문장(말 카드면 null)
  function handle(key, text) {
    const c = key && CMDS[key];
    const heardPart = text != null ? `들린 말: “${text}”` : '🃏 기록원 카드';
    $('heard').textContent = c ? `${heardPart} → ${c.icon} ${c.name}` : `${heardPart} → ❓ 못 알아들음`;
    if (c && !tried[key]) { tried[key] = true; kit.store.set('tried', tried); }
    log.push({ t: text != null ? String(text).slice(0, 30) : null, k: c ? key : null }); log = log.slice(-4); kit.store.set('log', log);

    if (!c) {
      kit.dot.icon('ask');
      if (step === 2 && text != null) $('noteText').value = String(text).slice(0, 30);
      const hint = text != null ? understand(text).hint : '';
      $('say').textContent = step === 1 ? `${hint || '알아듣지 못했어요.'} ② 안 되는 말 탐험에 적어 봐요.`
        : step === 2 ? `${hint || '못 알아들었어요!'} 오른쪽에 적고 까닭을 골라요.` : '';
    } else if (step !== 3) {
      $('say').textContent = `알아들었어요! ${c.icon} ${c.name}`;
    }
    if (step === 3) judge(key);
    if (c) exec(key);
    render();
  }

  // ③ 심부름 판정 — 기대한 명령이면 연속 +1, 아니면 처음부터
  function judge(key) {
    const e = ERRANDS[exam.ei];
    if (exam.finished) { exam.finished = false; exam.streak = 0; exam.retries = 0; $('stars').textContent = ''; }
    if (key && key === e.seq[exam.streak]) {
      exam.streak++;
      if (exam.streak >= 3) { finishExam(); return; }
      $('say').textContent = `좋아요! ${exam.streak}개 성공. 다음 심부름을 말해요.`;
    } else {
      const had = exam.streak;
      exam.streak = 0; exam.retries++;
      kit.signal('fail');
      $('say').textContent = key ? `아깝다! 지금은 ‘${CMDS[e.seq[had]].name}’ 차례였어요. 처음부터 다시 해요.`
        : '괜찮아요! 사전에 있는 말로 또박또박, 처음부터 다시 해요.';
    }
    saveExam();
  }
  function finishExam() {
    const e = ERRANDS[exam.ei], n = exam.retries;
    const stars = n === 0 ? 3 : n <= 2 ? 2 : 1;
    exam.finished = true; saveExam();
    done[e.id] = true; kit.store.set('done', done);
    kit.signal('success');
    $('stars').textContent = '⭐'.repeat(stars);
    $('say').textContent = n === 0 ? '한 번에 3개 연속 성공! 🎉' : `다시 해서 3개 연속 성공! 🎉 (${n}번 다시 시작)`;
    const best = kit.store.num('best', 0, 0, 3);
    if (stars > best) {
      kit.store.set('best', stars);
      kit.record.add({ title: '말로 심부름을 해냈어요', detail: `${e.name} · ${mode === 'voice' ? '음성 인식' : '말 카드'} · 다시 시작 ${n}번`, stars });
    }
  }

  // ── 알티노가 하는 일 ─────────────────────────────────────────────
  function exec(key) {
    if (key === 'S') { kit.stop(); endRun(); kit.dot.icon('ok'); $('say').textContent = step === 3 ? $('say').textContent : '멈췄어요. ✋'; return; }
    if (key === 'SM') { kit.dot.icon('smile'); return; }
    if (key === 'ON') { kit.led(15); return; }
    if (key === 'OFF') { kit.led(0); return; }
    if (kit.running) kit.stop();          // 새 명령이 오면 하던 동작을 멈추고 바꾼다
    phase = 'running';
    const ok = key === 'SONG' ? kit.run(async (r) => {
      for (const n of SONG) {
        kit.beep(n, 380);
        if (!await r.sleep(450)) return;
      }
    }) : kit.run(async (r) => {
      const [sp, st] = MOVES[key];
      kit.signal('start'); if (step !== 3) $('say').textContent = `준비… ${CMDS[key].name}!`;
      if (!await r.sleep(1000)) return;                // 손을 로봇에서 뗄 시간 (05 §7)
      if (step !== 3) $('say').textContent = `${CMDS[key].icon} ${CMDS[key].name}!`;
      const t0 = performance.now(), ms = key === 'A' ? AUTO_MS : MOVE_MS;
      while (performance.now() - t0 < ms) {
        if (key === 'A' && r.sensor && r.sensor.ir2 < WALL) {
          r.drive(0, 0);
          if (step !== 3) $('say').textContent = '앞에 벽이 있어서 스스로 멈췄어요. 🚗';
          return;
        }
        r.drive(sp, st);
        if (!await r.sleep(50)) return;
      }
      r.drive(0, 0);
    });
    if (!ok) { phase = 'idle'; kit.toast('이미 움직이는 중이에요'); }
    render();
  }
  $('stopBtn').onclick = () => { kit.stop(); endRun(); $('say').textContent = '멈췄어요. 다시 말로 시켜 봐요.'; };
  function endRun() {
    if (phase === 'running') phase = 'idle';
    render();
  }
  window.addEventListener('pagehide', () => { kit.led(0); stopListening(); });

  // ── ② 안 되는 말 기록 ────────────────────────────────────────────
  WHYS.forEach(([k, label]) => {
    const b = document.createElement('button'); b.dataset.w = k; b.textContent = label;
    b.onclick = () => { why = k; render(); };
    $('whys').appendChild(b);
  });
  $('noteAdd').onclick = () => {
    const t = $('noteText').value.trim().slice(0, 30);
    if (!t) { kit.toast('못 알아들은 말을 먼저 적어요'); return; }
    if (!why) { kit.toast('왜 안 됐을지 하나 골라요'); return; }
    notes.push({ t, why }); notes = notes.slice(-20); kit.store.set('notes', notes);
    $('noteText').value = ''; why = null;
    if (notes.length === 3) { kit.signal('success'); $('say').textContent = '안 되는 말을 3개 찾았어요! 🎉 공통점이 있나요?'; }
    else $('say').textContent = '기록했어요. 또 찾아봐요!';
    render();
  };

  // ── ③ 심부름 고르기 ──────────────────────────────────────────────
  ERRANDS.forEach((e, i) => {
    const b = document.createElement('button'); b.textContent = e.name;
    b.onclick = () => {
      exam = { ei: i, streak: 0, retries: 0, finished: false }; saveExam();
      $('stars').textContent = ''; $('heard').textContent = '';
      $('say').textContent = '심부름 세 가지를 차례로 말해요.';
      render();
    };
    $('errands').appendChild(b);
  });

  // ── 처음부터 ─────────────────────────────────────────────────────
  $('resetBtn').onclick = async () => {
    if (!await kit.confirm({ title: '처음부터 할까요?', lines: ['해 본 명령, 안 되는 말 기록, 심부름 기록이 지워져요.', '(성장기록부는 그대로예요)'], okText: '네, 처음부터', danger: true })) return;
    if (kit.running) { kit.stop(); endRun(); }
    stopListening(); kit.led(0); kit.dot.clear();
    ['step', 'mode', 'tried', 'notes', 'exam', 'done', 'best', 'log'].forEach(k => kit.store.remove(k));
    load(); why = null; $('stars').textContent = '';
    showStep(1);
  };

  // ── 그리기 ───────────────────────────────────────────────────────
  function render() {
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === step));
    // 방식 표시 — 어느 모드인지 늘 분명히
    $('modeBar').className = 'modebar ' + mode;
    $('modeText').innerHTML = mode === 'voice' ? '🎤 <b>음성 인식 모드</b> · 태블릿이 직접 들어요'
      : SR ? '🃏 <b>말 카드 모드</b> · 친구가 말하면 기록원이 카드를 눌러요'
      : '🃏 <b>말 카드 모드</b> · 이 태블릿은 직접 못 들어요. 기록원이 카드를 눌러요';
    $('modeToggle').classList.toggle('hidden', !SR);
    $('modeToggle').textContent = mode === 'voice' ? '🃏 말 카드로 바꾸기' : '🎤 음성 인식으로 바꾸기';
    $('micBox').classList.toggle('hidden', mode !== 'voice');
    $('cardBox').classList.toggle('hidden', mode !== 'card');
    renderMic();

    const e = ERRANDS[exam.ei];
    $('mission').textContent = step === 1 ? '🗣 알티노에게 말로 명령해 봐요. 사전의 말을 하나씩 시험해요.'
      : step === 2 ? '🔍 알티노가 못 알아듣는 말을 찾아요. 왜 안 될까요?'
      : `🧾 ${e.name}: 세 가지를 차례로 말로 시켜요. 틀리면 처음부터!`;
    $('errands').classList.toggle('hidden', step !== 3);
    $('slots').classList.toggle('hidden', step !== 3);
    [...$('errands').children].forEach((b, i) => { b.classList.toggle('on', i === exam.ei); b.classList.toggle('done', !!done[ERRANDS[i].id]); });
    $('slots').innerHTML = e.seq.map((k, i) => {
      const cls = i < exam.streak ? 'ok' : i === exam.streak && !exam.finished ? 'now' : '';
      return `<span class="${cls}"><b>${i < exam.streak ? '✓' : CMDS[k].icon}</b>${CMDS[k].name}</span>`;
    }).join('<i>→</i>');

    // 오른쪽
    $('dictPanel').classList.toggle('hidden', step !== 1);
    $('notePanel').classList.toggle('hidden', step !== 2);
    $('examPanel').classList.toggle('hidden', step !== 3);
    const n = KEYS.filter(k => tried[k]).length;
    $('dictTitle').textContent = `📖 알티노 말 사전 (해 본 명령 ${n}/${KEYS.length})`;
    $('dict').innerHTML = KEYS.map(k => `<div class="${tried[k] ? 'tried' : ''}"><b>${CMDS[k].icon}</b><span>${CMDS[k].name}<small>${CMDS[k].tip}</small></span></div>`).join('');

    const lg = $('log'); lg.innerHTML = '';
    if (!log.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 없어요 — 말로 명령해 봐요'; lg.appendChild(li); }
    log.slice().reverse().forEach(x => {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = x.t != null ? `“${x.t}”` : '🃏 기록원 카드';
      const b = document.createElement('em'); b.textContent = x.k ? `${CMDS[x.k].icon} ${CMDS[x.k].name}` : '❓ 못 알아들음';
      li.append(a, b); lg.appendChild(li);
    });

    $('noteTitle').textContent = `📝 안 되는 말 기록 (${notes.length}개)`;
    document.querySelectorAll('#whys button').forEach(b => b.classList.toggle('on', b.dataset.w === why));
    const label = (w) => (WHYS.find(x => x[0] === w) || WHYS[5])[1];
    const list = $('notes'); list.innerHTML = '';
    if (!notes.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 없어요 — 3개 이상 찾아봐요'; list.appendChild(li); }
    notes.slice(-5).reverse().forEach(nt => {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = `“${nt.t}”`;
      const b = document.createElement('em'); b.textContent = label(nt.why);
      li.append(a, b); list.appendChild(li);
    });

    $('streak').innerHTML = [0, 1, 2].map(i => `<span class="${i < exam.streak ? 'ok' : ''}">${i < exam.streak ? '✓' : i + 1}</span>`).join('');
    $('streakText').textContent = exam.finished ? '3개 연속 성공! 심부름 끝 🎉' : `연속 성공 ${exam.streak} / 3`;
    $('retryText').textContent = `처음부터 다시 한 횟수 ${exam.retries}번 · 방식: ${mode === 'voice' ? '음성 인식' : '말 카드'}`;
    $('talk').classList.toggle('hidden', !exam.finished);
    if (exam.finished && !$('stars').textContent) $('stars').textContent = '⭐'.repeat(exam.retries === 0 ? 3 : exam.retries <= 2 ? 2 : 1);
  }

  showStep(step);
})();
