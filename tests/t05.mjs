// t05 비밀 신호 보내기 전용 시험 — 전조등(실측 15)·경적, SOS(kit.run·멈춰·LED 끄기), 신호표(중복 경고·저장), 말 없이 전하기 시험·기록부, 신호 몇 가지, LED 점검 창(S2).
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't05';
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
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
await ctx.addInitScript(STUB);
// 센서가 끊기면 kit.run 이 멈추므로(S6) 시험 내내 10Hz 로 센서를 넣어 준다
await ctx.addInitScript(() => { setInterval(() => window.__feed && window.__feed({}), 100); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; });
const press = async (sel) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); return b; };
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const step = (n) => p.evaluate((k) => document.querySelector(`[data-step="${k}"]`).click(), n);

const leds = () => p.evaluate(() => window.__txFrames.map(f => (f[20] << 8) | f[21]));
const sounds = () => p.evaluate(() => window.__txFrames.map(f => f[19]));
const clearAll = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const recs = () => p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
const OKS = new Set([0, 37, 39, 41, 42, 44, 46, 48, 49]);

// ── ① ───────────────────────────────────────────────────────────
await clearAll();
await p.click('#lamps [data-id="head"]'); await p.waitForTimeout(250);
ok('전조등 → LED 15', (await leds()).slice(-1)[0] === 15, JSON.stringify((await leds()).slice(-3)));
ok('뜻이 보임', (await p.textContent('#meanBox')).includes('전조등'));
await p.click('#lamps [data-id="left"]'); await p.waitForTimeout(250);
ok('실측 안 된 등은 로봇을 켜지 않고 그림으로만', (await leds()).slice(-1)[0] === 0 && (await p.textContent('#meanBox')).includes('왼쪽'));
await clearAll(); await p.click('#horn'); await p.waitForTimeout(200);
ok('경적 = 실측 음 42', (await sounds()).includes(42));
await clearAll(); await p.click('#sos'); await p.waitForTimeout(500);
ok('SOS 중 멈춰 버튼', await p.isVisible('#stop1'));
ok('SOS 빛이 켜짐', (await leds()).includes(15));
await p.click('#stop1'); await p.waitForTimeout(250);
ok('멈추면 LED 꺼지고 SOS 버튼으로', (await leds()).slice(-1)[0] === 0 && await p.isVisible('#sos'));
ok('바퀴는 늘 0', await p.evaluate(() => window.__tx.every(v => v === 0)));

// ── ② 신호표 ────────────────────────────────────────────────────
await step(2); await p.waitForTimeout(150);
const pal = (k) => p.click(`#pal [data-e="${k}"]`);
const mean = (m) => p.click(`#meanChips [data-m="${m}"]`);
await mean('안녕'); await pal('ls');
await mean('고마워'); await pal('ls');
ok('같은 신호면 경고', (await p.textContent('#warn2')).includes('안녕 = 고마워'));
await pal('hl');
ok('달라지면 경고 사라짐', (await p.textContent('#warn2')) === '');
await mean('조심해'); await pal('hs'); await pal('hs'); await pal('hs');
await mean('따라와'); await pal('ll'); await pal('ls');
ok('신호표 완성 표시', (await p.textContent('#msg2')).includes('완성'));
const sg = await store('altino.t05.signals');
ok('신호표 저장(t15 후보)', sg['안녕'].join() === 'ls' && sg['조심해'].length === 3, JSON.stringify(sg));
for (let k = 0; k < 7; k++) await pal('ls');
ok('블록은 6개까지', (await store('altino.t05.signals'))['따라와'].length === 6);
ok('신호표가 공용 데이터로도 저장(t15 신호 칸)', JSON.stringify(await store('altino.share.signals')) === JSON.stringify(await store('altino.t05.signals')));
await p.click('#clr2'); await pal('ll'); await pal('ls');
await clearAll(); await p.click('#try2'); await p.waitForTimeout(400);
ok('보내 보기: 빛 길게 동안 LED 15', (await leds()).includes(15));
await p.waitForTimeout(1800);
ok('신호가 끝나면 LED 꺼짐', (await leds()).slice(-1)[0] === 0);

// ── ③ 시험 ──────────────────────────────────────────────────────
await step(3); await p.waitForTimeout(150);
ok('신호표가 있으면 보내기 켜짐', !(await p.isDisabled('#send')));
const round = async (r) => {
  await p.click('#send'); await p.waitForTimeout(100);
  ok('보내는 중에는 판정 못 함', !(await p.isVisible('#judgeOk')));
  await p.waitForTimeout(3600);
  await p.click(r ? '#judgeOk' : '#judgeNo'); await p.waitForTimeout(80);
};
await round(true); await round(false); await round(true); await round(true);
let rec = await recs();
ok('3/4 → 별 2개 기록부 한 줄', rec.length === 1 && rec[0].app === APP && rec[0].stars === 2, JSON.stringify(rec));
ok('결과 화면', (await p.textContent('#resultBox')).includes('합격'));
await p.click('#retry'); await p.click('#send'); await p.waitForTimeout(200);
await p.click('#stop3'); await p.waitForTimeout(150);
ok('보내다 멈추면 판정으로 넘어감', await p.isVisible('#judgeOk'));
ok('정답은 전달자 칸에만', (await p.textContent('#answer')).includes('정답'));

// 중복 신호면 시험 못 함
await step(2); await mean('따라와'); await p.click('#clr2'); await pal('ls');
await step(3); await p.waitForTimeout(100);
ok('같은 신호가 있으면 시험 잠김', await p.isDisabled('#send') && (await p.textContent('#testMsg')).includes('서로 다르게'));

// ── ④ ───────────────────────────────────────────────────────────
await step(4); await p.waitForTimeout(150);
await p.click('#lenChips button >> nth=1'); await p.click('#gPlus'); await p.click('#gPlus'); await p.click('#gCheck'); await p.waitForTimeout(100);
ok('블록 2개 → 4가지, 모두 보여 줌', (await p.textContent('#gMsg')).includes('4가지') && (await p.locator('#combos span').count()) === 4);
await p.click('#ledOpen'); await p.waitForTimeout(100);
await clearAll(); await p.evaluate(() => window.__altinoKit.drive(300, 0)); await p.waitForTimeout(300);
ok('S2 LED 점검 창이 떠 있으면 정지', (await tail(3)).every(v => v === 0));
await p.click('#bits button >> nth=3'); await p.waitForTimeout(200);
ok('LED 점검: 8 켜기', (await leds()).slice(-1)[0] === 8 && (await p.textContent('#maskVal')) === '8');
await p.click('#ledClose'); await p.waitForTimeout(200);
ok('닫으면 LED 끔', (await leds()).slice(-1)[0] === 0);
ok('실측 8음만', (await sounds()).every(v => OKS.has(v)));

// 망가진 저장값
await p.evaluate(() => { localStorage.setItem('altino.t05.signals', '{"안녕":"x","zz":[1]}'); localStorage.setItem('altino.t05.test', '{"order":["a","b","c","d"],"results":[]}'); });
await p.reload(); await p.waitForTimeout(500);
await step(2); await p.waitForTimeout(100);
ok('망가진 신호표는 비우고 열림', (await p.textContent('#msg2')).includes('0 / 4'));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
