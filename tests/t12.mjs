// t12 운동회 전용 시험 — 패드(S3), 릴레이 스톱워치, 컬링 판정(정면 ir2), 꼬리잡기 판정(꽁무니 ir6), 본선·기록부·점수판.
//   node tests/t12.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't12';
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
// 센서 10Hz — 정면 ir2·꽁무니 ir6 은 시험이 window.__ir2/__ir6 로 바꾼다
await ctx.addInitScript(() => { setInterval(() => window.__feed && window.__feed({ ir2: window.__ir2 ?? 280, ir6: window.__ir6 ?? (230 + Math.round(Math.random() * 4)) }), 100); });
// 꼬리잡기 한 판을 시험용으로 짧게(저장값 altino.t12.roundSec — 기획서 §10)
await ctx.addInitScript(() => { if (!sessionStorage.getItem('t12init')) { sessionStorage.setItem('t12init', '1'); localStorage.setItem('altino.t12.roundSec', '10'); } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(700);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const press = async (sel) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); return b; };
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const setIr = (k, v) => p.evaluate(([kk, vv]) => { window[kk] = vv; }, [k, v]);
const ev = async (name) => { await p.evaluate((n) => { [...document.querySelectorAll('#evs button')].find(b => b.dataset.ev === n).click(); }, name); await p.waitForTimeout(150); };
const step = async (n) => { await p.evaluate((k) => document.querySelector(`#steps [data-step="${k}"]`).click(), n); await p.waitForTimeout(200); };
const yes = async () => { await p.waitForSelector('#acYes', { state: 'visible' }); await p.click('#acYes'); await p.waitForTimeout(150); };

// ── 패드 S3 ──────────────────────────────────────────────────────
const ub = await p.locator('#d-up').boundingBox();
ok('S3 패드 버튼이 충분히 큼(가로 80·세로 60 이상)', ub.width >= 80 && ub.height >= 60, `${Math.round(ub.width)}x${Math.round(ub.height)}`);
ok('S3 패드에 touch-action:none', await p.evaluate(() => getComputedStyle(document.getElementById('d-up')).touchAction === 'none'));
ok('S3 패드가 스크롤 상자 안에 있지 않음', await p.evaluate(() => {
  for (let e = document.getElementById('d-up').parentElement; e; e = e.parentElement) {
    const ov = getComputedStyle(e).overflowY; if (ov === 'auto' || ov === 'scroll') return false;
  } return true; }));
await press('#d-up'); await p.waitForTimeout(400);
ok('S3 누르는 동안 전진(기본 속도 360)', (await tail(2)).every(v => v === 360), JSON.stringify(await tail(2)));
await p.mouse.move(ub.x + ub.width / 2 + 90, ub.y + ub.height / 2 + 50); await p.waitForTimeout(300);
ok('S3 손가락이 버튼 밖으로 미끄러져도 유지', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(350);
ok('S3 떼면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await press('#d-down'); await p.waitForTimeout(350);
ok('뒤로 버튼은 후진', (await tail(2)).every(v => v < 0), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);
await p.click('#spdUp'); await p.waitForTimeout(100);
await press('#d-up'); await p.waitForTimeout(350);
ok('속도 + 한 번 → 390, 저장됨', (await tail(2)).every(v => v === 390) && (await store('altino.t12.speed')) === 390, JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);

// ── 🏃 릴레이 ────────────────────────────────────────────────────
ok('처음엔 ① 종목 연습 · 릴레이', await p.isVisible('#pRelay'));
await p.click('#rStart'); await p.waitForTimeout(400);
ok('출발 전 "준비" 1초 동안은 도착 버튼이 꺼짐', await p.isDisabled('#rEnd'));
await p.waitForTimeout(1500);
ok('1초 뒤 시계가 돌고 도착 버튼이 켜짐', !(await p.isDisabled('#rEnd')) && (await p.textContent('#rClock')) !== '0.0초', await p.textContent('#rClock'));
ok('경기 중에는 단계를 못 바꿈', await p.evaluate(() => { document.querySelector('#steps [data-step="2"]').click(); return !document.getElementById('pRelay').classList.contains('hidden'); }));
await p.click('#rEnd'); await p.waitForTimeout(150);
const best = await store('altino.t12.best');
ok('도착 → 연습 최고 기록 저장(준비 1초 뒤부터 잼 — 약 0.9초)', best && best.relay >= 500 && best.relay <= 2000, JSON.stringify(best));
await p.click('#rStart'); await p.waitForTimeout(1300);
await p.click('#stopBtn'); await p.waitForTimeout(150);
ok('■ 멈춰 하면 그 기록은 버림', (await store('altino.t12.best')).relay === best.relay && await p.isDisabled('#rEnd'));

// ── 🥌 컬링 ──────────────────────────────────────────────────────
await ev('curl');
await press('#d-up'); await p.waitForTimeout(700);   // 처음 잠깐은 S4 킥(400) — 그 뒤 300
ok('컬링은 속도 300 고정', (await tail(2)).every(v => v === 300) && await p.isDisabled('#spdUp'), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);
await setIr('__ir2', 154); await p.waitForTimeout(300);
await p.click('#cMeasure'); await p.waitForTimeout(150);
ok('정면 154, 목표 150 → 오차 4 · 별 3개', (await p.textContent('#cResult')).includes('4') && (await p.textContent('#cStars')) === '⭐⭐⭐', await p.textContent('#cResult'));
ok('연습 최고 오차 저장', (await store('altino.t12.best')).curl === 4, JSON.stringify(await store('altino.t12.best')));
await setIr('__ir2', 60); await p.waitForTimeout(300);
await p.click('#cMeasure'); await p.waitForTimeout(150);
ok('70보다 가까우면 반칙(🚧)', (await p.textContent('#cResult')).includes('반칙') && (await p.textContent('#cStars')) === '🚧');
await setIr('__ir2', 280);

// ── 🐍 꼬리잡기 ──────────────────────────────────────────────────
await step(2);
ok('② 꼬리잡기 판정 화면', await p.isVisible('#pTag'));
await setIr('__ir6', 30); await p.waitForTimeout(400);
ok('시작 전에 붙어 있는 건 세지 않음', (await p.textContent('#tCount')) === '0');
await setIr('__ir6', undefined); await p.waitForTimeout(300);
await p.click('#tStart'); await p.waitForTimeout(200);
await setIr('__ir6', 30); await p.waitForTimeout(500);
ok('꽁무니 50 미만 → 잡힘 1', (await p.textContent('#tCount')) === '1', await p.textContent('#tCount'));
await setIr('__ir6', 200); await p.waitForTimeout(250); await setIr('__ir6', 30); await p.waitForTimeout(300);
ok('1.2초 안에 다시 붙은 건 세지 않음', (await p.textContent('#tCount')) === '1', await p.textContent('#tCount'));
await setIr('__ir6', 200); await p.waitForTimeout(1300); await setIr('__ir6', 30); await p.waitForTimeout(400);
ok('떨어졌다가 1.2초 뒤 다시 붙으면 2', (await p.textContent('#tCount')) === '2', await p.textContent('#tCount'));
await setIr('__ir6', undefined);
await p.waitForTimeout(9500);
ok('한 판 시간이 끝나면 스스로 끝남', (await p.isVisible('#tStart')) && !(await p.isVisible('#tEnd')));
await setIr('__ir6', 222);   // 8초 창 단위로 보므로 경고까지 8~16초
const warned = await p.waitForSelector('#rearWarn', { state: 'visible', timeout: 18000 }).then(() => true, () => false);
ok('꽁무니 숫자가 8초 넘게 그대로면 센서 고장 경고', warned);
await setIr('__ir6', undefined);
const cleared = await p.waitForSelector('#rearWarn', { state: 'hidden', timeout: 18000 }).then(() => true, () => false);
ok('숫자가 다시 움직이면 경고가 사라짐', cleared);

// ── ③ 본선 ───────────────────────────────────────────────────────
await step(3);
await ev('relay');
await press('#d-up'); await p.waitForTimeout(350);
ok('본선은 모든 모둠 같은 속도 390(고정)', (await tail(2)).every(v => v === 390) && await p.isDisabled('#spdUp'), JSON.stringify(await tail(2)));
await p.mouse.up(); await p.waitForTimeout(300);
await p.click('#rStart'); await p.waitForTimeout(1600); await p.click('#rEnd'); await p.waitForTimeout(150);
await ev('curl'); await setIr('__ir2', 152); await p.waitForTimeout(300);
await p.click('#cMeasure'); await p.waitForTimeout(150);
await setIr('__ir2', 280);
ok('본선 컬링 목표는 150 고정(새 목표 버튼 꺼짐)', await p.isDisabled('#cNew') && (await p.textContent('#cTgt')) === '150');
let rec = await store('altino.record') || [];
ok('두 종목만 치르면 기록부에 아직 안 남음', rec.length === 0, JSON.stringify(rec));
await ev('tag'); await p.click('#tStart'); await p.waitForTimeout(10600);
let fin = await store('altino.t12.fin');
rec = await store('altino.record') || [];
ok('세 종목을 다 치르면 본선 기록 저장', fin && fin.relay > 0 && fin.curl && fin.curl.err === 2 && fin.tag === 0, JSON.stringify(fin));
ok('성장기록부에 한 줄(규칙대로 3종목 = 별 3개)', rec.length === 1 && rec[0].app === APP && rec[0].stars === 3, JSON.stringify(rec));
await ev('relay'); await p.click('#rStart');
await p.waitForSelector('#acYes', { state: 'visible' });
ok('본선 기록을 다시 재려면 심판 확인창', await p.isVisible('#acYes'));
await p.click('#acNo'); await p.waitForTimeout(150);
ok('"그대로 두기"면 기록이 그대로', (await store('altino.t12.fin')).relay === fin.relay && !(await p.isDisabled('#rStart')));
await p.reload(); await p.waitForTimeout(600);
ok('새로 열어도 ③ 본선과 기록이 이어짐', (await p.textContent('#myrec')).includes('잡힘 0번'), await p.textContent('#myrec'));

// ── 📋 점수판 ────────────────────────────────────────────────────
await ev('board');
await p.click('#awardBtn'); await p.waitForTimeout(150);
ok('점수가 없으면 시상 안 됨', !(await p.isVisible('#award')));
const cellBtn = (t, k) => `#board button[data-t="${t}"][data-k="${k}"]`;
await p.click(cellBtn(1, 'relay')); await p.click(cellBtn(1, 'relay'));
await p.click(cellBtn(2, 'relay')); await p.click(cellBtn(2, 'fair'));
ok('칸을 누를 때마다 점수가 오름', (await p.textContent(cellBtn(1, 'relay'))) === '2점' && (await store('altino.t12.pts'))['2'].fair === 1);
await p.click('#awardBtn'); await p.waitForTimeout(150);
ok('시상: 동점이면 같은 등수(1·2모둠 🥇), 규칙 지킨 모둠 박수', (await p.textContent('#award')).includes('1모둠·2모둠') && (await p.textContent('#award')).includes('규칙을 잘 지킨 모둠: 2모둠'), await p.textContent('#award'));
await p.click(cellBtn(3, 'tag')); await p.waitForTimeout(100);
ok('점수를 고치면 시상은 다시 눌러야 함', !(await p.isVisible('#award')));

// ── 처음부터 ─────────────────────────────────────────────────────
await p.click('#resetAll'); await yes(); await p.waitForTimeout(150);
ok('처음부터: 기록·점수판은 지우고 성장기록부는 남김', (await store('altino.t12.fin')) === null && (await store('altino.t12.pts')) === null && ((await store('altino.record')) || []).length === 1);
ok('처음부터 → ① 종목 연습', await p.isVisible('#pRelay') && (await p.getAttribute('#steps [data-step="1"]', 'class')).includes('on'));

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t12.* 와 공용 키만', keys.every(k => k.startsWith('altino.t12.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
