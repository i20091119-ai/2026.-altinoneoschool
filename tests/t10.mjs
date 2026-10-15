// t10 스스로 멈추는 차의 비밀 전용 시험 — 입력→판단→출력 보기, 센서 숫자 기록, 긴급 제동(220 에서 정지·멈춤·벽 없음), 거리 기록, 성장기록부.
//   node tests/t10.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't10';
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
await ctx.addInitScript(() => { setInterval(() => window.__feed && window.__feed({ ir2: window.__ir2 ?? 900 }), 100); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + `/${APP}.html`); await p.waitForTimeout(600);
const tail = (n) => p.evaluate((k) => window.__tx.slice(-k), n);
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const setIr = (v) => p.evaluate((x) => { window.__ir2 = x; }, v);

// ── ① 사람 센서 놀이 ────────────────────────────────────────────
await p.waitForTimeout(300);
ok('멀면: 눈 900 · 머리 멀다 · 발 달림', (await p.textContent('#tEye')).trim() === '900' && (await p.textContent('#tHead')).includes('멀다') && (await p.textContent('#tFoot')).includes('달림'));
await setIr(150); await p.waitForTimeout(300);
ok('220보다 작으면: 머리 가깝다 · 발 멈춤', (await p.textContent('#tHead')).includes('가깝다') && (await p.textContent('#tFoot')).includes('멈춤'));
ok('① 에서는 로봇이 움직이지 않음', (await p.evaluate(() => window.__tx.slice())).every(v => v === 0));
const r0 = await p.textContent('#roles'); await p.click('#swapRole');
ok('역할 바꾸기 → 맡은 친구가 바뀜', (await p.textContent('#roles')) !== r0);

// ── ② 센서 숫자 관찰 ────────────────────────────────────────────
await p.click('[data-step="2"]');
for (const v of [61, 112, 208]) { await setIr(v); await p.waitForTimeout(300); await p.click('#distRec'); await p.waitForTimeout(1200); }
const d = await store('altino.t10.dist');
ok('거리마다 숫자 기록(10 단위)', d['5cm'] === 60 && d['10cm'] === 110 && d['20cm'] === 210, JSON.stringify(d));
ok('가까울수록 작아지는 규칙을 알려 줌', (await p.textContent('#distSay')).includes('가까울수록'));
let rec = await store('altino.record') || [];
ok('세 거리를 재면 성장기록부 별 1', rec.length === 1 && rec[0].app === APP && rec[0].stars === 1, JSON.stringify(rec));

// ── ③ 긴급 제동 실험 ────────────────────────────────────────────
await p.click('[data-step="3"]');
await setIr(150); await p.waitForTimeout(300); await p.click('#runBtn'); await p.waitForTimeout(300);
ok('출발할 때 벽이 너무 가까우면 출발하지 않음', !(await p.evaluate(() => window.__altinoKit.running)));
await setIr(900); await p.waitForTimeout(200);
await p.click('#speedChips button[data-s="400"]');
await clearTx(); await p.click('#runBtn'); await p.waitForTimeout(700);
ok('"준비…" 동안은 움직이지 않음', (await tail(4)).every(v => v === 0), JSON.stringify(await tail(4)));
await p.waitForTimeout(800);
ok('벽이 멀면 고른 속도(400)로 달림', (await tail(3)).every(v => v === 400), JSON.stringify(await tail(3)));
ok('달리는 중 ■ 멈춰가 보임', await p.isVisible('#stopBtn'));
await setIr(210); await p.waitForTimeout(300);
ok('앞 센서가 220보다 작아지면 스스로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
ok('멈추면 거리 재는 칸이 나옴', await p.isVisible('#measureBox'));
await setIr(900); await p.waitForTimeout(500);
ok('멈춘 뒤 벽이 사라져도 다시 안 움직임', (await tail(4)).every(v => v === 0));
await p.fill('#cmIn', '14'); await p.fill('#mmIn', '12'); await p.click('#saveLen'); await p.waitForTimeout(100);
ok('mm 가 9 를 넘으면 기록하지 않음', (await p.textContent('#runFb')).includes('0~9') && !(await store('altino.t10.brake')));
await p.fill('#mmIn', '2'); await p.click('#saveLen'); await p.waitForTimeout(100);
ok('14cm 2mm → 142mm 로 저장', JSON.stringify(await store('altino.t10.brake')) === '{"400":[142]}', JSON.stringify(await store('altino.t10.brake')));
ok('표에 14cm 2mm', (await p.textContent('#brakeTable')).includes('14cm 2mm'));
// 달리는 중 멈춤
await clearTx(); await p.click('#runBtn'); await p.waitForTimeout(1500);
await p.click('#stopBtn'); await p.waitForTimeout(300);
ok('■ 멈춰 → 바로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.waitForTimeout(1200);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(10)).every(v => v === 0));
ok('멈추면 측정 칸 없이 다시 출발 가능', !(await p.isVisible('#measureBox')) && !(await p.isDisabled('#runBtn')));
// 달리는 중 단계 바꾸기
await p.click('#runBtn'); await p.waitForTimeout(1500);
await p.click('[data-step="2"]'); await p.waitForTimeout(300);
ok('달리는 중 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.click('[data-step="3"]'); await p.waitForTimeout(100);
ok('돌아오면 다시 출발할 수 있음', await p.isVisible('#runBtn') && !(await p.isDisabled('#runBtn')));

// 나머지 다섯 번 재기 → 순서·규칙·별 3
const runOnce = async (s, mm) => {
  await p.click(`#speedChips button[data-s="${s}"]`); await setIr(900); await p.waitForTimeout(150);
  await p.click('#runBtn'); await p.waitForTimeout(1300); await setIr(200); await p.waitForTimeout(300);
  await p.fill('#cmIn', String(Math.floor(mm / 10))); await p.fill('#mmIn', String(mm % 10)); await p.click('#saveLen'); await p.waitForTimeout(100);
};
await runOnce(400, 146); await runOnce(300, 175);
rec = await store('altino.record') || [];
ok('두 속도만 재면 아직 별 2 아님', rec.length === 1, JSON.stringify(rec));
await runOnce(500, 106);
rec = await store('altino.record') || [];
ok('세 속도를 모두 재면 별 2', rec.length === 2 && rec[1].stars === 2 && rec[1].detail.includes('500'), JSON.stringify(rec));
await runOnce(300, 172); await runOnce(500, 101);
rec = await store('altino.record') || [];
ok('여섯 번 모두 재면 별 3', rec.length === 3 && rec[2].stars === 3, JSON.stringify(rec));
const rows = await p.evaluate(() => [...document.querySelectorAll('#brakeTable tr')].slice(1).map(r => [...r.cells].map(c => c.textContent)));
ok('두 값의 차이(mm)·가까운 순서', JSON.stringify(rows) === JSON.stringify([['300', '17cm 5mm', '17cm 2mm', '3mm', '3'], ['400', '14cm 2mm', '14cm 6mm', '4mm', '2'], ['500', '10cm 6mm', '10cm 1mm', '5mm', '1']]), JSON.stringify(rows));
ok('빠를수록 벽 가까이 멈춘 것을 알려 줌', (await p.textContent('#brakeSay')).includes('빠를수록'));
ok('세 속도를 두 번씩 다 재면 출발 버튼이 꺼짐', await p.isDisabled('#runBtn'));
// 벽이 없으면 8초 뒤 멈춤
await p.click('#brakeReset'); await p.click('#acYes'); await p.waitForTimeout(150);
await setIr(900); await p.waitForTimeout(300); await clearTx(); await p.click('#runBtn'); await p.waitForTimeout(9500);
const ran = (await p.evaluate(() => window.__tx.slice())).filter(v => v === 300).length;
ok('벽을 못 찾으면 8초 뒤 스스로 정지', ran >= 70 && ran <= 85 && (await tail(3)).every(v => v === 0) && (await p.textContent('#runMsg')).includes('못 찾았어요'), ran + ' ' + await p.textContent('#runMsg'));

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t10.* 와 공용 키만', keys.every(k => k.startsWith('altino.t10.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
