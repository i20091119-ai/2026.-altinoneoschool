// t05 비밀 신호 보내기 (9–10차시) — 기획서 docs/topics/t05.md
// ① 자동차 불빛의 뜻(등 버튼 · 경적 · SOS) → ② 모둠 신호 만들기(빛·경적 × 짧게·길게, 신호표)
// → ③ 말 없이 전하기 시험(받는 모둠이 신호표로 해독, 기록원 ⭕/❌) → ④ 더 해 보기(신호 몇 가지? · 선생님용 LED 점검)
// ⚠ LED 는 '15 = 전조등(네오)'만 실측됐다(03 §6). 라이트는 1바이트, 비트 뜻 실측 전 → LAMPS 의 mask:null 은 화면 그림으로만.
//   실측하면 LAMPS 의 mask 만 채우면 된다(④ LED 점검 칸으로 잴 수 있다).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't05',
    title: '비밀 신호 보내기',
    onRunEnd: () => { kit.led(0); renderAll(); },
  });

  const LIGHT = 15;          // 신호 블록의 빛 = 전조등 (실측값)
  const HORN = 42;           // 경적 = 파 (실측 8음 중 신호 사전이 쓰지 않는 음)
  const UNIT = 300;          // 짧게 1 : 길게 3, 블록 사이 1 (모스부호 길이 규칙)
  const LAMPS = [
    { id: 'head',  icon: '🔦', name: '전조등',      mask: LIGHT, blink: false, mean: '앞을 밝혀요 · 나 여기 있어요' },
    { id: 'left',  icon: '⬅',  name: '왼쪽 깜빡이', mask: null,  blink: true,  mean: '왼쪽으로 가요' },
    { id: 'right', icon: '➡',  name: '오른쪽 깜빡이', mask: null, blink: true,  mean: '오른쪽으로 가요' },
    { id: 'brake', icon: '🛑', name: '브레이크등',  mask: null,  blink: false, mean: '멈춰요 · 천천히 가요' },
  ];
  const MEANS = ['안녕', '고마워', '조심해', '따라와'];
  const EL = {
    ls: { t: '💡·', name: '빛 짧게' }, ll: { t: '💡—', name: '빛 길게' },
    hs: { t: '📣·', name: '경적 짧게' }, hl: { t: '📣—', name: '경적 길게' },
  };
  const MAXEL = 6, TESTN = 4;

  // ── 저장값 ───────────────────────────────────────────────────────
  let sigs = kit.store.get('signals', {});            // { 뜻: ['ls','hl',…] } — t15 학예회에서 다시 쓸 신호표
  if (!sigs || typeof sigs !== 'object' || Array.isArray(sigs)) sigs = {};
  MEANS.forEach(m => { sigs[m] = Array.isArray(sigs[m]) ? sigs[m].filter(e => EL[e]).slice(0, MAXEL) : []; });
  Object.keys(sigs).forEach(k => { if (!MEANS.includes(k)) delete sigs[k]; });
  let mean = MEANS[0];
  let test = kit.store.get('test', null);
  if (!test || !Array.isArray(test.order) || test.order.length !== TESTN || !test.order.every(m => MEANS.includes(m)) || !Array.isArray(test.results)) test = null;
  let phase = 'idle';   // idle | sending | judge | done

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 4);
  function stopAll() { if (kit.running) kit.stop(); kit.led(0); }
  function showStep(n) {
    stopAll(); if (phase === 'sending') phase = 'judge';
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    renderAll();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // 신호 하나 재생 — kit.run 안에서 (S5). 빛은 전조등, 소리는 경적.
  async function playSig(r, list) {
    for (const e of list) {
      const d = (e[1] === 'l' ? 3 : 1) * UNIT;
      if (e[0] === 'l') kit.led(LIGHT); else kit.beep(HORN, d);
      if (!await r.sleep(d)) return false;
      kit.led(0);
      if (!await r.sleep(UNIT)) return false;
    }
    return true;
  }

  // ── ① 자동차 불빛의 뜻 ───────────────────────────────────────────
  LAMPS.forEach(l => {
    const b = document.createElement('button'); b.dataset.id = l.id;
    b.innerHTML = `<span class="m">${l.icon}</span><b>${l.name}</b><small>${l.mask == null ? '그림으로 알아봐요' : '알티노가 켜요'}</small>`;
    b.onclick = () => {
      stopAll();
      document.querySelectorAll('#lamps button').forEach(x => x.classList.toggle('on', x === b));
      $('meanBox').textContent = `${l.icon} ${l.name} — ${l.mean}`;
      if (l.mask == null) return;
      if (!l.blink) { kit.led(l.mask); return; }
      kit.run(async (r) => { for (let k = 0; k < 6; k++) { kit.led(k % 2 ? 0 : l.mask); if (!await r.sleep(500)) return; } });
    };
    $('lamps').appendChild(b);
  });
  $('horn').onclick = () => { kit.beep(HORN, 400); };
  $('lampOff').onclick = () => { stopAll(); document.querySelectorAll('#lamps button').forEach(x => x.classList.remove('on')); renderAll(); };
  const SOS = ['ls', 'ls', 'ls', 'll', 'll', 'll', 'ls', 'ls', 'ls'];
  $('sos').onclick = () => {
    stopAll();
    const ok = kit.run(async (r) => { await playSig(r, SOS); });
    if (ok) renderAll();
  };
  $('stop1').onclick = () => { stopAll(); renderAll(); };   // kit.stop 은 onRunEnd 를 부르지 않는다

  // ── ② 모둠 신호 만들기 ──────────────────────────────────────────
  MEANS.forEach(m => {
    const b = document.createElement('button'); b.textContent = m; b.dataset.m = m;
    b.onclick = () => { mean = m; renderAll(); };
    $('meanChips').appendChild(b);
  });
  Object.entries(EL).forEach(([k, v]) => {
    const b = document.createElement('button'); b.textContent = v.t + ' ' + v.name.split(' ')[1]; b.dataset.e = k;
    b.onclick = () => {
      if (kit.running) return;
      if (sigs[mean].length >= MAXEL) { kit.toast(`블록은 ${MAXEL}개까지예요`); return; }
      sigs[mean].push(k); saveSigs(); renderAll();
    };
    $('pal').appendChild(b);
  });
  $('back2').onclick = () => { if (kit.running) return; sigs[mean].pop(); saveSigs(); renderAll(); };
  $('clr2').onclick = () => { if (kit.running) return; sigs[mean] = []; saveSigs(); renderAll(); };
  const tryOne = (list) => {
    if (!list.length) { kit.toast('블록을 먼저 놓아요'); return; }
    stopAll();
    const ok = kit.run(async (r) => { await playSig(r, list); });
    if (ok) renderAll();
  };
  $('try2').onclick = () => tryOne(sigs[mean]);
  $('stop2').onclick = () => { stopAll(); renderAll(); };
  function saveSigs() { kit.store.set('signals', sigs); }
  const keyOf = (l) => l.join(',');
  function dups() {
    const seen = {}, out = [];
    MEANS.forEach(m => { const k = keyOf(sigs[m]); if (!k) return; if (seen[k]) out.push([seen[k], m]); else seen[k] = m; });
    return out;
  }
  const sigReady = () => MEANS.every(m => sigs[m].length) && !dups().length;
  const sigHTML = (l) => l.map(e => `<span class="el ${e}">${EL[e].t}</span>`).join('');

  function renderSigs() {
    document.querySelectorAll('#meanChips button').forEach(b => {
      b.classList.toggle('on', b.dataset.m === mean); b.classList.toggle('done', sigs[b.dataset.m].length > 0);
    });
    $('editSig').innerHTML = sigs[mean].length ? sigHTML(sigs[mean]) : '<span class="lead">‘' + mean + '’ 신호 블록을 놓아요</span>';
    const d = dups(), dupSet = new Set(d.flat());
    $('sigTable').innerHTML = '';
    MEANS.forEach(m => {
      const tr = document.createElement('tr'); tr.className = (m === mean ? 'on ' : '') + (dupSet.has(m) ? 'dup' : '');
      tr.innerHTML = `<td>${m}</td><td><div class="sig">${sigs[m].length ? sigHTML(sigs[m]) : '<span class="lead">–</span>'}</div></td>`;
      const td = document.createElement('td'), b = document.createElement('button');
      b.className = 'btn ghost'; b.textContent = '▶'; b.onclick = () => tryOne(sigs[m]);
      td.appendChild(b); tr.appendChild(td);
      tr.onclick = (e) => { if (e.target !== b) { mean = m; renderAll(); } };
      $('sigTable').appendChild(tr);
    });
    $('warn2').textContent = d.length ? '⚠ 같은 신호가 있어요: ' + d.map(([a, b]) => `${a} = ${b}`).join(', ') + ' — 받는 사람이 구별할 수 없어요' : '';
    const n = MEANS.filter(m => sigs[m].length).length;
    $('msg2').textContent = sigReady() ? '신호표 완성! ③에서 다른 모둠에게 전해 봐요.' : `신호를 만든 뜻 ${n} / ${MEANS.length}`;
  }

  // ── ③ 말 없이 전하기 시험 ───────────────────────────────────────
  const wins = () => test ? test.results.filter(Boolean).length : 0;
  const starsOf = (w) => (w >= 4 ? 3 : w === 3 ? 2 : w === 2 ? 1 : 0);
  function newTest() {
    const o = MEANS.slice();
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    test = { order: o, results: [] }; kit.store.set('test', test); phase = 'idle';
  }
  const curMean = () => test && test.order[test.results.length];
  $('send').onclick = () => {
    if (!sigReady()) return;
    if (!test || test.results.length >= TESTN) newTest();
    const m = curMean();
    $('answer').textContent = `정답: ‘${m}’`;
    phase = 'sending';
    const ok = kit.run(async (r) => { if (await playSig(r, sigs[m])) phase = 'judge'; });
    if (!ok) phase = 'judge';
    renderAll();
  };
  $('stop3').onclick = () => { stopAll(); phase = 'judge'; renderAll(); };
  const judge = (ok) => {
    if (phase !== 'judge') return;
    test.results.push(ok); kit.store.set('test', test);
    kit.signal(ok ? 'success' : 'fail'); $('answer').textContent = '';
    if (test.results.length >= TESTN) finish(); else phase = 'idle';
    renderAll();
  };
  $('judgeOk').onclick = () => judge(true);
  $('judgeNo').onclick = () => judge(false);
  $('retry').onclick = () => { newTest(); renderAll(); };
  function finish() {
    phase = 'done';
    const s = starsOf(wins());
    if (s > 0) {
      const best = kit.store.num('bestStars', 0, 0, 3);
      if (s > best) {                                   // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
        kit.store.set('bestStars', s);
        kit.record.add({ title: '말 없이 신호를 전했어요', detail: `받는 모둠이 맞힌 신호 ${wins()} / ${TESTN}`, stars: s });
      }
    }
  }
  function renderTest() {
    if (test && test.results.length >= TESTN && phase !== 'judge' && phase !== 'sending') phase = 'done';
    const res = test ? test.results : [];
    $('tries').innerHTML = '';
    for (let i = 0; i < TESTN; i++) {
      const s = document.createElement('span');
      s.textContent = i < res.length ? (res[i] ? '✓' : '✗') : ''; if (i < res.length) s.className = res[i] ? 'ok' : 'no';
      $('tries').appendChild(s);
    }
    const sending = phase === 'sending' && kit.running;
    $('send').classList.toggle('hidden', sending); $('stop3').classList.toggle('hidden', !sending);
    $('send').disabled = !sigReady() || phase === 'judge' || phase === 'done';
    $('send').textContent = phase === 'judge' ? '▶ 한 번 더 보내기' : '▶ 신호 보내기';
    $('judgeBox').classList.toggle('hidden', phase !== 'judge');
    $('resultBox').classList.toggle('hidden', phase !== 'done');
    $('retry').classList.toggle('hidden', phase !== 'done');
    $('testMsg').textContent = !sigReady() ? '② 신호표를 먼저 완성해요(네 뜻 모두, 서로 다르게).'
      : phase === 'done' ? `받는 모둠이 ${wins()}개를 맞혔어요.`
      : phase === 'judge' ? '받는 모둠이 뜻을 말해요. 다시 보고 싶으면 한 번 더 보내도 돼요.'
      : `${res.length + 1}번째 신호! 전달자가 눌러요.`;
    if (phase === 'judge' && sigReady()) $('send').disabled = false;          // 판정 전에 한 번 더 보내기 허용
    if (phase === 'done') {
      const s = starsOf(wins());
      $('resultBox').innerHTML = s ? `<span class="m">📡</span><b>신호 전하기 합격!</b><br>${'⭐'.repeat(s)} · ${wins()} / ${TESTN}`
        : `<span class="m">💪</span><b>아깝다!</b><br>헷갈린 신호를 더 다르게 고쳐서 다시 해요.`;
    }
  }

  // ── ④ 선택: 신호 블록 몇 개로 몇 가지? ──────────────────────────
  let gLen = 2, guess = 2;
  [1, 2, 3].forEach(n => {
    const b = document.createElement('button'); b.textContent = `블록 ${n}개`; b.dataset.n = n;
    b.onclick = () => { gLen = n; guess = 2; $('gMsg').textContent = '예상을 정하고 확인을 눌러요.'; $('combos').innerHTML = ''; renderAll(); };
    $('lenChips').appendChild(b);
  });
  $('gMinus').onclick = () => { guess = Math.max(1, guess - 1); renderAll(); };
  $('gPlus').onclick = () => { guess = Math.min(20, guess + 1); renderAll(); };
  $('gCheck').onclick = () => {
    const all = [];
    (function walk(s) { if (s.length === gLen) { all.push(s); return; } walk(s + '·'); walk(s + '—'); })('');
    $('combos').innerHTML = all.map(s => `<span>${s}</span>`).join('');
    const right = guess === all.length;
    kit.signal(right ? 'success' : 'notice');
    $('gMsg').textContent = (right ? '맞아요! ' : `예상 ${guess} → `) + `블록 ${gLen}개로 ${all.length}가지 신호를 만들 수 있어요.` + (gLen < 3 ? ' 한 칸 늘리면?' : '');
    const done = kit.store.get('countDone', []);
    if (Array.isArray(done) && !done.includes(gLen)) { done.push(gLen); kit.store.set('countDone', done); }
  };

  // ── ④ 선생님용 LED 점검 ─────────────────────────────────────────
  let mask = 0;
  kit.block($('ledModal'));
  [1, 2, 4, 8, 16, 32, 64, 128].forEach(v => {
    const b = document.createElement('button'); b.textContent = v; b.dataset.v = v;
    b.onclick = () => { mask = mask === v ? 0 : v; kit.led(mask); renderLed(); };   // 한 번에 한 값만 — 어느 등인지 헷갈리지 않게
    $('bits').appendChild(b);
  });
  $('bit15').onclick = () => { mask = 15; kit.led(mask); renderLed(); };
  $('bitOff').onclick = () => { mask = 0; kit.led(0); renderLed(); };
  $('ledOpen').onclick = () => { stopAll(); mask = 0; renderLed(); $('ledModal').classList.remove('hidden'); };
  $('ledClose').onclick = () => { mask = 0; kit.led(0); $('ledModal').classList.add('hidden'); };
  function renderLed() {
    $('maskVal').textContent = mask;
    document.querySelectorAll('#bits button').forEach(b => b.classList.toggle('on', +b.dataset.v === mask));
  }

  // ── 그리기 ───────────────────────────────────────────────────────
  function renderAll() {
    const run = kit.running;
    $('sos').classList.toggle('hidden', run && step === 1); $('stop1').classList.toggle('hidden', !(run && step === 1));
    $('try2').classList.toggle('hidden', run && step === 2); $('stop2').classList.toggle('hidden', !(run && step === 2));
    renderSigs(); renderTest();
    document.querySelectorAll('#lenChips button').forEach(b => b.classList.toggle('on', +b.dataset.n === gLen));
    $('gVal').textContent = guess;
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  if (test && test.results.length >= TESTN) phase = 'done';
  showStep(step);
})();
