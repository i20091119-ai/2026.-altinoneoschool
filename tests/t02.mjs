// t02 알티노 걸음마 가르치기 전용 시험 — 패드(S3), 3초 달리기, 걸음마 시험 규칙, 성장기록부.
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't02';
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

// ── ① 패드 S3 ────────────────────────────────────────────────────
const ub = await p.locator('#d-up').boundingBox();
ok('S3 패드 버튼이 충분히 큼(가로 80·세로 60 이상)', ub.width >= 80 && ub.height >= 60, `${Math.round(ub.width)}x${Math.round(ub.height)}`);
ok('S3 패드에 touch-action:none', await p.evaluate(() => getComputedStyle(document.getElementById('d-up')).touchAction === 'none'));
ok('S3 패드가 스크롤 상자 안에 있지 않음', await p.evaluate(() => {
  for (let e = document.getElementById('d-up').parentElement; e; e = e.parentElement) {
    const ov = getComputedStyle(e).overflowY; if (ov === 'auto' || ov === 'scroll') return false;
  } return true; }));
await press('#d-up'); await p.waitForTimeout(400);
ok('S3 누르는 동안 전진(속도 막대 300)', (await tail(2)).every(v => v === 300), JSON.stringify(await tail(2)));
await p.mouse.move(ub.x + ub.width / 2 + 90, ub.y + ub.height / 2 + 50); await p.waitForTimeout(300);
ok('S3 손가락이 버튼 밖으로 미끄러져도 유지', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(350);
ok('S3 떼면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await press('#d-down'); await p.waitForTimeout(350);
ok('뒤로 버튼은 후진', (await tail(2)).every(v => v < 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);
const c1 = await p.textContent('#cmd'); await p.click('#nextCmd');
ok('구령 카드는 연달아 같은 구령이 나오지 않음', (await p.textContent('#cmd')) !== c1);

// 패드를 누른 채 단계를 바꾸면 멈춘다
await press('#d-up'); await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('[data-step="2"]').click()); await p.waitForTimeout(350);
ok('패드를 누른 채 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.mouse.up();

// ── ② 3초 달리기 ─────────────────────────────────────────────────
ok('예상을 적기 전에는 3초 달리기를 못 누름', await p.isDisabled('#runBtn'));
await p.click('#pPlus'); await p.click('#pPlus'); await p.click('#lockP'); await p.waitForTimeout(150);
ok('예상을 적으면 잠김(± 버튼 꺼짐)', await p.isDisabled('#pPlus') && await p.isDisabled('#pMinus'));
ok('예상이 저장됨', ((await store('altino.t02.exp')) || {})['300']?.p === 7, JSON.stringify(await store('altino.t02.exp')));
await clearTx(); await p.click('#runBtn');
await p.waitForTimeout(700);
ok('출발 전 "준비…" 1초 동안은 움직이지 않음', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
await p.waitForTimeout(1500);
ok('3초 달리기 중에는 고른 속도(300)', (await tail(3)).every(v => v === 300), JSON.stringify(await tail(3)));
await p.waitForTimeout(2300);
const runTx = await p.evaluate(() => window.__tx.slice());
const moving = runTx.filter(v => v === 300).length;
ok('달린 시간이 약 3초(300 프레임 27~33개)', moving >= 27 && moving <= 33, String(moving));
ok('3초 뒤 스스로 정지', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
ok('멈춘 뒤 실제 거리를 적는 칸이 나옴', await p.isVisible('#actualBox'));
await p.click('#aPlus'); await p.click('#saveA'); await p.waitForTimeout(150);
const exp = await store('altino.t02.exp');
ok('실제 거리가 저장됨', exp && exp['300'] && exp['300'].a === 8, JSON.stringify(exp));
ok('다음 속도(350 게임)로 넘어감', (await p.textContent('#speedChips .on')).includes('350'));

// 달리는 중 멈춤 버튼
await p.click('#lockP'); await p.click('#runBtn'); await p.waitForTimeout(1700);
ok('달리는 중 ■ 멈춰 버튼이 보임', await p.isVisible('#stopBtn'));
await p.click('#stopBtn'); await p.waitForTimeout(300);
ok('■ 멈춰를 누르면 바로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.waitForTimeout(2000);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(10)).every(v => v === 0), JSON.stringify(await tail(10)));

// ── ③ 걸음마 시험 ────────────────────────────────────────────────
await p.click('[data-step="3"]'); await p.waitForTimeout(200);
ok('속도를 고르기 전에는 ▲ 버튼이 꺼져 있음', await p.isDisabled('#go'));
await p.click('#badges button[data-s="400"]'); await p.waitForTimeout(150);
const tryOnce = async (judgeId) => {
  await press('#go'); await p.waitForTimeout(350);
  const during = await tail(2);
  await p.mouse.up(); await p.waitForTimeout(300);
  const after = await tail(2);
  await clearTx(); await press('#go'); await p.waitForTimeout(300);
  const again = await tail(2); await p.mouse.up();
  if (judgeId) await p.click(judgeId);
  await p.waitForTimeout(150);
  return { during, after, again };
};
const t1 = await tryOnce(null);
ok('시험: 누르는 동안 시험 속도(400)로 전진', t1.during.every(v => v === 400), JSON.stringify(t1.during));
ok('시험: 손을 떼면 정지', t1.after.every(v => v === 0), JSON.stringify(t1.after));
ok('시험: 판정 전 다시 눌러도 움직이지 않음(한 번만 규칙)', t1.again.every(v => v === 0), JSON.stringify(t1.again));
ok('시험: 손을 떼면 기록원 판정 칸이 나옴', await p.isVisible('#judgeBox'));
await p.click('#judgeOk'); await p.waitForTimeout(150);
await tryOnce('#judgeNo');
ok('시험 기록이 저장됨', JSON.stringify((await store('altino.t02.test')).results) === '[true,false]', JSON.stringify(await store('altino.t02.test')));
await p.reload(); await p.waitForTimeout(500);
ok('새로 열어도 시험이 이어짐', (await p.textContent('#tries')).replace(/\s/g, '') === '✓✗' && !(await p.isDisabled('#go')), await p.textContent('#tries'));
await tryOnce('#judgeOk');
let rec = await store('altino.record') || [];
ok('3번 중 2번 성공하면 합격 화면', (await p.textContent('#resultBox')).includes('합격'));
ok('성장기록부에 한 줄(달리기 = 별 2개)', rec.length === 1 && rec[0].app === APP && rec[0].title === '걸음마 시험 합격' && rec[0].stars === 2, JSON.stringify(rec));
// 더 낮은 등급으로 다시 합격해도 기록부는 그대로, 더 높으면 한 줄 더
await p.click('#badges button[data-s="300"]'); await tryOnce('#judgeOk'); await tryOnce('#judgeOk');
rec = await store('altino.record') || [];
ok('낮은 등급 합격은 기록부에 다시 남지 않음', rec.length === 1, JSON.stringify(rec));
await p.click('#badges button[data-s="500"]'); await tryOnce('#judgeNo'); await tryOnce('#judgeNo');
ok('두 번 실패하면 격려 화면(합격 아님)', (await p.textContent('#resultBox')).includes('아깝다'));
rec = await store('altino.record') || [];
ok('불합격은 기록부에 남지 않음', rec.length === 1, JSON.stringify(rec));
await p.click('#retry'); await tryOnce('#judgeOk'); await tryOnce('#judgeOk');
rec = await store('altino.record') || [];
ok('더 높은 등급(전력질주 = 별 3개)은 기록부에 남음', rec.length === 2 && rec[1].stars === 3, JSON.stringify(rec));

// 시험 버튼을 누른 채 단계를 바꾸면 멈춘다
await p.click('#retry'); await press('#go'); await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('[data-step="1"]').click()); await p.waitForTimeout(350);
ok('시험 버튼을 누른 채 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.mouse.up();

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t02.* 와 공용 키만', keys.every(k => k.startsWith('altino.t02.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
