// t01 로봇학교 입학식 (1–2차시) — 기획서 docs/topics/t01.md
// ① 알티노 깨우기(전원·연결·눈 뜨기) → ② 이름 지어 주기(후보·까닭·합의 → kit.team.set)
// → ③ 첫 주행과 관찰(패드 + '할 수 있는 것/아직 못 하는 것' 찾기) → 입학 약속 → 성장기록부 첫 줄
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't01',
    title: '로봇학교 입학식',
    onStatus: () => renderWake(),
    onRunEnd: () => renderWake(),
  });

  const SPEED = 300;                          // 첫 주행은 순항 속도 하나만 (속도 탐구는 t02)
  // 도트 얼굴 — 바이트 = 행(위→아래), 비트7 = 맨 왼쪽 (03 §5)
  const FACE = {
    sleep: [0x00, 0x00, 0x00, 0x66, 0x00, 0x00, 0x18, 0x00],   // 감은 눈
    half:  [0x00, 0x00, 0x66, 0x66, 0x00, 0x00, 0x18, 0x00],
    open:  [0x00, 0x66, 0x66, 0x66, 0x00, 0x00, 0x18, 0x00],   // 뜬 눈 (아직 무표정)
    smile: [0x00, 0x66, 0x66, 0x66, 0x00, 0x42, 0x3C, 0x00],   // 입학 축하
  };
  // 관찰 카드 — 지금 할 수 있는 것 1개 + 아직 못 하는 것 5개 = 앞으로의 시간표
  const SKILLS = [
    { id: 'move',   m: '🚗', name: '앞뒤로 움직이기', can: true },
    { id: 'stop',   m: '🎯', name: '정지선에 딱 멈추기', lessons: '3–4차시' },
    { id: 'face',   m: '🙂', name: '표정 짓기',        lessons: '5–6차시' },
    { id: 'song',   m: '🎵', name: '노래하기',         lessons: '7–8차시' },
    { id: 'signal', m: '💡', name: '신호 보내기',      lessons: '9–10차시' },
    { id: 'hand',   m: '✋', name: '손 따라오기',      lessons: '11–12차시' },
  ];
  const LOCKED = SKILLS.filter(s => !s.can);
  const PLEDGES = ['알티노를 떨어뜨리지 않아요.', '실패해도 화내지 않고 다시 가르쳐요.', '조종은 돌아가며 해요.'];

  // ── 저장값 ───────────────────────────────────────────────────────
  let power = !!kit.store.get('power', false);
  let woke = !!kit.store.get('woke', false);
  let cands = kit.store.get('cands', []);
  if (!Array.isArray(cands)) cands = [];
  cands = cands.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim().slice(0, 12)).slice(0, 4);
  let pick = null;
  let moved = kit.store.get('moved', {});
  if (!moved || typeof moved !== 'object') moved = {};
  let found = kit.store.get('found', []);
  if (!Array.isArray(found)) found = [];
  found = found.filter(id => LOCKED.some(s => s.id === id));
  let enrolled = !!kit.store.get('enrolled', false);
  let pledged = [];

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 3);
  function showStep(n) {
    if (kit.running) { kit.stop(); renderWake(); }   // kit.stop 은 onRunEnd 를 부르지 않는다
    if (n !== 3) releasePad();
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── 얼굴(화면 미리보기 + 로봇 도트) ──────────────────────────────
  for (let i = 0; i < 64; i++) $('face').appendChild(document.createElement('i'));
  function showFace(bytes) {
    kit.dot.bytes(bytes);
    const cells = $('face').children;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cells[r * 8 + c].classList.toggle('on', !!(bytes[r] & (0x80 >> c)));
  }

  // ── ① 알티노 깨우기 ──────────────────────────────────────────────
  $('powerOk').onclick = () => { power = true; kit.store.set('power', true); renderWake(); };
  $('connBtn').onclick = () => kit.openConnect();
  $('wakeBtn').onclick = () => {
    if (!kit.connected) { kit.toast('먼저 🔗 연결해요'); return; }
    const ok = kit.run(async (r) => {
      $('wakeBtn').disabled = true;
      $('wakeMsg').textContent = '일어나라, 알티노!';
      showFace(FACE.sleep);  if (!await r.sleep(700)) return;
      showFace(FACE.half);   if (!await r.sleep(300)) return;
      showFace(FACE.sleep);  if (!await r.sleep(300)) return;   // 한 번 깜빡
      showFace(FACE.open);
      kit.signal('success');
      if (!await r.sleep(600)) return;                          // 신호음이 끝날 때까지
      woke = true; kit.store.set('woke', true);
    });
    if (!ok) kit.toast('이미 움직이는 중이에요');
  };
  function renderWake() {
    const conn = kit.connected;
    const done1 = power || conn, done2 = conn;
    $('todo1').classList.toggle('done', done1);
    $('todo2').classList.toggle('done', done2);
    $('todo3').classList.toggle('done', woke);
    $('powerOk').classList.toggle('hidden', done1);
    $('connBtn').textContent = conn ? '🔗 연결됨' : '🔗 연결하기';
    $('wakeBtn').disabled = !conn || kit.running;
    $('wakeBtn').textContent = woke ? '👋 한 번 더 깨우기' : '👋 알티노 깨우기';
    if (!kit.running) $('wakeMsg').textContent = woke ? '알티노가 눈을 떴어요! 그런데 아직 아무것도 할 줄 몰라요.' : '알티노가 자고 있어요. 💤';
  }

  // ── ② 이름 지어 주기 ─────────────────────────────────────────────
  $('candAdd').onclick = () => {
    const v = $('candIn').value.trim().slice(0, 12);
    if (!v) { kit.toast('이름 후보를 적어요'); return; }
    if (cands.includes(v)) { kit.toast('이미 있는 후보예요'); return; }
    if (cands.length >= 4) { kit.toast('후보는 4개까지예요. 하나를 지우고 올려요'); return; }
    cands.push(v); kit.store.set('cands', cands); $('candIn').value = ''; renderName();
  };
  $('candIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('candAdd').click(); });
  $('nameSet').onclick = async () => {
    if (!pick) return;
    const now = kit.team.get();
    if (!await kit.confirm({
      title: `‘${pick}’, 이 이름으로 지을까요?`,
      lines: now ? [`지금 이름 ‘${now}’ 대신 이 이름을 써요`, '앞으로 모든 수업에서 이 이름을 불러요'] : ['앞으로 모든 수업에서 이 이름을 불러요'],
      okText: '네, 정해요',
    })) return;
    kit.team.set(pick);
    showFace(FACE.open); kit.dot.icon('heart'); kit.signal('success');
    renderName(); renderObs();
  };
  function renderName() {
    const now = kit.team.get();
    $('cands').innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button'), c = cands[i];
      if (c) {
        b.textContent = c; b.classList.toggle('on', c === pick);
        const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
        x.onclick = (e) => { e.stopPropagation(); cands = cands.filter(v => v !== c); if (pick === c) pick = null; kit.store.set('cands', cands); renderName(); };
        b.appendChild(x);
        b.onclick = () => { pick = c; renderName(); };
      } else { b.className = 'empty'; b.textContent = '후보 ' + (i + 1); }
      $('cands').appendChild(b);
    }
    $('nameplate').textContent = now || '아직 없어요';
    $('nameplate').classList.toggle('set', !!now);
    $('nameSet').disabled = !pick || pick === now;
    $('nameSet').textContent = now ? '이 이름으로 바꾸기' : '이 이름으로 정하기';
    $('nameMsg').textContent = now ? `반가워, ${now}! 이제 모든 화면 위에 이름이 보여요.` : (pick ? `‘${pick}’ — 모두 좋아요 하면 눌러요.` : '후보를 하나 고르고 정해요.');
  }

  // ── ③ 첫 주행과 관찰 ─────────────────────────────────────────────
  let fwd = 0, turn = 0;
  const apply = () => kit.drive(fwd * SPEED, turn);
  const markMoved = (k) => { if (!moved[k]) { moved[k] = true; kit.store.set('moved', moved); renderObs(); } };
  const pads = [
    kit.hold($('d-up'),    () => { fwd = 1; apply(); markMoved('f'); },  () => { fwd = 0; apply(); }),
    kit.hold($('d-down'),  () => { fwd = -1; apply(); markMoved('b'); }, () => { fwd = 0; apply(); }),
    kit.hold($('d-left'),  () => { turn = -100; apply(); },  () => { turn = 0; apply(); }),
    kit.hold($('d-right'), () => { turn = 100; apply(); },   () => { turn = 0; apply(); }),
  ];
  function releasePad() { pads.forEach(h => h && h.release()); fwd = 0; turn = 0; }
  const canMove = () => !!(moved.f && moved.b);

  SKILLS.forEach(s => {
    const b = document.createElement('button'); b.dataset.id = s.id;
    b.onclick = () => {
      if (s.can) {
        if (canMove()) { kit.dot.icon('ok'); kit.signal('success'); kit.toast('할 수 있어요! 방금 해 봤지요?'); }
        else kit.toast('▲·▼ 버튼으로 직접 움직여 봐요');
        return;
      }
      kit.dot.icon('ask'); kit.signal('notice');
      kit.toast(`아직 못 해요 — ${s.lessons}에 가르쳐 줘요`, 2200);
      if (!found.includes(s.id)) { found.push(s.id); kit.store.set('found', found); }
      renderObs();
    };
    $('cando').appendChild(b);
  });

  function renderObs() {
    document.querySelectorAll('#cando button').forEach(b => {
      const s = SKILLS.find(x => x.id === b.dataset.id);
      const can = s.can && canMove(), lock = !s.can && found.includes(s.id);
      b.classList.toggle('can', can); b.classList.toggle('locked', lock);
      b.innerHTML = `<span class="m">${s.m}</span><b>${s.name}</b><small>${
        s.can ? (can ? '✓ 할 수 있어요' : '움직여 보면 알아요') : (lock ? '🔒 ' + s.lessons + '에 배워요' : '눌러서 시켜 봐요')}</small>`;
    });
    const n = found.length, team = kit.team.get();
    const ready = n === LOCKED.length && canMove();
    $('pledgeOpen').disabled = enrolled || !ready || !team;
    $('pledgeOpen').textContent = enrolled ? '✔ 입학했어요' : '🎒 입학 약속하기';
    $('foundMsg').textContent = enrolled ? '📒 성장기록부 첫 줄이 생겼어요! 다음 시간: 걸음마 가르치기'
      : !ready ? `아직 못 하는 것 ${n} / ${LOCKED.length}${canMove() ? '' : ' · ▲·▼로 움직여 보기'}`
      : !team ? '② 이름 지어 주기를 먼저 해요'
      : '다 찾았어요! 이제 우리가 가르쳐 줄 차례예요.';
  }

  $('obsReset').onclick = async () => {
    if (!await kit.confirm({ title: '처음부터 할까요?', lines: ['깨우기·후보·관찰 기록이 지워져요', '모둠 이름과 성장기록부는 그대로예요'], okText: '네, 처음부터', danger: true })) return;
    ['power', 'woke', 'cands', 'moved', 'found', 'enrolled'].forEach(k => kit.store.remove(k));
    power = false; woke = false; cands = []; pick = null; moved = {}; found = []; enrolled = false;
    showFace(FACE.sleep); renderWake(); renderName(); renderObs();
  };

  // ── 입학 약속 창 ─────────────────────────────────────────────────
  kit.block($('pledge'));
  PLEDGES.forEach((t, i) => {
    const b = document.createElement('button'); b.textContent = t;
    b.onclick = () => { if (!pledged.includes(i)) pledged.push(i); b.classList.add('on'); $('enroll').disabled = pledged.length < PLEDGES.length; };
    $('pledgeList').appendChild(b);
  });
  $('pledgeOpen').onclick = () => {
    releasePad();
    pledged = []; document.querySelectorAll('#pledgeList button').forEach(b => b.classList.remove('on'));
    $('enroll').disabled = true; $('pledge').classList.remove('hidden');
  };
  $('pledgeClose').onclick = () => $('pledge').classList.add('hidden');
  $('enroll').onclick = () => {
    if (pledged.length < PLEDGES.length) return;
    const team = kit.team.get();
    if (!enrolled && !kit.record.ofApp().length) {            // 입학 기록은 한 번만 (05 §7)
      kit.record.add({ title: '로봇학교에 입학했어요', detail: `${kit.josa(team, '과와')} 함께 · 가르쳐 줄 것 ${LOCKED.length}가지를 찾았어요`, stars: 0 });
    }
    enrolled = true; kit.store.set('enrolled', true);
    $('pledge').classList.add('hidden');
    showFace(FACE.smile); kit.signal('success');
    kit.toast(`🎉 ${kit.josa(team, '이가')} 로봇학교에 입학했어요!`, 2600);
    renderObs();
  };

  // ── 시작 ─────────────────────────────────────────────────────────
  showFace(woke ? FACE.open : FACE.sleep);
  showStep(step);
  renderWake(); renderName(); renderObs();
})();
