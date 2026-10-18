// t14 보물 지도 탐험 전용 시험 — 지도 읽기 퀴즈, 블록(앞으로·꺾기·🚩) 실행, 앱의 길 판정, 기록원 판정·기록부, 보정값.
//   node tests/t14.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't14';
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
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(STUB);
await ctx.addInitScript(() => { setInterval(() => window.__feed && window.__feed({}), 100); });
// 시험을 짧게: 교사 보정값을 최소(0.4초)로
await ctx.addInitScript(() => { if (!sessionStorage.getItem('t14init')) { sessionStorage.setItem('t14init', '1'); localStorage.setItem('altino.t14.calF', '400'); localStorage.setItem('altino.t14.calT', '400'); } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const frames = () => p.evaluate(() => window.__txFrames.map(f => { const raw = (f[6] << 8) | f[7]; return [raw & 0x8000 ? -(0xFFFF - raw) : raw, f[5] > 127 ? f[5] - 256 : f[5]]; }));
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const step = async (n) => { await p.click(`#steps [data-step="${n}"]`); await p.waitForTimeout(200); };
const blocks = async (s) => { for (const k of s) await p.click(`#palette button[data-k="${k}"]`); await p.waitForTimeout(100); };
const clearProg = async () => { if (!(await p.isDisabled('#clear'))) { await p.click('#clear'); await p.click('#acYes'); await p.waitForTimeout(150); } };
const waitIdle = async (ms) => p.waitForSelector('#runBtn', { state: 'visible', timeout: ms });

// ── ① 지도 읽기 ──────────────────────────────────────────────────
ok('① 지도 읽기 퀴즈가 보임', await p.isVisible('#quizBox') && !(await p.isVisible('#codeBox')));
await p.click('#dirs button[data-d="E"]'); await p.waitForTimeout(100);
ok('틀리면 다음 문제로 안 넘어감', (await store('altino.t14.qi')) === null && (await p.textContent('#qnum')).includes('1 /'));
await p.click('#dirs button[data-d="N"]'); await p.click('#dirs button[data-d="E"]'); await p.waitForTimeout(100);
ok('방위 문제 2개 맞힘', (await store('altino.t14.qi')) === 2);
ok('"어디일까요" 문제는 방위 버튼이 꺼짐', await p.isDisabled('#dirs button[data-d="N"]'));
await p.click('#map div[data-x="2"][data-y="3"]'); await p.waitForTimeout(100);
ok('지도에서 🏫 학교를 누르면 정답', (await store('altino.t14.qi')) === 3);

// ── ② 경유지 1곳 — 연습 1: 🏠 → 📮 우체국 → 📚 도서관 ─────────────
await step(2);
ok('② 블록 화면', await p.isVisible('#codeBox') && await p.isVisible('#palette'));
await blocks('FFH');
await p.click('#undo'); await p.waitForTimeout(100);
ok('되돌리기 → 블록 2개', JSON.stringify(await store('altino.t14.prog')) === '["F","F"]');
await blocks('HRFFH');
await clearTx(); await p.click('#runBtn'); await p.waitForTimeout(700);
ok('실행: 처음 1초(준비)는 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
ok('실행 중에는 블록을 못 바꿈', await p.isDisabled('#palette button[data-k="F"]') && await p.isVisible('#stopBtn'));
await waitIdle(15000); await p.waitForTimeout(200);
const fr = await frames();
ok('⬆ 앞으로 = 속도 300 · 조향 0', fr.some(([m, s]) => m === 300 && s === 0));
ok('↱ 오른쪽 꺾기 = 속도 300 · 조향 127', fr.some(([m, s]) => m === 300 && s === 127));
ok('🚩 힌트 블록에서는 멈춤(2초 정지 구간)', fr.filter(([m]) => m === 0).length >= 30, String(fr.filter(([m]) => m === 0).length));
ok('맞는 길이면 연습 1 완료', (await store('altino.t14.done') || {}).p1 === true && (await p.textContent('#say')).includes('도착'), await p.textContent('#say'));
await p.click('#missions button:nth-child(2)'); await p.waitForTimeout(150);
await clearProg(); await blocks('RFFH');
await p.click('#runBtn'); await waitIdle(15000); await p.waitForTimeout(200);
ok('🚩 가 모자라면 앱이 알려 줌', (await p.textContent('#say')).includes('모자라'), await p.textContent('#say'));
await clearProg(); await blocks('LFH');
await p.click('#runBtn'); await waitIdle(15000); await p.waitForTimeout(200);
ok('지도 밖으로 나가면 앱이 알려 줌', (await p.textContent('#say')).includes('지도 밖'), await p.textContent('#say'));
await clearProg(); await blocks('FFFF');
await clearTx(); await p.click('#runBtn'); await p.waitForTimeout(1700);
await p.click('#stopBtn'); await p.waitForTimeout(300);
ok('■ 멈춰 하면 바로 정지', (await tail(2)).every(v => v === 0));
await p.waitForTimeout(1500);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(10)).every(v => v === 0));

// ── ③ 탐험 시험 A: 📮 → 📚 → 🏥 ─────────────────────────────────
await step(3);
await clearProg(); await blocks('FFHRFFHFRFH');
await p.click('#runBtn'); await waitIdle(25000); await p.waitForTimeout(200);
ok('실행 뒤 기록원 판정 칸', await p.isVisible('#judgeBox') && (await p.textContent('#jq')).includes('경유지 1'), await p.textContent('#jq'));
ok('판정 중에는 실행 버튼이 꺼짐', await p.isDisabled('#runBtn'));
await p.click('#jO'); await p.click('#jO'); await p.click('#jO'); await p.waitForTimeout(150);
let rec = await store('altino.record') || [];
ok('세 곳 모두 ⭕ → 한 번에 성공 별 3, 보물 카드 3장', (await p.textContent('#stars')) === '⭐⭐⭐' && (await p.$$eval('#cards span.got', a => a.length)) === 3);
ok('성장기록부에 한 줄(별 3)', rec.length === 1 && rec[0].app === APP && rec[0].stars === 3, JSON.stringify(rec));
await p.click('#runBtn'); await waitIdle(25000); await p.waitForTimeout(200);
await p.click('#jO'); await p.click('#jX'); await p.waitForTimeout(150);
ok('한 곳만 ⭕ → 별 1, 낮은 별은 기록부에 다시 안 남음', (await p.textContent('#stars')) === '⭐' && ((await store('altino.record')) || []).length === 1);
ok('실행 횟수 저장', (await store('altino.t14.tries')).A === 2, JSON.stringify(await store('altino.t14.tries')));

// ── 보정 · 처음부터 ──────────────────────────────────────────────
await p.click('#calToggle'); await p.fill('#calF', '5000'); await p.press('#calF', 'Tab'); await p.waitForTimeout(100);
ok('보정값은 0.4~2초로 제한해서 저장', (await store('altino.t14.calF')) === 2000);
await p.click('#resetAll'); await p.click('#acYes'); await p.waitForTimeout(200);
ok('처음부터: 블록·기록은 지우고 기록부·보정값은 남김', (await store('altino.t14.prog')) === null && (await store('altino.t14.calF')) === 2000 && ((await store('altino.record')) || []).length === 1);
const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t14.* 와 공용 키만', keys.every(k => k.startsWith('altino.t14.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
