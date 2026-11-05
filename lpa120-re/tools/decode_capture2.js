// decode_capture2.js - ndjson capture -> fixed-rate signal CSV (openpilot oriented)
// changes vs decode_capture.js:
//   * vEgo comes from 0x184 (steady 50 Hz, present ~100%) instead of 0x182 (conditional, ~30% of windows)
//   * output is a 20 ms grid, so quantised (1 ms) source timestamps never enter a dt directly
//   * every column carries a staleness age; NaN is emitted when a source is older than --max-age
//   * signs each wheel and vEgo with the four packed 0x184 byte10 direction fields (never with gear)
//   * adds 0x083 steer target / 3-bit LKA.FuncMode command
//   * exposes 0x142 LKA.FuncMode echo separately; it is not execution evidence
//   * decodes stable turn-command state from 0x290 byte2; byte3 is only the
//     flashing lamp output and must not drive CarState booleans directly
// usage: node decode_capture2.js <capture.ndjson> <out.csv> [--hz 50] [--max-age 300]
'use strict';
const fs = require('fs');
const rl = require('readline');

const inPath = process.argv[2];
const outPath = process.argv[3] || 'signals2.csv';
const opt = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : def; };
const HZ = opt('--hz', 50);
const MAXAGE = opt('--max-age', 300);
const STEP = Math.round(1e6 / HZ);

const S = {
  speed182: { v: NaN, t: 0 }, fl: { v: NaN, t: 0 }, fr: { v: NaN, t: 0 },
  rl: { v: NaN, t: 0 }, rr: { v: NaN, t: 0 },
  flDir: { v: NaN, t: 0 }, frDir: { v: NaN, t: 0 },
  rlDir: { v: NaN, t: 0 }, rrDir: { v: NaN, t: 0 },
  angle: { v: NaN, t: 0 }, rot: { v: NaN, t: 0 }, tq: { v: NaN, t: 0 }, motorTq: { v: NaN, t: 0 },
  latActive: { v: 0, t: 0 }, latAvail: { v: 0, t: 0 },
  accActive: { v: 0, t: 0 }, accRequest: { v: 0, t: 0 },
  gear: { v: NaN, t: 0 }, throttle: { v: NaN, t: 0 },
  rod: { v: NaN, t: 0 }, brakePressed: { v: 0, t: 0 }, longAcc: { v: NaN, t: 0 },
  steerTarget: { v: NaN, t: 0 }, lkaFuncMode083: { v: NaN, t: 0 },
  lkaFuncModeEcho142: { v: NaN, t: 0 }, lkaAvailableEcho142: { v: NaN, t: 0 },
  turnState290: { v: NaN, t: 0 },
};

const cols = ['t', 'vEgo', 'vEgoKph', 'vEgo182Kph', 'fl', 'fr', 'rl', 'rr',
  'flDir', 'frDir', 'rlDir', 'rrDir',
  'steerAngleDeg', 'steerRateDeg', 'steerTorqueNm', 'motorTorqueNm',
  'latActive', 'latAvail', 'accActive', 'accRequest', 'gear', 'throttlePct',
  'brakeRod', 'brakePct', 'brakePressed', 'longAccMps2', 'steerTargetDeg', 'lkaFuncMode083',
  'lkaFuncModeEcho142', 'lkaAvailableEcho142', 'lkaCommandMode3Echo142',
  'turnState290', 'leftBlinker', 'rightBlinker',
  'ageSpeedMs', 'ageSteerMs', 'ageAccMs', 'ageLka142Ms', 'ageTurnMs'];

const pick = (sig, now) => {
  if (!sig.t) return { v: NaN, age: 1e9 };          // never seen
  const a = (now - sig.t) / 1000;
  return (Number.isFinite(sig.v) && a <= MAXAGE) ? { v: sig.v, age: a } : { v: NaN, age: a };
};
const fmt = (x, d) => Number.isFinite(x) ? x.toFixed(d) : '';
const directionSign = (dir) => dir === 0 ? 0 : dir === 1 ? 1 : dir === 2 ? -1 : NaN;

(async () => {
  const out = fs.createWriteStream(outPath);
  out.write(cols.join(',') + '\n');
  let rows = 0, start = 0, nextGrid = 0, prevT = 0;
  let vMin = 0, vMax = 0, latRows = 0, accRows = 0, viol = 0, maxErr = 0, staleSpeed = 0;
  let mode3AccChecks = 0, mode3AccViol = 0;
  let leftRows = 0, rightRows = 0, hazardRows = 0, unknownTurnRows = 0;

  const emit = (g) => {
    const sp = [pick(S.fl, g), pick(S.fr, g), pick(S.rl, g), pick(S.rr, g)];
    const dirs = [pick(S.flDir, g), pick(S.frDir, g), pick(S.rlDir, g), pick(S.rrDir, g)];
    const signedSp = sp.map((s, i) => s.v * directionSign(dirs[i].v));
    const v = signedSp.reduce((a, speed) => a + speed, 0) / 4;
    const s182 = pick(S.speed182, g), ang = pick(S.angle, g), st = pick(S.steerTarget, g);
    const acc = pick(S.accActive, g), req = pick(S.accRequest, g);
    const fm142 = pick(S.lkaFuncModeEcho142, g), avail142 = pick(S.lkaAvailableEcho142, g);
    const turn = pick(S.turnState290, g);
    const turnHigh = Number.isFinite(turn.v) ? (turn.v & 0xE0) : NaN;
    const leftBlinker = turnHigh === 0x20 || turnHigh === 0x80;
    const rightBlinker = turnHigh === 0x40 || turnHigh === 0x80;
    if (turnHigh === 0x20) leftRows++;
    else if (turnHigh === 0x40) rightRows++;
    else if (turnHigh === 0x80) hazardRows++;
    else if (Number.isFinite(turnHigh) && turnHigh !== 0) unknownTurnRows++;
    const ageSpeed = Math.max(...sp.map(s => s.age), ...dirs.map(d => d.age));
    if (ageSpeed > MAXAGE) staleSpeed++;
    if (Number.isFinite(v)) { vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }
    const lat = Number.isFinite(ang.v) ? S.latActive.v : 0;
    const accKnown = Number.isFinite(acc.v) || Number.isFinite(req.v);
    const aAct = (Number.isFinite(acc.v) && acc.v) || (Number.isFinite(req.v) && req.v) ? 1 : 0;
    if (lat) latRows++;
    if (aAct) accRows++;
    if (lat && !aAct) viol++;
    if (Number.isFinite(fm142.v) && fm142.v === 3 && accKnown) {
      mode3AccChecks++;
      if (!aAct) mode3AccViol++;
    }
    if (lat && Number.isFinite(ang.v) && Number.isFinite(st.v)) maxErr = Math.max(maxErr, Math.abs(st.v - ang.v));
    const rod = pick(S.rod, g);
    out.write([
      ((g - start) / 1e6).toFixed(3), fmt(v / 3.6, 3), fmt(v, 2), fmt(s182.v, 2),
      fmt(sp[0].v, 2), fmt(sp[1].v, 2), fmt(sp[2].v, 2), fmt(sp[3].v, 2),
      ...dirs.map(d => Number.isFinite(d.v) ? d.v : ''),
      fmt(ang.v, 2), fmt(pick(S.rot, g).v, 1), fmt(pick(S.tq, g).v, 3), fmt(pick(S.motorTq, g).v, 3),
      S.latActive.v, S.latAvail.v, aAct, Number.isFinite(req.v) ? req.v : 0,
      Number.isFinite(pick(S.gear, g).v) ? pick(S.gear, g).v : '', fmt(pick(S.throttle, g).v, 1),
      fmt(rod.v, 0), Number.isFinite(rod.v) ? (Math.min(rod.v, 100) / 100).toFixed(2) : '', S.brakePressed.v,
      fmt(pick(S.longAcc, g).v, 3),
      fmt(st.v, 2), Number.isFinite(pick(S.lkaFuncMode083, g).v) ? pick(S.lkaFuncMode083, g).v : '',
      Number.isFinite(fm142.v) ? fm142.v : '', Number.isFinite(avail142.v) ? avail142.v : '',
      Number.isFinite(fm142.v) ? (fm142.v === 3 ? 1 : 0) : '',
      Number.isFinite(turn.v) ? turn.v : '', Number.isFinite(turn.v) ? (leftBlinker ? 1 : 0) : '',
      Number.isFinite(turn.v) ? (rightBlinker ? 1 : 0) : '',
      ageSpeed.toFixed(0), pick(S.angle, g).age.toFixed(0), Math.max(acc.age, req.age).toFixed(0),
      fm142.age.toFixed(0), turn.age.toFixed(0),
    ].join(',') + '\n');
    rows++;
  };

  for await (const ln of rl.createInterface({ input: fs.createReadStream(inPath) })) {
    if (!ln) continue;
    const o = JSON.parse(ln);
    const b = Buffer.from(o.data_hex, 'hex');
    const t = o.timestamp_unix_us;
    if (!start) { start = t; prevT = t; nextGrid = t + STEP; }
    while (nextGrid <= t) { emit(nextGrid); nextGrid += STEP; }

    switch (o.can_id) {
      case 0x182: S.speed182.v = b.readUInt16LE(2) * 0.01; S.speed182.t = t; break;
      case 0x184:
        S.fl.v = b.readUInt16LE(2) * 0.01; S.fl.t = t;
        S.fr.v = b.readUInt16LE(4) * 0.01; S.fr.t = t;
        S.rl.v = b.readUInt16LE(6) * 0.01; S.rl.t = t;
        S.rr.v = b.readUInt16LE(8) * 0.01; S.rr.t = t;
        S.flDir.v = b[10] & 0x03; S.flDir.t = t;
        S.frDir.v = (b[10] >> 2) & 0x03; S.frDir.t = t;
        S.rlDir.v = (b[10] >> 4) & 0x03; S.rlDir.t = t;
        S.rrDir.v = (b[10] >> 6) & 0x03; S.rrDir.t = t; break;
      case 0x18d:
        S.angle.v = b.readUInt16LE(3) * 0.02 - 650; S.angle.t = t;
        S.rot.v = b[5] * 4; S.rot.t = t;
        S.tq.v = ((b[6] | ((b[7] & 0x0F) << 8)) * 0.008) - 8; S.tq.t = t;
        S.motorTq.v = ((b[16] | ((b[17] & 0x07) << 8)) * 0.01) - 5.2; S.motorTq.t = t;
        S.latActive.v = (b[8] >> 3) & 1; S.latActive.t = t;
        S.latAvail.v = (b[8] >> 2) & 1; S.latAvail.t = t; break;
      case 0x185:
        S.longAcc.v = (((b[6] | ((b[7] & 0x03) << 8)) & 0x3FF) * 0.03125) - 16; S.longAcc.t = t;
        break;
      case 0x0b7:
        S.accRequest.v = (b[3] >> 4) & 0x03; S.accRequest.t = t;
        S.accActive.v = (b[3] >> 6) & 0x01; S.accActive.t = t; break;
      case 0x0b6:
        S.gear.v = (b[12] >> 5) & 0x03; S.gear.t = t;
        S.throttle.v = b[11] * 100 / 255; S.throttle.t = t; break;
      case 0x183:
        S.brakePressed.v = (b[6] >> 7) & 1; S.brakePressed.t = t;
        S.rod.v = b[7] & 0x7F; S.rod.t = t; break;
      case 0x083:
        S.steerTarget.v = b.readUInt16LE(13) * 0.02 - 650; S.steerTarget.t = t;
        S.lkaFuncMode083.v = b[12] & 0x07; S.lkaFuncMode083.t = t; break;
      case 0x142:
        S.lkaFuncModeEcho142.v = b[5] & 0x07; S.lkaFuncModeEcho142.t = t;
        S.lkaAvailableEcho142.v = (b[7] >> 2) & 1; S.lkaAvailableEcho142.t = t; break;
      case 0x290:
        S.turnState290.v = b[2]; S.turnState290.t = t; break;
      default: break;
    }
    prevT = t;
  }
  out.end();
  await new Promise(r => out.on('finish', r));
  console.log('写入 ' + outPath + ': ' + rows + ' 行 @ ' + HZ + ' Hz (' + ((rows / HZ)).toFixed(1) + ' s)');
  console.log('vEgo(轮速) 范围 ' + vMin.toFixed(1) + '..' + vMax.toFixed(1) + ' km/h; 车速源超时(>' + MAXAGE + 'ms) 行数 ' + staleSpeed);
  console.log('横向(LCC) ' + (100 * latRows / Math.max(rows, 1)).toFixed(1) + '%   纵向(ACC) ' + (100 * accRows / Math.max(rows, 1)).toFixed(1) + '%');
  console.log('不变式 lat=1 且 acc=0 : ' + viol + ' 行 (退出时序允许少量)');
  console.log('命令/上下文断言 0x142 FuncMode回显=3 且 acc=0 : ' + mode3AccViol + ' / ' + mode3AccChecks + ' 个可判定栅格');
  console.log('转向状态行 左=' + leftRows + ' 右=' + rightRows + ' 双闪=' + hazardRows + ' 未知=' + unknownTurnRows);
  console.log('lat=1 时 |指令-反馈| 最大 ' + maxErr.toFixed(2) + '°');
})();
