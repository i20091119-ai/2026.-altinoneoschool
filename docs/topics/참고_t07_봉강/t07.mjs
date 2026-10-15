// t07 수학 시험 보는 날 — 앱 시험
//   node tests/t07.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't07';
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
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const feed = setInterval(() => p.evaluate(() => window.__feed({})).catch(() => {}), 200);  // 센서가 계속 들어오게(S6)
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const answer = () => p.evaluate(() => {
  const q = document.getElementById('q2').textContent;
  for (const g of ['e3', 'e4']) { const it = window.AltinoProblems.GRADE_POOLS[g].find(x => x.q === q); if (it) return it.a; }
  return null;
});
const store = (k) => p.evaluate((a) => JSON.parse(localStorage.getItem(a) || 'null'), `altino.${APP}.${k}`);

// ① 도트 문제 — 문제는 0~99 숫자, 답은 0 이상 정수 (만드는 식을 1000번 돌려 검산)
ok('① 문제 보여 주기 버튼이 있음', await p.isVisible('#showBtn'));
await p.click('#showBtn'); await p.waitForTimeout(300);
ok('① 문제를 보여 주는 동안 차는 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.click('#next1').catch(() => {});

// ② 레이스 — 맞히면 한 칸 전진, 멈춰 누르면 즉시 정지
await p.click('#steps button[data-step="2"]'); await p.waitForTimeout(200);
ok('② 출발 전에는 답을 쓸 수 없음', await p.isDisabled('#a2'));
await p.click('#raceStart'); await p.waitForTimeout(1300);
ok('② 출발 후 멈춰 버튼이 보임(coral)', await p.isVisible('#raceStop'));
ok('② 아직 안 맞혔으면 정지 상태', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.fill('#a2', String((await answer()) + 1)); await p.click('#ok2'); await p.waitForTimeout(400);
ok('② 틀리면 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.fill('#a2', String(await answer())); await p.press('#a2', 'Enter'); await p.waitForTimeout(400);
ok('② 맞히면(Enter) 전진', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.click('#raceStop'); await p.waitForTimeout(250);
ok('② 멈춰를 누르면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
ok('② 멈추면 기록부에 남지 않음', (await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'))).length === 0);

// ② 끝까지 — 10칸 가면 결과 화면, 기록부에 한 줄
await p.click('#raceStart'); await p.waitForTimeout(1300);
for (let i = 0; i < 10; i++) { await p.fill('#a2', String(await answer())); await p.click('#ok2'); await p.waitForTimeout(60); }
await p.waitForTimeout(10 * 1150 + 800);
ok('② 10칸이면 결과 화면으로', await p.isVisible('#stars'));
ok('③ 별 3개', (await p.textContent('#stars')).trim() === '⭐⭐⭐', await p.textContent('#stars'));
let rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('③ 성장기록부에 한 줄(앱 번호·별 3)', rec.length === 1 && rec[0].app === APP && rec[0].stars === 3, JSON.stringify(rec));
ok('③ 최고 기록이 저장됨', (await store('best'))?.moves === 10);
ok('③ 끝나면 정지 상태', (await tail(2)).every(v => v === 0));

// 더 낮은 기록은 기록부에 다시 남지 않음
await p.click('#again'); await p.waitForTimeout(200);
await p.click('#raceStart'); await p.waitForTimeout(1300);
await p.evaluate(() => { window.__altinoKit.stop(); });
await p.waitForTimeout(200);
rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('기록부는 가장 좋은 결과 한 줄만', rec.length === 1, JSON.stringify(rec));

// 새로고침해도 이어짐 + 처음부터는 확인창
await p.reload(); await p.waitForTimeout(500);
await p.click('#steps button[data-step="3"]'); await p.waitForTimeout(200);
ok('새로고침 후에도 결과가 남아 있음', (await p.textContent('#bestMsg')).includes('10칸'));
await p.click('#resetAll'); await p.waitForTimeout(200);
ok('처음부터는 확인창을 거친다', await p.isVisible('#altinoConfirm'));
await p.click('#acYes'); await p.waitForTimeout(200);
ok('확인하면 앱 기록이 지워짐', (await store('best')) === null);

ok('무에러', errs.length === 0, errs.join(' | '));
clearInterval(feed);
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
