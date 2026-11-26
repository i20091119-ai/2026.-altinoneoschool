// 세 기종(네오·라이트·구형) 프레임 시험 — 캠프 앱(i20091119-ai/altino) docs/ALTINO_LITE_ORCHESTRA2.md §8 검증값과 같은지.
//   node tests/frames.mjs
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../webapp/js/protocol.js');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n + (x ? '  → ' + x : '')); } };
const H = (s) => s.toLowerCase();
const frame = (model, set) => { const st = new P.AltinoState(); set(st); return P.toHex(P.buildFrame(st, model)); };
const V = [
  ['라이트 정지', 'lite', () => {}, '02 10 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['라이트 앞으로 300', 'lite', s => s.go(300, 300), '02 10 5C 01 01 00 01 2C 01 2C 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['라이트 뒤로 300', 'lite', s => s.go(-300, -300), '02 10 A4 01 01 00 FE D3 FE D3 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['라이트 조향 왼 100', 'lite', s => s.steer(-100), '02 10 9D 01 01 9B 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['라이트 조향 오른 100', 'lite', s => s.steer(100), '02 10 66 01 01 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['라이트 소리 37', 'lite', s => s.soundSet(37), '02 10 27 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 25 00 03'],
  ['라이트 전조등 (앱 값 15)', 'lite', s => s.ledSet(15), '02 10 03 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 03'],
  ['네오 정지', 'neo', () => {}, '02 14 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03'],
  ['구형 정지', 'classic', () => {}, '02 1C 34 00 0A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 0A 00 00 01 00 00 03'],
  ['구형 앞으로 300', 'classic', s => s.go(300, 300), '02 1C 8E 00 0A 00 00 01 2C 00 01 2C 00 00 00 00 00 00 00 00 00 0A 00 00 01 00 00 03'],
  ['구형 뒤로 300', 'classic', s => s.go(-300, -300), '02 1C 8E 00 0A 00 00 81 2C 00 81 2C 00 00 00 00 00 00 00 00 00 0A 00 00 01 00 00 03'],
  ['구형 조향 왼 100', 'classic', s => s.steer(-100), '02 1C 18 00 0A E4 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 0A 00 00 01 00 00 03'],
  ['구형 소리 37', 'classic', s => s.soundSet(37), '02 1C 59 00 0A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 0A 25 00 01 00 00 03'],
  ['구형 전조등 (앱 값 3)', 'classic', s => s.ledSet(3), '02 1C 37 00 0A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 0A 00 03 01 00 00 03'],
  ['구형 점 전부 켬', 'classic', s => { for (let c = 1; c <= 8; c++) for (let r = 1; r <= 8; r++) s.dotOn(c, r); }, '02 1C 2C 00 0A 00 00 00 00 00 00 00 00 FF FF FF FF FF FF FF FF 0A 00 00 01 00 00 03'],
];
for (const [name, m, set, want] of V) { const got = frame(m, set); ok(name, got === H(want), got); }

// 불빛 — 앱은 네오 뜻으로 쓰고 기종마다 바꿔 보낸다
const L = P.LED;
ok('라이트 불빛: 전조등 1 · 브레이크 2 · 왼 4 · 오른 8', P.liteLed(L.HEAD) === 1 && P.liteLed(L.BRAKE) === 2 && P.liteLed(L.LEFT) === 4 && P.liteLed(L.RIGHT) === 8 && P.liteLed(L.BACK) === 0);
{ const st = new P.AltinoState(); st.ledSet(L.BRAKE); const f = P.buildFrame(st, 'classic'); ok('구형 브레이크 = [21] 위 4비트 0xC0', f[21] === 0xCA && f[23] === 0, P.toHex(f)); }
{ const st = new P.AltinoState(); st.ledSet(L.BRAKE | L.HEAD); const f = P.buildFrame(st, 'neo'); ok('네오 브레이크 [20]=3 · 전조등 [21]=3', f[20] === 3 && f[21] === 3, P.toHex(f)); }
{ const st = new P.AltinoState(); st.ledRawSet(4); ok('LED 점검(원값)은 바꾸지 않고 그대로', P.buildFrame(st, 'lite')[20] === 4 && P.buildFrame(st, 'classic')[23] === 4 && P.buildFrame(st, 'neo')[21] === 4);
  st.ledSet(0); ok('kit.led 를 쓰면 원값은 풀림', st.ledRaw === null && P.buildFrame(st, 'lite')[20] === 0); }

// 받기 — 구형 56바이트
{ const f = new Uint8Array(56); f[0] = 2; f[55] = 3; f[7] = 0x01; f[8] = 0x2C; f[47] = 0x02; f[48] = 0xBC;
  let s = 0; for (let i = 1; i < 56; i++) if (i !== 2) s += f[i]; f[2] = s & 0xFF;
  const r = P.parseClassicFrame(f); ok('구형 받기: IR1 [7,8] · 배터리 [47,48]', r && r.ir1 === 300 && r.battery === 700, JSON.stringify(r));
  P.setModel('classic'); const a = new P.SensorFrameAssembler(); ok('구형이면 56바이트씩 읽음', a.push(f).length === 1); P.setModel('neo'); }

// 배터리 표시
ok('배터리: 라이트 원값×1.17(최대 100) · 구형 전압식', P.batteryPct(50, 'lite') === 59 && P.batteryPct(200, 'lite') === 100 && P.batteryPct(700, 'classic') === 60 && P.batteryPct(0, 'classic') === 0);
ok('기종 이름표', P.modelLabel('classic') === '구형 알티노' && P.modelLabel('lite') === '알티노 라이트');
console.log('──────────────'); console.log(`세 기종 프레임 시험: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
