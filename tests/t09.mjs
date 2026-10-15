// t09 어둠 알아채기 전용 시험 — 밝기 재기(눈 찾기·네 곳), 막대그래프, 터널 기준(차이 120), 자동 라이트(LED 15), 패드(S3).
//   node tests/t09.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't09';
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
await ctx.addInitScript(() => { setInterval(() => window.__feed && window.__feed({ cds: window.__cds ?? 600 }), 100); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const setCds = (v) => p.evaluate((x) => { window.__cds = x; }, v);
const led = () => p.evaluate(() => { const f = window.__txFrames[window.__txFrames.length - 1]; return (f[20] << 8) | f[21]; });
const press = async (sel) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); return b; };

// ── ① 알티노의 눈 찾기 ──────────────────────────────────────────
await p.waitForTimeout(400);
ok('지금 밝기를 10 단위로 보여 줌', (await p.textContent('#cdsNow')).trim() === '600', await p.textContent('#cdsNow'));
await setCds(4); await p.waitForTimeout(400);
ok('밝기 표시는 최소 30(0 이면 고장으로 오해)', (await p.textContent('#cdsNow')).trim() === '30', await p.textContent('#cdsNow'));
await setCds(600);
ok('가리기 전을 재기 전에는 가린 뒤를 못 잼', await p.isDisabled('#eyeAfter'));
await p.click('#spotChips button[data-s="위쪽"]'); await p.click('#eyeBefore'); await p.waitForTimeout(800);
await setCds(97); await p.click('#eyeAfter'); await p.waitForTimeout(500);
ok('재는 동안 버튼이 꺼짐', await p.isDisabled('#eyeAfter'));
await p.waitForTimeout(2000);
const eye = await store('altino.t09.eye');
ok('가리기 전·뒤 기록(10 단위)', eye['위쪽'] && eye['위쪽'].before === 600 && eye['위쪽'].after === 100, JSON.stringify(eye));
ok('크게 바뀐 곳을 알려 줌', (await p.textContent('#eyeSum')).includes('위쪽'), await p.textContent('#eyeSum'));
await setCds(600);

// ── ② 밝기 그래프 그리기 ────────────────────────────────────────
await p.click('[data-step="2"]');
for (const v of [702, 500, 300, 100]) { await setCds(v); await p.waitForTimeout(300); await p.click('#placeMeasure'); await p.waitForTimeout(2400); }
const pl = await store('altino.t09.places');
ok('네 곳 밝기 저장', JSON.stringify(pl) === '{"창가":700,"교실 가운데":500,"책상 아래":300,"사물함 안":100}', JSON.stringify(pl));
const hs = await p.evaluate(() => [...document.querySelectorAll('#chart .bar')].map(b => b.getBoundingClientRect().height));
ok('막대 높이가 값에 비례(창가 = 사물함 안 × 7)', Math.abs(hs[0] / hs[3] - 7) < 0.2, JSON.stringify(hs));
ok('가장 밝은·어두운 곳과 차이', (await p.textContent('#chartSay')).includes('창가(700)') && (await p.textContent('#chartSay')).includes('차이 600'));
let rec = await store('altino.record') || [];
ok('네 곳을 재면 성장기록부 별 1', rec.length === 1 && rec[0].app === APP && rec[0].stars === 1, JSON.stringify(rec));

// ── ③ 터널 실험 ─────────────────────────────────────────────────
await p.click('[data-step="3"]');
ok('기준이 없으면 자동 라이트를 못 켬', await p.isDisabled('#autoOn'));
await setCds(600); await p.waitForTimeout(300); await p.click('#tunOut'); await p.waitForTimeout(1300);
await setCds(520); await p.waitForTimeout(300); await p.click('#tunIn'); await p.waitForTimeout(1300);
ok('차이 80 (<120) → 다시 재라는 경고', await p.isVisible('#gapWarn') && (await p.textContent('#gapWarn')).includes('80'));
ok('차이가 작으면 기준을 안 만듦', await p.isDisabled('#autoOn') && (await p.textContent('#tunTable')).includes('다시 재기'));
await setCds(600); await p.waitForTimeout(300); await p.click('#tunOut'); await p.waitForTimeout(1300);
await setCds(200); await p.waitForTimeout(300); await p.click('#tunIn'); await p.waitForTimeout(1300);
ok('가운데 값 = (600 + 200) ÷ 2 = 400', (await p.textContent('#calc')).replace(/\s/g, '').includes('(600+200)÷2=400'), await p.textContent('#calc'));
ok('기준이 생기면 경고가 사라짐', !(await p.isVisible('#gapWarn')) && !(await p.isDisabled('#autoOn')));
rec = await store('altino.record') || [];
ok('터널 기준 → 별 2', rec.length === 2 && rec[1].stars === 2 && rec[1].detail.includes('(600+200)÷2=400'), JSON.stringify(rec));
await setCds(600); await clearTx(); await p.click('#autoOn'); await p.waitForTimeout(400);
ok('밝을 때는 라이트 꺼짐', (await led()) === 0);
await setCds(300); await p.waitForTimeout(400);
ok('기준보다 어두우면 라이트 켜짐(LED 15)', (await led()) === 15, String(await led()));
await setCds(405); await p.waitForTimeout(400);
ok('기준 바로 위에서는 깜빡이지 않음', (await led()) === 15);
await setCds(500); await p.waitForTimeout(400);
ok('밝아지면 라이트 꺼짐', (await led()) === 0);
rec = await store('altino.record') || [];
ok('라이트가 저절로 켜지면 별 3', rec.length === 3 && rec[2].stars === 3, JSON.stringify(rec));
await setCds(300); await p.waitForTimeout(300);
await p.click('#autoOff'); await p.waitForTimeout(300);
ok('■ 멈춰 → 라이트 꺼짐', (await led()) === 0);
// 패드 S3
const ub = await p.locator('#d-up').boundingBox();
ok('S3 패드 버튼이 충분히 큼', ub.width >= 80 && ub.height >= 60, `${ub.width}x${ub.height}`);
await press('#d-up'); await p.waitForTimeout(400);
ok('S3 누르는 동안 전진', (await tail(2)).every(v => v === 300), JSON.stringify(await tail(2)));
await p.mouse.move(ub.x + ub.width / 2 + 120, ub.y - 60); await p.waitForTimeout(300);
ok('S3 미끄러져도 유지', (await tail(2)).every(v => v > 0));
await p.mouse.up(); await p.waitForTimeout(300);
ok('S3 떼면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.click('#autoOn'); await p.waitForTimeout(300);
ok('다시 켜면 어두우니 켜짐', (await led()) === 15);
await press('#d-up'); await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('[data-step="1"]').click()); await p.waitForTimeout(350);
ok('패드를 누른 채 단계를 바꾸면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
ok('단계를 바꾸면 라이트도 꺼짐', (await led()) === 0);
await p.mouse.up();
await p.reload(); await p.waitForTimeout(500);
ok('새로 열어도 기록이 이어짐', (await p.textContent('#eyeTable')).includes('100'));

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t09.* 와 공용 키만', keys.every(k => k.startsWith('altino.t09.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
