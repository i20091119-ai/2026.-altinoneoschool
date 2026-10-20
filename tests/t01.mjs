// t01 로봇학교 입학식 전용 시험 — 깨우기, 이름 짓기(공용 이름), 패드(S3), 관찰 카드, 입학 약속 창(S2), 성장기록부 한 번만.
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't01';
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

// ── ① 알티노 깨우기 ──────────────────────────────────────────────
ok('연결되어 있으면 1·2번 할 일이 완료로', await p.evaluate(() => ['todo1', 'todo2'].every(id => document.getElementById(id).classList.contains('done'))));
ok('깨우기 버튼이 켜짐', !(await p.isDisabled('#wakeBtn')));
await p.click('#wakeBtn'); await p.waitForTimeout(2800);
ok('깨우면 눈 뜬 얼굴(화면 미리보기 2~4행 불 켜짐)', await p.evaluate(() => {
  const c = document.getElementById('face').children; return c[8 + 1].classList.contains('on') && c[24 + 1].classList.contains('on'); }));
ok('깨운 뒤 3번 할 일도 완료', await p.evaluate(() => document.getElementById('todo3').classList.contains('done')));
ok('깨운 기록 저장', (await store('altino.t01.woke')) === true);
ok('깨우는 동안 바퀴는 움직이지 않음', (await p.evaluate(() => window.__tx.every(v => v === 0))));

// ── ② 이름 지어 주기 ─────────────────────────────────────────────
await step(2); await p.waitForTimeout(150);
ok('후보를 고르기 전에는 정하기 버튼이 꺼짐', await p.isDisabled('#nameSet'));
for (const n of ['번개호', '씽씽이', '번개호']) { await p.fill('#candIn', n); await p.click('#candAdd'); await p.waitForTimeout(80); }
ok('같은 후보는 한 번만 올라감', (await store('altino.t01.cands')).length === 2, JSON.stringify(await store('altino.t01.cands')));
await p.locator('#cands button', { hasText: '씽씽이' }).click();
await p.click('#nameSet'); await p.waitForTimeout(150);
ok('이름 정하기는 확인창을 거친다(kit.confirm)', await p.isVisible('#altinoConfirm'));
await p.click('#acYes'); await p.waitForTimeout(200);
ok('모둠 이름이 공용 키에 저장', await p.evaluate(() => localStorage.getItem('altino.team.name') === '씽씽이'));
ok('모둠 이름이 상단 칩에 표시', (await p.textContent('#kitTeam')).includes('씽씽이'));
ok('이름표에 표시', (await p.textContent('#nameplate')).trim() === '씽씽이');

// ── ③ 첫 주행과 관찰: 패드 S3 ────────────────────────────────────
await step(3); await p.waitForTimeout(200);
const ub = await p.locator('#d-up').boundingBox();
ok('S3 패드 버튼이 충분히 큼(가로 80·세로 60 이상)', ub.width >= 80 && ub.height >= 60, `${Math.round(ub.width)}x${Math.round(ub.height)}`);
ok('S3 패드에 touch-action:none', await p.evaluate(() => getComputedStyle(document.getElementById('d-up')).touchAction === 'none'));
ok('S3 패드가 스크롤 상자 안에 있지 않음', await p.evaluate(() => {
  for (let e = document.getElementById('d-up').parentElement; e; e = e.parentElement) {
    const ov = getComputedStyle(e).overflowY; if (ov === 'auto' || ov === 'scroll') return false;
  } return true; }));
await press('#d-up'); await p.waitForTimeout(400);
ok('S3 누르는 동안 전진(속도 300)', (await tail(2)).every(v => v === 300), JSON.stringify(await tail(2)));
await p.mouse.move(ub.x + ub.width / 2 + 90, ub.y + ub.height / 2 + 50); await p.waitForTimeout(300);
ok('S3 손가락이 버튼 밖으로 미끄러져도 유지', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(350);
ok('S3 떼면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await press('#d-down'); await p.waitForTimeout(350);
ok('뒤로 버튼은 후진', (await tail(2)).every(v => v < 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);
await press('#d-up'); await p.waitForTimeout(300);
await step(1); await p.waitForTimeout(350);
ok('패드를 누른 채 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await step(3); await p.waitForTimeout(150);

// 관찰 카드 — 잠긴 다섯 가지를 찾아야 입학 약속이 열린다
ok('다 찾기 전에는 입학 약속 버튼이 꺼짐', await p.isDisabled('#pledgeOpen'));
const ids = ['stop', 'face', 'song', 'signal', 'hand'];
for (const id of ids.slice(0, 4)) { await p.click(`#cando [data-id="${id}"]`); await p.waitForTimeout(60); }
ok('네 개만 찾으면 아직 꺼짐', await p.isDisabled('#pledgeOpen'));
await p.click('#cando [data-id="hand"]'); await p.click('#cando [data-id="hand"]'); await p.waitForTimeout(100);
ok('찾은 것은 중복 없이 저장', (await store('altino.t01.found')).length === 5, JSON.stringify(await store('altino.t01.found')));
ok('잠긴 카드에 배울 차시가 보임', (await p.textContent('#cando [data-id="face"]')).includes('5–6차시'));
ok('다섯 개를 찾고 앞뒤로 움직여 봤으면 입학 약속 버튼이 켜짐', !(await p.isDisabled('#pledgeOpen')));

// 입학 약속 창 — S2 (떠 있는 동안 움직이지 않음), 세 약속을 모두 눌러야 입학
await p.click('#pledgeOpen'); await p.waitForTimeout(150);
await clearTx(); await p.evaluate(() => window.__altinoKit.drive(300, 0)); await p.waitForTimeout(350);
ok('S2 입학 약속 창이 떠 있으면 정지', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
ok('약속을 다 누르기 전에는 입학하기가 꺼짐', await p.isDisabled('#enroll'));
const pl = p.locator('#pledgeList button');
for (let i = 0; i < 3; i++) await pl.nth(i).click();
await p.click('#enroll'); await p.waitForTimeout(200);
const rec = await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
ok('성장기록부에 입학 한 줄(앱 번호·이름 포함)', rec.length === 1 && rec[0].app === APP && rec[0].detail.includes('씽씽이'), JSON.stringify(rec));
ok('입학 뒤 버튼은 완료 표시', (await p.textContent('#pledgeOpen')).includes('입학했어요') && await p.isDisabled('#pledgeOpen'));

// 다시 열어도 이어지고, 기록부는 한 줄만
await p.reload(); await p.waitForTimeout(600);
ok('새로고침 뒤에도 3단계에서 이어짐', await p.evaluate(() => !document.querySelector('[data-page="3"]').classList.contains('hidden')));
ok('새로고침 뒤에도 입학 완료 상태', (await p.textContent('#pledgeOpen')).includes('입학했어요'));
// 처음부터 — 확인창 → 앱 저장값만 지우고 이름·기록부는 남김
await p.click('#obsReset'); await p.waitForTimeout(150);
ok('처음부터는 확인창을 거친다', await p.isVisible('#altinoConfirm'));
await p.click('#acYes'); await p.waitForTimeout(200);
ok('처음부터: 관찰 기록 지움', (await store('altino.t01.found')) === null);
ok('처음부터: 모둠 이름은 남김', await p.evaluate(() => localStorage.getItem('altino.team.name') === '씽씽이'));
ok('처음부터: 성장기록부는 남김', (await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'))).length === 1);

// 같은 모둠이 다시 입학해도 기록부는 한 줄 (05 §7)
await press('#d-up'); await p.waitForTimeout(150); await p.mouse.up();
await press('#d-down'); await p.waitForTimeout(150); await p.mouse.up();
for (const id of ids) { await p.click(`#cando [data-id="${id}"]`); await p.waitForTimeout(40); }
await p.click('#pledgeOpen'); await p.waitForTimeout(100);
for (let i = 0; i < 3; i++) await pl.nth(i).click();
await p.click('#enroll'); await p.waitForTimeout(200);
ok('두 번 입학해도 성장기록부는 한 줄', (await p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'))).length === 1);

// 망가진 저장값 방어
await p.evaluate(() => { localStorage.setItem('altino.t01.found', '"엉망"'); localStorage.setItem('altino.t01.cands', '{"a":1}'); localStorage.setItem('altino.t01.step', '"99"'); localStorage.removeItem('altino.t01.enrolled'); });
await p.reload(); await p.waitForTimeout(500);
ok('망가진 저장값이어도 열림', (await p.textContent('#foundMsg')).includes('0 / 5'), await p.textContent('#foundMsg'));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
