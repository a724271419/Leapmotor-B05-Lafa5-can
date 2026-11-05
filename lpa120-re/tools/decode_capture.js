// decode_capture.js — 把抓包 ndjson 解成信号 CSV（openpilot 可用）
// 用法: node decode_capture.js <capture.ndjson> <out.csv>
'use strict';
const fs = require('fs');
const inPath = process.argv[2];
const outPath = process.argv[3] || 'signals.csv';

const rows = [];
const state = { t: 0, speed: 0, fl: 0, fr: 0, rl: 0, rr: 0, angle: 0, rot: 0, tq: 0, motorTq: 0,
                latActive: 0, latAvail: 0, accActive: 0, accRequest: 0,
                gear: 0, throttle: 0, brake: 0, accel: 0 };

for (const ln of fs.readFileSync(inPath, 'utf8').split(/\r?\n/)) {
  if (!ln) continue;
  const o = JSON.parse(ln);
  const b = Buffer.from(o.data_hex, 'hex');
  const t = o.timestamp_unix_us / 1e6;
  switch (o.can_id) {
    case 0x182: // IBC 整车车速
      state.speed = b.readUInt16LE(2) * 0.01; break;
    case 0x184: // IBC 四轮速
      state.fl = b.readUInt16LE(2) * 0.01; state.fr = b.readUInt16LE(4) * 0.01;
      state.rl = b.readUInt16LE(6) * 0.01; state.rr = b.readUInt16LE(8) * 0.01; break;
    case 0x18d: { // EPS
      state.angle = b.readUInt16LE(3) * 0.02 - 650;
      state.rot = b[5] * 4;
      state.tq = (b[6] | ((b[7] & 0x0F) << 8)) * 0.008 - 8;
      state.latActive = (b[8] >> 3) & 1;
      state.latAvail = (b[8] >> 2) & 1;
      state.motorTq = ((b[16] | ((b[17] & 0x07) << 8)) * 0.01) - 5.2;
      break;
    }
    case 0x0b7: // VCU 纵向状态
      state.accRequest = (b[3] >> 4) & 0x03;   // VCU_ACCRequest
      state.accActive  = b[3] >> 6 & 0x01;     // VCU_ACCStates
      break;
    case 0x0b6: // VCU
      state.gear = (b[12] >> 5) & 0x03;
      state.throttle = b[11] * 100 / 255;
      break;
    case 0x183: // IBC 刹车
      state.brake = b[6] >> 7;
      break;
    case 0x233: { // ACU 加速度（纵向）
      const raw = (b[4] | (b[5] << 8)) & 0x3FF; // 位置待确认
      state.accel = raw; break;
    }
    default: continue;
  }
  state.t = t;
  rows.push({ ...state });
}

const cols = ['t', 'speed', 'fl', 'fr', 'rl', 'rr', 'angle', 'rot', 'tq', 'motorTq', 'accActive', 'accRequest', 'latActive', 'latAvail', 'gear', 'throttle', 'brake', 'accel'];
const lines = [cols.join(',')];
for (const r of rows) {
  lines.push(cols.map(c => c === 't' ? r.t.toFixed(6) : (typeof r[c] === 'number' ? r[c].toFixed(3) : r[c])).join(','));
}
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`写入 ${outPath}: ${rows.length} 行`);
const s = rows.map(r => r.speed);
console.log(`车速 ${Math.min(...s).toFixed(1)} ~ ${Math.max(...s).toFixed(1)} km/h`);
const a = rows.map(r => r.angle);
console.log(`转角 ${Math.min(...a).toFixed(1)} ~ ${Math.max(...a).toFixed(1)} °`);
const la = rows.filter(r => r.latActive).length;
const aa = rows.filter(r => r.accActive || r.accRequest).length;
console.log(`横向(LCC) ${(100 * la / rows.length).toFixed(1)}%   纵向(ACC) ${(100 * aa / rows.length).toFixed(1)}%`);
const viol = rows.filter(r => r.latActive && !(r.accActive || r.accRequest)).length;
console.log(`不变式 lat=1 且 acc=0 : ${viol} 帧 (应为 0)`);
