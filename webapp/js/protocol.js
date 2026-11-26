// 알티노 프로토콜 인코더/디코더 (네오·라이트·구형)
// altinoneoCodingplay.apk 를 리버스 엔지니어링해 바이트 단위로 재현한 구현.
// 자세한 명세: docs/PROTOCOL.md
//
// 핵심: 앱은 26바이트 "상태 프레임"을 유지하고 50ms 주기로 계속 전송한다.
// 각 조작은 프레임의 특정 바이트만 바꾸고, 전송은 스트리밍 루프가 담당한다.

'use strict';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// 로봇으로 보낼 논리적 상태. buildFrame()이 이걸 26바이트로 직렬화한다.
class AltinoState {
  constructor() {
    this.steering = 0;      // -127..127
    this.motorA = 0;        // -1000..1000  (bytes 6,7)
    this.motorB = 0;        // -1000..1000  (bytes 8,9)
    this.displayMode = 0;   // 0x00=밝기, 0xFF=도트 비트맵
    this.dot = new Uint8Array(8); // 도트 8행 (displayMode=0xFF일 때 사용)
    this.sound = 0;         // 0..255
    this.led = 0;           // 0..65535 비트마스크 — 뜻은 네오 기준(아래 '불빛'), 라이트·구형은 buildFrame 이 바꿔 보낸다
    this.ledRaw = null;     // 숫자면 바꾸지 않고 그 기종 바이트에 그대로(선생님 LED 점검용)
  }

  // --- APK의 static 명령 메서드들을 그대로 옮긴 것 ---

  // Go(a, b): a -> motorB(8,9), b -> motorA(6,7)  (APK 파라미터 순서 재현)
  go(a, b) {
    this.motorB = clamp(a | 0, -1000, 1000);
    this.motorA = clamp(b | 0, -1000, 1000);
  }

  steer(v) { this.steering = clamp(v | 0, -127, 127); }

  ledSet(v) { this.led = clamp(v | 0, 0, 0xFFFF); this.ledRaw = null; }
  ledRawSet(v) { this.ledRaw = clamp(v | 0, 0, 0xFFFF); }

  soundSet(v) { this.sound = clamp(v | 0, 0, 255); }

  // 밝기 모드: 도트 비트맵을 지우고 전체 밝기만 설정
  display(brightness) {
    this.displayMode = 0x00 & 0xFF; // byte10 = brightness 값 자체(아래 buildFrame서 처리)
    this._brightness = clamp(brightness | 0, 0, 255);
    this.dot.fill(0);
  }

  // 도트 비트맵 모드
  dotOn(col, row) {   // col,row: 1..8
    if (col < 1 || col > 8 || row < 1 || row > 8) return;
    this.displayMode = 0xFF;
    this.dot[8 - col] |= (1 << (row - 1));
  }
  dotOff(col, row) {
    if (col < 1 || col > 8 || row < 1 || row > 8) return;
    this.displayMode = 0xFF;
    this.dot[8 - col] &= ~(1 << (row - 1)) & 0xFF;
  }
  dotClear() { this.displayMode = 0; this._brightness = 0; this.dot.fill(0); }

  stopAll() {
    this.go(0, 0); this.steer(0); this.soundSet(0); this.ledSet(0); this.dotClear();
  }
}

// 16bit 모터 값 인코딩 (APK Go() 재현)
// 양수: big-endian. 음수: ~|v| 의 하위 16bit = 0xFFFF - |v|.
function encodeMotor(v) {
  v = clamp(v | 0, -1000, 1000);
  let raw;
  if (v < 0) raw = (~Math.abs(v)) & 0xFFFF;   // 0xFFFF - |v|
  else raw = v & 0xFFFF;
  return [(raw >> 8) & 0xFF, raw & 0xFF];
}

// ── 기종 세 가지 (PROTOCOL.md 부록 L·C — 캠프 앱 i20091119-ai/altino 의 오케스트라2 PC판 분석·실기 확인) ──
//   neo     올뉴 알티노  이름 ALTINO-N…  보냄 26 / 받음 54
//   lite    알티노 라이트 이름 ALTINO-L…  보냄 22 / 받음 22
//   classic 구형 알티노  그 밖의 ALTINO…(ALTINO-B7CE 등)·RN4678·RNBT  보냄 28 / 받음 56 — 실기에서 움직임·소리·도트·센서 확인
// 오케스트라2 와 같은 순서로 이름을 본다. 이름으로 고른 기종이 답이 없으면 kit 이 나머지를 차례로 보내 본다.
// [3][4] 는 명령 번호 0x0101(출력 설정) — 답으로 센서 프레임이 온다. 0x0103 은 조향 설정 읽기라 보내면 안 된다.
let MODEL = 'neo';
const MODELS = ['neo', 'lite', 'classic'];
function modelFromName(name) {
  const up = String(name || '').toUpperCase();
  if (up.includes('ALTINO-L')) return 'lite';
  if (up.includes('ALTINO-N')) return 'neo';
  if (up.includes('ALTINO') || up.includes('RN4678') || up.includes('RNBT')) return 'classic';
  return 'neo';
}
function setModel(m) { MODEL = MODELS.includes(m) ? m : 'neo'; }
function setModelFromName(name) { setModel(modelFromName(name)); }
function getModel() { return MODEL; }
const MODEL_LABEL = { neo: '올뉴 알티노(네오)', lite: '알티노 라이트', classic: '구형 알티노' };
function modelLabel(m) { return MODEL_LABEL[m || MODEL] || m; }

// 조향(라이트·네오): 오른쪽 = 값 그대로, 왼쪽 = ~|값| (1의 보수 — 2의 보수가 아니다. 예전엔 1 차이로 보냈다)
function encodeSteer(v) { v = clamp(v | 0, -127, 127); return v < 0 ? (~(-v)) & 0xFF : v; }

// ── 불빛: 앱은 네오 뜻으로 쓴다(kit.led) ─────────────────────────────────
//   네오 [21](하위 바이트) 전조등 1|2 · 후진등 4|8 · 오른쪽 깜빡이 0x10|0x40 · 왼쪽 깜빡이 0x20|0x80, [20](상위) 브레이크 1|2(=0x300)
//   라이트 1바이트: 전조등 1 · 브레이크 2 · 왼쪽 깜빡이 4 · 오른쪽 깜빡이 8 (후진등 없음)
//   구형 [23]: 네오 하위 바이트와 같은 자리(실기 확인), [21] 위 4비트 0xC0 = 브레이크
const LED = { HEAD: 0x03, BACK: 0x0C, RIGHT: 0x50, LEFT: 0xA0, BRAKE: 0x300 };
function liteLed(led) {
  return ((led & LED.HEAD) ? 1 : 0) | ((led & LED.BRAKE) ? 2 : 0) | ((led & LED.LEFT) ? 4 : 0) | ((led & LED.RIGHT) ? 8 : 0);
}

// 구형 알티노 28바이트. 음수는 부호 비트(조향 |v| | 0x80, 구동은 hi 바이트에만 0x80).
// 체크섬 [2] = [1]~[27] 중 [2] 를 뺀 합(ETX 포함, STX 제외). [4]=0x0A · [21] 아래 4비트 0xA · [24]=1 은 뜻을 모르는 고정값.
function buildClassicFrame(st) {
  const b = new Uint8Array(28);
  b[0] = 0x02; b[1] = 0x1C; b[3] = 0x00; b[4] = 0x0A;
  const s = clamp(st.steering | 0, -127, 127);
  b[5] = s < 0 ? ((-s) | 0x80) : s;
  const mot = (v, i) => { v = clamp(v | 0, -1000, 1000); const a = Math.abs(v); b[i] = ((a >> 8) & 0x7F) | (v < 0 ? 0x80 : 0); b[i + 1] = a & 0xFF; };
  mot(st.motorA, 7); mot(st.motorB, 10);
  b[12] = 0x00;                                             // 0 = 점 그림
  if (st.displayMode === 0xFF) for (let i = 0; i < 8; i++) b[13 + i] = st.dot[i] & 0xFF;
  const raw = st.ledRaw != null;
  b[21] = 0x0A | (raw ? ((st.ledRaw >> 8) & 0xF0) : ((st.led & LED.BRAKE) ? 0xC0 : 0));
  b[22] = st.sound & 0xFF;
  b[23] = (raw ? st.ledRaw : st.led) & 0xFF;
  b[24] = 0x01;
  b[27] = 0x03;
  let sum = 0;
  for (let i = 1; i <= 27; i++) if (i !== 2) sum += b[i];
  b[2] = sum & 0xFF;
  return b;
}

// 구형 받는 56바이트. 체크섬은 STX 포함·제외 두 방식 모두 받아 주고, 둘 다 아니어도 끝이 0x03 이면 받는다(캠프 앱과 같음).
function parseClassicFrame(f) {
  if (!f || f.length < 56 || f[0] !== 0x02) return null;
  let sum = 0; for (let i = 1; i < 56; i++) if (i !== 2) sum += f[i];
  if (((sum + 2) & 0xFF) !== f[2] && (sum & 0xFF) !== f[2] && f[55] !== 0x03) return null;
  const u16 = (i) => ((f[i] & 0xFF) << 8) | (f[i + 1] & 0xFF);
  return { ir1: u16(7), ir2: u16(9), ir3: u16(11), ir4: u16(13), ir5: u16(15), ir6: u16(17), cds: u16(43), battery: u16(47) };
}

// 배터리 → 화면 표시. 네오: 원값 그대로(실측 정상 760~800, 700 미만 낮음 — 03 §7).
// 라이트: 원값 × 1.17 = %(최대 100). 구형: 전압 = 0.0027 × 값 + 5.8958, 7.0V 0% ~ 8.3V 100%.
function batteryPct(raw, model) {
  if ((model || MODEL) === 'classic') { const v = 0.0027 * raw + 5.8958; return Math.round(clamp((v - 7.0) / 1.3, 0, 1) * 100); }
  return Math.min(100, Math.round(raw * 1.17));
}

// 라이트 22바이트 프레임. checksum = sum(bytes[3..20]) & 0xFF (네오와 같은 방식, 범위만 다름)
function buildLiteFrame(st) {
  const b = new Uint8Array(22);
  b[0] = 0x02;
  b[1] = 0x10;            // CMD (라이트)
  b[3] = 0x01;
  b[4] = 0x01;            // [3][4] = 0x0101 출력 설정 — 답으로 센서 프레임이 온다(센서 요청 명령은 따로 없다)
  b[5] = encodeSteer(st.steering);
  const [a6, a7] = encodeMotor(st.motorA);
  b[6] = a6; b[7] = a7;
  const [b8, b9] = encodeMotor(st.motorB);
  b[8] = b8; b[9] = b9;
  if (st.displayMode === 0xFF) {
    b[10] = 0xFF;
    for (let i = 0; i < 8; i++) b[11 + i] = st.dot[i] & 0xFF;
  } else {
    b[10] = (st._brightness || 0) & 0xFF;
  }
  b[19] = st.sound & 0xFF;
  b[20] = (st.ledRaw != null ? st.ledRaw : liteLed(st.led)) & 0xFF;   // 1바이트: 전조등 1 · 브레이크 2 · 왼 4 · 오른 8
  b[21] = 0x03;
  let sum = 0;
  for (let i = 3; i <= 20; i++) sum += b[i];
  b[2] = sum & 0xFF;
  return b;
}

// 상태 -> 프레임 (Uint8Array). 네오: 26바이트(ConnectedThread.Sendbyte() 재현), 라이트: 22바이트, 구형: 28바이트.
function buildFrame(st, model) {
  if ((model || MODEL) === 'lite') return buildLiteFrame(st);
  if ((model || MODEL) === 'classic') return buildClassicFrame(st);
  const b = new Uint8Array(26);
  b[0] = 0x02;            // STX
  b[1] = 0x14;            // CMD (20)
  // b[2] = checksum (아래에서 계산)
  b[3] = 0x01;
  b[4] = 0x01;
  b[5] = encodeSteer(st.steering);         // 왼쪽은 1의 보수
  const [a6, a7] = encodeMotor(st.motorA);
  b[6] = a6; b[7] = a7;
  const [b8, b9] = encodeMotor(st.motorB);
  b[8] = b8; b[9] = b9;
  if (st.displayMode === 0xFF) {
    b[10] = 0xFF;
    for (let i = 0; i < 8; i++) b[11 + i] = st.dot[i] & 0xFF;
  } else {
    b[10] = (st._brightness || 0) & 0xFF;  // 밝기 모드
    for (let i = 11; i <= 18; i++) b[i] = 0;
  }
  b[19] = st.sound & 0xFF;
  const led = st.ledRaw != null ? st.ledRaw : st.led;
  b[20] = (led >> 8) & 0xFF;      // LED hi (브레이크)
  b[21] = led & 0xFF;             // LED lo (전조등·후진등·깜빡이)
  b[22] = 0; b[23] = 0; b[24] = 0;
  b[25] = 0x03;                   // ETX
  // checksum: sum(bytes[3..24]) % 256
  let sum = 0;
  for (let i = 3; i <= 24; i++) sum += b[i];
  b[2] = sum & 0xFF;
  return b;
}

// 수신 54바이트 프레임 파서. 유효하면 센서 객체, 아니면 null.
function parseSensorFrame(f) {
  if (!f || f.length < 54) return null;
  if (f[0] !== 0x02 || f[1] !== 0x30 || f[53] !== 0x03) return null;
  const u16 = (hi, lo) => ((f[hi] & 0xFF) << 8) | (f[lo] & 0xFF);
  return {
    ir1: u16(5, 6), ir2: u16(7, 8), ir3: u16(9, 10),
    ir4: u16(11, 12), ir5: u16(13, 14), ir6: u16(15, 16),
    cds: u16(47, 48),      // 조도
    battery: u16(49, 50),  // 배터리
  };
}

// 라이트 수신 22바이트 프레임 (altinoLite.dart requestData 수신부 재현). 값은 signed 16bit(toInt16).
function parseLiteFrame(f) {
  if (!f || f.length < 22) return null;
  if (f[0] !== 0x02 || f[3] !== 0x01 || f[4] !== 0x01 || f[21] !== 0x03) return null;
  const s16 = (i) => { const v = ((f[i] & 0xFF) << 8) | (f[i + 1] & 0xFF); return v >= 0x8000 ? v - 0x10000 : v; };
  return {
    ir1: s16(5), ir2: s16(7), ir3: s16(9), ir4: s16(11), ir5: s16(13), ir6: s16(15),
    cds: s16(17), battery: s16(19),
  };
}

// 바이트 스트림에서 프레임을 뽑아내는 슬라이딩 파서 (네오 54 / 라이트 22 / 구형 56바이트 — 지금 기종 기준)
class SensorFrameAssembler {
  constructor() { this.buf = []; }
  push(bytes) {
    const out = [];
    for (const byte of bytes) {
      const n = MODEL === 'lite' ? 22 : MODEL === 'classic' ? 56 : 54;
      this.buf.push(byte & 0xFF);
      while (this.buf.length > n) this.buf.shift();
      if (this.buf.length === n) {
        const frame = Uint8Array.from(this.buf);
        const s = MODEL === 'lite' ? parseLiteFrame(frame) : MODEL === 'classic' ? parseClassicFrame(frame) : parseSensorFrame(frame);
        if (s) { out.push(s); this.buf = []; }
      }
    }
    return out;
  }
}

const AltinoProtocol = {
  AltinoState, buildFrame, buildLiteFrame, buildClassicFrame, parseSensorFrame, parseLiteFrame, parseClassicFrame,
  encodeMotor, encodeSteer, liteLed, LED, batteryPct,
  MODELS, modelFromName, setModel, setModelFromName, getModel, modelLabel,
  SensorFrameAssembler,
  toHex: (u8) => Array.from(u8).map(x => x.toString(16).padStart(2, '0')).join(' '),
};

if (typeof module !== 'undefined' && module.exports) module.exports = AltinoProtocol;
if (typeof window !== 'undefined') window.AltinoProtocol = AltinoProtocol;
