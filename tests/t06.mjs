// t06 손길 알아채기 전용 시험 — 센서 지도, 숫자 맞추기, 영점·손 따라오기(조향·멈춤·S5 정지), 판정·기록부, 밀고 당기기, 몰래 다가가기, 거리 조절 창(S2).
//   node tests/t02.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't06';
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
await ctx.addInitScript(() => { window.__S = {}; setInterval(() => window.__feed && window.__feed(window.__S), 100); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; });
const press = async (sel) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); return b; };
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const step = (n) => p.evaluate((k) => document.querySelector(`[data-step="${k}"]`).click(), n);

const setS = (o) => p.evaluate((x) => { window.__S = x; }, o);
const steers = () => p.evaluate(() => window.__txFrames.slice(-2).map(f => (f[5] << 24) >> 24));
const clearAll = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const recs = () => p.evaluate(() => JSON.parse(localStorage.getItem('altino.record') || '[]'));
const FAR = { ir1: 900, ir2: 900, ir3: 900, ir4: 900, ir5: 900, ir6: 900 };

// ── ① 센서 지도 ─────────────────────────────────────────────────
await setS(FAR); await p.waitForTimeout(550);
ok('센서 숫자 6개 표시', (await p.textContent('.sen[data-k="ir6"]')).includes('900'));
await setS({ ...FAR, ir6: 120 }); await p.waitForTimeout(550);
ok('손을 대면 그 센서를 찾음(뒤)', (await store('altino.t06.found')).includes('ir6'));
await setS({ ...FAR, ir1: 100, ir4: 100 }); await p.waitForTimeout(550);
ok('찾은 센서 3 / 6', (await p.textContent('#foundMsg')).includes('3 / 6'));
ok('센서 놀이 중 바퀴는 0', await p.evaluate(() => window.__tx.every(v => v === 0)));

// ── ② 숫자 맞추기 ───────────────────────────────────────────────
await step(2); await setS(FAR); await p.waitForTimeout(200);
await p.click('#newTarget'); await p.waitForTimeout(100);
const tgt = +(await p.textContent('#target'));
await setS({ ...FAR, ir2: tgt + 200 }); await p.waitForTimeout(500);
ok('목표 밖이면 성공 안 함', (await p.textContent('#score2')).includes('성공 0'));
await setS({ ...FAR, ir2: tgt + 20 }); await p.waitForTimeout(1500);
ok('목표 안에 1초 → 성공', (await p.textContent('#score2')).includes('성공 1'), await p.textContent('#score2'));

// ── ③ 손 따라오기 ───────────────────────────────────────────────
await step(3); await setS(FAR); await p.waitForTimeout(200);
ok('영점 전에는 따라오기 잠김', await p.isDisabled('#follow'));
await setS({ ...FAR, ir2: 150 }); await p.click('#zero'); await p.waitForTimeout(1400);
ok('앞에 뭔가 있으면 영점 거부', (await store('altino.t06.base')) === null);
await setS({ ir1: 1000, ir2: 900, ir3: 600, ir4: 900, ir5: 900, ir6: 900 });   // 좌우 대각이 비대칭인 로봇
await p.click('#zero'); await p.waitForTimeout(1400);
const base = await store('altino.t06.base');
ok('영점 저장(손 없을 때 값)', base && base.ir1 === 1000 && base.ir3 === 600, JSON.stringify(base));
await p.click('#follow'); await p.waitForTimeout(1300);
await clearAll(); await p.waitForTimeout(550);
ok('손이 없으면 영점 그대로여도 멈춤(비대칭에도 안 꺾임)', (await tail(2)).every(v => v === 0) && (await steers()).every(v => v === 0), JSON.stringify([await tail(2), await steers()]));
await setS({ ir1: 450, ir2: 800, ir3: 560, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(600);   // 왼쪽 대각이 영점보다 크게 줄었음
ok('손이 왼쪽 → 전진 + 왼쪽 조향(−57)', (await tail(2)).every(v => v > 0) && (await steers()).every(v => v === -57), JSON.stringify([await tail(2), await steers()]));
await setS({ ir1: 700, ir2: 850, ir3: 500, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('차이가 작으면 방향 유지(와리가리 방지)', (await steers()).every(v => v === -57) && (await tail(2)).every(v => v > 0), JSON.stringify([await tail(2), await steers()]));
await setS({ ir1: 980, ir2: 400, ir3: 590, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('가운데가 가장 가까우면 곧게', (await steers()).every(v => v === 0) && (await tail(2)).every(v => v > 0), JSON.stringify([await tail(2), await steers()]));
await setS({ ir1: 980, ir2: 80, ir3: 590, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('너무 가까우면 멈춤', (await tail(2)).every(v => v === 0));
await setS({ ir1: 980, ir2: 400, ir3: 590, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(450);
await p.click('#stopF'); await p.waitForTimeout(550);
ok('멈춰 → 정지 + 판정 창', (await tail(2)).every(v => v === 0) && await p.isVisible('#judgeOk'));
await p.click('#courses [data-c="turn"]');
ok('따라오기가 끝나면 코스를 바꿀 수 있음', await p.evaluate(() => document.querySelector('#courses [data-c="turn"]').classList.contains('on')));
await p.click('#follow'); await p.waitForTimeout(1300); await p.click('#stopF'); await p.waitForTimeout(200);
await p.click('#judgeOk'); await p.waitForTimeout(150);
let rec = await recs();
ok('한 번 꺾기 성공 → 별 2 기록', rec.length === 1 && rec[0].stars === 2 && rec[0].app === APP, JSON.stringify(rec));
await p.click('#courses [data-c="line"]'); await p.click('#follow'); await p.waitForTimeout(1300); await p.click('#stopF'); await p.waitForTimeout(200); await p.click('#judgeOk');
ok('더 낮은 코스 성공은 기록부에 안 남김', (await recs()).length === 1);
// 따라오는 중 단계를 바꾸면 정지
await setS({ ir1: 450, ir2: 800, ir3: 560, ir4: 900, ir5: 900, ir6: 900 });
await p.click('#follow'); await p.waitForTimeout(1500);
ok('따라오는 중엔 움직임', (await tail(1))[0] > 0);
await step(1); await p.waitForTimeout(550);
ok('단계를 바꾸면 정지', (await tail(2)).every(v => v === 0));

// ⚙ 거리 조절 창 — S2
await step(3); await p.click('#tuneOpen'); await p.waitForTimeout(100);
await clearAll(); await p.evaluate(() => window.__altinoKit.drive(300, 0)); await p.waitForTimeout(550);
ok('S2 거리 조절 창이 떠 있으면 정지', (await tail(3)).every(v => v === 0));
await p.click('#tune [data-t="near"][data-d="10"]');
ok('멈춤 기준 저장(130)', (await store('altino.t06.near')) === 130);
await p.click('#tuneClose');

// ── ④ 밀고 당기기·몰래 다가가기 ─────────────────────────────────
await step(4); await setS({ ir1: 1000, ir2: 900, ir3: 600, ir4: 900, ir5: 900, ir6: 900 });
await p.click('#push'); await p.waitForTimeout(1300);
await setS({ ir1: 1000, ir2: 90, ir3: 600, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('너무 가까우면 뒤로', (await tail(2)).every(v => v < 0), JSON.stringify(await tail(2)));
await setS({ ir1: 1000, ir2: 200, ir3: 600, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('알맞으면 멈춤', (await tail(2)).every(v => v === 0));
await setS({ ir1: 1000, ir2: 500, ir3: 600, ir4: 900, ir5: 900, ir6: 900 }); await p.waitForTimeout(550);
ok('멀면 다가옴', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.click('#stopP'); await p.waitForTimeout(550);
ok('멈춰', (await tail(2)).every(v => v === 0) && await p.isVisible('#push'));
await setS(FAR); await p.click('#sneak'); await p.waitForTimeout(550);
await setS({ ...FAR, ir5: 150 }); await p.waitForTimeout(550);
ok('몰래 다가가기: 왼쪽 옆 감지', (await p.textContent('#sneakMsg')).includes('왼쪽 옆') && (await p.textContent('#sneakScore')).includes('1'));
await setS({ ...FAR, ir6: 150 }); await p.waitForTimeout(550);
ok('준비 전에는 다시 세지 않음', (await p.textContent('#sneakScore')).includes('1'));
ok('몰래 다가가기 중 바퀴는 0', (await tail(3)).every(v => v === 0));

// 망가진 저장값
await p.evaluate(() => { localStorage.setItem('altino.t06.base', '{"ir1":"x"}'); localStorage.setItem('altino.t06.near', '9999'); localStorage.setItem('altino.t06.found', '7'); });
await p.reload(); await p.waitForTimeout(500);
await step(3); await p.waitForTimeout(100);
ok('망가진 영점은 버리고 영점 전으로', await p.isDisabled('#follow'));
ok('망가진 기준은 범위로 잘림', await p.evaluate(() => { document.getElementById('tuneOpen').click(); return document.getElementById('vNear').textContent === '300'; }));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
