// t03 표정 만들기 (5–6차시) — 기획서 docs/topics/t03.md
// ① 64칸 얼굴 탐색(그림판 = 알티노 도트) → ② 상황 카드 표정 짓기(마음 고르기 + 표정 저장 4장)
// → ③ 표정 맞히기 시험(다른 모둠이 맞힘, 기록원 ⭕/❌) → ④ 더 해 보기(움직이는 표정 · 칸 줄이기)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);

  const kit = AltinoKit.create({
    appId: 't03',
    title: '표정 만들기',
    onRunEnd: () => renderAnim(),
  });

  // 바이트 = 행(위→아래), 비트7 = 맨 왼쪽 (03 §5)
  const SAMPLES = [
    { name: '기쁨', bytes: [0x00, 0x66, 0x66, 0x00, 0x81, 0x42, 0x3C, 0x00] },
    { name: '슬픔', bytes: [0x00, 0x66, 0x66, 0x40, 0x00, 0x3C, 0x42, 0x81] },
    { name: '놀람', bytes: [0x00, 0x66, 0x66, 0x00, 0x18, 0x24, 0x24, 0x18] },
  ];
  const CARDS = [
    { id: 'praise', icon: '🖼', text: '친구가 내 그림을 칭찬했어요' },
    { id: 'pencil', icon: '✏', text: '아끼는 연필이 부러졌어요' },
    { id: 'noise',  icon: '💥', text: '교실에서 갑자기 큰 소리가 났어요' },
    { id: 'fall',   icon: '🩹', text: '친구가 넘어져서 무릎을 다쳤어요' },
  ];
  const FEELS = ['기쁨', '슬픔', '놀람', '걱정', '화남', '부끄러움'];
  const SPEEDS = [{ ms: 300, name: '빠르게' }, { ms: 600, name: '보통' }, { ms: 1000, name: '느리게' }];
  const TESTN = 4;

  // ── 저장값 (망가진 값 방어) ──────────────────────────────────────
  const okBytes = (b) => Array.isArray(b) && b.length === 8 && b.every(x => Number.isInteger(x) && x >= 0 && x <= 255);
  const empty = () => [0, 0, 0, 0, 0, 0, 0, 0];
  let g1 = kit.store.get('g1', null); if (!okBytes(g1)) g1 = empty();
  let g2 = empty();
  let faces = kit.store.get('faces', {});            // { cardId: { feel, bytes } } — t15 학예회에서 다시 쓸 표정
  if (!faces || typeof faces !== 'object' || Array.isArray(faces)) faces = {};
  Object.keys(faces).forEach(k => { if (!CARDS.some(c => c.id === k) || !okBytes(faces[k].bytes)) delete faces[k]; });
  let card = null, feel = null;
  let test = kit.store.get('test', null);
  if (!test || !Array.isArray(test.order) || !Array.isArray(test.results) || test.order.length !== TESTN) test = null;
  let anim = kit.store.get('anim', null);
  if (!anim || !Array.isArray(anim.frames) || anim.frames.length !== 3) anim = { frames: ['sample:0', 'g1', 'sample:0'], ms: 600 };
  if (!SPEEDS.some(s => s.ms === anim.ms)) anim.ms = 600;
  let few = kit.store.get('few', {});
  if (!few || typeof few !== 'object' || Array.isArray(few)) few = {};
  let feel4 = '기쁨';

  const lit = (b) => b.reduce((n, x) => { for (let i = 0; i < 8; i++) if (x & (1 << i)) n++; return n; }, 0);
  const show = (b) => kit.dot.bytes(b.slice());
  const miniHTML = (b) => { let h = ''; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) h += `<i class="${b[r] & (0x80 >> c) ? 'on' : ''}"></i>`; return h; };

  // ── 단계 ─────────────────────────────────────────────────────────
  let step = kit.store.num('step', 1, 1, 4);
  function showStep(n) {
    if (kit.running) { kit.stop(); renderAnim(); }
    step = n; kit.store.set('step', n);
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === n));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== n));
    if (n === 1) show(g1);
    else if (n === 2) show(g2);
    else kit.dot.clear();
    if (n === 4) renderFew();
  }
  document.querySelectorAll('#steps button').forEach(b => { b.onclick = () => showStep(+b.dataset.step); });

  // ── 그림판(① ② 같이 씀) ──────────────────────────────────────────
  function makeGrid(el, get, set, after) {
    const cells = [];
    for (let i = 0; i < 64; i++) {
      const b = document.createElement('button'), r = i >> 3, c = i & 7;
      b.onclick = () => { const v = get().slice(); v[r] ^= (0x80 >> c); set(v); paint(); show(v); after(); };
      el.appendChild(b); cells.push(b);
    }
    function paint() { const v = get(); cells.forEach((b, i) => b.classList.toggle('on', !!(v[i >> 3] & (0x80 >> (i & 7))))); }
    return paint;
  }
  const paint1 = makeGrid($('grid1'), () => g1, (v) => { g1 = v; kit.store.set('g1', v); }, () => renderCount());
  const paint2 = makeGrid($('grid2'), () => g2, (v) => { g2 = v; }, () => renderCards());
  function renderCount() {
    $('count1').textContent = `켠 칸 ${lit(g1)} / 64`;
    $('count4').textContent = `지금 ① 그림판: ${lit(g1)}칸`;
  }
  $('clear1').onclick = () => { g1 = empty(); kit.store.set('g1', g1); paint1(); show(g1); renderCount(); };
  $('clear2').onclick = () => { g2 = empty(); paint2(); show(g2); renderCards(); };

  // ① 따라 그리기 예시 — 누르면 알티노가 먼저 보여 준다(그림판은 그대로)
  SAMPLES.forEach(s => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="mini">${miniHTML(s.bytes)}</span><b>${s.name}</b>`;
    b.onclick = () => { show(s.bytes); $('tip1').textContent = `알티노가 ‘${s.name}’ 얼굴을 보여 줘요. 이제 직접 그려 봐요!`; };
    $('samples').appendChild(b);
  });

  // ── ② 상황 카드 ──────────────────────────────────────────────────
  FEELS.forEach(f => {
    const b = document.createElement('button'); b.textContent = f; b.dataset.f = f;
    b.onclick = () => { if (!card) { kit.toast('카드를 먼저 골라요'); return; } feel = f; renderCards(); };
    $('feel').appendChild(b);
  });
  function pickCard(id) {
    card = id; const f = faces[id];
    feel = f ? f.feel : null; g2 = f ? f.bytes.slice() : empty();
    paint2(); show(g2); renderCards();
  }
  $('save2').onclick = () => {
    if (!card || !feel || !lit(g2)) return;
    faces[card] = { feel, bytes: g2.slice() }; kit.store.set('faces', faces);
    kit.signal('success'); kit.toast('저장했어요');
    const next = CARDS.find(c => !faces[c.id]);
    if (next) pickCard(next.id); else renderCards();
    renderTest();
  };
  function renderCards() {
    $('cards').innerHTML = '';
    CARDS.forEach(c => {
      const b = document.createElement('button'), f = faces[c.id];
      b.dataset.id = c.id;
      b.classList.toggle('on', c.id === card); b.classList.toggle('done', !!f);
      b.innerHTML = (f ? `<span class="mini">${miniHTML(f.bytes)}</span>` : `<span style="font-size:1.8rem">${c.icon}</span>`) + `<span>${c.text}${f ? ` <b>· ${f.feel}</b>` : ''}</span>`;
      b.onclick = () => pickCard(c.id);
      $('cards').appendChild(b);
    });
    const c = CARDS.find(x => x.id === card);
    $('situ').textContent = c ? `${c.icon} ${c.text}` : '카드를 고르면 상황이 나와요.';
    document.querySelectorAll('#feel button').forEach(b => b.classList.toggle('on', b.dataset.f === feel));
    $('count2').textContent = `켠 칸 ${lit(g2)} / 64`;
    $('save2').disabled = !card || !feel || !lit(g2);
    $('save2').textContent = card && faces[card] ? '다시 저장' : '이 표정 저장';
    $('saved2').textContent = `저장한 표정 ${Object.keys(faces).length} / ${CARDS.length}` + (!card ? '' : !feel ? ' · 마음을 먼저 골라요' : '');
  }

  // ── ③ 표정 맞히기 시험 ───────────────────────────────────────────
  let phase = 'idle';   // idle | judge | done
  const wins = () => test ? test.results.filter(Boolean).length : 0;
  const starsOf = (w) => (w >= 4 ? 3 : w === 3 ? 2 : w === 2 ? 1 : 0);
  function newTest() {
    const ids = CARDS.map(c => c.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    test = { order: ids, results: [] }; kit.store.set('test', test);
  }
  $('ask').onclick = () => {
    if (Object.keys(faces).length < CARDS.length) return;
    if (!test || test.results.length >= TESTN) newTest();
    const id = test.order[test.results.length], c = CARDS.find(x => x.id === id);
    show(faces[id].bytes); kit.signal('notice');
    $('answer').textContent = `정답: ${c.icon} ${c.text} (${faces[id].feel})`;
    phase = 'judge'; renderTest();
  };
  const judge = (ok) => {
    if (phase !== 'judge') return;
    test.results.push(ok); kit.store.set('test', test);
    kit.signal(ok ? 'success' : 'fail');
    $('answer').textContent = '';
    if (test.results.length >= TESTN) finish(); else { phase = 'idle'; kit.dot.clear(); renderTest(); }
  };
  $('judgeOk').onclick = () => judge(true);
  $('judgeNo').onclick = () => judge(false);
  $('retry').onclick = () => { newTest(); phase = 'idle'; kit.dot.clear(); renderTest(); };
  function finish() {
    phase = 'done';
    const s = starsOf(wins());
    if (s > 0) {
      kit.dot.icon('smile');
      const best = kit.store.num('bestStars', 0, 0, 3);
      if (s > best) {                                   // 기록부에는 가장 좋은 결과 한 줄만 (05 §7)
        kit.store.set('bestStars', s);
        kit.record.add({ title: '표정 맞히기 시험 합격', detail: `친구가 알아본 표정 ${wins()} / ${TESTN}`, stars: s });
      }
    }
    renderTest();
  }
  function renderTest() {
    const ready = Object.keys(faces).length >= CARDS.length;
    if (test && test.results.length >= TESTN && phase !== 'judge') phase = 'done';
    const res = test ? test.results : [];
    $('tries').innerHTML = '';
    for (let i = 0; i < TESTN; i++) {
      const s = document.createElement('span');
      s.textContent = i < res.length ? (res[i] ? '✓' : '✗') : ''; if (i < res.length) s.className = res[i] ? 'ok' : 'no';
      $('tries').appendChild(s);
    }
    $('ask').disabled = !ready || phase === 'judge' || phase === 'done';
    $('judgeBox').classList.toggle('hidden', phase !== 'judge');
    $('resultBox').classList.toggle('hidden', phase !== 'done');
    $('retry').classList.toggle('hidden', phase !== 'done');
    $('testMsg').textContent = !ready ? `표정 ${CARDS.length}개를 저장하면 시작할 수 있어요. (지금 ${Object.keys(faces).length}개)`
      : phase === 'judge' ? '친구가 상황을 맞혀 보는 중…'
      : phase === 'done' ? `친구가 ${wins()}개를 알아봤어요.`
      : `${res.length + 1}번째 표정! 출제자가 눌러요.`;
    if (phase === 'done') {
      const s = starsOf(wins());
      $('resultBox').innerHTML = s ? `<span class="m">🎭</span><b>표정 맞히기 합격!</b><br>${'⭐'.repeat(s)} · ${wins()} / ${TESTN}`
        : `<span class="m">💪</span><b>아깝다!</b><br>친구가 못 알아본 표정을 고쳐서 다시 도전해요.`;
    }
  }

  // ── ④ 심화: 움직이는 표정 ─────────────────────────────────────────
  function frameBytes(key) {
    if (key === 'g1') return g1;
    if (key && key.startsWith('sample:')) { const s = SAMPLES[+key.slice(7)]; return s ? s.bytes : null; }
    if (key && key.startsWith('face:')) { const f = faces[key.slice(5)]; return f ? f.bytes : null; }
    return null;
  }
  function frameOptions() {
    const o = [['none', '— 없음 —'], ['g1', '① 내 그림']];
    SAMPLES.forEach((s, i) => o.push(['sample:' + i, '예시 ' + s.name]));
    CARDS.forEach(c => { if (faces[c.id]) o.push(['face:' + c.id, '② ' + faces[c.id].feel + ' (' + c.icon + ')']); });
    return o;
  }
  function renderAnim() {
    $('frames').innerHTML = '';
    anim.frames.forEach((key, i) => {
      const d = document.createElement('div'); d.className = 'slot';
      const b = frameBytes(key) || empty();
      d.innerHTML = `<b>${i + 1}</b><span class="mini">${miniHTML(b)}</span>`;
      const sel = document.createElement('select'); sel.dataset.i = i;
      frameOptions().forEach(([v, t]) => { const op = document.createElement('option'); op.value = v; op.textContent = t; if (v === key) op.selected = true; sel.appendChild(op); });
      sel.onchange = () => { anim.frames[i] = sel.value; kit.store.set('anim', anim); renderAnim(); };
      d.appendChild(sel); $('frames').appendChild(d);
    });
    $('speedChips').innerHTML = '';
    SPEEDS.forEach(s => {
      const b = document.createElement('button'); b.textContent = `${s.name} ${s.ms / 1000}초`; b.classList.toggle('on', s.ms === anim.ms);
      b.onclick = () => { anim.ms = s.ms; kit.store.set('anim', anim); renderAnim(); };
      $('speedChips').appendChild(b);
    });
    $('play').classList.toggle('hidden', kit.running);
    $('stopPlay').classList.toggle('hidden', !kit.running);
    if (!kit.running) $('playMsg').textContent = '순서와 시간을 바꿔 보세요.';
  }
  $('play').onclick = () => {
    const list = anim.frames.map(frameBytes).filter(Boolean);
    if (list.length < 2) { kit.toast('얼굴을 두 장 이상 골라요'); return; }
    const ok = kit.run(async (r) => {
      $('playMsg').textContent = '움직이는 중… (3번 되풀이)';
      for (let k = 0; k < 3; k++) for (const b of list) { show(b); if (!await r.sleep(anim.ms)) return; }
    });
    if (ok) renderAnim();
  };
  $('stopPlay').onclick = () => { kit.stop(); renderAnim(); };   // kit.stop 은 onRunEnd 를 부르지 않는다

  // ── ④ 선택: 칸 줄이기 도전 ───────────────────────────────────────
  FEELS.forEach(f => {
    const b = document.createElement('button'); b.textContent = f; b.dataset.f = f;
    b.onclick = () => { feel4 = f; renderFew(); };
    $('feel4').appendChild(b);
  });
  $('rec4').onclick = () => {
    const n = lit(g1);
    if (!n) { kit.toast('① 그림판에 먼저 그려요'); return; }
    const before = few[feel4];
    if (before == null || n < before) { few[feel4] = n; kit.store.set('few', few); kit.signal('success'); kit.toast(`${feel4} ${n}칸 — 새 기록!`); }
    else kit.toast(`${feel4} 기록은 ${before}칸이에요. 더 줄여 볼까요?`);
    renderFew();
  };
  function renderFew() {
    document.querySelectorAll('#feel4 button').forEach(b => b.classList.toggle('on', b.dataset.f === feel4));
    renderCount();
    $('best4').innerHTML = '<tr><td><b>마음</b></td><td><b>가장 적은 칸</b></td></tr>' +
      FEELS.map(f => `<tr><td>${f}</td><td>${few[f] != null ? few[f] + '칸' : '–'}</td></tr>`).join('');
  }

  // ── 시작 ─────────────────────────────────────────────────────────
  paint1(); renderCount();
  renderCards();
  renderTest(); renderAnim(); renderFew();
  showStep(step);
})();
