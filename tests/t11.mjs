// t11 순서대로 길 안내하기 전용 시험 — 카드 읽기(로봇 안 움직임), 블록 편집, 실행·멈춤, 되풀이 규칙, 버그 미션, 한 칸 맞추기, 성장기록부.
//   node tests/t11.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't11';
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
const clearTx = () => p.evaluate(() => { window.__tx.length = 0; window.__txFrames.length = 0; });
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const steers = () => p.evaluate(() => window.__txFrames.map(f => (f[5] << 24) >> 24));
const add = async (pre, b) => p.click(`#pal${pre} button[data-b="${b}"]`);
const strip = (pre) => p.evaluate((x) => [...document.querySelectorAll(`#strip${x} button`)].map(b => b.textContent.replace(/^\d+/, '')).join(''), pre);
const pick = (pre, i) => p.click(`#strip${pre} button[data-i="${i}"]`);
const act = (pre, k) => p.click(`#acts${pre} button[data-k="${k}"]`);

// ── ① 사람 로봇 놀이 ────────────────────────────────────────────
ok('카드가 없으면 읽기를 못 함', await p.isDisabled('#read1'));
for (const b of 'FFLF') await add('1', b);
ok('카드가 순서대로 놓임', (await strip('1')) === '↑↑←↑', await strip('1'));
await pick('1', 2); await act('1', 'del'); await pick('1', 1); await add('1', 'R');
ok('빼고 끼워서 고치기(↑↑←↑ → ↑↑→↑)', (await strip('1')) === '↑↑→↑', await strip('1'));
for (let i = 0; i < 4; i++) await p.click('#read1');
ok('한 장씩 읽으면 도착점에 도착', (await p.textContent('#say1')).includes('도착점 도착'), await p.textContent('#say1'));
ok('① 에서는 로봇이 움직이지 않음', (await p.evaluate(() => window.__tx.slice())).every(v => v === 0));
await p.click('#rec1'); await p.waitForTimeout(100);
let att = await store('altino.t11.att1');
ok('도전 기록(순서·도착한 곳·O)', att.length === 1 && att[0].seq === '↑ ↑ → ↑' && att[0].where === '도착점' && att[0].ok, JSON.stringify(att));
await pick('1', 3); await act('1', 'right'); await pick('1', 2); await act('1', 'right');
await act('1', 'del');
await add('1', 'L');
for (let i = 0; i < 4; i++) await p.click('#read1');
await p.click('#rec1'); await p.waitForTimeout(100);
att = await store('altino.t11.att1');
ok('다른 곳에 가면 X', att.length === 2 && !att[1].ok, JSON.stringify(att));

// ── ② 블록으로 길 안내하기 ───────────────────────────────────────
await p.evaluate(() => { localStorage.setItem('altino.t11.cellMs', '300'); localStorage.setItem('altino.t11.turnMs', '200'); });
await p.reload(); await p.waitForTimeout(500);
await p.click('[data-step="2"]');
ok('블록이 없으면 실행 못 함', await p.isDisabled('#run2'));
for (const b of 'FFRFFR') await add('2', b);
ok('블록 6개', (await strip('2')) === '↑↑→↑↑→');
await clearTx(); await p.click('#sim2'); await p.waitForTimeout(1200);
ok('화면에서 해 보기 중 블록 편집이 잠김', await p.isDisabled('#pal2 button[data-b="F"]'));
ok('화면에서 해 보기는 로봇을 움직이지 않음', (await p.evaluate(() => window.__tx.slice())).every(v => v === 0));
await p.waitForTimeout(4600);
const d2 = await store('altino.t11.done2');
ok('도착점 완주 + 되풀이 규칙(↑↑→ 가 2번)', d2 && d2.rep === "'↑ ↑ →'가 2번 되풀이", JSON.stringify(d2));
let rec = await store('altino.record') || [];
ok('되풀이 규칙까지 찾으면 성장기록부 별 2', rec.length === 1 && rec[0].app === APP && rec[0].stars === 2, JSON.stringify(rec));
// 로봇 실행: ↑ → (짧은 보정값)
await act('2', 'clear'); await p.click('#acYes'); await p.waitForTimeout(150);
await add('2', 'F'); await add('2', 'R');
await clearTx(); await p.click('#run2'); await p.waitForTimeout(700);
ok('"준비…" 동안은 움직이지 않음', (await p.evaluate(() => window.__tx.slice())).every(v => v === 0));
await p.waitForTimeout(2500);
const tx = await p.evaluate(() => window.__tx.slice()), st = await steers();
ok('↑ 는 조향 0 으로 전진', tx.some((v, i) => v > 0 && st[i] === 0));
ok('→ 돌기 = 오른쪽으로 꺾어 전진 + 왼쪽으로 꺾어 후진', tx.some((v, i) => v > 0 && st[i] === 127) && tx.some((v, i) => v < 0 && st[i] === -127), JSON.stringify(st.filter(x => x)));
ok('블록이 끝나면 정지', (await tail(3)).every(v => v === 0));
ok('도착점이 아니면 못 갔다고 알려 줌', (await p.textContent('#fb2')).includes('못 갔어요'));
// 멈춤
await act('2', 'clear'); await p.click('#acYes'); await p.waitForTimeout(150);
for (let i = 0; i < 3; i++) await add('2', 'F');
await clearTx(); await p.click('#run2'); await p.waitForTimeout(1300);
ok('실행 중 ■ 멈춰가 보임', await p.isVisible('#stop2'));
await p.click('#stop2'); await p.waitForTimeout(300);
ok('■ 멈춰 → 바로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.waitForTimeout(1500);
ok('멈춘 뒤 화면도 다음 블록으로 넘어가지 않음', (await p.textContent('#fb2')).includes('멈췄어요') && (await p.evaluate(() => document.querySelectorAll('#strip2 .now').length)) === 0, await p.textContent('#fb2'));
ok('멈춘 뒤 다음 블록이 이어지지 않음(S5)', (await tail(10)).every(v => v === 0));
ok('멈추면 다시 편집할 수 있음', !(await p.isDisabled('#pal2 button[data-b="F"]')));
// 실행 중 단계 바꾸기
await p.click('#run2'); await p.waitForTimeout(1300);
await p.click('[data-step="1"]'); await p.waitForTimeout(300);
ok('실행 중 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
// 로봇으로 완주하면 사람이 확인
await p.click('[data-step="2"]');
await act('2', 'clear'); await p.click('#acYes'); await p.waitForTimeout(150);
for (const b of 'FFRFF') await add('2', b);
await p.click('#run2'); await p.waitForTimeout(6000);
ok('알티노로 완주하면 진짜 도착했는지 묻는 버튼', await p.isVisible('#judge2'));
await p.click('#judgeNo');
ok('❌ 면 순서가 아니라 한 칸 맞추기를 권함', (await p.textContent('#fb2')).includes('한 칸 맞추기'));
// 한 칸 맞추기
await p.click('#calOpen');
await p.click('#cellPlus'); await p.click('#cellPlus'); await p.click('#turnMinus');
ok('한 칸·돌기 시간이 저장됨', (await store('altino.t11.cellMs')) === 500 && (await store('altino.t11.turnMs')) === 200);
await clearTx(); await p.click('#cellTry'); await p.waitForTimeout(1100);
ok('한 칸 해 보기 → 전진', (await tail(2)).every(v => v > 0), JSON.stringify(await tail(2)));
await p.click('#calStop'); await p.waitForTimeout(300);
ok('맞추기 화면의 ■ 멈춰', (await tail(2)).every(v => v === 0));
await p.click('#calClose');

// ── ③ 버그 고치기 미션 ──────────────────────────────────────────
await p.click('[data-step="3"]');
ok('미션 1 은 버그 순서로 시작', (await strip('2')) === '↑↑←↑', await strip('2'));
await p.click('#sim2'); await p.waitForTimeout(3800);
ok('버그를 실행하면 못 감', (await p.textContent('#fb2')).includes('못 갔어요'));
await pick('2', 2); await act('2', 'del'); await pick('2', 1); await add('2', 'R');
await p.click('#sim2'); await p.waitForTimeout(3800);
ok('고치면 미션 1 해결', (await p.textContent('#fb2')).includes('미션 1 해결') && (await store('altino.t11.mis'))[0].solved);
await p.click('#missionChips button[data-i="1"]');
await add('2', 'F'); await p.click('#sim2'); await p.waitForTimeout(3800);
await p.click('#missionChips button[data-i="2"]');
await p.click('#sim2'); await p.waitForTimeout(4800);
ok('미션 3 버그는 길 밖으로 나감', (await p.textContent('#fb2')).includes('길 밖'), await p.textContent('#fb2'));
await pick('2', 0); await act('2', 'right'); await act('2', 'right');
ok('옮기기로 고침(→ 를 세 번째로)', (await strip('2')) === '↑↑→↑↑', await strip('2'));
await p.click('#sim2'); await p.waitForTimeout(4600);
const mis = await store('altino.t11.mis');
ok('미션 3개 해결', mis.every(m => m.solved), JSON.stringify(mis));
ok('표에 고친 순서', (await p.textContent('#tab3')).includes('↑ → ↑ ↑'));
rec = await store('altino.record') || [];
ok('미션 3개 → 성장기록부 별 3', rec.length === 2 && rec[1].stars === 3 && rec[1].detail.includes('미션 3개'), JSON.stringify(rec));
await p.reload(); await p.waitForTimeout(500);
ok('새로 열어도 고친 미션이 이어짐', (await p.textContent('#missionChips')).includes('미션 1') && (await p.evaluate(() => document.querySelectorAll('#missionChips .done').length)) === 3);

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t11.* 와 공용 키만', keys.every(k => k.startsWith('altino.t11.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
