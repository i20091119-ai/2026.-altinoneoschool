// t13 말 알아듣기 전용 시험 — 말 카드·음성 인식(가짜) 두 방식, 명령 실행(1초 준비 뒤 1초), 멈춤, 벽 감지, 심부름 판정·기록부.
//   node tests/t13.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't13';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'webapp');
const STUB = fs.readFileSync(path.join(ROOT, 'tests', 'stub.js'), 'utf8');
let chromium;
try { ({ chromium } = await import('playwright')); }
catch (e) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(WEB, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n + (x ? '  → ' + x : '')); } };
const br = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const feed = () => { setInterval(() => window.__feed && window.__feed({ ir2: window.__ir2 ?? 900 }), 100); };

// ── A. 말 카드 모드 (음성 인식이 없는 태블릿) ─────────────────────
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(STUB);
await ctx.addInitScript(feed);
await ctx.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const tx = () => p.evaluate(() => window.__tx.slice());
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const card = async (k) => { await p.click(`#cards button[data-k="${k}"]`); await p.waitForTimeout(100); };
const step = async (n) => { await p.click(`#steps [data-step="${n}"]`); await p.waitForTimeout(200); };

ok('음성 인식이 없으면 말 카드 모드, 바꾸기 버튼 없음', await p.isVisible('#cardBox') && !(await p.isVisible('#micBox')) && !(await p.isVisible('#modeToggle')));
await clearTx(); await card('F');
await p.waitForTimeout(700);
ok('⬆ 앞으로: 처음 1초(준비)는 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.waitForTimeout(1800);
const fw = (await tx()).filter(v => v === 300).length;
ok('준비 뒤 약 1초 전진(300 프레임 8~13개) 후 스스로 정지', fw >= 8 && fw <= 13 && (await tail(3)).every(v => v === 0), String(fw));
ok('해 본 명령이 저장됨', (await store('altino.t13.tried')) && (await store('altino.t13.tried')).F === true);
await clearTx(); await card('B'); await p.waitForTimeout(1500);
ok('⬇ 뒤로는 후진', (await tail(2)).every(v => v < 0), JSON.stringify(await tail(2)));
await p.click('#stopBtn'); await p.waitForTimeout(300);
ok('■ 멈춰 하면 바로 정지', (await tail(2)).every(v => v === 0));
await p.waitForTimeout(1200);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(10)).every(v => v === 0));
await clearTx(); await card('F'); await p.waitForTimeout(1400); await card('S'); await p.waitForTimeout(300);
ok('✋ 멈춰 카드도 정지', (await tail(2)).every(v => v === 0));
await clearTx(); await card('ON'); await p.waitForTimeout(300);
ok('💡 불 켜 → LED 15', await p.evaluate(() => { const f = window.__txFrames.at(-1); return ((f[20] << 8) | f[21]) === 15; }));
await card('OFF'); await p.waitForTimeout(300);
ok('🌙 불 꺼 → LED 0', await p.evaluate(() => { const f = window.__txFrames.at(-1); return ((f[20] << 8) | f[21]) === 0; }));
// 스스로 가: 벽(ir2 < 220)이면 멈춤
await p.evaluate(() => { window.__ir2 = 900; }); await clearTx(); await card('A'); await p.waitForTimeout(1500);
ok('🚗 스스로 가: 길이 열려 있으면 전진', (await tail(2)).every(v => v === 300), JSON.stringify(await tail(2)));
await p.evaluate(() => { window.__ir2 = 150; }); await p.waitForTimeout(400);
ok('🚗 스스로 가: 앞에 벽(ir2 150)이면 스스로 멈춤', (await tail(2)).every(v => v === 0) && (await p.textContent('#say')).includes('벽'), await p.textContent('#say'));
await p.evaluate(() => { window.__ir2 = 900; });

// ② 안 되는 말 기록
await step(2);
await p.click('#noteAdd'); await p.waitForTimeout(100);
ok('말을 안 적으면 기록 안 됨', ((await store('altino.t13.notes')) || []).length === 0);
await p.fill('#noteText', '알티노 부엌 가서 물 가져와');
await p.click('#noteAdd'); await p.waitForTimeout(100);
ok('까닭을 안 고르면 기록 안 됨', ((await store('altino.t13.notes')) || []).length === 0);
await p.click('#whys button[data-w="place"]'); await p.click('#noteAdd'); await p.waitForTimeout(100);
const notes = await store('altino.t13.notes');
ok('말 + 까닭이 기록됨', notes && notes.length === 1 && notes[0].why === 'place', JSON.stringify(notes));

// ③ 심부름 시험 — 심부름 1 = 앞으로 → 웃어 → 불 켜
await step(3);
await card('SM'); await p.waitForTimeout(150);
let ex = await store('altino.t13.exam');
ok('차례가 틀리면 처음부터(다시 시작 +1)', ex.streak === 0 && ex.retries === 1, JSON.stringify(ex));
await card('F'); await p.waitForTimeout(2300); await card('SM'); await card('ON'); await p.waitForTimeout(200);
ex = await store('altino.t13.exam');
let rec = await store('altino.record') || [];
ok('3개 연속 성공 → 끝, 별 2개(다시 시작 1번)', ex.finished && (await p.textContent('#stars')) === '⭐⭐', JSON.stringify(ex));
ok('성장기록부에 한 줄(별 2, 말 카드)', rec.length === 1 && rec[0].app === APP && rec[0].stars === 2 && rec[0].detail.includes('말 카드'), JSON.stringify(rec));
await card('F'); await p.waitForTimeout(2300); await card('SM'); await card('ON'); await p.waitForTimeout(200);
rec = await store('altino.record') || [];
ok('한 번에 성공(별 3) → 더 높은 별이라 한 줄 더', rec.length === 2 && rec[1].stars === 3, JSON.stringify(rec));
await card('F'); await p.waitForTimeout(2300); await card('SM'); await card('ON'); await p.waitForTimeout(200);
ok('같은 별이면 기록부에 다시 안 남음', ((await store('altino.record')) || []).length === 2);
await p.click('#resetBtn'); await p.click('#acYes'); await p.waitForTimeout(200);
ok('처음부터: 기록은 지우고 성장기록부는 남김', (await store('altino.t13.notes')) === null && ((await store('altino.record')) || []).length === 2);
const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t13.* 와 공용 키만', keys.every(k => k.startsWith('altino.t13.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러(말 카드 모드)', errs.length === 0, errs.join(' | '));
await ctx.close();

// ── B. 음성 인식 모드 (가짜 SpeechRecognition — 말한 문장을 그대로 돌려줌) ──
const ctx2 = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx2.addInitScript(STUB);
await ctx2.addInitScript(feed);
await ctx2.addInitScript(() => {
  class FakeSR {
    start() { const t = window.__say; setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, 50); }
    abort() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
});
const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(e.message));
await q.goto(BASE + `/${APP}.html`); await q.waitForTimeout(600);
const say = async (t) => { await q.evaluate((s) => { window.__say = s; }, t); await q.click('#micBtn'); await q.waitForTimeout(250); };
ok('음성 인식이 있으면 🎤 모드, 바꾸기 버튼 있음', await q.isVisible('#micBox') && await q.isVisible('#modeToggle'));
await say('알티노야 앞으로 가 줘');
ok('“알티노야 앞으로 가 줘” → ⬆ 앞으로', (await q.textContent('#heard')).includes('앞으로') && !(await q.textContent('#heard')).includes('❓'), await q.textContent('#heard'));
await q.click('#stopBtn'); await q.waitForTimeout(200);
await say('웃어 줘');
ok('“웃어 줘” → 😊 웃어', (await q.textContent('#heard')).includes('웃어'), await q.textContent('#heard'));
await say('앞으로 가서 웃어');
ok('두 명령이 섞이면 못 알아듣고 까닭을 알려 줌', (await q.textContent('#heard')).includes('❓') && (await q.textContent('#say')).includes('두 가지'), await q.textContent('#say'));
await say('부엌으로 가');
ok('사전에 없는 말 → ❓', (await q.textContent('#heard')).includes('❓'));
await q.click('#modeToggle'); await q.waitForTimeout(150);
ok('🃏 말 카드로 바꿀 수 있고 저장됨', await q.isVisible('#cardBox') && (await q.evaluate(() => localStorage.getItem('altino.t13.mode'))) === '"card"');
ok('무에러(음성 인식 모드)', errs2.length === 0, errs2.join(' | '));

console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
