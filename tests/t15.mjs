// t15 학예회·졸업식 전용 시험 — 1초 칸 스토리보드(움직임·소리·빛·표정), 공연 실행·멈춤(LED 끔), 별 기준·피드백, 졸업식(기록부 되짚기·졸업장).
//   node tests/t15.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't15';
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
// 다른 앱에서 미리 남긴 성장기록부 한 줄(졸업식 되짚기 시험용)
await ctx.addInitScript(() => { if (!sessionStorage.getItem('t15init')) { sessionStorage.setItem('t15init', '1'); localStorage.setItem('altino.record', JSON.stringify([{ app: 't02', title: '걸음마 시험 합격', detail: '시험', stars: 2, at: 1 }])); } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(700);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const led = () => p.evaluate(() => { const f = window.__txFrames.at(-1); return f ? ((f[20] << 8) | f[21]) : -1; });
const ledsSeen = () => p.evaluate(() => [...new Set(window.__txFrames.map(f => (f[20] << 8) | f[21]))]);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const step = async (n) => { await p.click(`#steps [data-step="${n}"]`); await p.waitForTimeout(250); };
const chip = async (box, nth) => { await p.click(`#${box} button:nth-child(${nth})`); await p.waitForTimeout(80); };
const idle = async (btn, ms) => p.waitForSelector('#' + btn, { state: 'visible', timeout: ms });

// ── ① 공연 만들기 ────────────────────────────────────────────────
ok('① 스토리보드 16칸', (await p.$$eval('#board1 .cell', a => a.length)) === 16);
await chip('cMove', 2); await chip('cNote', 2); await chip('cLight', 2); await chip('cDot', 2);
let cells = await store('altino.t15.cells');
ok('1번 칸: 앞으로 · 도(37) · 💡 · ♥ 저장', cells && cells[0].m === 'F' && cells[0].n === 37 && cells[0].l === 1 && cells[0].d === 'heart', JSON.stringify(cells && cells[0]));
await clearTx(); await p.click('#tryCell'); await p.waitForTimeout(700);
ok('칸 시험: 처음 1초(준비)는 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.waitForTimeout(800);
ok('칸 시험: 1초 동안 앞으로 300 · 전방등 15', (await tail(2)).every(v => v === 300) && (await led()) === 15, `${JSON.stringify(await tail(2))} led=${await led()}`);
await idle('tryCell', 4000); await p.waitForTimeout(300);
ok('칸 시험이 끝나면 정지 · 불 끔', (await tail(2)).every(v => v === 0) && (await led()) === 0);
await p.click('#board1 .cell[data-i="1"]'); await p.click('#copyPrev'); await p.waitForTimeout(100);
ok('앞 칸 복사', JSON.stringify((await store('altino.t15.cells'))[1]) === JSON.stringify((await store('altino.t15.cells'))[0]));
await p.click('#clearCell'); await p.waitForTimeout(100);
ok('칸 비우기', (await store('altino.t15.cells'))[1].m === 'S' && (await store('altino.t15.cells'))[1].n === 0);
// 그림 그리기
await p.click('#paintBtn'); await p.click('#ptabs button:nth-child(3)'); await p.click('#paint button:nth-child(1)'); await p.waitForTimeout(100);
ok('그림3 왼쪽 위 점 하나를 켜면 저장(0x80)', (await store('altino.t15.pics'))[2][0] === 0x80, JSON.stringify((await store('altino.t15.pics'))[2]));
await p.click('#paintBack');
// 예시 · 저장 · 불러오기
await p.click('#sample'); await p.click('#acYes'); await p.waitForTimeout(150);
ok('예시 공연(8초)으로 바꾸기는 확인창 뒤에', (await p.$$eval('#board1 .cell.filled', a => a.length)) === 8);
await p.click('#saveShow'); await p.waitForTimeout(100);
ok('💾 작품 저장', (await store('altino.t15.saved')) && (await store('altino.t15.saved')).cells.length === 16);
await p.click('#board1 .cell[data-i="0"]'); await chip('cMove', 3); await p.waitForTimeout(100);
await p.click('#loadShow'); await p.click('#acYes'); await p.waitForTimeout(150);
ok('📂 불러오기 → 저장한 작품으로 돌아감', (await store('altino.t15.cells'))[0].m === 'F');

// ── ② 리허설·공연 ────────────────────────────────────────────────
await step(2);
ok('② 공연 화면 0 / 8초', (await p.textContent('#clock')).trim() === '0 / 8초', await p.textContent('#clock'));
await clearTx(); await p.click('#playBtn'); await p.waitForTimeout(2600);
await p.click('#stopBtn2'); await p.waitForTimeout(300);
ok('■ 멈춰: 바로 정지하고 불도 끔', (await tail(2)).every(v => v === 0) && (await led()) === 0);
ok('멈춘 공연은 공연 횟수에 안 셈', (await store('altino.t15.runs')) === null);
await clearTx(); await p.click('#playBtn'); await idle('playBtn', 14000); await p.waitForTimeout(300);
ok('끝까지 공연: 칸의 빛(15)이 켜졌다 꺼짐, 끝나면 정지·끔', (await ledsSeen()).includes(15) && (await tail(2)).every(v => v === 0) && (await led()) === 0);
let rec = await store('altino.record') || [];
ok('4가지(움직임·소리·빛·표정) 넣은 공연 → 별 2, 기록부 한 줄', (await p.textContent('#stars2')) === '⭐⭐' && rec.filter(r => r.app === APP).length === 1 && rec.at(-1).stars === 2, JSON.stringify(rec));
await p.click('#fbDone'); await p.waitForTimeout(100);
ok('피드백을 안 적으면 반영 안 됨', (await store('altino.t15.fbDone')) !== true);
await p.fill('#fbText', '마지막에 높은 도를 길게'); await p.click('#fbDone'); await p.waitForTimeout(100);
await p.click('#playBtn'); await idle('playBtn', 14000); await p.waitForTimeout(300);
rec = await store('altino.record') || [];
ok('피드백 반영 후 공연 → 별 3, 기록부에 한 줄 더', (await p.textContent('#stars2')) === '⭐⭐⭐' && rec.filter(r => r.app === APP).length === 2 && rec.at(-1).detail.includes('피드백'), JSON.stringify(rec.at(-1)));

// ── ③ 졸업식 ─────────────────────────────────────────────────────
await step(3);
ok('졸업식: 기록부를 차시 순으로 되짚음(t02 · t15 두 앱)', (await p.textContent('#recCount')).startsWith('2 /') && (await p.$$eval('#rec .has', a => a.map(d => d.dataset.app).join(','))) === 't02,t15', await p.textContent('#recCount'));
await p.fill('#teamName', '번개'); await p.press('#teamName', 'Tab');
await p.fill('#speech', '우리 알티노 최고!'); await p.waitForTimeout(100);
await clearTx(); await p.click('#gradBtn'); await p.waitForTimeout(400);
ok('졸업 축하: 움직이지 않고 불만 반짝', (await tail(3)).every(v => v === 0) && (await ledsSeen()).includes(15));
await idle('gradBtn', 6000); await p.waitForTimeout(300);
rec = await store('altino.record') || [];
ok('졸업장: 모둠 이름·소감·도장, 기록부에 졸업 한 줄', (await p.textContent('#certWho')).includes('번개') && (await p.textContent('#certLine')).includes('최고') && await p.isVisible('#stamp') && rec.filter(r => r.title === '로봇학교를 졸업했어요').length === 1);
ok('졸업 축하가 끝나면 불 끔', (await led()) === 0);
await p.click('#gradBtn'); await idle('gradBtn', 6000);
ok('한 번 더 눌러도 졸업 기록은 하나', ((await store('altino.record')) || []).filter(r => r.title === '로봇학교를 졸업했어요').length === 1);
ok('되짚기에서 t15 줄은 졸업이 아닌 공연 기록', (await p.$eval('#rec [data-app="t15"]', d => d.textContent)).includes('학예회'));
await p.click('#steps [data-step="1"]'); await p.click('#resetAll'); await p.click('#acYes'); await p.waitForTimeout(200);
ok('처음부터: 공연·졸업장은 지우고 성장기록부는 남김', (await store('altino.t15.cells')) === null && (await store('altino.t15.grad')) === null && ((await store('altino.record')) || []).length === 4);
const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t15.* 와 공용 키만', keys.every(k => k.startsWith('altino.t15.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
