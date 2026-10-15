// 알티노 네오 프로토콜 인코더/디코더
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
    this.led = 0;           // 0..65535 비트마스크
  }

  // --- APK의 static 명령 메서드들을 그대로 옮긴 것 ---

  // Go(a, b): a -> motorB(8,9), b -> motorA(6,7)  (APK 파라미터 순서 재현)
  go(a, b) {
    this.motorB = clamp(a | 0, -1000, 1000);
    this.motorA = clamp(b | 0, -1000, 1000);
  }

  steer(v) { this.steering = clamp(v | 0, -127, 127); }

  ledSet(v) { this.led = clamp(v | 0, 0, 0xFFFF); }

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

// ── 기종: 알티노 네오(기본) / 알티노 라이트 ───────────────────────────────
// 라이트는 같은 BLE(ISSC UART)지만 프레임이 다르다 — 오케스트라2 libapp.so(altinoLite.dart) 역컴파일로 확인(2026-10-08).
//   보냄 22바이트: 02 10 chk 01 01 | 조향 | 모터A hi lo | 모터B hi lo | 표시 | 도트×8 | 소리 | LED(1바이트) | 03
//   받음 22바이트: 02 .. .. 01 01 | IR1~6(각 2) | CDS(2) | BAT(2) | 03  — 로봇은 프레임을 받을 때마다 하나 답한다
// 연결된 로봇 이름으로 정한다: ALTINO-L… = 라이트, 그 밖 = 네오. transport 가 연결 때 setModelFromName 을 부른다.
let MODEL = 'neo';
function modelFromName(name) { return /^ALTINO-L/i.test(String(name || '').trim()) ? 'lite' : 'neo'; }
function setModel(m) { MODEL = (m === 'lite') ? 'lite' : 'neo'; }
function setModelFromName(name) { setModel(modelFromName(name)); }
function getModel() { return MODEL; }

// 라이트 22바이트 프레임. checksum = sum(bytes[3..20]) & 0xFF (네오와 같은 방식, 범위만 다름)
function buildLiteFrame(st) {
  const b = new Uint8Array(22);
  b[0] = 0x02;
  b[1] = 0x10;            // CMD (라이트)
  b[3] = 0x01;
  b[4] = 0x01;            // 1 = 조종 프레임 (3 = 센서 요청, 오케스트라는 따로 보내지만 조종 프레임에도 답이 온다)
  b[5] = st.steering & 0xFF;
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
  b[20] = st.led & 0xFF;          // ⚠ 라이트 LED 는 1바이트 — 비트 뜻은 실측 전(네오 값의 하위 바이트를 그대로 보냄)
  b[21] = 0x03;
  let sum = 0;
  for (let i = 3; i <= 20; i++) sum += b[i];
  b[2] = sum & 0xFF;
  return b;
}

// 상태 -> 프레임 (Uint8Array). 네오: 26바이트(ConnectedThread.Sendbyte() 재현), 라이트: 22바이트.
function buildFrame(st, model) {
  if ((model || MODEL) === 'lite') return buildLiteFrame(st);
  const b = new Uint8Array(26);
  b[0] = 0x02;            // STX
  b[1] = 0x14;            // CMD (20)
  // b[2] = checksum (아래에서 계산)
  b[3] = 0x01;
  b[4] = 0x01;
  b[5] = st.steering & 0xFF;               // signed int8 -> 바이트
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
  b[20] = (st.led >> 8) & 0xFF;   // LED hi
  b[21] = st.led & 0xFF;          // LED lo
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

// 바이트 스트림에서 프레임을 뽑아내는 슬라이딩 파서 (네오 54바이트 / 라이트 22바이트 — 지금 기종 기준)
class SensorFrameAssembler {
  constructor() { this.buf = []; }
  push(bytes) {
    const out = [];
    for (const byte of bytes) {
      const lite = MODEL === 'lite';
      const n = lite ? 22 : 54;
      this.buf.push(byte & 0xFF);
      while (this.buf.length > n) this.buf.shift();
      if (this.buf.length === n) {
        const frame = Uint8Array.from(this.buf);
        const s = lite ? parseLiteFrame(frame) : parseSensorFrame(frame);
        if (s) { out.push(s); this.buf = []; }
      }
    }
    return out;
  }
}

const AltinoProtocol = {
  AltinoState, buildFrame, buildLiteFrame, parseSensorFrame, parseLiteFrame, encodeMotor,
  modelFromName, setModel, setModelFromName, getModel,
  SensorFrameAssembler,
  toHex: (u8) => Array.from(u8).map(x => x.toString(16).padStart(2, '0')).join(' '),
};

if (typeof module !== 'undefined' && module.exports) module.exports = AltinoProtocol;
if (typeof window !== 'undefined') window.AltinoProtocol = AltinoProtocol;
