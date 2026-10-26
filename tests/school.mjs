// 로봇학교 첫 화면 시험 — 주제 앱 목록(준비된 앱만 열림), 📒 성장기록부 보기.
//   node tests/school.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'webapp');
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
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('init')) return; sessionStorage.setItem('init', '1');
  localStorage.setItem('altino.team.name', '번개');
  localStorage.setItem('altino.record', JSON.stringify([
    { app: 't02', title: '걸음마 시험 합격', detail: '거북이 배지', stars: 2, at: Date.UTC(2026, 9, 5) },
    { app: 't02', title: '걸음마 시험 합격', detail: '토끼 배지', stars: 3, at: Date.UTC(2026, 9, 6) },
    { app: 't11', title: '<b>블록</b>으로 길을 안내했어요', detail: '', stars: 1, at: Date.UTC(2026, 9, 7) },
  ]));
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/school.html'); await p.waitForTimeout(400);
ok('주제 앱 15개, 모두 준비됨', (await p.$$eval('.app', a => a.length)) === 15 && (await p.$$eval('.app.off', a => a.length)) === 0);
ok('모둠 이름 표시', (await p.textContent('#team')).includes('번개'));
ok('성장기록부 창은 처음엔 닫혀 있음', !(await p.isVisible('#recPop')));
await p.click('#recOpen'); await p.waitForTimeout(150);
ok('📒 성장기록부 보기 → 창', await p.isVisible('#recPop'));
ok('앱 15개를 차시 순으로, 기록 있는 앱 2개·별 6개', (await p.$$eval('.recapp', a => a.map(d => d.dataset.app).join(','))) === Array.from({ length: 15 }, (_, i) => 't' + String(i + 1).padStart(2, '0')).join(',') && (await p.textContent('#recSum')).includes('2 / 15') && (await p.textContent('#recSum')).includes('별 6'), await p.textContent('#recSum'));
ok('t02 는 두 줄(별이 늘 때마다)', (await p.$$eval('.recapp[data-app="t02"] .recrow', a => a.length)) === 2);
ok('기록 없는 앱은 흐리게 "아직 기록 없음"', (await p.$eval('.recapp[data-app="t05"]', d => d.classList.contains('none') && d.textContent.includes('아직 기록 없음'))));
ok('기록 글은 글자 그대로(태그로 안 바뀜)', (await p.$eval('.recapp[data-app="t11"]', d => d.textContent.includes('<b>블록</b>') && !d.querySelector('.recrow b b'))));
await p.click('#recClose'); await p.waitForTimeout(100);
ok('닫기', !(await p.isVisible('#recPop')));
await p.click('#recOpen'); await p.mouse.click(20, 780); await p.waitForTimeout(100);
ok('바깥을 눌러도 닫힘', !(await p.isVisible('#recPop')));
await p.evaluate(() => localStorage.setItem('altino.record', '망가짐')); await p.click('#recOpen'); await p.waitForTimeout(100);
ok('망가진 기록이어도 열림(기록 0)', (await p.textContent('#recSum')).includes('0 / 15'));
ok('브라우저에서는 🔄 업데이트 확인 버튼이 숨음', !(await p.isVisible('#updBtn')));
ok('무에러', errs.length === 0, errs.join(' | '));

// 태블릿(APK) — 가짜 AltinoUpdate 로 업데이트 확인 흐름
const ctx2 = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx2.addInitScript(() => {
  window.__dl = null;
  window.AltinoUpdate = {
    info: () => JSON.stringify({ name: '1.0.1028', code: 1028, canInstall: true }),
    check: () => setTimeout(() => window.__altinoOnUpdate(JSON.stringify({ ok: true, newer: true, name: '1.0.1030', size: 8400000, url: 'https://x/a.apk', notes: '<b>새 기능</b>' })), 50),
    download: (u) => { window.__dl = u; },
  };
});
const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(e.message));
await q.goto(BASE + '/school.html'); await q.waitForTimeout(400);
ok('태블릿에서는 🔄 업데이트 확인 버튼과 설치된 버전이 보임', await q.isVisible('#updBtn') && (await q.textContent('#appVer')).includes('1.0.1028'), await q.textContent('#appVer'));
await q.click('#updBtn'); await q.waitForTimeout(300);
ok('누르면 새 버전 안내(메모는 글자 그대로)', (await q.textContent('#updOv')).includes('1.0.1030') && (await q.textContent('#updOv')).includes('<b>새 기능</b>'));
await q.click('#uYes'); await q.waitForTimeout(100);
ok('지금 업데이트 → 내려받기 시작', (await q.evaluate(() => window.__dl)) === 'https://x/a.apk');
ok('무에러(태블릿)', errs2.length === 0, errs2.join(' | '));
console.log('──────────────'); console.log(`로봇학교 화면 시험: ${pass} 통과 / ${fail} 실패`);
await br.close(); server.close(); process.exit(fail ? 1 : 0);
