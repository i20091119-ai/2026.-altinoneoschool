// t04 노래 가르치기 전용 시험 — 건반 소리(실측 8음), 귀 기울이기 놀이, 악보 가르치기·맞춰 보기·마지막 줄 바꾸기, 누르는 동안 소리(S3 방식), 어울림 판정, 별·기록부.
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't04';
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

const sounds = () => p.evaluate(() => window.__txFrames.map(f => f[19]));
const clearAll = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const OKS = new Set([0, 37, 39, 41, 42, 44, 46, 48, 49]);
const recs = () => p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));

// ── ① 건반 ──────────────────────────────────────────────────────
await clearAll();
await p.locator('#keys1 button').nth(4).click(); await p.waitForTimeout(250);
ok('건반 솔 → 부저 44', (await sounds()).includes(44), JSON.stringify([...new Set(await sounds())]));
await p.waitForTimeout(500);
ok('잠시 뒤 소리 꺼짐(0)', (await sounds()).slice(-1)[0] === 0);
// 귀 기울이기 놀이
await p.click('#listen'); await p.waitForTimeout(150);
ok('듣는 동안 답 버튼 잠김', await p.isDisabled('#ans button >> nth=0'));
await p.waitForTimeout(1600);
ok('다 들으면 답 버튼 열림', !(await p.isDisabled('#ans button >> nth=0')));
await p.click('#ans button >> nth=0'); await p.waitForTimeout(150);
ok('답하면 한 문제 진행', (await p.textContent('#score1')).includes('/ 1'));
await p.locator('#modeChips button').nth(1).click(); await p.waitForTimeout(100);
ok('가락 모양 놀이로 바꾸면 처음부터', (await p.textContent('#score1')).includes('0 / 0') && (await p.textContent('#ans')).includes('차례가기'));
ok('놀이 내내 실측 8음만 사용', (await sounds()).every(v => OKS.has(v)), JSON.stringify([...new Set(await sounds())]));

// ── ② 가락 바꾸기 ───────────────────────────────────────────────
await step(2); await p.waitForTimeout(150);
ok('원곡 계이름이 보임(학교종)', (await p.textContent('#ref')).includes('솔 솔 라 라'));
const put = async (seq) => { for (const [i, l] of seq) { await p.locator('#lenChips button').nth(l ? 1 : 0).click(); await p.locator('#palette button').nth(i).click(); } };
await put([[4], [4], [5], [5], [4], [4], [2, 1], [4], [4], [2], [2], [2]]);   // 마지막 하나 틀림(미 → 레— 이어야)
await p.click('#check'); await p.waitForTimeout(150);
ok('맞춰 보기: 맞은 음 수와 틀린 칸 표시', (await p.textContent('#checkMsg')).includes('11 / 12') && (await p.locator('#sheet .blk.wrong').count()) === 1);
ok('틀리면 바꾸기 버튼은 아직 숨김', !(await p.isVisible('#change')));
await p.click('#back'); await put([[1, 1]]);
await p.click('#check'); await p.waitForTimeout(150);
ok('원곡과 같으면 완벽 + 별 1', (await p.textContent('#checkMsg')).includes('완벽') && (await recs()).length === 1 && (await recs())[0].stars === 1, JSON.stringify(await recs()));
ok('악보가 저장됨', (await store('altino.t04.sheets')).bell.length === 12);
await clearAll();
await p.click('#play2'); await p.waitForTimeout(300);
ok('연주 중 멈춰 버튼', await p.isVisible('#stop2'));
await p.click('#stop2'); await p.waitForTimeout(250);
ok('멈추면 소리도 꺼지고 연주 버튼으로', (await sounds()).slice(-1)[0] === 0 && await p.isVisible('#play2'));
await p.click('#change'); await p.waitForTimeout(150);
ok('바꾸기: 앞부분은 잠김 표시', (await p.locator('#sheet .blk.lock').count()) === 7);
for (let k = 0; k < 6; k++) await p.click('#back');
ok('잠긴 앞부분은 지워지지 않음', (await p.locator('#sheet .blk').count()) === 7);
await put([[4]]); await p.click('#saveMine'); await p.waitForTimeout(100);
ok('마지막 줄에 음 하나면 저장 안 됨', (await store('altino.t04.mine')) === null);
await put([[7, 1]]); await p.click('#saveMine'); await p.waitForTimeout(150);
ok('바꾼 가락 저장(t15 후보) + 별 2', (await store('altino.t04.mine')).notes.length === 9 && (await recs()).slice(-1)[0].stars === 2, JSON.stringify(await recs()));

// ── ③ 어울림 — 누르는 동안만 소리 ───────────────────────────────
await step(3); await p.waitForTimeout(150);
await clearAll();
const kb = await p.locator('#keys3 button').nth(0).boundingBox();
ok('S3 건반에 touch-action:none', await p.evaluate(() => getComputedStyle(document.querySelector('#keys3 button')).touchAction === 'none'));
await p.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await p.mouse.down(); await p.waitForTimeout(1200);
ok('누르고 있는 동안 계속 도(37)', (await sounds()).slice(-3).every(v => v === 37), JSON.stringify((await sounds()).slice(-3)));
await p.mouse.up(); await p.waitForTimeout(250);
ok('떼면 소리 꺼짐', (await sounds()).slice(-1)[0] === 0);
ok('어울림 놀이 내내 바퀴는 0', await p.evaluate(() => window.__tx.every(v => v === 0)));
const pair = async (theirs, good) => { await p.locator('#pairs button').nth(theirs).click(); await p.click(good ? '#good' : '#bad'); await p.waitForTimeout(80); };
await pair(1, true);
ok('도+레를 어울린다고 하면 고쳐 줌', (await p.textContent('#pairMsg')).includes('부딪히는'));
await pair(1, false);
ok('도+레 부딪힘 맞힘', (await p.textContent('#pairMsg')).includes('맞아요'));
await pair(2, true); await pair(4, true);
ok('어울리는 짝 2개', (await store('altino.t04.pairs')).length === 2);
await pair(4, true);
ok('같은 짝은 한 번만 셈', (await store('altino.t04.pairs')).length === 2);
await pair(7, true);
ok('세 짝 → 별 3, 기록부는 별이 늘 때만', (await recs()).length === 3 && (await recs()).slice(-1)[0].stars === 3, JSON.stringify(await recs()));

// 누른 채 단계 바꾸면 소리 꺼짐
await p.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await p.mouse.down(); await p.waitForTimeout(300);
await step(1); await p.waitForTimeout(300);
ok('건반을 누른 채 다른 단계로 가면 소리 꺼짐', (await sounds()).slice(-1)[0] === 0);
await p.mouse.up();
ok('전체에서 실측 8음만', (await sounds()).every(v => OKS.has(v)));

// 망가진 저장값
await p.evaluate(() => { localStorage.setItem('altino.t04.sheets', '[1]'); localStorage.setItem('altino.t04.mine', '{"song":"x"}'); localStorage.setItem('altino.t04.pairs', '"엉망"'); localStorage.setItem('altino.t04.song', '"zzz"'); });
await p.reload(); await p.waitForTimeout(500);
await step(2); await p.waitForTimeout(100);
ok('망가진 저장값이어도 학교종으로 열림', (await p.textContent('#ref')).includes('솔 솔 라 라'));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
