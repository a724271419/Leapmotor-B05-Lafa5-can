// carstate_offline.js - passive ndjson/CSV -> openpilot CarState-shaped JSONL dry run
//
// This is deliberately read-only. It never opens CAN hardware and contains no
// CarControl or transmit path. The output mirrors the public CarState contract,
// but is JSON rather than Cap'n Proto because this workspace has no opendbc /
// pycapnp runtime.
//
// Contract pin:
//   commaai/opendbc 178c81ab5c052ac92a849f6400703d082d268c02
//   opendbc/car/car.capnp, struct CarState
//
// Usage:
//   node carstate_offline.js <capture.ndjson|signals.csv> <output-prefix>
//        [--hz 50] [--max-age 300]
//
// For ndjson input, decode_capture2.js is executed first and writes
// <output-prefix>.signals.csv. The final artifacts are:
//   <output-prefix>.carstate.jsonl
//   <output-prefix>.summary.json
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const OPENDBC_COMMIT = '178c81ab5c052ac92a849f6400703d082d268c02';
const CONTRACT_URL = `https://github.com/commaai/opendbc/blob/${OPENDBC_COMMIT}/opendbc/car/car.capnp#L155-L299`;
const DEFAULT_MAX_AGE_MS = 300;
const DEFAULT_HZ = 50;
const ACCEL_WINDOW_S = 0.1; // project rule: dt-derived quantities use >=100 ms
// Deceleration needs a longer window than 100 ms: under ABS the wheels themselves
// swing hard, and a 100 ms difference on them reports up to 18 m/s^2 (see README
// of the 2026-11-03 measurement in 09 R1). 500 ms lands on the true braking value.
const ROBUST_ACCEL_WINDOW_S = 0.5;
const TIME_EPSILON_S = 1e-9;
const STANDSTILL_THRESHOLD_MPS = 0.1;

const GEAR_MAP = Object.freeze({
  0: 'park',
  1: 'reverse',
  2: 'neutral',
  3: 'drive',
});

const REQUIRED_COLUMNS = Object.freeze([
  't', 'vEgo', 'fl', 'fr', 'rl', 'rr', 'flDir', 'frDir', 'rlDir', 'rrDir',
  'steerAngleDeg', 'steerRateDeg', 'steerTorqueNm', 'motorTorqueNm',
  'latActive', 'latAvail', 'accActive', 'accRequest', 'gear', 'throttlePct',
  'brakeRod', 'brakePct', 'brakePressed', 'lkaFuncMode083',
  'lkaFuncModeEcho142', 'lkaAvailableEcho142', 'lkaCommandMode3Echo142',
  'turnState290', 'leftBlinker', 'rightBlinker',
  'ageSpeedMs', 'ageSteerMs', 'ageAccMs', 'ageLka142Ms', 'ageTurnMs',
]);

function parseArgs(argv) {
  const positional = [];
  const options = { hz: DEFAULT_HZ, maxAgeMs: DEFAULT_MAX_AGE_MS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--hz') options.hz = Number(argv[++i]);
    else if (argv[i] === '--max-age') options.maxAgeMs = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  if (positional.length < 2 || !Number.isFinite(options.hz) || options.hz <= 0 ||
      !Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= 0) {
    throw new Error('用法: node carstate_offline.js <capture.ndjson|signals.csv> <output-prefix> [--hz 50] [--max-age 300]');
  }
  return { inputPath: path.resolve(positional[0]), outputPrefix: path.resolve(positional[1]), ...options };
}

function parseCsvLine(line) {
  // decode_capture2.js only emits numeric/unquoted cells. Reject quoted input
  // rather than silently implementing an incomplete general CSV parser.
  if (line.includes('"')) throw new Error('不支持带引号的 CSV；输入必须来自 decode_capture2.js');
  return line.split(',');
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolCell(value) {
  const n = numberOrNull(value);
  return n !== null && n !== 0;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function wheelDirectionSign(direction) {
  if (direction === 0) return 0;
  if (direction === 1) return 1;
  if (direction === 2) return -1;
  return null; // 3 is invalid/unknown in the two-bit OEM field
}

function signedWheelSpeedKph(magnitudeKph, direction) {
  const sign = wheelDirectionSign(direction);
  return Number.isFinite(magnitudeKph) && sign !== null ? Math.abs(magnitudeKph) * sign : null;
}

function medianOfFour(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[1] + sorted[2]) / 2;
}

function finiteDifference(history, t, value, valid, window) {
  if (!valid || !Number.isFinite(t) || !Number.isFinite(value)) return 0;
  history.push({ t, v: value });
  while (history.length > 1 && history[0].t < t - (window + 0.5)) history.shift();
  let prior = null;
  for (let i = history.length - 2; i >= 0; i--) {
    if (t - history[i].t >= window - TIME_EPSILON_S) {
      prior = history[i];
      break;
    }
  }
  if (!prior) return 0;
  const dt = t - prior.t;
  // The 50 Hz grid is fractional in binary: five 20 ms steps often sum to
  // 0.09999999999999999, which failed the exact >= 0.1 guard and produced a
  // silent aEgo = 0 (25 % of rows on real data). Use the same epsilon as the
  // backward search above so a nominal window is accepted.
  if (dt < window - TIME_EPSILON_S) return 0;
  return (value - prior.v) / dt;
}

class CarStateProjector {
  constructor(maxAgeMs = DEFAULT_MAX_AGE_MS) {
    this.maxAgeMs = maxAgeMs;
    this.speedHistory = [];
    this.robustSpeedHistory = [];
  }

  acceleration(t, vEgo, valid) {
    return finiteDifference(this.speedHistory, t, vEgo, valid, ACCEL_WINDOW_S);
  }

  // Median of the four signed wheel speeds over 500 ms. Not a substitute for a
  // filter (openpilot uses a Kalman estimate), but it is the only offline form
  // that survives ABS: at 100 ms all four wheels swing together (57.8 -> 51.2
  // km/h in 0.1 s = 18 m/s^2), so the median alone buys only ~1.6 m/s^2; the
  // 500 ms window is what makes the number physical (~10.5 m/s^2 on 急刹1/2).
  robustAcceleration(t, vEgoMedian, valid) {
    return finiteDifference(this.robustSpeedHistory, t, vEgoMedian, valid, ROBUST_ACCEL_WINDOW_S);
  }

  project(row) {
    const t = numberOrNull(row.t);
    const decoderVEgo = numberOrNull(row.vEgo);
    const ageSpeedMs = numberOrNull(row.ageSpeedMs);
    const ageSteerMs = numberOrNull(row.ageSteerMs);
    const ageAccMs = numberOrNull(row.ageAccMs);
    const ageTurnMs = numberOrNull(row.ageTurnMs);
    const agesKnown = [ageSpeedMs, ageSteerMs, ageAccMs].every(Number.isFinite);
    const sourcesFresh = agesKnown && [ageSpeedMs, ageSteerMs, ageAccMs].every(v => v <= this.maxAgeMs);
    const flKph = numberOrNull(row.fl), frKph = numberOrNull(row.fr);
    const rlKph = numberOrNull(row.rl), rrKph = numberOrNull(row.rr);
    const flDir = numberOrNull(row.flDir), frDir = numberOrNull(row.frDir);
    const rlDir = numberOrNull(row.rlDir), rrDir = numberOrNull(row.rrDir);
    const directions = [flDir, frDir, rlDir, rrDir];
    const signedWheelKph = [flKph, frKph, rlKph, rrKph].map((speed, i) =>
      signedWheelSpeedKph(speed, directions[i]));
    const vEgo = signedWheelKph.every(Number.isFinite)
      ? signedWheelKph.reduce((sum, speed) => sum + speed, 0) / signedWheelKph.length / 3.6
      : null;
    const vEgoMedian = signedWheelKph.every(Number.isFinite)
      ? medianOfFour(signedWheelKph) / 3.6
      : null;
    const requiredValuesKnown = Number.isFinite(t) && Number.isFinite(vEgo) &&
      Number.isFinite(numberOrNull(row.steerAngleDeg)) && numberOrNull(row.accActive) !== null;
    const canValid = sourcesFresh && requiredValuesKnown;
    const canTimeout = !sourcesFresh;

    const steeringAngleDeg = numberOrNull(row.steerAngleDeg);
    const steeringRateDeg = numberOrNull(row.steerRateDeg);
    const steeringTorqueNm = numberOrNull(row.steerTorqueNm);
    const motorTorqueNm = numberOrNull(row.motorTorqueNm);
    const accEnabled = boolCell(row.accActive); // decoder column is ACC active OR request
    const latActive = boolCell(row.latActive);
    const gearCode = numberOrNull(row.gear);
    const gearShifter = gearCode !== null && Object.hasOwn(GEAR_MAP, gearCode) ? GEAR_MAP[gearCode] : 'unknown';
    const aEgo = this.acceleration(t, vEgo, canValid);
    const aEgoRobust = this.robustAcceleration(t, vEgoMedian, canValid);
    const standstill = Number.isFinite(vEgo) ? Math.abs(vEgo) < STANDSTILL_THRESHOLD_MPS : true;
    const turnFresh = Number.isFinite(ageTurnMs) && ageTurnMs <= this.maxAgeMs;
    const leftBlinker = turnFresh && boolCell(row.leftBlinker);
    const rightBlinker = turnFresh && boolCell(row.rightBlinker);

    const carState = {
      canValid,
      canTimeout,
      canErrorCounter: 0,
      vEgo: finiteOrZero(vEgo),
      aEgo: finiteOrZero(aEgo),
      aEgoRobust: finiteOrZero(aEgoRobust),
      aEgoCan: numberOrNull(row.longAccMps2),   // IBC_LongitAcceAct (0x185 bit48)，可选列
      vEgoMedian: finiteOrZero(vEgoMedian),
      vEgoRaw: finiteOrZero(vEgo),
      vEgoCluster: 0,
      vCruise: 0,
      vCruiseCluster: 0,
      yawRate: 0,
      standstill,
      wheelSpeeds: {
        fl: finiteOrZero(signedWheelKph[0] === null ? null : signedWheelKph[0] / 3.6),
        fr: finiteOrZero(signedWheelKph[1] === null ? null : signedWheelKph[1] / 3.6),
        rl: finiteOrZero(signedWheelKph[2] === null ? null : signedWheelKph[2] / 3.6),
        rr: finiteOrZero(signedWheelKph[3] === null ? null : signedWheelKph[3] / 3.6),
      },
      gasPressed: (numberOrNull(row.throttlePct) ?? 0) > 0,
      brakePressed: boolCell(row.brakePressed),
      parkingBrake: false,
      brakeHoldActive: false,
      steeringAngleDeg: finiteOrZero(steeringAngleDeg),
      steeringRateDeg: finiteOrZero(steeringRateDeg),
      steeringTorque: finiteOrZero(steeringTorqueNm),
      steeringTorqueEps: 0,
      steeringPressed: false,
      steeringDisengage: false,
      steerFaultTemporary: false,
      steerFaultPermanent: false,
      stockLkas: latActive,
      vehicleSensorsInvalid: !canValid,
      cruiseState: {
        enabled: accEnabled,
        available: accEnabled, // conservative lower bound; true availability signal is not decoded
        speed: 0,
        speedCluster: 0,
        standstill: accEnabled && standstill,
        nonAdaptive: false,
      },
      gearShifter,
      leftBlinker,
      rightBlinker,
      doorOpen: false,
      seatbeltUnlatched: false,
    };

    const diagnostics = {
      source: {
        decoderVEgo,
        wheelDirection: { fl: flDir, fr: frDir, rl: rlDir, rr: rrDir },
        latActive,
        latAvailable: boolCell(row.latAvail),
        accActiveOrRequest: accEnabled,
        accRequest: numberOrNull(row.accRequest),
        brakeRod: numberOrNull(row.brakeRod),
        brakePct: numberOrNull(row.brakePct),
        motorTorqueNm,
        lkaFuncMode083: numberOrNull(row.lkaFuncMode083),
        lkaFuncModeEcho142: numberOrNull(row.lkaFuncModeEcho142),
        lkaAvailableEcho142: numberOrNull(row.lkaAvailableEcho142),
        lkaCommandMode3Echo142: boolCell(row.lkaCommandMode3Echo142),
        turnState290: numberOrNull(row.turnState290),
      },
      ageMs: {
        speed: ageSpeedMs,
        steering: ageSteerMs,
        acc: ageAccMs,
        lkaEcho142: numberOrNull(row.ageLka142Ms),
        turn290: ageTurnMs,
      },
      assumptions: {
        canValid: 'offline freshness/decodeability proxy; CRC/counter not validated',
        canErrorCounter: 'offline placeholder 0; no CANParser error counter is available',
        cruiseAvailable: 'lower bound: mirrors enabled because ACC availability is unresolved',
        acceleration: '100 ms finite difference on fixed-rate vEgo (mean of 4 signed wheels); NOT trustworthy under ABS, see aEgoRobust',
        aEgoRobust: '500 ms finite difference on the median of the 4 signed wheel speeds; use this for deceleration (measured 10.5 m/s^2 on 急刹1/2 vs 18 m/s^2 at 100 ms)',
        speedSign: 'derived per wheel from 0x184 byte10 packed directions: 0=standstill, 1=forward, 2=reverse, 3=invalid; never inferred from gear',
        blinkers: 'stable 0x290 byte2 state: high bits 0x20=left, 0x40=right, 0x80=hazard; byte3 lamp pulses are not used',
        standstill: `derived as abs(vEgo) < ${STANDSTILL_THRESHOLD_MPS} m/s; not an OEM CAN bit`,
      },
      unresolvedDefaults: [
        'canErrorCounter', 'vCruise', 'vEgoCluster', 'yawRate', 'steeringTorqueEps',
        'steeringPressed', 'steeringDisengage',
        'parkingBrake', 'brakeHoldActive', 'doorOpen', 'seatbeltUnlatched',
        'steerFaultTemporary', 'steerFaultPermanent',
      ],
    };

    return { t: finiteOrZero(t), carState, diagnostics };
  }
}

function validateColumns(header) {
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) throw new Error(`CSV 缺少 decode_capture2.js 列: ${missing.join(', ')}`);
}

function updateSummary(summary, message) {
  const cs = message.carState;
  const d = message.diagnostics;
  summary.rows++;
  if (cs.canValid) summary.canValidRows++;
  if (cs.canTimeout) summary.canTimeoutRows++;
  if (cs.cruiseState.enabled) summary.accEnabledRows++;
  if (cs.stockLkas) summary.latActiveRows++;
  if (d.source.lkaCommandMode3Echo142 && !cs.cruiseState.enabled) summary.mode3WithoutAccRows++;
  if (cs.stockLkas && !cs.cruiseState.enabled) summary.latWithoutAccRows++;
  if (cs.cruiseState.enabled && !cs.cruiseState.available) summary.enabledWithoutAvailableRows++;
  if (cs.canValid && cs.canTimeout) summary.validAndTimeoutRows++;
  if (cs.leftBlinker) summary.leftBlinkerRows++;
  if (cs.rightBlinker) summary.rightBlinkerRows++;
  if (cs.leftBlinker && cs.rightBlinker) summary.hazardRows++;
  summary.maxVEgoMps = Math.max(summary.maxVEgoMps, cs.vEgo);
  summary.minVEgoMps = Math.min(summary.minVEgoMps, cs.vEgo);
  if (cs.vEgo < -STANDSTILL_THRESHOLD_MPS) summary.reverseMotionRows++;
  summary.maxAbsAEgoMps2 = Math.max(summary.maxAbsAEgoMps2, Math.abs(cs.aEgo));
  summary.maxAbsAEgoRobustMps2 = Math.max(summary.maxAbsAEgoRobustMps2, Math.abs(cs.aEgoRobust));
  summary.gearRows[cs.gearShifter] = (summary.gearRows[cs.gearShifter] || 0) + 1;
  const directionPattern = Object.values(d.source.wheelDirection).join('/');
  summary.wheelDirectionRows[directionPattern] = (summary.wheelDirectionRows[directionPattern] || 0) + 1;
}

async function convertCsv(csvPath, jsonlPath, summaryPath, maxAgeMs) {
  const input = fs.createReadStream(csvPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let output = null;
  const projector = new CarStateProjector(maxAgeMs);
  const summary = {
    format: 'openpilot-CarState-json-shadow-v1',
    serialization: 'JSONL only; Cap\'n Proto runtime unavailable in this workspace',
    opendbcCommit: OPENDBC_COMMIT,
    contractUrl: CONTRACT_URL,
    sourceCsv: csvPath,
    outputJsonl: jsonlPath,
    maxAgeMs,
    rows: 0,
    canValidRows: 0,
    canTimeoutRows: 0,
    accEnabledRows: 0,
    latActiveRows: 0,
    mode3WithoutAccRows: 0,
    latWithoutAccRows: 0,
    enabledWithoutAvailableRows: 0,
    validAndTimeoutRows: 0,
    leftBlinkerRows: 0,
    rightBlinkerRows: 0,
    hazardRows: 0,
    maxVEgoMps: 0,
    minVEgoMps: 0,
    reverseMotionRows: 0,
    maxAbsAEgoMps2: 0,
    maxAbsAEgoRobustMps2: 0,
    gearRows: {},
    wheelDirectionRows: {},
    unresolved: [
      'real Cap\'n Proto serialization/import into openpilot runtime',
      'ACC available and cruise set speed',
      'driver steeringPressed threshold',
      'EPS fault-bit mapping',
      'canErrorCounter is an offline placeholder 0, not an observed zero-error result',
    ],
  };

  let header = null;
  for await (const line of lines) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      validateColumns(header);
      output = fs.createWriteStream(jsonlPath, { encoding: 'utf8' });
      continue;
    }
    if (cells.length !== header.length) throw new Error(`CSV 列数不一致: 期望 ${header.length}, 实际 ${cells.length}`);
    const row = Object.fromEntries(header.map((name, i) => [name, cells[i]]));
    const message = projector.project(row);
    updateSummary(summary, message);
    output.write(JSON.stringify(message) + '\n');
  }

  if (!header || !output) throw new Error('CSV 为空');
  output.end();
  await new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
  summary.hardInvariantViolations = summary.enabledWithoutAvailableRows + summary.validAndTimeoutRows;
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return summary;
}

async function runPipeline({ inputPath, outputPrefix, hz, maxAgeMs }) {
  if (!fs.existsSync(inputPath)) throw new Error(`输入不存在: ${inputPath}`);
  fs.mkdirSync(path.dirname(outputPrefix), { recursive: true });
  const jsonlPath = `${outputPrefix}.carstate.jsonl`;
  const summaryPath = `${outputPrefix}.summary.json`;
  let csvPath = inputPath;

  if (path.extname(inputPath).toLowerCase() === '.ndjson') {
    csvPath = `${outputPrefix}.signals.csv`;
    const decoder = path.join(__dirname, 'decode_capture2.js');
    const result = spawnSync(process.execPath, [decoder, inputPath, csvPath, '--hz', String(hz), '--max-age', String(maxAgeMs)], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`decode_capture2.js 失败，exit=${result.status}`);
  } else if (path.extname(inputPath).toLowerCase() !== '.csv') {
    throw new Error('输入扩展名必须是 .ndjson 或 .csv');
  }

  const summary = await convertCsv(csvPath, jsonlPath, summaryPath, maxAgeMs);
  console.log(`CarState JSONL: ${jsonlPath}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`rows=${summary.rows} canValid=${summary.canValidRows} timeout=${summary.canTimeoutRows} ACC=${summary.accEnabledRows} LCC=${summary.latActiveRows}`);
  console.log(`soft checks: lat&&!acc=${summary.latWithoutAccRows}, mode3&&!acc=${summary.mode3WithoutAccRows}`);
  console.log(`hard invariant violations=${summary.hardInvariantViolations}`);
  if (summary.hardInvariantViolations !== 0) process.exitCode = 2;
  return summary;
}

if (require.main === module) {
  runPipeline(parseArgs(process.argv.slice(2))).catch(err => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ACCEL_WINDOW_S,
  ROBUST_ACCEL_WINDOW_S,
  CarStateProjector,
  GEAR_MAP,
  OPENDBC_COMMIT,
  REQUIRED_COLUMNS,
  STANDSTILL_THRESHOLD_MPS,
  TIME_EPSILON_S,
  convertCsv,
  numberOrNull,
  parseCsvLine,
  runPipeline,
  validateColumns,
};
