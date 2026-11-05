// Positive and negative self-tests for carstate_offline.js.
'use strict';

const assert = require('assert/strict');
const {
  ACCEL_WINDOW_S,
  CarStateProjector,
  GEAR_MAP,
  REQUIRED_COLUMNS,
  STANDSTILL_THRESHOLD_MPS,
  TIME_EPSILON_S,
  validateColumns,
} = require('./carstate_offline');

function baseRow(overrides = {}) {
  return {
    t: '1.000', vEgo: '10.000', fl: '36.0', fr: '36.0', rl: '36.0', rr: '36.0',
    flDir: '1', frDir: '1', rlDir: '1', rrDir: '1',
    steerAngleDeg: '1.25', steerRateDeg: '4.0', steerTorqueNm: '0.140', motorTorqueNm: '0.200',
    latActive: '1', latAvail: '1', accActive: '1', accRequest: '0', gear: '3', throttlePct: '2.0',
    brakeRod: '0', brakePct: '0.00', brakePressed: '0', lkaFuncMode083: '3',
    lkaFuncModeEcho142: '3', lkaAvailableEcho142: '1', lkaCommandMode3Echo142: '1',
    turnState290: '31', leftBlinker: '0', rightBlinker: '0',
    ageSpeedMs: '20', ageSteerMs: '10', ageAccMs: '20', ageLka142Ms: '20', ageTurnMs: '20',
    ...overrides,
  };
}

function speedRow(t, speedMps) {
  const kph = speedMps * 3.6;
  return baseRow({
    t: String(t), vEgo: String(speedMps),
    fl: String(kph), fr: String(kph), rl: String(kph), rr: String(kph),
  });
}

function positiveTest() {
  const projector = new CarStateProjector(300);
  const msg = projector.project(baseRow());
  assert.equal(msg.carState.canValid, true);
  assert.equal(msg.carState.canTimeout, false);
  assert.equal(msg.carState.vEgo, 10);
  assert.equal(msg.carState.wheelSpeeds.fl, 10);
  assert.equal(msg.carState.gearShifter, 'drive');
  assert.equal(msg.carState.cruiseState.enabled, true);
  assert.equal(msg.carState.stockLkas, true);
  assert.equal(msg.carState.gasPressed, true);
  assert.equal(msg.carState.brakePressed, false);
  assert.equal(msg.carState.leftBlinker, false);
  assert.equal(msg.carState.steeringPressed, false);
  assert.equal(msg.diagnostics.source.lkaFuncMode083, 3);
  assert.equal(msg.diagnostics.source.lkaFuncModeEcho142, 3);
}

function negativeFreshnessTest() {
  const projector = new CarStateProjector(300);
  const msg = projector.project(baseRow({ ageSteerMs: '301', gear: '9', latActive: '1', accActive: '0' }));
  assert.equal(msg.carState.canValid, false);
  assert.equal(msg.carState.canTimeout, true);
  assert.equal(msg.carState.vehicleSensorsInvalid, true);
  assert.equal(msg.carState.gearShifter, 'unknown');
  assert.equal(msg.carState.cruiseState.enabled, false);
  assert.equal(msg.carState.stockLkas, true); // preserves the observed contradiction for diagnostics
}

function accelerationWindowTest() {
  const projector = new CarStateProjector(300);
  const early = projector.project(speedRow(0, 1));
  const tooSoon = projector.project(speedRow(0.080, 2));
  const valid = projector.project(speedRow(0.100, 2));
  assert.equal(early.carState.aEgo, 0);
  assert.equal(tooSoon.carState.aEgo, 0);
  assert.equal(valid.carState.aEgo, 10);
}

function fractionalWindowBoundaryTest() {
  const projector = new CarStateProjector(300);
  const times = [0, 0.02, 0.04, 0.06, 0.08];
  for (const t of times) projector.project(speedRow(t, 1));
  const boundary = 0.09999999999999999;
  const msg = projector.project(speedRow(boundary, 2));
  assert.ok(boundary < ACCEL_WINDOW_S);
  assert.ok(boundary >= ACCEL_WINDOW_S - TIME_EPSILON_S);
  assert.ok(Math.abs(msg.carState.aEgo - 10) < 1e-9);
}

function robustAccelerationWindowTest() {
  const projector = new CarStateProjector(300);
  // 20 ms grid, 10 m/s^2 ramp: v(t) = 10 + 10 * (t - 1.0)
  let msg = null;
  for (let i = 0; i <= 20; i++) {           // t = 1.00 .. 1.40, span 400 ms < 500 ms
    const t = 1.0 + i * 0.02;
    msg = projector.project(speedRow(t, 10 + 10 * (t - 1.0)));
  }
  assert.equal(msg.carState.aEgoRobust, 0, 'no 500 ms history yet');
  for (let i = 21; i <= 40; i++) {          // through t = 1.80
    const t = 1.0 + i * 0.02;
    msg = projector.project(speedRow(t, 10 + 10 * (t - 1.0)));
  }
  assert.ok(Math.abs(msg.carState.aEgoRobust - 10) < 1e-6, '500 ms ramp yields 10 m/s^2');
  assert.ok(Math.abs(msg.carState.aEgo - 10) < 1e-6, '100 ms value unchanged');
}

function medianResistsSingleWheelSpikeTest() {
  // One wheel reports 80 km/h for a single frame while the other three hold 36 km/h.
  // The mean-based 100 ms aEgo must blow up; the median-based one must not move.
  const projector = new CarStateProjector(300);
  for (let i = 0; i < 25; i++) projector.project(speedRow(i * 0.02, 10)); // t = 0 .. 0.48 at 10 m/s
  const spike = projector.project(baseRow({
    t: '0.50', vEgo: String((80 + 36 * 3) / 4 / 3.6), fl: '80', fr: '36', rl: '36', rr: '36',
  }));
  assert.ok(Math.abs(spike.carState.aEgo) > 5, 'mean-based aEgo reacts to the spike');
  assert.ok(Math.abs(spike.carState.aEgoRobust) < 1e-9, 'median-based aEgoRobust ignores one bad wheel');
  assert.ok(Math.abs(spike.carState.vEgoMedian - 10) < 1e-9);
}

function schemaGuardTest() {
  validateColumns([...REQUIRED_COLUMNS]);
  assert.throws(() => validateColumns(REQUIRED_COLUMNS.filter(c => c !== 'ageAccMs')), /ageAccMs/);
  assert.deepEqual(GEAR_MAP, { 0: 'park', 1: 'reverse', 2: 'neutral', 3: 'drive' });
  assert.equal(STANDSTILL_THRESHOLD_MPS, 0.1);
}

function reverseDirectionTest() {
  const projector = new CarStateProjector(300);
  const kph = 2;
  const msg = projector.project(baseRow({
    vEgo: String(-kph / 3.6), fl: String(kph), fr: String(kph), rl: String(kph), rr: String(kph),
    flDir: '2', frDir: '2', rlDir: '2', rrDir: '2', gear: '1',
  }));
  assert.ok(Math.abs(msg.carState.vEgo + kph / 3.6) < 1e-12);
  assert.ok(Math.abs(msg.carState.wheelSpeeds.fl + kph / 3.6) < 1e-12);
  assert.equal(msg.carState.gearShifter, 'reverse');
  assert.equal(msg.carState.canValid, true);
}

function gearDoesNotSetSpeedSignTest() {
  const projector = new CarStateProjector(300);
  const msg = projector.project(baseRow({ gear: '1' }));
  assert.equal(msg.carState.gearShifter, 'reverse');
  assert.equal(msg.carState.vEgo, 10); // vehicle may still coast forward after selecting R
}

function invalidDirectionTest() {
  const projector = new CarStateProjector(300);
  const msg = projector.project(baseRow({ flDir: '3' }));
  assert.equal(msg.carState.canValid, false);
  assert.equal(msg.carState.canTimeout, false);
  assert.equal(msg.carState.vehicleSensorsInvalid, true);
}

function stableBlinkerStateTest() {
  const projector = new CarStateProjector(300);
  const left = projector.project(baseRow({ turnState290: '63', leftBlinker: '1' }));
  const hazard = projector.project(baseRow({ turnState290: '159', leftBlinker: '1', rightBlinker: '1' }));
  const stale = projector.project(baseRow({ turnState290: '95', rightBlinker: '1', ageTurnMs: '301' }));
  assert.equal(left.carState.leftBlinker, true);
  assert.equal(left.carState.rightBlinker, false);
  assert.equal(hazard.carState.leftBlinker, true);
  assert.equal(hazard.carState.rightBlinker, true);
  assert.equal(stale.carState.leftBlinker, false);
  assert.equal(stale.carState.rightBlinker, false);
}

positiveTest();
negativeFreshnessTest();
accelerationWindowTest();
fractionalWindowBoundaryTest();
schemaGuardTest();
robustAccelerationWindowTest();
medianResistsSingleWheelSpikeTest();
reverseDirectionTest();
gearDoesNotSetSpeedSignTest();
invalidDirectionTest();
stableBlinkerStateTest();
console.log('PASS positive mapping');
console.log('PASS negative freshness/unknown gear');
console.log('PASS acceleration window >=100 ms');
console.log('PASS fractional 100 ms boundary epsilon');
console.log('PASS required-column guard');
console.log('PASS robust 500 ms acceleration window');
console.log('PASS median resists a single-wheel spike');
console.log('PASS reverse wheel directions produce negative vEgo');
console.log('PASS gear does not determine vEgo sign');
console.log('PASS direction=3 invalidates decoded speed');
console.log('PASS stable/stale 0x290 blinker mapping');
