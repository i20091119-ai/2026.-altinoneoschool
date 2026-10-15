// 알티노 라이트 프레임 시험 — 오케스트라2 libapp.so(altinoLite.dart)에서 복원한 22바이트 형식
//   node tests/lite.mjs
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../webapp/js/protocol.js');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n + (x ? '  → ' + x : '')); } };
const hex = P.toHex;

ok('이름으로 기종 판정', P.modelFromName('ALTINO-LITE-BF16') === 'lite' && P.modelFromName('ALTINO-LBF16') === 'lite'
  && P.modelFromName('ALTINO-NEO-BF16') === 'neo' && P.modelFromName('ALTINO-NBF16') === 'neo' && P.modelFromName('') === 'neo');

const st = new P.AltinoState();
P.setModel('neo');
ok('네오 기본: 26바이트, CMD 0x14', P.buildFrame(st).length === 26 && P.buildFrame(st)[1] === 0x14);
ok('네오 정지 프레임은 예전과 같음', hex(P.buildFrame(st)) === '02 14 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03');

P.setModel('lite');
let f = P.buildFrame(st);
ok('라이트 정지 프레임 22바이트', hex(f) === '02 10 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03', hex(f));
st.go(300, 300); st.steer(-127); st.soundSet(37); st.ledSet(3);
f = P.buildFrame(st);
ok('라이트 전진 300·좌회전·소리·LED 위치', f[5] === 0x81 && f[6] === 0x01 && f[7] === 0x2c && f[8] === 0x01 && f[9] === 0x2c
  && f[19] === 37 && f[20] === 3 && f[21] === 0x03, hex(f));
let sum = 0; for (let i = 3; i <= 20; i++) sum += f[i];
ok('라이트 체크섬 = sum(3..20) & 0xFF', f[2] === (sum & 0xFF));
st.go(-300, -300);
f = P.buildFrame(st);
ok('라이트 후진은 네오와 같은 인코딩(0xFFFF-|v|)', f[6] === 0xFE && f[7] === 0xD3);

// 수신: 02 xx xx 01 01 IR1..IR6 CDS BAT 03
const rx = new Uint8Array(22); rx[0] = 2; rx[3] = 1; rx[4] = 1; rx[21] = 3;
const put = (i, v) => { rx[i] = (v >> 8) & 0xFF; rx[i + 1] = v & 0xFF; };
put(5, 100); put(7, 200); put(9, 300); put(11, 400); put(13, 500); put(15, 600); put(17, 700); put(19, 800);
const a = new P.SensorFrameAssembler();
const got = a.push([0x55, 0x66, ...rx.slice(0, 10)]).concat(a.push(rx.slice(10)));
ok('라이트 수신 22바이트를 조각으로 받아도 센서값', got.length === 1 && got[0].ir1 === 100 && got[0].ir6 === 600 && got[0].cds === 700 && got[0].battery === 800, JSON.stringify(got));
P.setModel('neo');
ok('네오일 때는 22바이트 프레임을 센서로 읽지 않음', new P.SensorFrameAssembler().push(rx).length === 0);

console.log('──────────────'); console.log(`라이트 프레임 시험: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
