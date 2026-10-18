// t07 수학 시험 보는 날 전용 시험 — 도트 문제 읽기, 답안지 채점·가르치기, 연산 레이스(한 칸 전진·멈춤·라운드), 성장기록부.
//   node tests/t07.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = 't07';
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
const store = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
const dotRows = () => p.evaluate(() => { const f = window.__txFrames[window.__txFrames.length - 1]; return Array.from(f.slice(10, 19)); });
const solve = (q) => { const m = q.match(/(\d+)\s*([+−×÷])\s*(\d+)/); const a = +m[1], b = +m[3];
  return { '+': a + b, '−': a - b, '×': a * b, '÷': a / b }[m[2]]; };

// ── ① 알티노의 문제 읽기 ─────────────────────────────────────────
ok('문제를 보기 전에는 답을 넣을 수 없음', await p.isDisabled('#ans1'));
await clearTx(); await p.click('#show1'); await p.waitForTimeout(400);
ok('도트로 문제를 보여 줌(도트 모드 프레임)', (await dotRows())[0] === 0xFF, JSON.stringify(await dotRows()));
ok('도트를 보는 동안 화면에 식이 안 보임', !/\d/.test(await p.textContent('#q1')), await p.textContent('#q1'));
await p.waitForTimeout(4800);
ok('수→기호→수→? 를 다 본 뒤 답 칸이 열림', !(await p.isDisabled('#ans1')));
ok('도트를 보는 동안 로봇은 움직이지 않음', (await p.evaluate(() => window.__tx.slice())).every(v => v === 0));
await p.fill('#ans1', '999'); await p.press('#ans1', 'Enter'); await p.waitForTimeout(150);
ok('틀리면 격려 문구 + 다시 풀 수 있음', (await p.textContent('#fb1')).includes('아깝다') && !(await p.isDisabled('#ans1')));
const log = await store('altino.t07.log1');
ok('푼 문제가 저장됨(식·내 답·O·X)', log && log.length === 1 && log[0].ok === false && /= \?$/.test(log[0].q), JSON.stringify(log));
ok('수와 답이 모두 0~99', (() => { const m = log[0].q.match(/\d+/g).map(Number); return m.every(x => x <= 99) && solve(log[0].q) <= 99 && Number.isInteger(solve(log[0].q)); })(), log[0].q);
await p.fill('#ans1', String(solve(log[0].q))); await p.click('#ok1'); await p.waitForTimeout(150);
ok('맞히면 식과 답이 보이고 다음 → 이 열림', (await p.textContent('#q1')).includes('=') && !(await p.isDisabled('#next1')));
// 4학년 문제도 0~99
await p.click('#gradeChips button[data-g="4"]');
ok('4학년 칩을 고를 수 있음', (await p.textContent('#gradeChips .on')).includes('4'));

// 도트를 보여 주는 중 단계를 바꾸면 끊긴다
await p.click('#show1'); await p.waitForTimeout(300);
await p.click('[data-step="2"]'); await p.waitForTimeout(300);
await p.click('[data-step="1"]'); await p.waitForTimeout(200);
ok('도트 연출 중 단계를 바꾸면 끊기고 버튼이 다시 살아남', !(await p.isDisabled('#show1')));

// ── ② 알티노 답안지 채점하기 ─────────────────────────────────────
await p.click('[data-step="2"]');
ok('번호를 누르기 전에는 O·X 를 못 누름', await p.isDisabled('#judgeO'));
await p.click('#paper button[data-i="1"]'); await p.waitForTimeout(6300);
ok('도트를 다 보면 문제와 알티노의 답이 보임', (await p.textContent('#q2')).replace(/\s/g, '') === '6×3=9', await p.textContent('#q2'));
await p.click('#judgeX'); await p.waitForTimeout(150);
ok('틀린 답을 X 로 채점하면 가르치기 칸이 나옴', await p.isVisible('#teachBox'));
ok('바른 답을 넣기 전에는 까닭을 못 고름', await p.isDisabled('#opts button[data-k="0"]'));
await p.fill('#fix2', '18'); await p.click('#fixOk'); await p.waitForTimeout(150);
ok('바른 답 18 → 까닭 고르기가 열림', !(await p.isDisabled('#opts button[data-k="0"]')));
await p.click('#opts button[data-k="2"]'); await p.waitForTimeout(150);
ok('맞지 않는 까닭은 다시 생각하게 함', (await p.textContent('#fbTeach')).includes('다시') && !((await store('altino.t07.marks'))['1'].taught));
await p.click('#opts button[data-k="0"]'); await p.waitForTimeout(150);
const marks = await store('altino.t07.marks');
ok('가르친 말이 저장됨', marks['1'].taught && marks['1'].taught.includes('6을 3번'), JSON.stringify(marks));
await p.click('#paper button[data-i="0"]'); await p.waitForTimeout(6300);
await p.click('#judgeX'); await p.waitForTimeout(150);
ok('맞는 답을 X 로 채점하면 다시 계산하게 함(가르치기 칸 없음)', (await p.textContent('#fb2')).includes('다시') && !(await p.isVisible('#teachBox')));
ok('처음 채점이 기록됨', (await store('altino.t07.marks'))['0'].first === 'X');

// ── ③ 연산 레이스 ───────────────────────────────────────────────
await p.evaluate(() => localStorage.setItem('altino.t07.raceSec', '12'));
await p.reload(); await p.waitForTimeout(500);
await p.click('[data-step="3"]');
ok('출발 전에는 답 칸이 꺼져 있음', await p.isDisabled('#ans3'));
await clearTx(); await p.click('#start3'); await p.waitForTimeout(600);
ok('"준비…" 동안은 움직이지 않음', (await tail(4)).every(v => v === 0), JSON.stringify(await tail(4)));
await p.waitForTimeout(600);
ok('■ 멈춰 가 보임', await p.isVisible('#stop3'));
const answer = async () => { await p.fill('#ans3', String(solve(await p.textContent('#q3')))); await p.press('#ans3', 'Enter'); };
await p.fill('#ans3', '999'); await p.press('#ans3', 'Enter'); await p.waitForTimeout(500);
ok('틀리면 제자리', (await tail(4)).every(v => v === 0), JSON.stringify(await tail(4)));
await clearTx(); await answer(); await p.waitForTimeout(500);
// 처음 잠깐은 S4 킥(400) — 바쁜 컴퓨터에선 0.5초 뒤 표본에 킥이 끼므로 킥을 지난 프레임만 본다
ok('맞히면 한 칸 전진(속도 300)', await p.evaluate(() => { const t = window.__tx, i = t.findIndex(v => v === 300); return i >= 0 && t.slice(i).filter(v => v !== 0).every(v => v === 300); }), JSON.stringify(await tail(5)));
await answer(); await p.waitForTimeout(2300);
const moved = (await p.evaluate(() => window.__tx.slice())).filter(v => v === 300).length;
ok('두 문제 맞히면 두 칸(약 2초, 300 프레임 17~23개)', moved >= 17 && moved <= 23, String(moved));
ok('한 칸씩 다 가면 멈춤', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
ok('정답 수 2', (await p.textContent('#score3')).trim() === '2');
await p.click('#help3'); await p.waitForTimeout(100);
ok('도움 카드를 쓰면 1장 남음', (await p.textContent('#help3')).includes('(1)'));
await answer(); await p.waitForTimeout(300);
await p.click('#stop3'); await p.waitForTimeout(300);
ok('■ 멈춰를 누르면 바로 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.waitForTimeout(1500);
ok('멈춘 뒤 다시 움직이지 않음(S5)', (await tail(10)).every(v => v === 0), JSON.stringify(await tail(10)));
ok('도중에 멈춘 라운드는 기록하지 않음', [null, '[null,null]'].includes(JSON.stringify(await store('altino.t07.rounds')) === 'null' ? null : JSON.stringify(await store('altino.t07.rounds'))), JSON.stringify(await store('altino.t07.rounds')));
ok('멈추면 답 칸이 꺼짐', await p.isDisabled('#ans3'));

// 1라운드: 5개 맞히고 시간 끝 → 도전 배지(별 1) 기록
await p.click('#start3'); await p.waitForTimeout(1200);
for (let i = 0; i < 5; i++) { await answer(); await p.waitForTimeout(80); }
await p.waitForTimeout(11500);
ok('시간이 끝나면 1라운드 기록', JSON.stringify(await store('altino.t07.rounds')) === '[5,null]', JSON.stringify(await store('altino.t07.rounds')));
ok('시간이 끝나면 정지', (await tail(3)).every(v => v === 0), JSON.stringify(await tail(3)));
let rec = await store('altino.record') || [];
ok('정답 5개 → 성장기록부 도전(별 1)', rec.length === 1 && rec[0].app === APP && rec[0].stars === 1 && rec[0].detail.includes('1문항 가르침'), JSON.stringify(rec));
ok('다음은 2라운드', (await p.textContent('#start3')).includes('2라운드'));
// 2라운드 도중 단계를 바꾸면 멈춘다
await p.click('#start3'); await p.waitForTimeout(1200); await answer(); await p.waitForTimeout(300);
await p.click('[data-step="1"]'); await p.waitForTimeout(300);
ok('레이스 중 다른 단계로 가면 정지', (await tail(2)).every(v => v === 0), JSON.stringify(await tail(2)));
await p.click('[data-step="3"]');
ok('단계를 바꿔 끊긴 라운드도 기록하지 않음', JSON.stringify(await store('altino.t07.rounds')) === '[5,null]' && !(await p.isVisible('#stop3')));
// 2라운드를 끝까지 — 낮은 결과는 기록부에 다시 안 남음
await p.click('#start3'); await p.waitForTimeout(13500);
ok('2라운드 기록', JSON.stringify(await store('altino.t07.rounds')) === '[5,0]', JSON.stringify(await store('altino.t07.rounds')));
rec = await store('altino.record') || [];
ok('더 낮은 결과는 기록부에 다시 남지 않음', rec.length === 1, JSON.stringify(rec));
ok('두 라운드가 끝나면 출발 버튼이 꺼짐', await p.isDisabled('#start3'));
await p.click('#reset3'); await p.waitForTimeout(200);
ok('처음부터는 확인창을 거침', await p.isVisible('#altinoConfirm'));
await p.click('#acYes'); await p.waitForTimeout(150);
ok('처음부터 하면 1라운드부터', (await p.textContent('#roundName')).includes('1라운드') && !(await p.isDisabled('#start3')));

const keys = await p.evaluate(() => Object.keys(localStorage));
ok('저장은 altino.t07.* 와 공용 키만', keys.every(k => k.startsWith('altino.t07.') || k === 'altino.record' || k === 'altino.team.name' || !k.startsWith('altino.')), keys.join(','));
ok('무에러', errs.length === 0, errs.join(' | '));
console.log('──────────────'); console.log(`${APP} 앱 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
