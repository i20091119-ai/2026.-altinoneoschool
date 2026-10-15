// t08 알티노 골든벨 전용 시험 — 답 잠금, 맞혔어요 한 칸 전진, 멈춤, 퀴즈 만들기, 결승선 골든벨, 라운드 기록.
//   node tests/t08.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't08';
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
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const sounds = () => p.evaluate(() => window.__txFrames.map(f => f[19]));

// ── ① 골든벨 연습 ────────────────────────────────────────────────
ok('답을 고르기 전에는 잠글 수 없음', await p.isDisabled('#pLock'));
await p.click('#pAns button[data-a="O"]'); await p.click('#pLock'); await p.waitForTimeout(150);
ok('잠그면 답을 바꿀 수 없음', await p.isDisabled('#pAns button[data-a="X"]'));
ok('잠그기 전에는 맞혔어요 버튼이 없음', !(await p.isVisible('#pGo')));
await p.click('#pReveal'); await p.waitForTimeout(150);
ok('정답 확인 → 맞히면 맞혔어요 버튼', await p.isVisible('#pGo') && (await p.textContent('#pFb')).includes('맞혔어요'));
await clearTx(); await p.click('#pGo'); await p.waitForTimeout(500);
ok('맞혔어요 → 속도 300 으로 전진', (await tail(3)).every(v => v === 300), JSON.stringify(await tail(3)));
await p.waitForTimeout(1000);
const n1 = (await p.evaluate(() => window.__tx.slice())).filter(v => v === 300).length;
ok('한 칸 = 약 1초(300 프레임 8~12개)', n1 >= 8 && n1 <= 12, String(n1));
ok('한 칸 가면 멈춤', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
ok('연습 기록 저장(답·잠금·전진)', JSON.stringify((await store('altino.t08.prac'))[0]) === '{"mine":"O","locked":true,"shown":true,"moved":true}', JSON.stringify(await store('altino.t08.prac')));
ok('같은 문제로 두 번 전진할 수 없음', !(await p.isVisible('#pGo')));
await p.click('#pNext');
await p.click('#pAns button[data-a="③"]'); await p.click('#pLock'); await p.click('#pReveal'); await p.waitForTimeout(150);
ok('틀리면 전진 버튼 없이 다음 문제로', !(await p.isVisible('#pGo')) && await p.isVisible('#pNext') && (await p.textContent('#pFb')).includes('②'));
ok('기록표에 우리 답·정답·X', (await p.textContent('#pTable')).replace(/\s/g, '').includes('2③②X'), await p.textContent('#pTable'));

// ── ② 우리가 내는 퀴즈 ──────────────────────────────────────────
await p.click('[data-step="2"]');
ok('빈 퀴즈는 정답 공개를 못 누름', await p.isDisabled('#qzShow'));
await p.fill('#qzQ', '6 × 3과 6+6+6의 답은 같다.'); await p.click('#qzA button:has-text("O")');
await p.fill('#qzWhy', '6을 3번 더한 것이 6 × 3이기 때문이다.'); await p.waitForTimeout(100);
ok('O·X 퀴즈 완성 표시', (await p.textContent('#qzCheck')).includes('완성'));
ok('크게 보기에 문제가 보이고 정답은 숨김', (await p.textContent('#present')).includes('6 × 3') && !(await p.textContent('#present')).includes('정답 O'));
await p.click('#qzShow'); await p.waitForTimeout(100);
ok('정답 공개', (await p.textContent('#present')).includes('정답 O'));
await p.click('#quizPick button[data-k="pick"]');
await p.fill('#qzQ', '식물이 자라는 데 꼭 필요한 것은?'); await p.fill('#qzO1', '물'); await p.fill('#qzO2', '돌');
await p.click('#qzA button:has-text("①")'); await p.fill('#qzWhy', '물이 없으면 말라요.'); await p.waitForTimeout(100);
ok('보기가 비면 아직 미완성', (await p.textContent('#qzCheck')).includes('보기'));
await p.fill('#qzO3', '바람'); await p.waitForTimeout(100);
const qz = await store('altino.t08.quiz');
ok('두 퀴즈가 저장됨', qz.ox.a === 'O' && qz.pick.o[2] === '바람' && qz.pick.a === '①', JSON.stringify(qz));

// ── ③ 알티노 골든벨 대회 ────────────────────────────────────────
await p.evaluate(() => localStorage.setItem('altino.t08.cellMs', '600'));
await p.reload(); await p.waitForTimeout(500);
await p.click('[data-step="3"]');
for (let i = 0; i < 4; i++) await p.click('#finMinus');
ok('결승선은 3칸 아래로 못 줄임', (await p.textContent('#finVal')).trim() === '3');
ok('답을 잠그기 전에는 맞혔어요를 못 누름', await p.isDisabled('#cOk'));
const lockAns = async (a) => { await p.click(`#cAns button:has-text("${a}")`); await p.click('#cLock'); };
const hit = async () => { await lockAns('O'); await p.click('#cOk'); await p.waitForTimeout(900); };
await lockAns('X'); await p.click('#cNo2'); await p.waitForTimeout(150);
ok('틀렸어요 → 제자리, 다음 문제', (await p.textContent('#cNo')).trim() === '2' && (await store('altino.t08.con')).pos === 0);
await lockAns('①'); await clearTx(); await p.click('#cOk'); await p.waitForTimeout(400);
ok('맞혔어요 → 전진', (await tail(2)).every(v => v === 300), JSON.stringify(await tail(2)));
await p.click('#cStop'); await p.waitForTimeout(300);
ok('■ 멈춰 → 바로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
ok('끊긴 전진은 칸을 세지 않음(다시 누를 수 있음)', (await store('altino.t08.con')).pos === 0 && !(await p.isDisabled('#cOk')));
await p.waitForTimeout(800);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(6)).every(v => v === 0), JSON.stringify(await tail(6)));
await p.click('#cOk'); await p.waitForTimeout(900);
await p.click('#cHost'); await p.waitForTimeout(100);
ok('사회자 문제는 건너뜀', (await p.textContent('#cNo')).trim() === '4');
await hit();
ok('두 칸 왔음', (await store('altino.t08.con')).pos === 2);
await clearTx(); await lockAns('O'); await p.click('#cOk'); await p.waitForTimeout(4200);
ok('결승선에서 골든벨 멜로디(솔·라·미)', (await sounds()).some(s => s === 44) && (await sounds()).some(s => s === 46) && (await sounds()).some(s => s === 41));
ok('골든벨 뒤 소리 꺼짐·정지', (await sounds()).slice(-2).every(s => s === 0) && (await tail(2)).every(v => v === 0));
let con = await store('altino.t08.con');
ok('1라운드 기록: 정답 3개 · 통과', con.results[0] && con.results[0].correct === 3 && con.results[0].passed && con.round === 1, JSON.stringify(con));
let rec = await store('altino.record') || [];
ok('골든벨 → 성장기록부 별 3', rec.length === 1 && rec[0].app === APP && rec[0].stars === 3 && rec[0].title === '골든벨을 울렸어요', JSON.stringify(rec));
ok('결과 화면', (await p.textContent('#cResult')).includes('골든벨'));
await hit();
await p.click('#cEnd'); await p.waitForTimeout(200);
ok('라운드 끝내기는 확인창', await p.isVisible('#altinoConfirm'));
await p.click('#acYes'); await p.waitForTimeout(200);
con = await store('altino.t08.con');
ok('2라운드 기록: 정답 1개 · 통과 X', con.results[1] && con.results[1].correct === 1 && !con.results[1].passed && con.round === 2, JSON.stringify(con));
ok('대회가 끝나면 답 잠금이 꺼짐', await p.isDisabled('#cLock') && await p.isDisabled('#cAns button:first-child'));
rec = await store('altino.record') || [];
ok('낮은 결과는 기록부에 다시 남지 않음', rec.length === 1, JSON.stringify(rec));
await p.reload(); await p.waitForTimeout(400);
ok('새로 열어도 기록이 이어짐', (await p.textContent('#cr1')).includes('3개') && (await p.textContent('#cr2')).includes('1개'));

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t08.* 와 공용 키만', keys.every(k => k.startsWith('altino.t08.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
