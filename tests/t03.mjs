// t03 표정 만들기 전용 시험 — 그림판↔도트, 상황 카드 저장(t15 공용 후보), 표정 맞히기 시험·기록부 한 번, 움직이는 표정(kit.run 정지), 칸 줄이기, 망가진 저장값.
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't03';
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

const dotFrame = () => p.evaluate(() => { const f = window.__txFrames[window.__txFrames.length - 1]; return Array.from(f.slice(10, 19)); });
const sounds = () => p.evaluate(() => window.__txFrames.map(f => f[19]));
const lit = (sel) => p.evaluate((s) => document.querySelectorAll(s + ' button.on').length, sel);

// ── ① 그림판 ─────────────────────────────────────────────────────
ok('그림판 64칸', (await p.locator('#grid1 button').count()) === 64);
await p.locator('#grid1 button').nth(9).click(); await p.locator('#grid1 button').nth(14).click(); await p.waitForTimeout(250);
ok('누른 칸이 켜지고 칸 수 표시', (await lit('#grid1')) === 2 && (await p.textContent('#count1')).includes('2 / 64'));
const df = await dotFrame();
ok('도트 모드 프레임으로 로봇에 보냄', df[0] === 0xFF && df.slice(1).some(v => v !== 0), JSON.stringify(df));
ok('그림이 저장됨(altino.t03.g1)', JSON.stringify(await store('altino.t03.g1')) === JSON.stringify([0, 0x42, 0, 0, 0, 0, 0, 0]), JSON.stringify(await store('altino.t03.g1')));
await p.locator('#grid1 button').nth(9).click(); await p.waitForTimeout(100);
ok('다시 누르면 꺼짐', (await lit('#grid1')) === 1);
await p.locator('#samples button').first().click(); await p.waitForTimeout(250);
ok('예시를 누르면 로봇에만 보여 주고 그림판은 그대로', (await lit('#grid1')) === 1);
ok('바퀴는 움직이지 않음', await p.evaluate(() => window.__tx.every(v => v === 0)));

// ── ② 상황 카드 ──────────────────────────────────────────────────
await step(2); await p.waitForTimeout(150);
await p.click('#cards [data-id="praise"]');
await p.locator('#grid2 button').nth(20).click();
ok('마음을 고르기 전에는 저장 버튼이 꺼짐', await p.isDisabled('#save2'));
await p.locator('#feel button', { hasText: '기쁨' }).click();
ok('카드·마음·그림이 있으면 저장 가능', !(await p.isDisabled('#save2')));
await p.click('#save2'); await p.waitForTimeout(150);
const f1 = await store('altino.t03.faces');
ok('표정이 마음과 함께 저장', f1 && f1.praise && f1.praise.feel === '기쁨' && f1.praise.bytes.length === 8, JSON.stringify(f1));
ok('저장 뒤 다음 카드로 넘어감', await p.evaluate(() => document.querySelector('#cards [data-id="pencil"]').classList.contains('on')));
ok('표정이 다 모이기 전에는 시험을 못 시작', await (async () => { await step(3); await p.waitForTimeout(100); const d = await p.isDisabled('#ask'); await step(2); await p.waitForTimeout(100); return d; })());
for (const [id, f, n] of [['pencil', '슬픔', 30], ['noise', '놀람', 40], ['fall', '걱정', 50]]) {
  await p.click(`#cards [data-id="${id}"]`); await p.locator('#grid2 button').nth(n).click();
  await p.locator('#feel button', { hasText: f }).click(); await p.click('#save2'); await p.waitForTimeout(80);
}
ok('네 장 모두 저장', Object.keys(await store('altino.t03.faces')).length === 4);

// ── ③ 표정 맞히기 시험 ───────────────────────────────────────────
await step(3); await p.waitForTimeout(150);
ok('네 장이 모이면 표정 내기 켜짐', !(await p.isDisabled('#ask')));
ok('판정 전에는 판정 버튼이 숨어 있음', !(await p.isVisible('#judgeOk')));
await p.click('#ask'); await p.waitForTimeout(250);
ok('표정을 내면 도트에 그림, 출제자 칸에 정답', (await dotFrame())[0] === 0xFF && (await p.textContent('#answer')).includes('정답'));
ok('판정 중에는 다음 표정을 못 냄', await p.isDisabled('#ask'));
for (const r of [true, true, false, true]) {
  if (!(await p.isVisible('#judgeOk'))) { await p.click('#ask'); await p.waitForTimeout(80); }
  await p.click(r ? '#judgeOk' : '#judgeNo'); await p.waitForTimeout(80);
}
let rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('4개 중 3개 → 별 2개로 기록부 한 줄', rec.length === 1 && rec[0].app === APP && rec[0].stars === 2, JSON.stringify(rec));
ok('결과 화면', (await p.textContent('#resultBox')).includes('합격'));
await p.click('#retry');
for (let i = 0; i < 4; i++) { await p.click('#ask'); await p.waitForTimeout(60); await p.click('#judgeNo'); await p.waitForTimeout(60); }
rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('더 낮은 결과는 기록부에 안 남김', rec.length === 1);
ok('불합격은 격려 + 다시 하기', (await p.textContent('#resultBox')).includes('아깝다') && await p.isVisible('#retry'));
await p.click('#retry');
for (const r of [true, false, true, true]) { await p.click('#ask'); await p.waitForTimeout(60); await p.click(r ? '#judgeOk' : '#judgeNo'); await p.waitForTimeout(60); }
rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('같은 결과를 또 내도 기록부는 한 줄', rec.length === 1, JSON.stringify(rec));
await p.click('#retry');
for (let i = 0; i < 4; i++) { await p.click('#ask'); await p.waitForTimeout(60); await p.click('#judgeOk'); await p.waitForTimeout(60); }
rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('더 높은 결과(4/4 별 3개)는 한 줄 더', rec.length === 2 && rec[1].stars === 3, JSON.stringify(rec));

// ── ④ 움직이는 표정 — kit.run, 멈춰 ─────────────────────────────
await step(4); await p.waitForTimeout(150);
await clearTx(); await p.evaluate(() => { window.__txFrames.length = 0; });
await p.click('#play'); await p.waitForTimeout(700);
ok('움직이는 동안 멈춰 버튼이 보임', await p.isVisible('#stopPlay'));
const rows = await p.evaluate(() => new Set(window.__txFrames.map(f => Array.from(f.slice(11, 19)).join(','))).size);
ok('얼굴이 바뀌며 보냄(2장 이상)', rows >= 2, String(rows));
await p.click('#stopPlay'); await p.waitForTimeout(300);
ok('멈추면 재생 버튼으로 돌아옴', await p.isVisible('#play'));
ok('표정 놀이 내내 바퀴는 0', await p.evaluate(() => window.__tx.every(v => v === 0)));
await p.locator('#frames select').nth(1).selectOption('none'); await p.locator('#frames select').nth(2).selectOption('none'); await p.waitForTimeout(100);
await p.click('#play'); await p.waitForTimeout(200);
ok('얼굴이 한 장뿐이면 시작하지 않음', await p.isVisible('#play'));

// ── ④ 칸 줄이기 ─────────────────────────────────────────────────
await p.locator('#feel4 button', { hasText: '슬픔' }).click();
await p.click('#rec4'); await p.waitForTimeout(100);
ok('칸 줄이기 기록(① 그림판 칸 수)', (await store('altino.t03.few'))['슬픔'] === 1, JSON.stringify(await store('altino.t03.few')));

// ── 이어 하기·망가진 저장값 ─────────────────────────────────────
await p.reload(); await p.waitForTimeout(500);
ok('새로고침 뒤 같은 단계', await p.evaluate(() => !document.querySelector('[data-page="4"]').classList.contains('hidden')));
await p.evaluate(() => { localStorage.setItem('altino.t03.faces', '{"praise":{"bytes":"엉망"},"zzz":1}'); localStorage.setItem('altino.t03.g1', '[1,2]'); localStorage.setItem('altino.t03.anim', '"x"'); localStorage.setItem('altino.t03.test', '{"order":3}'); });
await p.reload(); await p.waitForTimeout(500);
ok('망가진 저장값이어도 열림', errs.length === 0, errs.join(' | '));
await step(2); await p.waitForTimeout(100);
ok('망가진 표정은 버림', (await p.textContent('#saved2')).includes('0 / 4'));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
